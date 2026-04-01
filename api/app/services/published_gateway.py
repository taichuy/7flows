from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.workflow import WorkflowPublishedEndpoint
from app.services.published_api_keys import PublishedEndpointApiKeyService
from app.services.published_cache import PublishedEndpointCacheService
from app.services.published_gateway_binding_invoker import PublishedGatewayBindingInvoker
from app.services.published_gateway_binding_resolver import PublishedGatewayBindingResolver
from app.services.published_gateway_cache_orchestrator import (
    PublishedGatewayCacheOrchestrator,
)
from app.services.published_gateway_invocation_recorder import (
    PublishedGatewayInvocationRecorder,
)
from app.services.published_gateway_protocol_surface import (
    PublishedGatewayProtocolSurfaceMixin,
)
from app.services.published_gateway_response_builders import (
    PublishedGatewayResponseBuilder,
)
from app.services.published_gateway_types import (
    PublishedEndpointGatewayError,
    PublishedGatewayInvokeResult,
)
from app.services.published_invocations import PublishedInvocationService
from app.services.runtime import RuntimeService
from app.services.workflow_publish import WorkflowPublishBindingService

__all__ = [
    "PublishedEndpointGatewayError",
    "PublishedEndpointGatewayService",
    "PublishedGatewayInvokeResult",
]


