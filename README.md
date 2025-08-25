# Minecraft Camera Bot

This project uses Mineflayer to create an automated "camera" bot in Minecraft. It connects to a server, exposes a browser-based viewer, and is intended for cinematic behaviors like following and circling players.

---

### 1. Environment Setup

Install on any modern macOS machine (including a Mac mini server):

- **Node.js**: 22.x (recommended). Download from [nodejs.org](https://nodejs.org/).
- If using Node 24+, install Xcode Command Line Tools when prompted the first time a native module builds.
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

Important:
- Before setting up the bot, sign into the official Minecraft Launcher with the Microsoft account that owns Java Edition and launch Java once. This ensures your Java profile is created.
- The bot uses the launcher’s auth cache (profiles folder) by default, so it will share the same login.

---

### 4. Running

```bash
node cameraBot.js
```

Then open `http://<your-server-ip>:3007` in your browser to view the bot.

Assumes the Minecraft server is reachable at `localhost:25565`.

Viewer can be disabled (useful for tests or headless environments):

```bash
CAMBOT_ENABLE_VIEWER=false node cameraBot.js
```

If you get an auth error (e.g., "Profile not found"):

- Trigger a device-code login (terminal):
  - `npm run auth:prompt`
- Or clear auth and re-prompt:
  - `npm run auth:reset`

Ensure you sign in with the Microsoft account that owns Java and has launched the game at least once. The bot uses the launcher’s auth cache by default.

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

Auth/reauth commands:

- `cambot reauth`: Clears the launcher auth cache file (`prismarine_auth.json`) and exits. Run the bot again to trigger a fresh Microsoft device-code login.

Verbose and logging controls:

- `cambot verbose` — toggles server chat announcements (compact, deduped)
- `cambot verbose on|off` — explicit control
- `cambot loglevel error|warn|info|debug` — adjust file/console logging verbosity at runtime

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
CAMBOT_ENABLE_VIEWER=false npm test
```

Checks:
- Connection and spawn
- Spectator mode
- Player discovery
- Teleport verification (may require permissions on your server)

---

### 9. Updating

Safely update to the latest version:

```bash
npm run update
```

This pulls latest changes, reinstalls exact dependencies, and re-runs environment checks.

Security note: The project enforces patched transitive dependencies via npm overrides (axios and @xboxreplay/xboxlive-auth). Pulling latest and reinstalling is sufficient; no manual pinning required.

---

### 10. Logging

- Structured JSONL logs are written to `logs/session-<timestamp>.log`.
- Automatic rotation by size and time; settings in environment variables below.
- Movement goal updates log at `info` by default (throttled); lifecycle logs at `debug`.

---

### 11. Camera control via chat commands: Environment variables

- `CAMBOT_ENABLE_VIEWER` — set to `false` to disable the viewer (default: enabled)
- `CAMBOT_VIEW_DISTANCE` — chunks to request from server (default: `6`)
- `CAMBOT_LOG_LEVEL` — `error|warn|info|debug` (default: `info`)
- `CAMBOT_LOG_MAX_BYTES` — rotate log file at size in bytes (default: `5242880` ≈ 5MB)
- `CAMBOT_LOG_MAX_AGE_MS` — rotate log file by age in ms (default: `900000` = 15m)
- `CAMBOT_GOAL_LOG_THROTTLE_MS` — throttle movement goal logs (default: `2000`)
- `CAMBOT_TP_DWELL_MS` — per-player filming time in ms (default: `20000`)
- `CAMBOT_TP_POLL_MS` — idle poll interval in ms when no players online (default: `5000`)
- `CAMBOT_TP_TIMEOUT_MS` — teleport verification timeout in ms (default: `4000`)
- `CAMBOT_TP_MIN_DELTA` — minimum position delta (blocks) to confirm teleport (default: `0.5`)

---

### 12. Dependencies & Resources

- **[Mineflayer](https://github.com/PrismarineJS/mineflayer)** — core bot library
- **[mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder)** — pathfinding and movement goals
- **[Prismarine Viewer](https://github.com/PrismarineJS/prismarine-viewer)** — browser viewer
- **[Keytar](https://github.com/atom/node-keytar)** — macOS Keychain access

Optional (server-side, Fabric) for version bridging:

- **ViaFabric (Fabric mod)** — allows newer/older clients to connect to your Fabric server. Install the jar in your server `mods/` folder.
- **ViaBackwards (plugin/mod)** — enables older clients (e.g., 1.21) to join newer servers (e.g., 1.21.7). Install alongside ViaFabric.

 