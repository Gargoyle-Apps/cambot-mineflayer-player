#!/usr/bin/env bash
set -euo pipefail

echo "==> Mineflayer Camera Bot macOS setup"

if [[ "${OSTYPE}" != darwin* ]]; then
  echo "This setup script is intended for macOS." >&2
  exit 1
fi

# Parse optional --email argument
EMAIL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --email)
      EMAIL=${2:-}
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

echo "==> Checking Node.js and npm versions"
NODE_VERSION=$(node -v || true)
NPM_VERSION=$(npm -v || true)
if [[ -z "$NODE_VERSION" || -z "$NPM_VERSION" ]]; then
  echo "Node.js and npm are required. Install from https://nodejs.org/" >&2
  exit 1
fi
echo "Node: $NODE_VERSION"
echo "npm:  $NPM_VERSION"

REQ_MAJOR=18
MAJOR=$(node -p "process.versions.node.split('.')[0]")
if (( MAJOR < REQ_MAJOR )); then
  echo "Node.js v18+ is required. Current: $NODE_VERSION" >&2
  exit 1
fi

echo "==> Installing dependencies"
if command -v npm >/dev/null 2>&1; then
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
else
  echo "npm not found." >&2
  exit 1
fi

SERVICE_NAME="MineflayerBot"
ACCOUNT_NAME="bot-email"

echo "==> Configuring macOS Keychain entry ($SERVICE_NAME / $ACCOUNT_NAME)"
if [[ -z "$EMAIL" ]]; then
  read -r -p "Enter the Microsoft account email for the bot: " EMAIL
fi

if [[ -z "$EMAIL" ]]; then
  echo "Email cannot be empty." >&2
  exit 1
fi

set +e
security add-generic-password -a "$ACCOUNT_NAME" -s "$SERVICE_NAME" -w "$EMAIL" -U >/dev/null 2>&1
RC=$?
set -e
if [[ $RC -ne 0 ]]; then
  echo "Failed to create/update Keychain item. You may need to unlock your keychain and re-run." >&2
  exit $RC
fi

echo "==> Verifying Keychain entry"
if ! security find-generic-password -s "$SERVICE_NAME" -a "$ACCOUNT_NAME" -w >/dev/null 2>&1; then
  echo "Keychain entry not found after write." >&2
  exit 1
fi

echo "==> Setup complete"
echo "Next: npm run verify && npm start"


