from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.routes.auth import require_console_route_access
from app.core.database import get_db
from app.schemas.credential import CredentialItem
from app.schemas.model_provider import (
    NativeModelProviderCatalogItem,
    NativeModelProviderCredentialField,
    NativeModelProviderCredentialFieldOption,
    WorkspaceModelProviderConfigCreateRequest,
    WorkspaceModelProviderConfigItem,
    WorkspaceModelProviderConfigUpdateRequest,
    WorkspaceModelProviderRegistryResponse,
    WorkspaceModelProviderSettingsResponse,
)
from app.services.credential_store import CredentialStore
from app.services.model_provider_registry import (
    ModelProviderRegistryError,
    ModelProviderRegistryService,
    NativeModelProviderDefinition,
    build_credential_ref,
)
from app.services.workspace_access import (
    WorkspaceAccessContext,
)

router = APIRouter(prefix="/workspace/model-providers", tags=["workspace-model-providers"])
registry_service = ModelProviderRegistryService()
credential_store = CredentialStore()


def _serialize_catalog_item(item: NativeModelProviderDefinition) -> NativeModelProviderCatalogItem:
    return NativeModelProviderCatalogItem(
        id=item.id,
        label=item.label,
        description=item.description,
        help_url=item.help_url,
        supported_model_types=list(item.supported_model_types),
        configuration_methods=list(item.configuration_methods),
        credential_type=item.credential_type,
        compatible_credential_types=list(item.compatible_credential_types),
        default_base_url=item.default_base_url,
        default_protocol=item.default_protocol,
        default_models=list(item.default_models),
        credential_fields=[
            NativeModelProviderCredentialField(
                variable=field.variable,
                label=field.label,
                type=field.type,
                required=field.required,
                placeholder=field.placeholder,
                help=field.help,
                default=field.default,
                options=[
                    NativeModelProviderCredentialFieldOption(value=option.value, label=option.label)
                    for option in field.options
                ],
            )
            for field in item.credential_fields
        ],
    )


def _serialize_provider_item(
    record,
    *,
    provider_catalog: NativeModelProviderDefinition,
    credential,
) -> WorkspaceModelProviderConfigItem:
    return WorkspaceModelProviderConfigItem(
        id=record.id,
        workspace_id=record.workspace_id,
        provider_id=record.provider_id,
        provider_label=provider_catalog.label,
        label=record.label,
        description=record.description,
        credential_id=record.credential_id,
        credential_ref=build_credential_ref(record.credential_id),
        credential_name=credential.name,
        credential_type=credential.credential_type,
        base_url=record.base_url,
        default_model=record.default_model,
        protocol=record.protocol,
        status=record.status,
        supported_model_types=list(record.supported_model_types or []),
        created_at=record.created_at,
        updated_at=record.updated_at,
        disabled_at=record.disabled_at,
    )


