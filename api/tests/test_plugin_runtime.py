import json

import httpx
import pytest
from sqlalchemy.orm import Session

from app.models.workflow import Workflow
from app.services.plugin_runtime import (
    CompatibilityAdapterCatalogClient,
    CompatibilityAdapterHealth,
    CompatibilityAdapterHealthChecker,
    CompatibilityAdapterRegistration,
    PluginCallProxy,
    PluginCallRequest,
    PluginCatalogError,
    PluginInvocationError,
    PluginRegistry,
    PluginToolDefinition,
)
from app.services.runtime import RuntimeService
from app.services.sandbox_backends import (
    SandboxBackendCapability,
    SandboxBackendClient,
    SandboxBackendHealth,
    SandboxBackendRegistration,
    SandboxBackendRegistry,
)
from app.services.tool_gateway import ToolGateway


class _StaticSandboxHealthChecker:
    def __init__(self, healths: list[SandboxBackendHealth]) -> None:
        self._healths = healths

    def probe_all(self, registry: SandboxBackendRegistry) -> list[SandboxBackendHealth]:
        return list(self._healths)


def _sandbox_backend_client(
    *,
    execution_classes: tuple[str, ...],
    profiles: tuple[str, ...] = (),
    dependency_modes: tuple[str, ...] = (),
    supports_tool_execution: bool = False,
    supports_builtin_package_sets: bool = False,
    supports_backend_extensions: bool = False,
    client_factory=None,
) -> SandboxBackendClient:
    sandbox_registry = SandboxBackendRegistry()
    sandbox_registry.register_backend(
        SandboxBackendRegistration(
            id="sandbox-default",
            kind="official",
            endpoint="http://sandbox.local",
            enabled=True,
            health_status="healthy",
            capability=SandboxBackendCapability(
                supported_execution_classes=execution_classes,
                supported_profiles=profiles,
                supported_dependency_modes=dependency_modes,
                supports_tool_execution=supports_tool_execution,
                supports_builtin_package_sets=supports_builtin_package_sets,
                supports_backend_extensions=supports_backend_extensions,
                supports_network_policy=True,
                supports_filesystem_policy=True,
            ),
        )
    )
    return SandboxBackendClient(
        sandbox_registry,
        health_checker=_StaticSandboxHealthChecker(
            [
                SandboxBackendHealth(
                    id="sandbox-default",
                    kind="official",
                    endpoint="http://sandbox.local",
                    enabled=True,
                    status="healthy",
                    capability=SandboxBackendCapability(
                        supported_execution_classes=execution_classes,
                        supported_profiles=profiles,
                        supported_dependency_modes=dependency_modes,
                        supports_tool_execution=supports_tool_execution,
                        supports_builtin_package_sets=supports_builtin_package_sets,
                        supports_backend_extensions=supports_backend_extensions,
                        supports_network_policy=True,
                        supports_filesystem_policy=True,
                    ),
                )
            ]
        ),
        client_factory=client_factory,
    )


def _demo_search_constrained_ir() -> dict:
    return {
        "ir_version": "2026-03-10",
        "kind": "tool",
        "ecosystem": "compat:dify",
        "tool_id": "compat:dify:plugin:demo/search",
        "name": "Demo Search",
        "description": "Search via Dify adapter",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "number"},
            },
            "required": ["query"],
            "additional_properties": False,
        },
        "output_schema": {"type": "object"},
        "source": "plugin",
        "input_contract": [
            {
                "name": "query",
                "required": True,
                "value_source": "llm",
                "json_schema": {"type": "string"},
            },
            {
                "name": "limit",
                "required": False,
                "value_source": "user",
                "json_schema": {"type": "number"},
            },
        ],
        "constraints": {
            "additional_properties": False,
            "credential_fields": [],
            "file_fields": [],
            "llm_fillable_fields": ["query"],
            "user_config_fields": ["limit"],
        },
        "plugin_meta": {"origin": "dify"},
    }


def _credential_bound_constrained_ir() -> dict:
    return {
        "ir_version": "2026-03-10",
        "kind": "tool",
        "ecosystem": "compat:dify",
        "tool_id": "compat:dify:plugin:demo/secret-search",
        "name": "Secret Search",
        "description": "Search via Dify adapter with credential input",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "api_key": {"type": "string", "format": "password"},
            },
            "required": ["query", "api_key"],
            "additional_properties": False,
        },
        "output_schema": {"type": "object"},
        "source": "plugin",
        "input_contract": [
            {
                "name": "query",
                "required": True,
                "value_source": "llm",
                "json_schema": {"type": "string"},
            },
            {
                "name": "api_key",
                "required": True,
                "value_source": "credential",
                "json_schema": {"type": "string"},
            },
        ],
        "constraints": {
            "additional_properties": False,
            "credential_fields": ["api_key"],
            "file_fields": [],
            "llm_fillable_fields": ["query"],
            "user_config_fields": [],
        },
        "plugin_meta": {"origin": "dify"},
    }


def test_plugin_call_proxy_invokes_native_tool() -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="native.echo",
            name="Echo",
        ),
        invoker=lambda request: {
            "echo": request.inputs["message"],
            "trace_id": request.trace_id,
        },
    )
    proxy = PluginCallProxy(registry)

    response = proxy.invoke(
        PluginCallRequest(
            tool_id="native.echo",
            ecosystem="native",
            inputs={"message": "hello"},
            trace_id="trace-native",
        )
    )

    assert response.status == "success"
    assert response.output == {"echo": "hello", "trace_id": "trace-native"}


def test_plugin_call_proxy_invokes_compat_adapter() -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="compat:dify:plugin:demo/search",
            name="Search",
            ecosystem="compat:dify",
            source="plugin",
            constrained_ir=_demo_search_constrained_ir(),
        )
    )
    registry.register_adapter(
        CompatibilityAdapterRegistration(
            id="dify-default",
            ecosystem="compat:dify",
            endpoint="http://adapter.local/dify",
        )
    )

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "http://adapter.local/dify/invoke"
        payload = json.loads(request.content.decode())
        assert payload["toolId"] == "compat:dify:plugin:demo/search"
        assert payload["traceId"] == "trace-compat"
        assert payload["inputs"] == {"query": "sevenflows"}
        assert payload["credentials"] == {}
        assert payload["execution"] == {"class": "subprocess", "source": "default"}
        assert payload["executionContract"] == {
            "irVersion": "2026-03-10",
            "kind": "tool_execution",
            "ecosystem": "compat:dify",
            "toolId": "compat:dify:plugin:demo/search",
            "inputContract": [
                {
                    "name": "query",
                    "required": True,
                    "valueSource": "llm",
                    "jsonSchema": {"type": "string"},
                },
                {
                    "name": "limit",
                    "required": False,
                    "valueSource": "user",
                    "jsonSchema": {"type": "number"},
                },
            ],
            "constraints": {
                "additionalProperties": False,
                "credentialFields": [],
                "fileFields": [],
                "llmFillableFields": ["query"],
                "userConfigFields": ["limit"],
            },
            "pluginMeta": {"origin": "dify"},
        }
        return httpx.Response(
            200,
            json={
                "status": "success",
                "output": {"documents": ["doc-1"]},
                "logs": ["adapter ok"],
                "durationMs": 17,
                "requestMeta": {
                    "traceId": payload["traceId"],
                    "execution": payload["execution"],
                    "executionContract": payload["executionContract"],
                },
            },
        )

    proxy = PluginCallProxy(
        registry,
        client_factory=lambda timeout_ms: httpx.Client(
            transport=httpx.MockTransport(handler),
            timeout=timeout_ms / 1000,
        ),
        sandbox_backend_client=_sandbox_backend_client(
            execution_classes=("microvm",),
            profiles=("compat-isolation",),
        ),
    )

    response = proxy.invoke(
        PluginCallRequest(
            tool_id="compat:dify:plugin:demo/search",
            ecosystem="compat:dify",
            inputs={"query": "sevenflows"},
            trace_id="trace-compat",
        )
    )

    assert response.status == "success"
    assert response.output == {"documents": ["doc-1"]}
    assert response.logs == ["adapter ok"]
    assert response.duration_ms == 17
    assert response.meta == {
        "request_meta": {
            "trace_id": "trace-compat",
            "execution": {"class": "subprocess", "source": "default"},
            "execution_contract": {
                "irVersion": "2026-03-10",
                "kind": "tool_execution",
                "ecosystem": "compat:dify",
                "toolId": "compat:dify:plugin:demo/search",
                "inputContract": [
                    {
                        "name": "query",
                        "required": True,
                        "valueSource": "llm",
                        "jsonSchema": {"type": "string"},
                    },
                    {
                        "name": "limit",
                        "required": False,
                        "valueSource": "user",
                        "jsonSchema": {"type": "number"},
                    },
                ],
                "constraints": {
                    "additionalProperties": False,
                    "credentialFields": [],
                    "fileFields": [],
                    "llmFillableFields": ["query"],
                    "userConfigFields": ["limit"],
                },
                "pluginMeta": {"origin": "dify"},
            },
        }
    }


