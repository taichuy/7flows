"""add published endpoint alias and path"""

import sqlalchemy as sa
from alembic import op

revision = "20260312_0013"
down_revision = "20260312_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workflow_published_endpoints",
        sa.Column("endpoint_alias", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "workflow_published_endpoints",
        sa.Column("route_path", sa.String(length=256), nullable=True),
    )
    op.execute(
        "UPDATE workflow_published_endpoints "
        "SET endpoint_alias = endpoint_id "
        "WHERE endpoint_alias IS NULL"
    )
    op.execute(
        "UPDATE workflow_published_endpoints "
        "SET route_path = '/' || endpoint_id "
        "WHERE route_path IS NULL"
    )
    op.alter_column(
        "workflow_published_endpoints",
        "endpoint_alias",
        existing_type=sa.String(length=128),
        nullable=False,
    )
    op.alter_column(
        "workflow_published_endpoints",
        "route_path",
        existing_type=sa.String(length=256),
        nullable=False,
    )
    op.create_index(
        "ix_workflow_published_endpoints_endpoint_alias",
        "workflow_published_endpoints",
        ["endpoint_alias"],
        unique=False,
    )
    op.create_index(
        "ix_workflow_published_endpoints_route_path",
        "workflow_published_endpoints",
        ["route_path"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_workflow_published_endpoints_version_alias",
        "workflow_published_endpoints",
        ["workflow_version_id", "endpoint_alias"],
    )
    op.create_unique_constraint(
        "uq_workflow_published_endpoints_version_path",
        "workflow_published_endpoints",
        ["workflow_version_id", "route_path"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_workflow_published_endpoints_version_path",
        "workflow_published_endpoints",
        type_="unique",
    )
    op.drop_constraint(
        "uq_workflow_published_endpoints_version_alias",
        "workflow_published_endpoints",
        type_="unique",
    )
    op.drop_index(
        "ix_workflow_published_endpoints_route_path",
        table_name="workflow_published_endpoints",
    )
    op.drop_index(
        "ix_workflow_published_endpoints_endpoint_alias",
        table_name="workflow_published_endpoints",
    )
    op.drop_column("workflow_published_endpoints", "route_path")
    op.drop_column("workflow_published_endpoints", "endpoint_alias")
