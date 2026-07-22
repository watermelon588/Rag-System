"""Authentication schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserProfile(BaseModel):
    id: str
    email: EmailStr
    display_name: str
    created_at: datetime
    bio: str = ""
    avatar_url: str | None = None

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    user: UserProfile
    tokens: TokenPair


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    bio: str | None = Field(default=None, max_length=500)
    avatar_url: str | None = Field(default=None, max_length=2000)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class ProfileStats(BaseModel):
    documents: int
    chat_sessions: int
    searches: int
    saved_results: int


class SearchHistoryItem(BaseModel):
    id: str
    query_text: str
    modality: str
    result_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class SavedResultItem(BaseModel):
    id: str
    category: str
    title: str | None = None
    url: str | None = None
    snippet: str | None = None
    source: str | None = None
    thumbnail_url: str | None = None
    image_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SaveResultRequest(BaseModel):
    category: str = Field(max_length=32)
    title: str | None = Field(default=None, max_length=500)
    url: str | None = Field(default=None, max_length=2000)
    snippet: str | None = Field(default=None, max_length=2000)
    source: str | None = Field(default=None, max_length=500)
    thumbnail_url: str | None = Field(default=None, max_length=2000)
    image_url: str | None = Field(default=None, max_length=2000)
