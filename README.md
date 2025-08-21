# Minecraft Camera Bot

This project uses Mineflayer to create an automated "camera" bot in Minecraft. It connects to a server, exposes a browser-based viewer, and is intended for cinematic behaviors like following and circling players.

---

### 1. Environment Setup

Install on any modern macOS machine (including a Mac mini server):

- **Node.js**: 18.x or newer. Download from [nodejs.org](https://nodejs.org/).
- **npm**: Comes with Node.js.

---

### 2. Installation

Clone and setup (macOS):

```bash
git clone https://github.com/ImpureCrumpet/mineflayer_cameraperson.git
cd mineflayer_cameraperson
npm run setup:macos -- --email "you@example.com"
npm run verify
```

---

### 3. Credentials (macOS Keychain only) and Microsoft Auth

Microsoft auth in Mineflayer uses Device Code flow and does not require a password in your code. Provide only the Microsoft account email used for Minecraft via macOS Keychain:

- Open Keychain Access.
- Create a new item:
  - Keychain Item Name: `MineflayerBot`
  - Account Name: `bot-email`
  - Password: your Microsoft account email (e.g., `you@example.com`).

On first run, a device code prompt will appear in the console; follow the instructions to complete sign-in. Tokens are cached by Mineflayer’s auth provider.

---

### 4. Running

```bash
node cameraBot.js
```

Then open `http://<your-server-ip>:3007` in your browser to view the bot.

---

### 5. Dependencies & Resources

- **[Mineflayer](https://github.com/PrismarineJS/mineflayer)** — core bot library
- **[Prismarine Viewer](https://github.com/PrismarineJS/prismarine-viewer)** — browser viewer
- **[Keytar](https://github.com/atom/node-keytar)** — macOS Keychain access

---

### 6. Mac mini notes

- Ensure Node 18+ is installed (e.g., via `nvm` or installer).
- Keep the server and bot on the same LAN for lower latency.
- Expose port `3007` on the Mac mini if viewing from other devices.

---

### 7. Camera control via chat commands

Usage: `cam <setting> <value>`

- **entitySearchRadius**: number (blocks). Example: `cam entitySearchRadius 150`
- **includeHostileMobs**: `true|false`. Example: `cam includeHostileMobs false`
- **targetMix**: `players_only|entities_only|balanced|player_focused`. Example: `cam targetMix player_focused`
- **viewModeMix**: `random|look_at|ots|circle|wide`. Example: `cam viewModeMix circle`
- **circleSpeed**: number. Example: `cam circleSpeed 0.2`
- **overShoulderDistance**: number. Example: `cam overShoulderDistance 7`
- **switchInterval**: minutes (number). Example: `cam switchInterval 10`

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

### 9. Docker?

Running the bot in Docker on macOS is possible, but offers limited benefit here because:

- The bot relies on macOS Keychain via Keytar for credentials, which is not directly accessible inside a Linux-based container.
- You would have to switch to a different credential mechanism (not recommended for this project’s security posture).

If your Mac mini already runs the Minecraft server in Docker, it’s fine to run the bot on the host macOS instead. This keeps Keychain integration and simplifies networking (connect to `localhost:25565` or LAN IP).