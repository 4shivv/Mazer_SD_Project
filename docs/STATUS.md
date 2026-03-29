# STATUS Ledger

## Active Slice Snapshot

- Active Slice ID: `None` (all Shivaganesh-owned slices closed)
- Status: `All [Done]`
- Owner: `Shivaganesh Nagamandla`
- Notes:
  - Execution follows `docs/WORKFLOW.md` step-by-step.
  - Scope includes database, backend/runtime, and AI integration work; no separate fine-tuning/training slice was implemented.
  - `SL-DB-001` closed with Step `3.8` verdict `Ready to Close` and remains recorded as `[Done]`.
  - `SL-DB-002` closed with Step `3.8` verdict `Ready to Close` and remains recorded as `[Done]`.
  - `SL-DB-003` closed with Step `3.8` verdict `Ready to Close` and remains recorded as `[Done]`.
  - Step `3.1` activation complete for `SL-DB-004`.
  - Slice detail file created: `docs/status/slices/SL-DB-004.md`.
  - Current active scope focuses on runtime governance and observability controls.
  - Step `3.2` dependency discovery passed (`Ready`) for `SL-DB-004`.
  - New foundation claim for `SL-DB-004`: `FT-DB-008`.
  - Step `3.3` strategy convergence completed for `SL-DB-004`; selected strategy `S1`.
  - Step `3.3.1` pattern convergence completed for `SL-DB-004`; selected pattern `P1`.
  - Step `3.4` prompt chain recorded for `SL-DB-004` with foundation-first ordering.
  - Step `3.5` completed for `SL-DB-004` (`P344-FT1`..`P344-IMPL3`) with passing build and ownership-isolation smoke evidence.
  - Step `3.6` review completed for `SL-DB-004` with verdict `Approved` (FR/NFR coverage + RBAC and ownership-isolation checks passed).
  - Step `3.8` closure completed for `SL-DB-004` with verdict `Ready to Close`; slice marked `[Done]`.
  - Step `3.1` activation complete for `SL-BE-001`; detail file created and slice moved to `[WIP]`.
  - Step `3.2` dependency discovery passed (`Ready`) for `SL-BE-001`.
  - New foundation claims for `SL-BE-001`: `FT-BE-001`, `FT-BE-002`, `FT-BE-003`.
  - Step `3.3` strategy convergence completed for `SL-BE-001`; selected strategy `S1` (Direct Express Middleware Chain).
  - Step `3.3.1` pattern convergence completed for `SL-BE-001`; selected pattern `P1` (Flat Middleware Modules with Module-Scoped State).
  - Step `3.4` prompt chain recorded for `SL-BE-001` with 7 prompts (P34-1 through P34-7); foundation-first ordering preserved.
  - Step `3.5` completed for `SL-BE-001` (P34-1..P34-7) with 40 passing tests, clean build, and ownership-isolation verified.
  - Step `3.6` review completed for `SL-BE-001` with verdict `Approved` (Sonnet review; Retry-After header and poll guard fixes applied; FR/NFR coverage + RBAC + ownership-isolation checks passed).
  - Step `3.8` closure completed for `SL-BE-001` with verdict `Ready to Close`; slice marked `[Done]`.
  - Retrospective canonical slice logs were added for AI implementation work delivered through the `origin/RAG` merge and follow-up fixes:
    - `SL-AI-001` local LLM chat + SSE streaming + 2048-token rolling context
    - `SL-AI-002` prompt behavior and live instructor-config application
    - `SL-AI-003` local RAG ingestion/retrieval/citation pipeline
    - `SL-AI-004` admin model reset via `POST /api/admin/wipe (wipe_model_weights=true)`
  - Repository testing baseline now exposes `test`, `test:unit`, `test:integration`, and `test:coverage` for both `apps/api` and `apps/web`.
  - Coverage thresholds are enforced in both app-level Vitest configs, and the web app now has jsdom-based UI smoke coverage for root routing and admin secure-wipe flow.

## Slice Registry

