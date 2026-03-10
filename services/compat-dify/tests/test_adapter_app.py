from fastapi.testclient import TestClient

from app.main import create_app


def test_healthz_reports_stub_identity() -> None:
    client = TestClient(create_app())

    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "adapter_id": "dify-default",
        "ecosystem": "compat:dify",
        "mode": "echo",
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
        },
    }


def test_tools_rejects_wrong_adapter_header() -> None:
    client = TestClient(create_app())

    response = client.get("/tools", headers={"x-sevenflows-adapter-id": "wrong-adapter"})

    assert response.status_code == 422
    assert "Header adapter id mismatch" in response.json()["detail"]


def test_invoke_returns_stubbed_output() -> None:
    client = TestClient(create_app())

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
    }
    assert body["logs"][0] == "compat:dify stub handled tool 'compat:dify:plugin:demo/search'"


def test_invoke_rejects_wrong_ecosystem() -> None:
    client = TestClient(create_app())

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
        },
    )

    assert response.status_code == 422
    assert "Adapter only supports ecosystem 'compat:dify'" in response.json()["detail"]
