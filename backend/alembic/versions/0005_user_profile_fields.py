"""Add username, avatar, and Vault-profile fields to users

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-26

Backfill notes
--------------
* `username` is initially NULL — existing users keep their email as their
  identity until they pick one. The unique index treats NULLs as distinct
  per ANSI SQL, so multiple "no-username" users coexist.
* `profile_json` defaults to '{}'::jsonb. ORM-side default also populates
  it on every INSERT (the same dual-default approach used on
  project_files.graph_json in migration 0004).
* `avatar_data` is a BYTEA. PNGs up to 1 MB live there directly. Object
  storage migration is a future task once we know who actually uploads.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("username", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("avatar_data", sa.LargeBinary(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("avatar_mime", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "profile_json",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.create_unique_constraint("uq_users_username", "users", ["username"])


def downgrade() -> None:
    op.drop_constraint("uq_users_username", "users", type_="unique")
    op.drop_column("users", "profile_json")
    op.drop_column("users", "avatar_mime")
    op.drop_column("users", "avatar_data")
    op.drop_column("users", "username")
