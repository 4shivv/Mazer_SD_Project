# Metadata

- Foundation Task ID: `FT-BE-002`
- Owner: `Shivaganesh Nagamandla`
- Status: `[Done]`
- Linked Slice IDs: `SL-BE-001`
- Detail File: `docs/status/foundation/FT-BE-002.md`

# Scope/Contract

- Purpose: Define slice-neutral host telemetry plumbing for GPU temperature/VRAM sampling and degraded health-status behavior.
- In scope:
  - Telemetry adapter contract for GPU temperature and VRAM usage reads.
  - Sampling/refresh semantics appropriate for thermal protection checks.
  - Degraded-mode contract when telemetry providers are unavailable.
- Out of scope:
  - AI model selection, fine-tuning, or inference prompting behavior.
  - Session capacity queue logic (handled by `FT-BE-001`).
  - Structured request logging sink behavior (handled by `FT-BE-003`).
- Interface contract reference(s):
  - `docs/SYSTEM_DESIGN_PLAN.md` `FR-035`, `FR-038`.
  - `docs/SYSTEM_DESIGN_PLAN.md` `NFR-R5`.
- Invocation model: Explicitly invoked by slice prompts only.
- Safety/fail-safe behavior: Telemetry failures must not crash API paths; system must surface explicit degraded status and avoid silent success.

# Activity Log

- `2026-02-25T06:25:57Z`: Claimed in Step `3.2` dependency discovery for `SL-BE-001`.
- `2026-03-24T00:00:00Z`: Implemented in Step `3.5` prompt `P34-4`.

# Verification Evidence

- Implementation: `apps/api/src/middleware/thermalGate.ts`
- Tests: `apps/api/src/middleware/__tests__/thermalGate.test.ts` (13 tests passing)
- Exports: `thermalGate` middleware, `initThermalMonitor()`, `stopThermalMonitor()`, `getGpuTelemetry()`, `parseNvidiaSmiOutput()`, `GPU_TEMP_THRESHOLD_C`, `THERMAL_POLL_INTERVAL_MS`
- Contract: 503 `thermal_capacity` envelope with `retry_after_seconds: 300`; `GpuTelemetry` interface for health consumption
- Degraded mode: nvidia-smi unavailable → `{ available: false }`, middleware passes through (fail-open)
- Fail-safe: Telemetry failures do not crash API; explicit degraded status surfaced

# Closure

- Completion criteria check:
  - Contract implemented: `yes`
  - Slice-neutral constraint preserved: `yes` — module is invoked only by slice middleware wiring
  - Fail-safe behavior validated: `yes` — degraded mode tested with unavailable nvidia-smi
- Final status: `[Done]`
