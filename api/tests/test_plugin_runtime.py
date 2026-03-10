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
