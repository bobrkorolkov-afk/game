// Rally Duo — игровой сервер: статика (dist) + WebSocket лобби / WebRTC-сигналинг
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const WS_ONLY = process.env.WS_ONLY === '1';
const PORT = +(process.env.PORT || (WS_ONLY ? 3001 : 3000));

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.wasm':'application/wasm', '.map':'application/json' };

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, {'Content-Type':'application/json'}); return res.end(JSON.stringify({ok:true, rooms: rooms.size})); }
  if (WS_ONLY) { res.writeHead(404); return res.end('ws only'); }
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(DIST, urlPath);
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(DIST, 'index.html'), (e2, idx) => {
        if (e2) { res.writeHead(404); return res.end('Сначала выполните: npm run build'); }
        res.writeHead(200, { 'Content-Type': MIME['.html'] }); res.end(idx);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': urlPath.includes('assets') ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(data);
  });
});

// ---------------- ЛОББИ ----------------
const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map(); // code -> { code, cfg, hostId, players: Map(id->player), started, results: [] }
let nextId = 1;

const DEFAULT_CFG = {
  roomName: 'Ралли-лобби', isPrivate: false, maxPlayers: 4, teams: 2,
  track: 'forest', weather: 'clear', time: 11, stageFrac: 1,
  collisions: false, damage: true, aiRivals: 1, difficulty: 'normal',
  voiceChannel: 'team', countdown: 3,
};

function makeCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 4 }, () => chars[(Math.random() * chars.length) | 0]).join(''); } while (rooms.has(code));
  return code;
}
function pubPlayer(p) { return { id: p.id, name: p.name, team: p.team, role: p.role, ready: p.ready, color: p.color, muted: !!p.muted, speaking: !!p.speaking, hasMic: !!p.hasMic }; }
function roomState(room) { return { t: 'lobby', code: room.code, cfg: room.cfg, hostId: room.hostId, started: room.started, players: [...room.players.values()].map(pubPlayer) }; }
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(room, msg, exceptId = null) { for (const p of room.players.values()) if (p.id !== exceptId) send(p.ws, msg); }
function broadcastLobby(room) { broadcast(room, roomState(room)); }
function roomList() {
  return [...rooms.values()].filter(r => !r.cfg.isPrivate && !r.started).map(r => ({
    code: r.code, name: r.cfg.roomName, track: r.cfg.track, weather: r.cfg.weather,
    players: r.players.size, max: r.cfg.maxPlayers, teams: r.cfg.teams,
  }));
}

