from fastapi import APIRouter, status

from app.schemas.plugin import (
    PluginAdapterRegistrationCreate,
    PluginAdapterRegistrationItem,
    PluginToolItem,
    PluginToolRegistrationCreate,
)
from app.services.plugin_runtime import (
    CompatibilityAdapterRegistration,
    PluginToolDefinition,
    get_compatibility_adapter_health_checker,
    get_plugin_registry,
)

router = APIRouter(prefix="/plugins", tags=["plugins"])


def _serialize_adapter(adapter_id: str) -> PluginAdapterRegistrationItem:
    registry = get_plugin_registry()
    adapter = registry.get_adapter(adapter_id)
    if adapter is None:
        raise ValueError(f"Plugin adapter '{adapter_id}' is not registered.")

    health = get_compatibility_adapter_health_checker().probe(adapter)
    return PluginAdapterRegistrationItem(
        id=adapter.id,
        ecosystem=adapter.ecosystem,
        endpoint=adapter.endpoint,
        enabled=adapter.enabled,
        healthcheck_path=adapter.healthcheck_path,
        workspace_ids=list(adapter.workspace_ids),
        plugin_kinds=list(adapter.plugin_kinds),
        status=health.status,
        detail=health.detail,
    )


def _serialize_tool(tool_id: str) -> PluginToolItem:
    registry = get_plugin_registry()
    tool = registry.get_tool(tool_id)
    if tool is None:
        raise ValueError(f"Plugin tool '{tool_id}' is not registered.")

    return PluginToolItem(
        id=tool.id,
        name=tool.name,
        ecosystem=tool.ecosystem,
        description=tool.description,
        input_schema=tool.input_schema,
        output_schema=tool.output_schema,
        source=tool.source,
        plugin_meta=tool.plugin_meta,
        callable=(tool.ecosystem != "native") or registry.has_native_invoker(tool.id),
    )


@router.get("/adapters", response_model=list[PluginAdapterRegistrationItem])
def list_plugin_adapters() -> list[PluginAdapterRegistrationItem]:
    registry = get_plugin_registry()
    return [_serialize_adapter(adapter.id) for adapter in registry.list_adapters()]


@router.post(
    "/adapters",
    response_model=PluginAdapterRegistrationItem,
    status_code=status.HTTP_201_CREATED,
)
def register_plugin_adapter(
    payload: PluginAdapterRegistrationCreate,
) -> PluginAdapterRegistrationItem:
    registry = get_plugin_registry()
    registry.register_adapter(
        CompatibilityAdapterRegistration(
            id=payload.id,
            ecosystem=payload.ecosystem,
            endpoint=payload.endpoint,
            enabled=payload.enabled,
            healthcheck_path=payload.healthcheck_path,
            workspace_ids=tuple(payload.workspace_ids),
            plugin_kinds=tuple(payload.plugin_kinds),
        )
    )
    return _serialize_adapter(payload.id)


@router.get("/tools", response_model=list[PluginToolItem])
def list_plugin_tools() -> list[PluginToolItem]:
    registry = get_plugin_registry()
    return [_serialize_tool(tool.id) for tool in registry.list_tools()]


@router.post(
    "/tools",
    response_model=PluginToolItem,
    status_code=status.HTTP_201_CREATED,
)
def register_plugin_tool(payload: PluginToolRegistrationCreate) -> PluginToolItem:
    registry = get_plugin_registry()
    registry.register_tool(
        PluginToolDefinition(
            id=payload.id,
            name=payload.name,
            ecosystem=payload.ecosystem,
            description=payload.description,
            input_schema=payload.input_schema,
            output_schema=payload.output_schema,
            source=payload.source,
            plugin_meta=payload.plugin_meta,
        )
    )
    return _serialize_tool(payload.id)
