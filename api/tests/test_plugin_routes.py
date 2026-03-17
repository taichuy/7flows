from app.api.routes import plugins as plugin_routes
from app.services.plugin_runtime import (
    CompatibilityAdapterHealth,
    PluginRegistry,
    PluginToolDefinition,
)


class _StaticHealthChecker:
    def __init__(self, status: str = "up", detail: str | None = None) -> None:
        self._status = status
        self._detail = detail

    def probe(self, adapter) -> CompatibilityAdapterHealth:
        return CompatibilityAdapterHealth(
            id=adapter.id,
            ecosystem=adapter.ecosystem,
            endpoint=adapter.endpoint,
            enabled=adapter.enabled,
            status=self._status,
            detail=self._detail,
        )


class _StaticCatalogClient:
    def __init__(self, tools: list[PluginToolDefinition]) -> None:
        self._tools = tools

    def fetch_tools(self, adapter) -> list[PluginToolDefinition]:
        return self._tools


def test_register_and_list_plugin_adapter(client, monkeypatch) -> None:
    registry = PluginRegistry()
    monkeypatch.setattr(plugin_routes, "get_plugin_registry", lambda: registry)
    monkeypatch.setattr(
        plugin_routes,
        "get_compatibility_adapter_health_checker",
        lambda: _StaticHealthChecker(status="up"),
    )

    create_response = client.post(
        "/api/plugins/adapters",
        json={
            "id": "dify-default",
            "ecosystem": "compat:dify",
            "endpoint": "http://adapter.local",
            "enabled": True,
            "healthcheck_path": "/healthz",
            "workspace_ids": ["ws-demo"],
            "plugin_kinds": ["node", "provider"],
            "supported_execution_classes": ["subprocess", "microvm"],
        },
    )

    assert create_response.status_code == 201
    assert create_response.json() == {
        "id": "dify-default",
        "ecosystem": "compat:dify",
        "endpoint": "http://adapter.local",
        "enabled": True,
        "healthcheck_path": "/healthz",
        "workspace_ids": ["ws-demo"],
        "plugin_kinds": ["node", "provider"],
        "supported_execution_classes": ["subprocess", "microvm"],
        "status": "up",
        "detail": None,
    }

    list_response = client.get("/api/plugins/adapters")

    assert list_response.status_code == 200
    assert list_response.json() == [create_response.json()]


def test_register_and_list_plugin_tool(client, monkeypatch) -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="native.echo",
            name="Echo",
        ),
        invoker=lambda request: {"ok": True},
    )
    monkeypatch.setattr(plugin_routes, "get_plugin_registry", lambda: registry)
    monkeypatch.setattr(
        plugin_routes,
        "get_compatibility_adapter_health_checker",
        lambda: _StaticHealthChecker(status="up"),
    )

    create_response = client.post(
        "/api/plugins/tools",
        json={
            "id": "compat:dify:plugin:demo/search",
            "name": "Search",
            "ecosystem": "compat:dify",
            "description": "Search via Dify adapter",
            "input_schema": {"type": "object"},
            "output_schema": {"type": "object"},
            "source": "plugin",
            "plugin_meta": {"origin": "dify"},
        },
    )

    assert create_response.status_code == 201
    assert create_response.json() == {
        "id": "compat:dify:plugin:demo/search",
        "name": "Search",
        "ecosystem": "compat:dify",
        "description": "Search via Dify adapter",
        "input_schema": {"type": "object"},
        "output_schema": {"type": "object"},
        "source": "plugin",
        "plugin_meta": {"origin": "dify"},
        "callable": True,
        "supported_execution_classes": [],
    }

    list_response = client.get("/api/plugins/tools")

    assert list_response.status_code == 200
    assert list_response.json() == [
        {
            "id": "native.echo",
            "name": "Echo",
            "ecosystem": "native",
            "description": "",
            "input_schema": {},
            "output_schema": None,
            "source": "builtin",
            "plugin_meta": None,
            "callable": True,
            "supported_execution_classes": ["inline"],
        },
        create_response.json(),
    ]


def test_register_plugin_tool_rejects_native_http_registration(client, monkeypatch) -> None:
    monkeypatch.setattr(plugin_routes, "get_plugin_registry", lambda: PluginRegistry())
    monkeypatch.setattr(
        plugin_routes,
        "get_compatibility_adapter_health_checker",
        lambda: _StaticHealthChecker(status="up"),
    )

    response = client.post(
        "/api/plugins/tools",
        json={
            "id": "native.echo",
            "name": "Echo",
            "ecosystem": "native",
            "description": "Should fail",
        },
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail[0]["type"] == "value_error"
    assert "HTTP registration currently supports only compat/plugin tools" in detail[0]["msg"]


def test_sync_plugin_tools_from_adapter(client, monkeypatch) -> None:
    registry = PluginRegistry()
    registry.register_adapter(
        plugin_routes.CompatibilityAdapterRegistration(
            id="dify-default",
            ecosystem="compat:dify",
            endpoint="http://adapter.local",
        )
    )
    monkeypatch.setattr(plugin_routes, "get_plugin_registry", lambda: registry)
    monkeypatch.setattr(
        plugin_routes,
        "get_compatibility_adapter_catalog_client",
        lambda: _StaticCatalogClient(
            [
                PluginToolDefinition(
                    id="compat:dify:plugin:demo/search",
                    name="Demo Search",
                    ecosystem="compat:dify",
                    description="Search via Dify adapter",
                    input_schema={"type": "object"},
                    output_schema={"type": "object"},
                    source="plugin",
                    plugin_meta={"origin": "dify"},
                )
            ]
        ),
    )
    monkeypatch.setattr(
        plugin_routes,
        "get_compatibility_adapter_health_checker",
        lambda: _StaticHealthChecker(status="up"),
    )

    response = client.post("/api/plugins/adapters/dify-default/sync-tools")

    assert response.status_code == 200
    assert response.json() == {
        "adapter_id": "dify-default",
        "ecosystem": "compat:dify",
        "discovered_count": 1,
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
                "callable": True,
                "supported_execution_classes": [],
            }
        ],
    }
    assert registry.get_tool("compat:dify:plugin:demo/search") is not None