def test_plugin_call_proxy_fail_closes_explicit_strong_isolation_for_compat_adapter() -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="compat:dify:plugin:demo/search",
            name="Search",
            ecosystem="compat:dify",
            source="plugin",
            constrained_ir=_demo_search_constrained_ir(),
        )
    )
    registry.register_adapter(
        CompatibilityAdapterRegistration(
            id="dify-default",
            ecosystem="compat:dify",
            endpoint="http://adapter.local/dify",
            supported_execution_classes=("subprocess", "microvm"),
        )
    )

    invoked = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal invoked
        invoked = True
        return httpx.Response(
            200,
            json={
                "status": "success",
                "output": {"documents": ["doc-1"]},
                "durationMs": 9,
            },
        )

    proxy = PluginCallProxy(
        registry,
        client_factory=lambda timeout_ms: httpx.Client(
            transport=httpx.MockTransport(handler),
            timeout=timeout_ms / 1000,
        ),
        sandbox_backend_client=_sandbox_backend_client(
            execution_classes=("microvm",),
            profiles=("compat-isolation",),
            dependency_modes=("builtin",),
            supports_builtin_package_sets=True,
            supports_backend_extensions=True,
        ),
    )

    request = PluginCallRequest(
        tool_id="compat:dify:plugin:demo/search",
        ecosystem="compat:dify",
        inputs={"query": "sevenflows"},
        trace_id="trace-compat-execution",
        execution={
            "class": "microvm",
            "source": "tool_call",
            "profile": "compat-isolation",
            "timeoutMs": 4000,
            "networkPolicy": "isolated",
            "filesystemPolicy": "ephemeral",
            "dependencyMode": "builtin",
            "builtinPackageSet": "py-data-basic",
            "backendExtensions": {"mountPreset": "analytics"},
        },
    )
    dispatch = proxy.describe_execution_dispatch(request)
    assert dispatch.as_trace_payload() == {
        "requested_execution_class": "microvm",
        "effective_execution_class": None,
        "execution_source": "tool_call",
        "requested_execution_profile": "compat-isolation",
        "requested_execution_timeout_ms": 4000,
        "requested_network_policy": "isolated",
        "requested_filesystem_policy": "ephemeral",
        "requested_dependency_mode": "builtin",
        "requested_builtin_package_set": "py-data-basic",
        "requested_dependency_ref": None,
        "requested_backend_extensions": {"mountPreset": "analytics"},
        "executor_ref": None,
        "sandbox_backend_id": "sandbox-default",
        "sandbox_backend_executor_ref": "sandbox-backend:sandbox-default",
        "sandbox_runner_kind": "compat-adapter",
        "fallback_reason": None,
        "blocked_reason": (
            "Tool 'compat:dify:plugin:demo/search' requests execution class 'microvm'. "
            "A compatible sandbox backend has already been selected "
            "(sandbox-default, sandbox-backend:sandbox-default), but that backend does not "
            "advertise sandbox-backed tool execution support. Strong-isolation tool paths "
            "must fail closed until a backend with sandbox tool runner support is available."
        ),
    }

    with pytest.raises(
        PluginInvocationError,
        match="does not advertise sandbox-backed tool execution support",
    ):
        proxy.invoke(request)

    assert invoked is False


def test_plugin_call_proxy_fail_closes_backend_extension_request_without_backend_support() -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="compat:dify:plugin:demo/search",
            name="Search",
            ecosystem="compat:dify",
            source="plugin",
            constrained_ir=_demo_search_constrained_ir(),
        )
    )
    registry.register_adapter(
        CompatibilityAdapterRegistration(
            id="dify-default",
            ecosystem="compat:dify",
            endpoint="http://adapter.local/dify",
            supported_execution_classes=("subprocess", "microvm"),
        )
    )

    proxy = PluginCallProxy(
        registry,
        client_factory=lambda timeout_ms: httpx.Client(
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(
                    200,
                    json={
                        "status": "success",
                        "output": {"documents": ["doc-1"]},
                        "durationMs": 9,
                    },
                )
            ),
            timeout=timeout_ms / 1000,
        ),
        sandbox_backend_client=_sandbox_backend_client(
            execution_classes=("microvm",),
        ),
    )

    dispatch = proxy.describe_execution_dispatch(
        PluginCallRequest(
            tool_id="compat:dify:plugin:demo/search",
            ecosystem="compat:dify",
            inputs={"query": "sevenflows"},
            trace_id="trace-compat-execution",
            execution={
                "class": "microvm",
                "source": "tool_call",
                "profile": "compat-isolation",
                "timeoutMs": 4000,
                "networkPolicy": "isolated",
                "filesystemPolicy": "ephemeral",
                "backendExtensions": {"mountPreset": "analytics"},
            },
        )
    )

    payload = dispatch.as_trace_payload()
    assert payload["requested_execution_class"] == "microvm"
    assert payload["effective_execution_class"] is None
    assert payload["execution_source"] == "tool_call"
    assert payload["requested_execution_profile"] == "compat-isolation"
    assert payload["requested_execution_timeout_ms"] == 4000
    assert payload["requested_network_policy"] == "isolated"
    assert payload["requested_filesystem_policy"] == "ephemeral"
    assert payload["requested_backend_extensions"] == {"mountPreset": "analytics"}
    assert payload["executor_ref"] is None
    assert payload["sandbox_runner_kind"] == "compat-adapter"
    assert payload["fallback_reason"] is None
    assert payload["blocked_reason"] is not None
    assert "no compatible sandbox backend is currently available" in str(
        payload["blocked_reason"]
    ).lower()
    assert "does not support backendExtensions payloads" in str(payload["blocked_reason"])

    with pytest.raises(
        PluginInvocationError,
        match="No compatible sandbox backend is currently available",
    ):
        proxy.invoke(
            PluginCallRequest(
                tool_id="compat:dify:plugin:demo/search",
                ecosystem="compat:dify",
                inputs={"query": "sevenflows"},
                trace_id="trace-compat-execution",
                execution={
                    "class": "microvm",
                    "source": "tool_call",
                    "profile": "compat-isolation",
                    "timeoutMs": 4000,
                    "networkPolicy": "isolated",
                    "filesystemPolicy": "ephemeral",
                    "backendExtensions": {"mountPreset": "analytics"},
                },
            )
        )


