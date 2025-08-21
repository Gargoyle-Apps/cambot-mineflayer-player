// Keychain-only credentials: no environment variable fallbacks

const mineflayer = require('mineflayer');
const keytar = require('keytar');
const { startViewer } = require('./viewer');
const cameraManager = require('./cameraManager');

// --- Configuration ---
const SERVICE_NAME = 'MineflayerBot'; // Must match the Keychain Item Name
const EMAIL_ACCOUNT_KEY = 'bot-email'; // The key for the email item
const SERVER_IP = 'localhost';
const SERVER_PORT = 25565;

// We wrap the main logic in an async function to use 'await'
async function main() {
  try {
    // Read the Microsoft account email from the macOS Keychain.
    const email = await keytar.getPassword(SERVICE_NAME, EMAIL_ACCOUNT_KEY);

    if (!email) {
      console.error(`Could not find bot email in Keychain under service '${SERVICE_NAME}' and account '${EMAIL_ACCOUNT_KEY}'.`);
      console.error('Please provide the email via macOS Keychain only.');
      console.error('Keychain: Item Name = MineflayerBot, Account Name = bot-email, Password = <bot email>');
      return;
    }

    console.log('Email resolved. Starting Microsoft device code authentication on first run if needed...');

    const bot = mineflayer.createBot({
      host: SERVER_IP,
      port: SERVER_PORT,
      username: email,
      auth: 'microsoft'
    });

    // --- Bot Event Handlers ---
    bot.once('spawn', () => {
      console.log(`Bot '${bot.username}' has successfully spawned.`);
      console.log('Bot is now online and ready.');
      startViewer(bot);

      // Set gamemode and start camera manager
      const gamemode = cameraManager.config.defaultGamemode;
      bot.chat(`/gamemode ${gamemode}`);
      cameraManager.start(bot);
    });

    // Chat command handler for cambot controls
    bot.on('chat', (username, message) => {
      if (username === bot.username) return;
      const args = message.split(' ');
      const command = (args[0] || '').toLowerCase();
      if (command !== 'cambot') return;

      const key = args[1];
      let value = args[2];
      if (typeof key === 'undefined') return;

      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (value && !isNaN(parseFloat(value))) {
        if (key === 'switchInterval') value = parseFloat(value) * 60 * 1000;
        else value = parseFloat(value);
      }

      if (cameraManager.updateConfig(key, value)) bot.chat(`Camera setting '${key}' updated.`);
      else bot.chat(`Unknown setting: '${key}'.`);
    });

    bot.on('kicked', console.log);
    bot.on('error', console.error);
    bot.on('end', (reason) => console.log(`Bot disconnected. Reason: ${reason}`));

  } catch (err) {
    console.error('An unexpected error occurred during startup:', err);
  }
}

// Run the main function
main();