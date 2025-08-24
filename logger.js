const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const LOG_DIR = path.join(__dirname, 'logs');
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (_) {}

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const MM = pad(date.getMinutes());
  const SS = pad(date.getSeconds());
  return `${yyyy}${mm}${dd}-${HH}${MM}${SS}`;
}

const sessionId = formatTimestamp(new Date());
let currentLogFilePath = path.join(LOG_DIR, `session-${sessionId}.log`);
let stream = fs.createWriteStream(currentLogFilePath, { flags: 'a' });
let bytesWritten = 0;
let openedAtMs = Date.now();

const MAX_BYTES = parseInt(process.env.CAMBOT_LOG_MAX_BYTES || '5242880', 10); // 5 MB
const MAX_AGE_MS = parseInt(process.env.CAMBOT_LOG_MAX_AGE_MS || '900000', 10); // 15 minutes

function rotateIfNeeded(nextBytes) {
  const ageExceeded = Date.now() - openedAtMs >= MAX_AGE_MS;
  const sizeExceeded = bytesWritten + nextBytes >= MAX_BYTES;
  if (!ageExceeded && !sizeExceeded) return;
  try { stream.end(); } catch (_) {}
  const rotateTs = formatTimestamp(new Date());
  currentLogFilePath = path.join(LOG_DIR, `session-${sessionId}-${rotateTs}.log`);
  stream = fs.createWriteStream(currentLogFilePath, { flags: 'a' });
  bytesWritten = 0;
  openedAtMs = Date.now();
}

const LEVEL_ORDER = { error: 0, warn: 1, info: 2, debug: 3 };
let currentLevel = (process.env.CAMBOT_LOG_LEVEL || 'info').toLowerCase();
if (!(currentLevel in LEVEL_ORDER)) currentLevel = 'info';

function shouldLog(level) {
  return LEVEL_ORDER[level] <= LEVEL_ORDER[currentLevel];
}

function write(entry) {
  try {
    const line = JSON.stringify(entry) + '\n';
    rotateIfNeeded(Buffer.byteLength(line));
    stream.write(line);
    bytesWritten += Buffer.byteLength(line);
  } catch (_) {}
}

function baseLog(level, message, data, context) {
  if (!shouldLog(level)) return;
  const ts = new Date().toISOString();
  const entry = {
    ts,
    level,
    message,
    sessionId,
    ...context,
    ...(data || {})
  };
  write(entry);
  const consoleMethod = console[level] ? level : 'log';
  if (LEVEL_ORDER[level] <= LEVEL_ORDER.info) {
    console[consoleMethod](`[${ts}] [${level}] ${message}`, data || {});
  }
}

function setLevel(level) {
  const normalized = String(level || '').toLowerCase();
  if (!(normalized in LEVEL_ORDER)) return false;
  currentLevel = normalized;
  baseLog('info', 'logger.level_changed', { level: currentLevel }, { component: 'logger' });
  return true;
}

function getLevel() {
  return currentLevel;
}

function child(context = {}) {
  return {
    info: (message, data) => baseLog('info', message, data, context),
    warn: (message, data) => baseLog('warn', message, data, context),
    error: (message, data) => baseLog('error', message, data, context),
    debug: (message, data) => baseLog('debug', message, data, context),
    setLevel,
    getLevel,
    file: currentLogFilePath,
    sessionId
  };
}

process.on('beforeExit', () => {
  try { stream.end(); } catch (_) {}
});

module.exports = {
  info: (message, data) => baseLog('info', message, data, {}),
  warn: (message, data) => baseLog('warn', message, data, {}),
  error: (message, data) => baseLog('error', message, data, {}),
  debug: (message, data) => baseLog('debug', message, data, {}),
  setLevel,
  getLevel,
  child,
  file: currentLogFilePath,
  sessionId
};


