from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

_ADAPTER_EXECUTION_CLASSES = ("subprocess", "sandbox", "microvm")


def normalize_supported_execution_classes(values: object) -> tuple[str, ...]:
    normalized: list[str] = []
    seen: set[str] = set()
    if isinstance(values, (list, tuple, set)):
        for value in values:
            if not isinstance(value, str):
                continue
            candidate = value.strip().lower()
            if candidate not in _ADAPTER_EXECUTION_CLASSES or candidate in seen:
                continue
            normalized.append(candidate)
            seen.add(candidate)

    if not normalized:
        return ("subprocess",)
    return tuple(normalized)


class PluginInvocationError(RuntimeError):
    pass


class PluginCatalogError(RuntimeError):
    pass


@dataclass(frozen=True)
class PluginToolDefinition:
    id: str
    name: str
    ecosystem: str = "native"
    description: str = ""
    input_schema: dict[str, Any] = field(default_factory=dict)
    output_schema: dict[str, Any] | None = None
    source: str = "builtin"
    plugin_meta: dict[str, Any] | None = None
    constrained_ir: dict[str, Any] | None = None


@dataclass(frozen=True)
class CompatibilityAdapterRegistration:
    id: str
    ecosystem: str
    endpoint: str
    enabled: bool = True
    health_status: str = "degraded"
    healthcheck_path: str = "/healthz"
    workspace_ids: tuple[str, ...] = ()
    plugin_kinds: tuple[str, ...] = ("node", "provider")
    supported_execution_classes: tuple[str, ...] = ("subprocess",)

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "supported_execution_classes",
            normalize_supported_execution_classes(self.supported_execution_classes),
        )


@dataclass(frozen=True)
class CompatibilityAdapterHealth:
    id: str
    ecosystem: str
    endpoint: str
    enabled: bool
    status: str
    detail: str | None = None


@dataclass(frozen=True)
class PluginCallRequest:
    tool_id: str
    ecosystem: str
    inputs: dict[str, Any]
    adapter_id: str | None = None
    credentials: dict[str, str] = field(default_factory=dict)
    timeout_ms: int = 30_000
    trace_id: str = ""
    execution: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class PluginExecutionDispatchPlan:
    requested_execution_class: str
    effective_execution_class: str
    execution_source: str
    requested_execution_profile: str | None
    requested_execution_timeout_ms: int | None
    requested_network_policy: str | None
    requested_filesystem_policy: str | None
    executor_ref: str
    effective_execution: dict[str, Any] = field(default_factory=dict)
    sandbox_backend_id: str | None = None
    sandbox_backend_executor_ref: str | None = None
    fallback_reason: str | None = None
    blocked_reason: str | None = None

    def as_trace_payload(self) -> dict[str, Any]:
        return {
            "requested_execution_class": self.requested_execution_class,
            "effective_execution_class": self.effective_execution_class,
            "execution_source": self.execution_source,
            "requested_execution_profile": self.requested_execution_profile,
            "requested_execution_timeout_ms": self.requested_execution_timeout_ms,
            "requested_network_policy": self.requested_network_policy,
            "requested_filesystem_policy": self.requested_filesystem_policy,
            "executor_ref": self.executor_ref,
            "sandbox_backend_id": self.sandbox_backend_id,
            "sandbox_backend_executor_ref": self.sandbox_backend_executor_ref,
            "fallback_reason": self.fallback_reason,
            "blocked_reason": self.blocked_reason,
        }


@dataclass(frozen=True)
class PluginCallResponse:
    status: str
    output: dict[str, Any]
    logs: list[str] = field(default_factory=list)
    duration_ms: int = 0


NativeToolInvoker = Callable[[PluginCallRequest], PluginCallResponse | dict[str, Any]]
ClientFactory = Callable[[int], Any]
