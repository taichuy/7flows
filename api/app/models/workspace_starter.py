from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WorkspaceStarterTemplateRecord(Base):
    __tablename__ = "workspace_starter_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    business_track: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    default_workflow_name: Mapped[str] = mapped_column(String(128), nullable=False)
    workflow_focus: Mapped[str] = mapped_column(Text, default="", nullable=False)
    recommended_next_step: Mapped[str] = mapped_column(Text, default="", nullable=False)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    definition: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_from_workflow_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_from_workflow_version: Mapped[str | None] = mapped_column(
        String(32), nullable=True
    )
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