def test_plugin_call_proxy_blocks_explicit_unsupported_execution_class_for_compat_adapter() -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="compat:dify:plugin:demo/search",
            name="Search",
            ecosystem="compat:dify",
            source="plugin",
            constrained_ir=_demo_search_constrained_ir(),
        )
    )
    registry.register_adapter(
        CompatibilityAdapterRegistration(
            id="dify-default",
            ecosystem="compat:dify",
            endpoint="http://adapter.local/dify",
            supported_execution_classes=("subprocess",),
        )
    )

    proxy = PluginCallProxy(
        registry,
        client_factory=lambda timeout_ms: httpx.Client(
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(
                    200,
                    json={
                        "status": "success",
                        "output": {"documents": ["doc-1"]},
                        "durationMs": 9,
                    },
                )
            ),
            timeout=timeout_ms / 1000,
        ),
    )

    dispatch = proxy.describe_execution_dispatch(
        PluginCallRequest(
            tool_id="compat:dify:plugin:demo/search",
            ecosystem="compat:dify",
            inputs={"query": "sevenflows"},
            trace_id="trace-compat-execution",
            execution={
                "class": "microvm",
                "source": "tool_call",
                "profile": "compat-isolation",
                "timeoutMs": 4000,
                "networkPolicy": "isolated",
                "filesystemPolicy": "ephemeral",
            },
        )
    )

    assert dispatch.as_trace_payload() == {
        "requested_execution_class": "microvm",
        "effective_execution_class": None,
        "execution_source": "tool_call",
        "requested_execution_profile": "compat-isolation",
        "requested_execution_timeout_ms": 4000,
        "requested_network_policy": "isolated",
        "requested_filesystem_policy": "ephemeral",
        "requested_dependency_mode": None,
        "requested_builtin_package_set": None,
        "requested_dependency_ref": None,
        "requested_backend_extensions": None,
        "executor_ref": None,
        "sandbox_backend_id": None,
        "sandbox_backend_executor_ref": None,
        "fallback_reason": None,
        "blocked_reason": (
            "Compatibility adapter 'dify-default' does not support requested execution class "
            "'microvm'. Supported classes: subprocess."
        ),
    }

    with pytest.raises(
        PluginInvocationError,
        match="does not support requested execution class 'microvm'",
    ):
        proxy.invoke(
            PluginCallRequest(
                tool_id="compat:dify:plugin:demo/search",
                ecosystem="compat:dify",
                inputs={"query": "sevenflows"},
                trace_id="trace-compat-execution",
                execution={
                    "class": "microvm",
                    "source": "tool_call",
                    "profile": "compat-isolation",
                    "timeoutMs": 4000,
                    "networkPolicy": "isolated",
                    "filesystemPolicy": "ephemeral",
                },
            )
        )


def test_plugin_call_proxy_keeps_default_execution_fallback_for_compat_adapter() -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="compat:dify:plugin:demo/search",
            name="Search",
            ecosystem="compat:dify",
            source="plugin",
            constrained_ir=_demo_search_constrained_ir(),
        )
    )
    registry.register_adapter(
        CompatibilityAdapterRegistration(
            id="dify-default",
            ecosystem="compat:dify",
            endpoint="http://adapter.local/dify",
            supported_execution_classes=("subprocess",),
        )
    )

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content.decode())
        assert payload["execution"] == {}
        return httpx.Response(
            200,
            json={
                "status": "success",
                "output": {"documents": ["doc-1"]},
                "durationMs": 9,
            },
        )

    proxy = PluginCallProxy(
        registry,
        client_factory=lambda timeout_ms: httpx.Client(
            transport=httpx.MockTransport(handler),
            timeout=timeout_ms / 1000,
        ),
    )

    dispatch = proxy.describe_execution_dispatch(
        PluginCallRequest(
            tool_id="compat:dify:plugin:demo/search",
            ecosystem="compat:dify",
            inputs={"query": "sevenflows"},
            trace_id="trace-compat-execution-default",
        )
    )

    assert dispatch.as_trace_payload() == {
        "requested_execution_class": "subprocess",
        "effective_execution_class": "subprocess",
        "execution_source": "default",
        "requested_execution_profile": None,
        "requested_execution_timeout_ms": None,
        "requested_network_policy": None,
        "requested_filesystem_policy": None,
        "requested_dependency_mode": None,
        "requested_builtin_package_set": None,
        "requested_dependency_ref": None,
        "requested_backend_extensions": None,
        "executor_ref": "tool:compat-adapter:dify-default",
        "sandbox_backend_id": None,
        "sandbox_backend_executor_ref": None,
        "fallback_reason": None,
        "blocked_reason": None,
    }


def test_plugin_call_proxy_fail_closes_tool_default_strong_execution_for_compat_adapter() -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="compat:dify:plugin:demo/search",
            name="Search",
            ecosystem="compat:dify",
            source="plugin",
            constrained_ir=_demo_search_constrained_ir(),
            supported_execution_classes=("subprocess", "microvm"),
            default_execution_class="microvm",
        )
    )
    registry.register_adapter(
        CompatibilityAdapterRegistration(
            id="dify-default",
            ecosystem="compat:dify",
            endpoint="http://adapter.local/dify",
            supported_execution_classes=("subprocess",),
        )
    )

    proxy = PluginCallProxy(
        registry,
        client_factory=lambda timeout_ms: httpx.Client(
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(
                    200,
                    json={
                        "status": "success",
                        "output": {"documents": ["doc-1"]},
                        "durationMs": 9,
                    },
                )
            ),
            timeout=timeout_ms / 1000,
        ),
    )

    dispatch = proxy.describe_execution_dispatch(
        PluginCallRequest(
            tool_id="compat:dify:plugin:demo/search",
            ecosystem="compat:dify",
            inputs={"query": "sevenflows"},
            trace_id="trace-compat-default-microvm",
        )
    )

    assert dispatch.as_trace_payload() == {
        "requested_execution_class": "microvm",
        "effective_execution_class": None,
        "execution_source": "tool_default",
        "requested_execution_profile": None,
        "requested_execution_timeout_ms": None,
        "requested_network_policy": None,
        "requested_filesystem_policy": None,
        "requested_dependency_mode": None,
        "requested_builtin_package_set": None,
        "requested_dependency_ref": None,
        "requested_backend_extensions": None,
        "executor_ref": None,
        "sandbox_backend_id": None,
        "sandbox_backend_executor_ref": None,
        "fallback_reason": None,
        "blocked_reason": (
            "Compatibility adapter 'dify-default' does not support requested execution class "
            "'microvm'. Supported classes: subprocess."
        ),
    }

    with pytest.raises(
        PluginInvocationError,
        match="does not support requested execution class 'microvm'",
    ):
        proxy.invoke(
            PluginCallRequest(
                tool_id="compat:dify:plugin:demo/search",
                ecosystem="compat:dify",
                inputs={"query": "sevenflows"},
                trace_id="trace-compat-default-microvm",
            )
        )


def test_plugin_call_proxy_fail_closes_explicit_native_isolation_request() -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=lambda _request: {"documents": ["doc-1"]},
    )

    proxy = PluginCallProxy(registry)

    dispatch = proxy.describe_execution_dispatch(
        PluginCallRequest(
            tool_id="native.search",
            ecosystem="native",
            inputs={"query": "sevenflows"},
            trace_id="trace-native-execution",
            execution={
                "class": "sandbox",
                "source": "tool_call",
                "profile": "risk-reviewed",
                "timeoutMs": 3000,
            },
        )
    )

    assert dispatch.as_trace_payload() == {
        "requested_execution_class": "sandbox",
        "effective_execution_class": None,
        "execution_source": "tool_call",
        "requested_execution_profile": "risk-reviewed",
        "requested_execution_timeout_ms": 3000,
        "requested_network_policy": None,
        "requested_filesystem_policy": None,
        "requested_dependency_mode": None,
        "requested_builtin_package_set": None,
        "requested_dependency_ref": None,
        "requested_backend_extensions": None,
        "executor_ref": None,
        "sandbox_backend_id": None,
        "sandbox_backend_executor_ref": None,
        "fallback_reason": None,
        "blocked_reason": (
            "Native tool 'native.search' does not support requested execution class "
            "'sandbox'. Supported classes: inline."
        ),
    }

    with pytest.raises(
        PluginInvocationError,
        match="does not support requested execution class 'sandbox'",
    ):
        proxy.invoke(
            PluginCallRequest(
                tool_id="native.search",
                ecosystem="native",
                inputs={"query": "sevenflows"},
                trace_id="trace-native-execution",
                execution={
                    "class": "sandbox",
                    "source": "tool_call",
                    "profile": "risk-reviewed",
                    "timeoutMs": 3000,
                },
            )
        )


