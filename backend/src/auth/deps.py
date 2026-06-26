import uuid
from typing import Annotated

import jwt
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.jwt import decode_token
from src.db.models import User
from src.db.session import get_session


def _unauthorized() -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


async def get_current_user(
    session: Annotated[AsyncSession, Depends(get_session)],
    access_token: Annotated[str | None, Cookie()] = None,
) -> User:
    if not access_token:
        raise _unauthorized()
    try:
        payload = decode_token(access_token)
    except jwt.PyJWTError as exc:
        raise _unauthorized() from exc

    sub = payload.get("sub")
    if not isinstance(sub, str):
        raise _unauthorized()
    try:
        user_id = uuid.UUID(sub)
    except (ValueError, TypeError) as exc:
        raise _unauthorized() from exc

    user = await session.get(User, user_id)
    if user is None:
        raise _unauthorized()
    return user


async def get_optional_user(
    session: Annotated[AsyncSession, Depends(get_session)],
    access_token: Annotated[str | None, Cookie()] = None,
) -> User | None:
    """Same as get_current_user, but returns None instead of 401 when the
    caller is unauthenticated or the cookie is invalid/expired.

    Used by public endpoints (e.g. Node Vault list/detail) that still
    want to personalise the response when an authenticated cookie does
    happen to be present — like flagging `liked_by_me` on listings.
    """
    if not access_token:
        return None
    try:
        payload = decode_token(access_token)
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    if not isinstance(sub, str):
        return None
    try:
        user_id = uuid.UUID(sub)
    except (ValueError, TypeError):
        return None
    return await session.get(User, user_id)
