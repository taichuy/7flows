"""add published invocation cache status"""

import sqlalchemy as sa
from alembic import op

revision = "20260312_0018"
down_revision = "20260312_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workflow_published_invocations",
        sa.Column(
            "cache_status",
            sa.String(length=32),
            nullable=False,
            server_default="bypass",
        ),
    )
    op.create_index(
        op.f("ix_workflow_published_invocations_cache_status"),
        "workflow_published_invocations",
        ["cache_status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_workflow_published_invocations_cache_status"),
        table_name="workflow_published_invocations",
    )
    op.drop_column("workflow_published_invocations", "cache_status")
