# Multimodal AI Retrieval Platform

A production-grade AI retrieval platform with two capabilities:

- **Phase 1 — Genuine Hybrid Multimodal Search**: search the live web with text and/or *any combination* of files — `image + query`, `audio + image + query`, and so on. Every input is fused into **one CLIP cross-modal query vector** (the picture's actual pixels, not a lossy caption) *plus* a keyword query. Image and video results are then **re-ranked by real visual similarity** — the query image is compared to each result's thumbnail in CLIP space — blended with dense-embedding, Okapi BM25 keyword and provider-position signals. Results are paginated ("load more"), and **every result carries a transparent relevance analysis** — score, confidence level, contributing signals (including `visual_similarity`) and a plain-language explanation.
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
│   ├── security.py          #   PBKDF2 hashing, JWT access/refresh, auth cookies
│   └── middleware.py        #   Request context, rate limit, security headers,
│                            #   body-size guard
├── api/
│   ├── deps.py              # DI: Mongo db, repositories, current user, services
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
└── db/                      # MongoDB: client, repositories, domain models
                             #   (users, documents, chunks, chat sessions/messages)
```

The visual system (monochrome + electric-blue accent, shared background/navbar,
magnetic cursor) is documented separately in [design.md](design.md).

**Key design decisions**

- **Lazy ML loading** — the API starts instantly; models load on first use. A missing optional dependency disables one capability instead of crashing the platform (`GET /api/v1/system/capabilities` reports live status).
- **Pluggable, fast text generation** — chat and query-refinement resolve through a provider chain (`ml/generation.py`): **Groq** hosted models (sub-second) when `GROQ_API_KEY` is set → a small local model → extractive fallback. Set the key and document chat replies in seconds instead of minutes on CPU.
- **Graceful degradation everywhere** — no embedder? Ranking falls back to BM25 keyword signals and the response is flagged `degraded`. No generator? Document chat returns cited extractive answers, and query refinement is skipped. A failing provider category returns empty rather than failing the search.
- **Interfaces over implementations** — `VectorStore` and `SearchProvider` are abstract; FAISS and Serper are swappable details. Persistence is a thin **repository** layer over MongoDB, so services never touch the driver directly.
- **Search transparency as a contract** — the API schema *requires* per-result signals, confidence and explanations; unexplained ranked lists are structurally impossible.
- **Location-aware RAG** — parsers preserve pages, headings, line ranges and char offsets; chunking keeps them; citations expose them. In the chat UI, clicking a citation opens a side-by-side **document preview** scrolled to and highlighting the exact source chunk.

## API overview (v1)

| Area | Endpoint | Purpose |
|---|---|---|
| System | `GET /api/v1/system/health` | Liveness |
| | `GET /api/v1/system/capabilities` | Model/provider/feature availability |
| Auth | `POST /api/v1/auth/register` · `login` · `refresh` | JWT access + refresh tokens |
| | `GET` · `PATCH /api/v1/auth/me` | View / edit profile (display name, bio, avatar) |
| | `POST /api/v1/auth/change-password` · `GET /api/v1/auth/me/stats` | Change password · usage stats |
| Profile | `GET/DELETE /api/v1/profile/history` · `.../{id}` | Search history (list, clear, delete) |
| | `GET/POST /api/v1/profile/saved` · `DELETE .../{id}` | Saved results (bookmark, list, remove) |
| Search | `POST /api/v1/search` | Multimodal search (text and/or **multiple files**, category filter, limit) |
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

### One-time install

```bash
# Backend virtual environment + dependencies
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt
copy .env.example .env             # then edit: SECRET_KEY, SERPER_API_KEY, MONGODB_URI
cd ..

# Frontend + the root dev launcher
npm run install:all                # installs root + frontend node_modules
```

**Database — MongoDB.** Set `MONGODB_URI` in `backend/.env`. For MongoDB Atlas,
use your cluster's SRV string
(`mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`)
and whitelist your IP in Atlas → Network Access. The default
(`mongodb://localhost:27017`) targets a local MongoDB. Collections and indexes
are created automatically on first startup — no migrations to run.

### Run everything with one command

From the repository root:

```bash
npm run dev
```

This starts the FastAPI backend (`http://127.0.0.1:8000`) and the Vite
frontend (`http://localhost:5173`) together, with colour-coded
`[backend]` / `[frontend]` log prefixes. `Ctrl+C` stops both. It expects
the backend venv at `backend/.venv` (created above). To run either side
on its own use `npm run dev:backend` or `npm run dev:frontend`.

### Or run each side manually

**Backend**

```bash
cd backend
.venv\Scripts\activate            # Windows
python -m uvicorn app.main:app --reload
```

Notes:
- **FFmpeg** is required for audio transcription — https://www.gyan.dev/ffmpeg/builds/ (add `bin/` to PATH).
- Heavy ML packages (torch, whisper, CLIP…) are optional at runtime: without them the platform still serves search with BM25 keyword ranking and extractive document chat.
- `SERPER_API_KEY` (https://serper.dev) enables live web search.

**Frontend**

```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

Configure the API base URL in `frontend/.env` if needed. **Leave it blank in
development** — the Vite dev server proxies `/api` to the backend so the browser
sees one origin and the auth cookies stay first-party:

```env
VITE_API_BASE_URL=
```

## Security

- **Cookie + JWT authentication.** Short-lived access + refresh JWTs (typed
  claims) are delivered as **httpOnly cookies** — unreadable by page JavaScript
  (XSS-resistant), `SameSite` set, and the client transparently refreshes on
  expiry. `POST /auth/logout` clears them. A Bearer header is still accepted for
  non-browser API clients. In production set `COOKIE_SECURE=true` (HTTPS).
- PBKDF2-SHA256 password hashing with per-user salts and constant-time verification; login timing does not leak account existence
- Sliding-window rate limiting, body-size limits, security headers, restricted CORS
- Upload hardening: extension allow-lists, magic-byte content validation, sanitised filenames, content-hash storage (no client-controlled paths)
- Per-user resource ownership enforced on every document/chat query
- Logs carry request IDs and redact sensitive fields; internals never leak into error responses

## Configuration

Everything is tunable via environment variables (see `backend/.env.example`): token lifetimes, rate limits, upload caps, chunk size/overlap, retrieval depth, model names, and feature flags (`ENABLE_LOCAL_LLM`, `ENABLE_QUERY_EXPANSION`). `QUERY_REFINE_MIN_WORDS` (default 6) controls how long a query must be before the LLM rewriter runs — short keyword queries like "frog" are searched verbatim, which keeps them fast and prevents the model from over-expanding them.

## Extending the platform

| To add… | Touch only… |
|---|---|
| A new search provider (Bing, Brave, …) | `services/providers/` — implement `SearchProvider` |
| A new document format | `services/rag/parsers.py` — one parser function + dispatch entry |
| A new ranking signal | `services/search/ranking.py` + its transparency description |
| A different vector database | `services/vector/` — implement `VectorStore` |
| A new persisted entity / query | `db/repositories.py` — add a repository method |
| A new ML model | `ml/loaders.py` — one loader + registration |
| API v2 | `api/v2/` — mount beside v1, no breaking changes |
