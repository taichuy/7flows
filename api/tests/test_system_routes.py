from datetime import UTC, datetime
from types import SimpleNamespace

from app.api.routes import system as system_routes
from app.models.run import Run, RunEvent
from app.services.plugin_runtime import (
    CompatibilityAdapterHealth,
    PluginRegistry,
    PluginToolDefinition,
)
from app.services.sandbox_backends import (
    SandboxBackendCapability,
    SandboxBackendHealth,
    SandboxBackendRegistry,
)


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


class _StaticSandboxHealthChecker:
    def __init__(self, healths: list[SandboxBackendHealth]) -> None:
        self._healths = healths

    def probe_all(self, registry: SandboxBackendRegistry) -> list[SandboxBackendHealth]:
        return self._healths


def test_system_overview_includes_plugin_adapter_health(client, monkeypatch) -> None:
    registry = PluginRegistry()
    sandbox_registry = SandboxBackendRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="compat:dify:plugin:demo/search",
            name="Demo Search",
            ecosystem="compat:dify",
            source="plugin",
        )
    )
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
    monkeypatch.setattr(system_routes, "get_plugin_registry", lambda: registry)
    monkeypatch.setattr(system_routes, "get_sandbox_backend_registry", lambda: sandbox_registry)
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
    monkeypatch.setattr(
        system_routes,
        "get_sandbox_backend_health_checker",
        lambda: _StaticSandboxHealthChecker(
            [
                SandboxBackendHealth(
                    id="sandbox-default",
                    kind="official",
                    endpoint="http://sandbox.local",
                    enabled=True,
                    status="healthy",
                    capability=SandboxBackendCapability(
                        supported_execution_classes=("sandbox",),
                        supported_languages=("python",),
                        supported_profiles=("python-safe",),
                        supported_dependency_modes=("builtin",),
                        supports_network_policy=True,
                        supports_filesystem_policy=True,
                    ),
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
    assert "sandbox-backend-registry" in body["capabilities"]
    assert "sandbox-readiness-summary" in body["capabilities"]
    assert "plugin-tool-catalog-visible" in body["capabilities"]
    assert "runtime-events-visible" in body["capabilities"]
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
    assert body["sandbox_backends"] == [
        {
            "id": "sandbox-default",
            "kind": "official",
            "endpoint": "http://sandbox.local",
            "enabled": True,
            "status": "healthy",
            "detail": None,
            "capability": {
                "supported_execution_classes": ["sandbox"],
                "supported_languages": ["python"],
                "supported_profiles": ["python-safe"],
                "supported_dependency_modes": ["builtin"],
                "supports_builtin_package_sets": False,
                "supports_backend_extensions": False,
                "supports_network_policy": True,
                "supports_filesystem_policy": True,
            },
        }
    ]
    assert body["plugin_tools"] == [
        {
            "id": "compat:dify:plugin:demo/search",
            "name": "Demo Search",
            "ecosystem": "compat:dify",
            "source": "plugin",
            "callable": True,
        }
    ]
    assert body["sandbox_readiness"] == {
        "enabled_backend_count": 1,
        "healthy_backend_count": 1,
        "degraded_backend_count": 0,
        "offline_backend_count": 0,
        "execution_classes": [
            {
                "execution_class": "sandbox",
                "available": True,
                "backend_ids": ["sandbox-default"],
                "reason": None,
            },
            {
                "execution_class": "microvm",
                "available": False,
                "backend_ids": [],
                "reason": (
                    "Healthy sandbox backends do not currently advertise execution class "
                    "'microvm': sandbox-default."
                ),
            },
        ],
        "supported_languages": ["python"],
        "supported_profiles": ["python-safe"],
        "supported_dependency_modes": ["builtin"],
        "supports_builtin_package_sets": False,
        "supports_backend_extensions": False,
        "supports_network_policy": True,
        "supports_filesystem_policy": True,
    }
    assert body["runtime_activity"] == {
        "summary": {
            "recent_run_count": 0,
            "recent_event_count": 0,
            "run_statuses": {},
            "event_types": {},
        },
        "recent_runs": [],
        "recent_events": [],
    }
    assert any(service["name"] == "plugin-adapter:dify-default" for service in body["services"])
    assert any(service["name"] == "sandbox-backend:sandbox-default" for service in body["services"])


def test_system_overview_reports_sandbox_readiness_gap_reason(client, monkeypatch) -> None:
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
        "get_sandbox_backend_registry",
        lambda: SandboxBackendRegistry(),
    )
    monkeypatch.setattr(
        system_routes,
        "get_compatibility_adapter_health_checker",
        lambda: _StaticHealthChecker([]),
    )
    monkeypatch.setattr(
        system_routes,
        "get_sandbox_backend_health_checker",
        lambda: _StaticSandboxHealthChecker(
            [
                SandboxBackendHealth(
                    id="sandbox-offline",
                    kind="official",
                    endpoint="http://sandbox.local",
                    enabled=True,
                    status="offline",
                    capability=SandboxBackendCapability(
                        supported_execution_classes=("sandbox", "microvm"),
                    ),
                    detail="connect timeout",
                )
            ]
        ),
    )

    response = client.get("/api/system/overview")

    assert response.status_code == 200
    assert response.json()["sandbox_readiness"] == {
        "enabled_backend_count": 1,
        "healthy_backend_count": 0,
        "degraded_backend_count": 0,
        "offline_backend_count": 1,
        "execution_classes": [
            {
                "execution_class": "sandbox",
                "available": False,
                "backend_ids": [],
                "reason": (
                    "Enabled sandbox backends are not currently healthy for 'sandbox': "
                    "sandbox-offline (offline)."
                ),
            },
            {
                "execution_class": "microvm",
                "available": False,
                "backend_ids": [],
                "reason": (
                    "Enabled sandbox backends are not currently healthy for 'microvm': "
                    "sandbox-offline (offline)."
                ),
            },
        ],
        "supported_languages": [],
        "supported_profiles": [],
        "supported_dependency_modes": [],
        "supports_builtin_package_sets": False,
        "supports_backend_extensions": False,
        "supports_network_policy": False,
        "supports_filesystem_policy": False,
    }


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


def test_list_sandbox_backends_returns_current_backend_health(client, monkeypatch) -> None:
    monkeypatch.setattr(
        system_routes,
        "get_sandbox_backend_registry",
        lambda: SandboxBackendRegistry(),
    )
    monkeypatch.setattr(
        system_routes,
        "get_sandbox_backend_health_checker",
        lambda: _StaticSandboxHealthChecker(
            [
                SandboxBackendHealth(
                    id="sandbox-default",
                    kind="official",
                    endpoint="http://sandbox.local",
                    enabled=True,
                    status="offline",
                    capability=SandboxBackendCapability(
                        supported_execution_classes=("sandbox", "microvm"),
                        supported_languages=("python", "javascript"),
                    ),
                    detail="connect timeout",
                )
            ]
        ),
    )

    response = client.get("/api/system/sandbox-backends")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "sandbox-default",
            "kind": "official",
            "endpoint": "http://sandbox.local",
            "enabled": True,
            "status": "offline",
            "detail": "connect timeout",
            "capability": {
                "supported_execution_classes": ["sandbox", "microvm"],
                "supported_languages": ["python", "javascript"],
                "supported_profiles": [],
                "supported_dependency_modes": [],
                "supports_builtin_package_sets": False,
                "supports_backend_extensions": False,
                "supports_network_policy": False,
                "supports_filesystem_policy": False,
            },
        }
    ]


def test_runtime_activity_returns_recent_runs_and_events(
    client,
    sqlite_session,
    sample_workflow,
    monkeypatch,
) -> None:
    created_at = datetime.now(UTC)
    sqlite_session.add(
        Run(
            id="run-demo",
            workflow_id=sample_workflow.id,
            workflow_version=sample_workflow.version,
            status="succeeded",
            input_payload={"topic": "diagnostics"},
            output_payload={"answer": "ok"},
            created_at=created_at,
            finished_at=created_at,
        )
    )
    sqlite_session.add(
        RunEvent(
            run_id="run-demo",
            node_run_id=None,
            event_type="run.completed",
            payload={"summary": "done"},
            created_at=created_at,
        )
    )
    sqlite_session.commit()

    monkeypatch.setattr(system_routes, "get_plugin_registry", lambda: PluginRegistry())
    response = client.get("/api/system/runtime-activity")
    created_at_text = created_at.isoformat().replace("+00:00", "")

    assert response.status_code == 200
    assert response.json() == {
        "summary": {
            "recent_run_count": 1,
            "recent_event_count": 1,
            "run_statuses": {"succeeded": 1},
            "event_types": {"run.completed": 1},
        },
        "recent_runs": [
            {
                "id": "run-demo",
                "workflow_id": sample_workflow.id,
                "workflow_version": sample_workflow.version,
                "status": "succeeded",
                "created_at": created_at_text,
                "finished_at": created_at_text,
                "event_count": 1,
            }
        ],
        "recent_events": [
            {
                "id": 1,
                "run_id": "run-demo",
                "node_run_id": None,
                "event_type": "run.completed",
                "payload_keys": ["summary"],
                "payload_preview": "{\"summary\": \"done\"}",
                "payload_size": 19,
                "created_at": created_at_text,
            }
        ],
    }
