from __future__ import annotations

from app.services.plugin_runtime_registry import PluginRegistry
from app.services.plugin_runtime_types import (
    CompatibilityAdapterRegistration,
    PluginCallRequest,
    PluginExecutionDispatchPlan,
)
from app.services.runtime_execution_policy import default_execution_class_for_tool_ecosystem
from app.services.sandbox_backends import SandboxBackendClient, get_sandbox_backend_client


class PluginExecutionDispatchPlanner:
    def __init__(
        self,
        registry: PluginRegistry,
        *,
        sandbox_backend_client: SandboxBackendClient | None = None,
    ) -> None:
        self._registry = registry
        self._sandbox_backend_client = sandbox_backend_client or get_sandbox_backend_client()

    def describe(
        self,
        request: PluginCallRequest,
        *,
        adapter: CompatibilityAdapterRegistration | None = None,
    ) -> PluginExecutionDispatchPlan:
        requested_execution = dict(request.execution or {})
        default_execution_class = default_execution_class_for_tool_ecosystem(request.ecosystem)
        requested_execution_class = str(
            requested_execution.get("class") or default_execution_class
        ).strip().lower() or default_execution_class
        execution_source = str(requested_execution.get("source") or "default").strip() or "default"
        requested_execution_profile = self._normalize_optional_string(
            requested_execution.get("profile")
        )
        requested_execution_timeout_ms = requested_execution.get("timeoutMs")
        requested_network_policy = self._normalize_optional_string(
            requested_execution.get("networkPolicy")
        )
        requested_filesystem_policy = self._normalize_optional_string(
            requested_execution.get("filesystemPolicy")
        )

        if request.ecosystem == "native":
            effective_execution_class = "inline"
            fallback_reason = None
            blocked_reason = None
            if requested_execution_class != effective_execution_class:
                if self._requires_fail_closed(
                    requested_execution_class=requested_execution_class,
                    execution_source=execution_source,
                ):
                    blocked_reason = (
                        "Native tool execution currently supports only 'inline'. "
                        f"Requested execution class '{requested_execution_class}' must fail closed "
                        "until a native sandbox execution path is implemented."
                    )
                else:
                    fallback_reason = "native_tools_currently_inline_only"
            return PluginExecutionDispatchPlan(
                requested_execution_class=requested_execution_class,
                effective_execution_class=effective_execution_class,
                execution_source=execution_source,
                requested_execution_profile=requested_execution_profile,
                requested_execution_timeout_ms=(
                    requested_execution_timeout_ms
                    if isinstance(requested_execution_timeout_ms, int)
                    else None
                ),
                requested_network_policy=requested_network_policy,
                requested_filesystem_policy=requested_filesystem_policy,
                executor_ref="tool:native-inline",
                effective_execution=self._build_effective_execution_payload(
                    requested_execution=requested_execution,
                    effective_execution_class=effective_execution_class,
                    execution_source=execution_source,
                    sandbox_backend_id=None,
                    sandbox_backend_executor_ref=None,
                ),
                fallback_reason=fallback_reason,
                blocked_reason=blocked_reason,
            )

        resolved_adapter = adapter or self._registry.resolve_adapter(
            ecosystem=request.ecosystem,
            adapter_id=request.adapter_id,
        )
        supported_execution_classes = resolved_adapter.supported_execution_classes or (
            "subprocess",
        )
        effective_execution_class = (
            requested_execution_class
            if requested_execution_class in supported_execution_classes
            else supported_execution_classes[0]
        )
        fallback_reason = None
        blocked_reason = None
        sandbox_backend_id = None
        sandbox_backend_executor_ref = None
        if requested_execution_class != effective_execution_class:
            if self._requires_fail_closed(
                requested_execution_class=requested_execution_class,
                execution_source=execution_source,
            ):
                blocked_reason = (
                    f"Compatibility adapter '{resolved_adapter.id}' does not support requested "
                    f"execution class '{requested_execution_class}'. Supported classes: "
                    f"{', '.join(supported_execution_classes)}."
                )
            else:
                fallback_reason = "compat_adapter_execution_class_not_supported"
        if blocked_reason is None and effective_execution_class in {"sandbox", "microvm"}:
            backend_selection = self._sandbox_backend_client.describe_tool_execution_backend(
                execution_class=effective_execution_class,
                profile=requested_execution_profile,
                network_policy=requested_network_policy,
                filesystem_policy=requested_filesystem_policy,
            )
            if not backend_selection.available or backend_selection.backend_id is None:
                blocked_reason = (
                    backend_selection.reason
                    or "No compatible sandbox backend is currently available."
                )
            else:
                sandbox_backend_id = backend_selection.backend_id
                sandbox_backend_executor_ref = backend_selection.executor_ref
        return PluginExecutionDispatchPlan(
            requested_execution_class=requested_execution_class,
            effective_execution_class=effective_execution_class,
            execution_source=execution_source,
            requested_execution_profile=requested_execution_profile,
            requested_execution_timeout_ms=(
                requested_execution_timeout_ms
                if isinstance(requested_execution_timeout_ms, int)
                else None
            ),
            requested_network_policy=requested_network_policy,
            requested_filesystem_policy=requested_filesystem_policy,
            executor_ref=f"tool:compat-adapter:{resolved_adapter.id}",
            effective_execution=self._build_effective_execution_payload(
                requested_execution=requested_execution,
                effective_execution_class=effective_execution_class,
                execution_source=execution_source,
                sandbox_backend_id=sandbox_backend_id,
                sandbox_backend_executor_ref=sandbox_backend_executor_ref,
            ),
            sandbox_backend_id=sandbox_backend_id,
            sandbox_backend_executor_ref=sandbox_backend_executor_ref,
            fallback_reason=fallback_reason,
            blocked_reason=blocked_reason,
        )

    @staticmethod
    def _requires_fail_closed(
        *,
        requested_execution_class: str,
        execution_source: str,
    ) -> bool:
        return (
            requested_execution_class != "inline"
            and execution_source in {"tool_call", "tool_policy", "runtime_policy"}
        )

    @staticmethod
    def _normalize_optional_string(value: object) -> str | None:
        if isinstance(value, str):
            return str(value)
        return None

    @staticmethod
    def _build_effective_execution_payload(
        *,
        requested_execution: dict[str, object],
        effective_execution_class: str,
        execution_source: str,
        sandbox_backend_id: str | None,
        sandbox_backend_executor_ref: str | None,
    ) -> dict[str, object]:
        if not requested_execution:
            return {}

        effective_execution = dict(requested_execution)
        effective_execution["class"] = effective_execution_class
        effective_execution["source"] = execution_source
        if sandbox_backend_id is not None:
            effective_execution["sandboxBackend"] = {
                "id": sandbox_backend_id,
                "executorRef": sandbox_backend_executor_ref,
            }
        return effective_execution
