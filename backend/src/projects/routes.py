import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth.deps import get_current_user
from src.db.models import Project, ProjectFile, User
from src.db.session import get_session
from src.projects.schemas import (
    ProjectCreate,
    ProjectFileCreate,
    ProjectFileResponse,
    ProjectFileUpdate,
    ProjectResponse,
    ProjectSummary,
    ProjectUpdate,
)

router = APIRouter(prefix="/projects", tags=["projects"])


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")


def _file_not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")


async def _get_owned(
    session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID
) -> Project:
    """Load a project (with its files eagerly loaded) and verify ownership.
    Returns 404 on miss OR ownership mismatch so an attacker cannot enumerate
    project IDs by status code alone."""
    stmt = (
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.files))
    )
    project = (await session.execute(stmt)).scalar_one_or_none()
    if project is None or project.user_id != user_id:
        raise _not_found()
    return project


async def _get_owned_file(
    session: AsyncSession,
    project_id: uuid.UUID,
    file_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ProjectFile:
    project = await _get_owned(session, project_id, user_id)
    for f in project.files:
        if f.id == file_id:
            return f
    raise _file_not_found()


# ---------- projects ----------


@router.get("", response_model=list[ProjectSummary])
async def list_projects(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[Project]:
    stmt = select(Project).where(Project.user_id == user.id).order_by(Project.updated_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ProjectResponse)
async def create_project(
    data: ProjectCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Project:
    project = Project(
        user_id=user.id,
        name=data.name,
        description=data.description,
    )
    # Every project starts with a default file so the editor never lands on an
    # empty project with nothing to render.
    project.files.append(ProjectFile(name="Arquivo 1", position=0))
    session.add(project)
    await session.commit()
    await session.refresh(project, attribute_names=["files"])
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Project:
    return await _get_owned(session, project_id, user.id)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    data: ProjectUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Project:
    project = await _get_owned(session, project_id, user.id)
    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    await session.commit()
    await session.refresh(project, attribute_names=["files"])
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    project = await _get_owned(session, project_id, user.id)
    await session.delete(project)
    await session.commit()


# ---------- files ----------


@router.post(
    "/{project_id}/files",
    status_code=status.HTTP_201_CREATED,
    response_model=ProjectFileResponse,
)
async def create_file(
    project_id: uuid.UUID,
    data: ProjectFileCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProjectFile:
    project = await _get_owned(session, project_id, user.id)
    # New file goes to the end. Position is dense (0..N-1) but does not need
    # to stay that way after deletes — gaps are fine, ordering is preserved.
    next_pos = max((f.position for f in project.files), default=-1) + 1
    pf = ProjectFile(project_id=project.id, name=data.name, position=next_pos)
    if data.graph_json is not None:
        pf.graph_json = data.graph_json
    session.add(pf)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A file with that name already exists in this project",
        ) from exc
    await session.refresh(pf)
    return pf


@router.get(
    "/{project_id}/files/{file_id}",
    response_model=ProjectFileResponse,
)
async def get_file(
    project_id: uuid.UUID,
    file_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProjectFile:
    return await _get_owned_file(session, project_id, file_id, user.id)


@router.patch(
    "/{project_id}/files/{file_id}",
    response_model=ProjectFileResponse,
)
async def update_file(
    project_id: uuid.UUID,
    file_id: uuid.UUID,
    data: ProjectFileUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProjectFile:
    pf = await _get_owned_file(session, project_id, file_id, user.id)
    if data.name is not None:
        pf.name = data.name
    if data.graph_json is not None:
        pf.graph_json = data.graph_json
    if data.position is not None:
        pf.position = data.position
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A file with that name already exists in this project",
        ) from exc
    await session.refresh(pf)
    return pf


@router.delete(
    "/{project_id}/files/{file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_file(
    project_id: uuid.UUID,
    file_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    project = await _get_owned(session, project_id, user.id)
    if len(project.files) <= 1:
        # Never leave a project with zero files. The editor depends on at
        # least one file existing to have something to render.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the last file of a project",
        )
    pf = next((f for f in project.files if f.id == file_id), None)
    if pf is None:
        raise _file_not_found()
    await session.delete(pf)
    await session.commit()
