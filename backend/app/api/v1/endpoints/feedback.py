"""Feedback endpoint — public, with the submitter attached when signed in."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends

from app.api.deps import OptionalUser, get_feedback_repo
from app.db.repositories import FeedbackRepository
from app.schemas.feedback import FeedbackRequest, FeedbackResponse
from app.services import mailer

router = APIRouter(prefix="/feedback", tags=["Feedback"])

FeedbackRepo = Annotated[FeedbackRepository, Depends(get_feedback_repo)]


@router.post("", response_model=FeedbackResponse, status_code=201)
def submit_feedback(
    body: FeedbackRequest,
    user: OptionalUser,
    feedback: FeedbackRepo,
    background: BackgroundTasks,
) -> FeedbackResponse:
    # Prefer the account email when signed in; fall back to what was typed.
    contact = user.email if user else (str(body.email) if body.email else None)
    message = body.message.strip()

    entry = feedback.add(
        message=message,
        email=contact,
        owner_id=user.id if user else None,
    )

    # Deliver after the response is returned — SMTP round-trips (and Gmail's
    # occasional slowness) must not be charged to the submitter's request.
    background.add_task(
        mailer.send_feedback_email,
        message=message,
        reply_to=contact,
        user_label=user.display_name if user else None,
    )

    return FeedbackResponse(id=entry.id)
