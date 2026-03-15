from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any


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
class PluginCallResponse:
    status: str
    output: dict[str, Any]
    logs: list[str] = field(default_factory=list)
    duration_ms: int = 0


NativeToolInvoker = Callable[[PluginCallRequest], PluginCallResponse | dict[str, Any]]
ClientFactory = Callable[[int], Any]
