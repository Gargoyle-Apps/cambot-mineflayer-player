// cameraManager.js
// Centralized camera behavior: target selection, view modes, movement updates

const { pathfinder, goals: pathfinderGoals, Movements } = require('mineflayer-pathfinder');
const logger = require('./logger');
const log = logger.child({ component: 'manager' });

// --- Default Configuration ---
const config = {
  defaultGamemode: 'spectator',

  // Targeting
  entitySearchRadius: 120, // blocks
  includeHostileMobs: false,
  targetMix: 'players_only', // keep players_only as default; entity scanning disabled in tp mode

  // View modes
  viewModeMix: 'look_at', // random | look_at | ots | circle | wide
  circleSpeed: 0.15, // radians per tick step
  circleRadius: 8, // blocks; used in circle mode
  overShoulderDistance: 6,

  // Movement smoothing & thresholds
  goalUpdateEpsilon: 0.5, // minimum delta from last goal to update (blocks)
  targetMotionEpsilon: 0.35, // minimum target motion to trigger update (blocks)
  minGoalUpdateIntervalMs: 300, // min interval between goal updates
  goalNearTolerance: 1, // pathfinder GoalNear radius
  targetHeadFactor: 0.9, // fraction of target height to look at
  smoothingAlpha: 0.35, // EMA factor applied to goal positions [0..1]

  // Wide mode tuning
  wideHeight: 6,
  wideBackoffExtra: 8, // extra distance added to current distance
  wideMinDistance: 12,

  // Timing
  switchInterval: 5 * 60 * 1000 // 5 minutes in ms
};

// Runtime state
let botRef = null;
let currentTarget = null;
let movementInterval = null;
let switchIntervalHandle = null;
let circleAngle = 0;
let lastGoalPos = null; // For jitter avoidance
let lastGoalLogTs = 0;
const GOAL_LOG_THROTTLE_MS = parseInt(process.env.CAMBOT_GOAL_LOG_THROTTLE_MS || '2000', 10);
let lockedPlayerName = null; // When set, we only track this player's entity
let lastTargetPos = null;
let lastGoalSetTs = 0;

function start(bot) {
  if (botRef) stop();
  botRef = bot;
  log.debug('manager.start', { username: botRef.username });

  // Ensure pathfinder is loaded
  if (!botRef.pathfinder) {
    botRef.loadPlugin(pathfinder);
  }
  const movements = new Movements(botRef);
  botRef.pathfinder.setMovements(movements);

  // Kick off movement loop; selection is lock-driven now

  if (movementInterval) clearInterval(movementInterval);
  movementInterval = setInterval(() => {
    safeUpdateMovement();
  }, 1000); // update once per second for smooth but light movement
  log.debug('manager.movement_loop_started', { intervalMs: 1000 });

  // Disable old target switching loop; view targets are lock-driven via teleport
  if (switchIntervalHandle) clearInterval(switchIntervalHandle);
  switchIntervalHandle = null;
}

function stop() {
  log.debug('manager.stop');
  if (movementInterval) clearInterval(movementInterval);
  if (switchIntervalHandle) clearInterval(switchIntervalHandle);
  movementInterval = null;
  switchIntervalHandle = null;
  currentTarget = null;
  botRef = null;
}

function updateConfig(key, value) {
  if (!(key in config)) return false;
  config[key] = value;
  log.debug('manager.config_updated', { key, value });
  return true;
}

function pickNextTarget() {
  // Deprecated in tp mode; kept as no-op to avoid breaking callers
}

function pickByMix(candidates) {
  // players_only prioritizes player entities when present
  if (config.targetMix === 'players_only') {
    const players = candidates.filter(e => e.username);
    if (players.length > 0) return randomOf(players);
  }
  if (config.targetMix === 'entities_only') {
    const nonPlayers = candidates.filter(e => !e.username);
    if (nonPlayers.length > 0) return randomOf(nonPlayers);
  }
  if (config.targetMix === 'player_focused') {
    const players = candidates.filter(e => e.username);
    if (players.length > 0 && Math.random() < 0.67) return randomOf(players);
  }
  // balanced or fallback
  return randomOf(candidates);
}

function isHostile(entity) {
  const name = entity.name || '';
  const hostile = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'guardian', 'pillager'];
  return hostile.includes(name);
}

