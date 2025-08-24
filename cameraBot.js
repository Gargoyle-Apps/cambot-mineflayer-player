// Keychain-only credentials: no environment variable fallbacks

const mineflayer = require('mineflayer');
const keytar = require('keytar');
const { startViewer } = require('./viewer');
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
      startViewer(bot);
      log.info('viewer.started');

      // Set gamemode and start camera manager
      bot.setSettings({ viewDistance: VIEW_DISTANCE });
      log.debug('settings.view_distance_set', { viewDistance: VIEW_DISTANCE });
      const gamemode = cameraManager.config.defaultGamemode;
      bot.chat(`/gamemode ${gamemode}`);
      log.info('gamemode.set', { gamemode });
      cameraManager.start(bot);
      log.info('manager.started');
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

// Run the main function
main();