import json

import httpx
from sqlalchemy.orm import Session

from app.models.workflow import Workflow
from app.services.plugin_runtime import (
    CompatibilityAdapterRegistration,
    PluginCallProxy,
    PluginCallRequest,
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
