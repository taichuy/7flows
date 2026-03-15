from __future__ import annotations

from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.plugin import PluginAdapterRecord, PluginToolRecord
from app.services.plugin_runtime import (
    CompatibilityAdapterRegistration,
    PluginRegistry,
    PluginToolDefinition,
)


class PluginRegistryStore:
    def hydrate_registry(self, db: Session, registry: PluginRegistry) -> None:
        adapter_records = db.scalars(
            select(PluginAdapterRecord).order_by(PluginAdapterRecord.created_at.asc())
        ).all()
        for record in adapter_records:
            registry.register_adapter(
                CompatibilityAdapterRegistration(
                    id=record.id,
                    ecosystem=record.ecosystem,
                    endpoint=record.endpoint,
                    enabled=record.enabled,
                    healthcheck_path=record.healthcheck_path,
                    workspace_ids=tuple(record.workspace_ids or ()),
                    plugin_kinds=tuple(record.plugin_kinds or ()),
                )
            )

        tool_records = db.scalars(
            select(PluginToolRecord).order_by(PluginToolRecord.created_at.asc())
        ).all()
        for record in tool_records:
            registry.register_tool(
                PluginToolDefinition(
                    id=record.id,
                    name=record.name,
                    ecosystem=record.ecosystem,
                    description=record.description,
                    input_schema=dict(record.input_schema or {}),
                    output_schema=(
                        dict(record.output_schema)
                        if isinstance(record.output_schema, dict)
                        else None
                    ),
                    source=record.source,
                    plugin_meta=(
                        dict(record.plugin_meta)
                        if isinstance(record.plugin_meta, dict)
                        else None
                    ),
                    constrained_ir=(
                        dict(record.constrained_ir)
                        if isinstance(record.constrained_ir, dict)
                        else None
                    ),
                )
            )

    def upsert_adapter(
        self,
        db: Session,
        registration: CompatibilityAdapterRegistration,
    ) -> PluginAdapterRecord:
        record = db.get(PluginAdapterRecord, registration.id)
        if record is None:
            record = PluginAdapterRecord(id=registration.id)
            db.add(record)

        record.ecosystem = registration.ecosystem
        record.endpoint = registration.endpoint
        record.enabled = registration.enabled
        record.healthcheck_path = registration.healthcheck_path
        record.workspace_ids = list(registration.workspace_ids)
        record.plugin_kinds = list(registration.plugin_kinds)
        db.flush()
        return record

    def upsert_tool(
        self,
        db: Session,
        definition: PluginToolDefinition,
        *,
        adapter_id: str | None = None,
    ) -> PluginToolRecord:
        record = db.get(PluginToolRecord, definition.id)
        if record is None:
            record = PluginToolRecord(id=definition.id)
            db.add(record)

        record.adapter_id = adapter_id
        record.ecosystem = definition.ecosystem
        record.name = definition.name
        record.description = definition.description
        record.input_schema = dict(definition.input_schema)
        record.output_schema = (
            dict(definition.output_schema) if isinstance(definition.output_schema, dict) else None
        )
        record.source = definition.source
        record.plugin_meta = (
            dict(definition.plugin_meta) if isinstance(definition.plugin_meta, dict) else None
        )
        record.constrained_ir = (
            dict(definition.constrained_ir)
            if isinstance(definition.constrained_ir, dict)
            else None
        )
        db.flush()
        return record

    def replace_adapter_tools(
        self,
        db: Session,
        *,
        adapter_id: str,
        tools: list[PluginToolDefinition],
    ) -> list[str]:
        existing_records = db.scalars(
            select(PluginToolRecord).where(PluginToolRecord.adapter_id == adapter_id)
        ).all()
        existing_ids = {record.id for record in existing_records}
        incoming_ids = {tool.id for tool in tools}

        for tool in tools:
            self.upsert_tool(db, tool, adapter_id=adapter_id)

        stale_ids = sorted(existing_ids - incoming_ids)
        for record in existing_records:
            if record.id in incoming_ids:
                continue
            db.delete(record)

        db.flush()
        return stale_ids


@lru_cache(maxsize=1)
def get_plugin_registry_store() -> PluginRegistryStore:
    return PluginRegistryStore()
