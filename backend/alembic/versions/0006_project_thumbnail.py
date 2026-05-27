"""Add thumbnail bytes + mime to projects

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-27

Same inline-bytes pattern as the user avatar (migration 0005): the
endpoint caps PNGs at 1 MB and stores them directly in the row. Object
storage migration is a future task once we see real upload volume.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("thumbnail_data", sa.LargeBinary(), nullable=True),
    )
    op.add_column(
        "projects",
        sa.Column("thumbnail_mime", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("projects", "thumbnail_mime")
    op.drop_column("projects", "thumbnail_data")
