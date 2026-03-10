from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PluginAdapterRecord(Base):
    __tablename__ = "plugin_adapters"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    ecosystem: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    endpoint: Mapped[str] = mapped_column(String(512), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    healthcheck_path: Mapped[str] = mapped_column(String(128), default="/healthz", nullable=False)
    workspace_ids: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    plugin_kinds: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class PluginToolRecord(Base):
    __tablename__ = "plugin_tools"

    id: Mapped[str] = mapped_column(String(256), primary_key=True)
    adapter_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    ecosystem: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    input_schema: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    output_schema: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    source: Mapped[str] = mapped_column(String(64), default="plugin", nullable=False)
    plugin_meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    constrained_ir: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
