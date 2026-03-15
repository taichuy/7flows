import json

import httpx
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
    PluginRegistry,
    PluginToolDefinition,
)
from app.services.runtime import RuntimeService


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
        assert payload["execution"] == {}
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
            },
        )

    proxy = PluginCallProxy(
        registry,
        client_factory=lambda timeout_ms: httpx.Client(
            transport=httpx.MockTransport(handler),
            timeout=timeout_ms / 1000,
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


def test_plugin_call_proxy_forwards_execution_payload_to_compat_adapter() -> None:
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
        payload = json.loads(request.content.decode())
        assert payload["execution"] == {
            "class": "microvm",
            "source": "tool_call",
            "profile": "compat-isolation",
            "timeoutMs": 4000,
            "networkPolicy": "isolated",
            "filesystemPolicy": "ephemeral",
        }
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

    response = proxy.invoke(
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

    assert response.status == "success"
    assert response.output == {"documents": ["doc-1"]}
    assert response.duration_ms == 9


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
                {"id": "trigger", "type": "trigger", "name": "Trigger", "config": {}},
                {
                    "id": "search",
                    "type": "tool",
                    "name": "Search",
                    "config": {
                        "tool": {
                            "toolId": "native.search",
                        }
                    },
                },
                {"id": "output", "type": "output", "name": "Output", "config": {}},
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "trigger", "targetNodeId": "search"},
                {"id": "e2", "sourceNodeId": "search", "targetNodeId": "output"},
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
            "summary": f"search:{request.inputs['trigger']['topic']}",
        },
    )
    runtime = RuntimeService(plugin_call_proxy=PluginCallProxy(registry))

    artifacts = runtime.execute_workflow(sqlite_session, workflow, {"topic": "plugin"})

    assert artifacts.run.status == "succeeded"
    assert artifacts.run.output_payload == {
        "search": {
            "received": {"trigger": {"topic": "plugin"}},
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
