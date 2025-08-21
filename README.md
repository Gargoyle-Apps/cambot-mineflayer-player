# Minecraft Camera Bot

This project uses Mineflayer to create an automated "camera" bot in Minecraft. It connects to a server, exposes a browser-based viewer, and is intended for cinematic behaviors like following and circling players.

---

### 1. Environment Setup

Install on any modern macOS machine (including a Mac mini server):

- **Node.js**: 18.x or newer. Download from [nodejs.org](https://nodejs.org/).
- Recommended: Node 20 LTS for smoother native builds (canvas). If using Node 24, install Xcode Command Line Tools when prompted the first time a native module builds.
- **npm**: Comes with Node.js.
- **Git**: Required for cloning the repository. Install via [git-scm.com](https://git-scm.com/download/mac) or Xcode Command Line Tools: `xcode-select --install`.

---

### 2. Installation

Clone and setup (macOS):

```bash
git clone https://github.com/ImpureCrumpet/mineflayer_camerabot.git
cd mineflayer_camerabot
npm run setup:macos -- --email "you@example.com"
npm run verify
```

Notes:
- The `git clone` command creates a folder named after the repo (`mineflayer_camerabot`) in your current directory. You can change the folder name by appending it to the clone command: `git clone <url> my-folder`.
- `npm run setup:macos` installs project dependencies locally into this folder.
- The `-- --email "you@example.com"` passes an argument through npm to the setup script. It provides your Microsoft account email, which the script stores in macOS Keychain under service `MineflayerBot` and account `bot-email`. If omitted, the script will prompt you to enter it interactively.

---

### 2.1 Where files are stored on your Mac

- Project files: wherever you run `git clone` (for example `~/Projects/mineflayer_camerabot`).
- Dependencies: installed into the project’s local `node_modules` directory (no global installs required).
- Credentials: stored in the macOS Keychain (not in your project folder). The bot reads the item `MineflayerBot` / `bot-email` via Keytar.
- Nothing else is written outside your project directory or Keychain.

---

### 3. Credentials (macOS Keychain only) and Microsoft Auth

Microsoft auth in Mineflayer uses Device Code flow and does not require a password in your code. Provide only the Microsoft account email used for Minecraft via macOS Keychain:

- Open Keychain Access.
- Create a new item:
  - Keychain Item Name: `MineflayerBot`
  - Account Name: `bot-email`
  - Password: your Microsoft account email (e.g., `you@example.com`).

On first run, a device code prompt will appear in the console; follow the instructions to complete sign-in. Tokens are cached by Mineflayer’s auth provider.

How the login works (first run):

1. Start the bot. The console prints a Microsoft login URL and a short one-time code.
2. Open the URL in your browser, enter the code, and approve access for the account that matches the email you stored.
   - The browser may auto-select a signed-in Microsoft account; you can switch accounts if needed.
3. Return to the bot process; it will continue automatically once the approval completes.
4. Subsequent runs typically won’t prompt again because tokens are cached by the auth library.

---

### 4. Running

```bash
node cameraBot.js
```

Then open `http://<your-server-ip>:3007` in your browser to view the bot.

Assumes the Minecraft server is reachable at `localhost:25565`.

---



### 6. Client machine notes

- Ensure Node 18+ is installed (e.g., via `nvm` or installer).
- Keep the server and bot on the same LAN for lower latency.
- Expose port `3007` on the client if viewing from other devices (not recommended)

Viewer prerequisites (handled by setup):

- On macOS, `scripts/setup-macos.sh` installs native libraries and the `canvas` package used by Prismarine Viewer.
- If you skip the setup script, install via Homebrew: `brew install pkg-config cairo pango libpng jpeg giflib librsvg`, then `npm install canvas`.

---

### 7. Camera control via chat commands

Usage: `cambot <setting> <value>`

- **entitySearchRadius**: number (blocks). Example: `cambot entitySearchRadius 120`
- **includeHostileMobs**: `true|false`. Example: `cambot includeHostileMobs false`
- **targetMix**: `players_only|entities_only|balanced|player_focused`. Example: `cambot targetMix player_focused`
- **viewModeMix**: `random|look_at|ots|circle|wide`. Example: `cambot viewModeMix circle`
- **circleSpeed**: number. Example: `cambot circleSpeed 0.15`
- **circleRadius**: number (blocks). Example: `cambot circleRadius 8`
- **overShoulderDistance**: number. Example: `cambot overShoulderDistance 6`
- **switchInterval**: minutes (number). Example: `cambot switchInterval 5`

Defaults:

- `defaultGamemode`: `spectator`
- `entitySearchRadius`: `120`
- `includeHostileMobs`: `false`
- `targetMix`: `players_only`
- `viewModeMix`: `look_at`
- `circleSpeed`: `0.15`
- `circleRadius`: `8`
- `overShoulderDistance`: `6`
- `switchInterval`: `5` minutes

---

### 8. Automated tests

Run a simple integration smoke test:

```bash
node runTests.js
```

Checks:
- Connection and spawn
- Spectator mode
- Player discovery

---

### 9. Updating

Safely update to the latest version:

```bash
npm run update
```

This pulls latest changes, reinstalls exact dependencies, and re-runs environment checks.

---

### 10. Dependencies & Resources

- **[Mineflayer](https://github.com/PrismarineJS/mineflayer)** — core bot library
- **[mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder)** — pathfinding and movement goals
- **[Prismarine Viewer](https://github.com/PrismarineJS/prismarine-viewer)** — browser viewer
- **[Keytar](https://github.com/atom/node-keytar)** — macOS Keychain access