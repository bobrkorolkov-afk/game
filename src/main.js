// RALLY DUO 3D — главный модуль: игра, UI, камера, частицы, гонка, лобби
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World, TRACKS, WEATHERS } from './world.js';
import { buildCarMesh, CarSim, aiInput } from './car.js';
import { audio } from './audio.js';
import { net } from './net.js';
import { S, saveSettings, setSetting, loadScores, addScore, bestTime, clearScores, fmtTime, fmtDelta, DEFAULTS } from './settings.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TEAMS = [
  { name: 'Команда A', color: '#e63946' },
  { name: 'Команда B', color: '#4361ee' },
  { name: 'Команда C', color: '#ffb703' },
];
const DIFF_SKILL = { easy: 0.72, normal: 0.86, hard: 0.97, pro: 1.06 };

// ---------- рендер ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('gl').appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(S.fov, innerWidth / innerHeight, 0.1, 6000);
const world = new World();
world.onLightning = () => audio.thunder();

let composer, bloomPass, renderPass;
function setupComposer() {
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(world.scene, camera);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.65, 0.82);
  composer.addPass(renderPass); composer.addPass(bloomPass); composer.addPass(new OutputPass());
}
setupComposer();

function applyQuality() {
  const q = S.quality;
  const dpr = window.devicePixelRatio || 1;
  const pr = q === 'potato' ? 1 : q === 'low' ? Math.min(dpr, 1.25) : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
  const shadowsOn = S.shadows && q !== 'potato';
  renderer.shadowMap.enabled = shadowsOn;
  world.applyShadowQuality(shadowsOn, q === 'low' || q === 'medium' ? 1024 : 2048);
  bloomPass.enabled = S.bloom && (q === 'high' || q === 'rtx' || q === 'medium');
  bloomPass.strength = q === 'rtx' ? 0.75 : 0.5;
  world.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); applyQuality(); });

// ---------- частицы ----------
class Particles {
  constructor(scene, cap = 3200) {
    this.cap = cap; this.cursor = 0;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap); this.alpha = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap); this.baseA = new Float32Array(cap);
    this.grav = new Float32Array(cap); this.grow = new Float32Array(cap); this.drag = new Float32Array(cap);
    for (let i = 0; i < cap; i++) this.pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, vertexColors: true,
      vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; varying vec3 vC;
        void main(){ vA=aAlpha; vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*(340.0/max(1.0,-mv.z)); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying float vA; varying vec3 vC;
        void main(){ vec2 uv=gl_PointCoord-0.5; float d=length(uv); float m=smoothstep(0.5,0.12,d); gl_FragColor=vec4(vC, vA*m); }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = geo;
    this.tmpC = new THREE.Color();
  }
  spawn(x, y, z, vx, vy, vz, life, size, colorHex, { grav = 0, grow = 0, drag = 0, alpha = 0.65 } = {}) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.cap;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.tmpC.set(colorHex);
    this.col[i * 3] = this.tmpC.r; this.col[i * 3 + 1] = this.tmpC.g; this.col[i * 3 + 2] = this.tmpC.b;
    this.life[i] = this.maxLife[i] = life; this.size[i] = size;
    this.baseA[i] = alpha; this.grav[i] = grav; this.grow[i] = grow; this.drag[i] = drag;
  }
  burst(p, n, opts) { for (let k = 0; k < n; k++) { const o = opts(k); this.spawn(p.x + o.dx || p.x, p.y + (o.dy || 0), p.z + (o.dz || 0), o.vx, o.vy, o.vz, o.life, o.size, o.color, o); } }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.pos[i * 3 + 1] = -999; continue; }
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 2] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.baseA[i] * Math.min(1, t * 3);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}
let particles = null;

// ---------- удалённая машина (сеть) ----------
class RemoteCar {
  constructor(mesh) {
    this.mesh = mesh; this.snaps = [];
    this.pos = new THREE.Vector3(); this.yaw = 0; this.speed = 0; this.steer = 0;
    this.along = 0; this.trackIdx = 0; this._alongT = 0;
  }
  push(p) {
    this.snaps.push({ t: performance.now(), x: p[0], y: p[1], z: p[2], yaw: p[3], steer: p[4], speed: p[5], brake: p[7] });
    if (this.snaps.length > 24) this.snaps.shift();
    if (this.snaps.length === 1) { this.pos.set(p[0], p[1], p[2]); this.yaw = p[3]; }
  }
  update(dt) {
    const rt = performance.now() - 130;
    const s = this.snaps;
    if (s.length >= 2) {
      let a = s[0], b = s[s.length - 1];
      for (let i = 0; i < s.length - 1; i++) if (s[i].t <= rt && s[i + 1].t >= rt) { a = s[i]; b = s[i + 1]; break; }
      const span = Math.max(1, b.t - a.t), t = clamp((rt - a.t) / span, 0, 1);
      this.pos.set(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
      let dy = b.yaw - a.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      this.yaw = a.yaw + dy * t;
      this.speed = lerp(a.speed, b.speed, t); this.steer = lerp(a.steer, b.steer, t);
      this.brake = b.brake;
      while (s.length > 3 && s[1].t < rt) s.shift();
    }
    const m = this.mesh;
    m.group.position.copy(this.pos);
    m.group.rotation.order = 'YXZ';
    m.group.rotation.set(0, this.yaw, 0);
    const f = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    const hF = world.sampleGround(this.pos.x + f.x * 1.6, this.pos.z + f.z * 1.6, this.trackIdx).height;
    const hB = world.sampleGround(this.pos.x - f.x * 1.6, this.pos.z - f.z * 1.6, this.trackIdx).height;
    m.group.rotation.x = Math.atan2(hB - hF, 3.2);
    m.animateWheels(-this.steer * 0.5, dt * this.speed / 0.36);
    m.setBrake(!!this.brake);
    this._alongT -= dt;
    if (this._alongT <= 0) { this._alongT = 0.25; const gi = world.sampleGround(this.pos.x, this.pos.z, this.trackIdx); this.trackIdx = gi.idx; this.along = gi.along; }
  }
}

// ---------- состояние ----------
let state = 'boot'; // menu | lobby | countdown | racing | paused | finished
let builtKey = '';
let menuCar = null;
let race = null;
let camMode = S.camera;
let camYaw = 0, camPos = new THREE.Vector3(0, 6, -10);
let trauma = 0;
let timeScale = 1, slowmoT = 0;
let elapsed = 0;
let menuAngle = 0;
let onlineResults = null;
let bestSplits = null;

const keys = new Set();
const touch = { left: 0, right: 0, gas: 0, brake: 0, hand: 0 };
let steerSmooth = 0;
const isTouchDevice = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

function cfgKey(cfg) { return [cfg.track, cfg.weather, Math.round(cfg.time * 2), cfg.stageFrac].join('|'); }
function buildWorld(cfg) {
  const propDensity = S.quality === 'potato' ? 0.45 : S.quality === 'low' ? 0.7 : 1;
  world.build({ ...cfg, propDensity });
  particles = new Particles(world.scene);
  builtKey = cfgKey(cfg);
  applyQuality();
  prerenderMinimap();
  audio.setRain(world.weather.rain || 0);
}

function toast(msg, isError = false, ms = 3200) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : ''); el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, ms);
}
function popup(text, cls = '') {
  const el = document.createElement('div');
  el.className = 'popup ' + cls; el.textContent = text;
  $('popups').appendChild(el);
  setTimeout(() => el.remove(), 1180);
}
function addTrauma(v) { trauma = clamp(trauma + v * S.shake, 0, 1.2); }
function flashDamage(v) { const el = $('damageFlash'); el.style.opacity = clamp(v, 0, 0.85); setTimeout(() => el.style.opacity = 0, 90); }
function vibrate(ms) { if (S.vibration && navigator.vibrate) navigator.vibrate(ms); }

// ---------- миникарта ----------
let mapBase = null, mapBounds = null;
function prerenderMinimap() {
  mapBase = document.createElement('canvas'); mapBase.width = mapBase.height = 440;
  const g = mapBase.getContext('2d');
  const xs = world.samples.map(s => s.x), zs = world.samples.map(s => s.z);
  const minX = Math.min(...xs) - 120, maxX = Math.max(...xs) + 120;
  const minZ = Math.min(...zs) - 120, maxZ = Math.max(...zs) + 120;
  const scale = 440 / Math.max(maxX - minX, maxZ - minZ);
  mapBounds = { minX, minZ, scale };
  const P = (x, z) => [(x - minX) * scale, (z - minZ) * scale];
  g.clearRect(0, 0, 440, 440);
  const drawPath = (w, style) => {
    g.beginPath(); g.lineWidth = w; g.strokeStyle = style; g.lineJoin = 'round';
    world.samples.forEach((s, i) => { const [x, y] = P(s.x, s.z); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  };
  drawPath(13, 'rgba(0,0,0,0.55)'); drawPath(7, '#c8b490'); drawPath(2.5, 'rgba(255,255,255,0.75)');
  const dot = (x, z, r, c) => { const [px, py] = P(x, z); g.fillStyle = c; g.beginPath(); g.arc(px, py, r, 0, 7); g.fill(); };
  world.checkpoints.forEach(cp => { const s = world.sampleAtDist(cp.dist); dot(s.x, s.z, 5, '#4361ee'); });
  const st = world.sampleAtDist(8); dot(st.x, st.z, 7, '#2fbf71');
  const fin = world.sampleAtDist(world.finishDist); dot(fin.x, fin.z, 8, '#ffb703');
  g.fillStyle = '#241500'; g.font = '900 11px Arial'; g.textAlign = 'center';
  const [fx, fy] = P(fin.x, fin.z); g.fillText('Ф', fx, fy + 4);
}
function drawMinimap() {
  if (!mapBase || !race) return;
  const ctx = $('minimap').getContext('2d');
  ctx.clearRect(0, 0, 440, 440);
  ctx.drawImage(mapBase, 0, 0);
  const P = (x, z) => [(x - mapBounds.minX) * mapBounds.scale, (z - mapBounds.minZ) * mapBounds.scale];
  if (race.myRole === 'navigator') {
    for (const n of world.notes) {
      if (n.ApexDist < focusCar().along - 10 || n.ApexDist > focusCar().along + 700) continue;
      const s = world.sampleAtDist(n.ApexDist); const [x, y] = P(s.x, s.z);
      ctx.fillStyle = n.sev <= 2 ? '#ff5d73' : n.sev <= 4 ? '#ffb703' : '#7bf1a8';
      ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 7); ctx.fill();
    }
  }
  for (const c of race.cars) {
    const pos = c.kind === 'remote' ? c.remote.pos : c.sim.pos;
    const [x, y] = P(pos.x, pos.z);
    ctx.fillStyle = TEAMS[c.team]?.color || '#fff';
    ctx.strokeStyle = c === race.localEntry ? '#fff' : 'rgba(0,0,0,.6)';
    ctx.lineWidth = c === race.localEntry ? 3.4 : 1.6;
    ctx.beginPath(); ctx.arc(x, y, c === race.localEntry ? 8 : 6.4, 0, 7); ctx.fill(); ctx.stroke();
  }
}

// ---------- ввод ----------
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  const k = e.code;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
  if (!e.repeat) {
    if (k === 'KeyV') { net.setPTT(true); updateMicHud(); }
    if (k === 'KeyC' && (state === 'racing' || state === 'countdown')) cycleCamera();
    if (k === 'KeyH') audio.horn();
    if (k === 'Escape' || k === 'KeyP') togglePause();
    if (k === 'Backspace') resetCarToTrack();
    if (k === 'KeyR' && (state === 'finished' || state === 'paused')) restartRace();
    if ((k === 'Space' || k === 'KeyE') && race?.myRole === 'navigator' && state === 'racing') callNextNote();
    if (race?.myRole === 'navigator' && state === 'racing' && /^Digit[1-6]$/.test(k)) {
      const cmds = ['ГАЗ! 🔥', 'ТОРМОЗИ! 🛑', 'Осторожно! ⚠️', 'Не резать! 🚧', 'Держи прямо! ⬆', 'Красава! 👏'];
      sendQuick(cmds[+k.slice(5) - 1]);
    }
  }
  keys.add(k);
});
addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'KeyV') { net.setPTT(false); updateMicHud(); } });
addEventListener('blur', () => { keys.clear(); net.setPTT(false); });

