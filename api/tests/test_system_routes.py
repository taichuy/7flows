from types import SimpleNamespace

from app.api.routes import system as system_routes
from app.services.plugin_runtime import CompatibilityAdapterHealth, PluginRegistry


class _HealthyRedis:
    def ping(self) -> bool:
        return True


class _HealthyS3Client:
    def list_buckets(self) -> dict:
        return {"Buckets": []}


class _StaticHealthChecker:
    def __init__(self, healths: list[CompatibilityAdapterHealth]) -> None:
        self._healths = healths

    def probe_all(self, registry: PluginRegistry) -> list[CompatibilityAdapterHealth]:
        return self._healths


def test_system_overview_includes_plugin_adapter_health(client, monkeypatch) -> None:
    monkeypatch.setattr(system_routes, "get_settings", lambda: SimpleNamespace(
        env="test",
        redis_url="redis://example",
        s3_endpoint="http://example",
        s3_access_key="key",
        s3_secret_key="secret",
        s3_region="us-east-1",
        s3_use_ssl=False,
    ))
    monkeypatch.setattr(system_routes, "check_database", lambda: True)
    monkeypatch.setattr(system_routes.redis, "from_url", lambda url: _HealthyRedis())
    monkeypatch.setattr(system_routes.boto3, "client", lambda *args, **kwargs: _HealthyS3Client())
    monkeypatch.setattr(system_routes, "get_plugin_registry", lambda: PluginRegistry())
    monkeypatch.setattr(
        system_routes,
        "get_compatibility_adapter_health_checker",
        lambda: _StaticHealthChecker(
            [
                CompatibilityAdapterHealth(
                    id="dify-default",
                    ecosystem="compat:dify",
                    endpoint="http://adapter.local",
                    enabled=True,
                    status="up",
                )
            ]
        ),
    )

    response = client.get("/api/system/overview")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "plugin-call-proxy-foundation" in body["capabilities"]
    assert "plugin-adapter-health-probe" in body["capabilities"]
    assert body["plugin_adapters"] == [
        {
            "id": "dify-default",
            "ecosystem": "compat:dify",
            "endpoint": "http://adapter.local",
            "enabled": True,
            "status": "up",
            "detail": None,
        }
    ]
    assert any(service["name"] == "plugin-adapter:dify-default" for service in body["services"])


def test_list_plugin_adapters_returns_current_adapter_health(client, monkeypatch) -> None:
    monkeypatch.setattr(system_routes, "get_plugin_registry", lambda: PluginRegistry())
    monkeypatch.setattr(
        system_routes,
        "get_compatibility_adapter_health_checker",
        lambda: _StaticHealthChecker(
            [
                CompatibilityAdapterHealth(
                    id="dify-default",
                    ecosystem="compat:dify",
                    endpoint="http://adapter.local",
                    enabled=True,
                    status="down",
                    detail="connect timeout",
                )
            ]
        ),
    )

    response = client.get("/api/system/plugin-adapters")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "dify-default",
            "ecosystem": "compat:dify",
            "endpoint": "http://adapter.local",
            "enabled": True,
            "status": "down",
            "detail": "connect timeout",
        }
    ]
