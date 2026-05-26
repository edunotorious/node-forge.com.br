import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    # 12 follows NIST 2024+ guidance; bcrypt's input cap is 72 bytes, reject
    # longer up front so users do not hit silent truncation later.
    password: str = Field(min_length=12, max_length=72)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.lower().strip()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.lower().strip()


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class EmailChangeRequest(BaseModel):
    # Current password is required even though the user is already
    # authenticated, so a stolen session cookie alone cannot change the
    # account's email and lock the legitimate owner out.
    current_password: str = Field(min_length=1, max_length=128)
    new_email: EmailStr

    @field_validator("new_email")
    @classmethod
    def normalize_new_email(cls, v: str) -> str:
        return v.lower().strip()


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=72)