function bindTouch(id, prop) {
  const el = $(id);
  const on = (e) => { e.preventDefault(); touch[prop] = 1; el.classList.add('active'); if (prop === 'ptt') { net.setPTT(true); updateMicHud(); } };
  const off = (e) => { e.preventDefault(); touch[prop] = 0; el.classList.remove('active'); if (prop === 'ptt') { net.setPTT(false); updateMicHud(); } };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
}
bindTouch('tLeft', 'left'); bindTouch('tRight', 'right'); bindTouch('tGas', 'gas'); bindTouch('tBrake', 'brake'); bindTouch('tHand', 'hand'); bindTouch('tPTT', 'ptt');

function readInput(dt) {
  let steerT = 0, throttle = 0, hand = false;
  if (keys.has('KeyA') || keys.has('ArrowLeft') || touch.left) steerT -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight') || touch.right) steerT += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp') || touch.gas) throttle += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown') || touch.brake) throttle -= 1;
  hand = keys.has('Space') || !!touch.hand;
  // геймпад
  const gp = navigator.getGamepads?.()[0];
  if (gp) {
    if (Math.abs(gp.axes[0]) > 0.12) steerT = gp.axes[0];
    if (gp.buttons[7]?.value > 0.05) throttle = gp.buttons[7].value;
    if (gp.buttons[6]?.value > 0.05) throttle = -gp.buttons[6].value;
    if (gp.buttons[0]?.pressed) hand = true;
  }
  const rate = (steerT !== 0 ? 5.2 : 7.5) * S.steerSens;
  steerSmooth = clamp(steerSmooth + clamp(steerT - steerSmooth, -rate * dt, rate * dt), -1, 1);
  return { throttle: clamp(throttle, -1, 1), steer: steerSmooth, handbrake: hand };
}
function cycleCamera() {
  const modes = ['chase', 'far', 'hood', 'drone'];
  camMode = modes[(modes.indexOf(camMode) + 1) % modes.length];
  setSetting('camera', camMode); $('setCamera').value = camMode;
  toast('📷 Камера: ' + { chase: 'Погоня', far: 'Далеко', hood: 'Капот', drone: 'Дрон' }[camMode], false, 1200);
  audio.click();
}

// ---------- фокус-машина (за которой следим) ----------
function focusCar() {
  const e = race?.localEntry;
  if (!e) return { pos: new THREE.Vector3(), yaw: 0, speed: 0, along: 0, lat: 0, fwdSpeed: 0, rpm: 0.2, gear: 1, damage: 0, grounded: true, onRoad: true, sliding: 0, driftAngle: 0 };
  if (e.kind === 'remote') {
    const r = e.remote;
    return { pos: r.pos, yaw: r.yaw, speed: r.speed, along: r.along, lat: 0, fwdSpeed: r.speed, rpm: clamp(0.25 + (r.speed % 14) / 16, 0, 1), gear: 1 + Math.min(4, Math.floor(r.speed / 12)), damage: 0, grounded: true, onRoad: true, sliding: 0, driftAngle: 0, remote: true };
  }
  return e.sim;
}

// ---------- запуск гонки ----------
function clearRaceMeshes() {
  if (race) for (const c of race.cars) world.scene.remove(c.mesh.group);
  if (menuCar) { world.scene.remove(menuCar.group); menuCar = null; }
}
function makeCarEntry(team, kind, color, color2, name, opts = {}) {
  const mesh = buildCarMesh(color, color2, { headlight: opts.headlight });
  world.scene.add(mesh.group);
  const entry = { team, kind, mesh, name, color, finished: false, finishTime: null, score: 0, dnf: false };
  if (kind === 'remote') entry.remote = new RemoteCar(mesh);
  else { entry.sim = new CarSim(world, mesh, { lane: opts.lane || 0, seed: team * 17 + 3 }); }
  return entry;
}

function startRace(cfg, { mode, myTeam = 0, myRole = 'driver', players = null, countdownAt = null } = {}) {
  audio.init(); audio.applyVolumes(); audio.startMusic();
  onlineResults = null;
  if (builtKey !== cfgKey(cfg)) { showLoading('Строим трассу...'); }
  // строительство мира может занять ~секунду — даём загрузке отрисоваться
  setTimeout(() => {
    if (builtKey !== cfgKey(cfg)) buildWorld(cfg);
    else { world.setWeather(cfg.weather); world.setTimeOfDay(cfg.time); world.finishDist = world.totalLength * clamp(cfg.stageFrac || 1, 0.4, 1); }
    hideLoading();
    clearRaceMeshes();
    nearMissSeen.clear();

    race = {
      cfg, mode, myTeam, myRole, cars: [], localEntry: null,
      time: 0, running: false, countdownEnd: countdownAt ? countdownAt - Date.now() : (cfg.countdown || 3) * 1000,
      cpIndex: 0, splits: [], lastCpRaceTime: 0, dmgAtCp: 0,
      score: 0, mult: 1, driftChain: 0, driftBucket: 0, multTimer: 0,
      stats: { topSpeed: 0, driftTime: 0, airTime: 0, nearMiss: 0, maxCombo: 1, callsGood: 0, callsTotal: 0 },
      called: new Set(), nextNoteI: 0, confidence: 0.78, navScore: 0,
      penalty: 0, finished: false, finishSent: false, aiBrakeBoost: 0, aiGasBoost: 0,
      posTimer: 0, wrongWayT: 0, prevAlong: 0, startWall: performance.now(),
    };
    steerSmooth = 0; trauma = 0; timeScale = 1;
    camMode = myRole === 'navigator' ? (S.camera === 'chase' ? 'drone' : S.camera) : S.camera;

    const skill = DIFF_SKILL[cfg.difficulty] || 0.86;
    if (mode === 'solo') {
      const mine = makeCarEntry(0, 'local', S.carColor, S.carColor2, S.playerName, { headlight: true });
      race.cars.push(mine); race.localEntry = mine;
      race.localDrivenByAI = myRole === 'navigator';
      const aiCols = ['#4361ee', '#ffb703'];
      for (let i = 0; i < (cfg.aiRivals || 0); i++) {
        const e = makeCarEntry(i + 1, 'ai', aiCols[i], '#ffffff', 'ИИ ' + ['Калле', 'Себ'][i], { lane: i ? 1.6 : -1.6 });
        e.skill = skill * (0.94 + i * 0.09);
        race.cars.push(e);
      }
    } else {
      // онлайн: по машине на команду, где есть хоть один игрок
      const teamsPresent = [...new Set(players.map(p => p.team))].sort();
      race.hostSimulatesAI = net.hostId === net.myId;
      for (const t of teamsPresent) {
        const driver = players.find(p => p.team === t && p.role === 'driver');
        const nav = players.find(p => p.team === t && p.role === 'navigator');
        const acting = driver || nav; // кто физически ведёт/симулирует машину
        const isMine = acting.id === net.myId || (t === myTeam && myRole === 'navigator' && driver?.id === net.myId);
        const iAmActing = acting.id === net.myId;
        const belongsToMe = t === myTeam;
        const name = TEAMS[t].name + (driver ? ` (${driver.name})` : ' (ИИ-водитель)');
        let entry;
        if (iAmActing) {
          entry = makeCarEntry(t, 'local', (driver || nav).color || S.carColor, '#ffffff', name, { headlight: true });
          entry.driverPlayer = acting;
          race.localDrivenByAI = myRole === 'navigator'; // я штурман без водителя — рулит ИИ, я транслирую
        } else {
          entry = makeCarEntry(t, 'remote', acting.color || TEAMS[t].color, '#ffffff', name, { headlight: belongsToMe });
          entry.driverPlayer = acting;
        }
        entry.isMyTeam = belongsToMe;
        race.cars.push(entry);
        if (belongsToMe) race.localEntry = entry;
      }
      // ИИ-соперники в онлайне: симулирует хост и транслирует как ai-позиции
      race.aiRivals = [];
      const freeTeams = [0, 1, 2].filter(t => !teamsPresent.includes(t));
      for (let i = 0; i < Math.min(cfg.aiRivals || 0, freeTeams.length); i++) {
        const t = freeTeams[i];
        if (race.hostSimulatesAI) {
          const e = makeCarEntry(t, 'ai', TEAMS[t].color, '#fff', 'ИИ ' + TEAMS[t].name, { lane: i ? 1.6 : -1.6 });
          e.skill = skill; e.aiIndex = i;
          race.cars.push(e); race.aiRivals.push(e);
        } else {
          const e = makeCarEntry(t, 'remote', TEAMS[t].color, '#fff', 'ИИ ' + TEAMS[t].name);
          e.aiKey = 'ai' + i;
          race.cars.push(e); race.aiRivals.push(e);
        }
      }
    }

    // расстановка на старте
    race.cars.forEach((e, i) => {
      const pose = world.startPose(i);
      if (e.sim) e.sim.reset(pose);
      else { e.remote.pos.set(pose.x, pose.y, pose.z); e.remote.yaw = pose.yaw; e.remote.push([pose.x, pose.y, pose.z, pose.yaw, 0, 0, -1, 0]); }
      e.mesh.setLights(world.isNight, S.headlightFx);
    });

    // лучший результат для дельт по КП
    const bestEntry = loadScores().find(s => s.track === cfg.track && !s.dnf && Math.abs((s.stageFrac || 1) - (cfg.stageFrac || 1)) < 0.01);
    bestSplits = bestEntry?.splits || null;
    race.prevBest = bestTime(cfg.track, cfg.stageFrac || 1);

    buildProgressTicks();
    showScreen(null);
    $('hud').classList.remove('hidden');
    $('navPanel').classList.toggle('hidden', myRole !== 'navigator');
    $('paceNote').classList.toggle('hidden', !(S.showGhostNotes && myRole === 'driver'));
    $('minimap').classList.toggle('big', myRole === 'navigator');
    updateTouchVisibility();
    buildVoicePanel();
    state = 'countdown';
    race.countdownLeft = race.countdownEnd / 1000;
    race.lastCount = Math.ceil(race.countdownLeft) + 1;
    $('centerMsg').classList.remove('hidden');
    $('centerText').textContent = myRole === 'navigator' ? '🗺️ Вы — штурман! Готовьте стенограмму...' : '🧑‍✈️ Вы — водитель! Слушайте штурмана...';
    const fc = focusCar();
    camYaw = fc.yaw;
    snapCameraBehind(fc, true);
  }, 30);
}

