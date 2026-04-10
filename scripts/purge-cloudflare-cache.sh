#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  CLOUDFLARE_API_TOKEN=<token> \
  CLOUDFLARE_ZONE_ID=<zone-id> \
  R2_PUBLIC_BASE_URL=<https://downloads.example.com> \
  RELEASE_VERSION=<version> \
  ./scripts/purge-cloudflare-cache.sh

Required environment variables:
  CLOUDFLARE_API_TOKEN   API token with cache purge access for the zone
  CLOUDFLARE_ZONE_ID     Cloudflare zone identifier
  R2_PUBLIC_BASE_URL     Public downloads base URL backed by R2
  RELEASE_VERSION        Released app version, for example 1.0.2

Optional environment variables:
  APT_PREFIX             Published APT prefix (default: .)
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

for cmd in curl node; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
CLOUDFLARE_ZONE_ID="${CLOUDFLARE_ZONE_ID:-}"
R2_PUBLIC_BASE_URL="${R2_PUBLIC_BASE_URL:-}"
RELEASE_VERSION="${RELEASE_VERSION:-}"
APT_PREFIX="${APT_PREFIX:-.}"

if [[ -z "$CLOUDFLARE_API_TOKEN" || -z "$CLOUDFLARE_ZONE_ID" || -z "$R2_PUBLIC_BASE_URL" || -z "$RELEASE_VERSION" ]]; then
  usage >&2
  exit 1
fi

BASE_PREFIX="$(node -e '
const url = new URL(process.argv[1]);
const path = url.pathname.replace(/\/+$/, "");
process.stdout.write(`${url.host}${path}`);
' "$R2_PUBLIC_BASE_URL")"

APT_CACHE_PREFIX="$BASE_PREFIX"
if [[ "$APT_PREFIX" != "." ]]; then
  APT_CACHE_PREFIX="$APT_CACHE_PREFIX/$APT_PREFIX"
fi

PAYLOAD="$(node -e '
const prefixes = process.argv.slice(1);
process.stdout.write(JSON.stringify({ prefixes }));
' "$APT_CACHE_PREFIX" "$BASE_PREFIX/linux/$RELEASE_VERSION")"

RESPONSE="$(
  curl --silent --show-error --fail \
    -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$PAYLOAD"
)"

printf '%s' "$RESPONSE" | node -e '
let raw = "";
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  const response = JSON.parse(raw);
  if (!response.success) {
    console.error("Cloudflare cache purge failed.");
    if (response.errors) {
      console.error(JSON.stringify(response.errors, null, 2));
    }
    process.exit(1);
  }
});
'
