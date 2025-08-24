// Keychain-only credentials: no environment variable fallbacks

const mineflayer = require('mineflayer');
const keytar = require('keytar');
const cameraManager = require('./cameraManager');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const log = logger.child({ component: 'bot' });

// --- Configuration ---
const SERVICE_NAME = 'MineflayerBot'; // Must match the Keychain Item Name
const EMAIL_ACCOUNT_KEY = 'bot-email'; // The key for the email item
const SERVER_IP = 'localhost';
const SERVER_PORT = 25565;
const VIEW_DISTANCE = parseInt(process.env.CAMBOT_VIEW_DISTANCE || '6', 10);
const TP_DWELL_MS = parseInt(process.env.CAMBOT_TP_DWELL_MS || '20000', 10);
const TP_POLL_MS = parseInt(process.env.CAMBOT_TP_POLL_MS || '5000', 10);
const TP_TIMEOUT_MS = parseInt(process.env.CAMBOT_TP_TIMEOUT_MS || '2000', 10);
const TP_MIN_DELTA = parseFloat(process.env.CAMBOT_TP_MIN_DELTA || '3');
let VERBOSE_ENABLED = false; // toggled via chat: "cambot verbose [on|off]"
// Use the official launcher profiles folder so the bot shares the same auth
const PROFILES_DIR = (function () {
  if (process.platform === 'darwin') {
    return path.join(process.env.HOME || '', 'Library', 'Application Support', 'minecraft');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', '.minecraft');
  }
  return path.join(process.env.HOME || process.env.USERPROFILE || '.', '.minecraft');
})();

// Probe teleport permission by issuing a self-teleport with invalid coordinates.
// If the server checks permission first, lack of permission yields a permission error.
// If permitted, we'll get a validation error like "Y coordinate is too high".
function probeTeleport(bot) {
  return new Promise((resolve) => {
    let resolved = false;
    const timeoutMs = 2000;

    function cleanup(result) {
      if (resolved) return;
      resolved = true;
      bot.removeListener('message', onMessage);
      clearTimeout(timer);
      resolve(result);
    }

    function onMessage(jsonMsg) {
      try {
        const text = jsonMsg && typeof jsonMsg.toString === 'function' ? jsonMsg.toString() : String(jsonMsg || '');
        const lower = (text || '').toLowerCase();
        if (!lower) return;
        if (lower.includes('permission')) return cleanup(false);
        if (
          lower.includes('teleported') ||
          lower.includes('invalid') ||
          lower.includes('too high') ||
          lower.includes('no entity was found') ||
          lower.includes('expected')
        ) return cleanup(true);
      } catch (_) {}
    }

    bot.on('message', onMessage);
    // Target impossible Y to force validation if allowed
    bot.chat('/tp @s 0 1000000 0');
    const timer = setTimeout(() => cleanup(undefined), timeoutMs);
  });
}

function listOnlinePlayerNames(bot) {
  const names = [];
  for (const [name, info] of Object.entries(bot.players)) {
    if (!info) continue;
    if (name === bot.username) continue;
    names.push(name);
  }
  return names;
}

function tryTeleportTo(bot, targetName) {
  return new Promise((resolve) => {
    let resolved = false;
    const startPos = bot.entity && bot.entity.position ? bot.entity.position.clone() : null;

    function finish(result, reason) {
      if (resolved) return;
      resolved = true;
      bot.removeListener('message', onMsg);
      bot.removeListener('move', onMove);
      clearTimeout(timer);
      if (result) log.info('tp.verified', { target: targetName, reason });
      else log.warn('tp.not_verified', { target: targetName, reason });
      resolve({ ok: !!result, reason });
    }

    function onMsg(jsonMsg) {
      try {
        const text = jsonMsg && typeof jsonMsg.toString === 'function' ? jsonMsg.toString() : String(jsonMsg || '');
        const lower = (text || '').toLowerCase();
        if (!lower) return;
        if (lower.includes('you do not have permission')) return finish(false, 'permission');
        if (lower.includes('player not found') || lower.includes('no entity was found')) return finish(false, 'player_not_found');
        if (lower.includes('unknown or incomplete command')) return finish(false, 'server_message');
      } catch (_) {}
    }

    function onMove() {
      try {
        if (!startPos) return;
        const nowPos = bot.entity && bot.entity.position ? bot.entity.position : null;
        if (!nowPos) return;
        const dx = nowPos.x - startPos.x;
        const dy = nowPos.y - startPos.y;
        const dz = nowPos.z - startPos.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist >= TP_MIN_DELTA) return finish(true, 'position_changed');
      } catch (_) {}
    }

    bot.on('message', onMsg);
    bot.on('move', onMove);
    bot.chat(`/tp ${targetName}`);
    const timer = setTimeout(() => finish(false, 'timeout'), TP_TIMEOUT_MS);
  });
}

