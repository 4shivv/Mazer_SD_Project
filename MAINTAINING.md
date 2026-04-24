# Maintaining MazerAI

This is the day 2 ops companion to the [README](./README.md). The README gets you running; this gets you through month six — backups, rotations, upgrades, and recovery.

## Contents

[Backups](#backups) · [Rotations](#rotations) · [Upgrades](#upgrades) · [Log hygiene](#log-hygiene) · [Recovery](#recovery)

---

## Backups

Both databases bind mount to `/mnt/nvme`. Model weights do not need backing up; re-pull them from the Ollama registry on restore.

**MongoDB, online dump.**

```bash
docker compose -f docker-compose.prod.yml exec mongo mongodump --archive=/tmp/mazerai.archive
docker compose -f docker-compose.prod.yml cp mongo:/tmp/mazerai.archive ./mazerai-$(date +%F).archive
```

**MongoDB, stopped volume snapshot** (guaranteed consistency):

```bash
docker compose -f docker-compose.prod.yml stop mongo
sudo rsync -a /mnt/nvme/mongodb/ /mnt/hdd/backups/mongodb-$(date +%F)/
docker compose -f docker-compose.prod.yml start mongo
```

**Chroma.** No online dump. Stop the service, snapshot the directory, restart:

```bash
docker compose -f docker-compose.prod.yml stop chroma
sudo rsync -a /mnt/nvme/chromadb/ /mnt/hdd/backups/chromadb-$(date +%F)/
docker compose -f docker-compose.prod.yml start chroma
```

---

## Rotations

**JWT secret.** Changing `JWT_SECRET` invalidates all existing sessions — users re-login.

```bash
openssl rand -hex 32                         # generate
# update JWT_SECRET in the deployment config
docker compose -f docker-compose.prod.yml up -d --force-recreate api
```

**Internal TLS certs.** The stunnel proxies use certs under `ops/tls/`. Regenerate before expiry, then bounce the stack:

```bash
openssl x509 -in ops/tls/ca/ca.crt -noout -enddate
bash scripts/generate-internal-certs.sh
docker compose -f docker-compose.prod.yml restart
```

**Admin wipe confirmation code.** Update `ADMIN_WIPE_CONFIRMATION_CODE`; the next wipe requires the new value.

---

## Upgrades

**Chroma version.** The pin lives in `docker-compose.yml` and `docker-compose.prod.yml`. Check Chroma's release notes for on disk data compatibility before bumping:

```bash
# edit the image tag in both compose files
docker compose -f docker-compose.prod.yml pull chroma
docker compose -f docker-compose.prod.yml up -d --force-recreate chroma
```

If the new version is incompatible with existing data, wipe and re-ingest documents through the instructor panel:

```bash
docker compose -f docker-compose.prod.yml stop chroma
sudo rm -rf /mnt/nvme/chromadb/*
docker compose -f docker-compose.prod.yml up -d chroma
```

**Approved chat model.** The q4 lineup is enforced in `apps/api/src/runtime/modelPolicy.ts`. To add or swap a model:

1. Edit `DESIGN_ALLOWED_CHAT_MODELS` and `MODEL_SESSION_CAPACITY` in that file.
2. Pull the new tag: `docker compose -f docker-compose.prod.yml exec ollama ollama pull <new-tag>`.
3. Rebuild: `docker compose -f docker-compose.prod.yml up -d --build api`.
4. Verify: `GET /api/health` reports `ollama: up` and chat with the new model name succeeds.

**Node runtime.** Bump the base image in `apps/api/Dockerfile` and `apps/web/Dockerfile`, rebuild, and run the full test suite before cutting over.

---

## Log hygiene

Pino writes to `/mnt/hdd/logs/*.log` with no built in rotation. Install `logrotate` on the host:

```
# /etc/logrotate.d/mazerai
/mnt/hdd/logs/*.log {
  daily
  rotate 30
  compress
  missingok
  notifempty
  copytruncate
}
```

Reload: `sudo logrotate -f /etc/logrotate.d/mazerai`.

---

## Recovery

**MongoDB corrupt.** Stop the stack, restore from the most recent backup, restart:

```bash
docker compose -f docker-compose.prod.yml stop mongo
sudo rsync -a --delete /mnt/hdd/backups/mongodb-YYYY-MM-DD/ /mnt/nvme/mongodb/
docker compose -f docker-compose.prod.yml start mongo
```

**Chroma embeddings stale.** Trigger an admin wipe with `wipe_embeddings: true`, then re-upload documents through the instructor panel. The wipe drops the Chroma collection cleanly and rebuilds on next ingest.

**Ollama model cache wedged.** Symptom: `ollama pull` fails with checksum or disk errors.

```bash
docker compose -f docker-compose.prod.yml exec ollama ollama list
docker compose -f docker-compose.prod.yml exec ollama ollama rm <model-name>
docker compose -f docker-compose.prod.yml exec ollama ollama pull <model-name>
```

If that fails, nuke the Ollama data directory and re-pull the approved models:

```bash
docker compose -f docker-compose.prod.yml stop ollama
sudo rm -rf /mnt/nvme/ollama/*
docker compose -f docker-compose.prod.yml up -d ollama
docker compose -f docker-compose.prod.yml exec ollama ollama pull llama3:8b-instruct-q4_K_M
docker compose -f docker-compose.prod.yml exec ollama ollama pull mistral:7b-instruct-q4_0
docker compose -f docker-compose.prod.yml exec ollama ollama pull llama3.1:8b-instruct-q4_K_M
docker compose -f docker-compose.prod.yml exec ollama ollama pull nomic-embed-text
```
