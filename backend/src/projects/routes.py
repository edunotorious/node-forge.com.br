import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.deps import get_current_user
from src.db.models import Project, User
from src.db.session import get_session
from src.projects.schemas import (
    ProjectCreate,
    ProjectResponse,
    ProjectSummary,
    ProjectUpdate,
)

router = APIRouter(prefix="/projects", tags=["projects"])


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")


async def _get_owned(session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> Project:
    """Load a project and verify ownership. We return 404 (not 403) on miss
    OR on ownership mismatch so an attacker cannot enumerate which project
    IDs belong to other users by status code alone."""
    project = await session.get(Project, project_id)
    if project is None or project.user_id != user_id:
        raise _not_found()
    return project


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
    session.add(project)
    await session.commit()
    await session.refresh(project)
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
    if data.graph_json is not None:
        project.graph_json = data.graph_json
    await session.commit()
    await session.refresh(project)
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
