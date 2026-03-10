"""persist plugin adapters and compat tool catalog"""

import sqlalchemy as sa
from alembic import op

revision = "20260310_0003"
down_revision = "20260309_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plugin_adapters",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("ecosystem", sa.String(length=64), nullable=False),
        sa.Column("endpoint", sa.String(length=512), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("healthcheck_path", sa.String(length=128), nullable=False),
        sa.Column("workspace_ids", sa.JSON(), nullable=False),
        sa.Column("plugin_kinds", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_plugin_adapters_ecosystem",
        "plugin_adapters",
        ["ecosystem"],
        unique=False,
    )

    op.create_table(
        "plugin_tools",
        sa.Column("id", sa.String(length=256), nullable=False),
        sa.Column("adapter_id", sa.String(length=128), nullable=True),
        sa.Column("ecosystem", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("input_schema", sa.JSON(), nullable=False),
        sa.Column("output_schema", sa.JSON(), nullable=True),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("plugin_meta", sa.JSON(), nullable=True),
        sa.Column("constrained_ir", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_plugin_tools_adapter_id",
        "plugin_tools",
        ["adapter_id"],
        unique=False,
    )
    op.create_index(
        "ix_plugin_tools_ecosystem",
        "plugin_tools",
        ["ecosystem"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_plugin_tools_ecosystem", table_name="plugin_tools")
    op.drop_index("ix_plugin_tools_adapter_id", table_name="plugin_tools")
    op.drop_table("plugin_tools")

    op.drop_index("ix_plugin_adapters_ecosystem", table_name="plugin_adapters")
    op.drop_table("plugin_adapters")
