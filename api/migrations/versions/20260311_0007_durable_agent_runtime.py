"""add durable agent runtime persistence"""

import sqlalchemy as sa
from alembic import op

revision = "20260311_0007"
down_revision = "20260311_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "runs",
        sa.Column(
            "checkpoint_payload",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )
    op.add_column("runs", sa.Column("current_node_id", sa.String(length=64), nullable=True))
    op.create_index("ix_runs_current_node_id", "runs", ["current_node_id"], unique=False)

    op.add_column(
        "node_runs",
        sa.Column(
            "phase",
            sa.String(length=64),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column(
        "node_runs",
        sa.Column(
            "retry_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "node_runs",
        sa.Column(
            "checkpoint_payload",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )
    op.add_column(
        "node_runs",
        sa.Column(
            "working_context",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )
    op.add_column("node_runs", sa.Column("evidence_context", sa.JSON(), nullable=True))
    op.add_column(
        "node_runs",
        sa.Column(
            "artifact_refs",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )
    op.add_column("node_runs", sa.Column("waiting_reason", sa.Text(), nullable=True))
    op.add_column("node_runs", sa.Column("phase_started_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_node_runs_phase", "node_runs", ["phase"], unique=False)

    op.create_table(
        "run_artifacts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("node_run_id", sa.String(length=36), nullable=True),
        sa.Column("artifact_kind", sa.String(length=64), nullable=False),
        sa.Column("content_type", sa.String(length=32), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("text_content", sa.Text(), nullable=True),
        sa.Column("metadata_payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["node_run_id"], ["node_runs.id"]),
        sa.ForeignKeyConstraint(["run_id"], ["runs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_run_artifacts_run_id", "run_artifacts", ["run_id"], unique=False)
    op.create_index("ix_run_artifacts_node_run_id", "run_artifacts", ["node_run_id"], unique=False)
    op.create_index("ix_run_artifacts_artifact_kind", "run_artifacts", ["artifact_kind"], unique=False)
    op.create_index("ix_run_artifacts_content_type", "run_artifacts", ["content_type"], unique=False)
    op.create_index("ix_run_artifacts_created_at", "run_artifacts", ["created_at"], unique=False)

    op.create_table(
        "tool_call_records",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("node_run_id", sa.String(length=36), nullable=False),
        sa.Column("tool_id", sa.String(length=256), nullable=False),
        sa.Column("tool_name", sa.String(length=256), nullable=False),
        sa.Column("phase", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("request_summary", sa.Text(), nullable=False),
        sa.Column("response_summary", sa.Text(), nullable=True),
        sa.Column("raw_artifact_id", sa.String(length=36), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("retry_count", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["node_run_id"], ["node_runs.id"]),
        sa.ForeignKeyConstraint(["raw_artifact_id"], ["run_artifacts.id"]),
        sa.ForeignKeyConstraint(["run_id"], ["runs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tool_call_records_run_id", "tool_call_records", ["run_id"], unique=False)
    op.create_index("ix_tool_call_records_node_run_id", "tool_call_records", ["node_run_id"], unique=False)
    op.create_index("ix_tool_call_records_tool_id", "tool_call_records", ["tool_id"], unique=False)
    op.create_index("ix_tool_call_records_phase", "tool_call_records", ["phase"], unique=False)
    op.create_index("ix_tool_call_records_status", "tool_call_records", ["status"], unique=False)
    op.create_index(
        "ix_tool_call_records_raw_artifact_id",
        "tool_call_records",
        ["raw_artifact_id"],
        unique=False,
    )

    op.create_table(
        "ai_call_records",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("node_run_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=True),
        sa.Column("model_id", sa.String(length=128), nullable=True),
        sa.Column("input_summary", sa.Text(), nullable=False),
        sa.Column("output_summary", sa.Text(), nullable=True),
        sa.Column("input_artifact_id", sa.String(length=36), nullable=True),
        sa.Column("output_artifact_id", sa.String(length=36), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("token_usage", sa.JSON(), nullable=False),
        sa.Column("cost_payload", sa.JSON(), nullable=False),
        sa.Column("assistant", sa.Boolean(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["input_artifact_id"], ["run_artifacts.id"]),
        sa.ForeignKeyConstraint(["node_run_id"], ["node_runs.id"]),
        sa.ForeignKeyConstraint(["output_artifact_id"], ["run_artifacts.id"]),
        sa.ForeignKeyConstraint(["run_id"], ["runs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_call_records_run_id", "ai_call_records", ["run_id"], unique=False)
    op.create_index("ix_ai_call_records_node_run_id", "ai_call_records", ["node_run_id"], unique=False)
    op.create_index("ix_ai_call_records_role", "ai_call_records", ["role"], unique=False)
    op.create_index("ix_ai_call_records_status", "ai_call_records", ["status"], unique=False)
    op.create_index(
        "ix_ai_call_records_input_artifact_id",
        "ai_call_records",
        ["input_artifact_id"],
        unique=False,
    )
    op.create_index(
        "ix_ai_call_records_output_artifact_id",
        "ai_call_records",
        ["output_artifact_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ai_call_records_output_artifact_id", table_name="ai_call_records")
    op.drop_index("ix_ai_call_records_input_artifact_id", table_name="ai_call_records")
    op.drop_index("ix_ai_call_records_status", table_name="ai_call_records")
    op.drop_index("ix_ai_call_records_role", table_name="ai_call_records")
    op.drop_index("ix_ai_call_records_node_run_id", table_name="ai_call_records")
    op.drop_index("ix_ai_call_records_run_id", table_name="ai_call_records")
    op.drop_table("ai_call_records")

    op.drop_index("ix_tool_call_records_raw_artifact_id", table_name="tool_call_records")
    op.drop_index("ix_tool_call_records_status", table_name="tool_call_records")
    op.drop_index("ix_tool_call_records_phase", table_name="tool_call_records")
    op.drop_index("ix_tool_call_records_tool_id", table_name="tool_call_records")
    op.drop_index("ix_tool_call_records_node_run_id", table_name="tool_call_records")
    op.drop_index("ix_tool_call_records_run_id", table_name="tool_call_records")
    op.drop_table("tool_call_records")

    op.drop_index("ix_run_artifacts_created_at", table_name="run_artifacts")
    op.drop_index("ix_run_artifacts_content_type", table_name="run_artifacts")
    op.drop_index("ix_run_artifacts_artifact_kind", table_name="run_artifacts")
    op.drop_index("ix_run_artifacts_node_run_id", table_name="run_artifacts")
    op.drop_index("ix_run_artifacts_run_id", table_name="run_artifacts")
    op.drop_table("run_artifacts")

    op.drop_index("ix_node_runs_phase", table_name="node_runs")
    with op.batch_alter_table("node_runs") as batch_op:
        batch_op.drop_column("phase_started_at")
        batch_op.drop_column("waiting_reason")
        batch_op.drop_column("artifact_refs")
        batch_op.drop_column("evidence_context")
        batch_op.drop_column("working_context")
        batch_op.drop_column("checkpoint_payload")
        batch_op.drop_column("retry_count")
        batch_op.drop_column("phase")

    op.drop_index("ix_runs_current_node_id", table_name="runs")
    with op.batch_alter_table("runs") as batch_op:
        batch_op.drop_column("current_node_id")
        batch_op.drop_column("checkpoint_payload")
