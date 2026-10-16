"""Per-account simulated workspaces and durable task-decomposition candidate sessions.

Additive only: two new tables, no change to existing tables or rows. The DDL is written out
explicitly so later ORM edits cannot silently change what this revision creates.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_simulated_workspaces"
down_revision = "0003_weekly_goals"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "simulated_workspaces",
        sa.Column("owner_id", sa.String(64), primary_key=True),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.Column("anchor", sa.DateTime(timezone=True), nullable=False),
        sa.Column("virtual_now", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("generation >= 1", name="ck_simulated_workspace_generation"),
        sa.CheckConstraint("virtual_now >= anchor", name="ck_simulated_workspace_clock"),
    )
    op.create_table(
        "task_decomposition_sessions",
        sa.Column("session_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session", sa.JSON(), nullable=False),
        sa.Column("confirmation", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_task_decomposition_sessions_student", "task_decomposition_sessions", ["student_id"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_task_decomposition_sessions_student", table_name="task_decomposition_sessions"
    )
    op.drop_table("task_decomposition_sessions")
    op.drop_table("simulated_workspaces")
