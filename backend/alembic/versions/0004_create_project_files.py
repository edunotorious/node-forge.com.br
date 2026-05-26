"""create project_files table and split graph_json out of projects

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-26

Multi-file projects: a project owns N circuit files, each with its own
graph_json. Existing projects are backfilled into a single "Arquivo 1" file
holding the prior graph_json, then `projects.graph_json` is dropped.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # graph_json here CAN take a server_default because `'{}'::jsonb` is
    # bind-param-safe (the regex described in 0003 skips it). That matters for
    # raw INSERTs and for the backfill below — we never want a NOT NULL JSONB
    # column without a fallback.
    op.create_table(
        "project_files",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "project_id",
            sa.Uuid(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "graph_json",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
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
        sa.UniqueConstraint(
            "project_id", "name", name="uq_project_files_project_name"
        ),
    )
    op.create_index(
        "idx_project_files_project_position",
        "project_files",
        ["project_id", "position"],
    )

    # Backfill: every existing project becomes one project_files row named
    # "Arquivo 1" holding the prior graph. `gen_random_uuid()` is built into
    # Postgres 13+ (we run 16) — no extension needed.
    op.execute(
        """
        INSERT INTO project_files (
            id, project_id, name, graph_json, position, created_at, updated_at
        )
        SELECT gen_random_uuid(), id, 'Arquivo 1', graph_json, 0,
               created_at, updated_at
        FROM projects
        """
    )

    op.drop_column("projects", "graph_json")


def downgrade() -> None:
    # Restore graph_json on projects from the first file (position 0) of each
    # project, then drop project_files. Projects with no files lose their
    # graph data — acceptable since the upstream migration owns the lifecycle.
    op.add_column(
        "projects",
        sa.Column(
            "graph_json",
            postgresql.JSONB(),
            nullable=True,
        ),
    )
    op.execute(
        """
        UPDATE projects p
        SET graph_json = pf.graph_json
        FROM project_files pf
        WHERE pf.project_id = p.id AND pf.position = 0
        """
    )
    # Any project with no project_files row gets an empty graph so the NOT
    # NULL alter below does not fail.
    op.execute(
        "UPDATE projects SET graph_json = '{}'::jsonb WHERE graph_json IS NULL"
    )
    op.alter_column("projects", "graph_json", nullable=False)

    op.drop_index(
        "idx_project_files_project_position", table_name="project_files"
    )
    op.drop_table("project_files")