function startTeleportFilmingLoop(bot) {
  let active = true;
  const roster = new Set();
  let queue = [];
  let idx = 0;
  let timer = null; // used for both idle poll and dwell
  let currentTargetName = null;
  let inStep = false;
  let debounceTimer = null;
  let lastSaid = { msg: '', ts: 0 };
  let hasAnnouncedFirst = false;

  function sayCompact(msg) {
    if (!VERBOSE_ENABLED) return;
    const now = Date.now();
    if (msg === lastSaid.msg && now - lastSaid.ts < 5000) return; // dedupe identical within 5s
    if (now - lastSaid.ts < 1000) return; // 1s cooldown
    bot.chat(`[Cambot] ${msg}`);
    lastSaid = { msg, ts: now };
  }

  function stopTimer() { if (timer) clearTimeout(timer); timer = null; }

  function rebuildQueue() {
    queue = Array.from(roster);
    // Ensure bot itself is not included
    const selfIdx = queue.indexOf(bot.username);
    if (selfIdx !== -1) queue.splice(selfIdx, 1);
    if (idx >= queue.length) idx = 0;
    log.debug('tp.queue_refreshed', { queue });
  }

  function snapshotRoster() {
    for (const name of Object.keys(bot.players)) {
      if (name && name !== bot.username) roster.add(name);
    }
    rebuildQueue();
  }

  function debounceUpdate() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      rebuildQueue();
      if (queue.length > 0 && timer === null) step();
    }, 250);
  }

  async function step() {
    if (!active) return;
    if (inStep) return;
    inStep = true;
    stopTimer();
    try {
      if (queue.length === 0) {
        log.debug('tp.idle_waiting', { pollMs: TP_POLL_MS });
        sayCompact('No players online. Waiting…');
        timer = setTimeout(() => { rebuildQueue(); inStep = false; step(); }, TP_POLL_MS);
        return;
      }

      const name = queue[idx];
      log.info('tp.attempt', { target: name });
      const { ok, reason } = await tryTeleportTo(bot, name);
      if (!ok) {
        log.warn('tp.failed', { target: name, reason });
        sayCompact(`Teleport failed (${reason || 'unknown'}).`);
        roster.delete(name); // remove problematic entry
        rebuildQueue();
        inStep = false;
        step();
        return;
      }

      log.info('tp.success', { target: name, dwellMs: TP_DWELL_MS });
      currentTargetName = name;
      try { cameraManager.lockTargetToPlayer(name); } catch (_) {}
      const dwellSeconds = Math.round(TP_DWELL_MS / 1000);
      const mode = cameraManager && cameraManager.config ? cameraManager.config.viewModeMix : 'look_at';
      if (!hasAnnouncedFirst) {
        sayCompact(`Teleported to ${name}. Filming ${dwellSeconds}s. Mode=${mode}.`);
        hasAnnouncedFirst = true;
      } else {
        sayCompact(`Switched to ${name}. Filming ${dwellSeconds}s. Mode=${mode}.`);
      }
      timer = setTimeout(() => {
        idx = (idx + 1) % Math.max(1, queue.length);
        currentTargetName = null;
        inStep = false;
        step();
      }, TP_DWELL_MS);
    } catch (e) {
      inStep = false;
      log.error('tp.step_error', { error: e?.message || String(e) });
      timer = setTimeout(() => { step(); }, TP_POLL_MS);
    }
  }

  bot.on('playerJoined', (player) => {
    const name = typeof player === 'string' ? player : (player && player.username) ? player.username : null;
    if (name) roster.add(name);
    debounceUpdate();
  });
  bot.on('playerLeft', (player) => {
    const leftName = typeof player === 'string' ? player : (player && player.username) ? player.username : null;
    if (leftName) roster.delete(leftName);
    rebuildQueue();
    if (leftName && currentTargetName && leftName === currentTargetName) {
      log.info('tp.target_left', { target: leftName });
      stopTimer();
      currentTargetName = null;
      inStep = false;
      sayCompact(`${leftName} left. Continuing.`);
      step();
    } else {
      debounceUpdate();
    }
  });
  bot.on('end', () => { active = false; stopTimer(); });

  snapshotRoster();
  step();

  return () => { active = false; stopTimer(); };
}

