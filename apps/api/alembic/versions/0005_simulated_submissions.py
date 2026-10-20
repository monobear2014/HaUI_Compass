"""Add explicit submission timestamps; do not derive them from task completion."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005_simulated_submissions"
down_revision = "0004_simulated_workspaces"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "simulated_submissions",
        sa.Column("student_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("assignment_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("simulated_submissions")
