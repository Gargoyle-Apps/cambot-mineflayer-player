/*
  Usage:
    node scripts/auth-prompt.js

  Prompts a fresh Microsoft device-code login using the official launcher
  profiles folder and prints the resolved Java profile.
*/

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
    const flow = new Authflow(undefined, profilesFolder);
    const result = await flow.getMinecraftJavaToken({ fetchProfile: true });
    console.log('PROFILE:', result.profile);
  } catch (err) {
    console.error('AUTHFLOW_ERR:', err.message);
    process.exitCode = 1;
  }
})();


