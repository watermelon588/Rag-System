"""User profile endpoints: search history and saved results."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, get_saved_result_repo, get_search_history_repo
from app.db.models import SavedResult, new_id
from app.db.repositories import SavedResultRepository, SearchHistoryRepository
from app.schemas.auth import SaveResultRequest, SavedResultItem, SearchHistoryItem

router = APIRouter(prefix="/profile", tags=["Profile"])

HistoryRepo = Annotated[SearchHistoryRepository, Depends(get_search_history_repo)]
SavedRepo = Annotated[SavedResultRepository, Depends(get_saved_result_repo)]


# ------------------------------------------------------------------ history

@router.get("/history", response_model=list[SearchHistoryItem])
def list_history(user: CurrentUser, history: HistoryRepo) -> list[SearchHistoryItem]:
    return [SearchHistoryItem.model_validate(e) for e in history.list_by_owner(user.id)]


@router.delete("/history", status_code=204)
def clear_history(user: CurrentUser, history: HistoryRepo) -> None:
    history.clear(user.id)


@router.delete("/history/{entry_id}", status_code=204)
def delete_history_entry(entry_id: str, user: CurrentUser, history: HistoryRepo) -> None:
    history.delete(user.id, entry_id)


# ------------------------------------------------------------ saved results

@router.get("/saved", response_model=list[SavedResultItem])
def list_saved(user: CurrentUser, saved: SavedRepo) -> list[SavedResultItem]:
    return [SavedResultItem.model_validate(r) for r in saved.list_by_owner(user.id)]


@router.post("/saved", response_model=SavedResultItem, status_code=201)
def save_result(
    body: SaveResultRequest, user: CurrentUser, saved: SavedRepo
) -> SavedResultItem:
    stored = saved.add(
        SavedResult(
            id=new_id(),
            owner_id=user.id,
            category=body.category,
            title=body.title,
            url=body.url,
            snippet=body.snippet,
            source=body.source,
            thumbnail_url=body.thumbnail_url,
            image_url=body.image_url,
        )
    )
    return SavedResultItem.model_validate(stored)


@router.delete("/saved/{result_id}", status_code=204)
def delete_saved(result_id: str, user: CurrentUser, saved: SavedRepo) -> None:
    saved.delete(user.id, result_id)
