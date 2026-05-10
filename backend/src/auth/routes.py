from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.deps import get_current_user
from src.auth.jwt import create_access_token
from src.auth.password import dummy_verify, hash_password, verify_password
from src.auth.schemas import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from src.config import get_settings
from src.db.models import User
from src.db.session import get_session

router = APIRouter(prefix="/auth", tags=["auth"])

_settings = get_settings()
_COOKIE_NAME = "access_token"


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        max_age=_settings.jwt_expire_days * 86400,
        httponly=True,
        secure=_settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=UserResponse,
)
async def register(
    data: RegisterRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    stmt = select(User).where(User.email == data.email)
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(email=data.email, password_hash=hash_password(data.password))
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TokenResponse:
    stmt = select(User).where(User.email == data.email)
    user = (await session.execute(stmt)).scalar_one_or_none()

    if user is None:
        # Constant-time defense: still run bcrypt to mask the lookup miss.
        dummy_verify(data.password)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    token = create_access_token(user.id)
    _set_auth_cookie(response, token)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
async def me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    response.delete_cookie(
        key=_COOKIE_NAME,
        path="/",
        secure=_settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )
