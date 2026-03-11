from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.workflow import (
    Workflow,
    WorkflowCompiledBlueprint,
    WorkflowPublishedEndpoint,
    WorkflowVersion,
)
from app.services.published_api_keys import PublishedEndpointApiKeyService
from app.services.runtime import ExecutionArtifacts, RuntimeService
from app.services.workflow_publish import WorkflowPublishBindingService


class PublishedEndpointGatewayError(ValueError):
    def __init__(self, detail: str, *, status_code: int = 422) -> None:
        super().__init__(detail)
        self.status_code = status_code


@dataclass
class PublishedNativeInvokeResult:
    workflow: Workflow
    workflow_version: WorkflowVersion
    blueprint_record: WorkflowCompiledBlueprint
    binding_id: str
    endpoint_id: str
    endpoint_name: str
    endpoint_alias: str
    route_path: str
    artifacts: ExecutionArtifacts


class PublishedEndpointGatewayService:
    def __init__(
        self,
        *,
        workflow_publish_service: WorkflowPublishBindingService | None = None,
        api_key_service: PublishedEndpointApiKeyService | None = None,
        runtime_service: RuntimeService | None = None,
    ) -> None:
        self._workflow_publish_service = workflow_publish_service or WorkflowPublishBindingService()
        self._api_key_service = api_key_service or PublishedEndpointApiKeyService()
        self._runtime_service = runtime_service or RuntimeService()

    def invoke_native_endpoint(
        self,
        db: Session,
        *,
        workflow_id: str,
        endpoint_id: str,
        input_payload: dict,
        presented_api_key: str | None = None,
    ) -> PublishedNativeInvokeResult:
        binding = self._workflow_publish_service.get_published_binding(
            db,
            workflow_id=workflow_id,
            endpoint_id=endpoint_id,
        )
        return self._invoke_native_binding(
            db,
            binding=binding,
            missing_detail="Published endpoint binding is not currently active.",
            input_payload=input_payload,
            presented_api_key=presented_api_key,
        )

    def invoke_native_endpoint_by_alias(
        self,
        db: Session,
        *,
        endpoint_alias: str,
        input_payload: dict,
        presented_api_key: str | None = None,
    ) -> PublishedNativeInvokeResult:
        binding = self._workflow_publish_service.get_published_binding_by_alias(
            db,
            endpoint_alias=endpoint_alias,
        )
        return self._invoke_native_binding(
            db,
            binding=binding,
            missing_detail="Published endpoint alias is not currently active.",
            input_payload=input_payload,
            presented_api_key=presented_api_key,
        )

    def invoke_native_endpoint_by_path(
        self,
        db: Session,
        *,
        route_path: str,
        input_payload: dict,
        presented_api_key: str | None = None,
    ) -> PublishedNativeInvokeResult:
        binding = self._workflow_publish_service.get_published_binding_by_path(
            db,
            route_path=route_path,
        )
        return self._invoke_native_binding(
            db,
            binding=binding,
            missing_detail="Published endpoint path is not currently active.",
            input_payload=input_payload,
            presented_api_key=presented_api_key,
        )

    def _invoke_native_binding(
        self,
        db: Session,
        *,
        binding: WorkflowPublishedEndpoint | None,
        missing_detail: str,
        input_payload: dict,
        presented_api_key: str | None,
    ) -> PublishedNativeInvokeResult:
        if binding is None:
            raise PublishedEndpointGatewayError(missing_detail, status_code=404)
        if binding.protocol != "native":
            raise PublishedEndpointGatewayError(
                f"Published endpoint '{binding.endpoint_id}' uses protocol "
                f"'{binding.protocol}', not 'native'."
            )

        workflow = db.get(Workflow, binding.workflow_id)
        if workflow is None:
            raise PublishedEndpointGatewayError("Workflow not found.", status_code=404)

        if binding.auth_mode == "api_key":
            if presented_api_key is None or not presented_api_key.strip():
                raise PublishedEndpointGatewayError(
                    "Published endpoint API key is required.",
                    status_code=401,
                )
            authenticated_key = self._api_key_service.authenticate_key(
                db,
                workflow_id=workflow.id,
                endpoint_id=binding.endpoint_id,
                secret_key=presented_api_key,
            )
            if authenticated_key is None:
                raise PublishedEndpointGatewayError(
                    "Published endpoint API key is invalid.",
                    status_code=401,
                )
        elif binding.auth_mode != "internal":
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
            endpoint_alias=binding.endpoint_alias,
            route_path=binding.route_path,
            artifacts=artifacts,
        )
