# Mazer SD Project

## Prerequisites

- Node.js `20+`
- npm `10+`
- Docker Desktop (or Docker Engine + Compose plugin)

## Quick Start (Recommended: Docker for backend services)

From repo root:

```bash
docker compose up --build -d
docker compose exec ollama ollama pull llama3:8b
```

Start frontend:

```bash
cd apps/web
npm install
npm run dev
```

Open:

- Web: `http://localhost:5173`
- API health: `http://localhost:4000/health`

## Local API Mode (Optional)

Use this if you want to run `apps/api` directly on your machine.

Start only infra dependencies in Docker:

```bash
docker compose up -d mongo ollama chroma
```

Run API locally:

```bash
cd apps/api
npm install
cp .env.example .env
npm run dev
```

Run frontend:

```bash
cd apps/web
npm install
npm run dev
```

## Useful Commands

From repo root:

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
- If you skip `ollama pull`, signup/login can still work, but `/api/chat` will fail until a model is pulled.