function buildProgressTicks() {
  const wrap = $('progressTicks'); wrap.innerHTML = '';
  world.checkpoints.forEach((cp, i) => {
    const el = document.createElement('i');
    el.style.left = (cp.dist / world.finishDist * 100) + '%';
    el.dataset.i = i; wrap.appendChild(el);
  });
  $('progTotal').textContent = (world.finishDist / 1000).toFixed(1) + ' км';
}

function snapCameraBehind(fc, front = false) {
  const d = front ? -11 : 9.5 * S.camDist;
  camPos.set(fc.pos.x - Math.sin(fc.yaw) * d, fc.pos.y + 3.6, fc.pos.z - Math.cos(fc.yaw) * d);
  camera.position.copy(camPos);
  camera.lookAt(fc.pos.x, fc.pos.y + 1, fc.pos.z);
}

// ---------- штурман ----------
function upcomingNote() {
  const fc = focusCar();
  while (race.nextNoteI < world.notes.length && world.notes[race.nextNoteI].ApexDist < fc.along - 12) {
    const missed = world.notes[race.nextNoteI];
    if (race.myRole === 'navigator' && !race.called.has(missed.dist) && state === 'racing' && race.running) {
      race.confidence = clamp(race.confidence - 0.13, 0.15, 1);
      popup('⚠️ Поворот не объявлен!', 'red');
    }
    race.nextNoteI++;
  }
  return world.notes[race.nextNoteI] || null;
}
function callNextNote(fromAI = false) {
  if (!race || state !== 'racing') return null;
  const note = upcomingNote();
  if (!note || race.called.has(note.dist)) return null;
  race.called.add(note.dist);
  const fc = focusCar();
  const distTo = note.ApexDist - fc.along;
  const tTo = distTo / Math.max(9, fc.speed);
  let rating, pts, confDelta;
  if (tTo >= 2.1 && tTo <= 4.6) { rating = '🎯 ИДЕАЛЬНО!'; pts = 50; confDelta = 0.09; }
  else if (tTo > 4.6 && tTo <= 7) { rating = '🕐 Рано, но ок'; pts = 22; confDelta = 0.03; }
  else if (tTo > 7) { rating = '😴 Слишком рано'; pts = 8; confDelta = 0.0; }
  else if (tTo >= 1.1) { rating = '⚡ Впритык!'; pts = 30; confDelta = 0.04; }
  else { rating = '😱 Поздно!!'; pts = 5; confDelta = -0.05; }
  if (!fromAI) {
    race.navScore += pts; race.score += pts;
    race.stats.callsTotal++; if (pts >= 30) race.stats.callsGood++;
    race.confidence = clamp(race.confidence + confDelta, 0.15, 1);
    popup(`${rating} +${pts}`, pts >= 30 ? 'teal' : '');
    audio.pop();
  }
  showNoteOnHud(note, true);
  if (race.mode === 'online' && !fromAI) net.sendNote({ dist: note.dist, ApexDist: note.ApexDist, dir: note.dir, sev: note.sev, short: note.short, arrow: note.arrow, tts: note.tts, caution: note.caution });
  if (race.myRole === 'navigator' && race.mode === 'solo') {
    // ИИ-водитель «услышал» — уверенность уже учтена; озвучим для атмосферы
    audio.speak(note.tts);
  }
  return note;
}
function sendQuick(cmd) {
  if (!race) return;
  audio.pop();
  if (race.mode === 'online') { net.sendQuick(cmd); showQuickFlash('📣 ' + cmd); }
  else {
    showQuickFlash('📣 ' + cmd);
    if (cmd.startsWith('ТОРМОЗИ')) race.aiBrakeBoost = 1.1;
    if (cmd.startsWith('ГАЗ')) { race.aiGasBoost = 1.6; race.confidence = clamp(race.confidence + 0.05, 0, 1); }
    if (cmd.startsWith('Осторожно')) race.aiBrakeBoost = Math.max(race.aiBrakeBoost, 0.7);
    if (cmd.startsWith('Красава')) race.confidence = clamp(race.confidence + 0.07, 0, 1);
  }
}
let quickTimer = null;
function showQuickFlash(text) {
  const el = $('quickFlash');
  el.textContent = text; el.classList.remove('hidden');
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(quickTimer);
  quickTimer = setTimeout(() => el.classList.add('hidden'), 1700);
}
let hudNoteDist = null;
function showNoteOnHud(note, called = false) {
  if (race?.myRole === 'navigator') return;
  $('paceNote').classList.remove('hidden');
  $('noteArrow').textContent = note.arrow;
  $('noteArrow').classList.toggle('danger', !!note.caution);
  $('noteText').textContent = note.short.replace(/^[⬅➡⤒]\s*/, '');
  hudNoteDist = note.ApexDist;
  if (called) {
    const pn = $('paceNote');
    pn.style.transform = 'translateX(-50%) scale(1.12)';
    setTimeout(() => pn.style.transform = 'translateX(-50%)', 130);
  }
}

// ---------- игровая логика гонки ----------
function resetCarToTrack() {
  if (!race || state !== 'racing' || !race.localEntry?.sim) return;
  if (race.myRole === 'navigator' && !race.localDrivenByAI) return;
  race.localEntry.sim.resetToTrack();
  race.penalty += 5000;
  popup('⤴️ На трассу! +5 сек', 'red');
  addTrauma(0.25);
  audio.pop();
}
function standings() {
  return [...race.cars].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1; if (b.finished) return 1;
    return (b.kind === 'remote' ? b.remote.along : b.sim.along) - (a.kind === 'remote' ? a.remote.along : a.sim.along);
  });
}
function carAlong(e) { return e.kind === 'remote' ? e.remote.along : e.sim.along; }

function finishRace(dnfReason = null) {
  if (!race || race.finished) return;
  race.finished = true;
  race.localEntry.finished = true;
  race.localEntry.dnf = !!dnfReason;
  race.localEntry.finishTime = race.time * 1000 + race.penalty;
  state = 'finished';
  audio.stopSpeak();
  if (dnfReason) { audio.fail(); }
  else {
    audio.fanfare();
    slowmoT = 1.1; timeScale = 0.35;
    const fc = focusCar();
    for (let i = 0; i < 130; i++) {
      const cols = [0xffb703, 0x2ec4b6, 0xef476f, 0x4361ee, 0xffffff];
      particles.spawn(fc.pos.x + (Math.random() - 0.5) * 14, fc.pos.y + 3 + Math.random() * 5, fc.pos.z + (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 9, Math.random() * 7, (Math.random() - 0.5) * 9, 1.6 + Math.random(), 2.6, cols[i % 5], { grav: 7, alpha: 0.95, drag: 0.6 });
    }
  }
  const totalScore = Math.round(race.score);
  if (race.mode === 'online') {
    const iDrive = race.localEntry.kind !== 'remote';
    if (iDrive && !race.finishSent) { race.finishSent = true; net.sendFinish(race.localEntry.finishTime, totalScore, !!dnfReason, S.playerName); }
  } else if (!dnfReason) {
    const crew = race.myRole === 'navigator' ? `${S.playerName} (штурм.) + ИИ` : `${S.playerName} + ИИ-штурман`;
    addScore({ track: race.cfg.track, stageFrac: race.cfg.stageFrac || 1, name: crew, time: race.localEntry.finishTime, score: totalScore, splits: race.splits, dnf: false });
  }
  setTimeout(() => showResults(dnfReason), dnfReason ? 900 : 1900);
}

function showResults(dnfReason = null) {
  timeScale = 1;
  $('hud').classList.add('hidden');
  audio.engineStop();
  const fc = focusCar();
  const isRecord = !dnfReason && race.mode === 'solo' && race.prevBest && race.localEntry.finishTime < race.prevBest;
  $('resultsTitle').textContent = dnfReason ? '💥 ' + dnfReason : isRecord ? '🏆 НОВЫЙ РЕКОРД!' : '🏁 Финиш!';
  const st = race.stats;
  $('resultsStats').innerHTML = [
    ['Время', dnfReason ? 'СХОД' : fmtTime(race.localEntry.finishTime)],
    ['Очки стиля', Math.round(race.score).toLocaleString('ru')],
    ['Макс. скорость', Math.round(st.topSpeed * (S.speedUnit === 'mph' ? 2.237 : 3.6)) + (S.speedUnit === 'mph' ? ' mph' : ' км/ч')],
    ['Дрифт', st.driftTime.toFixed(1) + ' сек'],
    ['В воздухе', st.airTime.toFixed(1) + ' сек'],
    race.myRole === 'navigator' ? ['Точных вызовов', `${st.callsGood}/${st.callsTotal}`] : ['Комбо макс.', 'x' + race.stats.maxCombo.toFixed(1)],
    ['Повреждения', Math.round(fc.damage || 0) + '%'],
  ].map(([k, v]) => `<div class="stat-chip"><b>${v}</b><small>${k}</small></div>`).join('');

  const rowsSrc = (race.mode === 'online' && onlineResults?.length)
    ? onlineResults.map(r => ({ team: r.team, name: `${TEAMS[r.team].name} — ${r.driver}`, time: r.time, score: r.score, dnf: r.dnf, mine: r.team === race.myTeam }))
    : standings().map(e => ({
        team: e.team, name: e.name + (e === race.localEntry ? ' (вы)' : ''),
        time: e.finished ? e.finishTime : null, score: e === race.localEntry ? Math.round(race.score) : e.score, dnf: e.dnf, mine: e === race.localEntry,
      }));
  $('resultsBody').innerHTML = rowsSrc.map((r, i) => `<tr class="${r.mine ? 'me-row' : ''}">
    <td>${['🥇', '🥈', '🥉'][i] || (i + 1)}</td><td><span style="color:${TEAMS[r.team]?.color}">●</span> ${r.name}</td>
    <td>${r.dnf ? 'СХОД' : r.time != null ? fmtTime(r.time) : 'ещё едет...'}</td><td>${(r.score || 0).toLocaleString('ru')}</td><td>${r.mine ? '⭐' : ''}</td></tr>`).join('');
  $('btnResultsLobby').classList.toggle('hidden', race.mode !== 'online');
  showScreen('resultsScreen');
  refreshMenuBests();
}

function restartRace() {
  closeAllModals();
  if (!race) return;
  if (race.mode === 'online') {
    if (net.hostId === net.myId) { net.startRace(); toast('↻ Перезапуск заезда для всех!'); }
    else toast('⏳ Перезапустить заезд может только хост лобби', true);
    return;
  }
  startRace(race.cfg, { mode: 'solo', myRole: race.myRole });
}

function quitToMenu() {
  clearRaceMeshes();
  race = null; state = 'menu';
  audio.engineStop(); audio.stopSpeak();
  $('hud').classList.add('hidden');
  closeAllModals();
  spawnMenuCar();
  showScreen('menuScreen');
  refreshMenuBests();
}
function spawnMenuCar() {
  if (menuCar) { world.scene.remove(menuCar.group); menuCar = null; }
  menuCar = buildCarMesh(S.carColor, S.carColor2, { headlight: true });
  const pose = world.startPose(0);
  menuCar.group.position.set(pose.x, pose.y, pose.z);
  menuCar.group.rotation.y = pose.yaw;
  menuCar.setLights(world.isNight, S.headlightFx);
  world.scene.add(menuCar.group);
}

// ---------- основной цикл ----------
const clock = new THREE.Clock();
let hudCache = {}, minimapT = 0, engineAudioT = 0;
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }

