import json

import httpx

from app.catalog import get_catalog_tool
from app.config import Settings
from app.dify_daemon import DifyPluginDaemonClient


def test_translate_invoke_request_uses_dify_dispatch_shape() -> None:
    settings = Settings(
        plugin_daemon_url="http://dify-daemon.local",
        plugin_daemon_api_key="daemon-secret",
    )
    tool = get_catalog_tool(settings, "compat:dify:plugin:demo/search")
    assert tool is not None
    client = DifyPluginDaemonClient(settings)

    translated = client.translate_invoke_request(
        tool=tool,
        inputs={"query": "sevenflows"},
        credentials={},
        trace_id="trace-search",
        timeout_ms=12_000,
    )

    assert translated == {
        "path": "plugin/sevenflows-local/dispatch/tool/invoke",
        "headers": {
            "X-Plugin-ID": "demo",
            "Content-Type": "application/json",
        },
        "body": {
            "user_id": "sevenflows-adapter",
            "conversation_id": None,
            "app_id": None,
            "message_id": "trace-search",
            "data": {
                "provider": "demo",
                "tool": "search",
                "credentials": {},
                "credential_type": "unauthorized",
                "tool_parameters": {"query": "sevenflows"},
            },
        },
        "timeoutMs": 12000,
    }


def test_translate_invoke_request_converts_file_parameters() -> None:
    settings = Settings(
        plugin_daemon_url="http://dify-daemon.local",
        plugin_daemon_api_key="daemon-secret",
    )
    tool = get_catalog_tool(settings, "compat:dify:plugin:demo/summarize")
    assert tool is not None
    client = DifyPluginDaemonClient(settings)

    translated = client.translate_invoke_request(
        tool=tool,
        inputs={
            "content_uri": "https://example.com/files/report.pdf",
            "style": "brief",
        },
        credentials={},
        trace_id="trace-file",
        timeout_ms=30_000,
    )

    assert translated["body"]["data"]["tool_parameters"] == {
        "content_uri": {
            "dify_model_identity": "__dify__file__",
            "mime_type": "application/pdf",
            "filename": "report.pdf",
            "extension": ".pdf",
            "size": -1,
            "type": "document",
            "url": "https://example.com/files/report.pdf",
        },
        "style": "brief",
    }


def test_invoke_tool_proxies_and_aggregates_dify_stream() -> None:
    settings = Settings(
        plugin_daemon_url="http://dify-daemon.local",
        plugin_daemon_api_key="daemon-secret",
    )
    tool = get_catalog_tool(settings, "compat:dify:plugin:demo/search")
    assert tool is not None

    response_lines = [
        {
            "code": 0,
            "message": "ok",
            "data": {
                "type": "text",
                "message": {"text": "hello "},
                "meta": {},
            },
        },
        {
            "code": 0,
            "message": "ok",
            "data": {
                "type": "text",
                "message": {"text": "world"},
                "meta": {},
            },
        },
        {
            "code": 0,
            "message": "ok",
            "data": {
                "type": "json",
                "message": {"json_object": {"documents": ["doc-1"]}},
                "meta": {},
            },
        },
        {
            "code": 0,
            "message": "ok",
            "data": {
                "type": "variable",
                "message": {
                    "variable_name": "answer",
                    "variable_value": "ok",
                    "stream": False,
                },
                "meta": {},
            },
        },
        {
            "code": 0,
            "message": "ok",
            "data": {
                "type": "log",
                "message": {
                    "id": "log-1",
                    "label": "search",
                    "status": "success",
                    "error": None,
                    "data": {},
                    "metadata": {},
                },
                "meta": {},
            },
        },
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "http://dify-daemon.local/plugin/sevenflows-local/dispatch/tool/invoke"
        assert request.headers["X-Api-Key"] == "daemon-secret"
        assert request.headers["X-Plugin-ID"] == "demo"
        payload = json.loads(request.content.decode())
        assert payload["data"]["provider"] == "demo"
        assert payload["data"]["tool"] == "search"
        assert payload["data"]["tool_parameters"] == {"query": "sevenflows"}
        content = "\n".join(f"data: {json.dumps(item)}" for item in response_lines)
        return httpx.Response(200, text=content)

    client = DifyPluginDaemonClient(
        settings,
        client_factory=lambda timeout_ms: httpx.Client(
            transport=httpx.MockTransport(handler),
            timeout=timeout_ms / 1000,
        ),
    )

    output, logs = client.invoke_tool(
        tool=tool,
        inputs={"query": "sevenflows"},
        credentials={},
        trace_id="trace-proxy",
        timeout_ms=15_000,
    )

    assert output["text"] == "hello world"
    assert output["json"] == {"documents": ["doc-1"]}
    assert output["variables"] == {"answer": "ok"}
    assert len(output["messages"]) == 4
    assert output["logs"] == [
        {
            "id": "log-1",
            "label": "search",
            "status": "success",
            "error": None,
            "data": {},
            "metadata": {},
        }
    ]
    assert logs == ["search[success]"]
