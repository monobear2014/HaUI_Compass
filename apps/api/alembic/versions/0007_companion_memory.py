"""Account-owned confirmed memory and durable companion exchanges."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0007_companion_memory"
down_revision = "0006_learning_preferences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "companion_memories",
        sa.Column("owner", sa.String(128), primary_key=True),
        sa.Column("identifier", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("content", sa.String(400), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "companion_exchanges",
        sa.Column("owner", sa.String(128), primary_key=True),
        sa.Column("identifier", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_table("companion_exchanges")
    op.drop_table("companion_memories")
