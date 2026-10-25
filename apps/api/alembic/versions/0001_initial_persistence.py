"""Initial typed PostgreSQL persistence schema."""

from alembic import op

from haui_compass.infrastructure.persistence.postgres.models import Base

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

# A migration is a historical snapshot, not a projection of the current ORM metadata.
# Imported-academic tables were introduced by 0002 and must never be created by 0001.
_IMPORTED_ACADEMIC_TABLES = frozenset(
    {
        "academic_sources",
        "imported_courses",
        "imported_assignments",
        "imported_submissions",
        # Introduced by 0003.
        "weekly_goals",
        # Introduced by 0004.
        "simulated_workspaces",
        "task_decomposition_sessions",
        # Introduced by 0005.
        "simulated_submissions",
        # Introduced by 0006.
        "learning_preferences",
        # Introduced by 0007.
        "companion_memories",
        "companion_exchanges",
        "ticket_boards",
        # Introduced by 0009; fresh installs must let that migration create it.
        "companion_conversations",
    }
)


def _initial_tables() -> tuple[object, ...]:
    return tuple(
        table
        for table in Base.metadata.sorted_tables
        if table.name not in _IMPORTED_ACADEMIC_TABLES
    )


def upgrade() -> None:
    # Alembic, not application startup, owns schema creation. Generate explicit Alembic
    # operations from the checked-in relational model definitions; do not call create_all().
    for table in _initial_tables():
        op.create_table(table.name, *table.columns, *table.constraints)
        for index in table.indexes:
            op.create_index(index.name, table.name, [column.name for column in index.columns])


def downgrade() -> None:
    for table in reversed(_initial_tables()):
        for index in table.indexes:
            assert index.name is not None
            op.drop_index(index.name, table_name=table.name)
        op.drop_table(table.name)
