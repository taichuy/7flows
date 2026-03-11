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
from app.schemas.workflow_publish import PublishedNativeRunResponse
from app.services.published_cache import PublishedEndpointCacheService
from app.services.published_api_keys import PublishedEndpointApiKeyService
from app.services.published_invocations import PublishedInvocationService
from app.services.runtime import RuntimeService
from app.services.run_views import serialize_run_detail
from app.services.workflow_publish import WorkflowPublishBindingService


class PublishedEndpointGatewayError(ValueError):
    def __init__(self, detail: str, *, status_code: int = 422) -> None:
        super().__init__(detail)
        self.status_code = status_code


@dataclass
class PublishedNativeInvokeResult:
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
            request_source="workflow",
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
            request_source="alias",
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
            request_source="path",
        )

    def _invoke_native_binding(
        self,
        db: Session,
        *,
        binding: WorkflowPublishedEndpoint | None,
        missing_detail: str,
        input_payload: dict,
        presented_api_key: str | None,
        request_source: str,
    ) -> PublishedNativeInvokeResult:
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

        try:
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
                    input_payload=input_payload,
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
                    input_payload=input_payload,
                )
                response_payload = self._build_native_response_payload(
                    binding=binding,
                    workflow=workflow,
                    workflow_version=workflow_version,
                    blueprint_record=blueprint_record,
                    artifacts=artifacts,
                )
                if cache_enabled:
                    self._cache_service.store_response(
                        db,
                        binding=binding,
                        input_payload=input_payload,
                        response_payload=response_payload,
                    )
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
                input_payload=input_payload,
                status="rejected" if invocation_error.status_code < 500 else "failed",
                cache_status=cache_status,
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

        self._invocation_service.record_invocation(
            db,
            binding=binding,
            request_source=request_source,
            input_payload=input_payload,
            status=(
                "failed"
                if response_payload["run"]["status"] == "failed"
                else "succeeded"
            ),
            cache_status=cache_status,
            api_key_id=authenticated_key.id if authenticated_key is not None else None,
            run_id=response_payload["run"]["id"],
            run_status=response_payload["run"]["status"],
            response_payload=response_payload["run"].get("output_payload") or {},
            error_message=response_payload["run"].get("error_message"),
            started_at=started_at,
            finished_at=finished_at,
        )
        return PublishedNativeInvokeResult(
            response_payload=response_payload,
            cache_status=cache_status,
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