// We wrap the main logic in an async function to use 'await'
async function main() {
  try {
    // Read the Microsoft account email from the macOS Keychain.
    const email = await keytar.getPassword(SERVICE_NAME, EMAIL_ACCOUNT_KEY);

    if (!email) {
      log.error('auth.email_missing', { service: SERVICE_NAME, account: EMAIL_ACCOUNT_KEY });
      console.error(`Could not find bot email in Keychain under service '${SERVICE_NAME}' and account '${EMAIL_ACCOUNT_KEY}'.`);
      console.error('Please provide the email via macOS Keychain only.');
      console.error('Keychain: Item Name = MineflayerBot, Account Name = bot-email, Password = <bot email>');
      return;
    }

    log.info('auth.email_resolved');
    log.info('bot.starting', { server: { host: SERVER_IP, port: SERVER_PORT }, profilesFolder: PROFILES_DIR, node: process.versions.node });
    console.log('Email resolved. Starting Microsoft device code authentication on first run if needed...');

    const bot = mineflayer.createBot({
      host: SERVER_IP,
      port: SERVER_PORT,
      username: email,
      auth: 'microsoft',
      // Default to 1.21 so servers with ViaBackwards can accept the client.
      // If your server is strictly 1.21.7 without ViaBackwards, change to '1.21.7'.
      version: '1.21',
      profilesFolder: PROFILES_DIR
    });

    // --- Bot Event Handlers ---
    bot.once('spawn', () => {
      log.info('bot.spawned', { username: bot.username });
      console.log(`Bot '${bot.username}' has successfully spawned.`);
      console.log('Bot is now online and ready.');
      if (process.env.CAMBOT_ENABLE_VIEWER !== 'false') {
        try {
          const { startViewer } = require('./viewer');
          startViewer(bot);
          log.info('viewer.started');
        } catch (e) {
          log.warn('viewer.start_failed', { error: e?.message || String(e) });
        }
      } else {
        log.debug('viewer.disabled');
      }

      // Set gamemode and start camera manager
      bot.setSettings({ viewDistance: VIEW_DISTANCE });
      log.debug('settings.view_distance_set', { viewDistance: VIEW_DISTANCE });
      const gamemode = cameraManager.config.defaultGamemode;
      bot.chat(`/gamemode ${gamemode}`);
      log.info('gamemode.set', { gamemode });
      cameraManager.start(bot);
      log.info('manager.started');

      // Probe teleport permission and cache on bot
      probeTeleport(bot).then((canTp) => {
        bot.canTeleport = !!canTp;
        log.info('capability.teleport_probed', { canTeleport: bot.canTeleport });
        if (bot.canTeleport) {
          log.info('tp.loop_start');
          startTeleportFilmingLoop(bot);
        } else {
          const msg = "cambot can't teleport";
          bot.chat(msg);
          console.log(msg);
          log.warn('tp.unavailable');
        }
      }).catch((e) => {
        log.warn('capability.teleport_probe_failed', { error: e?.message || String(e) });
      });
    });

    // Chat command handler for cambot controls
    bot.on('chat', (username, message) => {
      if (username === bot.username) return;
      const args = message.split(' ');
      const command = (args[0] || '').toLowerCase();
      if (command !== 'cambot') return;

      const key = args[1];
      let value = args[2];
      log.info('chat.command_received', { from: username, key, value });
      if (key === 'verbose') {
        if (!value) {
          VERBOSE_ENABLED = !VERBOSE_ENABLED;
        } else {
          const v = String(value).toLowerCase();
          VERBOSE_ENABLED = v === 'on' || v === 'true' || v === '1';
        }
        bot.chat(`[Cambot] Verbose ${VERBOSE_ENABLED ? 'on' : 'off'}.`);
        return;
      }

      // Help output
      if (typeof key === 'undefined' || key === 'help') {
        bot.chat("cambot usage: cambot <setting> <value>");
        bot.chat("settings: entitySearchRadius, includeHostileMobs, targetMix, viewModeMix, circleSpeed, circleRadius, overShoulderDistance, switchInterval (minutes)");
        const cfg = cameraManager.config;
        bot.chat(`current: radius=${cfg.entitySearchRadius}, hostile=${cfg.includeHostileMobs}, mix=${cfg.targetMix}, mode=${cfg.viewModeMix}`);
        bot.chat(`current: circleSpeed=${cfg.circleSpeed}, circleRadius=${cfg.circleRadius}, overShoulder=${cfg.overShoulderDistance}, switchInterval=${Math.round(cfg.switchInterval/60000)}m`);
        log.info('chat.help_shown', { to: username });
        return;
      }

      // Reauth command: clear launcher auth cache file and exit for fresh device-code login on next start
      if (key === 'reauth') {
        try {
          const cacheFile = path.join(PROFILES_DIR, 'prismarine_auth.json');
          const existed = fs.existsSync(cacheFile);
          fs.rmSync(cacheFile, { force: true });
          bot.chat(existed ? 'Auth cache removed. Restarting to trigger re-auth...' : 'No auth cache found. Restarting to trigger new login...');
          log.warn('auth.reauth_requested', { from: username, removed: existed });
        } catch (e) {
          bot.chat('Failed to clear auth cache, check logs.');
          log.error('auth.reauth_failed', { error: e.message });
        }
        setTimeout(() => process.exit(0), 300);
        return;
      }

      // Dynamic log level control
      if (key === 'loglevel') {
        const ok = logger.setLevel(value);
        if (ok) {
          bot.chat(`Log level set to ${logger.getLevel()}`);
          log.info('logger.level_updated', { by: username, level: logger.getLevel() });
        } else {
          bot.chat('Invalid log level. Use one of: error, warn, info, debug');
          log.warn('logger.level_invalid', { requested: value, by: username });
        }
        return;
      }

      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (value && !isNaN(parseFloat(value))) {
        if (key === 'switchInterval') value = parseFloat(value) * 60 * 1000;
        else value = parseFloat(value);
      } else if (['entitySearchRadius', 'circleSpeed', 'overShoulderDistance', 'switchInterval', 'circleRadius'].includes(key)) {
        bot.chat(`Invalid number value for ${key}.`);
        log.warn('config.update_invalid_number', { key, raw: args[2] });
        return;
      }

      if (cameraManager.updateConfig(key, value)) {
        bot.chat(`Camera setting '${key}' updated.`);
        log.info('config.update', { key, value, by: username });
      } else {
        bot.chat(`Unknown setting: '${key}'.`);
        log.warn('config.update_unknown_key', { key, by: username });
      }
    });

    bot.on('kicked', (reason) => {
      log.warn('bot.kicked', { reason });
      console.log(reason);
    });
    bot.on('error', (err) => {
      log.error('bot.error', { error: err?.message || String(err) });
      console.error(err);
    });
    bot.on('end', (reason) => {
      log.info('bot.ended', { reason });
      console.log(`Bot disconnected. Reason: ${reason}`);
    });

  } catch (err) {
    log.error('bot.unexpected_error', { error: err?.message || String(err) });
    console.error('An unexpected error occurred during startup:', err);
  }
}

// Run the main function when executed directly
if (require.main === module) {
  main();
}

// Export test hooks
module.exports = {
  probeTeleport,
  listOnlinePlayerNames,
  tryTeleportTo,
  startTeleportFilmingLoop
};