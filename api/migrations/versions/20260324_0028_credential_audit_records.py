"""persist credential audit records

Revision ID: 20260324_0028
Revises: 20260319_0027
"""

import sqlalchemy as sa
from alembic import op

revision = "20260324_0028"
down_revision = "20260319_0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "credential_audit_records",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("credential_id", sa.String(length=36), nullable=False),
        sa.Column("credential_name", sa.String(length=128), nullable=False),
        sa.Column("credential_type", sa.String(length=64), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("actor_type", sa.String(length=32), nullable=False),
        sa.Column("actor_id", sa.String(length=128), nullable=True),
        sa.Column("run_id", sa.String(length=36), nullable=True),
        sa.Column("node_run_id", sa.String(length=36), nullable=True),
        sa.Column(
            "metadata_payload",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["credential_id"], ["credentials.id"]),
        sa.ForeignKeyConstraint(["node_run_id"], ["node_runs.id"]),
        sa.ForeignKeyConstraint(["run_id"], ["runs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_credential_audit_records_credential_id",
        "credential_audit_records",
        ["credential_id"],
        unique=False,
    )
    op.create_index(
        "ix_credential_audit_records_credential_type",
        "credential_audit_records",
        ["credential_type"],
        unique=False,
    )
    op.create_index(
        "ix_credential_audit_records_action",
        "credential_audit_records",
        ["action"],
        unique=False,
    )
    op.create_index(
        "ix_credential_audit_records_actor_type",
        "credential_audit_records",
        ["actor_type"],
        unique=False,
    )
    op.create_index(
        "ix_credential_audit_records_run_id",
        "credential_audit_records",
        ["run_id"],
        unique=False,
    )
    op.create_index(
        "ix_credential_audit_records_node_run_id",
        "credential_audit_records",
        ["node_run_id"],
        unique=False,
    )
    op.create_index(
        "ix_credential_audit_records_created_at",
        "credential_audit_records",
        ["created_at"],
        unique=False,
    )
    op.alter_column("credential_audit_records", "metadata_payload", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_credential_audit_records_created_at", table_name="credential_audit_records")
    op.drop_index("ix_credential_audit_records_node_run_id", table_name="credential_audit_records")
    op.drop_index("ix_credential_audit_records_run_id", table_name="credential_audit_records")
    op.drop_index("ix_credential_audit_records_actor_type", table_name="credential_audit_records")
    op.drop_index("ix_credential_audit_records_action", table_name="credential_audit_records")
    op.drop_index("ix_credential_audit_records_credential_type", table_name="credential_audit_records")
    op.drop_index("ix_credential_audit_records_credential_id", table_name="credential_audit_records")
    op.drop_table("credential_audit_records")
