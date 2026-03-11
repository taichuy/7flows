from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[str] = mapped_column(String(32), default="0.1.0")
    status: Mapped[str] = mapped_column(String(32), default="draft")
    definition: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class WorkflowVersion(Base):
    __tablename__ = "workflow_versions"
    __table_args__ = (
        UniqueConstraint("workflow_id", "version", name="uq_workflow_versions_workflow_version"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workflow_id: Mapped[str] = mapped_column(
        ForeignKey("workflows.id"),
        nullable=False,
        index=True,
    )
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    definition: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )


class WorkflowCompiledBlueprint(Base):
    __tablename__ = "workflow_compiled_blueprints"
    __table_args__ = (
        UniqueConstraint(
            "workflow_version_id",
            name="uq_workflow_compiled_blueprints_workflow_version",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workflow_id: Mapped[str] = mapped_column(
        ForeignKey("workflows.id"),
        nullable=False,
        index=True,
    )
    workflow_version_id: Mapped[str] = mapped_column(
        ForeignKey("workflow_versions.id"),
        nullable=False,
        index=True,
    )
    workflow_version: Mapped[str] = mapped_column(String(32), nullable=False)
    compiler_version: Mapped[str] = mapped_column(String(64), nullable=False)
    blueprint_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class WorkflowPublishedEndpoint(Base):
    __tablename__ = "workflow_published_endpoints"
    __table_args__ = (
        UniqueConstraint(
            "workflow_version_id",
            "endpoint_id",
            name="uq_workflow_published_endpoints_version_endpoint",
        ),
        UniqueConstraint(
            "workflow_version_id",
            "endpoint_alias",
            name="uq_workflow_published_endpoints_version_alias",
        ),
        UniqueConstraint(
            "workflow_version_id",
            "route_path",
            name="uq_workflow_published_endpoints_version_path",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workflow_id: Mapped[str] = mapped_column(
        ForeignKey("workflows.id"),
        nullable=False,
        index=True,
    )
    workflow_version_id: Mapped[str] = mapped_column(
        ForeignKey("workflow_versions.id"),
        nullable=False,
        index=True,
    )
    workflow_version: Mapped[str] = mapped_column(String(32), nullable=False)
    target_workflow_version_id: Mapped[str] = mapped_column(
        ForeignKey("workflow_versions.id"),
        nullable=False,
        index=True,
    )
    target_workflow_version: Mapped[str] = mapped_column(String(32), nullable=False)
    compiled_blueprint_id: Mapped[str] = mapped_column(
        ForeignKey("workflow_compiled_blueprints.id"),
        nullable=False,
        index=True,
    )
    endpoint_id: Mapped[str] = mapped_column(String(64), nullable=False)
    endpoint_name: Mapped[str] = mapped_column(String(128), nullable=False)
    endpoint_alias: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    route_path: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    protocol: Mapped[str] = mapped_column(String(32), nullable=False)
    auth_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    streaming: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    lifecycle_status: Mapped[str] = mapped_column(
        String(32),
        default="draft",
        nullable=False,
        index=True,
    )
    input_schema: Mapped[dict] = mapped_column(JSON, default=dict)
    output_schema: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    unpublished_at: Mapped[datetime | None] = mapped_column(
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


class WorkflowPublishedApiKey(Base):
    __tablename__ = "workflow_published_api_keys"
    __table_args__ = (
        UniqueConstraint("key_hash", name="uq_workflow_published_api_keys_key_hash"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workflow_id: Mapped[str] = mapped_column(
        ForeignKey("workflows.id"),
        nullable=False,
        index=True,
    )
    endpoint_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(24), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32),
        default="active",
        nullable=False,
        index=True,
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class WorkflowPublishedInvocation(Base):
    __tablename__ = "workflow_published_invocations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workflow_id: Mapped[str] = mapped_column(
        ForeignKey("workflows.id"),
        nullable=False,
        index=True,
    )
    binding_id: Mapped[str] = mapped_column(
        ForeignKey("workflow_published_endpoints.id"),
        nullable=False,
        index=True,
    )
    endpoint_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    endpoint_alias: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    route_path: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    protocol: Mapped[str] = mapped_column(String(32), nullable=False)
    auth_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    request_source: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    api_key_id: Mapped[str | None] = mapped_column(
        ForeignKey("workflow_published_api_keys.id"),
        nullable=True,
        index=True,
    )
    run_id: Mapped[str | None] = mapped_column(ForeignKey("runs.id"), nullable=True, index=True)
    run_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(512), nullable=True)
    request_preview: Mapped[dict] = mapped_column(JSON, default=dict)
    response_preview: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
