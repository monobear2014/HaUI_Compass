"""Initial typed PostgreSQL persistence schema."""

from alembic import op

from haui_compass.infrastructure.persistence.postgres.models import Base

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Alembic, not application startup, owns schema creation. Metadata is explicit and versioned
    # here so the migration remains independent of FastAPI composition.
    Base.metadata.create_all(op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(op.get_bind())
