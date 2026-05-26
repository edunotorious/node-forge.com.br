"""create execution_jobs table

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-10

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # `status` is a free-form VARCHAR(20) gated by a CHECK constraint, not a
    # native Postgres ENUM. Adding a value later = 1 migration that swaps the
    # CHECK; no ALTER TYPE drama, no enum-vs-string identity quirks.
    #
    # `artifacts_json` carries both a SQL-side default (`'[]'::jsonb`) AND a
    # Python-side default on the model. The Phase-5 bind-parameter trap that
    # forbade `server_default` on graph_json does NOT apply here: SQLAlchemy's
    # bind regex (?<![:\w\$\x5c]):([\w\$]+)(?![:\w\$]) skips `::jsonb` because
    # the first colon is followed by `:` (lookahead fails) and the second is
    # preceded by `:` (lookbehind fails). The dual default is intentional
    # defense in depth: ORM INSERTs populate via the Python lambda, raw SQL
    # INSERTs (psql, replication tools, anything bypassing the ORM) get the
    # column filled by Postgres itself instead of failing on NOT NULL.
    op.create_table(
        "execution_jobs",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "project_id",
            sa.Uuid(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="queued",
        ),
        sa.Column("stdout", sa.Text(), nullable=False, server_default=""),
        sa.Column("stderr", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "artifacts_json",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "status IN ('queued','running','succeeded','failed','timeout','error')",
            name="execution_jobs_status_check",
        ),
    )
    op.create_index(
        "idx_execution_jobs_user_started",
        "execution_jobs",
        ["user_id", sa.text("started_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("idx_execution_jobs_user_started", table_name="execution_jobs")
    op.drop_table("execution_jobs")
