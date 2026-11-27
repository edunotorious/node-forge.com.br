import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth.deps import get_current_user, get_optional_user
from src.auth.rate_limit import per_user_limit
from src.db.models import Feedback, User
from src.db.session import get_session
from src.feedback.schemas import FeedbackCreate, FeedbackPage, FeedbackPublic
from src.vault.schemas import AuthorPublicSummary

router = APIRouter(prefix="/feedback", tags=["feedback"])

# Signed-in users only, and capped, so the wall cannot be flooded.
_feedback_limit = per_user_limit("feedback", "10/hour")


def _to_public(feedback: Feedback, viewer: User | None) -> FeedbackPublic:
    return FeedbackPublic(
        id=feedback.id,
        rating=feedback.rating,
        message=feedback.message,
        created_at=feedback.created_at,
        anonymous=feedback.anonymous,
        author=None if feedback.anonymous else AuthorPublicSummary.from_user(feedback.author),
        mine=viewer is not None and feedback.user_id == viewer.id,
    )


@router.get("", response_model=FeedbackPage)
async def list_feedback(
    session: Annotated[AsyncSession, Depends(get_session)],
    viewer: Annotated[User | None, Depends(get_optional_user)],
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> FeedbackPage:
    """Public community wall: everyone (signed in or not) sees every
    feedback, newest first, plus the overall rating."""
    stmt = (
        select(Feedback)
        .options(selectinload(Feedback.author))
        .order_by(Feedback.created_at.desc(), Feedback.id.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await session.execute(stmt)).scalars().all()
    total, rated, average = (
        await session.execute(
            select(func.count(Feedback.id), func.count(Feedback.rating), func.avg(Feedback.rating))
        )
    ).one()
    return FeedbackPage(
        items=[_to_public(f, viewer) for f in rows],
        total=total,
        average_rating=round(float(average), 2) if average is not None else None,
        rated_count=rated,
    )


@router.post("", response_model=FeedbackPublic, status_code=status.HTTP_201_CREATED)
async def create_feedback(
    data: FeedbackCreate,
    user: Annotated[User, Depends(_feedback_limit)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FeedbackPublic:
    feedback = Feedback(
        user_id=user.id,
        rating=data.rating,
        message=data.message.strip(),
        page=data.page,
        anonymous=data.anonymous,
    )
    session.add(feedback)
    await session.commit()
    await session.refresh(feedback, attribute_names=["created_at", "author"])
    return _to_public(feedback, user)


@router.delete("/{feedback_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_feedback(
    feedback_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Authors can take their own feedback down; nobody else can."""
    feedback = await session.get(Feedback, feedback_id)
    if feedback is None or feedback.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")
    await session.delete(feedback)
    await session.commit()
