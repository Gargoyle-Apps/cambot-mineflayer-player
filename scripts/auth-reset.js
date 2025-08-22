/*
  Usage:
    node scripts/auth-reset.js

  Removes the launcher prismarine-auth cache file and immediately prompts a
  fresh Microsoft device-code login using the launcher profiles folder.
*/

const fs = require('fs');
const path = require('path');
const { Authflow } = require('prismarine-auth');

function resolveLauncherProfilesDir() {
  if (process.platform === 'darwin') {
    return path.join(process.env.HOME || '', 'Library', 'Application Support', 'minecraft');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', '.minecraft');
  }
  return path.join(process.env.HOME || process.env.USERPROFILE || '.', '.minecraft');
}

(async () => {
  try {
    const profilesFolder = resolveLauncherProfilesDir();
    const cacheFile = path.join(profilesFolder, 'prismarine_auth.json');
    const existed = fs.existsSync(cacheFile);
    try {
      fs.rmSync(cacheFile, { force: true });
      console.log(existed ? 'Removed auth cache.' : 'No auth cache found.');
    } catch (e) {
      console.error('Failed to remove auth cache:', e.message);
    }

    const flow = new Authflow(undefined, profilesFolder);
    const result = await flow.getMinecraftJavaToken({ fetchProfile: true });
    console.log('PROFILE:', result.profile);
  } catch (err) {
    console.error('AUTHRESET_ERR:', err.message);
    process.exitCode = 1;
  }
})();


