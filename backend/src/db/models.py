import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


DEFAULT_GRAPH: dict[str, Any] = {
    "nodes": [],
    "edges": [],
    "config": {"num_qubits": 2, "num_classical": 2, "shots": 1000},
}


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    execution_jobs: Mapped[list["ExecutionJob"]] = relationship(
        "ExecutionJob",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # `onupdate` here is ORM-side: SQLAlchemy stamps func.now() on every
    # session-driven UPDATE. The migration sets the initial server_default for
    # INSERTs; together they keep the column always populated.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    files: Mapped[list["ProjectFile"]] = relationship(
        "ProjectFile",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ProjectFile.position",
    )
    execution_jobs: Mapped[list["ExecutionJob"]] = relationship(
        "ExecutionJob",
        back_populates="project",
        cascade="all, delete-orphan",
    )


class ProjectFile(Base):
    """One circuit/file within a project. A project always has ≥1 file —
    when a project is created the route layer also creates a default
    'Arquivo 1' file holding DEFAULT_GRAPH.
    """

    __tablename__ = "project_files"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_project_files_project_name"),
        Index("idx_project_files_project_position", "project_id", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Dual default (ORM + SQL): ORM path via `default=lambda` populates a real
    # copy of DEFAULT_GRAPH; raw-SQL inserts that bypass the ORM fall back to
    # the column's '{}'::jsonb default rather than violating NOT NULL.
    graph_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: DEFAULT_GRAPH.copy(),
        server_default=text("'{}'::jsonb"),
    )
    position: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    project: Mapped["Project"] = relationship("Project", back_populates="files")


class ExecutionJob(Base):
    __tablename__ = "execution_jobs"
    # Status uses a CHECK constraint instead of a native Postgres ENUM so a
    # new value (e.g., 'cancelled' later) is a one-line migration on the
    # CHECK rather than an ALTER TYPE dance.
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued','running','succeeded','failed','timeout','error')",
            name="execution_jobs_status_check",
        ),
        Index(
            "idx_execution_jobs_user_started",
            "user_id",
            text("started_at DESC"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Denormalized from project.user_id so listing a user's history does not
    # need a JOIN. ON DELETE CASCADE keeps cleanup automatic when the user
    # row is deleted; the project_id cascade handles the project-deletion
    # path independently.
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="queued"
    )
    stdout: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    stderr: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    # Both a Python-side default (for ORM-driven INSERTs) and a SQL-side
    # default in the migration ('[]'::jsonb). See 0003 for the bind-regex
    # analysis explaining why the Phase-5 trap does not apply to this
    # literal. Lista de {kind, source_node_id, data_b64}.
    artifacts_json: Mapped[list[Any]] = mapped_column(
        JSONB, nullable=False, default=lambda: []
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped["User"] = relationship("User", back_populates="execution_jobs")
    project: Mapped["Project"] = relationship(
        "Project", back_populates="execution_jobs"
    )
