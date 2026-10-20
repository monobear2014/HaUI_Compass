"""Persist each student's weekly goal and declared free study time.

Additive only: one new table. The DDL is written out explicitly (rather than read from the live
ORM model) so later model edits cannot change what this revision creates.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003_weekly_goals"
down_revision = "0002_imported_academic_data"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "weekly_goals",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("goal_text", sa.String(500), nullable=False),
        sa.Column("target_minutes", sa.Integer(), nullable=False),
        # [[starts_at_iso, ends_at_iso], ...] in UTC.
        sa.Column("study_windows", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "student_id", "period_start", "period_end", name="uq_weekly_goal_scope"
        ),
        sa.CheckConstraint("target_minutes >= 0", name="ck_weekly_goal_target"),
    )
    op.create_index("ix_weekly_goals_student", "weekly_goals", ["student_id", "period_start"])


def downgrade() -> None:
    op.drop_index("ix_weekly_goals_student", table_name="weekly_goals")
    op.drop_table("weekly_goals")