| Slice ID | Capability Statement | Included FR IDs | Relevant NFR IDs | Dependency Rationale | Status | Start Gate | Owner | Demo/Test Condition | Detail File | Linked FT IDs |
|---|---|---|---|---|---|---|---|---|---|---|
| `SL-DB-001` | Role-based account and login-session persistence with 24-hour session expiry for secure local authentication flow | `FR-001`, `FR-002`, `FR-003`, `FR-004`, `FR-005`, `FR-006` | `NFR-S3`, `NFR-S4` | User creation, role assignment, instructor approval state, token issuance, and 24-hour session expiration must ship together to avoid broken auth lifecycle | `[Done]` | `Closed` | `Shivaganesh Nagamandla` | Trainee can register/login immediately; instructor account requires approval before activation; session records expire at 24 hours | `docs/status/slices/SL-DB-001.md` | `FT-DB-001`, `FT-DB-002`, `FT-DB-003` |
| `SL-DB-002` | Conversation/message persistence and retrieval by recency with role-labeled messages | `FR-010`, `FR-011`, `FR-012`, `FR-013` | `NFR-P6`, `NFR-SC3` | Message storage, recency list loading, per-conversation retrieval, and role labeling are one user-visible history capability and share the same data model/index decisions | `[Done]` | `Closed` | `Shivaganesh Nagamandla` | Conversation list loads paginated by recency and opening one conversation returns ordered user/assistant messages | `docs/status/slices/SL-DB-002.md` | `FT-DB-004`, `FT-DB-005` |
| `SL-DB-003` | Admin retention and destructive data controls for conversation lifecycle | `FR-029`, `FR-030`, `FR-031` | `NFR-S4`, `NFR-S8` | Retention policy, expiry deletion, and wipe behavior are coupled governance controls over the same persistence surfaces | `[Done]` | `Closed` | `Shivaganesh Nagamandla` | Admin can set retention date and expired conversations are removed; wipe operation removes stored conversation data per policy | `docs/status/slices/SL-DB-003.md` | `FT-DB-006`, `FT-DB-007` |
| `SL-DB-004` | Instructor configuration persistence for controllable response parameters | `FR-027`, `FR-028` | `NFR-S4` | Personality/parameter settings are one persistence contract tied to instructor identity and role constraints | `[Done]` | `Closed` | `Shivaganesh Nagamandla` | Instructor config saves and reloads consistently for the same instructor account | `docs/status/slices/SL-DB-004.md` | `FT-DB-008` |
| `SL-AI-001` | Messenger-style local LLM chat with streaming responses and rolling persisted context | `FR-007`, `FR-008`, `FR-009`, `FR-014` | `NFR-P1`, `NFR-P2`, `NFR-P7`, `NFR-R4` | Chat initiation, local inference, token streaming, and rolling context are one user-visible flow and must ship together | `[Done]` | `Closed` | `Shivaganesh Nagamandla` | User can open chat, send a prompt, see streamed tokens, and reload persisted conversation history | `docs/status/slices/SL-AI-001.md` | `FT-DB-004`, `FT-DB-005` |
| `SL-AI-002` | Professional EW-oriented response behavior with instructor-configurable guidance | `FR-015`, `FR-016`, `FR-017`, `FR-018` | `NFR-U4`, `NFR-U5` | These requirements are all prompt-behavior controls and share one backend instruction path | `[Done]` | `Closed` | `Shivaganesh Nagamandla` | Live chat responses stay professional/direct and use stored instructor guidance when available | `docs/status/slices/SL-AI-002.md` | `FT-DB-008` |
| `SL-AI-003` | Local RAG pipeline for approved training documents with grounded answers and citations | `FR-019`, `FR-020`, `FR-021`, `FR-022`, `FR-023`, `FR-024`, `FR-025`, `FR-026` | `NFR-P3`, `NFR-P5`, `NFR-R3`, `NFR-SC1` | Upload, chunk, embed, retrieve, ground, and cite are one end-to-end retrieval lifecycle | `[Done]` | `Closed` | `Shivaganesh Nagamandla` | Approved instructor uploads affect grounded chat answers and source references are returned when retrieval succeeds | `docs/status/slices/SL-AI-003.md` | `FT-DB-008` |
| `SL-AI-004` | Admin factory-reset path for model weights and cache cleanup | `FR-032` | `NFR-S4`, `NFR-S8` | Destructive model reset is an independent admin-only capability and must remain explicitly gated | `[Done]` | `Closed` | `Shivaganesh Nagamandla` | Admin can invoke model reset through Secure Wipe using `wipe_model_weights=true` and receive explicit reset results | `docs/status/slices/SL-AI-004.md` | `FT-DB-007` |
| `SL-BE-001` | Runtime governance and observability controls for session capacity, thermal limits, admin user oversight, and service health/logging | `FR-033`, `FR-034`, `FR-035`, `FR-036`, `FR-037`, `FR-038`, `FR-039` | `NFR-P4`, `NFR-R5`, `NFR-R6`, `NFR-S4` | Capacity gates, thermal checks, health telemetry, and admin oversight must ship together to avoid unsafe runtime behavior and incomplete operations visibility | `[Done]` | `Closed` | `Shivaganesh Nagamandla` | Admin can verify user list and health telemetry while runtime enforces session/thermal constraints with clear capacity status and structured logs | `docs/status/slices/SL-BE-001.md` | `FT-BE-001`, `FT-BE-002`, `FT-BE-003` |

## Foundation Task Registry

