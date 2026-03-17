from __future__ import annotations

from dataclasses import dataclass
from typing import Any

_EXECUTION_CLASSES = {"inline", "subprocess", "sandbox", "microvm"}
_NETWORK_POLICIES = {"inherit", "restricted", "isolated"}
_FILESYSTEM_POLICIES = {"inherit", "readonly_tmp", "ephemeral"}
_DEPENDENCY_MODES = {"builtin", "dependency_ref", "backend_managed"}


def _normalize_enum(value: object, allowed: set[str]) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    return normalized if normalized in allowed else None


def _normalize_optional_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_backend_extensions(value: object) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    return value


@dataclass(frozen=True)
class ResolvedExecutionPolicy:
    execution_class: str
    source: str
    profile: str | None = None
    timeout_ms: int | None = None
    network_policy: str | None = None
    filesystem_policy: str | None = None
    dependency_mode: str | None = None
    builtin_package_set: str | None = None
    dependency_ref: str | None = None
    backend_extensions: dict[str, Any] | None = None

    def as_runtime_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "class": self.execution_class,
            "source": self.source,
        }
        if self.profile is not None:
            payload["profile"] = self.profile
        if self.timeout_ms is not None:
            payload["timeoutMs"] = self.timeout_ms
        if self.network_policy is not None:
            payload["networkPolicy"] = self.network_policy
        if self.filesystem_policy is not None:
            payload["filesystemPolicy"] = self.filesystem_policy
        if self.dependency_mode is not None:
            payload["dependencyMode"] = self.dependency_mode
        if self.builtin_package_set is not None:
            payload["builtinPackageSet"] = self.builtin_package_set
        if self.dependency_ref is not None:
            payload["dependencyRef"] = self.dependency_ref
        if self.backend_extensions is not None:
            payload["backendExtensions"] = self.backend_extensions
        return payload

    def as_execution_view_payload(self) -> dict[str, Any]:
        return {
            "execution_class": self.execution_class,
            "execution_source": self.source,
            "execution_profile": self.profile,
            "execution_timeout_ms": self.timeout_ms,
            "execution_network_policy": self.network_policy,
            "execution_filesystem_policy": self.filesystem_policy,
        }


def default_execution_class_for_node_type(node_type: str) -> str:
    if node_type == "sandbox_code":
        return "sandbox"
    return "inline"


def default_execution_class_for_tool_ecosystem(ecosystem: str) -> str:
    if ecosystem == "native":
        return "inline"
    return "subprocess"


def _resolve_tool_execution_from_payload(
    execution: dict[str, Any],
    *,
    default_class: str,
    source: str,
) -> ResolvedExecutionPolicy:
    execution_class = str(execution.get("class") or default_class).strip().lower()
    if execution_class not in _EXECUTION_CLASSES:
        execution_class = default_class

    normalized_profile = _normalize_optional_string(execution.get("profile"))

    timeout_ms = execution.get("timeoutMs")
    normalized_timeout_ms = timeout_ms if isinstance(timeout_ms, int) else None

    normalized_network_policy = _normalize_enum(
        execution.get("networkPolicy"),
        _NETWORK_POLICIES,
    )
    normalized_filesystem_policy = _normalize_enum(
        execution.get("filesystemPolicy"),
        _FILESYSTEM_POLICIES,
    )
    normalized_dependency_mode = _normalize_enum(
        execution.get("dependencyMode"),
        _DEPENDENCY_MODES,
    )
    normalized_builtin_package_set = _normalize_optional_string(
        execution.get("builtinPackageSet")
    )
    if normalized_dependency_mode != "builtin":
        normalized_builtin_package_set = None
    normalized_dependency_ref = _normalize_optional_string(execution.get("dependencyRef"))
    if normalized_dependency_mode != "dependency_ref":
        normalized_dependency_ref = None
    normalized_backend_extensions = _normalize_backend_extensions(
        execution.get("backendExtensions")
    )

    return ResolvedExecutionPolicy(
        execution_class=execution_class,
        source=source,
        profile=normalized_profile,
        timeout_ms=normalized_timeout_ms,
        network_policy=normalized_network_policy,
        filesystem_policy=normalized_filesystem_policy,
        dependency_mode=normalized_dependency_mode,
        builtin_package_set=normalized_builtin_package_set,
        dependency_ref=normalized_dependency_ref,
        backend_extensions=normalized_backend_extensions,
    )


