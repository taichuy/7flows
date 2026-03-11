from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.workflow import Workflow, WorkflowCompiledBlueprint, WorkflowVersion
from app.services.runtime import ExecutionArtifacts, RuntimeService
from app.services.workflow_publish import WorkflowPublishBindingService


class PublishedEndpointGatewayError(ValueError):
    pass


@dataclass
class PublishedNativeInvokeResult:
    workflow: Workflow
    workflow_version: WorkflowVersion
    blueprint_record: WorkflowCompiledBlueprint
    binding_id: str
    endpoint_id: str
    endpoint_name: str
    artifacts: ExecutionArtifacts


class PublishedEndpointGatewayService:
    def __init__(
        self,
        *,
        workflow_publish_service: WorkflowPublishBindingService | None = None,
        runtime_service: RuntimeService | None = None,
    ) -> None:
        self._workflow_publish_service = workflow_publish_service or WorkflowPublishBindingService()
        self._runtime_service = runtime_service or RuntimeService()

    def invoke_native_endpoint(
        self,
        db: Session,
        *,
        workflow_id: str,
        endpoint_id: str,
        input_payload: dict,
    ) -> PublishedNativeInvokeResult:
        workflow = db.get(Workflow, workflow_id)
        if workflow is None:
            raise PublishedEndpointGatewayError("Workflow not found.")

        binding = self._workflow_publish_service.get_published_binding(
            db,
            workflow_id=workflow_id,
            endpoint_id=endpoint_id,
        )
        if binding is None:
            raise PublishedEndpointGatewayError(
                "Published endpoint binding is not currently active."
            )
        if binding.protocol != "native":
            raise PublishedEndpointGatewayError(
                f"Published endpoint '{endpoint_id}' uses protocol '{binding.protocol}', "
                "not 'native'."
            )
        if binding.auth_mode != "internal":
            raise PublishedEndpointGatewayError(
                "Published native endpoint auth mode "
                f"'{binding.auth_mode}' is not supported yet."
            )
        if binding.streaming:
            raise PublishedEndpointGatewayError(
                "Published native endpoint streaming invocation is not supported yet."
            )

        workflow_version = db.get(WorkflowVersion, binding.target_workflow_version_id)
        if workflow_version is None:
            raise PublishedEndpointGatewayError(
                "Published endpoint target workflow version is missing."
            )

        blueprint_record = db.get(WorkflowCompiledBlueprint, binding.compiled_blueprint_id)
        if blueprint_record is None:
            raise PublishedEndpointGatewayError("Published endpoint compiled blueprint is missing.")

        artifacts = self._runtime_service.execute_compiled_workflow(
            db,
            workflow=workflow,
            workflow_version=workflow_version,
            blueprint_record=blueprint_record,
            input_payload=input_payload,
        )
        return PublishedNativeInvokeResult(
            workflow=workflow,
            workflow_version=workflow_version,
            blueprint_record=blueprint_record,
            binding_id=binding.id,
            endpoint_id=binding.endpoint_id,
            endpoint_name=binding.endpoint_name,
            artifacts=artifacts,
        )
