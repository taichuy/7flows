from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SensitiveResourceRecord(Base):
    __tablename__ = "sensitive_resources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    label: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sensitivity_level: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    metadata_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )


class SensitiveAccessRequestRecord(Base):
    __tablename__ = "sensitive_access_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    run_id: Mapped[str | None] = mapped_column(ForeignKey("runs.id"), nullable=True, index=True)
    node_run_id: Mapped[str | None] = mapped_column(
        ForeignKey("node_runs.id"),
        nullable=True,
        index=True,
    )
    requester_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    requester_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    resource_id: Mapped[str] = mapped_column(
        ForeignKey("sensitive_resources.id"),
        nullable=False,
        index=True,
    )
    action_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    purpose_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    reason_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ApprovalTicketRecord(Base):
    __tablename__ = "approval_tickets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    access_request_id: Mapped[str] = mapped_column(
        ForeignKey("sensitive_access_requests.id"),
        nullable=False,
        index=True,
        unique=True,
    )
    run_id: Mapped[str | None] = mapped_column(ForeignKey("runs.id"), nullable=True, index=True)
    node_run_id: Mapped[str | None] = mapped_column(
        ForeignKey("node_runs.id"),
        nullable=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)
    waiting_status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="waiting",
        index=True,
    )
    approved_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True
    )


class NotificationDispatchRecord(Base):
    __tablename__ = "notification_dispatches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    approval_ticket_id: Mapped[str] = mapped_column(
        ForeignKey("approval_tickets.id"),
        nullable=False,
        index=True,
    )
    channel: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    target: Mapped[str] = mapped_column(String(256), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True
    )
