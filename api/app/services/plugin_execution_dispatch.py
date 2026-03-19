from __future__ import annotations

from app.services.plugin_runtime_registry import PluginRegistry
from app.services.plugin_runtime_types import (
    CompatibilityAdapterRegistration,
    PluginCallRequest,
    PluginExecutionDispatchPlan,
)
from app.services.runtime_execution_policy import default_execution_class_for_tool_ecosystem
from app.services.sandbox_backends import SandboxBackendClient, get_sandbox_backend_client
from app.services.tool_execution_isolation import (
    build_tool_execution_not_yet_isolated_reason,
    describe_tool_execution_backend_selection,
    is_strong_tool_execution_class,
)

_DEPENDENCY_MODES = {"builtin", "dependency_ref", "backend_managed"}


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
        tool = self._registry.get_tool(request.tool_id)
        requested_execution = dict(request.execution or {})
        default_execution_class = default_execution_class_for_tool_ecosystem(request.ecosystem)
        if tool is not None and tool.default_execution_class is not None:
            default_execution_class = tool.default_execution_class
        elif request.ecosystem == "native" and tool is not None:
            supported_native_execution_classes = (
                tool.supported_execution_classes or ("inline",)
            )
            default_execution_class = supported_native_execution_classes[0]
        requested_execution_class = str(
            requested_execution.get("class") or default_execution_class
        ).strip().lower() or default_execution_class
        execution_source = str(requested_execution.get("source") or "default").strip() or "default"
        if (
            tool is not None
            and tool.default_execution_class is not None
            and execution_source == "default"
        ):
            requested_execution_class = tool.default_execution_class
            execution_source = "tool_default"
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
        requested_dependency_mode = self._normalize_optional_enum(
            requested_execution.get("dependencyMode"),
            allowed=_DEPENDENCY_MODES,
        )
        requested_builtin_package_set = self._normalize_optional_string(
            requested_execution.get("builtinPackageSet")
        )
        if requested_dependency_mode != "builtin":
            requested_builtin_package_set = None
        requested_dependency_ref = self._normalize_optional_string(
            requested_execution.get("dependencyRef")
        )
        if requested_dependency_mode != "dependency_ref":
            requested_dependency_ref = None
        requested_backend_extensions = self._normalize_optional_object(
            requested_execution.get("backendExtensions")
        )

        if request.ecosystem == "native":
            supported_execution_classes = (
                tool.supported_execution_classes if tool is not None else ("inline",)
            ) or ("inline",)
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
                    supported_summary = ", ".join(supported_execution_classes)
                    blocked_reason = (
                        f"Native tool '{request.tool_id}' does not support requested execution "
                        f"class '{requested_execution_class}'. Supported classes: "
                        f"{supported_summary}."
                    )
                else:
                    fallback_reason = "native_tool_execution_class_not_supported"
            if blocked_reason is None and is_strong_tool_execution_class(
                effective_execution_class
            ):
                backend_selection = describe_tool_execution_backend_selection(
                    sandbox_backend_client=self._sandbox_backend_client,
                    execution_class=effective_execution_class,
                    profile=requested_execution_profile,
                    dependency_mode=requested_dependency_mode,
                    builtin_package_set=requested_builtin_package_set,
                    network_policy=requested_network_policy,
                    filesystem_policy=requested_filesystem_policy,
                    backend_extensions=requested_backend_extensions,
                )
                if backend_selection is not None and not backend_selection.available:
                    blocked_reason = backend_selection.reason
                else:
                    if backend_selection is not None and backend_selection.available:
                        sandbox_backend_id = backend_selection.backend_id
                        sandbox_backend_executor_ref = backend_selection.executor_ref
                    blocked_reason = build_tool_execution_not_yet_isolated_reason(
                        tool_id=request.tool_id,
                        execution_class=effective_execution_class,
                        backend_selection=backend_selection,
                    )
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
                requested_dependency_mode=requested_dependency_mode,
                requested_builtin_package_set=requested_builtin_package_set,
                requested_dependency_ref=requested_dependency_ref,
                requested_backend_extensions=requested_backend_extensions,
                executor_ref=(
                    f"tool:native-{effective_execution_class}"
                    if effective_execution_class != "inline"
                    else "tool:native-inline"
                ),
                effective_execution=self._build_effective_execution_payload(
                    requested_execution=requested_execution,
                    effective_execution_class=effective_execution_class,
                    execution_source=execution_source,
                    requested_dependency_mode=requested_dependency_mode,
                    requested_builtin_package_set=requested_builtin_package_set,
                    requested_dependency_ref=requested_dependency_ref,
                    requested_backend_extensions=requested_backend_extensions,
                    sandbox_backend_id=sandbox_backend_id,
                    sandbox_backend_executor_ref=sandbox_backend_executor_ref,
                ),
                sandbox_backend_id=sandbox_backend_id,
                sandbox_backend_executor_ref=sandbox_backend_executor_ref,
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
        if blocked_reason is None and is_strong_tool_execution_class(
            effective_execution_class
        ):
            backend_selection = describe_tool_execution_backend_selection(
                sandbox_backend_client=self._sandbox_backend_client,
                execution_class=effective_execution_class,
                profile=requested_execution_profile,
                dependency_mode=requested_dependency_mode,
                builtin_package_set=requested_builtin_package_set,
                network_policy=requested_network_policy,
                filesystem_policy=requested_filesystem_policy,
                backend_extensions=requested_backend_extensions,
            )
            if backend_selection is not None and not backend_selection.available:
                blocked_reason = backend_selection.reason
            else:
                if backend_selection is not None and backend_selection.available:
                    sandbox_backend_id = backend_selection.backend_id
                    sandbox_backend_executor_ref = backend_selection.executor_ref
                blocked_reason = build_tool_execution_not_yet_isolated_reason(
                    tool_id=request.tool_id,
                    execution_class=effective_execution_class,
                    backend_selection=backend_selection,
                )
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
            requested_dependency_mode=requested_dependency_mode,
            requested_builtin_package_set=requested_builtin_package_set,
            requested_dependency_ref=requested_dependency_ref,
            requested_backend_extensions=requested_backend_extensions,
            executor_ref=f"tool:compat-adapter:{resolved_adapter.id}",
            effective_execution=self._build_effective_execution_payload(
                requested_execution=requested_execution,
                effective_execution_class=effective_execution_class,
                execution_source=execution_source,
                requested_dependency_mode=requested_dependency_mode,
                requested_builtin_package_set=requested_builtin_package_set,
                requested_dependency_ref=requested_dependency_ref,
                requested_backend_extensions=requested_backend_extensions,
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
        if execution_source in {"tool_call", "tool_policy", "runtime_policy"}:
            return requested_execution_class != "inline"
        if execution_source in {"tool_default", "tool_sensitivity"}:
            return requested_execution_class in {"sandbox", "microvm"}
        return False

    @staticmethod
    def _normalize_optional_string(value: object) -> str | None:
        if isinstance(value, str):
            normalized = str(value).strip()
            return normalized or None
        return None

    @staticmethod
    def _normalize_optional_enum(value: object, *, allowed: set[str]) -> str | None:
        if not isinstance(value, str):
            return None
        normalized = value.strip().lower()
        return normalized if normalized in allowed else None

    @staticmethod
    def _normalize_optional_object(value: object) -> dict[str, object] | None:
        if isinstance(value, dict):
            return value
        return None

    @staticmethod
    def _build_effective_execution_payload(
        *,
        requested_execution: dict[str, object],
        effective_execution_class: str,
        execution_source: str,
        requested_dependency_mode: str | None,
        requested_builtin_package_set: str | None,
        requested_dependency_ref: str | None,
        requested_backend_extensions: dict[str, object] | None,
        sandbox_backend_id: str | None,
        sandbox_backend_executor_ref: str | None,
    ) -> dict[str, object]:
        effective_execution = dict(requested_execution)
        effective_execution["class"] = effective_execution_class
        effective_execution["source"] = execution_source
        if requested_dependency_mode is not None:
            effective_execution["dependencyMode"] = requested_dependency_mode
        else:
            effective_execution.pop("dependencyMode", None)
        if requested_builtin_package_set is not None:
            effective_execution["builtinPackageSet"] = requested_builtin_package_set
        else:
            effective_execution.pop("builtinPackageSet", None)
        if requested_dependency_ref is not None:
            effective_execution["dependencyRef"] = requested_dependency_ref
        else:
            effective_execution.pop("dependencyRef", None)
        if requested_backend_extensions is not None:
            effective_execution["backendExtensions"] = requested_backend_extensions
        else:
            effective_execution.pop("backendExtensions", None)
        if sandbox_backend_id is not None:
            effective_execution["sandboxBackend"] = {
                "id": sandbox_backend_id,
                "executorRef": sandbox_backend_executor_ref,
            }
        return effective_execution
