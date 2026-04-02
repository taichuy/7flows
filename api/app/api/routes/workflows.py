from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.routes.auth import require_console_route_access
from app.core.database import get_db
from app.models.workflow import Workflow
from app.schemas.run import WorkflowRunListItem
from app.schemas.workflow import (
    WorkflowCreate,
    WorkflowDefinitionPreflightRequest,
    WorkflowDefinitionPreflightResult,
    WorkflowDetail,
    WorkflowListItem,
    WorkflowOverview,
    WorkflowUpdate,
    WorkflowVersionItem,
)
from app.services.compiled_blueprints import CompiledBlueprintService
from app.services.model_provider_registry import (
    ModelProviderRegistryError,
    ModelProviderRegistryService,
    resolve_provider_config_id,
)
from app.services.workflow_definitions import (
    WorkflowDefinitionValidationError,
    WorkflowDefinitionValidationIssue,
    build_workflow_adapter_reference_list,
    build_workflow_skill_reference_ids_index,
    build_workflow_skill_reference_index,
    build_workflow_tool_reference_index,
    bump_workflow_version,
    validate_persistable_workflow_definition,
)
from app.services.workflow_mutations import (
    WorkflowMutationError,
    WorkflowMutationService,
)
from app.services.workflow_publish_version_references import (
    build_allowed_publish_workflow_versions,
)
from app.services.workflow_views import (
    WorkflowListDefinitionIssueFilter,
    build_workflow_detail,
    build_workflow_overview,
    list_workflow_items,
    list_workflow_run_items,
    list_workflow_version_items,
)

router = APIRouter(prefix="/workflows", tags=["workflows"])
workflow_mutation_service = WorkflowMutationService(CompiledBlueprintService())
model_provider_registry_service = ModelProviderRegistryService()


def _render_validation_issues(
    issues: list[WorkflowDefinitionValidationIssue],
) -> list[dict[str, str]]:
    return [
        {
            key: value
            for key, value in {
                "category": issue.category,
                "message": issue.message,
                "path": issue.path,
                "field": issue.field,
            }.items()
            if value is not None
        }
        for issue in issues
    ]


def _raise_definition_validation_error(exc: WorkflowDefinitionValidationError) -> None:
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={
            "message": str(exc),
            "issues": _render_validation_issues(exc.issues),
        },
    ) from exc


def _validate_workflow_definition_for_persistence(
    db: Session,
    *,
    definition: dict,
    workflow: Workflow | None = None,
) -> tuple[dict, str]:
    current_version = "0.1.0" if workflow is None else bump_workflow_version(workflow.version)
    validated_definition = validate_persistable_workflow_definition(
        definition,
        tool_index=build_workflow_tool_reference_index(db),
        adapters=build_workflow_adapter_reference_list(db),
        skill_index=build_workflow_skill_reference_index(db),
        skill_reference_ids_index=build_workflow_skill_reference_ids_index(db),
        allowed_publish_versions=build_allowed_publish_workflow_versions(
            db,
            workflow_id=workflow.id if workflow is not None else None,
            current_version=current_version,
        ),
    )
    _normalize_llm_provider_config_references(db, validated_definition)
    return validated_definition, current_version


def _normalize_llm_provider_config_references(
    db: Session,
    definition: dict,
) -> None:
    nodes = definition.get("nodes")
    if not isinstance(nodes, list):
        return

    for index, node in enumerate(nodes):
        if not isinstance(node, dict) or node.get("type") != "llm_agent":
            continue
        config = node.get("config")
        if not isinstance(config, dict):
            continue
        model = config.get("model")
        if not isinstance(model, dict):
            continue

        raw_provider_config_ref = model.get("providerConfigRef") or model.get("provider_config_ref")
        if not isinstance(raw_provider_config_ref, str) or not raw_provider_config_ref.strip():
            continue

        provider_config_id = resolve_provider_config_id(raw_provider_config_ref)
        try:
            provider_config = model_provider_registry_service.get_provider_config(
                db,
                workspace_id="default",
                provider_config_id=provider_config_id,
            )
        except ModelProviderRegistryError as exc:
            raise WorkflowDefinitionValidationError(
                str(exc),
                issues=[
                    WorkflowDefinitionValidationIssue(
                        category="model_provider",
                        message=str(exc),
                        path=f"nodes[{index}].config.model",
                        field="config.model.providerConfigRef",
                    )
                ],
            ) from exc

        if provider_config.status != "active":
            raise WorkflowDefinitionValidationError(
                f"Model provider config '{provider_config.label}' is inactive.",
                issues=[
                    WorkflowDefinitionValidationIssue(
                        category="model_provider",
                        message=f"Model provider config '{provider_config.label}' is inactive.",
                        path=f"nodes[{index}].config.model",
                        field="config.model.providerConfigRef",
                    )
                ],
            )

        model["providerConfigRef"] = provider_config_id
        model.pop("provider_config_ref", None)
        if not str(model.get("modelId") or "").strip():
            model["modelId"] = provider_config.default_model

        for legacy_key in ("provider", "apiKey", "api_key", "baseUrl", "base_url", "protocol"):
            model.pop(legacy_key, None)