def test_plugin_call_proxy_fail_closes_tool_sensitivity_isolation_request() -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Native Search"),
        invoker=lambda _request: {"documents": ["doc-1"]},
    )

    proxy = PluginCallProxy(registry)

    dispatch = proxy.describe_execution_dispatch(
        PluginCallRequest(
            tool_id="native.search",
            ecosystem="native",
            inputs={"query": "sevenflows"},
            trace_id="trace-native-sensitivity-execution",
            execution={
                "class": "sandbox",
                "source": "tool_sensitivity",
                "profile": "risk-reviewed",
                "timeoutMs": 3000,
            },
        )
    )

    assert dispatch.as_trace_payload() == {
        "requested_execution_class": "sandbox",
        "effective_execution_class": None,
        "execution_source": "tool_sensitivity",
        "requested_execution_profile": "risk-reviewed",
        "requested_execution_timeout_ms": 3000,
        "requested_network_policy": None,
        "requested_filesystem_policy": None,
        "requested_dependency_mode": None,
        "requested_builtin_package_set": None,
        "requested_dependency_ref": None,
        "requested_backend_extensions": None,
        "executor_ref": None,
        "sandbox_backend_id": None,
        "sandbox_backend_executor_ref": None,
        "fallback_reason": None,
        "blocked_reason": (
            "Native tool 'native.search' does not support requested execution class "
            "'sandbox'. Supported classes: inline."
        ),
    }

    with pytest.raises(
        PluginInvocationError,
        match="does not support requested execution class 'sandbox'",
    ):
        proxy.invoke(
            PluginCallRequest(
                tool_id="native.search",
                ecosystem="native",
                inputs={"query": "sevenflows"},
                trace_id="trace-native-sensitivity-execution",
                execution={
                    "class": "sandbox",
                    "source": "tool_sensitivity",
                    "profile": "risk-reviewed",
                    "timeoutMs": 3000,
                },
            )
        )


def test_plugin_call_proxy_fail_closes_supported_strong_isolation_for_native_tool() -> None:
    registry = PluginRegistry()
    invoked = False

    def invoker(request: PluginCallRequest) -> dict[str, object]:
        nonlocal invoked
        invoked = True
        return {"documents": ["doc-1"], "execution": request.execution}

    registry.register_tool(
        PluginToolDefinition(
            id="native.search",
            name="Native Search",
            supported_execution_classes=("inline", "sandbox"),
        ),
        invoker=invoker,
    )

    proxy = PluginCallProxy(
        registry,
        sandbox_backend_client=_sandbox_backend_client(
            execution_classes=("sandbox",),
            profiles=("risk-reviewed",),
        ),
    )

    dispatch = proxy.describe_execution_dispatch(
        PluginCallRequest(
            tool_id="native.search",
            ecosystem="native",
            inputs={"query": "sevenflows"},
            trace_id="trace-native-sandbox",
            execution={
                "class": "sandbox",
                "source": "tool_call",
                "profile": "risk-reviewed",
                "timeoutMs": 3000,
                "networkPolicy": "restricted",
                "filesystemPolicy": "ephemeral",
            },
        )
    )

    assert dispatch.as_trace_payload() == {
        "requested_execution_class": "sandbox",
        "effective_execution_class": None,
        "execution_source": "tool_call",
        "requested_execution_profile": "risk-reviewed",
        "requested_execution_timeout_ms": 3000,
        "requested_network_policy": "restricted",
        "requested_filesystem_policy": "ephemeral",
        "requested_dependency_mode": None,
        "requested_builtin_package_set": None,
        "requested_dependency_ref": None,
        "requested_backend_extensions": None,
        "executor_ref": None,
        "sandbox_backend_id": "sandbox-default",
        "sandbox_backend_executor_ref": "sandbox-backend:sandbox-default",
        "sandbox_runner_kind": "native-tool",
        "fallback_reason": None,
        "blocked_reason": (
            "Tool 'native.search' requests execution class 'sandbox'. "
            "A compatible sandbox backend has already been selected "
            "(sandbox-default, sandbox-backend:sandbox-default), but that backend does not "
            "advertise sandbox-backed tool execution support. Strong-isolation tool paths "
            "must fail closed until a backend with sandbox tool runner support is available."
        ),
    }

    with pytest.raises(
        PluginInvocationError,
        match="does not advertise sandbox-backed tool execution support",
    ):
        proxy.invoke(
            PluginCallRequest(
                tool_id="native.search",
                ecosystem="native",
                inputs={"query": "sevenflows"},
                trace_id="trace-native-sandbox",
                execution={
                    "class": "sandbox",
                    "source": "tool_call",
                    "profile": "risk-reviewed",
                    "timeoutMs": 3000,
                    "networkPolicy": "restricted",
                    "filesystemPolicy": "ephemeral",
                },
            )
        )

    assert invoked is False


def test_plugin_call_proxy_executes_native_tool_via_sandbox_runner() -> None:
    registry = PluginRegistry()

    registry.register_tool(
        PluginToolDefinition(
            id="native.search",
            name="Native Search",
            ecosystem="native",
            input_schema={
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
                "additionalProperties": False,
            },
            supported_execution_classes=("inline", "sandbox"),
        )
    )

    def sandbox_handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content.decode("utf-8"))
        assert payload["command"] == ["sevenflows-tool-runner", "native-tool"]
        assert payload["input"]["kind"] == "tool_execution"
        assert payload["input"]["toolId"] == "native.search"
        assert payload["input"]["ecosystem"] == "native"
        assert "adapter" not in payload["input"]
        assert payload["input"]["inputs"] == {"query": "sevenflows"}
        assert payload["input"]["credentials"] == {}
        assert payload["input"]["execution"] == {
            "class": "sandbox",
            "source": "tool_call",
            "profile": "risk-reviewed",
            "timeoutMs": 3000,
            "networkPolicy": "restricted",
            "filesystemPolicy": "ephemeral",
            "sandboxBackend": {
                "id": "sandbox-default",
                "executorRef": "sandbox-backend:sandbox-default",
            },
        }
        assert payload["input"]["executionContract"] == {
            "irVersion": "2026-03-10",
            "kind": "tool_execution",
            "ecosystem": "native",
            "toolId": "native.search",
            "inputContract": [
                {
                    "name": "query",
                    "required": True,
                    "valueSource": "llm",
                    "jsonSchema": {"type": "string"},
                }
            ],
            "constraints": {
                "additionalProperties": False,
                "credentialFields": [],
                "fileFields": [],
                "llmFillableFields": ["query"],
                "userConfigFields": [],
            },
            "pluginMeta": {},
        }
        return httpx.Response(
            200,
            json={
                "ok": True,
                "executorRef": "sandbox-backend:sandbox-default:tool-runner",
                "effectiveExecutionClass": "sandbox",
                "result": {
                    "status": "success",
                    "output": {"documents": ["doc-1"]},
                    "logs": ["native sandbox tool runner invoked"],
                    "durationMs": 21,
                },
            },
        )

    proxy = PluginCallProxy(
        registry,
        sandbox_backend_client=_sandbox_backend_client(
            execution_classes=("sandbox",),
            profiles=("risk-reviewed",),
            supports_tool_execution=True,
            client_factory=lambda timeout_ms: httpx.Client(
                transport=httpx.MockTransport(sandbox_handler),
                timeout=timeout_ms / 1000,
            ),
        ),
    )

    dispatch = proxy.describe_execution_dispatch(
        PluginCallRequest(
            tool_id="native.search",
            ecosystem="native",
            inputs={"query": "sevenflows"},
            trace_id="trace-native-sandbox-runner",
            execution={
                "class": "sandbox",
                "source": "tool_call",
                "profile": "risk-reviewed",
                "timeoutMs": 3000,
                "networkPolicy": "restricted",
                "filesystemPolicy": "ephemeral",
            },
        )
    )
    assert dispatch.blocked_reason is None
    assert dispatch.as_trace_payload()["sandbox_backend_id"] == "sandbox-default"

    response = proxy.invoke(
        PluginCallRequest(
            tool_id="native.search",
            ecosystem="native",
            inputs={"query": "sevenflows"},
            trace_id="trace-native-sandbox-runner",
            execution={
                "class": "sandbox",
                "source": "tool_call",
                "profile": "risk-reviewed",
                "timeoutMs": 3000,
                "networkPolicy": "restricted",
                "filesystemPolicy": "ephemeral",
            },
        )
    )

    assert response.status == "success"
    assert response.output == {"documents": ["doc-1"]}
    assert response.logs == ["native sandbox tool runner invoked"]


