"""Add explicit account-owned learning preferences; existing data is unchanged."""

import sqlalchemy as sa
from alembic import op

revision = "0006_learning_preferences"
down_revision = "0005_simulated_submissions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "learning_preferences",
        sa.Column("owner", sa.String(128), primary_key=True),
        sa.Column("preferences", sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("learning_preferences")
