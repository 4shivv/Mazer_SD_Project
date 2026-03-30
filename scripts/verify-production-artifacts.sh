#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

run_step() {
  local label="$1"
  shift
  echo
  echo "==> ${label}"
  "$@"
}

cd "$ROOT_DIR"

if [[ ! -f "$ROOT_DIR/ops/tls/ca/ca.crt" ]]; then
  run_step "Generate internal TLS certificates" \
    bash "$ROOT_DIR/scripts/generate-internal-certs.sh"
fi

run_step "Validate production compose" \
  docker compose -f docker-compose.prod.yml config >/dev/null

run_step "Validate production compose + GPU overlay" \
  docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml config >/dev/null

run_step "Run API targeted production-path tests" \
  npm --prefix apps/api run test -- \
    src/middleware/__tests__/requestLogger.test.ts \
    src/middleware/__tests__/capacityGate.test.ts \
    src/services/admin/__tests__/retentionAdminService.test.ts \
    src/services/documents/__tests__/documentParsingService.test.ts \
    src/runtime/__tests__/db.test.ts \
    src/runtime/__tests__/internalTransportSecurity.test.ts \
    src/runtime/__tests__/modelPolicy.test.ts \
    src/routes/__tests__/health.test.ts

run_step "Build API production artifacts" \
  npm --prefix apps/api run build

run_step "Build web production artifacts" \
  npm --prefix apps/web run build

echo
echo "Artifact-level verification passed."
echo "Deferred runtime proof:"
echo "- Start the stack on the Linux + NVIDIA host:"
echo "  docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml up --build -d"
echo "- Verify the running services:"
echo "  curl --cacert ops/tls/ca/ca.crt https://localhost:\${API_PORT:-4000}/api/health"
echo "  docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml ps"
echo "  docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml exec ollama ollama ps"
echo "- Verify the web boundary:"
echo "  open http://localhost:\${WEB_PORT:-8080}"
