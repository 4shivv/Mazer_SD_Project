#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TLS_DIR="${1:-$ROOT_DIR/ops/tls}"
CA_DIR="$TLS_DIR/ca"
SERVICES_DIR="$TLS_DIR/services"
TMP_DIR="$TLS_DIR/tmp"
SERVICES=("api-tls" "ollama-tls" "chroma-tls" "mongo-tls")

mkdir -p "$CA_DIR" "$SERVICES_DIR" "$TMP_DIR"

if [[ ! -f "$CA_DIR/ca.key" || ! -f "$CA_DIR/ca.crt" ]]; then
  openssl genrsa -out "$CA_DIR/ca.key" 4096 >/dev/null 2>&1
  openssl req -x509 -new -nodes -key "$CA_DIR/ca.key" \
    -sha256 -days 825 \
    -out "$CA_DIR/ca.crt" \
    -subj "/CN=Mazer Internal CA" >/dev/null 2>&1
fi

for service in "${SERVICES[@]}"; do
  openssl genrsa -out "$SERVICES_DIR/${service}.key" 2048 >/dev/null 2>&1

  cat >"$TMP_DIR/${service}.cnf" <<EOF
[req]
prompt = no
distinguished_name = dn
req_extensions = req_ext

[dn]
CN = ${service}

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${service}
DNS.2 = localhost
EOF

  openssl req -new \
    -key "$SERVICES_DIR/${service}.key" \
    -out "$TMP_DIR/${service}.csr" \
    -config "$TMP_DIR/${service}.cnf" >/dev/null 2>&1

  openssl x509 -req \
    -in "$TMP_DIR/${service}.csr" \
    -CA "$CA_DIR/ca.crt" \
    -CAkey "$CA_DIR/ca.key" \
    -CAcreateserial \
    -out "$SERVICES_DIR/${service}.crt" \
    -days 825 \
    -sha256 \
    -extensions req_ext \
    -extfile "$TMP_DIR/${service}.cnf" >/dev/null 2>&1
done

echo "Generated internal CA and service certificates in: $TLS_DIR"
