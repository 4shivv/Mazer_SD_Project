# MazerAI

MazerAI is a local, offline AI training assistant for Electronic Warfare trainees. It runs as a Docker stack on one host, combining a React UI, a Node/Express API, a local LLM via Ollama, MongoDB, and a ChromaDB vector store. No internet connection is required at runtime.

This README is the entry point for engineers running, deploying, or maintaining the system. It covers setup from fresh clone through production deployment, the failure modes you will encounter, and the security boundary between what the application enforces and what the operator owns.

## Contents

[What this is](#what-this-is) · [Architecture](#architecture) · [Repo layout](#repo-layout) · [Prerequisites](#prerequisites) · [Run locally](#run-locally) · [Production](#production) · [Admin bootstrap](#admin-bootstrap) · [Validate](#validate) · [Observability](#observability) · [Troubleshoot](#troubleshoot) · [Security posture](#security-posture) · [Teardown](#teardown)

Day-2 ops (backups, rotations, upgrades, recovery) live in [MAINTAINING.md](./MAINTAINING.md).

---

## What this is

**The problem.** EW trainees need fast, accurate answers to technical questions in classified training environments where cloud AI tools are prohibited and instructor time is scarce. Training hours get lost to manual searching and waiting on help.

**The solution.** A chat interface backed by a locally hosted LLM, grounded in approved training materials through retrieval augmented generation. Every request stays on one physical server. No data leaves the host.

**Three roles.** Trainees register themselves and chat. Instructors upload documents (textbooks, hardware manuals, operational procedures) and tune AI behavior. Admins approve instructors, manage retention, and trigger secure data wipes.

---

## Architecture

The system runs five services orchestrated through a single Node/Express API.

**Request path.** User prompt → API authentication and input validation → RAG retrieval from Chroma (hybrid vector plus lexical) → prompt assembled with system instructions, conversation history, and retrieved chunks → Ollama streams tokens back via SSE → API persists the exchange in MongoDB.

**Components.**

| Component | Technology | Role |
|---|---|---|
| Web UI | React 19 + Vite | Chat, admin, and instructor panels routed by role |
| API | Node 20 + Express + TypeScript | Auth, chat orchestration, RAG, session and thermal gating |
| Ollama | Ollama + NVIDIA runtime | Local LLM inference and embedding, q4 quantized |
| MongoDB | MongoDB 7 | Users, conversations, messages, instructor configs |
| Chroma | ChromaDB 0.6.3 | Document embeddings and semantic search |

**Model policy.** The API enforces a strict q4 model lineup at startup: `llama3:8b-instruct-q4_K_M`, `mistral:7b-instruct-q4_0`, `llama3.1:8b-instruct-q4_K_M`. Embedding uses `nomic-embed-text`. Any other tag fails a startup assertion.

**Transport.** Traffic between services uses TLS 1.3 via stunnel proxies in the production stack. Stunnel wraps each plain TCP service in a TLS 1.3 tunnel so every hop between services is encrypted. The dev stack runs plain HTTP on the local Docker network for convenience.

**Capacity envelope.** Up to 12 concurrent chat sessions, derived from the 24GB VRAM budget on a single RTX 3090. The API queues beyond the cap and rejects when GPU exceeds 83°C or CPU exceeds 75°C.

---

## Repo layout

```
apps/api/                 # Node/Express backend (TypeScript)
apps/web/                 # React frontend (Vite + TypeScript)
docker/                   # Dockerfile + stunnel config
docker-compose.yml        # Dev stack
docker-compose.prod.yml   # Production stack
docker-compose.gpu.yml    # NVIDIA GPU overlay for Ollama
ops/tls/                  # Internal TLS certs (generated at deploy)
scripts/                  # Cert generation and production verification
```

---

## Prerequisites

**For development.**

- Node 20+, npm 10+
- Docker Desktop (macOS/Windows) or Docker Engine with Compose (Linux)

**For production deployment.**

- Ubuntu 24.04 LTS Server, kernel 6.8+
- NVIDIA GPU with 24GB+ VRAM (RTX 3090 or equivalent), driver 550+
- 64GB RAM, NVMe SSD (2TB+) for hot data, HDD (2TB+) for logs
- NVIDIA Container Toolkit for GPU passthrough
- Air gapped network with no internet gateway

The GPU is optional at the compose level: the production stack runs without `docker-compose.gpu.yml` and Ollama falls back to CPU inference. Expect significantly lower throughput and plan concurrency accordingly — the 12 session cap assumes GPU inference.

---

## Run locally

Use this path for development and local testing on any platform.

**Initial setup.**

```bash
cp apps/api/.env.example apps/api/.env
```

**Start the stack.**

```bash
docker compose up --build -d
docker compose exec ollama ollama pull llama3:8b-instruct-q4_K_M
docker compose exec ollama ollama pull nomic-embed-text
cd apps/web && npm install && npm run dev
```

The API runs in Docker on `:4000`. The web dev server runs locally on `:5173` and proxies `/api` to the container.

**Bootstrap the first admin.** See [Admin bootstrap](#admin-bootstrap).

**Core URLs.**

- Web: http://localhost:5173
- API: http://localhost:4000
- Health: http://localhost:4000/api/health

**Verify it's up.**

```bash
curl http://localhost:4000/api/health
```

Expect `"status": "ok"` with every service reporting `"up"`. On macOS/Windows, the `gpu` and `cpu` fields will show `"available": false`, which is expected; the thermal gates fall through in degraded mode.

---

## Production

Use this path for deployment on a Linux host with an NVIDIA GPU. The production stack layers stunnel TLS proxies in front of every service and binds data to persistent host paths.

**Initial setup.**

```bash
bash scripts/generate-internal-certs.sh
```

This creates internal TLS certs under `ops/tls/` used by the stunnel proxies. Override the default host mount paths by exporting these before `docker compose up`:

```bash
export HOST_MONGO_DATA_DIR=/mnt/nvme/mongodb
export HOST_CHROMA_DATA_DIR=/mnt/nvme/chromadb
export HOST_OLLAMA_DATA_DIR=/mnt/nvme/ollama
export HOST_LOG_DIR=/mnt/hdd/logs
```

**Start the stack.**

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

If the host has NVIDIA Docker support, add the GPU overlay:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml up --build -d
```

Optional: pin Ollama to a specific GPU.

```bash
OLLAMA_GPU_DEVICE=0 docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml up --build -d
```

**Pull the approved models.**

```bash
docker compose -f docker-compose.prod.yml exec ollama ollama pull llama3:8b-instruct-q4_K_M
docker compose -f docker-compose.prod.yml exec ollama ollama pull mistral:7b-instruct-q4_0
docker compose -f docker-compose.prod.yml exec ollama ollama pull llama3.1:8b-instruct-q4_K_M
docker compose -f docker-compose.prod.yml exec ollama ollama pull nomic-embed-text
```

**Bootstrap the first admin.** See [Admin bootstrap](#admin-bootstrap).

**Required API environment variables.**

| Variable | Purpose |
|---|---|
| `MONGO_URL` | Mongo connection string (with TLS params) |
| `MONGO_TLS_CA_FILE` | CA bundle for Mongo TLS |
| `JWT_SECRET` | Session signing key (generate with `openssl rand -hex 32`) |
| `OLLAMA_HOST` | Ollama base URL on the internal network |
| `OLLAMA_MODEL` | Default chat model from the approved lineup |
| `OLLAMA_ALLOWED_CHAT_MODELS` | Comma separated approved set |
| `CHROMA_HOST` | Chroma base URL on the internal network |
| `INTERNAL_TLS_MODE` | `required` in production, `disabled-explicit` in dev |
| `LOG_DIR` | Where Pino writes structured JSON logs (default `/mnt/hdd/logs`) |
| `LOG_LEVEL` | `info` for production, `debug` for diagnosis |
| `MONGO_WIREDTIGER_CACHE_GB` | MongoDB cache size (default 12 on the target hardware) |
| `ADMIN_WIPE_CONFIRMATION_CODE` | Code required to execute admin wipe |

**Verify it's up.**

```bash
curl --cacert ops/tls/ca/ca.crt https://localhost:4000/api/health
docker compose -f docker-compose.prod.yml ps
bash scripts/verify-production-artifacts.sh
```

If using the GPU overlay, also check:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml exec ollama ollama ps
```

---

## Admin bootstrap

Admin accounts are not created through public registration. They are bootstrapped from the command line by someone with shell access to the API service.

```bash
cd apps/api
cp .env.example .env     # if not already done
ADMIN_BOOTSTRAP_USERNAME=admin \
ADMIN_BOOTSTRAP_EMAIL=admin@example.com \
ADMIN_BOOTSTRAP_PASSWORD=change-this-before-first-run \
npm run bootstrap:admin
```

Admin login page: `http://localhost:5173/login/admin` in dev, or your configured domain in production.

New instructor accounts go through an approval workflow: they register, an admin approves them in the admin panel, and only then can they log in. Trainees register themselves without needing approval.

---

## Validate

**The dev stack is up.**

```bash
curl http://localhost:4000/api/health
```

Expect `"status": "ok"` and every service `"up"`. On Linux with hardware, the `gpu` and `cpu` blocks should show live telemetry.

**The production stack is up.**

```bash
curl --cacert ops/tls/ca/ca.crt https://localhost:4000/api/health
bash scripts/verify-production-artifacts.sh
```

**The repo builds and tests cleanly.**

```bash
cd apps/api && npm install && npm test && npm run build
cd apps/web && npm install && npm test && npm run build
```

**User flows smoke tested.** Walk these four by hand after setup:

1. Bootstrap admin, log in at `/login/admin`.
2. Trainee registers, sends a chat message, sees streaming response.
3. Instructor registers, admin approves in the admin panel, instructor logs in.
4. Instructor uploads a PDF, waits for Ready status, asks a grounded question, verifies the citation footer names the source.

---

## Observability

The API exposes a single health endpoint. There is no Prometheus, no Grafana, no separate metrics stream.

**GET `/api/health`** (unauthenticated) reports:

- `mongodb`, `chromadb`, `ollama` — service status (`up` or `down`)
- `gpu` — temperature and VRAM when `nvidia-smi` is available
- `cpu` — temperature when Linux thermal zones are readable
- `transport_security` — internal TLS mode and compliance state
- `active_sessions` / `max_sessions` — capacity headroom

**Logs.** Pino writes structured JSON to `LOG_DIR` (`./logs` in dev, `/mnt/hdd/logs` in prod).

```bash
docker compose logs -f api                   # dev
tail -f /mnt/hdd/logs/*.log                  # prod host
```

---

## Troubleshoot

**Symptom: API logs show `sh: 1: tsx: not found`.**
*Cause.* The API container's `node_modules` volume drifted out of sync with the image.
*Fix.*
```bash
docker compose rm -sf api
docker volume rm mazer_sd_project_api_node_modules
docker compose up --build -d api
```

**Symptom: `ollama pull` fails with "model not found".**
*Cause.* The tag you are pulling does not exist upstream, usually because the `instruct` suffix was dropped.
*Fix.* Use the exact tags from [Architecture](#architecture). `llama3:8b-q4_K_M` does not exist; use `llama3:8b-instruct-q4_K_M`.

**Symptom: Chat responses appear but contain no citations.**
*Cause.* Chroma has no embeddings for the expected document, or the instructor's retrieval threshold excluded all candidate chunks.
*Fix.* Delete the document and upload it again; lower the `retrieval_threshold` on the instructor config if retrieval is too strict.

**Symptom: `curl https://...` returns TLS errors on the production stack.**
*Cause.* Internal TLS certs have not been generated, or the CA is not trusted.
*Fix.* Run `bash scripts/generate-internal-certs.sh` and pass `--cacert ops/tls/ca/ca.crt` to curl.

**Symptom: 503 `database_unavailable` banner on chat load.**
*Cause.* MongoDB is unreachable (network partition or crash).
*Fix.* Check `docker compose ps`; restart Mongo if needed. The API recovers automatically once Mongo is back.

**Symptom: 503 `thermal_capacity` on chat requests.**
*Cause.* GPU above 83°C or CPU above 75°C.
*Fix.* Wait five minutes. If persistent, check `/api/health` for current temps and investigate host cooling.

**Symptom: Chroma fails to start after `docker compose pull`.**
*Cause.* Version mismatch between the pinned `chromadb/chroma:0.6.3` and existing on disk data from a different version.
*Fix.* Either align the pin to match what is on disk, or wipe `/mnt/nvme/chromadb/` and ingest documents again.

**Symptom: API startup aborts with "Model policy configuration is outside the approved lineup".**
*Cause.* `OLLAMA_ALLOWED_CHAT_MODELS` or `OLLAMA_MODEL` contains a tag not in the three approved q4 variants, or a non q4 model slipped in.
*Fix.* Set them to values from [Architecture](#architecture). The lineup is enforced deliberately; extending it requires a code change in `apps/api/src/runtime/modelPolicy.ts`.

**Symptom: "Model is warming up" banner appears on every first message.**
*Cause.* Ollama unloads idle models after about 30 minutes of inactivity to free VRAM; the next request triggers a cold load.
*Fix.* Not a bug: the banner disappears when the first token arrives. Keep the stack warm with a periodic health request if cold start latency is unacceptable.

---

## Security posture

The application enforces a defined set of guarantees. Everything outside that set is the operator's responsibility. Both lists are explicit so there is no ambiguity about where the claim boundary sits.

**What the application enforces.**

- The API stores passwords as bcrypt hashes with cost factor 12.
- The API signs session JWTs that expire after 24 hours and delivers them as HttpOnly cookies.
- Stunnel proxies wrap every hop between services in the production stack with TLS 1.3.
- The API checks authorization on every protected route by role (trainee, instructor, admin).
- The API enforces the approved q4 model lineup at startup; any tag outside the three variants fails fast.
- Admin wipe overwrites message and conversation fields three times with random data, runs MongoDB `compact` to release freed blocks, then drops the Chroma collection for embeddings.
- The API polls GPU and CPU every 30 seconds and rejects requests above 83°C (GPU) or 75°C (CPU).
- The API caps concurrent chats at twelve and queues the rest to prevent VRAM overflow.
- The API validates every request body against a Zod schema at the route boundary.
- The API makes no outbound calls to public hosts; service to service traffic stays on the Docker network.

**What the operator owns.**

- Encryption at rest: enable LUKS on `/mnt/nvme` at the host OS. The application does not add field level encryption.
- Network isolation: run the host with no internet gateway. The Docker network is bridged, but nothing prevents the host itself from reaching outside if a gateway exists.
- OS hardening: provide CPU cooling headroom, keep the kernel patched, restrict SSH, and use ext4 on the data mounts.
- Forensic erasure: shred `/mnt/nvme/*` and run `fstrim` after a wipe. The application overwrites fields in place, not disk sectors.
- Physical security: protect the host, the drives, and the key material under `ops/tls/`.

---

## Teardown

**Local stack.**

```bash
docker compose down           # stop, keep data
docker compose down -v        # stop and delete Docker volumes (Mongo, Chroma, Ollama models)
```

**Production stack.**

```bash
docker compose -f docker-compose.prod.yml down
# With GPU overlay:
docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml down
```

`down` leaves host bind mounts intact. For a full cleanup of production data:

```bash
sudo rm -rf /mnt/nvme/mongodb /mnt/nvme/chromadb /mnt/nvme/ollama
sudo rm -rf /mnt/hdd/logs
```

For forensic grade removal, shred the files first:

```bash
sudo shred -u /mnt/nvme/mongodb/**
sudo shred -u /mnt/nvme/chromadb/**
sudo shred -u /mnt/nvme/ollama/**
sudo fstrim /mnt/nvme
```
