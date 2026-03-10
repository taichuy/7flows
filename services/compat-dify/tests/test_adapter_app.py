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
