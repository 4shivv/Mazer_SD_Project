# Mazer SD Project

Mazer is a secure, offline AI assistant built with React, Node.js, MongoDB, ChromaDB, Docker, and a locally hosted LLaMA model via Ollama.

## Prerequisites

- Node.js `20+`
- npm `10+`
- Docker Desktop (or Docker Engine + Compose plugin)

## Quick Start

From the repo root:

```bash
docker compose up --build -d
docker compose exec ollama ollama pull llama3:8b
```

Start the frontend:

```bash
cd apps/web
npm install
npm run dev
```

Open:

- Web: `http://localhost:5173`
- API health: `http://localhost:4000/health`

## Local API Mode

Start only infra dependencies in Docker:

```bash
docker compose up -d mongo ollama chroma
```

Run the API locally:

```bash
cd apps/api
npm install
cp .env.example .env
npm run dev
```

Run the frontend:

```bash
cd apps/web
npm install
npm run dev
```

## Useful Commands

```bash
docker compose ps
docker compose logs -f api
docker compose down
```

Build checks:

```bash
cd apps/api && npm run build
cd ../web && npm run build
```

## Notes

- Frontend proxies `/api` to `http://localhost:4000` via Vite config.
- If you skip `ollama pull`, signup and login still work, but `/api/chat` will fail until a model is pulled.
