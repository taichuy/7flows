from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.workflow import (
    Workflow,
    WorkflowCompiledBlueprint,
    WorkflowPublishedEndpoint,
    WorkflowVersion,
)
from app.schemas.workflow_publish import (
    PublishedNativeRunResponse,
    PublishedProtocolAsyncRunResponse,
)
from app.services.published_api_keys import PublishedEndpointApiKeyService
from app.services.published_cache import PublishedEndpointCacheService
from app.services.published_invocations import PublishedInvocationService
from app.services.published_protocol_mapper import (
    build_anthropic_message_response,
    build_cache_identity_payload,
    build_openai_chat_completion_response,
    build_openai_response_api_response,
)
from app.services.run_views import serialize_run_detail
from app.services.runtime import RuntimeService
from app.services.workflow_publish import WorkflowPublishBindingService


class PublishedEndpointGatewayError(ValueError):
    def __init__(self, detail: str, *, status_code: int = 422) -> None:
        super().__init__(detail)
        self.status_code = status_code


@dataclass
class PublishedGatewayInvokeResult:
    response_payload: dict
    cache_status: str


class PublishedEndpointGatewayService:
    def __init__(
        self,
        *,
        workflow_publish_service: WorkflowPublishBindingService | None = None,
        api_key_service: PublishedEndpointApiKeyService | None = None,
        invocation_service: PublishedInvocationService | None = None,
        cache_service: PublishedEndpointCacheService | None = None,
        runtime_service: RuntimeService | None = None,
    ) -> None:
        self._workflow_publish_service = workflow_publish_service or WorkflowPublishBindingService()
        self._api_key_service = api_key_service or PublishedEndpointApiKeyService()
        self._invocation_service = invocation_service or PublishedInvocationService()
        self._cache_service = cache_service or PublishedEndpointCacheService()
        self._runtime_service = runtime_service or RuntimeService()

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

    def invoke_native_endpoint(
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
            response_builder=self._build_native_response_payload,
            response_preview_builder=self._build_native_response_preview,
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
            response_builder=self._build_native_response_payload,
            response_preview_builder=self._build_native_response_preview,
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
            response_builder=self._build_native_response_payload,
            response_preview_builder=self._build_native_response_preview,
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
            response_builder=self._build_native_response_payload,
            response_preview_builder=self._build_native_response_preview,
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
            response_builder=self._build_native_response_payload,
            response_preview_builder=self._build_native_response_preview,
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
            response_builder=self._build_native_response_payload,
            response_preview_builder=self._build_native_response_preview,
            require_terminal_success=False,
            request_surface_override="native.path.async",
        )

    def invoke_openai_chat_completion(
        self,
        db: Session,
        *,
        model: str,
        input_payload: dict,
        request_payload: dict,
        presented_api_key: str | None = None,
    ) -> PublishedGatewayInvokeResult:
        return self._invoke_protocol_binding_by_alias(
            db,
            model=model,
            expected_protocol="openai",
            missing_detail="Published OpenAI model is not currently active.",
            workflow_input_payload=input_payload,
            cache_input_payload=build_cache_identity_payload(
                surface="openai.chat.completions",
                request_payload=request_payload,
            ),
            request_preview_payload=request_payload,
            presented_api_key=presented_api_key,
            response_builder=lambda **kwargs: build_openai_chat_completion_response(
                model=model,
                output_payload=kwargs["artifacts"].run.output_payload,
            ),
        )

    def invoke_openai_chat_completion_async(
        self,
        db: Session,
        *,
        model: str,
        input_payload: dict,
        request_payload: dict,
        presented_api_key: str | None = None,
    ) -> PublishedGatewayInvokeResult:
        return self._invoke_protocol_binding_by_alias(
            db,
            model=model,
            expected_protocol="openai",
            missing_detail="Published OpenAI model is not currently active.",
            workflow_input_payload=input_payload,
            cache_input_payload=build_cache_identity_payload(
                surface="openai.chat.completions.async",
                request_payload=request_payload,
            ),
            request_preview_payload=request_payload,
            presented_api_key=presented_api_key,
            require_terminal_success=False,
            request_surface_override="openai.chat.completions.async",
            response_builder=lambda **kwargs: self._build_protocol_async_response_payload(
                binding=kwargs["binding"],
                workflow=kwargs["workflow"],
                workflow_version=kwargs["workflow_version"],
                blueprint_record=kwargs["blueprint_record"],
                artifacts=kwargs["artifacts"],
                model=model,
                request_surface="openai.chat.completions.async",
                protocol_response_builder=build_openai_chat_completion_response,
            ),
        )

    def invoke_openai_response(
        self,
        db: Session,
        *,
        model: str,
        input_payload: dict,
        request_payload: dict,
        presented_api_key: str | None = None,
    ) -> PublishedGatewayInvokeResult:
        return self._invoke_protocol_binding_by_alias(
            db,
            model=model,
            expected_protocol="openai",
            missing_detail="Published OpenAI model is not currently active.",
            workflow_input_payload=input_payload,
            cache_input_payload=build_cache_identity_payload(
                surface="openai.responses",
                request_payload=request_payload,
            ),
            request_preview_payload=request_payload,
            presented_api_key=presented_api_key,
            response_builder=lambda **kwargs: build_openai_response_api_response(
                model=model,
                output_payload=kwargs["artifacts"].run.output_payload,
            ),
        )

    def invoke_openai_response_async(
        self,
        db: Session,
        *,
        model: str,
        input_payload: dict,
        request_payload: dict,
        presented_api_key: str | None = None,
    ) -> PublishedGatewayInvokeResult:
        return self._invoke_protocol_binding_by_alias(
            db,
            model=model,
            expected_protocol="openai",
            missing_detail="Published OpenAI model is not currently active.",
            workflow_input_payload=input_payload,
            cache_input_payload=build_cache_identity_payload(
                surface="openai.responses.async",
                request_payload=request_payload,
            ),
            request_preview_payload=request_payload,
            presented_api_key=presented_api_key,
            require_terminal_success=False,
            request_surface_override="openai.responses.async",
            response_builder=lambda **kwargs: self._build_protocol_async_response_payload(
                binding=kwargs["binding"],
                workflow=kwargs["workflow"],
                workflow_version=kwargs["workflow_version"],
                blueprint_record=kwargs["blueprint_record"],
                artifacts=kwargs["artifacts"],
                model=model,
                request_surface="openai.responses.async",
                protocol_response_builder=build_openai_response_api_response,
            ),
        )

    def invoke_anthropic_message(
        self,
        db: Session,
        *,
        model: str,
        input_payload: dict,
        request_payload: dict,
        presented_api_key: str | None = None,
    ) -> PublishedGatewayInvokeResult:
        return self._invoke_protocol_binding_by_alias(
            db,
            model=model,
            expected_protocol="anthropic",
            missing_detail="Published Anthropic model is not currently active.",
            workflow_input_payload=input_payload,
            cache_input_payload=build_cache_identity_payload(
                surface="anthropic.messages",
                request_payload=request_payload,
            ),
            request_preview_payload=request_payload,
            presented_api_key=presented_api_key,
            response_builder=lambda **kwargs: build_anthropic_message_response(
                model=model,
                output_payload=kwargs["artifacts"].run.output_payload,
            ),
        )

    def invoke_anthropic_message_async(
        self,
        db: Session,
        *,
        model: str,
        input_payload: dict,
        request_payload: dict,
        presented_api_key: str | None = None,
    ) -> PublishedGatewayInvokeResult:
        return self._invoke_protocol_binding_by_alias(
            db,
            model=model,
            expected_protocol="anthropic",
            missing_detail="Published Anthropic model is not currently active.",
            workflow_input_payload=input_payload,
            cache_input_payload=build_cache_identity_payload(
                surface="anthropic.messages.async",
                request_payload=request_payload,
            ),
            request_preview_payload=request_payload,
            presented_api_key=presented_api_key,
            require_terminal_success=False,
            request_surface_override="anthropic.messages.async",
            response_builder=lambda **kwargs: self._build_protocol_async_response_payload(
                binding=kwargs["binding"],
                workflow=kwargs["workflow"],
                workflow_version=kwargs["workflow_version"],
                blueprint_record=kwargs["blueprint_record"],
                artifacts=kwargs["artifacts"],
                model=model,
                request_surface="anthropic.messages.async",
                protocol_response_builder=build_anthropic_message_response,
            ),
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
        require_terminal_success: bool = True,
        request_surface_override: str | None = None,
    ) -> PublishedGatewayInvokeResult:
        binding = self._workflow_publish_service.get_published_binding_by_alias(
            db,
            endpoint_alias=model,
        )
        return self._invoke_binding(
            db,
            binding=binding,
            missing_detail=missing_detail,
            expected_protocol=expected_protocol,
            workflow_input_payload=workflow_input_payload,
            cache_input_payload=cache_input_payload,
            request_preview_payload=request_preview_payload,
            presented_api_key=presented_api_key,
            request_source="alias",
            response_builder=response_builder,
            response_preview_builder=self._build_passthrough_response_preview,
            require_terminal_success=require_terminal_success,
            request_surface_override=request_surface_override,
        )

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
        require_terminal_success: bool = True,
        request_surface_override: str | None = None,
    ) -> PublishedGatewayInvokeResult:
        if binding is None:
            raise PublishedEndpointGatewayError(missing_detail, status_code=404)

        started_at = datetime.now(UTC)
        authenticated_key = None
        invocation_error: PublishedEndpointGatewayError | None = None
        workflow = None
        workflow_version = None
        blueprint_record = None
        response_payload = None
        cache_status = "bypass"
        response_preview_payload = None

        try:
            if binding.protocol != expected_protocol:
                raise PublishedEndpointGatewayError(
                    f"Published endpoint '{binding.endpoint_id}' uses protocol "
                    f"'{binding.protocol}', not '{expected_protocol}'."
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
                    "Published endpoint auth mode "
                    f"'{binding.auth_mode}' is not supported yet."
                )
            if binding.streaming:
                raise PublishedEndpointGatewayError(
                    "Published endpoint streaming invocation is not supported yet."
                )
            self._enforce_rate_limit(db, binding=binding)

            workflow_version = db.get(WorkflowVersion, binding.target_workflow_version_id)
            if workflow_version is None:
                raise PublishedEndpointGatewayError(
                    "Published endpoint target workflow version is missing."
                )

            blueprint_record = db.get(WorkflowCompiledBlueprint, binding.compiled_blueprint_id)
            if blueprint_record is None:
                raise PublishedEndpointGatewayError(
                    "Published endpoint compiled blueprint is missing."
                )

            cache_enabled = self._cache_service.is_enabled(binding)
            if cache_enabled:
                cache_status = "miss"
                cache_hit = self._cache_service.get_hit(
                    db,
                    binding=binding,
                    input_payload=cache_input_payload,
                    now=started_at,
                )
            else:
                cache_hit = None

            if cache_hit is not None:
                response_payload = cache_hit.response_payload
                cache_status = "hit"
            else:
                artifacts = self._runtime_service.execute_compiled_workflow(
                    db,
                    workflow=workflow,
                    workflow_version=workflow_version,
                    blueprint_record=blueprint_record,
                    input_payload=workflow_input_payload,
                )
                if require_terminal_success:
                    self._ensure_sync_publish_run_succeeded(artifacts.run.status)
                response_payload = response_builder(
                    binding=binding,
                    workflow=workflow,
                    workflow_version=workflow_version,
                    blueprint_record=blueprint_record,
                    artifacts=artifacts,
                )
                response_preview_payload = response_preview_builder(response_payload)
                if cache_enabled and self._should_store_cached_response(
                    response_payload=response_payload,
                ):
                    self._cache_service.store_response(
                        db,
                        binding=binding,
                        input_payload=cache_input_payload,
                        response_payload=response_payload,
                    )
                elif cache_enabled and cache_status != "hit":
                    cache_status = "bypass"
        except PublishedEndpointGatewayError as exc:
            invocation_error = exc
        except Exception as exc:  # pragma: no cover - defensive audit hook
            invocation_error = PublishedEndpointGatewayError(str(exc), status_code=500)

        finished_at = datetime.now(UTC)
        if invocation_error is not None:
            self._invocation_service.record_invocation(
                db,
                binding=binding,
                request_source=request_source,
                input_payload=request_preview_payload,
                status="rejected" if invocation_error.status_code < 500 else "failed",
                cache_status=cache_status,
                request_surface_override=request_surface_override,
                api_key_id=authenticated_key.id if authenticated_key is not None else None,
                error_message=str(invocation_error),
                started_at=started_at,
                finished_at=finished_at,
            )
            raise invocation_error

        if (
            workflow is None
            or workflow_version is None
            or blueprint_record is None
            or not isinstance(response_payload, dict)
        ):
            raise PublishedEndpointGatewayError(
                "Published endpoint invocation did not produce a response payload.",
                status_code=500,
            )

        if response_preview_payload is None:
            response_preview_payload = response_preview_builder(response_payload)

        run_payload = self._extract_run_payload(response_payload)

        self._invocation_service.record_invocation(
            db,
            binding=binding,
            request_source=request_source,
            input_payload=request_preview_payload,
            status="failed" if run_payload and run_payload.get("status") == "failed" else "succeeded",
            cache_status=cache_status,
            request_surface_override=request_surface_override,
            api_key_id=authenticated_key.id if authenticated_key is not None else None,
            run_id=run_payload.get("id") if run_payload is not None else None,
            run_status=run_payload.get("status") if run_payload is not None else None,
            response_payload=response_preview_payload,
            error_message=run_payload.get("error_message") if run_payload is not None else None,
            started_at=started_at,
            finished_at=finished_at,
        )
        return PublishedGatewayInvokeResult(
            response_payload=response_payload,
            cache_status=cache_status,
        )

    def _should_store_cached_response(
        self,
        *,
        response_payload: dict,
    ) -> bool:
        run_payload = self._extract_run_payload(response_payload)
        if run_payload is None:
            return True
        return run_payload.get("status") == "succeeded"

    def _ensure_sync_publish_run_succeeded(self, run_status: str) -> None:
        if run_status == "succeeded":
            return
        if run_status == "waiting":
            raise PublishedEndpointGatewayError(
                "Published sync invocation entered waiting state. "
                "Waiting runs are not supported for sync published endpoints yet.",
                status_code=409,
            )
        raise PublishedEndpointGatewayError(
            f"Published sync invocation ended with unsupported run status '{run_status}'.",
            status_code=500,
        )

    def _build_native_response_payload(
        self,
        *,
        binding: WorkflowPublishedEndpoint,
        workflow: Workflow,
        workflow_version: WorkflowVersion,
        blueprint_record: WorkflowCompiledBlueprint,
        artifacts,
    ) -> dict:
        response = PublishedNativeRunResponse(
            binding_id=binding.id,
            endpoint_id=binding.endpoint_id,
            endpoint_name=binding.endpoint_name,
            endpoint_alias=binding.endpoint_alias,
            route_path=binding.route_path,
            workflow_id=workflow.id,
            workflow_version=workflow_version.version,
            compiled_blueprint_id=blueprint_record.id,
            run=serialize_run_detail(artifacts),
        )
        return response.model_dump(mode="json")

    def _build_native_response_preview(self, response_payload: dict) -> dict:
        run_payload = response_payload.get("run")
        if not isinstance(run_payload, dict):
            return {}
        output_payload = run_payload.get("output_payload")
        return output_payload if isinstance(output_payload, dict) else {}

    def _build_passthrough_response_preview(self, response_payload: dict) -> dict:
        return response_payload

    def _build_protocol_async_response_payload(
        self,
        *,
        binding: WorkflowPublishedEndpoint,
        workflow: Workflow,
        workflow_version: WorkflowVersion,
        blueprint_record: WorkflowCompiledBlueprint,
        artifacts,
        model: str,
        request_surface: str,
        protocol_response_builder,
    ) -> dict:
        run_detail = serialize_run_detail(artifacts)
        response_payload = None
        if artifacts.run.status == "succeeded":
            response_payload = protocol_response_builder(
                model=model,
                output_payload=artifacts.run.output_payload,
            )

        response = PublishedProtocolAsyncRunResponse(
            binding_id=binding.id,
            endpoint_id=binding.endpoint_id,
            endpoint_name=binding.endpoint_name,
            endpoint_alias=binding.endpoint_alias,
            route_path=binding.route_path,
            protocol=binding.protocol,
            request_surface=request_surface,
            model=model,
            workflow_id=workflow.id,
            workflow_version=workflow_version.version,
            compiled_blueprint_id=blueprint_record.id,
            run=run_detail,
            response_payload=response_payload,
        )
        return response.model_dump(mode="json", exclude_none=True)

    def _extract_run_payload(self, response_payload: dict) -> dict | None:
        run_payload = response_payload.get("run")
        return run_payload if isinstance(run_payload, dict) else None

    def _enforce_rate_limit(
        self,
        db: Session,
        *,
        binding: WorkflowPublishedEndpoint,
    ) -> None:
        raw_policy = binding.rate_limit_policy
        if not isinstance(raw_policy, dict):
            return

        requests = raw_policy.get("requests")
        window_seconds = raw_policy.get("windowSeconds")
        if not isinstance(requests, int) or not isinstance(window_seconds, int):
            return
        if requests <= 0 or window_seconds <= 0:
            return

        window_start = datetime.now(UTC) - timedelta(seconds=window_seconds)
        recent_invocation_count = self._invocation_service.count_recent_for_binding(
            db,
            workflow_id=binding.workflow_id,
            binding_id=binding.id,
            created_from=window_start,
        )
        if recent_invocation_count >= requests:
            raise PublishedEndpointGatewayError(
                "Published endpoint rate limit exceeded: "
                f"{requests} successful/failed invocations per {window_seconds} seconds.",
                status_code=429,
            )
