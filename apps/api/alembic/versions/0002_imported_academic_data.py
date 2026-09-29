"""Persist user-provided pilot academic data as normalized relations."""

from alembic import op

from haui_compass.infrastructure.persistence.postgres.models import (
    AcademicSourceRow,
    ImportedAssignmentRow,
    ImportedCourseRow,
    ImportedSubmissionRow,
)

revision = "0002_imported_academic_data"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def _create(model: type[AcademicSourceRow]) -> None:
    table = model.__table__
    op.create_table(table.name, *table.columns, *table.constraints)
    for index in table.indexes:
        op.create_index(index.name, table.name, [column.name for column in index.columns])


def upgrade() -> None:
    _create(AcademicSourceRow)
    _create(ImportedCourseRow)
    _create(ImportedAssignmentRow)
    _create(ImportedSubmissionRow)


def downgrade() -> None:
    for model in (
        ImportedSubmissionRow,
        ImportedAssignmentRow,
        ImportedCourseRow,
        AcademicSourceRow,
    ):
        table = model.__table__
        for index in table.indexes:
            assert index.name is not None
            op.drop_index(index.name, table_name=table.name)
        op.drop_table(table.name)
