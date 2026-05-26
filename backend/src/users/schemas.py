from pydantic import BaseModel, Field, HttpUrl


class ProfileUpdate(BaseModel):
    """All fields optional — PATCH semantics mean "leave unspecified fields
    untouched". Empty string is treated as "clear this field" rather than
    "leave alone" so the UI can offer a delete affordance per row."""

    name: str | None = Field(default=None, max_length=120)
    bio: str | None = Field(default=None, max_length=2000)
    website: str | None = Field(default=None, max_length=255)
    # Free-form list of social URLs / handles. The Figma shows 4 slots;
    # the schema is unbounded so adding a 5th later doesn't need a migration.
    social_accounts: list[str] | None = Field(default=None, max_length=16)
    country: str | None = Field(default=None, max_length=80)
    show_email_on_profile: bool | None = None


class ProfileResponse(BaseModel):
    name: str | None = None
    bio: str | None = None
    website: str | None = None
    social_accounts: list[str] = []
    country: str | None = None
    show_email_on_profile: bool = False

    @classmethod
    def from_profile_json(cls, data: dict | None) -> "ProfileResponse":
        data = data or {}
        return cls(
            name=data.get("name"),
            bio=data.get("bio"),
            website=data.get("website"),
            social_accounts=data.get("social_accounts") or [],
            country=data.get("country"),
            show_email_on_profile=bool(data.get("show_email_on_profile", False)),
        )
