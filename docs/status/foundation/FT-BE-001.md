# Metadata

- Foundation Task ID: `FT-BE-001`
- Owner: `Shivaganesh Nagamandla`
- Status: `[Done]`
- Linked Slice IDs: `SL-BE-001`
- Detail File: `docs/status/foundation/FT-BE-001.md`

# Scope/Contract

- Purpose: Define slice-neutral runtime admission-control plumbing for chat-session capacity limits and queue-state responses.
- In scope:
  - Capacity gate contract for maximum concurrent active chat sessions.
  - Queue-state envelope contract (capacity exceeded + estimated wait semantics).
  - Admission-state representation that can be reused by protected chat entry points.
- Out of scope:
  - Frontend wording/UX implementation details.
  - Model prompt behavior, tuning, or inference-quality logic.
  - Thermal telemetry internals (handled by `FT-BE-002`).
- Interface contract reference(s):
  - `docs/SYSTEM_DESIGN_PLAN.md` `FR-033`, `FR-034`, `FR-036`.
  - `docs/SYSTEM_DESIGN_PLAN.md` `NFR-P4`, `NFR-R6`.
- Invocation model: Explicitly invoked by slice prompts only.
- Safety/fail-safe behavior: If admission state cannot be resolved, fail closed for new session creation and return controlled error envelope.

# Activity Log

- `2026-02-25T06:25:57Z`: Claimed in Step `3.2` dependency discovery for `SL-BE-001`.
- `2026-03-24T00:00:00Z`: Implemented in Step `3.5` prompt `P34-3`.

# Verification Evidence

- Implementation: `apps/api/src/middleware/capacityGate.ts`
- Tests: `apps/api/src/middleware/__tests__/capacityGate.test.ts` (10 tests passing)
- Exports: `capacityGate` middleware, `initCapacityTracking()`, `getActiveSessionCount()`, `MAX_CONCURRENT_SESSIONS`
- Contract: 503 `server_at_capacity` envelope with `queue_position` and `estimated_wait_seconds`
- Fail-safe: Double-decrement guard; count cannot go below 0; resets on process restart

# Closure

- Completion criteria check:
  - Contract implemented: `yes`
  - Slice-neutral constraint preserved: `yes` — module is invoked only by slice middleware wiring
  - Fail-safe behavior validated: `yes` — double-decrement guard tested
- Final status: `[Done]`
