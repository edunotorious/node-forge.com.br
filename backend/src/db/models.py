import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    PrimaryKeyConstraint,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    false,
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
    # NULL until the user picks one. Unique-with-nulls (Postgres treats NULLs
    # as distinct) lets multiple users coexist with no username.
    username: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    # Avatar bytes inlined into the row. PNG only, capped at 1 MB by the
    # upload endpoint; Postgres TOAST handles the compression. Object
    # storage is a future migration once we know who actually uploads.
    avatar_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    avatar_mime: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Free-form public-profile fields (name/bio/website/socials/country/
    # show_email_on_profile). Stored as JSONB so adding fields later is a
    # one-line schema change.
    profile_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: {},
        server_default=text("'{}'::jsonb"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    execution_jobs: Mapped[list["ExecutionJob"]] = relationship(
        "ExecutionJob",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    @property
    def has_avatar(self) -> bool:
        """Exposed as a flag on UserResponse so the client knows whether to
        render the avatar URL without paying for the bytes on every /auth/me.
        """
        return self.avatar_data is not None


class PasswordResetToken(Base):
    """Single-use token for the /auth/forgot-password flow.

    The row stores SHA-256(raw_token), never the raw bytes. The raw token
    only travels in the email body (or the dev stdout log). Used tokens
    stay in the table for audit — the lookup explicitly filters
    `used_at IS NULL AND expires_at > now()`.
    """

    __tablename__ = "password_reset_tokens"
    __table_args__ = (Index("idx_password_reset_tokens_user_used", "user_id", "used_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
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
    # Project tile image — inline PNG bytes (same shape as the user avatar
    # on the `users` row). Capped at 1 MB by the upload endpoint.
    thumbnail_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    thumbnail_mime: Mapped[str | None] = mapped_column(String(64), nullable=True)
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

    @property
    def has_thumbnail(self) -> bool:
        """Exposed on ProjectSummary so the client can decide whether to
        render the thumbnail URL without paying for the bytes on every
        list call."""
        return self.thumbnail_data is not None


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
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
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
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="queued")
    stdout: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    stderr: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    # Both a Python-side default (for ORM-driven INSERTs) and a SQL-side
    # default in the migration ('[]'::jsonb). See 0003 for the bind-regex
    # analysis explaining why the Phase-5 trap does not apply to this
    # literal. Lista de {kind, source_node_id, data_b64}.
    artifacts_json: Mapped[list[Any]] = mapped_column(
        JSONB, nullable=False, default=lambda: [], server_default=text("'[]'::jsonb")
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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
    project: Mapped["Project"] = relationship("Project", back_populates="execution_jobs")


class VaultListing(Base):
    """A published, snapshot copy of a project (one or more files).

    Snapshots are intentional: a listing is what other users see and
    clone, and the author should be able to keep tinkering on the
    original project without breaking studied copies. Re-publishing
    refreshes the snapshot; we don't keep historical versions in MVP.
    """

    __tablename__ = "vault_listings"
    __table_args__ = (
        Index("idx_vault_listings_published_at", "published_at"),
        Index("idx_vault_listings_author_id", "author_id"),
        CheckConstraint("price_cents >= 0", name="ck_vault_listings_price_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    source_project_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    slug: Mapped[str] = mapped_column(String(220), nullable=False, unique=True)
    files_snapshot: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=lambda: [])
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    clone_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    like_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    comment_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # 0 = free. Paid listings are preview-only until checkout exists.
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="BRL")

    author: Mapped["User | None"] = relationship("User", foreign_keys=[author_id])
    tags: Mapped[list["VaultTag"]] = relationship(
        "VaultTag", cascade="all, delete-orphan", back_populates="listing"
    )


class VaultTag(Base):
    __tablename__ = "vault_tags"
    __table_args__ = (
        PrimaryKeyConstraint("listing_id", "tag", name="pk_vault_tags"),
        Index("idx_vault_tags_tag", "tag"),
    )

    listing_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("vault_listings.id", ondelete="CASCADE"), nullable=False
    )
    tag: Mapped[str] = mapped_column(String(50), nullable=False)

    listing: Mapped["VaultListing"] = relationship("VaultListing", back_populates="tags")


class VaultLike(Base):
    __tablename__ = "vault_likes"
    __table_args__ = (
        PrimaryKeyConstraint("user_id", "listing_id", name="pk_vault_likes"),
        Index("idx_vault_likes_listing_id", "listing_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    listing_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("vault_listings.id", ondelete="CASCADE"), nullable=False
    )
    liked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class VaultComment(Base):
    __tablename__ = "vault_comments"
    __table_args__ = (Index("idx_vault_comments_listing_created", "listing_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("vault_listings.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=false())

    author: Mapped["User | None"] = relationship("User", foreign_keys=[author_id])
