"""Feedback schemas."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

from app.core.sanitize import SafeText


class FeedbackRequest(BaseModel):
    # SafeText strips any markup/script payload before it is stored or emailed.
    message: SafeText = Field(min_length=3, max_length=4000)
    # Optional so visitors can leave feedback without identifying themselves.
    email: EmailStr | None = None


class FeedbackResponse(BaseModel):
    id: str
    received: bool = True
