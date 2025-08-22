#!/usr/bin/env bash
set -euo pipefail

echo "==> Mineflayer Camera Bot macOS setup"

if [[ "${OSTYPE}" != darwin* ]]; then
  echo "This setup script is intended for macOS." >&2
  exit 1
fi

# Ask which Node to use for this project
echo "==> Node.js version for this project"
read -r -p "Use Node 20 LTS for this project? [Y/n]: " NODE20_CHOICE
NODE20_CHOICE=${NODE20_CHOICE:-Y}

if [[ "$NODE20_CHOICE" =~ ^[Yy]$ ]]; then
  echo "Using Node 20 LTS for this project (will create .nvmrc)."
  echo "20" > .nvmrc
  # Try to activate Node 20 if nvm or volta are available
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$HOME/.nvm/nvm.sh"
  fi
  if command -v nvm >/dev/null 2>&1; then
    nvm install 20 >/dev/null
    nvm use 20 >/dev/null || true
  elif command -v volta >/dev/null 2>&1; then
    volta pin node@20 || true
  else
    echo "nvm/volta not found. Proceeding with your current Node. You can still run 'nvm use 20' later."
  fi
else
  echo "Staying on current Node (24+). We'll check for Xcode Command Line Tools for native builds."
  if ! xcode-select -p >/dev/null 2>&1; then
    echo "Xcode Command Line Tools are required for native builds on Node 24+." >&2
    echo "Run: xcode-select --install  (accept the macOS prompt), then rerun setup." >&2
    exit 1
  fi
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

echo "==> Installing native libraries for canvas (prismarine-viewer)"
if command -v brew >/dev/null 2>&1; then
  brew list pkg-config >/dev/null 2>&1 || brew install pkg-config
  brew list cairo >/dev/null 2>&1 || brew install cairo
  brew list pango >/dev/null 2>&1 || brew install pango
  brew list libpng >/dev/null 2>&1 || brew install libpng
  brew list jpeg >/dev/null 2>&1 || brew install jpeg
  brew list giflib >/dev/null 2>&1 || brew install giflib
  brew list librsvg >/dev/null 2>&1 || brew install librsvg
else
  echo "Homebrew not found. Install from https://brew.sh/ or install these packages manually: pkg-config, cairo, pango, libpng, jpeg, giflib, librsvg" >&2
fi

echo "==> Ensuring canvas npm package is installed"
npm ls canvas >/dev/null 2>&1 || npm install canvas

echo "==> Installing dependencies"
if command -v npm >/dev/null 2>&1; then
  if [[ -f package-lock.json ]]; then
    npm ci || npm install
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


