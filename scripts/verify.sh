#!/usr/bin/env bash
set -euo pipefail

echo "==> Verifying environment"

echo "Node: $(node -v)"
echo "npm:  $(npm -v)"

SERVICE_NAME="MineflayerBot"
ACCOUNT_NAME="bot-email"

echo "==> Checking Keychain entry ($SERVICE_NAME / $ACCOUNT_NAME)"
if security find-generic-password -s "$SERVICE_NAME" -a "$ACCOUNT_NAME" -w >/dev/null 2>&1; then
  echo "Keychain entry present."
else
  echo "Missing Keychain entry. Create with scripts/setup-macos.sh --email you@example.com" >&2
  exit 1
fi

echo "==> Checking npm dependencies"
if [[ -f package-lock.json ]]; then
  npm ci --dry-run >/dev/null
else
  npm install --dry-run >/dev/null
fi

echo "==> All checks passed"


