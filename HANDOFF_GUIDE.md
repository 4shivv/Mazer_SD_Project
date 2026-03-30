# Mazer Handoff Guide

This guide is for setting up the repository in a fresh environment and validating the main user flows after deployment.

## Recommended Setup Path

Use Docker for infrastructure and API, and run the web app locally.

If the deployment target has an NVIDIA GPU, use the included GPU override file so Ollama can run on GPU.

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

For NVIDIA GPU-backed Ollama:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build -d
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama pull nomic-embed-text
```

To pin Ollama to a specific NVIDIA GPU, set `OLLAMA_GPU_DEVICE` before startup. Example:

```bash
OLLAMA_GPU_DEVICE=0 docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build -d
```

Notes:

- The GPU override is for NVIDIA Docker hosts.
- It supports any compatible NVIDIA GPU exposed through Docker.
- If the company needs a specific GPU, use its index such as `0` or the NVIDIA GPU UUID.

Install frontend dependencies:

```bash
cd apps/web
npm install
```

Install API dependencies and create the local env file:

```bash
cd ../api
npm install
cp .env.example .env
```

## Create the First Admin

Admin accounts are not created through the public registration flow. Bootstrap the first admin with environment variables:

```bash
cd apps/api
ADMIN_BOOTSTRAP_USERNAME=admin \
ADMIN_BOOTSTRAP_EMAIL=admin@example.com \
ADMIN_BOOTSTRAP_PASSWORD=change-this-before-first-run \
npm run bootstrap:admin
```

Notes:

- This creates the admin account if it does not already exist.
- If the same admin identity already exists, it updates the password and enforces `role=admin`.
- If the username or email belongs to a different existing user, the command fails.

## Start the Application

If the API is running in Docker, start the web app locally:

```bash
cd apps/web
npm run dev
```

Open:

- Web: `http://localhost:5173`
- API health: `http://localhost:4000/api/health`

## Basic Validation

Run the health check:

```bash
curl http://localhost:4000/api/health
```

Then open `http://localhost:5173` in the browser.

If using GPU-backed Ollama, verify runtime placement with:

```bash
docker compose exec ollama ollama ps
```

## User Flows To Validate

Run the following flows in order.

### 1. Admin Bootstrap and Login

1. Open `/login/admin`.
2. Sign in with the bootstrap admin credentials.
3. Confirm the app opens the admin page.
4. Confirm the admin page loads:
   - instructor approval list
   - retention policy form
   - destructive wipe form
   - document management link

### 2. Trainee Registration and Chat

1. Open `/register`.
2. Create a `trainee` account.
3. Confirm the app redirects to `/chat`.
4. Send a message and confirm a conversation is created.
5. Open `/library` and confirm the page loads.
6. Open `/profile` and confirm account details display.
7. Log out.

### 3. Instructor Registration and Approval

1. Open `/register`.
2. Create an `instructor` account.
3. Try to log in at `/login/instructor`.
4. Confirm the app reports that the instructor is pending admin approval.
5. Log in as admin.
6. Open `/admin`.
7. Approve the pending instructor.
8. Log out as admin.
9. Log in again as the instructor.
10. Confirm the instructor can access `/chat`.

### 4. Instructor Settings

1. While logged in as instructor, open `/instructor/settings`.
2. Change one or more settings.
3. Save the form.
4. Confirm the success message appears and the updated values persist.

### 5. Document Upload and Library

1. While logged in as instructor, open `/instructor/upload`.
2. Upload a supported training document.
3. Wait for the upload to finish processing.
4. Confirm the document status becomes `ready`.
5. Open `/library`.
6. Confirm the document appears in the library list.

### 6. RAG and Chat Validation

1. After a document has been processed, go to `/chat`.
2. Ask a question that should be answerable from the uploaded document.
3. Confirm the system returns a relevant answer.

Important:

- RAG depends on MongoDB, Ollama, and Chroma all being available.
- The embedding model `nomic-embed-text` must be pulled or document retrieval will not work correctly.
- If GPU acceleration is required, confirm the Ollama model is running on the intended GPU with `docker compose exec ollama ollama ps`.

### 7. Admin Document Management

1. Log in as admin.
2. Open `/admin/upload`.
3. Confirm uploaded documents are visible.
4. Delete a document.
5. Confirm the document is removed from the management page and no longer appears in `/library`.

### 8. Retention and Wipe Controls

1. Log in as admin.
2. Open `/admin`.
3. Update the retention policy with a safe test value.
4. Confirm the update succeeds.

Only test the destructive wipe flow in a disposable environment.

Notes:

- The wipe operation requires the confirmation code.
- The default confirmation code is `MAZER_CONFIRM_WIPE`.
- This can be overridden with `ADMIN_WIPE_CONFIRMATION_CODE`.

## Optional Local API Run Mode

If you want to run the API locally instead of in Docker:

```bash
docker compose up -d mongo ollama chroma
cd apps/api
npm install
cp .env.example .env
npm run dev
```

For NVIDIA GPU-backed Ollama in this mode:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d mongo ollama chroma
```

In a second terminal:

```bash
cd apps/web
npm install
npm run dev
```

## Optional Repo Checks

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
