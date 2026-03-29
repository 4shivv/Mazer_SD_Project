# Mazer SD Project

Mazer is a local/offline AI assistant built with React, Node.js, MongoDB, ChromaDB, and Ollama.

This repo currently supports two practical development run modes:

1. Docker for infrastructure plus API, with the web app running locally.
2. Docker for infrastructure only, with both API and web running locally.

## Prerequisites

- Node.js `20+`
- npm `10+`
- Docker Desktop, or Docker Engine with Compose

## Services and Ports

- Web dev server: `http://localhost:5173`
- API: `http://localhost:4000`
- API health: `http://localhost:4000/api/health`
- MongoDB: `mongodb://localhost:27017`
- Ollama: `http://localhost:11434`
- Chroma: `http://localhost:8000`

## First-Time Setup

From the repo root:

```bash
docker compose up --build -d
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama pull nomic-embed-text
```

Why both models matter:

- `llama3.2:3b` is the default chat model.
- `nomic-embed-text` is the default embedding model for RAG.

Then install web dependencies:

```bash
cd apps/web
npm install
```

If you plan to run the API locally instead of in Docker, also install API dependencies:

```bash
cd apps/api
npm install
cp .env.example .env
```

## Run Mode A: Docker API + Local Web

This is the fastest way to get the full app up for development if you only want the frontend local.

Start the stack:

```bash
docker compose up --build -d
```

Start the web app:

```bash
cd apps/web
npm run dev
```

Open:

- Web: `http://localhost:5173`
- API health: `http://localhost:4000/api/health`

Notes:

- In this mode, the API runs inside Docker.
- The Vite dev server proxies `/api` to `http://localhost:4000`.

## Run Mode B: Docker Infra + Local API + Local Web

Use this if you want to debug the API directly on your machine.

Start only infrastructure services:

```bash
docker compose up -d mongo ollama chroma
```

Create local API env file if you have not already:

```bash
cd apps/api
cp .env.example .env
```

Start the API locally:

```bash
cd apps/api
npm install
npm run dev
```

In a second terminal, start the web app:

```bash
cd apps/web
npm install
npm run dev
```

## Required API Environment Variables

The local API requires at least:

- `MONGO_URL`
- `JWT_SECRET`

The included `apps/api/.env.example` also defines recommended local defaults for:

- `PORT`
- `OLLAMA_HOST`
- `OLLAMA_MODEL`
- `OLLAMA_EMBED_MODEL`
- `CHROMA_HOST`
- `CHROMA_COLLECTION`
- `CHROMA_TENANT`
- `CHROMA_DATABASE`
- `RETENTION_SWEEP_INTERVAL_MS`
- `ADMIN_WIPE_CONFIRMATION_CODE`

## Ground-Up Validation

After startup, verify the stack in this order:

1. Health check:

```bash
curl http://localhost:4000/api/health
```

2. Web app loads:

- Open `http://localhost:5173`

3. Optional repo checks:

```bash
cd apps/api
npm run test
npm run test:integration
npm run test:coverage
npm run build
```

```bash
cd apps/web
npm run test
npm run test:unit
npm run test:integration
npm run test:coverage
npm run build
```

## RAG Notes

RAG depends on all three backend dependencies being available:

- MongoDB for document metadata and app data
- Ollama for embeddings and chat
- Chroma for vector retrieval

If `nomic-embed-text` is not pulled, document upload and retrieval will not work correctly.

## Admin Wipe Notes

The destructive admin wipe flow requires a confirmation code.

- Default confirmation code: `MAZER_CONFIRM_WIPE`
- Override with `ADMIN_WIPE_CONFIRMATION_CODE`

Model reset behavior:

- `wipe_model_weights=true` removes pulled models through the Ollama API
- filesystem cache/model directory cleanup only happens if `OLLAMA_MODEL_STORAGE_PATHS` and/or `OLLAMA_CACHE_PATHS` are configured

## Logs and Useful Commands

Inspect running services:

```bash
docker compose ps
```

Tail logs:

```bash
docker compose logs -f api
docker compose logs -f ollama
docker compose logs -f mongo
docker compose logs -f chroma
```

Rebuild containers:

```bash
docker compose up --build -d
```

## Teardown

Stop containers, keep data volumes:

```bash
docker compose down
```

Stop containers and remove volumes for a clean reset:

```bash
docker compose down -v
```

What `down -v` deletes:

- Mongo database data
- Chroma vector data
- Ollama stored model data in the Docker volume

If you are also running local dev servers, stop them with `Ctrl+C`.

## Current README Status

This README now matches the current codebase better than the previous version. The previous README was outdated in three important ways:

- it used the wrong health endpoint
- it referenced a missing `.env.example`
- it pulled the wrong Ollama chat model and omitted the embedding model