function animate() {
  requestAnimationFrame(animate);
  let rawDt = Math.min(clock.getDelta(), 0.06);
  if (slowmoT > 0) { slowmoT -= rawDt; if (slowmoT <= 0) timeScale = 1; }
  const dt = rawDt * timeScale;
  elapsed += dt;

  if (particles) particles.update(dt);
  trauma = Math.max(0, trauma - rawDt * 1.7);

  if (state === 'menu' || state === 'lobby') {
    const pose = world.startPose(0);
    menuAngle += rawDt * 0.16;
    const cx = pose.x + Math.sin(menuAngle) * 11.5, cz = pose.z + Math.cos(menuAngle) * 11.5;
    const cy = world.getHeight(cx, cz) + 3.4 + Math.sin(elapsed * 0.5) * 0.5;
    camera.position.lerp(new THREE.Vector3(cx, cy, cz), 1 - Math.exp(-2.2 * rawDt));
    camera.lookAt(pose.x, pose.y + 1.1, pose.z);
    camera.fov = lerp(camera.fov, S.fov - 6, 0.05); camera.updateProjectionMatrix();
    if (menuCar) menuCar.animateWheels(Math.sin(elapsed * 0.7) * 0.18, 0);
    world.update(dt, new THREE.Vector3(pose.x, pose.y, pose.z), elapsed);
  } else if (race && (state === 'countdown' || state === 'racing' || state === 'paused' || state === 'finished')) {
    tickRace(dt, rawDt);
  }

  // индикатор микрофона
  const lvl = Math.round((net.micLive ? net.micLevel : 0) * 100);
  $('micMeterFill').style.width = lvl + '%';
  $('micMeterFill2').style.width = lvl + '%';

  composer.render();
}

function tickRace(dt, rawDt) {
  const paused = state === 'paused' && race.mode === 'solo';
  const fc0 = focusCar();

  // --- обратный отсчёт ---
  if (state === 'countdown') {
    race.countdownLeft -= rawDt;
    const c = Math.ceil(race.countdownLeft);
    const numEl = $('countNum');
    if (c !== race.lastCount && c >= 0) {
      race.lastCount = c;
      numEl.textContent = c > 0 ? c : 'ГО!';
      numEl.classList.remove('pop'); void numEl.offsetWidth; numEl.classList.add('pop');
      if (c > 0) audio.countBeep(); else { audio.goBeep(); $('whiteFlash').style.opacity = 0.35; setTimeout(() => $('whiteFlash').style.opacity = 0, 80); }
    }
    if (race.countdownLeft <= 0) {
      state = 'racing'; race.running = true; race.time = 0;
      setTimeout(() => $('centerMsg').classList.add('hidden'), 650);
      $('centerText').textContent = '';
    }
    // камера: облёт от носа к хвосту
    const total = (race.cfg.countdown || 3);
    const p = clamp(1 - race.countdownLeft / total, 0, 1);
    const ang = lerp(fc0.yaw + 2.6, fc0.yaw + Math.PI, p * p);
    const cd = lerp(7.5, 10.5, p);
    camPos.set(fc0.pos.x + Math.sin(ang) * cd, fc0.pos.y + lerp(1.4, 3.8, p), fc0.pos.z + Math.cos(ang) * cd);
    camera.position.lerp(camPos, 1 - Math.exp(-7 * rawDt));
    camera.lookAt(fc0.pos.x, fc0.pos.y + 0.9, fc0.pos.z);
    // перегазовка на старте
    const inp = readInput(rawDt);
    audio.engine(clamp(0.3 + Math.max(0, inp.throttle) * 0.65 + Math.sin(elapsed * 9) * 0.02, 0, 1), Math.abs(inp.throttle), 0, 0);
  }

  if ((state === 'racing' || state === 'finished' || state === 'paused') && !paused) {
    if (race.running && state !== 'finished') race.time += dt;
    const input = readInput(dt);
    const local = race.localEntry;
    const sub = dt > 0.021 ? 2 : 1, sdt = dt / sub;

    for (let s = 0; s < sub; s++) {
      for (const e of race.cars) {
        if (e.kind === 'remote') continue;
        let inp, cfgStep = { gripMul: 1, damage: race.cfg.damage && S.damage, assist: S.assist, traction: S.traction, abs: S.abs };
        if (e === local && !race.localDrivenByAI) {
          inp = (state === 'finished') ? { throttle: -0.6, steer: 0, handbrake: false } : input;
        } else {
          let caution = 1;
          if (e === local && race.localDrivenByAI) {
            caution = 0.45 + race.confidence * 0.75;
            if (race.aiGasBoost > 0) caution += 0.1;
          }
          inp = aiInput(e.sim, world, e === local ? (0.74 + race.confidence * 0.26) : (e.skill || 0.9), caution, sdt);
          if (e === local && race.localDrivenByAI && race.aiBrakeBoost > 0) { inp.throttle = -0.85; }
          if (state === 'finished' && e === local) inp = { throttle: -0.5, steer: inp.steer, handbrake: false };
          cfgStep.assist = 0.65;
        }
        const ev = e.sim.step(sdt, inp, cfgStep);
        if (e === local) handleLocalEvents(ev, inp, sdt);
        else spawnWheelDust(e.sim, sdt, 0.5);
        e.mesh.setBrake(inp.throttle < -0.05 || inp.handbrake);
        // финиш соперников
        if (!e.finished && e.sim.along >= world.finishDist) { e.finished = true; e.finishTime = race.time * 1000; if (race.mode === 'solo') toast(`🏁 ${e.name} финишировал: ${fmtTime(e.finishTime)}`); }
      }
      // столкновения машин
      if (race.cfg.collisions) carCarCollisions();
    }
    if (race.aiBrakeBoost > 0) race.aiBrakeBoost -= dt;
    if (race.aiGasBoost > 0) race.aiGasBoost -= dt;

    for (const e of race.cars) if (e.kind === 'remote') { e.remote.update(dt); if (!e.finished && e.remote.along >= world.finishDist) e.finished = true; }

    // трансляция позиции
    if (race.mode === 'online' && local.kind !== 'remote') {
      race.posTimer -= dt;
      if (race.posTimer <= 0) {
        race.posTimer = 1 / 15;
        const s2 = local.sim;
        net.sendPos([+r3(s2.pos.x), +r3(s2.pos.y), +r3(s2.pos.z), +r3(s2.yaw), +r3(steerSmooth || s2.steerVis), +r3(s2.fwdSpeed), -1, input.throttle < -0.05 ? 1 : 0]);
        if (race.aiRivals) for (const e of race.aiRivals) if (e.sim) {
          const a = e.sim;
          net.sendPos([+r3(a.pos.x), +r3(a.pos.y), +r3(a.pos.z), +r3(a.yaw), 0, +r3(a.fwdSpeed), e.aiIndex, 0]);
        }
      }
    }
    raceLogic(dt, input);
  }

  // камера + HUD + звук мотора
  const fc = focusCar();
  if (state !== 'countdown') updateCamera(dt, fc);
  updateHud(dt, fc);
  world.update(dt, fc.pos, elapsed);
  engineAudioT -= rawDt;
  if (engineAudioT <= 0) {
    engineAudioT = 0.03;
    if (state === 'racing' || state === 'finished') {
      const inp2 = readInput(0.001);
      audio.engine(fc.rpm || 0.3, race.myRole === 'driver' ? Math.abs(inp2.throttle) : 0.7, fc.sliding || 0, clamp(fc.speed / 55, 0, 1), fc.onRoad ? 0 : clamp(fc.speed / 30, 0, 1));
    }
  }
  minimapT -= rawDt;
  if (minimapT <= 0) { minimapT = 0.12; drawMinimap(); }
}
function r3(v) { return Math.round(v * 100) / 100; }

function carCarCollisions() {
  const sims = race.cars.filter(c => c.sim);
  for (let i = 0; i < sims.length; i++) for (let j = i + 1; j < sims.length; j++) {
    const a = sims[i].sim, b = sims[j].sim;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz;
    if (d2 < 3.4 * 3.4 && d2 > 0.001) {
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, push = (3.4 - d) / 2;
      a.pos.x -= nx * push; a.pos.z -= nz * push; b.pos.x += nx * push; b.pos.z += nz * push;
      const rvx = b.vel.x - a.vel.x, rvz = b.vel.z - a.vel.z, vn = rvx * nx + rvz * nz;
      if (vn < 0) {
        const imp = -vn * 0.7;
        a.vel.x -= imp * nx; a.vel.z -= imp * nz; b.vel.x += imp * nx; b.vel.z += imp * nz;
        if (sims[i] === race.localEntry || sims[j] === race.localEntry) { addTrauma(clamp(-vn / 14, 0.1, 0.6)); audio.crash(clamp(-vn / 14, 0.2, 1)); flashDamage(0.3); }
      }
    }
  }
}

