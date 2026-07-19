"""Aggregate router for API v1."""

from fastapi import APIRouter

from app.api.v1.endpoints import auth, chat, documents, search, system

router = APIRouter()
router.include_router(system.router)
router.include_router(auth.router)
router.include_router(search.router)
router.include_router(documents.router)
router.include_router(chat.router)
