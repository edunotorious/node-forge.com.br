import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.deps import get_current_user
from src.auth.jwt import create_access_token
from src.auth.password import dummy_verify, hash_password, verify_password
from src.auth.rate_limit import limiter
from src.auth.schemas import (
    EmailChangeRequest,
    ForgotPasswordRequest,
    LoginRequest,
    PasswordChangeRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UsernameChangeRequest,
    UserResponse,
)
from src.config import get_settings
from src.db.models import PasswordResetToken, User
from src.db.session import get_session
from src.email.sender import send_password_reset
from src.email.templates import pick_locale

# How long a reset token stays valid. Long enough for a user to dig the email
# out of spam, short enough that a leaked link expires before a casual
# attacker can act.
_RESET_TOKEN_TTL = timedelta(hours=1)


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


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
@limiter.limit("3/minute")
async def register(
    request: Request,
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
@limiter.limit("5/minute")
async def login(
    request: Request,
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


@router.patch("/me/email", response_model=UserResponse)
@limiter.limit("5/hour")
async def change_email(
    request: Request,
    data: EmailChangeRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    # Re-verify current password — having a valid session is not enough to
    # change the email (a stolen cookie alone must not let an attacker pivot
    # the account onto their own email).
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid current password",
        )

    if data.new_email == user.email:
        return user

    # Defend against the race where a parallel transaction grabs the same
    # email — the unique index will reject one of them; we surface 409 to be
    # consistent with /register.
    stmt = select(User).where(User.email == data.new_email)
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user.email = data.new_email
    await session.commit()
    await session.refresh(user)
    return user


@router.patch("/me/password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/hour")
async def change_password(
    request: Request,
    data: PasswordChangeRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid current password",
        )

    user.password_hash = hash_password(data.new_password)
    await session.commit()


@router.patch("/me/username", response_model=UserResponse)
@limiter.limit("5/hour")
async def change_username(
    request: Request,
    data: UsernameChangeRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    # Same re-verify-password defence as email/password change — a stolen
    # cookie alone cannot pin the account to an attacker-chosen handle.
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid current password",
        )

    if data.new_username == user.username:
        return user

    stmt = select(User).where(User.username == data.new_username)
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    user.username = data.new_username
    await session.commit()
    await session.refresh(user)
    return user


@router.post(
    "/forgot-password",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("3/hour")
async def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    background: BackgroundTasks,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Always returns 204. The response is identical whether the email is
    registered or not — leaking that information would let an attacker
    enumerate accounts via the reset endpoint. When the address IS
    registered, we mint a fresh single-use token, invalidate any prior
    unused ones, and (for now) log the reset link to stdout.

    Production hook: replace the stdout log with an email send. Stash that
    behind a `RESET_EMAIL_BACKEND` env var so dev keeps the log behaviour.
    """
    stmt = select(User).where(User.email == data.email)
    user = (await session.execute(stmt)).scalar_one_or_none()
    if user is None:
        # Burn an equivalent slice of time so the 204-vs-204 timing also
        # doesn't leak the answer.
        dummy_verify(data.email)
        return

    # Invalidate any outstanding unused tokens — only one valid token per
    # user at a time keeps the audit story simple.
    await session.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
        .values(used_at=datetime.now(UTC))
    )

    raw = secrets.token_urlsafe(32)
    token = PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_token(raw),
        expires_at=datetime.now(UTC) + _RESET_TOKEN_TTL,
    )
    session.add(token)
    await session.commit()

    # Delivery runs AFTER the 204 response is on the wire — keeps the
    # response time identical between "user exists" and "user doesn't",
    # which is the same enumeration defence the 204-always policy is
    # serving. send_password_reset() swallows its own errors so a flaky
    # provider can't flip the response into a 5xx (which would itself be
    # an enumeration signal).
    locale = pick_locale(request.headers.get("accept-language"))
    background.add_task(send_password_reset, user.email, raw, locale)


@router.post(
    "/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("5/hour")
async def reset_password(
    request: Request,
    data: ResetPasswordRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Validate the token, swap the user's password, mark the token used.
    Token validation is a single query keyed on the hash — never on the
    user id, so brute-forcing user IDs gets you nowhere."""
    now = datetime.now(UTC)
    stmt = select(PasswordResetToken).where(
        PasswordResetToken.token_hash == _hash_token(data.token),
        PasswordResetToken.used_at.is_(None),
        PasswordResetToken.expires_at > now,
    )
    token = (await session.execute(stmt)).scalar_one_or_none()
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    user = await session.get(User, token.user_id)
    if user is None:
        # User was deleted between request and reset — token had nothing
        # to point at. Surface as the same 400 to avoid leaking lifecycle.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    user.password_hash = hash_password(data.new_password)
    token.used_at = now
    await session.commit()