const nearMissSeen = new Map();
function handleLocalEvents(ev, inp, dt) {
  const sim = race.localEntry.sim;
  const st = race.stats;
  if (ev.crash > 0.05) {
    addTrauma(ev.crash * 0.85);
    audio.crash(ev.crash);
    flashDamage(ev.crash * 0.7);
    vibrate(Math.round(ev.crash * 160));
    race.mult = 1; race.driftChain = 0;
    spawnSparks(sim.pos, Math.round(6 + ev.crash * 16 * S.particles));
    if (ev.crash > 0.45) popup('💥 УДАР!', 'red');
  } else if (ev.scrape && Math.random() < 0.3) audio.scrape();
  if (ev.airEnded > 0.35) {
    st.airTime += ev.airEnded;
    addTrauma(clamp(ev.airEnded * 0.22, 0.06, 0.4));
    if (ev.airEnded > 0.5 && race.running) {
      const pts = Math.round(ev.airEnded * 130 * race.mult);
      race.score += pts; popup(`🕊️ ПРЫЖОК +${pts}`);
    }
    spawnDust(sim, 14);
    audio.noiseBurst?.(0.16, { vol: 0.14, freq: 300 });
  }
  if (ev.nearMisses) for (const c of ev.nearMisses) {
    const last = nearMissSeen.get(c) || -99;
    if (race.time - last > 9) {
      nearMissSeen.set(c, race.time);
      st.nearMiss++;
      const pts = Math.round(35 * race.mult);
      race.score += pts; popup(`😬 ВПРИТИРКУ +${pts}`, 'teal');
    }
  }
  // дрифт-очки
  const drifting = sim.grounded && sim.driftAngle > 0.24 && sim.speed > 11 && race.running && state === 'racing';
  if (drifting) {
    st.driftTime += dt;
    race.driftChain += dt;
    race.mult = clamp(1 + race.driftChain * 0.45, 1, 5);
    st.maxCombo = Math.max(st.maxCombo, race.mult);
    race.driftBucket += sim.speed * sim.driftAngle * dt * 6.2 * race.mult;
    race.multTimer = 2.2;
    if (race.driftBucket >= 100) { const pts = Math.round(race.driftBucket); race.score += pts; race.driftBucket = 0; popup(`🔥 ДРИФТ +${pts}`); }
    addTrauma(0.0035);
  } else {
    race.driftChain = Math.max(0, race.driftChain - dt * 1.5);
    if (race.multTimer > 0) race.multTimer -= dt; else race.mult = Math.max(1, race.mult - dt * 1.2);
    if (race.driftBucket >= 25) { race.score += Math.round(race.driftBucket); race.driftBucket = 0; }
  }
  $('driftTag').classList.toggle('hidden', !drifting);
  st.topSpeed = Math.max(st.topSpeed, sim.speed);
  spawnWheelDust(sim, dt, 1);
  // дым из-под капота при повреждениях
  if (sim.damage > 55 && Math.random() < 0.5) {
    const f = sim.forward;
    particles.spawn(sim.pos.x + f.x * 1.7, sim.pos.y + 0.85, sim.pos.z + f.z * 1.7, -sim.vel.x * 0.15, 2.4, -sim.vel.z * 0.15, 0.9, 2.2, sim.damage > 85 ? 0x2a2a2e : 0x777d85, { grow: 3.4, alpha: 0.5 });
  }
  if (sim.damage >= 100 && race.cfg.damage && S.damage && state === 'racing') finishRace('Машина разбита! Сход с дистанции');
}

function dustColor() {
  if (world.weatherId === 'snow') return 0xe8f0f6;
  if (world.theme === 'desert') return 0xdba963;
  if (world.weatherId === 'rain' || world.weatherId === 'storm') return 0x8fa3b8;
  return 0xb59a72;
}
function spawnDust(sim, n) {
  const f = sim.forward;
  for (let i = 0; i < n * S.particles; i++) {
    particles.spawn(sim.pos.x + (Math.random() - 0.5) * 2, sim.pos.y - 0.2, sim.pos.z + (Math.random() - 0.5) * 2,
      -sim.vel.x * 0.22 + (Math.random() - 0.5) * 3.4, 0.8 + Math.random() * 1.6, -sim.vel.z * 0.22 + (Math.random() - 0.5) * 3.4,
      0.7 + Math.random() * 0.7, 2.4 + Math.random() * 2, dustColor(), { grow: 4.4, alpha: 0.5, drag: 1.4 });
  }
}
function spawnWheelDust(sim, dt, mul = 1) {
  if (!particles || !sim.grounded || sim.speed < 4) return;
  const intensity = (!sim.onRoad ? 1.6 : 0.35) + sim.sliding * 1.7;
  const chance = intensity * dt * 26 * S.particles * mul;
  if (Math.random() > chance) return;
  const f = sim.forward, r = { x: f.z, z: -f.x };
  const slideSmoke = sim.sliding > 0.35 && sim.onRoad;
  for (const side of [-0.85, 0.85]) {
    const wx = sim.pos.x - f.x * 1.35 + r.x * side, wz = sim.pos.z - f.z * 1.35 + r.z * side;
    particles.spawn(wx, sim.pos.y - 0.25, wz,
      -sim.vel.x * 0.28 + (Math.random() - 0.5) * 2, 0.6 + Math.random() * 1.3, -sim.vel.z * 0.28 + (Math.random() - 0.5) * 2,
      0.55 + Math.random() * 0.8, 1.7 + Math.random() * 1.6 + sim.sliding,
      slideSmoke ? 0xc9ced4 : dustColor(), { grow: 3.6, alpha: slideSmoke ? 0.42 : 0.52, drag: 1.5 });
  }
}
function spawnSparks(p, n) {
  for (let i = 0; i < n; i++) {
    particles.spawn(p.x, p.y + 0.3, p.z, (Math.random() - 0.5) * 13, Math.random() * 7, (Math.random() - 0.5) * 13,
      0.35 + Math.random() * 0.4, 1.1, Math.random() > 0.4 ? 0xffb703 : 0xff6b35, { grav: 16, alpha: 0.95, drag: 0.4 });
  }
}

function raceLogic(dt, input) {
  const fc = focusCar();
  const local = race.localEntry;

  // контрольные пункты
  const cps = world.checkpoints;
  if (race.cpIndex < cps.length && fc.along >= cps[race.cpIndex].dist) {
    const latOk = local.kind === 'remote' ? true : Math.abs(fc.lat) < 17;
    if (latOk) {
      const i = race.cpIndex;
      const splitMs = race.time * 1000;
      race.splits.push(splitMs);
      world.flashCheckpoint(i);
      document.querySelectorAll('#progressTicks i')[i]?.classList.add('done');
      audio.checkpoint();
      let deltaTxt = '';
      if (bestSplits && bestSplits[i]) {
        const d = splitMs - bestSplits[i];
        deltaTxt = fmtDelta(d);
        const el = $('sectorDelta');
        el.textContent = `КП ${i + 1}: ${fmtTime(splitMs)}  (${deltaTxt})`;
        el.className = d <= 0 ? 'good' : 'bad';
        setTimeout(() => el.classList.add('hidden'), 2800);
      } else popup(`✅ КП ${i + 1} — ${fmtTime(splitMs)}`, 'teal');
      const simDamage = fc.damage || 0;
      if (local.sim) {
        if (simDamage <= race.dmgAtCp + 0.5) { race.score += 100; popup('✨ Чистый сектор +100', 'teal'); }
        if (simDamage > 0) { local.sim.damage = Math.max(0, simDamage - 12); popup('🔧 Ремонт на КП −12%', 'teal'); }
        race.dmgAtCp = local.sim.damage;
      }
      race.cpIndex++;
    } else if (fc.along > cps[race.cpIndex].dist + 40) {
      popup('⚠️ Вы пропустили КП! Вернитесь', 'red');
      race.cpIndex++; // не блокируем гонку навсегда
      race.splits.push(race.time * 1000);
    }
  }

  // финиш
  if (state === 'racing' && fc.along >= world.finishDist) finishRace();

  // не туда
  const dProg = fc.along - race.prevAlong;
  race.prevAlong = fc.along;
  if (fc.speed > 6 && dProg < -0.4) race.wrongWayT += dt; else race.wrongWayT = Math.max(0, race.wrongWayT - dt * 2);
  $('wrongWay').classList.toggle('hidden', race.wrongWayT < 0.6);

  // стенограмма: автоматический ИИ-штурман для водителя (соло)
  const note = upcomingNote();
  if (race.myRole === 'driver') {
    if (race.mode === 'solo' && S.autoNotes && note && !race.called.has(note.dist)) {
      const distTo = note.ApexDist - fc.along;
      const tTo = distTo / Math.max(10, fc.speed);
      if (tTo < 3.4 * S.noteLead && distTo < 170) {
        race.called.add(note.dist);
        audio.speak(note.tts);
        showNoteOnHud(note, true);
      }
    } else if (S.showGhostNotes && note) {
      showNoteOnHud(note);
    }
    if (hudNoteDist != null) {
      const d = Math.max(0, Math.round(hudNoteDist - fc.along));
      setText('noteDist', d > 0 ? `через ${d} м` : 'СЕЙЧАС!');
      const nxt = world.notes[race.nextNoteI + 1];
      setText('noteNext', nxt ? 'далее: ' + nxt.short : 'далее: финиш 🏁');
      if (fc.along > hudNoteDist + 25) { hudNoteDist = null; if (!S.showGhostNotes) $('paceNote').classList.add('hidden'); }
    }
  } else {
    updateNavPanel(note, fc);
  }
}

function updateNavPanel(note, fc) {
  const nextEl = $('navNext');
  if (!note) { nextEl.innerHTML = '🏁 Дальше — финиш!'; $('navList').innerHTML = ''; return; }
  const distTo = Math.max(0, Math.round(note.ApexDist - fc.along));
  const tTo = distTo / Math.max(9, fc.speed);
  const called = race.called.has(note.dist);
  nextEl.innerHTML = `${note.arrow} ${note.short.replace(/^[⬅➡⤒]\s*/, '')}<span class="nd">${called ? '✅ объявлено' : `через ${distTo} м · ~${tTo.toFixed(1)} сек`}</span>`;
  nextEl.classList.toggle('called', called);
  nextEl.classList.toggle('late', !called && tTo < 1.6);
  const list = world.notes.slice(race.nextNoteI + 1, race.nextNoteI + 5);
  $('navList').innerHTML = list.map(n => `<div><span>${n.arrow} ${n.short.replace(/^[⬅➡⤒]\s*/, '')}</span><span>${Math.max(0, Math.round(n.ApexDist - fc.along))} м</span></div>`).join('');
  setText('navScore', '⭐ ' + race.navScore);
  $('aiConfFill').style.width = Math.round(race.confidence * 100) + '%';
  $('btnCallNote').disabled = called;
}