def test_plugin_call_proxy_preserves_normalized_sandbox_tool_payload() -> None:
    registry = PluginRegistry()

    registry.register_tool(
        PluginToolDefinition(
            id="native.search",
            name="Native Search",
            ecosystem="native",
            input_schema={
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
                "additionalProperties": False,
            },
            supported_execution_classes=("inline", "sandbox"),
        )
    )

    def sandbox_handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content.decode("utf-8"))
        assert payload["command"] == ["sevenflows-tool-runner", "native-tool"]
        return httpx.Response(
            200,
            json={
                "ok": True,
                "executorRef": "sandbox-backend:sandbox-default:tool-runner",
                "effectiveExecutionClass": "sandbox",
                "stdout": "runner stdout",
                "result": {
                    "status": "success",
                    "structured": {"documents": ["doc-1"]},
                    "contentType": "json",
                    "summary": "Native runner returned one document.",
                    "rawRef": "artifact://tool-result-123",
                    "logs": ["normalized sandbox tool runner invoked"],
                    "durationMs": 21,
                    "artifactRefs": [
                        "artifact://tool-result-123",
                        "artifact://tool-trace-456",
                    ],
                    "executionTrace": {"phase": "tool_runner"},
                    "meta": {"runner": "sandbox-tool-runner"},
                },
            },
        )

    proxy = PluginCallProxy(
        registry,
        sandbox_backend_client=_sandbox_backend_client(
            execution_classes=("sandbox",),
            profiles=("risk-reviewed",),
            supports_tool_execution=True,
            client_factory=lambda timeout_ms: httpx.Client(
                transport=httpx.MockTransport(sandbox_handler),
                timeout=timeout_ms / 1000,
            ),
        ),
    )

    response = proxy.invoke(
        PluginCallRequest(
            tool_id="native.search",
            ecosystem="native",
            inputs={"query": "sevenflows"},
            trace_id="trace-native-sandbox-normalized",
            execution={
                "class": "sandbox",
                "source": "tool_call",
                "profile": "risk-reviewed",
                "timeoutMs": 3000,
            },
        )
    )

    assert response.status == "success"
    assert response.output == {"documents": ["doc-1"]}
    assert response.logs == [
        "normalized sandbox tool runner invoked",
        "runner stdout",
    ]
    assert response.content_type == "json"
    assert response.summary == "Native runner returned one document."
    assert response.raw_ref == "artifact://tool-result-123"
    assert response.meta == {
        "runner": "sandbox-tool-runner",
        "sandbox_backend_id": "sandbox-default",
        "sandbox_backend_executor_ref": "sandbox-backend:sandbox-default:tool-runner",
        "effective_execution_class": "sandbox",
        "artifact_refs": [
            "artifact://tool-result-123",
            "artifact://tool-trace-456",
        ],
        "sandbox_runner_trace": {"phase": "tool_runner"},
    }


def test_plugin_call_proxy_fail_closes_native_builtin_package_request() -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="native.search",
            name="Native Search",
            supported_execution_classes=("inline", "sandbox"),
        ),
        invoker=lambda _request: {"documents": ["doc-1"]},
    )

    proxy = PluginCallProxy(
        registry,
        sandbox_backend_client=_sandbox_backend_client(
            execution_classes=("sandbox",),
            dependency_modes=("builtin",),
        ),
    )

    dispatch = proxy.describe_execution_dispatch(
        PluginCallRequest(
            tool_id="native.search",
            ecosystem="native",
            inputs={"query": "sevenflows"},
            trace_id="trace-native-builtin",
            execution={
                "class": "sandbox",
                "source": "tool_call",
                "dependencyMode": "builtin",
                "builtinPackageSet": "py-data-basic",
            },
        )
    )

    payload = dispatch.as_trace_payload()
    assert payload["requested_execution_class"] == "sandbox"
    assert payload["effective_execution_class"] is None
    assert payload["execution_source"] == "tool_call"
    assert payload["requested_dependency_mode"] == "builtin"
    assert payload["requested_builtin_package_set"] == "py-data-basic"
    assert payload["executor_ref"] is None
    assert payload["sandbox_runner_kind"] == "native-tool"
    assert payload["fallback_reason"] is None
    assert payload["blocked_reason"] is not None
    assert "no compatible sandbox backend is currently available" in str(
        payload["blocked_reason"]
    ).lower()
    assert "does not support builtin package set hints" in str(payload["blocked_reason"])

    with pytest.raises(
        PluginInvocationError,
        match="No compatible sandbox backend is currently available",
    ):
        proxy.invoke(
            PluginCallRequest(
                tool_id="native.search",
                ecosystem="native",
                inputs={"query": "sevenflows"},
                trace_id="trace-native-builtin",
                execution={
                    "class": "sandbox",
                    "source": "tool_call",
                    "dependencyMode": "builtin",
                    "builtinPackageSet": "py-data-basic",
                },
            )
        )


def test_plugin_call_proxy_surfaces_backend_readiness_for_native_strong_isolation() -> None:
    registry = PluginRegistry()
    invoked = False

    def invoker(_request: PluginCallRequest) -> dict[str, object]:
        nonlocal invoked
        invoked = True
        return {"documents": ["doc-1"]}

    registry.register_tool(
        PluginToolDefinition(
            id="native.search",
            name="Native Search",
            supported_execution_classes=("inline", "sandbox"),
        ),
        invoker=invoker,
    )

    proxy = PluginCallProxy(
        registry,
        sandbox_backend_client=_sandbox_backend_client(execution_classes=("microvm",)),
    )

    dispatch = proxy.describe_execution_dispatch(
        PluginCallRequest(
            tool_id="native.search",
            ecosystem="native",
            inputs={"query": "sevenflows"},
            trace_id="trace-native-backend-gap",
            execution={"class": "sandbox", "source": "tool_call"},
        )
    )

    payload = dispatch.as_trace_payload()
    assert payload["requested_execution_class"] == "sandbox"
    assert payload["effective_execution_class"] is None
    assert payload["executor_ref"] is None
    assert payload["sandbox_runner_kind"] == "native-tool"
    assert payload["blocked_reason"] is not None
    assert "no compatible sandbox backend is currently available" in str(
        payload["blocked_reason"]
    ).lower()
    assert "does not support execution class 'sandbox'" in str(payload["blocked_reason"])

    with pytest.raises(
        PluginInvocationError,
        match="No compatible sandbox backend is currently available",
    ):
        proxy.invoke(
            PluginCallRequest(
                tool_id="native.search",
                ecosystem="native",
                inputs={"query": "sevenflows"},
                trace_id="trace-native-backend-gap",
                execution={"class": "sandbox", "source": "tool_call"},
            )
        )

    assert invoked is False


