"""persist tool call response contract

Revision ID: 20260319_0027
Revises: 20260319_0026
"""

import sqlalchemy as sa
from alembic import op

revision = "20260319_0027"
down_revision = "20260319_0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tool_call_records",
        sa.Column("response_content_type", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "tool_call_records",
        sa.Column(
            "response_meta",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("tool_call_records", "response_meta")
    op.drop_column("tool_call_records", "response_content_type")
