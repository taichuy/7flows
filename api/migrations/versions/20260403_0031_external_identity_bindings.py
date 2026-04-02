"""persist external identity bindings

Revision ID: 20260403_0031
Revises: 20260331_0030
"""

import sqlalchemy as sa
from alembic import op

revision = "20260403_0031"
down_revision = "20260331_0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "external_identity_bindings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user_accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "provider",
            "subject",
            name="uq_external_identity_bindings_provider_subject",
        ),
        sa.UniqueConstraint(
            "provider",
            "user_id",
            name="uq_external_identity_bindings_provider_user",
        ),
    )
    op.create_index(
        "ix_external_identity_bindings_provider",
        "external_identity_bindings",
        ["provider"],
        unique=False,
    )
    op.create_index(
        "ix_external_identity_bindings_user_id",
        "external_identity_bindings",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_external_identity_bindings_user_id",
        table_name="external_identity_bindings",
    )
    op.drop_index(
        "ix_external_identity_bindings_provider",
        table_name="external_identity_bindings",
    )
    op.drop_table("external_identity_bindings")
