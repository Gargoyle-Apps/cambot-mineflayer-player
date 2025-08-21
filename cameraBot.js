require('dotenv').config();

const mineflayer = require('mineflayer');
const keytar = require('keytar');
const { startViewer } = require('./viewer');

// --- Configuration ---
const SERVICE_NAME = 'MineflayerBot'; // Must match the Keychain Item Name
const EMAIL_ACCOUNT_KEY = 'bot-email'; // The key for the email item
const SERVER_IP = 'localhost';
const SERVER_PORT = 25565;

// We wrap the main logic in an async function to use 'await'
async function main() {
  try {
    // Attempt to read the Microsoft account email from Keychain first,
    // falling back to the BOT_EMAIL environment variable if not found.
    let email = await keytar.getPassword(SERVICE_NAME, EMAIL_ACCOUNT_KEY);
    if (!email && process.env.BOT_EMAIL) {
      email = process.env.BOT_EMAIL;
    }

    if (!email) {
      console.error(`Could not find bot email in Keychain under service '${SERVICE_NAME}' and account '${EMAIL_ACCOUNT_KEY}'.`);
      console.error('Provide the email using macOS Keychain OR set the environment variable BOT_EMAIL.');
      console.error('Keychain: Item Name = MineflayerBot, Account Name = bot-email, Password = <bot email>');
      console.error('Env var example: BOT_EMAIL="email@example.com" node cameraBot.js');
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