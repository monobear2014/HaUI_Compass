"""Account-owned daily ticket order, workload estimates and focus selection."""

import sqlalchemy as sa
from alembic import op

revision = "0008_ticket_boards"
down_revision = "0007_companion_memory"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ticket_boards",
        sa.Column("owner", sa.String(128), primary_key=True),
        sa.Column("scope", sa.String(256), primary_key=True),
        sa.Column("payload", sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("ticket_boards")
