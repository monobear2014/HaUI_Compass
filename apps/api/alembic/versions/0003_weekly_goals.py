"""Persist each student's weekly goal and declared free study time."""

from alembic import op

from haui_compass.infrastructure.persistence.postgres.models import WeeklyGoalRow

revision = "0003_weekly_goals"
down_revision = "0002_imported_academic_data"
branch_labels = None
depends_on = None


def upgrade() -> None:
    table = WeeklyGoalRow.__table__
    op.create_table(table.name, *table.columns, *table.constraints)
    for index in table.indexes:
        op.create_index(index.name, table.name, [column.name for column in index.columns])


def downgrade() -> None:
    table = WeeklyGoalRow.__table__
    for index in table.indexes:
        assert index.name is not None
        op.drop_index(index.name, table_name=table.name)
    op.drop_table(table.name)
