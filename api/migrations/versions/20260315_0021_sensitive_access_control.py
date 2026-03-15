"""add sensitive access control foundation

Revision ID: 20260315_0021
Revises: 20260314_0020
"""

import sqlalchemy as sa
from alembic import op

revision = "20260315_0021"
down_revision = "20260314_0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sensitive_resources",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("label", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sensitivity_level", sa.String(length=8), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("metadata_payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_sensitive_resources_sensitivity_level",
        "sensitive_resources",
        ["sensitivity_level"],
        unique=False,
    )
    op.create_index("ix_sensitive_resources_source", "sensitive_resources", ["source"], unique=False)

    op.create_table(
        "sensitive_access_requests",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=True),
        sa.Column("node_run_id", sa.String(length=36), nullable=True),
        sa.Column("requester_type", sa.String(length=32), nullable=False),
        sa.Column("requester_id", sa.String(length=128), nullable=False),
        sa.Column("resource_id", sa.String(length=36), nullable=False),
        sa.Column("action_type", sa.String(length=32), nullable=False),
        sa.Column("purpose_text", sa.Text(), nullable=True),
        sa.Column("decision", sa.String(length=32), nullable=True),
        sa.Column("reason_code", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["node_run_id"], ["node_runs.id"]),
        sa.ForeignKeyConstraint(["resource_id"], ["sensitive_resources.id"]),
        sa.ForeignKeyConstraint(["run_id"], ["runs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_sensitive_access_requests_action_type",
        "sensitive_access_requests",
        ["action_type"],
        unique=False,
    )
    op.create_index(
        "ix_sensitive_access_requests_created_at",
        "sensitive_access_requests",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ix_sensitive_access_requests_decision",
        "sensitive_access_requests",
        ["decision"],
        unique=False,
    )
    op.create_index(
        "ix_sensitive_access_requests_node_run_id",
        "sensitive_access_requests",
        ["node_run_id"],
        unique=False,
    )
    op.create_index(
        "ix_sensitive_access_requests_requester_id",
        "sensitive_access_requests",
        ["requester_id"],
        unique=False,
    )
    op.create_index(
        "ix_sensitive_access_requests_requester_type",
        "sensitive_access_requests",
        ["requester_type"],
        unique=False,
    )
    op.create_index(
        "ix_sensitive_access_requests_resource_id",
        "sensitive_access_requests",
        ["resource_id"],
        unique=False,
    )
    op.create_index(
        "ix_sensitive_access_requests_run_id",
        "sensitive_access_requests",
        ["run_id"],
        unique=False,
    )

    op.create_table(
        "approval_tickets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("access_request_id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=True),
        sa.Column("node_run_id", sa.String(length=36), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("waiting_status", sa.String(length=32), nullable=False),
        sa.Column("approved_by", sa.String(length=128), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["access_request_id"], ["sensitive_access_requests.id"]),
        sa.ForeignKeyConstraint(["node_run_id"], ["node_runs.id"]),
        sa.ForeignKeyConstraint(["run_id"], ["runs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("access_request_id"),
    )
    op.create_index(
        "ix_approval_tickets_access_request_id",
        "approval_tickets",
        ["access_request_id"],
        unique=True,
    )
    op.create_index("ix_approval_tickets_created_at", "approval_tickets", ["created_at"], unique=False)
    op.create_index("ix_approval_tickets_node_run_id", "approval_tickets", ["node_run_id"], unique=False)
    op.create_index("ix_approval_tickets_run_id", "approval_tickets", ["run_id"], unique=False)
    op.create_index("ix_approval_tickets_status", "approval_tickets", ["status"], unique=False)
    op.create_index(
        "ix_approval_tickets_waiting_status",
        "approval_tickets",
        ["waiting_status"],
        unique=False,
    )

    op.create_table(
        "notification_dispatches",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("approval_ticket_id", sa.String(length=36), nullable=False),
        sa.Column("channel", sa.String(length=32), nullable=False),
        sa.Column("target", sa.String(length=256), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["approval_ticket_id"], ["approval_tickets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_notification_dispatches_approval_ticket_id",
        "notification_dispatches",
        ["approval_ticket_id"],
        unique=False,
    )
    op.create_index(
        "ix_notification_dispatches_channel",
        "notification_dispatches",
        ["channel"],
        unique=False,
    )
    op.create_index(
        "ix_notification_dispatches_created_at",
        "notification_dispatches",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ix_notification_dispatches_status",
        "notification_dispatches",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_notification_dispatches_status", table_name="notification_dispatches")
    op.drop_index("ix_notification_dispatches_created_at", table_name="notification_dispatches")
    op.drop_index("ix_notification_dispatches_channel", table_name="notification_dispatches")
    op.drop_index(
        "ix_notification_dispatches_approval_ticket_id",
        table_name="notification_dispatches",
    )
    op.drop_table("notification_dispatches")

    op.drop_index("ix_approval_tickets_waiting_status", table_name="approval_tickets")
    op.drop_index("ix_approval_tickets_status", table_name="approval_tickets")
    op.drop_index("ix_approval_tickets_run_id", table_name="approval_tickets")
    op.drop_index("ix_approval_tickets_node_run_id", table_name="approval_tickets")
    op.drop_index("ix_approval_tickets_created_at", table_name="approval_tickets")
    op.drop_index("ix_approval_tickets_access_request_id", table_name="approval_tickets")
    op.drop_table("approval_tickets")

    op.drop_index("ix_sensitive_access_requests_run_id", table_name="sensitive_access_requests")
    op.drop_index(
        "ix_sensitive_access_requests_resource_id",
        table_name="sensitive_access_requests",
    )
    op.drop_index(
        "ix_sensitive_access_requests_requester_type",
        table_name="sensitive_access_requests",
    )
    op.drop_index(
        "ix_sensitive_access_requests_requester_id",
        table_name="sensitive_access_requests",
    )
    op.drop_index(
        "ix_sensitive_access_requests_node_run_id",
        table_name="sensitive_access_requests",
    )
    op.drop_index("ix_sensitive_access_requests_decision", table_name="sensitive_access_requests")
    op.drop_index("ix_sensitive_access_requests_created_at", table_name="sensitive_access_requests")
    op.drop_index(
        "ix_sensitive_access_requests_action_type",
        table_name="sensitive_access_requests",
    )
    op.drop_table("sensitive_access_requests")

    op.drop_index("ix_sensitive_resources_source", table_name="sensitive_resources")
    op.drop_index(
        "ix_sensitive_resources_sensitivity_level",
        table_name="sensitive_resources",
    )
    op.drop_table("sensitive_resources")
