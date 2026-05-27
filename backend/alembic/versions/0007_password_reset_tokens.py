"""create password_reset_tokens table

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-27

Single-use tokens for the /auth/forgot-password + /auth/reset-password
flow. We store SHA-256 of the raw token (not the raw bytes) — DB leaks
should not yield working reset links. Raw token only leaves the server
once, via the email body (or stdout log in dev).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # SHA-256 hex is 64 chars. Unique because lookup is by hash and two
        # users can't share an unhashed token (collision odds are negligible
        # at 32 random bytes, but the constraint surfaces a bug if it ever
        # happens).
        sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    # Index to support "invalidate prior unused tokens for this user" on a
    # new /forgot-password request — cheap O(active-tokens) scan per user.
    op.create_index(
        "idx_password_reset_tokens_user_used",
        "password_reset_tokens",
        ["user_id", "used_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "idx_password_reset_tokens_user_used",
        table_name="password_reset_tokens",
    )
    op.drop_table("password_reset_tokens")