def _serialize_credential_item(record, *, sensitive_resource=None) -> CredentialItem:
    return CredentialItem(
        id=record.id,
        name=record.name,
        credential_type=record.credential_type,
        description=record.description,
        status=record.status,
        sensitivity_level=(
            sensitive_resource.sensitivity_level if sensitive_resource is not None else None
        ),
        sensitive_resource_id=(sensitive_resource.id if sensitive_resource is not None else None),
        last_used_at=record.last_used_at,
        revoked_at=record.revoked_at,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _serialize_registry_response(
    db: Session,
    *,
    workspace_id: str,
    include_inactive: bool,
) -> WorkspaceModelProviderRegistryResponse:
    catalog = registry_service.list_catalog()
    provider_records = registry_service.list_provider_configs(
        db,
        workspace_id=workspace_id,
        include_inactive=include_inactive,
    )
    credentials_index = registry_service.list_credentials_index(
        db,
        credential_ids=[item.credential_id for item in provider_records],
    )
    return WorkspaceModelProviderRegistryResponse(
        catalog=[_serialize_catalog_item(item) for item in catalog],
        items=[
            _serialize_provider_item(
                item,
                provider_catalog=registry_service.get_catalog_item(item.provider_id),
                credential=credentials_index[item.credential_id],
            )
            for item in provider_records
            if item.credential_id in credentials_index
        ],
    )


def _raise_registry_error(exc: ModelProviderRegistryError) -> None:
    detail = str(exc)
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    if "不存在" in detail or "not found" in detail.lower():
        status_code = status.HTTP_404_NOT_FOUND
    raise HTTPException(status_code=status_code, detail=detail) from exc


@router.get("", response_model=WorkspaceModelProviderRegistryResponse)
def get_workspace_model_provider_registry(
    include_inactive: bool = Query(default=True),
    access_context: WorkspaceAccessContext = Depends(
        require_console_route_access("/api/workspace/model-providers")
    ),
    db: Session = Depends(get_db),
) -> WorkspaceModelProviderRegistryResponse:
    return _serialize_registry_response(
        db,
        workspace_id=access_context.workspace.id,
        include_inactive=include_inactive,
    )


@router.get("/settings", response_model=WorkspaceModelProviderSettingsResponse)
def get_workspace_model_provider_settings(
    include_inactive: bool = Query(default=True),
    access_context: WorkspaceAccessContext = Depends(
        require_console_route_access("/api/workspace/model-providers/settings")
    ),
    db: Session = Depends(get_db),
) -> WorkspaceModelProviderSettingsResponse:
    credentials = credential_store.list_credentials(db, include_revoked=False)
    sensitive_resource_map = credential_store.list_sensitive_resources(
        db,
        credential_ids=[item.id for item in credentials],
    )
    return WorkspaceModelProviderSettingsResponse(
        registry=_serialize_registry_response(
            db,
            workspace_id=access_context.workspace.id,
            include_inactive=include_inactive,
        ),
        credentials=[
            _serialize_credential_item(
                item,
                sensitive_resource=sensitive_resource_map.get(item.id),
            )
            for item in credentials
        ],
    )


@router.post(
    "",
    response_model=WorkspaceModelProviderConfigItem,
    status_code=status.HTTP_201_CREATED,
)
def create_workspace_model_provider_config(
    payload: WorkspaceModelProviderConfigCreateRequest,
    access_context: WorkspaceAccessContext = Depends(
        require_console_route_access("/api/workspace/model-providers", method="POST")
    ),
    db: Session = Depends(get_db),
) -> WorkspaceModelProviderConfigItem:
    try:
        record = registry_service.create_provider_config(
            db,
            workspace_id=access_context.workspace.id,
            provider_id=payload.provider_id,
            label=payload.label,
            description=payload.description,
            credential_ref=payload.credential_ref,
            base_url=payload.base_url,
            default_model=payload.default_model,
            protocol=payload.protocol,
            status=payload.status,
        )
    except ModelProviderRegistryError as exc:
        _raise_registry_error(exc)
    db.commit()
    db.refresh(record)
    credential = registry_service.list_credentials_index(
        db,
        credential_ids=[record.credential_id],
    )[record.credential_id]
    return _serialize_provider_item(
        record,
        provider_catalog=registry_service.get_catalog_item(record.provider_id),
        credential=credential,
    )


@router.put("/{provider_config_id}", response_model=WorkspaceModelProviderConfigItem)
def update_workspace_model_provider_config(
    provider_config_id: str,
    payload: WorkspaceModelProviderConfigUpdateRequest,
    access_context: WorkspaceAccessContext = Depends(
        require_console_route_access(
            "/api/workspace/model-providers/{provider_config_id}",
            method="PUT",
        )
    ),
    db: Session = Depends(get_db),
) -> WorkspaceModelProviderConfigItem:
    try:
        record = registry_service.update_provider_config(
            db,
            workspace_id=access_context.workspace.id,
            provider_config_id=provider_config_id,
            provider_id=payload.provider_id,
            label=payload.label,
            description=payload.description,
            credential_ref=payload.credential_ref,
            base_url=payload.base_url,
            default_model=payload.default_model,
            protocol=payload.protocol,
            status=payload.status,
        )
    except ModelProviderRegistryError as exc:
        _raise_registry_error(exc)
    db.commit()
    db.refresh(record)
    credential = registry_service.list_credentials_index(
        db,
        credential_ids=[record.credential_id],
    )[record.credential_id]
    return _serialize_provider_item(
        record,
        provider_catalog=registry_service.get_catalog_item(record.provider_id),
        credential=credential,
    )


@router.delete("/{provider_config_id}", response_model=WorkspaceModelProviderConfigItem)
def deactivate_workspace_model_provider_config(
    provider_config_id: str,
    access_context: WorkspaceAccessContext = Depends(
        require_console_route_access(
            "/api/workspace/model-providers/{provider_config_id}",
            method="DELETE",
        )
    ),
    db: Session = Depends(get_db),
) -> WorkspaceModelProviderConfigItem:
    try:
        record = registry_service.deactivate_provider_config(
            db,
            workspace_id=access_context.workspace.id,
            provider_config_id=provider_config_id,
        )
    except ModelProviderRegistryError as exc:
        _raise_registry_error(exc)
    db.commit()
    db.refresh(record)
    credential = registry_service.list_credentials_index(
        db,
        credential_ids=[record.credential_id],
    )[record.credential_id]
    return _serialize_provider_item(
        record,
        provider_catalog=registry_service.get_catalog_item(record.provider_id),
        credential=credential,
    )
