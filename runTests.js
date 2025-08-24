// runTests.js - integration smoke tests

const mineflayer = require('mineflayer');
const keytar = require('keytar');
const { tryTeleportTo } = require('./cameraBot');

const SERVICE_NAME = 'MineflayerBot';
const SERVER_IP = 'localhost';
const SERVER_PORT = 25565;
const EXPECTED_GAMEMODE = 'spectator';

async function runTests() {
  console.log('--- Running Bot Integration Tests ---');
  let bot;
  const results = { connection: 'FAIL', spectatorMode: 'FAIL', playerDiscovery: 'FAIL', teleportVerify: 'FAIL' };

  try {
    const email = await keytar.getPassword(SERVICE_NAME, 'bot-email');
    if (!email) throw new Error('Email not found in Keychain (MineflayerBot/bot-email).');

    console.log('Connecting...');
    bot = mineflayer.createBot({ host: SERVER_IP, port: SERVER_PORT, username: email, auth: 'microsoft' });

    await new Promise((resolve, reject) => {
      bot.once('spawn', resolve);
      bot.once('kicked', (reason) => reject(new Error(`Kicked: ${reason}`)));
      bot.once('error', (err) => reject(err));
    });

    console.log('✅ Connection OK');
    results.connection = 'PASS';

    await new Promise((r) => setTimeout(r, 800));
    bot.chat(`/gamemode ${EXPECTED_GAMEMODE}`);
    await new Promise((r) => setTimeout(r, 500));

    if (bot.game.gameMode === EXPECTED_GAMEMODE) {
      console.log('✅ Spectator mode OK');
      results.spectatorMode = 'PASS';
    } else {
      console.error(`❌ Spectator mode wrong: ${bot.game.gameMode}`);
    }

    const playerCount = Object.keys(bot.players).length;
    if (playerCount > 1) {
      console.log('✅ Player discovery OK');
      results.playerDiscovery = 'PASS';
      const other = Object.keys(bot.players).find((n) => n !== bot.username);
      if (other) {
        console.log(`Attempting tp verification to ${other} (may require permissions)...`);
        const ok = await tryTeleportTo(bot, other);
        if (ok) {
          console.log('✅ Teleport verification OK');
          results.teleportVerify = 'PASS';
        } else {
          console.warn('⚠️ Teleport verification failed (may be expected without perms)');
        }
      }
    } else {
      console.error('❌ No other players visible');
    }
  } catch (err) {
    console.error('Test error:', err.message);
  } finally {
    console.table(results);
    if (bot) bot.quit();
  }
}

runTests();


