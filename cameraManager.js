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
  targetMix: 'players_only', // players_only | entities_only | balanced | player_focused

  // View modes
  viewModeMix: 'look_at', // random | look_at | ots | circle | wide
  circleSpeed: 0.15, // radians per tick step
  circleRadius: 8, // blocks; used in circle mode
  overShoulderDistance: 6,

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

  // Kick off targeting cycle and movement loop
  pickNextTarget();
  log.debug('manager.initial_target_pick');

  if (movementInterval) clearInterval(movementInterval);
  movementInterval = setInterval(() => {
    safeUpdateMovement();
  }, 1000); // update once per second for smooth but light movement
  log.debug('manager.movement_loop_started', { intervalMs: 1000 });

  if (switchIntervalHandle) clearInterval(switchIntervalHandle);
  switchIntervalHandle = setInterval(() => {
    pickNextTarget(true);
  }, config.switchInterval);
  log.debug('manager.switch_loop_started', { intervalMs: config.switchInterval });
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

function pickNextTarget(force = false) {
  if (!botRef) return;

  // Build candidate list
  const candidates = [];
  const origin = botRef.entity?.position;
  if (!origin) return;

  // Players (exclude self)
  for (const [username, player] of Object.entries(botRef.players)) {
    if (!player || !player.entity) continue;
    if (username === botRef.username) continue;
    if (player.entity.position.distanceTo(origin) <= config.entitySearchRadius) {
      candidates.push(player.entity);
    }
  }

  // Entities (optionally include hostile mobs)
  if (config.targetMix !== 'players_only') {
    for (const entity of Object.values(botRef.entities)) {
      if (!entity || !entity.position) continue;
      if (entity.type !== 'mob' && entity.type !== 'object') continue;
      if (!config.includeHostileMobs && isHostile(entity)) continue;
      if (entity.position.distanceTo(origin) <= config.entitySearchRadius) {
        candidates.push(entity);
      }
    }
  }

  if (candidates.length === 0) {
    currentTarget = null;
    log.debug('manager.no_candidates');
    return;
  }

  // Simple selection policy based on mix
  currentTarget = pickByMix(candidates);
  if (currentTarget) {
    const pos = currentTarget.position;
    log.debug('manager.target_selected', {
      type: currentTarget.username ? 'player' : (currentTarget.type || 'entity'),
      username: currentTarget.username || null,
      pos: pos ? { x: pos.x, y: pos.y, z: pos.z } : null
    });
  }
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

  const targetHead = target.position.offset(0, target.height, 0);
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
      const d = Math.max(12, distance + 8);
      goalPos = bot.entity.position.offset(Math.cos(yaw) * d, 6, Math.sin(yaw) * d);
      break;
    }
    default:
      goalPos = bot.entity.position;
  }

  if (goalPos) {
    // Jitter avoidance: only update pathfinder goal if moved significantly
    const shouldUpdate = !lastGoalPos || goalPos.distanceTo(lastGoalPos) > 0.5;
    if (shouldUpdate) {
      bot.pathfinder.setGoal(new goals.GoalNear(goalPos.x, goalPos.y, goalPos.z, 1));
      lastGoalPos = goalPos.clone();
      const now = Date.now();
      if (now - lastGoalLogTs >= GOAL_LOG_THROTTLE_MS) {
        log.info('manager.goal_updated', { goal: { x: goalPos.x, y: goalPos.y, z: goalPos.z }, mode });
        lastGoalLogTs = now;
      }
    }
  }
}

function randomOf(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = { start, stop, updateConfig, config };


