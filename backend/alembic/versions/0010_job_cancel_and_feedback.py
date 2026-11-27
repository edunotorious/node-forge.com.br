"""job cancellation and in-app feedback

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-26

* execution_jobs.status accepts 'cancelled' (the editor's Stop button).
  The CHECK only widens, so the running backend keeps working while this
  migration is applied ahead of the new code.
* New `feedback` table for the in-app Feedback button.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD = "status IN ('queued','running','succeeded','failed','timeout','error')"
_NEW = "status IN ('queued','running','succeeded','failed','timeout','error','cancelled')"


def upgrade() -> None:
    op.drop_constraint("execution_jobs_status_check", "execution_jobs", type_="check")
    op.create_check_constraint("execution_jobs_status_check", "execution_jobs", _NEW)

    op.create_table(
        "feedback",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("page", sa.String(length=200), nullable=False, server_default=""),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "rating IS NULL OR (rating BETWEEN 1 AND 5)", name="ck_feedback_rating_range"
        ),
    )
    op.create_index("idx_feedback_created", "feedback", ["created_at"])


def downgrade() -> None:
    op.drop_index("idx_feedback_created", table_name="feedback")
    op.drop_table("feedback")
    op.execute("UPDATE execution_jobs SET status = 'error' WHERE status = 'cancelled'")
    op.drop_constraint("execution_jobs_status_check", "execution_jobs", type_="check")
    op.create_check_constraint("execution_jobs_status_check", "execution_jobs", _OLD)
