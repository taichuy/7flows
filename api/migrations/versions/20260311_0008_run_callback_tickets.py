"""add run callback tickets"""

import sqlalchemy as sa
from alembic import op

revision = "20260311_0008"
down_revision = "20260311_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "run_callback_tickets",
        sa.Column("id", sa.String(length=96), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("node_run_id", sa.String(length=36), nullable=False),
        sa.Column("tool_call_id", sa.String(length=36), nullable=True),
        sa.Column("tool_id", sa.String(length=256), nullable=True),
        sa.Column("tool_call_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "waiting_status",
            sa.String(length=32),
            nullable=False,
            server_default="waiting_callback",
        ),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("callback_payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["node_run_id"], ["node_runs.id"]),
        sa.ForeignKeyConstraint(["run_id"], ["runs.id"]),
        sa.ForeignKeyConstraint(["tool_call_id"], ["tool_call_records.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_run_callback_tickets_run_id",
        "run_callback_tickets",
        ["run_id"],
        unique=False,
    )
    op.create_index(
        "ix_run_callback_tickets_node_run_id",
        "run_callback_tickets",
        ["node_run_id"],
        unique=False,
    )
    op.create_index(
        "ix_run_callback_tickets_tool_call_id",
        "run_callback_tickets",
        ["tool_call_id"],
        unique=False,
    )
    op.create_index(
        "ix_run_callback_tickets_tool_id",
        "run_callback_tickets",
        ["tool_id"],
        unique=False,
    )
    op.create_index(
        "ix_run_callback_tickets_status",
        "run_callback_tickets",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_run_callback_tickets_created_at",
        "run_callback_tickets",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_run_callback_tickets_created_at", table_name="run_callback_tickets")
    op.drop_index("ix_run_callback_tickets_status", table_name="run_callback_tickets")
    op.drop_index("ix_run_callback_tickets_tool_id", table_name="run_callback_tickets")
    op.drop_index("ix_run_callback_tickets_tool_call_id", table_name="run_callback_tickets")
    op.drop_index("ix_run_callback_tickets_node_run_id", table_name="run_callback_tickets")
    op.drop_index("ix_run_callback_tickets_run_id", table_name="run_callback_tickets")
    op.drop_table("run_callback_tickets")