// ---------- камера ----------
const camTargetPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function updateCamera(dt, fc) {
  if (dt <= 0) dt = 0.016;
  const fwd = { x: Math.sin(fc.yaw), z: Math.cos(fc.yaw) };
  // доводка курса камеры за машиной (с лёгким отставанием в дрифте)
  let dyaw = fc.yaw - camYaw;
  while (dyaw > Math.PI) dyaw -= 2 * Math.PI; while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
  camYaw += dyaw * (1 - Math.exp(-(fc.remote ? 5 : 4.2) * dt));
  const cf = { x: Math.sin(camYaw), z: Math.cos(camYaw) };
  let dist, height, lookAhead, stiffness;
  switch (camMode) {
    case 'far': dist = 13.5 * S.camDist; height = 5.2; lookAhead = 9; stiffness = 5; break;
    case 'hood': dist = -1.95; height = 1.12; lookAhead = 22; stiffness = 40; break;
    case 'drone': dist = 15 * S.camDist; height = 13.5; lookAhead = 13; stiffness = 2.8; break;
    default: dist = 8.6 * S.camDist; height = 3.3; lookAhead = 8; stiffness = 7.5;
  }
  const speedPull = camMode === 'chase' ? clamp(fc.speed / 55, 0, 1) * 1.6 : 0;
  camTargetPos.set(fc.pos.x - cf.x * (dist + speedPull), fc.pos.y + height, fc.pos.z - cf.z * (dist + speedPull));
  if (camMode !== 'hood') {
    const groundY = world.getHeight(camTargetPos.x, camTargetPos.z) + 1.1;
    if (camTargetPos.y < groundY) camTargetPos.y = groundY;
  } else {
    camTargetPos.set(fc.pos.x + fwd.x * 1.95, fc.pos.y + 1.05, fc.pos.z + fwd.z * 1.95);
  }
  camera.position.lerp(camTargetPos, 1 - Math.exp(-stiffness * dt));
  camLook.set(fc.pos.x + fwd.x * lookAhead, fc.pos.y + (camMode === 'hood' ? 0.6 : 1.1), fc.pos.z + fwd.z * lookAhead);
  // тряска
  if (trauma > 0.01) {
    const s = trauma * trauma * 0.85;
    const t = elapsed * 47;
    camLook.x += Math.sin(t * 1.13) * s; camLook.y += Math.sin(t * 1.71 + 2) * s * 0.7; camLook.z += Math.cos(t * 0.97) * s;
    camera.position.y += Math.sin(t * 2.3) * s * 0.3;
  }
  if (!fc.onRoad && fc.grounded && fc.speed > 8) { // тряска по бездорожью
    camLook.y += Math.sin(elapsed * 39) * 0.09 * S.shake;
  }
  camera.lookAt(camLook);
  if (camMode === 'hood') camera.rotation.z += clamp(-(fc.driftAngle || 0) * 0.14, -0.05, 0.05);
  const targetFov = S.fov + (S.speedFov ? clamp(fc.speed / 55, 0, 1) * 9 : 0) + (fc.grounded ? 0 : 2);
  if (Math.abs(camera.fov - targetFov) > 0.05) { camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-3.2 * dt)); camera.updateProjectionMatrix(); }
  $('speedFx').style.opacity = clamp((fc.speed - 34) / 22, 0, 0.85);
}

// ---------- HUD ----------
function updateHud(dt, fc) {
  if (!race) return;
  const t = race.time * 1000 + race.penalty;
  setText('hudTime', state === 'countdown' ? '0:00.000' : fmtTime(t));
  setText('hudBest', race.prevBest ? 'рекорд: ' + fmtTime(race.prevBest) : 'рекорда пока нет');
  const kmh = fc.speed * (S.speedUnit === 'mph' ? 2.237 : 3.6);
  setText('hudSpeed', String(Math.round(kmh)));
  setText('hudUnit', S.speedUnit === 'mph' ? 'mph' : 'км/ч');
  setText('hudGear', fc.gear === 0 ? 'R' : fc.fwdSpeed < 0.4 && fc.speed < 0.4 ? 'N' : String(fc.gear || 1));
  $('rpmFill').style.width = clamp((fc.rpm || 0.2) * 100, 3, 100) + '%';
  setText('hudScore', Math.round(race.score).toLocaleString('ru'));
  setText('hudMult', race.mult > 1.05 ? 'x' + race.mult.toFixed(1) : '');
  $('dmgFill').style.width = (100 - (fc.damage || 0)) + '%';
  $('surfaceTag').classList.toggle('hidden', fc.onRoad || fc.remote);
  const prog = clamp(fc.along / world.finishDist, 0, 1);
  $('progressFill').style.width = (prog * 100).toFixed(1) + '%';
  setText('progDist', (Math.max(0, fc.along) / 1000).toFixed(2) + ' км');
  const st = standings();
  const pos = st.indexOf(race.localEntry) + 1;
  setText('hudPos', race.cars.length > 1 ? `🏎️ ${pos} / ${race.cars.length}` : '⏱️ на время');
}

// ---------- пауза ----------
function togglePause() {
  if (state === 'racing') {
    state = 'paused';
    audio.engineStop();
    $('pauseStats').innerHTML = `Время: <b>${fmtTime(race.time * 1000 + race.penalty)}</b> · Очки: <b>${Math.round(race.score)}</b>${race.mode === 'online' ? '<br>🌐 Онлайн-гонка продолжается для остальных!' : ''}`;
    $('btnBackLobby').classList.toggle('hidden', race.mode !== 'online');
    $('pauseScreen').classList.remove('hidden');
  } else if (state === 'paused') resumeRace();
}
function resumeRace() {
  if (state !== 'paused') return;
  state = 'racing';
  $('pauseScreen').classList.add('hidden');
  clock.getDelta();
}

// ---------- экраны ----------
function showScreen(id) {
  for (const s of ['menuScreen', 'lobbyScreen', 'resultsScreen']) $(s).classList.toggle('hidden', s !== id);
  if (id) state = id === 'menuScreen' ? 'menu' : id === 'lobbyScreen' ? 'lobby' : state;
}
function closeAllModals() { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); }
function showLoading(text) { $('loading').classList.remove('hidden'); $('loadText').textContent = text; $('loadFill').style.width = '55%'; }
function hideLoading() { $('loadFill').style.width = '100%'; setTimeout(() => $('loading').classList.add('hidden'), 180); }
function updateTouchVisibility() {
  const show = (S.touchButtons === 'on' || (S.touchButtons === 'auto' && isTouchDevice)) && race && race.myRole === 'driver';
  $('touchControls').classList.toggle('hidden', !show);
  $('tPTT').style.display = net.inRoom ? '' : 'none';
}

// ---------- голосовая панель ----------
function buildVoicePanel() {
  const list = $('voiceList');
  if (!race) { list.innerHTML = ''; return; }
  let rows = [];
  if (race.mode === 'online') {
    rows = net.players.map(p => ({ id: p.id, name: p.name, team: p.team, role: p.role, me: p.id === net.myId, speaking: p.speaking, hasMic: p.hasMic, muted: net.mutedPlayers.has(p.id) }));
  } else {
    rows = [
      { id: 'me', name: S.playerName + (race.myRole === 'driver' ? ' (водитель)' : ' (штурман)'), team: 0, me: true, speaking: net.speaking, hasMic: !!net.localStream },
      { id: 'ai', name: race.myRole === 'driver' ? '🤖 ИИ-штурман' : '🤖 ИИ-водитель', team: 0, speaking: false, hasMic: true, ai: true },
    ];
  }
  list.innerHTML = rows.map(r => `<div class="voice-row ${r.speaking ? 'speaking' : ''}" data-vid="${r.id}">
    <span class="vdot"></span><span>${r.hasMic ? '🎙️' : '🔇'}</span>
    <span class="vname" style="color:${TEAMS[r.team]?.color || '#fff'}">${r.name}</span>
    ${!r.me && !r.ai && race.mode === 'online' ? `<button class="vmute" data-mute="${r.id}" title="Заглушить">${r.muted ? '🔇' : '🔊'}</button>` : ''}
  </div>`).join('');
  list.querySelectorAll('[data-mute]').forEach(b => b.onclick = () => { net.setPlayerMuted(b.dataset.mute, !net.mutedPlayers.has(b.dataset.mute)); buildVoicePanel(); });
}
function updateMicHud() {
  $('btnMicHud').classList.toggle('mic-live', net.micLive);
  $('btnMicHud').textContent = net.localStream ? (net.micLive ? '🎙️' : '🎤') : '🔇';
}

