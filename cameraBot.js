// No more require('dotenv').config();

const mineflayer = require('mineflayer');
const keytar = require('keytar');
const { startViewer } = require('./viewer');

// --- Configuration ---
const SERVICE_NAME = 'MineflayerBot'; // Must match the Keychain Item Name
const EMAIL_ACCOUNT_KEY = 'bot-email';       // The key for the email item
const PASSWORD_ACCOUNT_KEY = 'bot-password'; // The key for the password item
const SERVER_IP = 'localhost';
const SERVER_PORT = 25565;

// We wrap the main logic in an async function to use 'await'
async function main() {
  try {
    // Fetch both email and password from the Keychain concurrently
    const [email, password] = await Promise.all([
      keytar.getPassword(SERVICE_NAME, EMAIL_ACCOUNT_KEY),
      keytar.getPassword(SERVICE_NAME, PASSWORD_ACCOUNT_KEY)
    ]);

    if (!email || !password) {
      console.error(`Could not find email or password in Keychain under the service name '${SERVICE_NAME}'.`);
      console.error('Please ensure you have stored both correctly in the Keychain Access app.');
      return;
    }

    console.log('Successfully retrieved credentials from Keychain. Attempting to connect...');

    const bot = mineflayer.createBot({
      host: SERVER_IP,
      port: SERVER_PORT,
      username: email,    // Use the email we fetched
      password: password, // Use the password we fetched
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