wss.on('connection', (ws) => {
  const id = 'p' + (nextId++);
  let room = null, me = null;
  send(ws, { t: 'welcome', id, rooms: roomList() });

  const leaveRoom = (silent = false) => {
    if (!room || !me) return;
    room.players.delete(id);
    broadcast(room, { t: 'peerLeft', id });
    if (!silent) broadcast(room, { t: 'chat', sys: true, msg: `🚪 ${me.name} покинул лобби` });
    if (room.hostId === id && room.players.size) room.hostId = [...room.players.keys()][0];
    if (room.players.size === 0) rooms.delete(room.code);
    else broadcastLobby(room);
    room = null; me = null;
  };

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    switch (m.t) {
      case 'list': send(ws, { t: 'rooms', rooms: roomList() }); break;
      case 'create': {
        leaveRoom(true);
        const code = makeCode();
        const cfg = { ...DEFAULT_CFG, ...(m.cfg || {}) };
        room = { code, cfg, hostId: id, players: new Map(), started: false, results: [] };
        me = { id, ws, name: String(m.name || 'Гонщик').slice(0, 18), team: 0, role: 'driver', ready: false, color: m.color || '#e63946', speaking: false, muted: false, hasMic: false };
        room.players.set(id, me); rooms.set(code, room);
        send(ws, { t: 'created', code });
        broadcastLobby(room);
        broadcast(room, { t: 'chat', sys: true, msg: `🏁 Лобби «${cfg.roomName}» создано. Код: ${code}` });
        break;
      }
      case 'join': {
        leaveRoom(true);
        const r = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) return send(ws, { t: 'error', msg: 'Лобби не найдено. Проверьте код.' });
        if (r.players.size >= r.cfg.maxPlayers) return send(ws, { t: 'error', msg: 'Лобби переполнено.' });
        if (r.started) return send(ws, { t: 'error', msg: 'Гонка уже идёт, подождите следующий заезд.' });
        room = r;
        // свободный слот: сначала штурманы к водителям, потом новые команды
        const taken = new Set([...r.players.values()].map(p => p.team + ':' + p.role));
        let team = 0, role = 'navigator';
        outer: for (let t = 0; t < r.cfg.teams; t++) for (const ro of ['driver', 'navigator']) if (!taken.has(t + ':' + ro)) { team = t; role = ro; break outer; }
        me = { id, ws, name: String(m.name || 'Гонщик').slice(0, 18), team, role, ready: false, color: m.color || '#4361ee', speaking: false, muted: false, hasMic: false };
        r.players.set(id, me);
        send(ws, { t: 'joined', code: r.code });
        broadcast(r, { t: 'chat', sys: true, msg: `👋 ${me.name} присоединился` }, id);
        broadcastLobby(r);
        break;
      }
      case 'leave': leaveRoom(); send(ws, { t: 'left' }); break;
      case 'slot': {
        if (!room || !me || room.started) break;
        const conflict = [...room.players.values()].find(p => p.id !== id && p.team === m.team && p.role === m.role);
        if (conflict) { conflict.team = me.team; conflict.role = me.role; } // обмен местами
        me.team = m.team; me.role = m.role;
        broadcastLobby(room); break;
      }
      case 'ready': if (me) { me.ready = !!m.v; broadcastLobby(room); } break;
      case 'profile': if (me) { if (m.name) me.name = String(m.name).slice(0, 18); if (m.color) me.color = m.color; broadcastLobby(room); } break;
      case 'cfg': {
        if (!room || room.hostId !== id) break;
        room.cfg = { ...room.cfg, ...m.cfg };
        // игроки вне лимита команд переезжают в последнюю команду
        for (const p of room.players.values()) if (p.team >= room.cfg.teams) p.team = room.cfg.teams - 1;
        broadcastLobby(room); break;
      }
      case 'chat': if (room && me) broadcast(room, { t: 'chat', id, name: me.name, team: me.team, msg: String(m.msg || '').slice(0, 300) }); break;
      case 'start': {
        if (!room || room.hostId !== id) break;
        room.started = true; room.results = [];
        const startAt = Date.now() + (room.cfg.countdown || 3) * 1000 + 1200;
        broadcast(room, { t: 'countdown', startAt, cfg: room.cfg, players: [...room.players.values()].map(pubPlayer) });
        broadcastLobby(room); break;
      }
      case 'stopRace': if (room && room.hostId === id) { room.started = false; broadcast(room, { t: 'raceStopped' }); broadcastLobby(room); } break;
      case 'pos': if (room) broadcast(room, { t: 'pos', id, team: me?.team, p: m.p }, id); break;
      case 'note': if (room && me) broadcast(room, { t: 'note', id, team: me.team, from: me.name, note: m.note }, id); break;
      case 'quick': if (room && me) broadcast(room, { t: 'quick', id, team: me.team, from: me.name, cmd: m.cmd }, id); break;
      case 'voiceState': if (room && me) { me.speaking = !!m.speaking; me.muted = !!m.muted; me.hasMic = !!m.hasMic; broadcast(room, { t: 'voiceState', id, speaking: me.speaking, muted: me.muted, hasMic: me.hasMic }, id); } break;
      case 'finish': {
        if (!room || !me) break;
        room.results = room.results.filter(r2 => r2.team !== me.team);
        room.results.push({ team: me.team, name: me.name, driver: m.driver || me.name, time: m.time, score: m.score, dnf: !!m.dnf });
        room.results.sort((a, b) => (a.dnf - b.dnf) || (a.time - b.time));
        broadcast(room, { t: 'results', results: room.results });
        const teamsInRace = new Set([...room.players.values()].map(p => p.team)).size;
        if (room.results.length >= teamsInRace) { room.started = false; broadcastLobby(room); }
        break;
      }
      case 'backToLobby': if (room) { room.started = false; room.results = []; broadcast(room, { t: 'raceStopped' }); broadcastLobby(room); } break;
      case 'signal': { // WebRTC: пересылка offer/answer/candidate адресату
        if (!room) break;
        const target = room.players.get(m.to);
        if (target) send(target.ws, { t: 'signal', from: id, data: m.data });
        break;
      }
      case 'ping': send(ws, { t: 'pong', ts: m.ts }); break;
    }
  });
  ws.on('close', leaveRoom);
  ws.on('error', () => {});
});

// пинг-понг для очистки мёртвых соединений
setInterval(() => { for (const ws of wss.clients) { if (ws.isAlive === false) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch {} } }, 25000);
wss.on('connection', (ws) => { ws.isAlive = true; ws.on('pong', () => ws.isAlive = true); });

server.listen(PORT, '0.0.0.0', () => console.log(`🏁 Rally Duo server: http://0.0.0.0:${PORT}  (ws: /ws${WS_ONLY ? ', только WS' : ''})`));