def test_plugin_call_proxy_fail_closes_default_strong_isolation_for_native_tool() -> None:
    registry = PluginRegistry()
    invoked = False

    def invoker(request: PluginCallRequest) -> dict[str, object]:
        nonlocal invoked
        invoked = True
        return {"documents": ["doc-1"], "execution": request.execution}

    registry.register_tool(
        PluginToolDefinition(
            id="native.risk-search",
            name="Native Risk Search",
            supported_execution_classes=("inline", "sandbox"),
            default_execution_class="sandbox",
        ),
        invoker=invoker,
    )

    proxy = PluginCallProxy(
        registry,
        sandbox_backend_client=_sandbox_backend_client(
            execution_classes=("sandbox",),
        ),
    )

    dispatch = proxy.describe_execution_dispatch(
        PluginCallRequest(
            tool_id="native.risk-search",
            ecosystem="native",
            inputs={"query": "sevenflows"},
            trace_id="trace-native-default-sandbox",
        )
    )

    assert dispatch.as_trace_payload() == {
        "requested_execution_class": "sandbox",
        "effective_execution_class": None,
        "execution_source": "tool_default",
        "requested_execution_profile": None,
        "requested_execution_timeout_ms": None,
        "requested_network_policy": None,
        "requested_filesystem_policy": None,
        "requested_dependency_mode": None,
        "requested_builtin_package_set": None,
        "requested_dependency_ref": None,
        "requested_backend_extensions": None,
        "executor_ref": None,
        "sandbox_backend_id": "sandbox-default",
        "sandbox_backend_executor_ref": "sandbox-backend:sandbox-default",
        "sandbox_runner_kind": "native-tool",
        "fallback_reason": None,
        "blocked_reason": (
            "Tool 'native.risk-search' requests execution class 'sandbox'. "
            "A compatible sandbox backend has already been selected "
            "(sandbox-default, sandbox-backend:sandbox-default), but that backend does not "
            "advertise sandbox-backed tool execution support. Strong-isolation tool paths "
            "must fail closed until a backend with sandbox tool runner support is available."
        ),
    }

    with pytest.raises(
        PluginInvocationError,
        match="does not advertise sandbox-backed tool execution support",
    ):
        proxy.invoke(
            PluginCallRequest(
                tool_id="native.risk-search",
                ecosystem="native",
                inputs={"query": "sevenflows"},
                trace_id="trace-native-default-sandbox",
            )
        )

    assert invoked is False


def test_plugin_call_proxy_surfaces_backend_readiness_for_compat_strong_isolation() -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="compat:dify:plugin:demo/search",
            name="Search",
            ecosystem="compat:dify",
            source="plugin",
            constrained_ir=_demo_search_constrained_ir(),
        )
    )
    registry.register_adapter(
        CompatibilityAdapterRegistration(
            id="dify-microvm",
            ecosystem="compat:dify",
            endpoint="http://adapter.local/dify",
            supported_execution_classes=("subprocess", "microvm"),
        )
    )

    def handler(_request: httpx.Request) -> httpx.Response:
        pytest.fail("compat adapter should not be invoked when sandbox backend is unavailable")

    proxy = PluginCallProxy(
        registry,
        client_factory=lambda timeout_ms: httpx.Client(
            transport=httpx.MockTransport(handler),
            timeout=timeout_ms / 1000,
        ),
        sandbox_backend_client=_sandbox_backend_client(execution_classes=("sandbox",)),
    )

    dispatch = proxy.describe_execution_dispatch(
        PluginCallRequest(
            tool_id="compat:dify:plugin:demo/search",
            ecosystem="compat:dify",
            inputs={"query": "sevenflows"},
            trace_id="trace-compat-backend-gap",
            execution={"class": "microvm", "source": "tool_call"},
        )
    )

    payload = dispatch.as_trace_payload()
    assert payload["requested_execution_class"] == "microvm"
    assert payload["effective_execution_class"] is None
    assert payload["executor_ref"] is None
    assert payload["sandbox_runner_kind"] == "compat-adapter"
    assert payload["blocked_reason"] is not None
    assert "no compatible sandbox backend is currently available" in str(
        payload["blocked_reason"]
    ).lower()
    assert "does not support execution class 'microvm'" in str(payload["blocked_reason"])

    with pytest.raises(
        PluginInvocationError,
        match="No compatible sandbox backend is currently available",
    ):
        proxy.invoke(
            PluginCallRequest(
                tool_id="compat:dify:plugin:demo/search",
                ecosystem="compat:dify",
                inputs={"query": "sevenflows"},
                trace_id="trace-compat-backend-gap",
                execution={"class": "microvm", "source": "tool_call"},
            )
        )


def test_plugin_call_proxy_fail_closes_supported_strong_isolation_for_compat_adapter() -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="compat:dify:plugin:demo/search",
            name="Search",
            ecosystem="compat:dify",
            source="plugin",
            constrained_ir=_demo_search_constrained_ir(),
        )
    )
    registry.register_adapter(
        CompatibilityAdapterRegistration(
            id="dify-microvm",
            ecosystem="compat:dify",
            endpoint="http://adapter.local/dify",
            supported_execution_classes=("subprocess", "microvm"),
        )
    )
    invoked = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal invoked
        invoked = True
        payload = json.loads(request.content.decode())
        assert payload["execution"] == {"class": "subprocess", "source": "default"}
        return httpx.Response(
            200,
            json={"status": "success", "output": {"documents": ["doc-1"]}, "durationMs": 9},
        )

    proxy = PluginCallProxy(
        registry,
        client_factory=lambda timeout_ms: httpx.Client(
            transport=httpx.MockTransport(handler),
            timeout=timeout_ms / 1000,
        ),
        sandbox_backend_client=_sandbox_backend_client(
            execution_classes=("microvm",),
            profiles=("compat-isolation",),
        ),
    )

    dispatch = proxy.describe_execution_dispatch(
        PluginCallRequest(
            tool_id="compat:dify:plugin:demo/search",
            ecosystem="compat:dify",
            inputs={"query": "sevenflows"},
            trace_id="trace-compat-execution",
            execution={
                "class": "microvm",
                "source": "tool_call",
                "profile": "compat-isolation",
                "timeoutMs": 4000,
                "networkPolicy": "isolated",
                "filesystemPolicy": "ephemeral",
            },
        )
    )

    assert dispatch.as_trace_payload() == {
        "requested_execution_class": "microvm",
        "effective_execution_class": None,
        "execution_source": "tool_call",
        "requested_execution_profile": "compat-isolation",
        "requested_execution_timeout_ms": 4000,
        "requested_network_policy": "isolated",
        "requested_filesystem_policy": "ephemeral",
        "requested_dependency_mode": None,
        "requested_builtin_package_set": None,
        "requested_dependency_ref": None,
        "requested_backend_extensions": None,
        "executor_ref": None,
        "sandbox_backend_id": "sandbox-default",
        "sandbox_backend_executor_ref": "sandbox-backend:sandbox-default",
        "sandbox_runner_kind": "compat-adapter",
        "fallback_reason": None,
        "blocked_reason": (
            "Tool 'compat:dify:plugin:demo/search' requests execution class 'microvm'. "
            "A compatible sandbox backend has already been selected "
            "(sandbox-default, sandbox-backend:sandbox-default), but that backend does not "
            "advertise sandbox-backed tool execution support. Strong-isolation tool paths "
            "must fail closed until a backend with sandbox tool runner support is available."
        ),
    }

    with pytest.raises(
        PluginInvocationError,
        match="does not advertise sandbox-backed tool execution support",
    ):
        proxy.invoke(
            PluginCallRequest(
                tool_id="compat:dify:plugin:demo/search",
                ecosystem="compat:dify",
                inputs={"query": "sevenflows"},
                trace_id="trace-compat-execution",
                execution={
                    "class": "microvm",
                    "source": "tool_call",
                    "profile": "compat-isolation",
                    "timeoutMs": 4000,
                    "networkPolicy": "isolated",
                    "filesystemPolicy": "ephemeral",
                },
            )
        )

    assert invoked is False

    response = proxy.invoke(
        PluginCallRequest(
            tool_id="compat:dify:plugin:demo/search",
            ecosystem="compat:dify",
            inputs={"query": "sevenflows"},
            trace_id="trace-compat-execution-default",
        )
    )

    assert response.status == "success"
    assert response.output == {"documents": ["doc-1"]}