def _extract_tool_execution_payload(tool_call: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(tool_call, dict):
        return None

    call_execution = tool_call.get("execution")
    if isinstance(call_execution, dict):
        return call_execution

    if any(
        key in tool_call
        for key in (
            "class",
            "profile",
            "timeoutMs",
            "networkPolicy",
            "filesystemPolicy",
            "dependencyMode",
            "builtinPackageSet",
            "dependencyRef",
            "backendExtensions",
        )
    ):
        return tool_call

    return None


def resolve_tool_execution_policy(
    *,
    tool_call: dict[str, Any] | None,
    tool_policy: dict[str, Any] | None,
    ecosystem: str,
) -> ResolvedExecutionPolicy:
    default_class = default_execution_class_for_tool_ecosystem(ecosystem)

    call_execution = _extract_tool_execution_payload(tool_call)
    if call_execution is not None:
        return _resolve_tool_execution_from_payload(
            call_execution,
            default_class=default_class,
            source="tool_call",
        )

    if isinstance(tool_policy, dict):
        policy_execution = tool_policy.get("execution")
        if isinstance(policy_execution, dict):
            return _resolve_tool_execution_from_payload(
                policy_execution,
                default_class=default_class,
                source="tool_policy",
            )

    return ResolvedExecutionPolicy(
        execution_class=default_class,
        source="default",
    )


def resolve_execution_policy(node: dict[str, Any]) -> ResolvedExecutionPolicy:
    node_type = str(node.get("type") or "")
    runtime_policy = node.get("runtimePolicy")
    execution = runtime_policy.get("execution") if isinstance(runtime_policy, dict) else None
    default_class = default_execution_class_for_node_type(node_type)

    if not isinstance(execution, dict):
        return ResolvedExecutionPolicy(
            execution_class=default_class,
            source="default",
        )

    execution_class = str(execution.get("class") or default_class).strip().lower()
    if execution_class not in _EXECUTION_CLASSES:
        execution_class = default_class

    resolved_policy = _resolve_tool_execution_from_payload(
        execution,
        default_class=default_class,
        source="runtime_policy",
    )
    return ResolvedExecutionPolicy(
        execution_class=execution_class,
        source=resolved_policy.source,
        profile=resolved_policy.profile,
        timeout_ms=resolved_policy.timeout_ms,
        network_policy=resolved_policy.network_policy,
        filesystem_policy=resolved_policy.filesystem_policy,
        dependency_mode=resolved_policy.dependency_mode,
        builtin_package_set=resolved_policy.builtin_package_set,
        dependency_ref=resolved_policy.dependency_ref,
        backend_extensions=resolved_policy.backend_extensions,
    )


def execution_policy_from_node_run_input(
    input_payload: dict[str, Any] | None,
    *,
    node_type: str,
) -> ResolvedExecutionPolicy:
    if not isinstance(input_payload, dict):
        return ResolvedExecutionPolicy(
            execution_class=default_execution_class_for_node_type(node_type),
            source="default",
        )

    execution = input_payload.get("execution")
    if not isinstance(execution, dict):
        return ResolvedExecutionPolicy(
            execution_class=default_execution_class_for_node_type(node_type),
            source="default",
        )

    execution_class = str(
        execution.get("class") or default_execution_class_for_node_type(node_type)
    ).strip().lower()
    if execution_class not in _EXECUTION_CLASSES:
        execution_class = default_execution_class_for_node_type(node_type)

    source = str(execution.get("source") or "default").strip().lower() or "default"
    if source not in {"default", "runtime_policy"}:
        source = "default"

    resolved_policy = _resolve_tool_execution_from_payload(
        execution,
        default_class=default_execution_class_for_node_type(node_type),
        source=source,
    )
    return ResolvedExecutionPolicy(
        execution_class=execution_class,
        source=source,
        profile=resolved_policy.profile,
        timeout_ms=resolved_policy.timeout_ms,
        network_policy=resolved_policy.network_policy,
        filesystem_policy=resolved_policy.filesystem_policy,
        dependency_mode=resolved_policy.dependency_mode,
        builtin_package_set=resolved_policy.builtin_package_set,
        dependency_ref=resolved_policy.dependency_ref,
        backend_extensions=resolved_policy.backend_extensions,
    )
