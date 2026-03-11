"""add publish endpoint cache policy and cache entries"""

import sqlalchemy as sa
from alembic import op

revision = "20260312_0017"
down_revision = "20260312_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workflow_published_endpoints",
        sa.Column("cache_policy", sa.JSON(), nullable=True),
    )
    op.create_table(
        "workflow_published_cache_entries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workflow_id", sa.String(length=36), nullable=False),
        sa.Column("binding_id", sa.String(length=36), nullable=False),
        sa.Column("endpoint_id", sa.String(length=64), nullable=False),
        sa.Column("cache_key", sa.String(length=64), nullable=False),
        sa.Column("response_payload", sa.JSON(), nullable=False),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_hit_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["binding_id"], ["workflow_published_endpoints.id"]),
        sa.ForeignKeyConstraint(["workflow_id"], ["workflows.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "binding_id",
            "cache_key",
            name="uq_workflow_published_cache_entries_binding_cache_key",
        ),
    )
    op.create_index(
        op.f("ix_workflow_published_cache_entries_binding_id"),
        "workflow_published_cache_entries",
        ["binding_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_workflow_published_cache_entries_cache_key"),
        "workflow_published_cache_entries",
        ["cache_key"],
        unique=False,
    )
    op.create_index(
        op.f("ix_workflow_published_cache_entries_endpoint_id"),
        "workflow_published_cache_entries",
        ["endpoint_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_workflow_published_cache_entries_expires_at"),
        "workflow_published_cache_entries",
        ["expires_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_workflow_published_cache_entries_workflow_id"),
        "workflow_published_cache_entries",
        ["workflow_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_workflow_published_cache_entries_workflow_id"),
        table_name="workflow_published_cache_entries",
    )
    op.drop_index(
        op.f("ix_workflow_published_cache_entries_expires_at"),
        table_name="workflow_published_cache_entries",
    )
    op.drop_index(
        op.f("ix_workflow_published_cache_entries_endpoint_id"),
        table_name="workflow_published_cache_entries",
    )
    op.drop_index(
        op.f("ix_workflow_published_cache_entries_cache_key"),
        table_name="workflow_published_cache_entries",
    )
    op.drop_index(
        op.f("ix_workflow_published_cache_entries_binding_id"),
        table_name="workflow_published_cache_entries",
    )
    op.drop_table("workflow_published_cache_entries")
    op.drop_column("workflow_published_endpoints", "cache_policy")