function safeUpdateMovement() {
  if (!botRef || !currentTarget) return;
  if (!currentTarget.isValid) {
    currentTarget = null;
    log.debug('manager.target_invalid');
    return;
  }

  try {
    const mode = resolveMode(config.viewModeMix);
    log.debug('manager.mode_resolved', { mode });
    performModeMovement(mode);
  } catch (err) {
    log.error('manager.movement_error', { error: err.message });
  }
}

function resolveMode(mode) {
  if (mode === 'random') {
    const modes = ['look_at', 'ots', 'circle', 'wide'];
    return randomOf(modes);
  }
  return mode;
}

function performModeMovement(mode) {
  const bot = botRef;
  const target = currentTarget;
  const goals = pathfinderGoals;

  const targetHead = target.position.offset(0, target.height * config.targetHeadFactor, 0);
  bot.lookAt(targetHead, true);

  let goalPos = null;
  const distance = bot.entity?.position.distanceTo(target.position) || 0;

  switch (mode) {
    case 'look_at':
      // Hold position near current spot
      goalPos = bot.entity.position;
      break;
    case 'ots': {
      // Offset behind current bot facing vector
      const yaw = bot.entity.yaw || 0;
      const d = config.overShoulderDistance;
      goalPos = bot.entity.position.offset(-Math.sin(yaw) * d, 0, Math.cos(yaw) * d);
      break;
    }
    case 'circle': {
      circleAngle += config.circleSpeed;
      const radius = Math.max(2, config.circleRadius);
      const x = target.position.x + Math.cos(circleAngle) * radius;
      const z = target.position.z + Math.sin(circleAngle) * radius;
      const y = target.position.y + target.height * 0.6;
      goalPos = bot.entity.position.clone();
      goalPos.x = x; goalPos.y = y; goalPos.z = z;
      break;
    }
    case 'wide': {
      const yaw = bot.entity.yaw || 0;
      const d = Math.max(config.wideMinDistance, distance + config.wideBackoffExtra);
      goalPos = bot.entity.position.offset(Math.cos(yaw) * d, config.wideHeight, Math.sin(yaw) * d);
      break;
    }
    default:
      goalPos = bot.entity.position;
  }

  if (goalPos) {
    // Optional smoothing (EMA)
    if (lastGoalPos && config.smoothingAlpha > 0 && config.smoothingAlpha < 1) {
      goalPos = lastGoalPos.clone().lerp(goalPos, config.smoothingAlpha);
    }

    const now = Date.now();
    const sinceLast = now - lastGoalSetTs;
    const targetDelta = lastTargetPos ? target.position.distanceTo(lastTargetPos) : Infinity;
    const goalDelta = !lastGoalPos ? Infinity : goalPos.distanceTo(lastGoalPos);

    const passedInterval = sinceLast >= config.minGoalUpdateIntervalMs;
    const movedEnough = goalDelta > config.goalUpdateEpsilon || targetDelta > config.targetMotionEpsilon;

    if (!lastGoalPos || (passedInterval && movedEnough)) {
      bot.pathfinder.setGoal(new goals.GoalNear(goalPos.x, goalPos.y, goalPos.z, config.goalNearTolerance));
      lastGoalPos = goalPos.clone();
      lastGoalSetTs = now;
      if (now - lastGoalLogTs >= GOAL_LOG_THROTTLE_MS) {
        log.info('manager.goal_updated', { goal: { x: goalPos.x, y: goalPos.y, z: goalPos.z }, mode });
        lastGoalLogTs = now;
      }
    }
    lastTargetPos = target.position.clone();
  }
}

function randomOf(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function lockTargetToPlayer(name) {
  lockedPlayerName = name || null;
  log.debug('manager.lock_target_set', { name: lockedPlayerName });
}

function clearTargetLock() {
  lockedPlayerName = null;
  currentTarget = null;
  log.debug('manager.lock_target_cleared');
}

// Resolve currentTarget from lock before each movement update
const _origSafeUpdateMovement = safeUpdateMovement;
safeUpdateMovement = function () {
  if (!botRef) return;
  if (lockedPlayerName) {
    const info = botRef.players[lockedPlayerName];
    currentTarget = info && info.entity ? info.entity : null;
    if (!currentTarget) {
      log.debug('manager.lock_target_not_visible', { name: lockedPlayerName });
    }
  }
  _origSafeUpdateMovement();
};

module.exports = { start, stop, updateConfig, config, lockTargetToPlayer, clearTargetLock };


