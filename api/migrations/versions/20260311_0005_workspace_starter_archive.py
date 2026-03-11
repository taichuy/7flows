"""add workspace starter archive metadata"""

import sqlalchemy as sa
from alembic import op

revision = "20260311_0005"
down_revision = "20260311_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workspace_starter_templates",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("workspace_starter_templates", "archived_at")
