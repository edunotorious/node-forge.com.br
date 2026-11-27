"""feedback becomes public: anonymous flag

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-26

Feedback is now listed on the public /feedback page. Authors may hide
their name with `anonymous`. Additive with a server default, so the
running backend keeps working while this is applied ahead of the code.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "feedback",
        sa.Column("anonymous", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("feedback", "anonymous")
