"""Separate account-owned assistant conversations without losing existing exchanges."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0009_companion_conversations"
down_revision = "0008_ticket_boards"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "companion_conversations",
        sa.Column("owner", sa.String(128), primary_key=True),
        sa.Column("identifier", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.execute("""INSERT INTO companion_conversations(owner,identifier,title,created_at,updated_at)
        SELECT owner, '00000000-0000-0000-0000-000000000000'::uuid,
        'Cuộc trò chuyện trước đây', MIN(created_at), MAX(created_at)
        FROM companion_exchanges GROUP BY owner""")
    op.add_column(
        "companion_exchanges",
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.execute(
        "UPDATE companion_exchanges SET "
        "conversation_id='00000000-0000-0000-0000-000000000000'::uuid"
    )
    op.create_foreign_key(
        "fk_companion_exchange_conversation",
        "companion_exchanges",
        "companion_conversations",
        ["owner", "conversation_id"],
        ["owner", "identifier"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_companion_conversation_messages",
        "companion_exchanges",
        ["owner", "conversation_id", "created_at", "identifier"],
    )


def downgrade() -> None:
    op.drop_index("ix_companion_conversation_messages", "companion_exchanges")
    op.drop_constraint(
        "fk_companion_exchange_conversation", "companion_exchanges", type_="foreignkey"
    )
    op.drop_column("companion_exchanges", "conversation_id")
    op.drop_table("companion_conversations")
