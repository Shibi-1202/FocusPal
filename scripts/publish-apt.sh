#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_PUBLIC_DIR="${APTLY_ROOT_DIR:-$HOME/.aptly}/public"

find_latest_deb() {
  find "$ROOT_DIR/packages/desktop/dist" -maxdepth 1 -type f -name 'FocusPal-*.deb' | sort -V | tail -n 1
}

usage() {
  cat <<'EOF'
Usage:
  APT_GPG_KEY=<your-key-id> ./scripts/publish-apt.sh

Optional environment variables:
  DEB_FILE               Path to the .deb file to publish
  APT_REPO_NAME          Local aptly repo name (default: focuspal)
  APT_DISTRIBUTION       Apt distribution name (default: stable)
  APT_COMPONENT          Apt component name (default: main)
  APT_ARCHITECTURES      Published architectures (default: amd64)
  APT_PREFIX             Published URL prefix (default: .)
  APT_GPG_KEY            Required GPG key id used to sign the repo
  APT_GPG_PASSPHRASE     Optional GPG passphrase for batch/CI use
  APT_GPG_PASSPHRASE_FILE
                         Optional file containing the GPG passphrase
  APT_ORIGIN             Apt repository origin metadata (default: FocusPal)
  APT_LABEL              Apt repository label metadata (default: FocusPal)
  APT_PUBLIC_DIR         Directory where aptly writes static files
                         (default: ~/.aptly/public)
  APT_PUBLIC_KEY_NAME    Exported armored public key filename
                         (default: focuspal-archive-keyring.asc)
  APT_SNAPSHOT_NAME      Override snapshot name
  APT_BATCH_SIGNING      Set to 1 to force aptly/gpg batch mode

Examples:
  APT_GPG_KEY=ABCDEF1234567890 ./scripts/publish-apt.sh
  APT_GPG_KEY=ABCDEF1234567890 APT_PREFIX=apt ./scripts/publish-apt.sh
  APT_GPG_KEY=ABCDEF1234567890 APT_BATCH_SIGNING=1 APT_GPG_PASSPHRASE_FILE=/path/to/passphrase ./scripts/publish-apt.sh
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

for cmd in aptly gpg dpkg-deb find sort tail grep date; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

DEB_FILE="${DEB_FILE:-$(find_latest_deb)}"
APT_REPO_NAME="${APT_REPO_NAME:-focuspal}"
APT_DISTRIBUTION="${APT_DISTRIBUTION:-stable}"
APT_COMPONENT="${APT_COMPONENT:-main}"
APT_ARCHITECTURES="${APT_ARCHITECTURES:-amd64}"
APT_PREFIX="${APT_PREFIX:-.}"
APT_GPG_KEY="${APT_GPG_KEY:-}"
APT_GPG_PASSPHRASE="${APT_GPG_PASSPHRASE:-}"
APT_GPG_PASSPHRASE_FILE="${APT_GPG_PASSPHRASE_FILE:-}"
APT_ORIGIN="${APT_ORIGIN:-FocusPal}"
APT_LABEL="${APT_LABEL:-FocusPal}"
APT_PUBLIC_DIR="${APT_PUBLIC_DIR:-$DEFAULT_PUBLIC_DIR}"
APT_PUBLIC_KEY_NAME="${APT_PUBLIC_KEY_NAME:-focuspal-archive-keyring.asc}"
APT_BATCH_SIGNING="${APT_BATCH_SIGNING:-0}"

if [[ -z "$DEB_FILE" ]]; then
  echo "No .deb file found. Build one first with: pnpm --filter @focuspal/desktop build-linux" >&2
  exit 1
fi

if [[ ! -f "$DEB_FILE" ]]; then
  echo "Debian package not found: $DEB_FILE" >&2
  exit 1
fi

if [[ -z "$APT_GPG_KEY" ]]; then
  echo "APT_GPG_KEY is required." >&2
  usage
  exit 1
fi

PUBLISH_GPG_ARGS=(-gpg-key="$APT_GPG_KEY")

if [[ -n "$APT_GPG_PASSPHRASE_FILE" ]]; then
  PUBLISH_GPG_ARGS+=(-passphrase-file="$APT_GPG_PASSPHRASE_FILE")
elif [[ -n "$APT_GPG_PASSPHRASE" ]]; then
  PUBLISH_GPG_ARGS+=(-passphrase="$APT_GPG_PASSPHRASE")
fi

if [[ "$APT_BATCH_SIGNING" == "1" ]]; then
  PUBLISH_GPG_ARGS+=(-batch)
fi

PACKAGE_NAME="$(dpkg-deb -f "$DEB_FILE" Package)"
PACKAGE_VERSION="$(dpkg-deb -f "$DEB_FILE" Version)"
PACKAGE_ARCH="$(dpkg-deb -f "$DEB_FILE" Architecture)"

if [[ "$PACKAGE_NAME" != "focuspal" ]]; then
  echo "Expected Debian package name 'focuspal', found '$PACKAGE_NAME'." >&2
  exit 1
fi

if ! aptly repo list -raw | grep -Fxq "$APT_REPO_NAME"; then
  aptly repo create \
    -distribution="$APT_DISTRIBUTION" \
    -component="$APT_COMPONENT" \
    "$APT_REPO_NAME"
fi

aptly repo add -force-replace "$APT_REPO_NAME" "$DEB_FILE"

SNAPSHOT_NAME="${APT_SNAPSHOT_NAME:-${APT_REPO_NAME}-${PACKAGE_VERSION}-$(date -u +%Y%m%d%H%M%S)}"

if aptly snapshot list -raw | grep -Fxq "$SNAPSHOT_NAME"; then
  echo "Snapshot already exists: $SNAPSHOT_NAME" >&2
  exit 1
fi

aptly snapshot create "$SNAPSHOT_NAME" from repo "$APT_REPO_NAME"

PUBLISHED_ENTRY="${APT_PREFIX} ${APT_DISTRIBUTION}"
if aptly publish list -raw | grep -Fxq "$PUBLISHED_ENTRY"; then
  aptly publish switch \
    "${PUBLISH_GPG_ARGS[@]}" \
    "$APT_DISTRIBUTION" \
    "$APT_PREFIX" \
    "$SNAPSHOT_NAME"
else
  aptly publish snapshot \
    "${PUBLISH_GPG_ARGS[@]}" \
    -distribution="$APT_DISTRIBUTION" \
    -component="$APT_COMPONENT" \
    -architectures="$APT_ARCHITECTURES" \
    -origin="$APT_ORIGIN" \
    -label="$APT_LABEL" \
    "$SNAPSHOT_NAME" \
    "$APT_PREFIX"
fi

PUBLIC_TARGET_DIR="$APT_PUBLIC_DIR"
if [[ "$APT_PREFIX" != "." ]]; then
  PUBLIC_TARGET_DIR="$APT_PUBLIC_DIR/$APT_PREFIX"
fi

mkdir -p "$PUBLIC_TARGET_DIR"
gpg --armor --yes --output "$PUBLIC_TARGET_DIR/$APT_PUBLIC_KEY_NAME" --export "$APT_GPG_KEY"

if [[ "$APT_PREFIX" == "." ]]; then
  URL_SUFFIX=""
else
  URL_SUFFIX="/$APT_PREFIX"
fi

cat <<EOF
Published FocusPal apt repository successfully.

Package:
  name:         $PACKAGE_NAME
  version:      $PACKAGE_VERSION
  architecture: $PACKAGE_ARCH

Published files:
  repo root:    $APT_PUBLIC_DIR
  signing key:  $PUBLIC_TARGET_DIR/$APT_PUBLIC_KEY_NAME
  snapshot:     $SNAPSHOT_NAME

Once hosted, users will add a source like:
  deb [signed-by=/usr/share/keyrings/focuspal-archive-keyring.gpg] https://YOUR-HOST$URL_SUFFIX $APT_DISTRIBUTION $APT_COMPONENT
EOF
