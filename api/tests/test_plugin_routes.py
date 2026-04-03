from app.api.routes import plugins as plugin_routes
from app.services.plugin_runtime import (
    CompatibilityAdapterHealth,
    PluginRegistry,
    PluginToolDefinition,
)


class _StaticHealthChecker:
    def __init__(
        self,
        status: str = "up",
        detail: str | None = None,
        mode: str | None = None,
    ) -> None:
        self._status = status
        self._detail = detail
        self._mode = mode

    def probe(self, adapter) -> CompatibilityAdapterHealth:
        return CompatibilityAdapterHealth(
            id=adapter.id,
            ecosystem=adapter.ecosystem,
            endpoint=adapter.endpoint,
            enabled=adapter.enabled,
            status=self._status,
            detail=self._detail,
            mode=self._mode,
        )


class _StaticCatalogClient:
    def __init__(self, tools: list[PluginToolDefinition]) -> None:
        self._tools = tools

    def fetch_tools(self, adapter) -> list[PluginToolDefinition]:
        return self._tools


def test_register_and_list_plugin_adapter(
    client, monkeypatch, auth_headers: dict, write_headers: dict
) -> None:
    registry = PluginRegistry()
    monkeypatch.setattr(plugin_routes, "get_plugin_registry", lambda: registry)
    monkeypatch.setattr(
        plugin_routes,
        "get_compatibility_adapter_health_checker",
        lambda: _StaticHealthChecker(status="degraded", mode="translate"),
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
        headers=write_headers,
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
        "status": "degraded",
        "detail": None,
        "mode": "translate",
    }

    list_response = client.get("/api/plugins/adapters", headers=auth_headers)

    assert list_response.status_code == 200
    assert list_response.json() == [create_response.json()]


def test_register_and_list_plugin_tool(
    client, monkeypatch, auth_headers: dict, write_headers: dict
) -> None:
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
        headers=write_headers,
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
        "default_execution_class": None,
        "sensitivity_level": None,
    }

    list_response = client.get("/api/plugins/tools", headers=auth_headers)

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
            "default_execution_class": None,
            "sensitivity_level": None,
        },
        create_response.json(),
    ]


def test_register_plugin_tool_rejects_native_http_registration(
    client, monkeypatch, auth_headers: dict, write_headers: dict
) -> None:
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
        headers=write_headers,
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail[0]["type"] == "value_error"
    assert "HTTP registration currently supports only compat/plugin tools" in detail[0]["msg"]


def test_sync_plugin_tools_from_adapter(
    client, monkeypatch, auth_headers: dict, write_headers: dict
) -> None:
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
                    supported_execution_classes=("subprocess", "microvm"),
                    default_execution_class="subprocess",
                )
            ]
        ),
    )
    monkeypatch.setattr(
        plugin_routes,
        "get_compatibility_adapter_health_checker",
        lambda: _StaticHealthChecker(status="up"),
    )

    response = client.post("/api/plugins/adapters/dify-default/sync-tools", headers=write_headers)

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
                "supported_execution_classes": ["subprocess", "microvm"],
                "default_execution_class": "subprocess",
                "sensitivity_level": None,
            }
        ],
    }
    assert registry.get_tool("compat:dify:plugin:demo/search") is not None


def test_list_plugin_tools_exposes_sensitivity_driven_default_execution(
    client,
    monkeypatch,
    auth_headers: dict,
    write_headers: dict,
) -> None:
    registry = PluginRegistry()
    registry.register_tool(
        PluginToolDefinition(
            id="native.risk-search",
            name="Risk Search",
            supported_execution_classes=("inline", "sandbox"),
        ),
        invoker=lambda request: {"ok": True},
    )
    monkeypatch.setattr(plugin_routes, "get_plugin_registry", lambda: registry)
    monkeypatch.setattr(
        plugin_routes,
        "get_compatibility_adapter_health_checker",
        lambda: _StaticHealthChecker(status="up"),
    )

    resource_response = client.post(
        "/api/sensitive-access/resources",
        json={
            "label": "Risk Search Capability",
            "sensitivity_level": "L2",
            "source": "local_capability",
            "metadata": {"tool_id": "native.risk-search", "ecosystem": "native"},
        },
        headers=write_headers,
    )
    assert resource_response.status_code == 201

    response = client.get("/api/plugins/tools", headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "native.risk-search",
            "name": "Risk Search",
            "ecosystem": "native",
            "description": "",
            "input_schema": {},
            "output_schema": None,
            "source": "builtin",
            "plugin_meta": None,
            "callable": True,
            "supported_execution_classes": ["inline", "sandbox"],
            "default_execution_class": "sandbox",
            "sensitivity_level": "L2",
        }
    ]
