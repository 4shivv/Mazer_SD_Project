# Mazer SD Project

Mazer is a local/offline AI assistant built with React, Node.js, MongoDB, ChromaDB, and Ollama.

This README is intentionally short:

- Testing setup: fastest ways to run the repo locally
- Production-style setup: closest deployment path to the system design target
- Validation
- Teardown

For end-to-end user-flow testing, use [HANDOFF_GUIDE.md](/Users/shivaganeshnagamandla/GitHub_Projects/Mazer_SD_Project/HANDOFF_GUIDE.md).

## Prerequisites

- Node.js `20+`
- npm `10+`
- Docker Desktop, or Docker Engine with Compose

## Core Endpoints

- Web: `http://localhost:5173`
- API: `http://localhost:4000`
- API health: `http://localhost:4000/api/health`
- MongoDB: `mongodb://localhost:27017`
- Ollama: `http://localhost:11434`
- Chroma: `http://localhost:8000`

## Testing Setup

### Option A: Docker API + Local Web

Use this for the quickest local test run.

From the repo root:

```bash
docker compose up --build -d
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama pull nomic-embed-text
cd apps/web
npm install
npm run dev
```

Notes:

- API runs in Docker.
- Web runs locally.
- Vite proxies `/api` to `http://localhost:4000`.

### Option B: Docker Infra + Local API + Local Web

Use this if you need to debug the API directly.

Start infra:

```bash
docker compose up -d mongo ollama chroma
```

Start the API:

```bash
cd apps/api
npm install
cp .env.example .env
npm run dev
```

Start the web app in a second terminal:

```bash
cd apps/web
npm install
npm run dev
```

## Production-Style Setup

This is the closest setup to the target architecture in `docs/SYSTEM_DESIGN_PLAN.md`:

- single Linux host
- offline / air-gapped deployment
- local MongoDB + ChromaDB + Ollama
- NVIDIA GPU-backed Ollama

The repo includes `docker-compose.gpu.yml` for NVIDIA Docker hosts.

### Start the backend stack

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build -d
```

Optional: pin Ollama to a specific NVIDIA GPU:

```bash
OLLAMA_GPU_DEVICE=0 docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build -d
```

Pull the required models:

```bash
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama pull nomic-embed-text
```

Important:

- The current repo defaults to `llama3.2:3b` for easier testing.
- The system design assumes an RTX-3090-class deployment sized for larger 4-bit quantized models.
- If you want production to match the design more closely, validate and set `OLLAMA_MODEL` for the target GPU before rollout.

### Build and serve the web app

```bash
cd apps/web
npm install
npm run build
```

Serve the built assets from `apps/web/dist` using the local web server or reverse proxy used in the deployment environment.

### Recommended production-style API env

Set these in the API environment for production-style deployment:

- `MONGO_URL`
- `JWT_SECRET`
- `OLLAMA_HOST`
- `CHROMA_HOST`
- `LOG_DIR=/mnt/hdd/logs`
- `LOG_LEVEL=info`

## Admin Bootstrap

Admin accounts are not created through public registration.

Create the first admin:

```bash
cd apps/api
cp .env.example .env
ADMIN_BOOTSTRAP_USERNAME=admin \
ADMIN_BOOTSTRAP_EMAIL=admin@example.com \
ADMIN_BOOTSTRAP_PASSWORD=change-this-before-first-run \
npm run bootstrap:admin
```

Behavior:

- creates the admin if it does not exist
- updates the same admin identity if rerun
- fails if username/email conflict with a different user

Admin login page:

- `http://localhost:5173/login/admin`

## Validation

### Basic startup validation

```bash
curl http://localhost:4000/api/health
```

Then open `http://localhost:5173`.

### GPU validation

If using NVIDIA GPU acceleration for Ollama:

```bash
docker compose exec ollama ollama ps
```

### Repo checks

API:

```bash
cd apps/api
npm run test
npm run test:integration
npm run test:coverage
npm run build
```

Web:

```bash
cd apps/web
npm run test
npm run test:unit
npm run test:integration
npm run test:coverage
npm run build
```

### User-flow validation

Run the full checklist in [HANDOFF_GUIDE.md](/Users/shivaganeshnagamandla/GitHub_Projects/Mazer_SD_Project/HANDOFF_GUIDE.md).

## Notes

- RAG requires MongoDB, Ollama, and Chroma to all be available.
- `nomic-embed-text` must be pulled or document ingestion/retrieval will not work correctly.
- `docker-compose.gpu.yml` is for NVIDIA Docker hosts. It is not a universal AMD/Intel/Apple GPU configuration.
- The repo’s default compose file is still developer-oriented. Production-style hardening beyond this baseline is not fully encoded in the repo.

## Teardown

Stop containers, keep data:

```bash
docker compose down
```

Stop containers and delete local Docker volumes:

```bash
docker compose down -v
```

`down -v` deletes:

- MongoDB data volume
- ChromaDB data volume
- Ollama model/data volume

If local dev servers are running, stop them with `Ctrl+C`.