class PublishedEndpointGatewayService(PublishedGatewayProtocolSurfaceMixin):
    def __init__(
        self,
        *,
        workflow_publish_service: WorkflowPublishBindingService | None = None,
        api_key_service: PublishedEndpointApiKeyService | None = None,
        invocation_service: PublishedInvocationService | None = None,
        cache_service: PublishedEndpointCacheService | None = None,
        runtime_service: RuntimeService | None = None,
        response_builder: PublishedGatewayResponseBuilder | None = None,
        invocation_recorder: PublishedGatewayInvocationRecorder | None = None,
        binding_resolver: PublishedGatewayBindingResolver | None = None,
        cache_orchestrator: PublishedGatewayCacheOrchestrator | None = None,
    ) -> None:
        self._workflow_publish_service = workflow_publish_service or WorkflowPublishBindingService()
        self._api_key_service = api_key_service or PublishedEndpointApiKeyService()
        self._invocation_service = invocation_service or PublishedInvocationService()
        self._cache_service = cache_service or PublishedEndpointCacheService()
        self._runtime_service = runtime_service or RuntimeService()
        self._response_builder = response_builder or PublishedGatewayResponseBuilder()
        self._invocation_recorder = invocation_recorder or PublishedGatewayInvocationRecorder(
            invocation_service=self._invocation_service
        )
        self._binding_resolver = binding_resolver or PublishedGatewayBindingResolver(
            api_key_service=self._api_key_service,
            invocation_service=self._invocation_service,
        )
        self._cache_orchestrator = cache_orchestrator or PublishedGatewayCacheOrchestrator(
            cache_service=self._cache_service,
        )
        self._binding_invoker = PublishedGatewayBindingInvoker(
            workflow_publish_service=self._workflow_publish_service,
            runtime_service=self._runtime_service,
            response_builder=self._response_builder,
            invocation_recorder=self._invocation_recorder,
            binding_resolver=self._binding_resolver,
            cache_orchestrator=self._cache_orchestrator,
        )

    def record_protocol_rejection_by_alias(
        self,
        db: Session,
        *,
        model: str,
        expected_protocol: str,
        request_payload: dict,
        error_detail: str,
        presented_api_key: str | None = None,
        request_surface_override: str | None = None,
    ) -> None:
        binding = self._workflow_publish_service.get_published_binding_by_alias(
            db,
            endpoint_alias=model,
        )
        if binding is None or binding.protocol != expected_protocol:
            return

        authenticated_key = None
        if binding.auth_mode == "api_key" and presented_api_key and presented_api_key.strip():
            authenticated_key = self._api_key_service.authenticate_key(
                db,
                workflow_id=binding.workflow_id,
                endpoint_id=binding.endpoint_id,
                secret_key=presented_api_key,
            )

        self._invocation_service.record_invocation(
            db,
            binding=binding,
            request_source="alias",
            input_payload=request_payload,
            status="rejected",
            cache_status="bypass",
            request_surface_override=request_surface_override,
            api_key_id=authenticated_key.id if authenticated_key is not None else None,
            error_message=error_detail,
        )
        db.commit()

    def invoke_native_endpoint(
        self,
        db: Session,
        *,
        workflow_id: str,
        endpoint_id: str,
        input_payload: dict,
        presented_api_key: str | None = None,
        require_streaming_enabled: bool = False,
    ) -> PublishedGatewayInvokeResult:
        binding = self._workflow_publish_service.get_published_binding(
            db,
            workflow_id=workflow_id,
            endpoint_id=endpoint_id,
        )
        return self._invoke_binding(
            db,
            binding=binding,
            missing_detail="Published endpoint binding is not currently active.",
            expected_protocol="native",
            workflow_input_payload=input_payload,
            cache_input_payload=input_payload,
            request_preview_payload=input_payload,
            presented_api_key=presented_api_key,
            request_source="workflow",
            response_builder=self._response_builder.build_native_response_payload,
            response_preview_builder=self._response_builder.build_native_response_preview,
            require_streaming_enabled=require_streaming_enabled,
            request_surface_override="native.workflow",
        )

    def invoke_native_endpoint_async(
        self,
        db: Session,
        *,
        workflow_id: str,
        endpoint_id: str,
        input_payload: dict,
        presented_api_key: str | None = None,
    ) -> PublishedGatewayInvokeResult:
        binding = self._workflow_publish_service.get_published_binding(
            db,
            workflow_id=workflow_id,
            endpoint_id=endpoint_id,
        )
        return self._invoke_binding(
            db,
            binding=binding,
            missing_detail="Published endpoint binding is not currently active.",
            expected_protocol="native",
            workflow_input_payload=input_payload,
            cache_input_payload=input_payload,
            request_preview_payload=input_payload,
            presented_api_key=presented_api_key,
            request_source="workflow",
            response_builder=self._response_builder.build_native_response_payload,
            response_preview_builder=self._response_builder.build_native_response_preview,
            require_terminal_success=False,
            request_surface_override="native.workflow.async",
        )

    def invoke_native_endpoint_by_alias(
        self,
        db: Session,
        *,
        endpoint_alias: str,
        input_payload: dict,
        presented_api_key: str | None = None,
        require_streaming_enabled: bool = False,
    ) -> PublishedGatewayInvokeResult:
        binding = self._workflow_publish_service.get_published_binding_by_alias(
            db,
            endpoint_alias=endpoint_alias,
        )
        return self._invoke_binding(
            db,
            binding=binding,
            missing_detail="Published endpoint alias is not currently active.",
            expected_protocol="native",
            workflow_input_payload=input_payload,
            cache_input_payload=input_payload,
            request_preview_payload=input_payload,
            presented_api_key=presented_api_key,
            request_source="alias",
            response_builder=self._response_builder.build_native_response_payload,
            response_preview_builder=self._response_builder.build_native_response_preview,
            require_streaming_enabled=require_streaming_enabled,
            request_surface_override="native.alias",
        )

    def invoke_native_endpoint_by_alias_async(
        self,
        db: Session,
        *,
        endpoint_alias: str,
        input_payload: dict,
        presented_api_key: str | None = None,
    ) -> PublishedGatewayInvokeResult:
        binding = self._workflow_publish_service.get_published_binding_by_alias(
            db,
            endpoint_alias=endpoint_alias,
        )
        return self._invoke_binding(
            db,
            binding=binding,
            missing_detail="Published endpoint alias is not currently active.",
            expected_protocol="native",
            workflow_input_payload=input_payload,
            cache_input_payload=input_payload,
            request_preview_payload=input_payload,
            presented_api_key=presented_api_key,
            request_source="alias",
            response_builder=self._response_builder.build_native_response_payload,
            response_preview_builder=self._response_builder.build_native_response_preview,
            require_terminal_success=False,
            request_surface_override="native.alias.async",
        )

    def invoke_native_endpoint_by_path(
        self,
        db: Session,
        *,
        route_path: str,
        input_payload: dict,
        presented_api_key: str | None = None,
        require_streaming_enabled: bool = False,
    ) -> PublishedGatewayInvokeResult:
        binding = self._workflow_publish_service.get_published_binding_by_path(
            db,
            route_path=route_path,
        )
        return self._invoke_binding(
            db,
            binding=binding,
            missing_detail="Published endpoint path is not currently active.",
            expected_protocol="native",
            workflow_input_payload=input_payload,
            cache_input_payload=input_payload,
            request_preview_payload=input_payload,
            presented_api_key=presented_api_key,
            request_source="path",
            response_builder=self._response_builder.build_native_response_payload,
            response_preview_builder=self._response_builder.build_native_response_preview,
            require_streaming_enabled=require_streaming_enabled,
            request_surface_override="native.path",
        )

    def invoke_native_endpoint_by_path_async(
        self,
        db: Session,
        *,
        route_path: str,
        input_payload: dict,
        presented_api_key: str | None = None,
    ) -> PublishedGatewayInvokeResult:
        binding = self._workflow_publish_service.get_published_binding_by_path(
            db,
            route_path=route_path,
        )
        return self._invoke_binding(
            db,
            binding=binding,
            missing_detail="Published endpoint path is not currently active.",
            expected_protocol="native",
            workflow_input_payload=input_payload,
            cache_input_payload=input_payload,
            request_preview_payload=input_payload,
            presented_api_key=presented_api_key,
            request_source="path",
            response_builder=self._response_builder.build_native_response_payload,
            response_preview_builder=self._response_builder.build_native_response_preview,
            require_terminal_success=False,
            request_surface_override="native.path.async",
        )

    def _invoke_protocol_binding_by_alias(
        self,
        db: Session,
        *,
        model: str,
        expected_protocol: str,
        missing_detail: str,
        workflow_input_payload: dict,
        cache_input_payload: dict,
        request_preview_payload: dict,
        presented_api_key: str | None,
        response_builder,
        require_streaming_enabled: bool = False,
        require_terminal_success: bool = True,
        request_surface_override: str | None = None,
    ) -> PublishedGatewayInvokeResult:
        try:
            result = self._binding_invoker.invoke_protocol_binding_by_alias(
                db,
                model=model,
                missing_detail=missing_detail,
                expected_protocol=expected_protocol,
                workflow_input_payload=workflow_input_payload,
                cache_input_payload=cache_input_payload,
                request_preview_payload=request_preview_payload,
                presented_api_key=presented_api_key,
                response_builder=response_builder,
                require_streaming_enabled=require_streaming_enabled,
                require_terminal_success=require_terminal_success,
                request_surface_override=request_surface_override,
            )
        except PublishedEndpointGatewayError:
            db.commit()
            raise

        db.commit()
        return result

    def _invoke_binding(
        self,
        db: Session,
        *,
        binding: WorkflowPublishedEndpoint | None,
        missing_detail: str,
        expected_protocol: str,
        workflow_input_payload: dict,
        cache_input_payload: dict,
        request_preview_payload: dict,
        presented_api_key: str | None,
        request_source: str,
        response_builder,
        response_preview_builder,
        require_streaming_enabled: bool = False,
        require_terminal_success: bool = True,
        request_surface_override: str | None = None,
    ) -> PublishedGatewayInvokeResult:
        try:
            result = self._binding_invoker.invoke_binding(
                db,
                binding=binding,
                missing_detail=missing_detail,
                expected_protocol=expected_protocol,
                workflow_input_payload=workflow_input_payload,
                cache_input_payload=cache_input_payload,
                request_preview_payload=request_preview_payload,
                presented_api_key=presented_api_key,
                request_source=request_source,
                response_builder=response_builder,
                response_preview_builder=response_preview_builder,
                require_streaming_enabled=require_streaming_enabled,
                require_terminal_success=require_terminal_success,
                request_surface_override=request_surface_override,
            )
        except PublishedEndpointGatewayError:
            db.commit()
            raise

        db.commit()
        return result