| FT_ID | Scope | Owner | Status | Linked Slice(s) | Detail File |
|---|---|---|---|---|---|
| `FT-DB-001` | User identity and role schema contract (`username` + canonical role taxonomy + approval state fields) | `Shivaganesh Nagamandla` | `[Done]` | `SL-DB-001` | `docs/status/foundation/FT-DB-001.md` |
| `FT-DB-002` | Session persistence contract (session collection + token lookup + 24-hour TTL expiry semantics) | `Shivaganesh Nagamandla` | `[Done]` | `SL-DB-001` | `docs/status/foundation/FT-DB-002.md` |
| `FT-DB-003` | Instructor approval state transition contract (pending/approved/rejected storage model + audit fields) | `Shivaganesh Nagamandla` | `[Done]` | `SL-DB-001` | `docs/status/foundation/FT-DB-003.md` |
| `FT-DB-004` | Conversation persistence schema contract (`conversations` fields + ownership + recency index prerequisites) | `Shivaganesh Nagamandla` | `[Done]` | `SL-DB-002` | `docs/status/foundation/FT-DB-004.md` |
| `FT-DB-005` | Message persistence schema/index contract (`messages` role labeling + ordered retrieval compound index) | `Shivaganesh Nagamandla` | `[Done]` | `SL-DB-002` | `docs/status/foundation/FT-DB-005.md` |
| `FT-DB-006` | Retention policy persistence and expiry orchestration contract for admin self-destruct controls | `Shivaganesh Nagamandla` | `[Done]` | `SL-DB-003` | `docs/status/foundation/FT-DB-006.md` |
| `FT-DB-007` | Secure wipe execution/audit contract for destructive admin operations | `Shivaganesh Nagamandla` | `[Done]` | `SL-DB-003` | `docs/status/foundation/FT-DB-007.md` |
| `FT-DB-008` | Instructor configuration persistence contract (`instructor_config` schema + one-per-instructor uniqueness + parameter bounds) | `Shivaganesh Nagamandla` | `[Done]` | `SL-DB-004` | `docs/status/foundation/FT-DB-008.md` |
| `FT-BE-001` | Runtime admission-control contract (session cap + queue-state envelope for capacity responses) | `Shivaganesh Nagamandla` | `[Done]` | `SL-BE-001` | `docs/status/foundation/FT-BE-001.md` |
| `FT-BE-002` | Host telemetry contract (GPU temperature/VRAM sampling + degraded status behavior) | `Shivaganesh Nagamandla` | `[Done]` | `SL-BE-001` | `docs/status/foundation/FT-BE-002.md` |
| `FT-BE-003` | Structured request/error logging contract (JSON envelope + durable sink semantics) | `Shivaganesh Nagamandla` | `[Done]` | `SL-BE-001` | `docs/status/foundation/FT-BE-003.md` |

## Gate Ledger (`3.2`–`3.8`)

| Step | Verdict | Timestamp | Detail |
|---|---|---|---|
| 3.2 | `Pass (Ready)` | `2026-03-28T00:00:00Z` | `docs/status/slices/SL-AI-004.md#32-dependency-output` |
| 3.3 | `Pass (S1 selected)` | `2026-03-28T00:00:00Z` | `docs/status/slices/SL-AI-004.md#33-strategy-evaluation--final-convergence` |
| 3.3.1 | `Pass (P1 selected)` | `2026-03-28T00:00:00Z` | `docs/status/slices/SL-AI-004.md#331-pattern-evaluation--final-convergence` |
| 3.4 | `Pass` | `2026-03-28T00:00:00Z` | `docs/status/slices/SL-AI-004.md#34-prompt-chain` |
| 3.5 | `Pass` | `2026-03-28T00:00:00Z` | `docs/status/slices/SL-AI-004.md#35-prompt-execution-reports` |
| 3.6 | `Approved` | `2026-03-28T00:00:00Z` | `docs/status/slices/SL-AI-004.md#36-slice-review-output` |
| 3.7 | `Not Run` | `2026-03-28T00:00:00Z` | `docs/status/slices/SL-AI-004.md#37-retryescalation-log` |
| 3.8 | `Ready to Close` | `2026-03-28T00:00:00Z` | `docs/status/slices/SL-AI-004.md#38-slice-closure-output` |

## Open Blockers/Escalations

- `Workflow cloud reference normalization`:
  - `docs/WORKFLOW.md` references `docs/Cloud_Infra_Guide.md`.
  - System design defines offline/air-gapped deployment only (`NFR-S1`, `NFR-S7` in `docs/SYSTEM_DESIGN_PLAN.md`).
  - Resolution for this repo: treat cloud-infra checks as local-infra checks via `docker-compose.yml` + system design architecture/contracts.
