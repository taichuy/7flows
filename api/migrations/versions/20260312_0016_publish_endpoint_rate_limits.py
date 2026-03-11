"""add publish endpoint rate limit policy"""

import sqlalchemy as sa
from alembic import op

revision = "20260312_0016"
down_revision = "20260312_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workflow_published_endpoints",
        sa.Column("rate_limit_policy", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("workflow_published_endpoints", "rate_limit_policy")
