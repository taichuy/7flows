from fastapi.testclient import TestClient

from app.catalog import build_execution_contract, get_catalog_tool
from app.config import Settings, get_settings
from app.main import create_app


def test_healthz_reports_stub_identity() -> None:
    client = TestClient(create_app())

    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "adapter_id": "dify-default",
        "ecosystem": "compat:dify",
        "mode": "translate",
    }


def test_tools_lists_translated_catalog() -> None:
    client = TestClient(create_app())

    response = client.get("/tools", headers={"x-sevenflows-adapter-id": "dify-default"})

    assert response.status_code == 200
    body = response.json()
    assert body["adapter_id"] == "dify-default"
    assert body["ecosystem"] == "compat:dify"
    assert len(body["tools"]) == 2
    assert body["tools"][0]["id"] == "compat:dify:plugin:demo/search"
    assert body["tools"][0]["input_schema"] == {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "title": "Query",
                "description": "Search query",
                "x-dify-form": "llm",
            },
            "limit": {
                "type": "number",
                "title": "Limit",
                "description": "Maximum number of results",
                "default": 5,
                "x-dify-form": "form",
            },
        },
        "additionalProperties": False,
        "required": ["query"],
    }
    assert body["tools"][0]["constrained_ir"] == {
        "ir_version": "2026-03-10",
        "kind": "tool",
        "ecosystem": "compat:dify",
        "tool_id": "compat:dify:plugin:demo/search",
        "name": "Demo Search",
        "description": "Search the demo corpus.",
        "source": "plugin",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "title": "Query",
                    "description": "Search query",
                    "x-dify-form": "llm",
                },
                "limit": {
                    "type": "number",
                    "title": "Limit",
                    "description": "Maximum number of results",
                    "default": 5,
                    "x-dify-form": "form",
                },
            },
            "additionalProperties": False,
            "required": ["query"],
        },
        "output_schema": None,
        "input_contract": [
            {
                "name": "query",
                "required": True,
                "value_source": "llm",
                "json_schema": {
                    "type": "string",
                    "title": "Query",
                    "description": "Search query",
                    "x-dify-form": "llm",
                },
            },
            {
                "name": "limit",
                "required": False,
                "value_source": "user",
                "json_schema": {
                    "type": "number",
                    "title": "Limit",
                    "description": "Maximum number of results",
                    "default": 5,
                    "x-dify-form": "form",
                },
            },
        ],
        "constraints": {
            "additional_properties": False,
            "credential_fields": [],
            "file_fields": [],
            "llm_fillable_fields": ["query"],
            "user_config_fields": ["limit"],
        },
        "plugin_meta": {
            "origin": "dify",
            "ecosystem": "compat:dify",
            "manifest_version": "0.1.0",
            "author": "demo",
            "icon": "search.svg",
            "manifest_path": "E:\\code\\taichuCode\\7flows\\services\\compat-dify\\catalog\\demo\\manifest.yaml",
            "tool_path": "E:\\code\\taichuCode\\7flows\\services\\compat-dify\\catalog\\demo\\tools\\search.yaml",
            "dify_runtime": {
                "plugin_id": "demo",
                "provider": "demo",
                "tool_name": "search",
            },
        },
    }


def test_tools_rejects_wrong_adapter_header() -> None:
    client = TestClient(create_app())

    response = client.get("/tools", headers={"x-sevenflows-adapter-id": "wrong-adapter"})

    assert response.status_code == 422
    assert "Header adapter id mismatch" in response.json()["detail"]


