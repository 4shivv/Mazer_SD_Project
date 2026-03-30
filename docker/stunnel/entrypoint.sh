#!/usr/bin/env bash

set -euo pipefail

: "${ACCEPT_PORT:?ACCEPT_PORT is required}"
: "${CONNECT_HOST:?CONNECT_HOST is required}"
: "${CONNECT_PORT:?CONNECT_PORT is required}"
: "${SERVICE_CERT:?SERVICE_CERT is required}"
: "${SERVICE_KEY:?SERVICE_KEY is required}"

COMBINED_PEM="/tmp/service.pem"
cat "$SERVICE_CERT" "$SERVICE_KEY" > "$COMBINED_PEM"

cat >/etc/stunnel/stunnel.conf <<EOF
foreground = yes
debug = notice
pid =
socket = l:TCP_NODELAY=1
socket = r:TCP_NODELAY=1

[mazer-internal-tls]
client = no
accept = 0.0.0.0:${ACCEPT_PORT}
connect = ${CONNECT_HOST}:${CONNECT_PORT}
cert = ${COMBINED_PEM}
sslVersionMin = TLSv1.3
EOF

exec stunnel /etc/stunnel/stunnel.conf