def test_plugin_call_proxy_invokes_compat_adapter_via_sandbox_backend_when_supported() -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="compat:dify:plugin:demo/search-sandbox",
            name="Search Sandbox",
            ecosystem="compat:dify",
            source="plugin",
            constrained_ir=_demo_search_constrained_ir(),
        )
    )
    registry.register_adapter(
        CompatibilityAdapterRegistration(
            id="dify-microvm-sandbox",
            ecosystem="compat:dify",
            endpoint="http://adapter.local/dify-sandbox",
            supported_execution_classes=("subprocess", "microvm"),
        )
    )
    adapter_invoked = False

    def direct_handler(_request: httpx.Request) -> httpx.Response:
        nonlocal adapter_invoked
        adapter_invoked = True
        raise AssertionError(
            "direct adapter invoke should not be used for sandbox-backed execution"
        )

    def sandbox_handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "http://sandbox.local/execute"
        payload = json.loads(request.content.decode())
        assert payload["executionClass"] == "microvm"
        assert payload["command"] == ["sevenflows-tool-runner", "compat-adapter"]
        assert payload["traceId"] == "trace-compat-sandbox"
        assert payload["profile"] == "compat-isolation"
        assert payload["networkPolicy"] == "isolated"
        assert payload["filesystemPolicy"] == "ephemeral"
        assert payload["input"]["kind"] == "tool_execution"
        assert payload["input"]["toolId"] == "compat:dify:plugin:demo/search-sandbox"
        assert payload["input"]["ecosystem"] == "compat:dify"
        assert payload["input"]["adapter"] == {
            "id": "dify-microvm-sandbox",
            "endpoint": "http://adapter.local/dify-sandbox",
        }
        assert payload["input"]["inputs"] == {"query": "sevenflows"}
        assert payload["input"]["credentials"] == {}
        assert payload["input"]["timeout"] == 4000
        assert payload["input"]["traceId"] == "trace-compat-sandbox"
        assert payload["input"]["execution"] == {
            "class": "microvm",
            "source": "tool_call",
            "profile": "compat-isolation",
            "timeoutMs": 4000,
            "networkPolicy": "isolated",
            "filesystemPolicy": "ephemeral",
            "sandboxBackend": {
                "id": "sandbox-default",
                "executorRef": "sandbox-backend:sandbox-default",
            },
        }
        assert payload["input"]["executionContract"]["kind"] == "tool_execution"
        assert payload["input"]["executionContract"]["ecosystem"] == "compat:dify"
        assert payload["input"]["executionContract"]["inputContract"][0]["name"] == "query"
        return httpx.Response(
            200,
            json={
                "ok": True,
                "executorRef": "sandbox-backend:sandbox-default:tool-runner",
                "effectiveExecutionClass": "microvm",
                "result": {
                    "status": "success",
                    "output": {"documents": ["doc-1"]},
                    "logs": ["sandbox tool runner invoked"],
                    "durationMs": 17,
                    "requestMeta": {
                        "traceId": payload["input"]["traceId"],
                        "execution": payload["input"]["execution"],
                        "executionContract": payload["input"]["executionContract"],
                    },
                },
            },
        )

    proxy = PluginCallProxy(
        registry,
        client_factory=lambda timeout_ms: httpx.Client(
            transport=httpx.MockTransport(direct_handler),
            timeout=timeout_ms / 1000,
        ),
        sandbox_backend_client=_sandbox_backend_client(
            execution_classes=("microvm",),
            profiles=("compat-isolation",),
            supports_tool_execution=True,
            client_factory=lambda timeout_ms: httpx.Client(
                transport=httpx.MockTransport(sandbox_handler),
                timeout=timeout_ms / 1000,
            ),
        ),
    )

    dispatch = proxy.describe_execution_dispatch(
        PluginCallRequest(
            tool_id="compat:dify:plugin:demo/search-sandbox",
            ecosystem="compat:dify",
            inputs={"query": "sevenflows"},
            trace_id="trace-compat-sandbox",
            execution={
                "class": "microvm",
                "source": "tool_call",
                "profile": "compat-isolation",
                "timeoutMs": 4000,
                "networkPolicy": "isolated",
                "filesystemPolicy": "ephemeral",
            },
        )
    )
    assert dispatch.blocked_reason is None

    response = proxy.invoke(
        PluginCallRequest(
            tool_id="compat:dify:plugin:demo/search-sandbox",
            ecosystem="compat:dify",
            inputs={"query": "sevenflows"},
            trace_id="trace-compat-sandbox",
            execution={
                "class": "microvm",
                "source": "tool_call",
                "profile": "compat-isolation",
                "timeoutMs": 4000,
                "networkPolicy": "isolated",
                "filesystemPolicy": "ephemeral",
            },
        )
    )

    assert adapter_invoked is False
    assert response.status == "success"
    assert response.output == {"documents": ["doc-1"]}
    assert response.logs == ["sandbox tool runner invoked"]
    assert response.meta["request_meta"] == {
        "trace_id": "trace-compat-sandbox",
        "execution": {
            "class": "microvm",
            "source": "tool_call",
            "profile": "compat-isolation",
            "timeoutMs": 4000,
            "networkPolicy": "isolated",
            "filesystemPolicy": "ephemeral",
            "sandboxBackend": {
                "id": "sandbox-default",
                "executorRef": "sandbox-backend:sandbox-default",
            },
        },
        "execution_contract": {
            "irVersion": "2026-03-10",
            "kind": "tool_execution",
            "ecosystem": "compat:dify",
            "toolId": "compat:dify:plugin:demo/search",
            "inputContract": [
                {
                    "name": "query",
                    "required": True,
                    "valueSource": "llm",
                    "jsonSchema": {"type": "string"},
                },
                {
                    "name": "limit",
                    "required": False,
                    "valueSource": "user",
                    "jsonSchema": {"type": "number"},
                },
            ],
            "constraints": {
                "additionalProperties": False,
                "credentialFields": [],
                "fileFields": [],
                "llmFillableFields": ["query"],
                "userConfigFields": ["limit"],
            },
            "pluginMeta": {"origin": "dify"},
        },
    }


def test_tool_gateway_merges_compat_adapter_request_meta_into_execution_trace() -> None:
    merged = ToolGateway._merge_execution_trace_with_response_meta(
        {
            "requested_execution_class": "microvm",
            "effective_execution_class": "microvm",
            "execution_source": "tool_call",
            "executor_ref": "tool:compat-adapter:dify-default",
        },
        {
            "request_meta": {
                "trace_id": "trace-compat-runtime",
                "execution": {
                    "class": "microvm",
                    "source": "tool_call",
                    "profile": "compat-isolation",
                    "timeoutMs": 4000,
                },
                "execution_contract": {
                    "kind": "tool_execution",
                    "toolId": "compat:dify:plugin:demo/search-runtime",
                },
            }
        },
    )

    assert merged["adapter_request_trace_id"] == "trace-compat-runtime"
    assert merged["adapter_request_execution"] == {
        "class": "microvm",
        "source": "tool_call",
        "profile": "compat-isolation",
        "timeoutMs": 4000,
    }
    assert merged["adapter_request_execution_class"] == "microvm"
    assert merged["adapter_request_execution_source"] == "tool_call"
    assert merged["adapter_request_execution_contract"] == {
        "kind": "tool_execution",
        "toolId": "compat:dify:plugin:demo/search-runtime",
    }


def test_plugin_call_proxy_rejects_unsupported_contract_fields() -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="compat:dify:plugin:demo/search",
            name="Search",
            ecosystem="compat:dify",
            source="plugin",
            constrained_ir=_demo_search_constrained_ir(),
        )
    )
    registry.register_adapter(
        CompatibilityAdapterRegistration(
            id="dify-default",
            ecosystem="compat:dify",
            endpoint="http://adapter.local/dify",
        )
    )
    proxy = PluginCallProxy(registry)

    try:
        proxy.invoke(
            PluginCallRequest(
                tool_id="compat:dify:plugin:demo/search",
                ecosystem="compat:dify",
                inputs={"query": "sevenflows", "unexpected": True},
                trace_id="trace-compat",
            )
        )
    except Exception as exc:
        assert "unsupported input fields: unexpected" in str(exc)
    else:
        raise AssertionError("Expected unsupported input fields to be rejected.")


def test_plugin_call_proxy_rejects_credential_field_in_inputs() -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="compat:dify:plugin:demo/secret-search",
            name="Secret Search",
            ecosystem="compat:dify",
            source="plugin",
            constrained_ir=_credential_bound_constrained_ir(),
        )
    )
    registry.register_adapter(
        CompatibilityAdapterRegistration(
            id="dify-default",
            ecosystem="compat:dify",
            endpoint="http://adapter.local/dify",
        )
    )
    proxy = PluginCallProxy(registry)

    try:
        proxy.invoke(
            PluginCallRequest(
                tool_id="compat:dify:plugin:demo/secret-search",
                ecosystem="compat:dify",
                inputs={"query": "sevenflows", "api_key": "secret"},
                trace_id="trace-compat",
            )
        )
    except Exception as exc:
        assert "via credentials, not inputs" in str(exc)
    else:
        raise AssertionError("Expected credential field routing to be enforced.")


