#!/usr/bin/env bash
#
# Generate a DEV-ONLY PKI for the mutual-TLS MQTT device link:
#   - a root CA
#   - the EMQX broker server certificate
#   - a "backend" client certificate (CN=backend; the ingestion service)
#   - one client certificate per device id passed as an argument (CN=<deviceId>)
#
# Output goes to ./certs (git-ignored). NEVER commit these; production keys are
# issued and stored via the vault/provisioning flow (F2.6), never generated here.
#
# Usage:
#   scripts/gen-dev-certs.sh [deviceId ...]
#   scripts/gen-dev-certs.sh            # defaults to one device: dev-0001
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERTS="$ROOT/certs"
DAYS=825
DEVICES=("$@")
if [ ${#DEVICES[@]} -eq 0 ]; then DEVICES=("dev-0001"); fi

rm -rf "$CERTS"
mkdir -p "$CERTS/ca" "$CERTS/broker" "$CERTS/backend" "$CERTS/devices"

echo "==> Root CA"
openssl genrsa -out "$CERTS/ca/ca.key" 4096 2>/dev/null
openssl req -x509 -new -nodes -key "$CERTS/ca/ca.key" -sha256 -days "$DAYS" \
  -subj "/O=Obrigada/CN=Obrigada Dev Root CA" -out "$CERTS/ca/ca.crt" 2>/dev/null

# issue_cert <out-dir> <CN> <extfile-or-empty>
issue_cert() {
  local dir="$1" cn="$2" ext="${3:-}"
  mkdir -p "$dir"
  openssl genrsa -out "$dir/tls.key" 2048 2>/dev/null
  openssl req -new -key "$dir/tls.key" -subj "/O=Obrigada/CN=$cn" -out "$dir/tls.csr" 2>/dev/null
  if [ -n "$ext" ]; then
    openssl x509 -req -in "$dir/tls.csr" -CA "$CERTS/ca/ca.crt" -CAkey "$CERTS/ca/ca.key" \
      -CAcreateserial -days "$DAYS" -sha256 -extfile "$ext" -out "$dir/tls.crt" 2>/dev/null
  else
    openssl x509 -req -in "$dir/tls.csr" -CA "$CERTS/ca/ca.crt" -CAkey "$CERTS/ca/ca.key" \
      -CAcreateserial -days "$DAYS" -sha256 -out "$dir/tls.crt" 2>/dev/null
  fi
  rm -f "$dir/tls.csr"
  cp "$CERTS/ca/ca.crt" "$dir/ca.crt"
}

# Guardian phones connect to the broker over the public internet, so the server cert must
# list the public host they use. Pass it in: DOMAIN=api.yourdomain.com bash scripts/gen-dev-certs.sh
BROKER_SAN="DNS:localhost, DNS:emqx, IP:127.0.0.1"
if [ -n "${DOMAIN:-}" ]; then BROKER_SAN="$BROKER_SAN, DNS:$DOMAIN"; fi
# LAN addresses a guardian phone on the same Wi-Fi will use, e.g. BROKER_IPS="192.168.1.23".
for ip in ${BROKER_IPS:-}; do BROKER_SAN="$BROKER_SAN, IP:$ip"; done
echo "==> Broker server certificate (SAN: $BROKER_SAN)"
SAN_EXT="$(mktemp)"
cat > "$SAN_EXT" <<EOF
subjectAltName = $BROKER_SAN
extendedKeyUsage = serverAuth
EOF
issue_cert "$CERTS/broker" "obrigada-emqx" "$SAN_EXT"
mv "$CERTS/broker/tls.crt" "$CERTS/broker/server.crt"
mv "$CERTS/broker/tls.key" "$CERTS/broker/server.key"
rm -f "$SAN_EXT"
# The broker dir is bind-mounted into the EMQX container, whose emqx user (a
# different uid) must read the key. DEV PKI ONLY — never do this in production.
chmod a+r "$CERTS/broker/server.key"

echo "==> Backend client certificate (CN=backend)"
CLIENT_EXT="$(mktemp)"
echo "extendedKeyUsage = clientAuth" > "$CLIENT_EXT"
issue_cert "$CERTS/backend" "backend" "$CLIENT_EXT"

for device in "${DEVICES[@]}"; do
  echo "==> Device client certificate (CN=$device)"
  issue_cert "$CERTS/devices/$device" "$device" "$CLIENT_EXT"
done
rm -f "$CLIENT_EXT"

# Every private key here is bind-mounted read-only into a container that runs as a non-root
# user (the backend and EMQX both drop root), whose uid differs from the host root that
# generated these files. Make the keys readable so those containers can load their TLS
# material — otherwise the backend dies on boot with EACCES on /certs/backend/tls.key, and
# provisioning cannot read the device CA key. DEV PKI ONLY — never make keys world-readable
# in a real production secret store.
find "$CERTS" -name '*.key' -exec chmod a+r {} +

echo "Done. Certs in $CERTS (git-ignored). Devices: ${DEVICES[*]}"
