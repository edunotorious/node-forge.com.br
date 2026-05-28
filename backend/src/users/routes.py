from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.deps import get_current_user
from src.db.models import User
from src.db.session import get_session
from src.users.schemas import ProfileResponse, ProfileUpdate

router = APIRouter(prefix="/users", tags=["users"])

# Avatar caps. 2 MB gives room for higher-resolution JPEGs without becoming
# a vector for abuse; the user-stream feedback rule's 1 MB ceiling applied
# when we were PNG-only.
MAX_AVATAR_BYTES = 2 * 1_048_576

# Accepted formats. Content-Type alone is trivially spoofable so we also
# inspect the magic bytes — `_detect_image_mime` returns the canonical mime
# (or None) and is the source of truth for what gets stored.
ALLOWED_AVATAR_MIMES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
}


def _detect_image_mime(body: bytes) -> str | None:
    """Sniff one of the formats we accept from the leading bytes. The
    returned mime is what gets persisted alongside the bytes; we trust it
    over the multipart's Content-Type so a renamed file can't impersonate
    a format the client didn't actually send."""
    if body.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if body.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if body.startswith(b"GIF87a") or body.startswith(b"GIF89a"):
        return "image/gif"
    # WebP is RIFF...WEBP at offsets 0 and 8 respectively.
    if len(body) >= 12 and body[:4] == b"RIFF" and body[8:12] == b"WEBP":
        return "image/webp"
    return None


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
    # Quick reject by Content-Type so we don't even materialise the body
    # for obvious mismatches (PDFs, SVGs, executables…). The magic-byte
    # check below is the authoritative gate.
    if file.content_type not in ALLOWED_AVATAR_MIMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Avatar must be PNG, JPEG, WebP, or GIF",
        )
    # Read with the cap in mind — pull one byte past the cap to detect
    # over-size uploads without ever materialising the full payload.
    body = await file.read(MAX_AVATAR_BYTES + 1)
    if len(body) > MAX_AVATAR_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Avatar must be at most {MAX_AVATAR_BYTES} bytes",
        )
    sniffed = _detect_image_mime(body)
    if sniffed is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is not a valid PNG, JPEG, WebP, or GIF",
        )
    # Trust the magic-byte sniff over the multipart Content-Type — a
    # renamed JPEG advertised as PNG gets stored as the canonical JPEG
    # mime so the GET endpoint serves the right thing.
    user.avatar_data = body
    user.avatar_mime = sniffed
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
