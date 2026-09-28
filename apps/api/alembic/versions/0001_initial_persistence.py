"""Initial typed PostgreSQL persistence schema."""

from alembic import op

from haui_compass.infrastructure.persistence.postgres.models import Base

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Alembic, not application startup, owns schema creation. Generate explicit Alembic
    # operations from the checked-in relational model definitions; do not call create_all().
    for table in Base.metadata.sorted_tables:
        op.create_table(table.name, *table.columns, *table.constraints)
        for index in table.indexes:
            op.create_index(index.name, table.name, [column.name for column in index.columns])


def downgrade() -> None:
    for table in reversed(Base.metadata.sorted_tables):
        for index in table.indexes:
            assert index.name is not None
            op.drop_index(index.name, table_name=table.name)
        op.drop_table(table.name)
