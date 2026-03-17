from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.plugin import (
    PluginAdapterRegistrationCreate,
    PluginAdapterRegistrationItem,
    PluginToolItem,
    PluginToolRegistrationCreate,
    PluginToolSyncResult,
)
from app.services.plugin_registry_store import get_plugin_registry_store
from app.services.plugin_runtime import (
    CompatibilityAdapterRegistration,
    PluginCatalogError,
    PluginToolDefinition,
    get_compatibility_adapter_catalog_client,
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
        supported_execution_classes=list(adapter.supported_execution_classes),
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
        supported_execution_classes=list(tool.supported_execution_classes),
    )


@router.get("/adapters", response_model=list[PluginAdapterRegistrationItem])
def list_plugin_adapters(
    db: Session = Depends(get_db),
) -> list[PluginAdapterRegistrationItem]:
    registry = get_plugin_registry()
    get_plugin_registry_store().hydrate_registry(db, registry)
    return [_serialize_adapter(adapter.id) for adapter in registry.list_adapters()]


@router.post(
    "/adapters",
    response_model=PluginAdapterRegistrationItem,
    status_code=status.HTTP_201_CREATED,
)
def register_plugin_adapter(
    payload: PluginAdapterRegistrationCreate,
    db: Session = Depends(get_db),
) -> PluginAdapterRegistrationItem:
    registry = get_plugin_registry()
    get_plugin_registry_store().hydrate_registry(db, registry)
    adapter = CompatibilityAdapterRegistration(
        id=payload.id,
        ecosystem=payload.ecosystem,
        endpoint=payload.endpoint,
        enabled=payload.enabled,
        healthcheck_path=payload.healthcheck_path,
        workspace_ids=tuple(payload.workspace_ids),
        plugin_kinds=tuple(payload.plugin_kinds),
        supported_execution_classes=tuple(payload.supported_execution_classes),
    )
    get_plugin_registry_store().upsert_adapter(db, adapter)
    db.commit()
    registry.register_adapter(adapter)
    return _serialize_adapter(payload.id)


@router.post(
    "/adapters/{adapter_id}/sync-tools",
    response_model=PluginToolSyncResult,
)
def sync_plugin_adapter_tools(
    adapter_id: str,
    db: Session = Depends(get_db),
) -> PluginToolSyncResult:
    registry = get_plugin_registry()
    get_plugin_registry_store().hydrate_registry(db, registry)
    adapter = registry.get_adapter(adapter_id)
    if adapter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plugin adapter '{adapter_id}' is not registered.",
        )
    if not adapter.enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Plugin adapter '{adapter_id}' is disabled.",
        )

    try:
        tools = get_compatibility_adapter_catalog_client().fetch_tools(adapter)
    except PluginCatalogError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    stale_tool_ids = get_plugin_registry_store().replace_adapter_tools(
        db,
        adapter_id=adapter.id,
        tools=tools,
    )
    db.commit()
    for stale_tool_id in stale_tool_ids:
        registry.unregister_tool(stale_tool_id)
    for tool in tools:
        registry.register_tool(tool)

    return PluginToolSyncResult(
        adapter_id=adapter.id,
        ecosystem=adapter.ecosystem,
        discovered_count=len(tools),
        tools=[_serialize_tool(tool.id) for tool in tools],
    )


@router.get("/tools", response_model=list[PluginToolItem])
def list_plugin_tools(
    db: Session = Depends(get_db),
) -> list[PluginToolItem]:
    registry = get_plugin_registry()
    get_plugin_registry_store().hydrate_registry(db, registry)
    return [_serialize_tool(tool.id) for tool in registry.list_tools()]


@router.post(
    "/tools",
    response_model=PluginToolItem,
    status_code=status.HTTP_201_CREATED,
)
def register_plugin_tool(
    payload: PluginToolRegistrationCreate,
    db: Session = Depends(get_db),
) -> PluginToolItem:
    registry = get_plugin_registry()
    get_plugin_registry_store().hydrate_registry(db, registry)
    tool = PluginToolDefinition(
        id=payload.id,
        name=payload.name,
        ecosystem=payload.ecosystem,
        description=payload.description,
        input_schema=payload.input_schema,
        output_schema=payload.output_schema,
        source=payload.source,
        plugin_meta=payload.plugin_meta,
    )
    get_plugin_registry_store().upsert_tool(db, tool)
    db.commit()
    registry.register_tool(tool)
    return _serialize_tool(payload.id)