def test_plugin_call_proxy_rejects_input_field_in_credentials() -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="compat:dify:plugin:demo/secret-search",
            name="Secret Search",
            ecosystem="compat:dify",
            source="plugin",
            constrained_ir=_credential_bound_constrained_ir(),
        )
    )
    registry.register_adapter(
        CompatibilityAdapterRegistration(
            id="dify-default",
            ecosystem="compat:dify",
            endpoint="http://adapter.local/dify",
        )
    )
    proxy = PluginCallProxy(registry)

    try:
        proxy.invoke(
            PluginCallRequest(
                tool_id="compat:dify:plugin:demo/secret-search",
                ecosystem="compat:dify",
                inputs={"query": "sevenflows"},
                credentials={"query": "wrong-place", "api_key": "secret"},
                trace_id="trace-compat",
            )
        )
    except Exception as exc:
        assert "via inputs, not credentials" in str(exc)
    else:
        raise AssertionError("Expected input field routing to be enforced.")


def test_runtime_service_executes_registered_native_tool(
    sqlite_session: Session,
) -> None:
    workflow = Workflow(
        id="wf-plugin-tool",
        name="Plugin Tool Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "search",
                    "type": "toolNode",
                    "name": "Search",
                    "config": {
                        "tool": {
                            "toolId": "native.search",
                        }
                    },
                },
                {"id": "endNode", "type": "endNode", "name": "endNode", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "search"},
                {"id": "e2", "sourceNodeId": "search", "targetNodeId": "endNode"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(id="native.search", name="Search"),
        invoker=lambda request: {
            "received": request.inputs,
            "summary": f"search:{request.inputs['startNode']['topic']}",
        },
    )
    runtime = RuntimeService(plugin_call_proxy=PluginCallProxy(registry))

    artifacts = runtime.execute_workflow(sqlite_session, workflow, {"topic": "plugin"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {
        "search": {
            "received": {"startNode": {"topic": "plugin"}},
            "summary": "search:plugin",
        }
    }


def test_adapter_health_checker_reports_up() -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json={"status": "ok"})
    )
    checker = CompatibilityAdapterHealthChecker(
        client_factory=lambda timeout_ms: httpx.Client(
            transport=transport,
            timeout=timeout_ms / 1000,
        )
    )

    health = checker.probe(
        CompatibilityAdapterRegistration(
            id="dify-default",
            ecosystem="compat:dify",
            endpoint="http://adapter.local",
        )
    )

    assert health == CompatibilityAdapterHealth(
        id="dify-default",
        ecosystem="compat:dify",
        endpoint="http://adapter.local",
        enabled=True,
        status="up",
        detail=None,
    )


def test_adapter_catalog_client_fetches_tools() -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json={
                "adapter_id": "dify-default",
                "ecosystem": "compat:dify",
                "tools": [
                    {
                        "id": "compat:dify:plugin:demo/search",
                        "name": "Demo Search",
                        "ecosystem": "compat:dify",
                        "description": "Search via Dify adapter",
                        "input_schema": {"type": "object"},
                        "output_schema": {"type": "object"},
                        "source": "plugin",
                        "plugin_meta": {"origin": "dify"},
                        "supported_execution_classes": ["subprocess", "microvm"],
                        "default_execution_class": "subprocess",
                        "constrained_ir": {
                            "ir_version": "2026-03-10",
                            "kind": "tool",
                            "ecosystem": "compat:dify",
                            "tool_id": "compat:dify:plugin:demo/search",
                            "name": "Demo Search",
                            "description": "Search via Dify adapter",
                            "input_schema": {"type": "object"},
                            "output_schema": {"type": "object"},
                            "source": "plugin",
                            "input_contract": [],
                            "constraints": {
                                "additional_properties": False,
                                "credential_fields": [],
                                "file_fields": [],
                                "llm_fillable_fields": [],
                                "user_config_fields": [],
                            },
                            "plugin_meta": {"origin": "dify"},
                        },
                    }
                ],
            },
        )
    )
    client = CompatibilityAdapterCatalogClient(
        client_factory=lambda timeout_ms: httpx.Client(
            transport=transport,
            timeout=timeout_ms / 1000,
        )
    )

    tools = client.fetch_tools(
        CompatibilityAdapterRegistration(
            id="dify-default",
            ecosystem="compat:dify",
            endpoint="http://adapter.local",
        )
    )

    assert tools == [
        PluginToolDefinition(
            id="compat:dify:plugin:demo/search",
            name="Demo Search",
            ecosystem="compat:dify",
            description="Search via Dify adapter",
            input_schema={"type": "object"},
            output_schema={"type": "object"},
            source="plugin",
            plugin_meta={"origin": "dify"},
            supported_execution_classes=("subprocess", "microvm"),
            default_execution_class="subprocess",
            constrained_ir={
                "ir_version": "2026-03-10",
                "kind": "tool",
                "ecosystem": "compat:dify",
                "tool_id": "compat:dify:plugin:demo/search",
                "name": "Demo Search",
                "description": "Search via Dify adapter",
                "input_schema": {"type": "object"},
                "output_schema": {"type": "object"},
                "source": "plugin",
                "input_contract": [],
                "constraints": {
                    "additional_properties": False,
                    "credential_fields": [],
                    "file_fields": [],
                    "llm_fillable_fields": [],
                    "user_config_fields": [],
                },
                "plugin_meta": {"origin": "dify"},
            },
        )
    ]


def test_adapter_catalog_client_rejects_wrong_tool_ecosystem() -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json={
                "tools": [
                    {
                        "id": "compat:dify:plugin:demo/search",
                        "name": "Demo Search",
                        "ecosystem": "compat:n8n",
                        "constrained_ir": {
                            "kind": "tool",
                            "ecosystem": "compat:n8n",
                            "tool_id": "compat:dify:plugin:demo/search",
                            "name": "Demo Search",
                            "input_schema": {"type": "object"},
                            "constraints": {"additional_properties": False},
                        },
                    }
                ]
            },
        )
    )
    client = CompatibilityAdapterCatalogClient(
        client_factory=lambda timeout_ms: httpx.Client(
            transport=transport,
            timeout=timeout_ms / 1000,
        )
    )

    try:
        client.fetch_tools(
            CompatibilityAdapterRegistration(
                id="dify-default",
                ecosystem="compat:dify",
                endpoint="http://adapter.local",
            )
        )
    except PluginCatalogError as exc:
        assert "expected 'compat:dify'" in str(exc)
    else:
        raise AssertionError("Expected PluginCatalogError for mismatched ecosystem.")


def test_adapter_catalog_client_requires_constrained_ir() -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json={
                "tools": [
                    {
                        "id": "compat:dify:plugin:demo/search",
                        "name": "Demo Search",
                        "ecosystem": "compat:dify",
                    }
                ]
            },
        )
    )
    client = CompatibilityAdapterCatalogClient(
        client_factory=lambda timeout_ms: httpx.Client(
            transport=transport,
            timeout=timeout_ms / 1000,
        )
    )

    try:
        client.fetch_tools(
            CompatibilityAdapterRegistration(
                id="dify-default",
                ecosystem="compat:dify",
                endpoint="http://adapter.local",
            )
        )
    except PluginCatalogError as exc:
        assert "without constrained_ir" in str(exc)
    else:
        raise AssertionError("Expected PluginCatalogError when constrained_ir is missing.")


def test_adapter_health_checker_reports_down() -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(503, text="offline"))
    checker = CompatibilityAdapterHealthChecker(
        client_factory=lambda timeout_ms: httpx.Client(
            transport=transport,
            timeout=timeout_ms / 1000,
        )
    )

    health = checker.probe(
        CompatibilityAdapterRegistration(
            id="dify-default",
            ecosystem="compat:dify",
            endpoint="http://adapter.local",
        )
    )

    assert health.id == "dify-default"
    assert health.status == "down"
    assert health.enabled is True
    assert health.detail is not None
