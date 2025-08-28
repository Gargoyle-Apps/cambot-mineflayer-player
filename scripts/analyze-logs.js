#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function loadJsonLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj && obj.ts && obj.message) entries.push(obj);
    } catch (_) {}
  }
  // Ensure chronological order by timestamp
  entries.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return entries;
}

function findLatestLogFile(logDir) {
  const files = fs.readdirSync(logDir)
    .filter(f => f.startsWith('session-') && f.endsWith('.log'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(logDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length > 0 ? path.join(logDir, files[0].name) : null;
}

function distance3(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

function analyze(entries) {
  const sessions = [];
  let current = null;

  for (const e of entries) {
    const ts = new Date(e.ts).getTime();
    const msg = String(e.message || '');

    if (msg === 'tp.success') {
      // finalize previous session
      if (current) {
        current.endTs = current.lastSeenTs || current.startTs;
        sessions.push(current);
      }
      current = {
        player: e.target || 'unknown',
        origin: e.origin || null,
        dwellMsPlanned: e.dwellMs || null,
        startTs: ts,
        lastSeenTs: ts,
        goals: [],
        modes: {},
      };
      continue;
    }

    if (msg === 'manager.goal_updated') {
      // attach only if goal belongs to an active tp session
      const tpTarget = e.tpTarget;
      const tpOrigin = e.tpOrigin;
      if (!current) continue;
      if (!tpTarget || tpTarget !== current.player) continue;
      if (!current.origin && tpOrigin) current.origin = tpOrigin;

      const goal = e.goal || null;
      const mode = e.mode || 'unknown';
      if (goal) {
        const distFromOrigin = current.origin ? distance3(goal, current.origin) : null;
        current.goals.push({ ts, goal, mode, distFromOrigin });
        current.modes[mode] = (current.modes[mode] || 0) + 1;
        current.lastSeenTs = ts;
      }
      continue;
    }

    if (msg === 'tp.target_left') {
      if (current && e.target && e.target === current.player) {
        current.endTs = ts;
        sessions.push(current);
        current = null;
      }
      continue;
    }
  }

  if (current) {
    current.endTs = current.lastSeenTs || current.startTs;
    sessions.push(current);
  }

  const summaries = sessions.map((s, idx) => {
    const durationMs = (s.endTs || s.startTs) - s.startTs;
    const goalCount = s.goals.length;
    let avgDist = null, maxDist = null;
    const distances = s.goals.map(g => g.distFromOrigin).filter(d => typeof d === 'number');
    if (distances.length > 0) {
      const sum = distances.reduce((a, b) => a + b, 0);
      avgDist = sum / distances.length;
      maxDist = Math.max(...distances);
    }
    return {
      index: idx + 1,
      player: s.player,
      start: new Date(s.startTs).toISOString(),
      durationSec: Math.round(durationMs / 1000),
      plannedDwellSec: s.dwellMsPlanned ? Math.round(s.dwellMsPlanned / 1000) : null,
      origin: s.origin || null,
      goals: goalCount,
      avgDistFromOrigin: avgDist !== null ? Number(avgDist.toFixed(2)) : null,
      maxDistFromOrigin: maxDist !== null ? Number(maxDist.toFixed(2)) : null,
      modes: s.modes,
    };
  });

  return { sessions: summaries };
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const fileArgIdx = args.indexOf('--file');
  const useLast = args.includes('--last');

  const projectRoot = path.join(__dirname, '..');
  const logDir = path.join(projectRoot, 'logs');

  let filePath = null;
  if (fileArgIdx !== -1 && args[fileArgIdx + 1]) {
    filePath = path.resolve(args[fileArgIdx + 1]);
  } else if (useLast) {
    filePath = findLatestLogFile(logDir);
  }

  if (!filePath || !fs.existsSync(filePath)) {
    console.error('No log file found. Use --file <path> or --last');
    process.exit(2);
  }

  const entries = loadJsonLines(filePath);
  const result = analyze(entries);

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Analyzed: ${path.basename(filePath)}`);
    console.table(result.sessions);
  }
}

if (require.main === module) main();


