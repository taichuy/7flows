"""add published endpoint invocations"""

import sqlalchemy as sa
from alembic import op

revision = "20260312_0014"
down_revision = "20260312_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workflow_published_invocations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workflow_id", sa.String(length=36), nullable=False),
        sa.Column("binding_id", sa.String(length=36), nullable=False),
        sa.Column("endpoint_id", sa.String(length=64), nullable=False),
        sa.Column("endpoint_alias", sa.String(length=128), nullable=False),
        sa.Column("route_path", sa.String(length=256), nullable=False),
        sa.Column("protocol", sa.String(length=32), nullable=False),
        sa.Column("auth_mode", sa.String(length=32), nullable=False),
        sa.Column("request_source", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("api_key_id", sa.String(length=36), nullable=True),
        sa.Column("run_id", sa.String(length=36), nullable=True),
        sa.Column("run_status", sa.String(length=32), nullable=True),
        sa.Column("error_message", sa.String(length=512), nullable=True),
        sa.Column("request_preview", sa.JSON(), nullable=False),
        sa.Column("response_preview", sa.JSON(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["api_key_id"], ["workflow_published_api_keys.id"]),
        sa.ForeignKeyConstraint(["binding_id"], ["workflow_published_endpoints.id"]),
        sa.ForeignKeyConstraint(["run_id"], ["runs.id"]),
        sa.ForeignKeyConstraint(["workflow_id"], ["workflows.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_workflow_published_invocations_workflow_id",
        "workflow_published_invocations",
        ["workflow_id"],
        unique=False,
    )
    op.create_index(
        "ix_workflow_published_invocations_binding_id",
        "workflow_published_invocations",
        ["binding_id"],
        unique=False,
    )
    op.create_index(
        "ix_workflow_published_invocations_endpoint_id",
        "workflow_published_invocations",
        ["endpoint_id"],
        unique=False,
    )
    op.create_index(
        "ix_workflow_published_invocations_endpoint_alias",
        "workflow_published_invocations",
        ["endpoint_alias"],
        unique=False,
    )
    op.create_index(
        "ix_workflow_published_invocations_route_path",
        "workflow_published_invocations",
        ["route_path"],
        unique=False,
    )
    op.create_index(
        "ix_workflow_published_invocations_request_source",
        "workflow_published_invocations",
        ["request_source"],
        unique=False,
    )
    op.create_index(
        "ix_workflow_published_invocations_status",
        "workflow_published_invocations",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_workflow_published_invocations_api_key_id",
        "workflow_published_invocations",
        ["api_key_id"],
        unique=False,
    )
    op.create_index(
        "ix_workflow_published_invocations_run_id",
        "workflow_published_invocations",
        ["run_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_workflow_published_invocations_run_id",
        table_name="workflow_published_invocations",
    )
    op.drop_index(
        "ix_workflow_published_invocations_api_key_id",
        table_name="workflow_published_invocations",
    )
    op.drop_index(
        "ix_workflow_published_invocations_status",
        table_name="workflow_published_invocations",
    )
    op.drop_index(
        "ix_workflow_published_invocations_request_source",
        table_name="workflow_published_invocations",
    )
    op.drop_index(
        "ix_workflow_published_invocations_route_path",
        table_name="workflow_published_invocations",
    )
    op.drop_index(
        "ix_workflow_published_invocations_endpoint_alias",
        table_name="workflow_published_invocations",
    )
    op.drop_index(
        "ix_workflow_published_invocations_endpoint_id",
        table_name="workflow_published_invocations",
    )
    op.drop_index(
        "ix_workflow_published_invocations_binding_id",
        table_name="workflow_published_invocations",
    )
    op.drop_index(
        "ix_workflow_published_invocations_workflow_id",
        table_name="workflow_published_invocations",
    )
    op.drop_table("workflow_published_invocations")
