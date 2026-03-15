from __future__ import annotations

from uuid import uuid4

from sqlalchemy.orm import Session

from app.models.workflow import Workflow, WorkflowVersion
from app.services.compiled_blueprints import (
    CompiledBlueprintError,
    CompiledBlueprintService,
)
from app.services.workflow_definitions import bump_workflow_version
from app.services.workflow_publish import (
    WorkflowPublishBindingError,
    WorkflowPublishBindingService,
)


class WorkflowMutationError(ValueError):
    pass


class WorkflowMutationService:
    def __init__(
        self,
        compiled_blueprint_service: CompiledBlueprintService | None = None,
        workflow_publish_service: WorkflowPublishBindingService | None = None,
    ) -> None:
        self._compiled_blueprint_service = (
            compiled_blueprint_service or CompiledBlueprintService()
        )
        self._workflow_publish_service = workflow_publish_service or WorkflowPublishBindingService(
            self._compiled_blueprint_service
        )

    def create_workflow(
        self,
        db: Session,
        *,
        name: str,
        definition: dict,
    ) -> Workflow:
        workflow = Workflow(
            id=str(uuid4()),
            name=name,
            version="0.1.0",
            status="draft",
            definition=definition,
        )
        db.add(workflow)
        self._create_workflow_version_snapshot(db, workflow=workflow, definition=definition)
        return workflow

    def update_workflow(
        self,
        db: Session,
        *,
        workflow: Workflow,
        name: str | None = None,
        definition: dict | None = None,
    ) -> Workflow:
        if name is not None:
            workflow.name = name

        if definition is not None:
            workflow.version = bump_workflow_version(workflow.version)
            workflow.definition = definition
            self._create_workflow_version_snapshot(db, workflow=workflow, definition=definition)

        db.add(workflow)
        return workflow

    def _create_workflow_version_snapshot(
        self,
        db: Session,
        *,
        workflow: Workflow,
        definition: dict,
    ) -> WorkflowVersion:
        workflow_version = WorkflowVersion(
            id=str(uuid4()),
            workflow_id=workflow.id,
            version=workflow.version,
            definition=definition,
        )
        db.add(workflow_version)
        db.flush()
        try:
            self._compiled_blueprint_service.ensure_for_workflow_version(db, workflow_version)
            db.flush()
            self._workflow_publish_service.ensure_for_workflow_version(db, workflow_version)
        except (CompiledBlueprintError, WorkflowPublishBindingError) as exc:
            raise WorkflowMutationError(str(exc)) from exc
        return workflow_version
