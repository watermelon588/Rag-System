"""Grounded document chat.

Answers are generated strictly from retrieved chunks, with numbered
citations mapping back to exact document locations. When no local LLM is
available the service degrades to an extractive answer built from the
best-matching passages — still grounded, still cited. Weakly grounded
questions can optionally be augmented with live web search.
"""

from __future__ import annotations

import re

from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.db.models import ChatMessage, ChatSession, new_id, utcnow
from app.db.repositories import ChatRepository
from app.ml import generation
from app.schemas.chat import AskResponse, ChatMessageOut, Citation, RetrievalDebug
from app.schemas.search import ResultCategory
from app.services.providers.base import SearchProvider
from app.services.rag.retriever import ChunkRetriever, RetrievedChunk

logger = get_logger(__name__)

_SYSTEM_PROMPT = (
    "You are a document assistant. Answer ONLY from the numbered context "
    "passages provided. Cite passages inline with their bracket numbers, "
    "e.g. [1] or [2][3]. If the context does not contain the answer, say "
    "so explicitly instead of guessing."
)

_NO_CONTEXT_ANSWER = (
    "I couldn't find anything in your documents that answers this question. "
    "Try rephrasing it, uploading a relevant document, or enabling web search."
)


class DocumentChatService:
    def __init__(
        self,
        chat: ChatRepository,
        retriever: ChunkRetriever,
        web_provider: SearchProvider | None = None,
    ):
        self._chat = chat
        self._retriever = retriever
        self._web_provider = web_provider

    # ------------------------------------------------------------- sessions

    def create_session(
        self, owner_id: str, title: str | None, document_ids: list[str] | None
    ) -> ChatSession:
        return self._chat.create_session(owner_id, title or "New conversation", document_ids)

    def get_session(self, owner_id: str, session_id: str) -> ChatSession:
        session = self._chat.get_session(owner_id, session_id)
        if session is None:
            raise NotFoundError("Chat session not found")
        return session

    def list_sessions(self, owner_id: str) -> list[ChatSession]:
        return self._chat.list_sessions(owner_id)

    def list_messages(self, session_id: str) -> list[ChatMessage]:
        return self._chat.list_messages(session_id)

    def delete_session(self, owner_id: str, session_id: str) -> None:
        self.get_session(owner_id, session_id)  # ownership check
        self._chat.delete_session(session_id)

    # ----------------------------------------------------------------- chat

    def ask(
        self, owner_id: str, session_id: str, question: str, use_web_search: bool = False
    ) -> AskResponse:
        settings = get_settings()
        session = self.get_session(owner_id, session_id)

        chunks = self._retriever.retrieve(
            owner_id,
            question,
            document_ids=session.document_ids,
            top_k=settings.rag_top_k,
        )
        usable = [chunk for chunk in chunks if chunk.similarity >= settings.rag_min_score]
        top_similarity = chunks[0].similarity if chunks else 0.0
        grounded = bool(usable)

        web_results = None
        web_augmented = False
        if use_web_search and self._web_provider and self._web_provider.is_configured():
            if not grounded or top_similarity < settings.web_augmentation_threshold:
                web_results = self._fetch_web_context(question)
                web_augmented = bool(web_results)

        if grounded:
            answer, citations = self._generate_answer(session, question, usable)
            confidence = round(min(1.0, top_similarity), 3)
        else:
            answer = _NO_CONTEXT_ANSWER
            if web_augmented:
                answer += " I've attached live web results that may help."
            citations = []
            confidence = 0.0

        # Persist the user turn and the assistant turn.
        self._chat.add_message(
            ChatMessage(id=new_id(), session_id=session.id, role="user", content=question)
        )
        assistant_message = ChatMessage(
            id=new_id(),
            session_id=session.id,
            role="assistant",
            content=answer,
            citations=[citation.model_dump() for citation in citations] or None,
            confidence=confidence,
            created_at=utcnow(),
        )
        self._chat.add_message(assistant_message)

        updates: dict = {"updated_at": utcnow()}
        if session.title == "New conversation":
            updates["title"] = question[:80] + ("…" if len(question) > 80 else "")
        self._chat.update_session(session.id, updates)

        return AskResponse(
            session_id=session.id,
            message=ChatMessageOut.model_validate(assistant_message),
            retrieval=RetrievalDebug(
                chunks_considered=len(chunks),
                chunks_used=len(usable),
                top_similarity=round(top_similarity, 3),
                grounded=grounded,
                web_augmented=web_augmented,
            ),
            web_results=web_results,
        )

    # ------------------------------------------------------------ internals

    def _history_block(self, session: ChatSession) -> str:
        window = get_settings().chat_history_window
        recent = self._chat.recent_messages(session.id, window)
        if not recent:
            return ""
        lines = [
            f"{'User' if message.role == 'user' else 'Assistant'}: {message.content[:400]}"
            for message in recent
        ]
        return "Conversation so far:\n" + "\n".join(lines) + "\n\n"

    def _generate_answer(
        self, session: ChatSession, question: str, chunks: list[RetrievedChunk]
    ) -> tuple[str, list[Citation]]:
        context_blocks = []
        for index, chunk in enumerate(chunks, start=1):
            where = chunk.location
            origin = where.document_name
            if where.page_number:
                origin += f", page {where.page_number}"
            if where.section:
                origin += f", section '{where.section}'"
            context_blocks.append(f"[{index}] ({origin})\n{chunk.text}")

        prompt = (
            self._history_block(session)
            + "Context passages:\n\n"
            + "\n\n".join(context_blocks)
            + f"\n\nQuestion: {question}\n\nAnswer with inline [n] citations:"
        )

        generated = generation.generate(prompt, system=_SYSTEM_PROMPT)

        if generated:
            answer = generated.strip()
            cited_markers = self._extract_markers(answer, len(chunks))
            if not cited_markers:
                answer += " [1]"
                cited_markers = [1]
        else:
            answer, cited_markers = self._extractive_answer(chunks)

        citations = [
            Citation(
                marker=marker,
                location=chunks[marker - 1].location,
                quoted_text=self._trim_quote(chunks[marker - 1].text),
                similarity=round(chunks[marker - 1].similarity, 3),
            )
            for marker in cited_markers
        ]
        return answer, citations

    @staticmethod
    def _extract_markers(answer: str, max_marker: int) -> list[int]:
        markers = []
        for match in re.findall(r"\[(\d{1,2})\]", answer):
            value = int(match)
            if 1 <= value <= max_marker and value not in markers:
                markers.append(value)
        return markers

    @staticmethod
    def _extractive_answer(chunks: list[RetrievedChunk]) -> tuple[str, list[int]]:
        """No-LLM fallback: present the best passages verbatim, cited."""
        top = chunks[:3]
        lines = ["Based on your documents, the most relevant passages are:"]
        for index, chunk in enumerate(top, start=1):
            where = chunk.location
            origin = where.document_name
            if where.page_number:
                origin += f" (page {where.page_number})"
            snippet = chunk.text[:400] + ("…" if len(chunk.text) > 400 else "")
            lines.append(f"\n{index}. From {origin} [{index}]:\n\"{snippet}\"")
        return "\n".join(lines), list(range(1, len(top) + 1))

    @staticmethod
    def _trim_quote(text: str, limit: int = 300) -> str:
        return text if len(text) <= limit else text[: limit - 1] + "…"

    def _fetch_web_context(self, question: str) -> list[dict] | None:
        try:
            results = self._web_provider.search(question, [ResultCategory.WEB], limit=5)
            return [
                {"title": item.title, "url": item.url, "snippet": item.snippet}
                for item in results.get(ResultCategory.WEB, [])
            ] or None
        except Exception as exc:  # noqa: BLE001 — augmentation is best-effort
            logger.warning("Web augmentation failed: %s", exc)
            return None