@router.get("", response_model=list[WorkflowListItem])
def list_workflows(
    definition_issue: WorkflowListDefinitionIssueFilter | None = Query(default=None),
    _access_context=Depends(require_console_route_access("/api/workflows")),
    db: Session = Depends(get_db),
) -> list[WorkflowListItem]:
    return list_workflow_items(db, definition_issue=definition_issue)


@router.post("", response_model=WorkflowDetail, status_code=status.HTTP_201_CREATED)
def create_workflow(
    payload: WorkflowCreate,
    _access_context=Depends(require_console_route_access("/api/workflows", method="POST")),
    db: Session = Depends(get_db),
) -> WorkflowDetail:
    try:
        definition, _ = _validate_workflow_definition_for_persistence(
            db,
            definition=payload.definition,
        )
    except WorkflowDefinitionValidationError as exc:
        _raise_definition_validation_error(exc)

    try:
        workflow = workflow_mutation_service.create_workflow(
            db,
            name=payload.name,
            definition=definition,
        )
    except WorkflowMutationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    db.commit()
    db.refresh(workflow)
    return build_workflow_detail(db, workflow)


@router.get("/{workflow_id}", response_model=WorkflowOverview)
def get_workflow(
    workflow_id: str,
    _access_context=Depends(require_console_route_access("/api/workflows/{workflow_id}")),
    db: Session = Depends(get_db),
) -> WorkflowOverview:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")
    return build_workflow_overview(db, workflow)


@router.get("/{workflow_id}/detail", response_model=WorkflowDetail)
def get_workflow_detail(
    workflow_id: str,
    _access_context=Depends(
        require_console_route_access("/api/workflows/{workflow_id}/detail")
    ),
    db: Session = Depends(get_db),
) -> WorkflowDetail:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")
    return build_workflow_detail(db, workflow)


@router.put("/{workflow_id}", response_model=WorkflowDetail)
def update_workflow(
    workflow_id: str,
    payload: WorkflowUpdate,
    _access_context=Depends(
        require_console_route_access("/api/workflows/{workflow_id}", method="PUT")
    ),
    db: Session = Depends(get_db),
) -> WorkflowDetail:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    definition = None
    if payload.definition is not None:
        try:
            definition, _ = _validate_workflow_definition_for_persistence(
                db,
                definition=payload.definition,
                workflow=workflow,
            )
        except WorkflowDefinitionValidationError as exc:
            _raise_definition_validation_error(exc)

    try:
        workflow_mutation_service.update_workflow(
            db,
            workflow=workflow,
            name=payload.name,
            definition=definition,
        )
    except WorkflowMutationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    db.commit()
    db.refresh(workflow)
    return build_workflow_detail(db, workflow)


@router.post(
    "/{workflow_id}/validate-definition",
    response_model=WorkflowDefinitionPreflightResult,
)
def validate_workflow_definition_preflight(
    workflow_id: str,
    payload: WorkflowDefinitionPreflightRequest,
    _access_context=Depends(
        require_console_route_access(
            "/api/workflows/{workflow_id}/validate-definition",
            method="POST",
        )
    ),
    db: Session = Depends(get_db),
) -> WorkflowDefinitionPreflightResult:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    try:
        definition, next_version = _validate_workflow_definition_for_persistence(
            db,
            definition=payload.definition,
            workflow=workflow,
        )
    except WorkflowDefinitionValidationError as exc:
        _raise_definition_validation_error(exc)

    return WorkflowDefinitionPreflightResult(
        definition=definition,
        next_version=next_version,
        issues=[],
    )


@router.get("/{workflow_id}/versions", response_model=list[WorkflowVersionItem])
def list_workflow_versions(
    workflow_id: str,
    _access_context=Depends(require_console_route_access("/api/workflows/{workflow_id}/versions")),
    db: Session = Depends(get_db),
) -> list[WorkflowVersionItem]:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    return list_workflow_version_items(db, workflow_id)


@router.get("/{workflow_id}/runs", response_model=list[WorkflowRunListItem])
def list_workflow_runs(
    workflow_id: str,
    limit: int = Query(default=8, ge=1, le=20),
    _access_context=Depends(
        require_console_route_access("/api/workflows/{workflow_id}/runs")
    ),
    db: Session = Depends(get_db),
) -> list[WorkflowRunListItem]:
    workflow = db.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    return list_workflow_run_items(db, workflow_id, limit=limit)