// ---------- сеть: колбэки ----------
net.onConnected = (ok) => {
  const el = $('netStatus');
  el.className = 'net-status ' + (ok ? 'online' : 'offline');
  el.textContent = ok ? '● Сервер: онлайн — можно играть по сети' : '● Сервер: нет связи (доступен соло-режим)';
  if (ok) net.listRooms();
};
net.onError = (msg) => toast('⚠️ ' + msg, true);
net.onRooms = (rooms) => {
  const el = $('roomList');
  if (!rooms.length) { el.innerHTML = '<div class="room-empty">Нет открытых лобби — создайте своё!</div>'; return; }
  el.innerHTML = rooms.map(r => `<div class="room-item" data-code="${r.code}"><span>🏁 <b>${escapeHtml(r.name)}</b> <span class="dim">${TRACKS.find(t => t.id === r.track)?.name || ''}</span></span><span class="dim">${r.players}/${r.max} 👥 · ${r.code}</span></div>`).join('');
  el.querySelectorAll('.room-item').forEach(it => it.onclick = () => { audio.click(); joinLobby(it.dataset.code); });
};
net.onLobby = () => { if (state === 'lobby') renderLobby(); buildVoicePanel(); };
net.onChat = (m) => {
  const log = $('chatLog');
  const d = document.createElement('div');
  if (m.sys) { d.className = 'sys'; d.textContent = m.msg; }
  else d.innerHTML = `<span class="cname" style="color:${TEAMS[m.team]?.color || '#fff'}">${escapeHtml(m.name)}:</span> ${escapeHtml(m.msg)}`;
  log.appendChild(d); log.scrollTop = log.scrollHeight;
};
net.onPos = (id, team, p) => {
  if (!race || race.mode !== 'online' || !p) return;
  const aiIdx = p[6];
  let entry;
  if (aiIdx >= 0) entry = race.cars.find(c => c.aiKey === 'ai' + aiIdx);
  else entry = race.cars.find(c => c.kind === 'remote' && c.driverPlayer?.id === id);
  entry?.remote?.push(p);
};
net.onNote = (m) => {
  if (!race || m.team !== race.myTeam || race.myRole !== 'driver') return;
  race.called.add(m.note.dist);
  showNoteOnHud(m.note, true);
  if (S.tts) audio.speak(m.note.tts);
  audio.pop();
};
net.onQuick = (m) => {
  if (!race || m.team !== race.myTeam) return;
  if (race.myRole === 'driver') { showQuickFlash('🗺️ ' + m.cmd); audio.speak(m.cmd.replace(/[\p{Extended_Pictographic}]/gu, '')); audio.pop(); }
};
net.onCountdown = (m) => {
  const me = m.players.find(p => p.id === net.myId);
  if (!me) return;
  closeAllModals();
  startRace(m.cfg, { mode: 'online', myTeam: me.team, myRole: me.role, players: m.players, countdownAt: m.startAt });
};
net.onResults = (results) => {
  onlineResults = results;
  if (state === 'finished' && !$('resultsScreen').classList.contains('hidden')) showResults();
  else if (race && !race.finished) {
    const last = results[results.length - 1];
    if (last && last.team !== race.myTeam) toast(`🏁 ${TEAMS[last.team].name} финишировала: ${fmtTime(last.time)}`);
  }
};
net.onRaceStopped = () => { if (race?.mode === 'online') { toast('↩️ Гонка остановлена — возвращаемся в лобби'); backToLobbyScreen(); } };
net.onVoiceState = (id, st) => {
  const p = net.players.find(x => x.id === id);
  if (p) Object.assign(p, st);
  buildVoicePanel();
  if (state === 'lobby') renderLobby();
};
net.onPeerLeft = () => buildVoicePanel();
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- лобби UI ----------
function joinLobby(code) {
  audio.init();
  if (!net.connected) { net.connect(); toast('Подключаемся к серверу...', false, 1500); setTimeout(() => joinLobby(code), 700); return; }
  net.joinRoom(code, S.playerName);
  showScreen('lobbyScreen');
}
function backToLobbyScreen() {
  clearRaceMeshes();
  race = null;
  $('hud').classList.add('hidden');
  closeAllModals();
  audio.engineStop();
  spawnMenuCar();
  showScreen('lobbyScreen');
  renderLobby();
}
function renderLobby() {
  if (!net.inRoom) return;
  const cfg = net.cfg, me = net.me;
  const isHost = net.hostId === net.myId;
  $('lobbyTitle').textContent = '🌐 ' + (cfg.roomName || 'Лобби');
  $('lobbyCode').textContent = net.code;
  $('hostBadge').classList.toggle('hidden', !isHost);
  $('btnStartRace').classList.toggle('hidden', !isHost);
  $('btnReady').textContent = me?.ready ? '✅ Готов! (отменить)' : '✅ Готов';
  $('btnReady').classList.toggle('ready-on', !!me?.ready);
  const readyCount = net.players.filter(p => p.ready).length;
  $('lobbyHint').textContent = isHost ? `Готовы: ${readyCount}/${net.players.length}. Можно стартовать в любой момент!` : `Готовы: ${readyCount}/${net.players.length}. Старт даёт хост.`;
  $('voiceHint').textContent = 'Голос: ' + (cfg.voiceChannel === 'all' ? 'все игроки' : 'только своя команда');
  // команды и слоты
  const grid = $('teamsGrid');
  grid.innerHTML = '';
  for (let t = 0; t < cfg.teams; t++) {
    const card = document.createElement('div');
    card.className = 'team-card';
    card.style.borderColor = TEAMS[t].color + '66';
    const slots = ['driver', 'navigator'].map(role => {
      const p = net.players.find(x => x.team === t && x.role === role);
      const isMe = p && p.id === net.myId;
      return `<div class="slot ${p ? 'filled' : ''} ${isMe ? 'me' : ''}" data-team="${t}" data-role="${role}">
        <div class="role">${role === 'driver' ? '🧑‍✈️ Водитель' : '🗺️ Штурман'}</div>
        ${p ? `<div class="pname"><span class="car-dot" style="background:${p.color}"></span>${escapeHtml(p.name)} <span class="mic-ico ${p.speaking ? 'speaking' : ''}">${p.hasMic ? '🎙️' : '🔇'}</span></div><span class="ready-tag">${p.ready ? '✅' : ''}</span><div class="dim">${isMe ? '— это вы' : 'клик: поменяться'}</div>`
             : `<div class="dim">Свободно — клик, чтобы занять${role === 'navigator' ? ' (без водителя рулит ИИ)' : ''}</div>`}
      </div>`;
    }).join('');
    card.innerHTML = `<div class="team-title"><span style="color:${TEAMS[t].color}">${TEAMS[t].name}</span><span class="dim">${t === me?.team ? '⭐ ваша команда' : ''}</span></div><div class="slot-row">${slots}</div>`;
    grid.appendChild(card);
  }
  grid.querySelectorAll('.slot').forEach(s => s.onclick = () => { audio.click(); net.setSlot(+s.dataset.team, s.dataset.role); });
  // настройки хоста
  syncLobbyCfgUI(cfg, isHost);
  net.refreshVoiceVolumes();
}
function syncLobbyCfgUI(cfg, isHost) {
  const map = [['lcRoomName', 'roomName'], ['lcTrack', 'track'], ['lcWeather', 'weather'], ['lcMaxPlayers', 'maxPlayers'], ['lcTeams', 'teams'], ['lcStage', 'stageFrac'], ['lcAI', 'aiRivals'], ['lcDiff', 'difficulty'], ['lcVoice', 'voiceChannel'], ['lcCountdown', 'countdown']];
  for (const [id, key] of map) { const el = $(id); if (document.activeElement !== el) el.value = String(cfg[key]); el.disabled = !isHost; }
  $('lcTime').value = cfg.time; $('lcTime').disabled = !isHost;
  $('lcTimeVal').textContent = fmtDayTime(cfg.time);
  for (const [id, key] of [['lcPrivate', 'isPrivate'], ['lcCollisions', 'collisions'], ['lcDamage', 'damage']]) { $(id).checked = !!cfg[key]; $(id).disabled = !isHost; }
  $('trackDesc').textContent = TRACKS.find(t => t.id === cfg.track)?.desc || '';
}
function fmtDayTime(h) { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
let cfgPushTimer = null;
function pushLobbyCfg() {
  clearTimeout(cfgPushTimer);
  cfgPushTimer = setTimeout(() => {
    const cfg = {
      roomName: $('lcRoomName').value || 'Ралли-лобби', track: $('lcTrack').value, weather: $('lcWeather').value,
      time: +$('lcTime').value, maxPlayers: +$('lcMaxPlayers').value, teams: +$('lcTeams').value,
      stageFrac: +$('lcStage').value, aiRivals: +$('lcAI').value, difficulty: $('lcDiff').value,
      voiceChannel: $('lcVoice').value, countdown: +$('lcCountdown').value,
      isPrivate: $('lcPrivate').checked, collisions: $('lcCollisions').checked, damage: $('lcDamage').checked,
    };
    S.lastCfg = { ...S.lastCfg, ...cfg }; saveSettings();
    if (net.hostId === net.myId) net.updateCfg(cfg);
    // живой предпросмотр мира за лобби
    if (builtKey !== cfgKey(cfg)) { buildWorld(cfg); spawnMenuCar(); }
    else { world.setWeather(cfg.weather); world.setTimeOfDay(cfg.time); }
  }, 250);
}

// ---------- рекорды в меню ----------
function refreshMenuBests() {
  const scores = loadScores().filter(s => !s.dnf);
  if (!scores.length) { $('menuBests').textContent = 'Пока нет результатов — вперёд за первым рекордом!'; return; }
  $('menuBests').innerHTML = TRACKS.map(t => {
    const b = scores.find(s => s.track === t.id);
    return b ? `${t.name}: <b>${fmtTime(b.time)}</b>` : `${t.name}: <span>—</span>`;
  }).join('<br>');
  $('recordsBody').innerHTML = scores.slice(0, 25).map((s, i) => `<tr><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td>${TRACKS.find(t => t.id === s.track)?.name || s.track}</td><td>${escapeHtml(s.name)}</td><td><b>${fmtTime(s.time)}</b></td><td>${(s.score || 0).toLocaleString('ru')}</td><td class="dim">${new Date(s.date).toLocaleDateString('ru')}</td></tr>`).join('') || '<tr><td colspan="6" class="dim">Пусто</td></tr>';
}

// ---------- привязка UI ----------
function fillSelects() {
  const trackOpts = TRACKS.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  const weatherOpts = Object.entries(WEATHERS).map(([id, w]) => `<option value="${id}">${w.name}</option>`).join('');
  for (const id of ['lcTrack', 'soloTrack']) $(id).innerHTML = trackOpts;
  for (const id of ['lcWeather', 'soloWeather', 'setWeatherLive']) $(id).innerHTML = weatherOpts;
}
function syncSettingsUI() {
  $('playerName').value = S.playerName;
  $('carColor').value = S.carColor; $('carColor2').value = S.carColor2;
  $('setCamera').value = S.camera;
  $('setCamDist').value = S.camDist; $('setAssist').value = S.assist; $('setNoteLead').value = S.noteLead;
  $('setSpeedUnit').value = S.speedUnit;
  $('setTraction').checked = S.traction; $('setABS').checked = S.abs; $('setDamage').checked = S.damage;
  $('setAutoNotes').checked = S.autoNotes; $('setShowNotes').checked = S.showGhostNotes; $('setVibration').checked = S.vibration;
  $('setQuality').value = S.quality; $('setFov').value = S.fov; $('setShake').value = S.shake; $('setParticles').value = S.particles;
  $('setShadows').checked = S.shadows; $('setBloom').checked = S.bloom; $('setSpeedFov').checked = S.speedFov; $('setHeadlightFx').checked = S.headlightFx;
  $('volMaster').value = S.master; $('volMusic').value = S.music; $('volEngine').value = S.engineVol; $('volSfx').value = S.sfx; $('volVoice').value = S.voiceVol;
  $('setTtsRate').value = S.ttsRate; $('setMicMode').value = S.micMode; $('selMicMode').value = S.micMode; $('setVoiceChannel').value = S.voiceChannel;
  $('setMusicOn').checked = S.musicOn; $('setTTS').checked = S.tts; $('setEcho').checked = S.echoCancel; $('setNoise').checked = S.noiseSupp;
  $('setSteerSens').value = S.steerSens; $('setTouch').value = S.touchButtons;
  $('setWeatherLive').value = world.weatherId; $('setTimeLive').value = world.time;
  $('setTimeLiveVal').textContent = fmtDayTime(world.time);
  updateValBubbles();
  // соло и лобби из lastCfg
  const c = S.lastCfg;
  $('soloTrack').value = c.track; $('soloWeather').value = c.weather; $('soloTime').value = c.time;
  $('soloTimeVal').textContent = fmtDayTime(c.time);
  $('soloStage').value = String(c.stageFrac); $('soloAI').value = String(c.aiRivals); $('soloDiff').value = c.difficulty;
  $('soloDamage').checked = c.damage; $('soloCollisions').checked = c.collisions;
  document.querySelector(`input[name="soloRole"][value="${c.role || 'driver'}"]`).checked = true;
  $('soloTrackDesc').textContent = TRACKS.find(t => t.id === c.track)?.desc || '';
}
function updateValBubbles() {
  document.querySelectorAll('[data-val]').forEach(el => {
    const k = el.dataset.val, v = S[k];
    el.textContent = typeof v === 'number' ? (v <= 2 && k !== 'fov' ? Math.round(v * 100) + '%' : Math.round(v)) : '';
  });
}

function bindUI() {
  document.querySelectorAll('.close-modal').forEach(b => b.onclick = () => { $(b.dataset.close).classList.add('hidden'); audio.click(); });
  document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== b.dataset.tab));
    audio.click();
  });
  const openSettings = () => { syncSettingsUI(); $('settingsModal').classList.remove('hidden'); audio.click(); };
  $('btnSettings').onclick = openSettings;
  $('btnPauseSettings').onclick = openSettings;
  $('btnRecords').onclick = () => { refreshMenuBests(); $('recordsModal').classList.remove('hidden'); audio.click(); };
  $('btnHelp').onclick = () => { $('helpModal').classList.remove('hidden'); audio.click(); };
  $('btnClearScores').onclick = () => { clearScores(); refreshMenuBests(); toast('🗑️ Рекорды очищены'); };

  $('playerName').onchange = () => { setSetting('playerName', $('playerName').value.trim() || 'Гонщик'); net.setProfile(S.playerName, S.carColor); };
  $('carColor').oninput = () => { setSetting('carColor', $('carColor').value); menuCar?.setColor(S.carColor, S.carColor2); net.setProfile(S.playerName, S.carColor); };
  $('carColor2').oninput = () => { setSetting('carColor2', $('carColor2').value); menuCar?.setColor(S.carColor, S.carColor2); };

  $('btnQuickStart').onclick = () => { audio.init(); audio.click(); startRace({ ...S.lastCfg }, { mode: 'solo', myRole: S.lastCfg.role || 'driver' }); };
  $('btnSolo').onclick = () => { syncSettingsUI(); $('soloModal').classList.remove('hidden'); audio.click(); };
  $('btnSoloStart').onclick = () => {
    const cfg = { ...S.lastCfg, track: $('soloTrack').value, weather: $('soloWeather').value, time: +$('soloTime').value, stageFrac: +$('soloStage').value, aiRivals: +$('soloAI').value, difficulty: $('soloDiff').value, damage: $('soloDamage').checked, collisions: $('soloCollisions').checked };
    const role = document.querySelector('input[name="soloRole"]:checked').value;
    cfg.role = role;
    S.lastCfg = cfg; saveSettings();
    $('soloModal').classList.add('hidden');
    startRace(cfg, { mode: 'solo', myRole: role });
  };
  const soloLive = () => { $('soloTimeVal').textContent = fmtDayTime(+$('soloTime').value); $('soloTrackDesc').textContent = TRACKS.find(t => t.id === $('soloTrack').value)?.desc || ''; };
  $('soloTime').oninput = soloLive; $('soloTrack').onchange = soloLive;

  $('btnCreateLobby').onclick = () => {
    audio.init(); audio.click();
    if (!net.connected) { net.connect(); toast('Подключаемся к серверу...', false, 1400); setTimeout(() => $('btnCreateLobby').click(), 750); return; }
    net.createRoom(S.playerName, { ...S.lastCfg, roomName: S.lastCfg.roomName || ('Лобби ' + S.playerName) });
    showScreen('lobbyScreen');
  };
  $('btnJoinLobby').onclick = () => { const code = $('joinCode').value.trim().toUpperCase(); if (code.length === 4) joinLobby(code); else toast('Введите 4-значный код лобби', true); };
  $('joinCode').onkeydown = (e) => { if (e.key === 'Enter') $('btnJoinLobby').click(); };
  $('btnRefreshRooms').onclick = () => { net.connect(); net.listRooms(); audio.click(); };
  $('btnLeaveLobby').onclick = () => { net.leaveRoom(); showScreen('menuScreen'); net.listRooms(); audio.click(); };
  $('btnCopyCode').onclick = async () => { try { await navigator.clipboard.writeText(net.code); toast('📋 Код ' + net.code + ' скопирован!'); } catch { toast('Код лобби: ' + net.code); } };
  $('btnReady').onclick = () => { net.setReady(!net.me?.ready); audio.click(); };
  $('btnStartRace').onclick = () => { audio.click(); net.startRace(); };
  const sendChat = () => { const v = $('chatInput').value.trim(); if (v) { net.chat(v); $('chatInput').value = ''; } };
  $('btnChatSend').onclick = sendChat;
  $('chatInput').onkeydown = (e) => { if (e.key === 'Enter') sendChat(); };
  for (const id of ['lcRoomName', 'lcTrack', 'lcWeather', 'lcTime', 'lcMaxPlayers', 'lcTeams', 'lcStage', 'lcAI', 'lcDiff', 'lcVoice', 'lcCountdown', 'lcPrivate', 'lcCollisions', 'lcDamage']) {
    $(id).addEventListener('input', pushLobbyCfg);
    $(id).addEventListener('change', pushLobbyCfg);
  }

  // микрофон
  const toggleMic = async (btn) => {
    audio.init();
    if (!net.localStream || !net.micOn) { const ok = await net.enableMic(); if (ok) toast('🎙️ Микрофон включён' + (S.micMode === 'ptt' ? ' — удерживайте V, чтобы говорить' : '')); }
    else { net.disableMic(); toast('🔇 Микрофон выключен'); }
    updateMicButtons(); updateMicHud(); buildVoicePanel();
  };
  $('btnMicToggle').onclick = toggleMic;
  $('btnMicTest').onclick = toggleMic;
  $('btnMicHud').onclick = toggleMic;
  $('selMicMode').onchange = () => { setSetting('micMode', $('selMicMode').value); $('setMicMode').value = S.micMode; net._applyMicGate?.(); };
  function updateMicButtons() {
    const on = net.micOn && net.localStream;
    $('btnMicToggle').textContent = on ? '🎙️ Микрофон ВКЛ (выключить)' : '🎙️ Включить микрофон';
    $('btnMicToggle').classList.toggle('ready-on', !!on);
  }
  setInterval(updateMicButtons, 1500);

  // гонка: кнопки HUD
  $('btnPauseHud').onclick = () => togglePause();
  $('btnCamHud').onclick = () => cycleCamera();
  $('btnResetCar').onclick = () => resetCarToTrack();
  $('btnCallNote').onclick = () => callNextNote();
  document.querySelectorAll('.quick-btn').forEach(b => b.onclick = () => sendQuick(b.dataset.cmd));
  $('btnResume').onclick = () => resumeRace();
  $('btnRestart2').onclick = () => restartRace();
  $('btnRestart').onclick = () => restartRace();
  $('btnQuitToMenu').onclick = () => { if (race?.mode === 'online') net.leaveRoom(); quitToMenu(); };
  $('btnBackLobby').onclick = () => { net.backToLobby(); backToLobbyScreen(); };
  $('btnResultsLobby').onclick = () => { net.backToLobby(); backToLobbyScreen(); };
  $('btnResultsMenu').onclick = () => { if (race?.mode === 'online') net.leaveRoom(); quitToMenu(); };

  // настройки: привязка полей
  const bind = (id, key, parse = (v) => v, after) => {
    $(id).addEventListener('input', () => { setSetting(key, parse($(id).type === 'checkbox' ? $(id).checked : $(id).value)); updateValBubbles(); after?.(); });
    $(id).addEventListener('change', () => { setSetting(key, parse($(id).type === 'checkbox' ? $(id).checked : $(id).value)); updateValBubbles(); after?.(); });
  };
  bind('setCamera', 'camera', v => v, () => camMode = S.camera);
  bind('setCamDist', 'camDist', Number); bind('setAssist', 'assist', Number); bind('setNoteLead', 'noteLead', Number);
  bind('setSpeedUnit', 'speedUnit'); bind('setTraction', 'traction'); bind('setABS', 'abs'); bind('setDamage', 'damage');
  bind('setAutoNotes', 'autoNotes'); bind('setShowNotes', 'showGhostNotes'); bind('setVibration', 'vibration');
  bind('setQuality', 'quality', v => v, applyQuality); bind('setFov', 'fov', Number); bind('setShake', 'shake', Number); bind('setParticles', 'particles', Number);
  bind('setShadows', 'shadows', v => v, applyQuality); bind('setBloom', 'bloom', v => v, applyQuality);
  bind('setSpeedFov', 'speedFov'); bind('setHeadlightFx', 'headlightFx', v => v, () => race?.cars.forEach(c => c.mesh.setLights(world.isNight, S.headlightFx)));
  bind('volMaster', 'master', Number, () => audio.applyVolumes()); bind('volMusic', 'music', Number, () => audio.applyVolumes());
  bind('volEngine', 'engineVol', Number, () => audio.applyVolumes()); bind('volSfx', 'sfx', Number, () => audio.applyVolumes());
  bind('volVoice', 'voiceVol', Number, () => { audio.applyVolumes(); net.refreshVoiceVolumes(); });
  bind('setTtsRate', 'ttsRate', Number);
  bind('setMicMode', 'micMode', v => v, () => { $('selMicMode').value = S.micMode; net._applyMicGate?.(); });
  bind('setVoiceChannel', 'voiceChannel', v => v, () => net.refreshVoiceVolumes());
  bind('setMusicOn', 'musicOn', v => v, () => { audio.applyVolumes(); if (S.musicOn) audio.startMusic(); });
  bind('setTTS', 'tts'); bind('setEcho', 'echoCancel'); bind('setNoise', 'noiseSupp');
  bind('setSteerSens', 'steerSens', Number); bind('setTouch', 'touchButtons', v => v, updateTouchVisibility);
  $('setWeatherLive').onchange = () => { world.setWeather($('setWeatherLive').value); audio.setRain(world.weather.rain || 0); toast('🌦️ Погода: ' + WEATHERS[$('setWeatherLive').value].name + ' (сцепление ' + Math.round(world.gripMul * 100) + '%)'); };
  $('setTimeLive').oninput = () => { world.setTimeOfDay(+$('setTimeLive').value); $('setTimeLiveVal').textContent = fmtDayTime(world.time); race?.cars.forEach(c => c.mesh.setLights(world.isNight, S.headlightFx)); menuCar?.setLights(world.isNight, S.headlightFx); };
  $('btnResetSettings').onclick = () => { Object.assign(S, structuredClone(DEFAULTS)); saveSettings(); syncSettingsUI(); applyQuality(); audio.applyVolumes(); toast('↩️ Настройки сброшены'); };
}

// ---------- старт ----------
function init() {
  fillSelects();
  bindUI();
  syncSettingsUI();
  refreshMenuBests();
  showLoading('Строим трассу...');
  $('loadFill').style.width = '30%';
  net.connect();
  // первый жест — разблокировка звука
  addEventListener('pointerdown', () => { audio.init(); audio.applyVolumes(); if (state === 'menu' || state === 'lobby') audio.startMusic(); }, { once: false });
  setTimeout(() => {
    buildWorld({ ...S.lastCfg });
    spawnMenuCar();
    const pose = world.startPose(0);
    camera.position.set(pose.x + 10, pose.y + 4, pose.z + 10);
    hideLoading();
    showScreen('menuScreen');
    animate();
  }, 60);
}
init();

// авто-подключение к лобби по ссылке ?room=CODE
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) setTimeout(() => { $('joinCode').value = urlRoom.toUpperCase(); toast('🔗 Код из ссылки подставлен — нажмите «Войти по коду»'); }, 800);
