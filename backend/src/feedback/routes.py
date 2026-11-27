from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.rate_limit import per_user_limit
from src.db.models import Feedback, User
from src.db.session import get_session
from src.feedback.schemas import FeedbackCreate, FeedbackResponse

router = APIRouter(prefix="/feedback", tags=["feedback"])

# Signed-in users only, and capped, so the table cannot be flooded.
_feedback_limit = per_user_limit("feedback", "10/hour")


@router.post("", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
async def create_feedback(
    data: FeedbackCreate,
    user: Annotated[User, Depends(_feedback_limit)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Feedback:
    feedback = Feedback(
        user_id=user.id,
        rating=data.rating,
        message=data.message.strip(),
        page=data.page,
    )
    session.add(feedback)
    await session.commit()
    await session.refresh(feedback)
    return feedback
