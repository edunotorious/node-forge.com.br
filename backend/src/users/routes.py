from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.deps import get_current_user
from src.db.models import User
from src.db.session import get_session
from src.users.schemas import ProfileResponse, ProfileUpdate

router = APIRouter(prefix="/users", tags=["users"])

# Avatar caps. 1 MB matches the user-stream feedback rule and gives users
# room for a reasonable PNG. PNG-only for v1 — the Figma's profile copy
# explicitly says "PNG of size up to X", so JPEG/WEBP can wait.
MAX_AVATAR_BYTES = 1_048_576
ALLOWED_AVATAR_MIMES = {"image/png"}


@router.get("/me/profile", response_model=ProfileResponse)
async def get_profile(
    user: Annotated[User, Depends(get_current_user)],
) -> ProfileResponse:
    return ProfileResponse.from_profile_json(user.profile_json)


@router.patch("/me/profile", response_model=ProfileResponse)
async def update_profile(
    data: ProfileUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProfileResponse:
    # Merge: only fields the client actually sent get applied. None means
    # "leave alone" (PATCH semantics); empty string means "clear".
    merged = dict(user.profile_json or {})
    payload = data.model_dump(exclude_unset=True)
    for key, value in payload.items():
        if value is None:
            merged.pop(key, None)
        else:
            merged[key] = value
    user.profile_json = merged
    await session.commit()
    await session.refresh(user)
    return ProfileResponse.from_profile_json(user.profile_json)


@router.put("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
async def upload_avatar(
    file: Annotated[UploadFile, File()],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    if file.content_type not in ALLOWED_AVATAR_MIMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Avatar must be a PNG",
        )
    # Read with the cap in mind — pull one byte past the cap to detect
    # over-size uploads without ever materialising the full payload.
    body = await file.read(MAX_AVATAR_BYTES + 1)
    if len(body) > MAX_AVATAR_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Avatar must be at most {MAX_AVATAR_BYTES} bytes",
        )
    # Trust the magic bytes a bit too — PNGs always start with this 8-byte
    # signature. Stops trivially-renamed JPEGs/SVGs from sneaking through.
    if not body.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is not a valid PNG",
        )
    user.avatar_data = body
    user.avatar_mime = file.content_type
    await session.commit()


@router.delete("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
async def delete_avatar(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    user.avatar_data = None
    user.avatar_mime = None
    await session.commit()


@router.get("/me/avatar")
async def get_avatar(
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    if user.avatar_data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No avatar set"
        )
    return Response(
        content=user.avatar_data,
        media_type=user.avatar_mime or "image/png",
        # The avatar mutates on upload — disable caching so the TopBar
        # picks up new bytes immediately after a PUT.
        headers={"Cache-Control": "no-store"},
    )
