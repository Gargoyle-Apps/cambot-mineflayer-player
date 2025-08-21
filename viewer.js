const { mineflayer: viewer } = require('prismarine-viewer');

const VIEWER_PORT = 3007;

/**
 * Starts the prismarine-viewer for the given bot instance.
 * @param {import('mineflayer').Bot} bot The bot instance to view.
 */
function startViewer(bot) {
  viewer(bot, {
    port: VIEWER_PORT,
    firstPerson: true // Set to true for first-person, false for third-person
  });

  console.log(`Prismarine Viewer started. You can now view the bot's perspective in a web browser.`);
  console.log(`Go to: http://<your-server-ip>:${VIEWER_PORT}`);
}

module.exports = { startViewer };