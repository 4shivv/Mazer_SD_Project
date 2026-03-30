# Mazer SD Project

Mazer is a local/offline AI assistant built with React, Node.js, MongoDB, ChromaDB, and Ollama.

This README is intentionally short:

- Testing setup: fastest ways to run the repo on a normal local machine
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

Yes: you can test this repo on a normal local computer.

Use the testing paths below for local development. They do not require the production compose stack.

### Option A: Docker API + Local Web

Use this for the quickest local test run.

From the repo root:

```bash
docker compose up --build -d
docker compose exec ollama ollama pull llama3:8b-q4_K_M
docker compose exec ollama ollama pull nomic-embed-text
cd apps/web
npm install
npm run dev
```

Notes:

- API runs in Docker.
- Web runs locally.
- Vite proxies `/api` to `http://localhost:4000`.
- This is the recommended local test path on macOS, Windows, or Linux.

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

Notes:

- Option B is also a normal local-computer workflow.
- If your machine is weak for `llama3:8b-q4_K_M`, you can temporarily choose a smaller local model in `apps/api/.env` and pull that model in Ollama for development only.

## Production-Style Setup

This is the closest setup to the target architecture in `docs/SYSTEM_DESIGN_PLAN.md`:

- single Linux host
- offline / air-gapped deployment
- local MongoDB + ChromaDB + Ollama
- NVIDIA GPU-backed Ollama

Use [docker-compose.prod.yml](/Users/shivaganeshnagamandla/GitHub_Projects/Mazer_SD_Project/docker-compose.prod.yml) for the production-style stack.

Use [docker-compose.gpu.yml](/Users/shivaganeshnagamandla/GitHub_Projects/Mazer_SD_Project/docker-compose.gpu.yml) only on NVIDIA Docker hosts.

### Generate internal TLS certificates

The production-style stack expects internal TLS certs under `ops/tls`.

From the repo root:

```bash
bash scripts/generate-internal-certs.sh
```

### Start the production-style stack

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

If the host has NVIDIA Docker support, use the GPU overlay:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml up --build -d
```

Optional: pin Ollama to a specific NVIDIA GPU:

```bash
OLLAMA_GPU_DEVICE=0 docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml up --build -d
```

Pull the required models:

```bash
docker compose -f docker-compose.prod.yml exec ollama ollama pull llama3:8b-q4_K_M
docker compose -f docker-compose.prod.yml exec ollama ollama pull mistral:7b-q4_0
docker compose -f docker-compose.prod.yml exec ollama ollama pull llama3:13b-q4_0
docker compose -f docker-compose.prod.yml exec ollama ollama pull nomic-embed-text
```

Important production notes:

- The repo now enforces the approved q4 chat-model lineup:
  - `llama3:8b-q4_K_M`
  - `mistral:7b-q4_0`
  - `llama3:13b-q4_0`
- The default production chat model is `llama3:8b-q4_K_M`.
- Internal TLS is required in the production-style stack.
- Host data/log defaults are:
  - MongoDB: `/mnt/nvme/mongodb`
  - ChromaDB: `/mnt/nvme/chromadb`
  - Ollama: `/mnt/nvme/ollama`
  - Logs: `/mnt/hdd/logs`
- Override those paths with env vars if your local production-rehearsal machine uses different mount points:
  - `HOST_MONGO_DATA_DIR`
  - `HOST_CHROMA_DATA_DIR`
  - `HOST_OLLAMA_DATA_DIR`
  - `HOST_LOG_DIR`

### Recommended production-style env

Set these in the API environment for production-style deployment:

- `MONGO_URL`
- `MONGO_TLS_CA_FILE`
- `JWT_SECRET`
- `OLLAMA_HOST`
- `OLLAMA_MODEL`
- `OLLAMA_ALLOWED_CHAT_MODELS`
- `CHROMA_HOST`
- `INTERNAL_TLS_MODE=required`
- `LOG_DIR=/mnt/hdd/logs`
- `LOG_LEVEL=info`
- `MONGO_WIREDTIGER_CACHE_GB=12`

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

### Production-style validation

```bash
bash scripts/verify-production-artifacts.sh
```

For a running production-style stack:

```bash
curl --cacert ops/tls/ca/ca.crt https://localhost:4000/api/health
docker compose -f docker-compose.prod.yml ps
```

If using the GPU overlay:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml ps
docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml exec ollama ollama ps
```

### GPU validation

If using NVIDIA GPU acceleration for Ollama:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml exec ollama ollama ps
```

### Repo checks

API:

```bash
cd apps/api
npm run test
npm run build
```

Web:

```bash
cd apps/web
npm run build
```

### User-flow validation

Run the full checklist in [HANDOFF_GUIDE.md](/Users/shivaganeshnagamandla/GitHub_Projects/Mazer_SD_Project/HANDOFF_GUIDE.md).

## Notes

- RAG requires MongoDB, Ollama, and Chroma to all be available.
- `nomic-embed-text` must be pulled or document ingestion/retrieval will not work correctly.
- `docker-compose.gpu.yml` is for NVIDIA Docker hosts. It is not a universal AMD/Intel/Apple GPU configuration.
- The default [docker-compose.yml](/Users/shivaganeshnagamandla/GitHub_Projects/Mazer_SD_Project/docker-compose.yml) is the local developer stack.
- The production-style stack is [docker-compose.prod.yml](/Users/shivaganeshnagamandla/GitHub_Projects/Mazer_SD_Project/docker-compose.prod.yml).
- You can run the production-style stack locally for rehearsal if Docker works on your machine, but the GPU overlay only applies to compatible NVIDIA hosts.

## Teardown

### Local testing teardown

Stop the developer stack, keep data:

```bash
docker compose down
```

Stop the developer stack and delete Docker volumes:

```bash
docker compose down -v
```

`down -v` deletes:

- MongoDB data volume
- ChromaDB data volume
- Ollama model/data volume

If local dev servers are running, stop them with `Ctrl+C`.

### Production-style teardown

Stop the production-style stack, keep host data:

```bash
docker compose -f docker-compose.prod.yml down
```

Stop the production-style stack with GPU overlay, keep host data:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml down
```

This does not delete host data under the configured bind mounts such as:

- `/mnt/nvme/mongodb`
- `/mnt/nvme/chromadb`
- `/mnt/nvme/ollama`
- `/mnt/hdd/logs`

If you want a full cleanup of production-style local rehearsal data, remove those host directories manually on the machine you used for the rehearsal.
