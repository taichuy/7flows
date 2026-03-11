from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.workflow import WorkflowPublishedEndpoint, WorkflowVersion
from app.schemas.workflow import WorkflowPublishedEndpointDefinition
from app.schemas.workflow_publish import PublishedEndpointLifecycleStatus
from app.services.compiled_blueprints import CompiledBlueprintService


class WorkflowPublishBindingError(ValueError):
    pass


class WorkflowPublishBindingService:
    def __init__(
        self,
        compiled_blueprint_service: CompiledBlueprintService | None = None,
    ) -> None:
        self._compiled_blueprint_service = (
            compiled_blueprint_service or CompiledBlueprintService()
        )

    def ensure_for_workflow_version(
        self,
        db: Session,
        workflow_version: WorkflowVersion,
    ) -> list[WorkflowPublishedEndpoint]:
        definition = workflow_version.definition or {}
        publish_definitions = [
            WorkflowPublishedEndpointDefinition.model_validate(item)
            for item in definition.get("publish") or []
        ]
        existing_records = db.scalars(
            select(WorkflowPublishedEndpoint).where(
                WorkflowPublishedEndpoint.workflow_version_id == workflow_version.id
            )
        ).all()
        existing_by_endpoint_id = {
            record.endpoint_id: record for record in existing_records
        }

        synced_records: list[WorkflowPublishedEndpoint] = []
        seen_endpoint_ids: set[str] = set()
        for endpoint in publish_definitions:
            target_version_value = endpoint.workflowVersion or workflow_version.version
            target_version = db.scalar(
                select(WorkflowVersion).where(
                    WorkflowVersion.workflow_id == workflow_version.workflow_id,
                    WorkflowVersion.version == target_version_value,
                )
            )
            if target_version is None:
                raise WorkflowPublishBindingError(
                    "Published endpoint "
                    f"'{endpoint.id}' references unknown workflow version "
                    f"'{target_version_value}'."
                )

            compiled_blueprint = self._compiled_blueprint_service.ensure_for_workflow_version(
                db,
                target_version,
            )
            record = existing_by_endpoint_id.get(endpoint.id)
            if record is None:
                record = WorkflowPublishedEndpoint(
                    id=str(uuid4()),
                    workflow_id=workflow_version.workflow_id,
                    workflow_version_id=workflow_version.id,
                    workflow_version=workflow_version.version,
                    target_workflow_version_id=target_version.id,
                    target_workflow_version=target_version.version,
                    compiled_blueprint_id=compiled_blueprint.id,
                    endpoint_id=endpoint.id,
                    endpoint_name=endpoint.name,
                    protocol=endpoint.protocol,
                    auth_mode=endpoint.authMode,
                    streaming=endpoint.streaming,
                    lifecycle_status="draft",
                    input_schema=endpoint.inputSchema,
                    output_schema=endpoint.outputSchema,
                )
            else:
                record.workflow_id = workflow_version.workflow_id
                record.workflow_version_id = workflow_version.id
                record.workflow_version = workflow_version.version
                record.target_workflow_version_id = target_version.id
                record.target_workflow_version = target_version.version
                record.compiled_blueprint_id = compiled_blueprint.id
                record.endpoint_name = endpoint.name
                record.protocol = endpoint.protocol
                record.auth_mode = endpoint.authMode
                record.streaming = endpoint.streaming
                record.input_schema = endpoint.inputSchema
                record.output_schema = endpoint.outputSchema

            db.add(record)
            synced_records.append(record)
            seen_endpoint_ids.add(endpoint.id)

        for record in existing_records:
            if record.endpoint_id not in seen_endpoint_ids:
                db.delete(record)

        return synced_records

    def list_for_workflow(
        self,
        db: Session,
        workflow_id: str,
        *,
        workflow_version: str | None = None,
        lifecycle_status: PublishedEndpointLifecycleStatus | None = None,
    ) -> list[WorkflowPublishedEndpoint]:
        statement = (
            select(WorkflowPublishedEndpoint)
            .where(WorkflowPublishedEndpoint.workflow_id == workflow_id)
            .order_by(
                WorkflowPublishedEndpoint.workflow_version.desc(),
                WorkflowPublishedEndpoint.endpoint_name.asc(),
            )
        )
        if workflow_version is not None:
            statement = statement.where(
                WorkflowPublishedEndpoint.workflow_version == workflow_version
            )
        if lifecycle_status is not None:
            statement = statement.where(
                WorkflowPublishedEndpoint.lifecycle_status == lifecycle_status
            )
        return db.scalars(statement).all()

    def get_published_binding(
        self,
        db: Session,
        *,
        workflow_id: str,
        endpoint_id: str,
    ) -> WorkflowPublishedEndpoint | None:
        return db.scalar(
            select(WorkflowPublishedEndpoint).where(
                WorkflowPublishedEndpoint.workflow_id == workflow_id,
                WorkflowPublishedEndpoint.endpoint_id == endpoint_id,
                WorkflowPublishedEndpoint.lifecycle_status == "published",
            )
        )

    def update_lifecycle_status(
        self,
        db: Session,
        *,
        workflow_id: str,
        binding_id: str,
        lifecycle_status: PublishedEndpointLifecycleStatus,
    ) -> WorkflowPublishedEndpoint:
        record = db.scalar(
            select(WorkflowPublishedEndpoint).where(
                WorkflowPublishedEndpoint.id == binding_id,
                WorkflowPublishedEndpoint.workflow_id == workflow_id,
            )
        )
        if record is None:
            raise WorkflowPublishBindingError("Published endpoint binding not found.")

        if lifecycle_status == "draft":
            raise WorkflowPublishBindingError(
                "Lifecycle status 'draft' is reserved for synced bindings "
                "and cannot be set manually."
            )

        now = datetime.now(UTC)
        if lifecycle_status == "published":
            published_records = db.scalars(
                select(WorkflowPublishedEndpoint).where(
                    WorkflowPublishedEndpoint.workflow_id == workflow_id,
                    WorkflowPublishedEndpoint.endpoint_id == record.endpoint_id,
                    WorkflowPublishedEndpoint.id != record.id,
                    WorkflowPublishedEndpoint.lifecycle_status == "published",
                )
            ).all()
            for published_record in published_records:
                published_record.lifecycle_status = "offline"
                published_record.unpublished_at = now
                db.add(published_record)

            record.lifecycle_status = "published"
            record.published_at = now
            record.unpublished_at = None
        elif lifecycle_status == "offline":
            if record.lifecycle_status == "published":
                record.unpublished_at = now
            elif record.unpublished_at is None:
                record.unpublished_at = now
            record.lifecycle_status = "offline"
        else:
            raise WorkflowPublishBindingError(
                f"Unsupported lifecycle status '{lifecycle_status}'."
            )

        db.add(record)
        return record
