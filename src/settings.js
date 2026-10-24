// Настройки игры + локальная таблица рекордов (localStorage)
const KEY = 'rally_duo_settings_v1';
const SCORE_KEY = 'rally_duo_scores_v1';

export const DEFAULTS = {
  playerName: 'Гонщик',
  carColor: '#e63946',
  carColor2: '#ffffff',
  // звук
  master: 0.9, music: 0.45, engineVol: 0.85, sfx: 0.9, voiceVol: 1.0,
  musicOn: true, tts: true, ttsRate: 1.08,
  // голос
  micMode: 'ptt',            // ptt | open | off
  voiceChannel: 'team',      // team | all
  echoCancel: true, noiseSupp: true,
  // графика
  quality: 'high',           // potato | low | medium | high | rtx
  shadows: true, bloom: true, particles: 1.0,
  fov: 68, shake: 1.0, speedFov: true, headlightFx: true,
  // геймплей
  camera: 'chase',           // chase | far | hood | drone
  camDist: 1.0, steerSens: 1.0, assist: 0.5, traction: true, abs: true,
  damage: true, autoNotes: true, noteLead: 1.0, showGhostNotes: true,
  speedUnit: 'kmh', vibration: true, touchButtons: 'auto',
  // последняя конфигурация гонки
  lastCfg: {
    roomName: 'Ралли-лобби', isPrivate: false, maxPlayers: 4, teams: 2,
    track: 'forest', weather: 'clear', time: 11, stageFrac: 1,
    collisions: false, damage: true, aiRivals: 1, difficulty: 'normal',
    voiceChannel: 'team', countdown: 3, role: 'driver',
  },
};

export const S = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...parsed, lastCfg: { ...DEFAULTS.lastCfg, ...(parsed.lastCfg || {}) } };
  } catch { return structuredClone(DEFAULTS); }
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
}
export function setSetting(key, value) { S[key] = value; saveSettings(); }

// ---------- Рекорды ----------
export function loadScores() {
  try { return JSON.parse(localStorage.getItem(SCORE_KEY) || '[]'); } catch { return []; }
}
export function addScore(entry) {
  const scores = loadScores();
  scores.push({ ...entry, date: Date.now() });
  scores.sort((a, b) => (a.dnf - b.dnf) || (a.time - b.time));
  try { localStorage.setItem(SCORE_KEY, JSON.stringify(scores.slice(0, 60))); } catch {}
  return scores;
}
export function bestTime(trackId, stageFrac = 1) {
  const s = loadScores().filter(x => x.track === trackId && !x.dnf && Math.abs((x.stageFrac || 1) - stageFrac) < 0.01);
  return s.length ? s[0].time : null;
}
export function clearScores() { try { localStorage.removeItem(SCORE_KEY); } catch {} }

export function fmtTime(ms) {
  if (ms == null || !isFinite(ms)) return '--:--.---';
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000), s = Math.floor((t % 60000) / 1000), mm = Math.floor(t % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(mm).padStart(3, '0')}`;
}
export function fmtDelta(ms) {
  if (ms == null || !isFinite(ms)) return '';
  const sign = ms <= 0 ? '-' : '+';
  const t = Math.abs(ms);
  return `${sign}${Math.floor(t / 1000)}.${String(Math.floor((t % 1000) / 100)).padStart(1, '0')}`;
}
