from __future__ import annotations

from dataclasses import dataclass
from typing import Any

_EXECUTION_CLASSES = {"inline", "subprocess", "sandbox", "microvm"}
_NETWORK_POLICIES = {"inherit", "restricted", "isolated"}
_FILESYSTEM_POLICIES = {"inherit", "readonly_tmp", "ephemeral"}


def _normalize_enum(value: object, allowed: set[str]) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    return normalized if normalized in allowed else None


@dataclass(frozen=True)
class ResolvedExecutionPolicy:
    execution_class: str
    source: str
    profile: str | None = None
    timeout_ms: int | None = None
    network_policy: str | None = None
    filesystem_policy: str | None = None

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

    profile = execution.get("profile")
    normalized_profile = str(profile).strip() if isinstance(profile, str) else ""

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

    return ResolvedExecutionPolicy(
        execution_class=execution_class,
        source=source,
        profile=normalized_profile or None,
        timeout_ms=normalized_timeout_ms,
        network_policy=normalized_network_policy,
        filesystem_policy=normalized_filesystem_policy,
    )


def resolve_tool_execution_policy(
    *,
    tool_call: dict[str, Any] | None,
    tool_policy: dict[str, Any] | None,
    ecosystem: str,
) -> ResolvedExecutionPolicy:
    default_class = default_execution_class_for_tool_ecosystem(ecosystem)

    if isinstance(tool_call, dict):
        call_execution = tool_call.get("execution")
        if isinstance(call_execution, dict):
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

    profile = execution.get("profile")
    normalized_profile = str(profile).strip() if isinstance(profile, str) else ""

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

    return ResolvedExecutionPolicy(
        execution_class=execution_class,
        source="runtime_policy",
        profile=normalized_profile or None,
        timeout_ms=normalized_timeout_ms,
        network_policy=normalized_network_policy,
        filesystem_policy=normalized_filesystem_policy,
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

    profile = execution.get("profile")
    normalized_profile = str(profile).strip() if isinstance(profile, str) else ""

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

    return ResolvedExecutionPolicy(
        execution_class=execution_class,
        source=source,
        profile=normalized_profile or None,
        timeout_ms=normalized_timeout_ms,
        network_policy=normalized_network_policy,
        filesystem_policy=normalized_filesystem_policy,
    )
