# Multimodal AI Retrieval Platform

A production-grade AI retrieval platform with two capabilities:

- **Phase 1 — Intelligent Multimodal Search**: search the live web with text, images, audio, or any combination. Input is understood *semantically* (transcription, captioning, LLM query refinement), results are re-ranked by meaning, and **every result carries a transparent relevance analysis** — score, confidence level, contributing signals and a plain-language explanation.
- **Phase 2 — Intelligent Document Chat**: upload documents (PDF, DOCX, TXT, Markdown, CSV, Excel, HTML, XML, JSON, source code, …) and converse with them. Answers are **grounded in retrieved document context** with numbered citations that navigate back to the exact source location (page, section, line range). Weak document context can be augmented with live web search.

---

## Architecture

The backend is a layered FastAPI application. Dependencies point strictly inward — API → services → core/ml/db — and every major responsibility lives behind a clear boundary.

```
backend/app/
├── main.py                  # App factory: middleware, routers, lifespan
│
├── core/                    # Infrastructure (imports nothing above itself)
│   ├── config.py            #   Pydantic-settings configuration (.env driven)
│   ├── logging.py           #   Structured logging w/ request-ID propagation
│   ├── exceptions.py        #   Error hierarchy + consistent JSON envelope
│   ├── security.py          #   PBKDF2 password hashing, JWT access/refresh
│   └── middleware.py        #   Request context, rate limit, security headers,
│                            #   body-size guard
├── api/
│   ├── deps.py              # DI: db session, current user, service wiring
│   └── v1/                  # Versioned — v2 can mount alongside later
│       ├── router.py
│       └── endpoints/       # auth, search, documents, chat, system
│
├── schemas/                 # Pydantic API contracts (auth/search/documents/chat)
│
├── services/
│   ├── search/              # Pipeline: understanding → retrieval → ranking
│   │                        #   → transparency (per-stage timing, degradable)
│   ├── providers/           # SearchProvider interface + Serper implementation
│   ├── vector/              # VectorStore interface + persistent FAISS store
│   ├── ingestion/           # Safe upload handling + modality processing
│   ├── rag/                 # parsers → chunking → indexer → retriever → chat
│   └── auth/                # Registration, login, token refresh
│
├── ml/                      # Lazy model registry + inference facade
│   ├── registry.py          #   Thread-safe lazy loading, graceful degradation
│   ├── loaders.py           #   Whisper / CLIP / BLIP / MiniLM / Qwen loaders
│   └── inference.py         #   embed / transcribe / caption / generate
│
└── db/                      # SQLAlchemy: users, documents, chunks, chats
```

**Key design decisions**

- **Lazy ML loading** — the API starts instantly; models load on first use. A missing optional dependency disables one capability instead of crashing the platform (`GET /api/v1/system/capabilities` reports live status).
- **Graceful degradation everywhere** — no embedder? Ranking falls back to lexical signals and the response is flagged `degraded`. No LLM? Document chat returns cited extractive answers. A failing provider category returns empty rather than failing the search.
- **Interfaces over implementations** — `VectorStore` and `SearchProvider` are abstract; FAISS and Serper are swappable details.
- **Search transparency as a contract** — the API schema *requires* per-result signals, confidence and explanations; unexplained ranked lists are structurally impossible.
- **Location-aware RAG** — parsers preserve pages, headings, line ranges and char offsets; chunking keeps them; citations expose them, so the UI can jump to the exact origin of every answer.

## API overview (v1)

| Area | Endpoint | Purpose |
|---|---|---|
| System | `GET /api/v1/system/health` | Liveness |
| | `GET /api/v1/system/capabilities` | Model/provider/feature availability |
| Auth | `POST /api/v1/auth/register` · `login` · `refresh` | JWT access + refresh tokens |
| | `GET /api/v1/auth/me` | Current profile |
| Search | `POST /api/v1/search` | Multimodal search (text and/or file, category filter, limit) |
| Documents | `POST /api/v1/documents` | Upload + index a document |
| | `GET /api/v1/documents` / `{id}` / `{id}/chunks` | List, inspect, browse chunk locations |
| | `POST /api/v1/documents/query` | Semantic search inside your documents |
| | `DELETE /api/v1/documents/{id}` | Remove document, chunks and vectors |
| Chat | `POST /api/v1/chat/sessions` | Start a chat (optionally scoped to documents) |
| | `POST /api/v1/chat/sessions/{id}/ask` | Grounded Q&A with citations + optional web augmentation |
| | `GET/DELETE /api/v1/chat/sessions...` | Manage history |

Interactive docs: `http://127.0.0.1:8000/docs` (disabled automatically in production).

All errors share one envelope:

```json
{ "error": { "code": "not_found", "message": "Document not found", "request_id": "ab12cd34ef56" } }
```

## Setup

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt
copy .env.example .env             # then edit: SECRET_KEY, SERPER_API_KEY
python -m uvicorn app.main:app --reload
```

Notes:
- **FFmpeg** is required for audio transcription — https://www.gyan.dev/ffmpeg/builds/ (add `bin/` to PATH).
- Heavy ML packages (torch, whisper, CLIP…) are optional at runtime: without them the platform still serves search with lexical ranking and extractive document chat.
- `SERPER_API_KEY` (https://serper.dev) enables live web search.

### Frontend

```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

Configure the API base URL in `frontend/.env` if needed:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Security

- JWT authentication (short-lived access + refresh tokens, typed claims)
- PBKDF2-SHA256 password hashing with per-user salts and constant-time verification; login timing does not leak account existence
- Sliding-window rate limiting, body-size limits, security headers, restricted CORS
- Upload hardening: extension allow-lists, magic-byte content validation, sanitised filenames, content-hash storage (no client-controlled paths)
- Per-user resource ownership enforced on every document/chat query
- Logs carry request IDs and redact sensitive fields; internals never leak into error responses

## Configuration

Everything is tunable via environment variables (see `backend/.env.example`): token lifetimes, rate limits, upload caps, chunk size/overlap, retrieval depth, model names, and feature flags (`ENABLE_LOCAL_LLM`, `ENABLE_QUERY_EXPANSION`).

## Extending the platform

| To add… | Touch only… |
|---|---|
| A new search provider (Bing, Brave, …) | `services/providers/` — implement `SearchProvider` |
| A new document format | `services/rag/parsers.py` — one parser function + dispatch entry |
| A new ranking signal | `services/search/ranking.py` + its transparency description |
| A different vector database | `services/vector/` — implement `VectorStore` |
| A new ML model | `ml/loaders.py` — one loader + registration |
| API v2 | `api/v2/` — mount beside v1, no breaking changes |