def test_invoke_returns_translated_payload_preview() -> None:
    client = TestClient(create_app())
    tool = get_catalog_tool(get_settings(), "compat:dify:plugin:demo/search")
    assert tool is not None

    response = client.post(
        "/invoke",
        headers={"x-sevenflows-adapter-id": "dify-default"},
        json={
            "toolId": "compat:dify:plugin:demo/search",
            "ecosystem": "compat:dify",
            "adapterId": "dify-default",
            "inputs": {"query": "sevenflows"},
            "credentials": {},
            "timeout": 30000,
            "traceId": "trace-demo",
            "executionContract": build_execution_contract(tool).model_dump(),
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert body["output"] == {
        "toolId": "compat:dify:plugin:demo/search",
        "adapterId": "dify-default",
        "traceId": "trace-demo",
        "received": {"query": "sevenflows"},
        "credentialFields": [],
        "executionContract": {
            "kind": "tool_execution",
            "irVersion": "2026-03-10",
            "toolId": "compat:dify:plugin:demo/search",
        },
        "translatedRequest": {
            "path": "plugin/sevenflows-local/dispatch/tool/invoke",
            "headers": {
                "X-Plugin-ID": "demo",
                "Content-Type": "application/json",
            },
            "body": {
                "user_id": "sevenflows-adapter",
                "conversation_id": None,
                "app_id": None,
                "message_id": "trace-demo",
                "data": {
                    "provider": "demo",
                    "tool": "search",
                    "credentials": {},
                    "credential_type": "unauthorized",
                    "tool_parameters": {"query": "sevenflows"},
                },
            },
            "timeoutMs": 30000,
        },
    }
    assert (
        body["logs"][0]
        == "compat:dify translated tool 'compat:dify:plugin:demo/search' into Dify invoke payload"
    )
    assert body["logs"][1] == "mode=translate"


def test_invoke_rejects_wrong_ecosystem() -> None:
    client = TestClient(create_app())
    tool = get_catalog_tool(get_settings(), "compat:dify:plugin:demo/search")
    assert tool is not None

    response = client.post(
        "/invoke",
        json={
            "toolId": "compat:dify:plugin:demo/search",
            "ecosystem": "compat:n8n",
            "adapterId": "dify-default",
            "inputs": {},
            "credentials": {},
            "timeout": 30000,
            "traceId": "",
            "executionContract": build_execution_contract(tool).model_dump(),
        },
    )

    assert response.status_code == 422
    assert "Adapter only supports ecosystem 'compat:dify'" in response.json()["detail"]


def test_invoke_rejects_contract_mismatch() -> None:
    client = TestClient(create_app())
    tool = get_catalog_tool(get_settings(), "compat:dify:plugin:demo/search")
    assert tool is not None
    contract = build_execution_contract(tool).model_dump()
    contract["inputContract"][0]["valueSource"] = "user"

    response = client.post(
        "/invoke",
        headers={"x-sevenflows-adapter-id": "dify-default"},
        json={
            "toolId": "compat:dify:plugin:demo/search",
            "ecosystem": "compat:dify",
            "adapterId": "dify-default",
            "inputs": {"query": "sevenflows"},
            "credentials": {},
            "timeout": 30000,
            "traceId": "trace-demo",
            "executionContract": contract,
        },
    )

    assert response.status_code == 422
    assert "does not match the local catalog" in response.json()["detail"]


def test_invoke_rejects_unknown_input_fields() -> None:
    client = TestClient(create_app())
    tool = get_catalog_tool(get_settings(), "compat:dify:plugin:demo/search")
    assert tool is not None

    response = client.post(
        "/invoke",
        headers={"x-sevenflows-adapter-id": "dify-default"},
        json={
            "toolId": "compat:dify:plugin:demo/search",
            "ecosystem": "compat:dify",
            "adapterId": "dify-default",
            "inputs": {"query": "sevenflows", "unexpected": True},
            "credentials": {},
            "timeout": 30000,
            "traceId": "trace-demo",
            "executionContract": build_execution_contract(tool).model_dump(),
        },
    )

    assert response.status_code == 422
    assert "unsupported input fields: unexpected" in response.json()["detail"]


def test_invoke_rejects_unknown_credential_fields() -> None:
    client = TestClient(create_app())
    tool = get_catalog_tool(get_settings(), "compat:dify:plugin:demo/search")
    assert tool is not None

    response = client.post(
        "/invoke",
        headers={"x-sevenflows-adapter-id": "dify-default"},
        json={
            "toolId": "compat:dify:plugin:demo/search",
            "ecosystem": "compat:dify",
            "adapterId": "dify-default",
            "inputs": {"query": "sevenflows"},
            "credentials": {"api_key": "secret"},
            "timeout": 30000,
            "traceId": "trace-demo",
            "executionContract": build_execution_contract(tool).model_dump(),
        },
    )

    assert response.status_code == 422
    assert "unsupported credential fields: api_key" in response.json()["detail"]


def test_invoke_translates_file_parameters_for_dify_payload() -> None:
    client = TestClient(create_app())
    tool = get_catalog_tool(get_settings(), "compat:dify:plugin:demo/summarize")
    assert tool is not None

    response = client.post(
        "/invoke",
        headers={"x-sevenflows-adapter-id": "dify-default"},
        json={
            "toolId": "compat:dify:plugin:demo/summarize",
            "ecosystem": "compat:dify",
            "adapterId": "dify-default",
            "inputs": {
                "content_uri": "https://example.com/files/report.pdf",
                "style": "brief",
            },
            "credentials": {},
            "timeout": 30000,
            "traceId": "trace-file",
            "executionContract": build_execution_contract(tool).model_dump(),
        },
    )

    assert response.status_code == 200
    translated = response.json()["output"]["translatedRequest"]
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


def test_invoke_proxies_translated_payload_to_dify_daemon(monkeypatch) -> None:
    from app import main as main_module

    settings = Settings(
        invoke_mode="proxy",
        plugin_daemon_url="http://dify-daemon.local",
        plugin_daemon_api_key="daemon-secret",
    )
    tool = get_catalog_tool(settings, "compat:dify:plugin:demo/search")
    assert tool is not None

    class _FakeDaemonClient:
        def translate_invoke_request_preview(self, **kwargs):
            return {
                "path": "plugin/sevenflows-local/dispatch/tool/invoke",
                "headers": {
                    "X-Plugin-ID": "demo",
                    "Content-Type": "application/json",
                },
                "body": {
                    "user_id": "sevenflows-adapter",
                    "conversation_id": None,
                    "app_id": None,
                    "message_id": "trace-proxy",
                    "data": {
                        "provider": "demo",
                        "tool": "search",
                        "credentials": {},
                        "credential_type": "unauthorized",
                        "tool_parameters": {"query": "sevenflows"},
                    },
                },
                "timeoutMs": 30000,
            }

        def invoke_tool(self, **kwargs):
            assert kwargs["tool"].id == "compat:dify:plugin:demo/search"
            assert kwargs["inputs"] == {"query": "sevenflows"}
            assert kwargs["credentials"] == {}
            assert kwargs["trace_id"] == "trace-proxy"
            return (
                {
                    "text": "result text",
                    "json": {"documents": ["doc-1"]},
                    "variables": {"answer": "ok"},
                },
                ["daemon.log[success]"],
            )

    monkeypatch.setattr(main_module, "get_settings", lambda: settings)
    monkeypatch.setattr(main_module, "get_dify_plugin_daemon_client", lambda: _FakeDaemonClient())
    client = TestClient(create_app())

    response = client.post(
        "/invoke",
        headers={"x-sevenflows-adapter-id": "dify-default"},
        json={
            "toolId": "compat:dify:plugin:demo/search",
            "ecosystem": "compat:dify",
            "adapterId": "dify-default",
            "inputs": {"query": "sevenflows"},
            "credentials": {},
            "timeout": 30000,
            "traceId": "trace-proxy",
            "executionContract": build_execution_contract(tool).model_dump(),
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert body["output"] == {
        "text": "result text",
        "json": {"documents": ["doc-1"]},
        "variables": {"answer": "ok"},
    }
    assert body["logs"] == [
        "compat:dify proxied tool 'compat:dify:plugin:demo/search' via translated Dify invoke payload",
        "daemon.log[success]",
    ]
    assert isinstance(body["durationMs"], int)
    assert body["durationMs"] >= 0
