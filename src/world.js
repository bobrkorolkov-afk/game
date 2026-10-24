// Низкополигональный мир: процедурный террейн, раллийная трасса, погода, время суток, стенограмма
import * as THREE from 'three';

export const TRACKS = [
  { id: 'forest', name: '🌲 Лесная «Финляндия»', seed: 1337, twist: 0.72, hillAmp: 17, theme: 'forest', points: 32, desc: 'Быстрые гравейные прямики, трамплины и слепые горбы между сосен.' },
  { id: 'mountain', name: '⛰️ Горный серпантин', seed: 4242, twist: 1.15, hillAmp: 40, theme: 'mountain', points: 36, desc: 'Шпильки, подъёмы и спуски. Тормози раньше — пропасти не прощают.' },
  { id: 'desert', name: '🏜️ Пустыня «Дакар»', seed: 777, twist: 0.55, hillAmp: 10, theme: 'desert', points: 28, desc: 'Песок, камни и скорость. Держи газ и следи за камнями!' },
];

export const WEATHERS = {
  clear: { name: '☀️ Ясно', grip: 1.0, fog: 0.00075, rain: 0, snow: 0, cloud: 0.3, sunMul: 1.0 },
  cloudy: { name: '☁️ Облачно', grip: 0.97, fog: 0.0012, rain: 0, snow: 0, cloud: 0.95, sunMul: 0.65 },
  rain: { name: '🌧️ Дождь', grip: 0.74, fog: 0.0021, rain: 1, snow: 0, cloud: 1, sunMul: 0.45 },
  storm: { name: '⛈️ Гроза', grip: 0.68, fog: 0.0028, rain: 1.7, snow: 0, cloud: 1, sunMul: 0.3, lightning: true, wind: 1 },
  snow: { name: '❄️ Снегопад', grip: 0.6, fog: 0.0017, rain: 0, snow: 1, cloud: 0.8, sunMul: 0.8 },
  foggy: { name: '🌫️ Туман', grip: 0.9, fog: 0.008, rain: 0, snow: 0, cloud: 0.6, sunMul: 0.55 },
};

const SIZE = 2800, SEG = 150;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNoise(rng, cells) {
  const g = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < g.length; i++) g[i] = rng() * 2 - 1;
  return (x, y) => {
    x = clamp(x, 0, cells - 0.001); y = clamp(y, 0, cells - 0.001);
    const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
    const i00 = g[yi * (cells + 1) + xi], i10 = g[yi * (cells + 1) + xi + 1];
    const i01 = g[(yi + 1) * (cells + 1) + xi], i11 = g[(yi + 1) * (cells + 1) + xi + 1];
    return lerp(lerp(i00, i10, xf), lerp(i01, i11, xf), yf);
  };
}
function bannerTexture(text, bg = '#111', fg = '#ffd23f') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  if (text === 'ФИНИШ') { // шашечки
    for (let y = 0; y < 6; y++) for (let x = 0; x < 32; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); }
  } else {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 96);
    g.fillStyle = fg; g.font = '900 58px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 52);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const SKY_KEYS = [ // время -> палитра
  { h: 0, top: 0x0b1026, bot: 0x1b2340, sun: 0x8fb4ff, sunI: 0.12, hemiI: 0.22, fog: 0x141b30 },
  { h: 5.5, top: 0x1c2a52, bot: 0x59406b, sun: 0xff9e66, sunI: 0.25, hemiI: 0.3, fog: 0x3a3550 },
  { h: 7.5, top: 0x5f9fd8, bot: 0xffc98a, sun: 0xffb877, sunI: 1.5, hemiI: 0.55, fog: 0xd8b58e },
  { h: 12, top: 0x3d8fd1, bot: 0xbfe3f2, sun: 0xfff3d6, sunI: 2.5, hemiI: 0.75, fog: 0xc4dde8 },
  { h: 17, top: 0x3f7ec2, bot: 0xe8d9ae, sun: 0xffdf9e, sunI: 2.0, hemiI: 0.6, fog: 0xd6c9a2 },
  { h: 19.5, top: 0x35406e, bot: 0xff8f5c, sun: 0xff8a4d, sunI: 0.9, hemiI: 0.35, fog: 0x8a5a52 },
  { h: 21.5, top: 0x0e1430, bot: 0x232a4a, sun: 0x8fb4ff, sunI: 0.14, hemiI: 0.22, fog: 0x161d36 },
  { h: 24, top: 0x0b1026, bot: 0x1b2340, sun: 0x8fb4ff, sunI: 0.12, hemiI: 0.22, fog: 0x141b30 },
];

export class World {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xc4dde8, 0.0008);
    this.gripMul = 1; this.windVec = new THREE.Vector3();
    this.time = 11; this.weatherId = 'clear';
    this.onLightning = null;
    this._lightningT = 3 + Math.random() * 6; this._flash = 0;
  }

  build(cfg) {
    const scene = this.scene;
    // очистка
    scene.traverse(o => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map?.dispose?.(); m.dispose?.(); }); });
    scene.clear();
    scene.fog = new THREE.FogExp2(0xc4dde8, 0.0008);

    const trackDef = TRACKS.find(t => t.id === cfg.track) || TRACKS[0];
    this.trackDef = trackDef;
    const rng = mulberry32(trackDef.seed + (cfg.seedVariant || 0) * 977);
    this.theme = trackDef.theme;

    // ---- базовая высота террейна ----
    const n1 = makeNoise(mulberry32(trackDef.seed + 11), 10);
    const n2 = makeNoise(mulberry32(trackDef.seed + 23), 26);
    const n3 = makeNoise(mulberry32(trackDef.seed + 37), 64);
    const amp = trackDef.hillAmp;
    this.baseHeight = (x, z) => {
      const u = (x / SIZE + 0.5), v = (z / SIZE + 0.5);
      let h = n1(u * 10, v * 10) * amp + n2(u * 26, v * 26) * amp * 0.32 + n3(u * 64, v * 64) * amp * 0.08;
      const edge = Math.max(Math.abs(x), Math.abs(z)) / (SIZE / 2);
      if (edge > 0.82) h += (edge - 0.82) * 260; // горы по краям карты
      return h;
    };

    // ---- контрольные точки трассы ----
    const pts2 = [];
    let px = -SIZE * 0.34, pz = -SIZE * 0.34, heading = Math.PI * 0.25;
    for (let i = 0; i < trackDef.points; i++) {
      pts2.push(new THREE.Vector3(px, 0, pz));
      const step = 88 + rng() * 85;
      heading += (rng() - 0.48) * 2 * trackDef.twist;
      if (rng() < 0.16) heading += (rng() > 0.5 ? 1 : -1) * (0.75 + rng() * 0.8); // редкие шпильки
      const toCenter = Math.atan2(-px, -pz);
      const dc = Math.hypot(px, pz);
      if (dc > SIZE * 0.3) { // мягко тянемся к центру
        let diff = toCenter - heading;
        while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
        heading += diff * 0.55;
      }
      px = clamp(px + Math.sin(heading) * step, -SIZE * 0.43, SIZE * 0.43);
      pz = clamp(pz + Math.cos(heading) * step, -SIZE * 0.43, SIZE * 0.43);
    }
    const curve = new THREE.CatmullRomCurve3(pts2, false, 'catmullrom', 0.5);
    const raw = curve.getSpacedPoints(1100);

    // высоты вдоль трассы: сглаживаем + трамплины
    let ys = raw.map(p => this.baseHeight(p.x, p.z));
    for (let pass = 0; pass < 4; pass++) {
      const src = ys.slice();
      for (let i = 0; i < ys.length; i++) {
        let s = 0, c = 0;
        for (let k = -9; k <= 9; k++) { const j = clamp(i + k, 0, ys.length - 1); s += src[j]; c++; }
        ys[i] = s / c;
      }
    }
    const jumps = trackDef.theme === 'forest' ? 8 : trackDef.theme === 'desert' ? 4 : 2;
    for (let j = 0; j < jumps; j++) { // острые трамплины: машина реально взлетает
      const c = 80 + Math.floor(rng() * 940);
      const h = 1.4 + rng() * 1.1;
      for (let k = -6; k <= 6; k++) if (ys[c + k] !== undefined) ys[c + k] += Math.cos(k / 6 * Math.PI / 2) ** 2 * h;
    }

    this.samples = [];
    let distAcc = 0;
    for (let i = 0; i < raw.length; i++) {
      if (i > 0) distAcc += raw[i].distanceTo(raw[i - 1]);
      const p = raw[i], pn = raw[Math.min(i + 1, raw.length - 1)], pp = raw[Math.max(i - 1, 0)];
      let tx = pn.x - pp.x, tz = pn.z - pp.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      this.samples.push({ x: p.x, y: ys[i], z: p.z, tx, tz, dist: distAcc, curv: 0 });
    }
    this.totalLength = distAcc;
    this.finishDist = this.totalLength * clamp(cfg.stageFrac || 1, 0.4, 1);
    // кривизна (для ИИ и стенограммы)
    for (let i = 0; i < this.samples.length; i++) {
      const a = this.samples[Math.max(0, i - 6)], b = this.samples[Math.min(this.samples.length - 1, i + 6)];
      const a1 = Math.atan2(a.tx, a.tz), a2 = Math.atan2(b.tx, b.tz);
      let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      this.samples[i].curv = d / Math.max(6, b.dist - a.dist); // рад/м, знак: + вправо
    }
    // хеш образцов для поиска
    this.sampleHash = new Map();
    const cell = 44;
    this.samples.forEach((s, i) => {
      if (i % 2) return;
      const k = `${Math.floor(s.x / cell)},${Math.floor(s.z / cell)}`;
      if (!this.sampleHash.has(k)) this.sampleHash.set(k, []);
      this.sampleHash.get(k).push(i);
    });
    this.sampleCell = cell;

    this.buildHeights();
    this.buildTerrain(cfg);
    this.buildRoad(cfg);
    this.buildProps(rng, cfg);
    this.buildGates(cfg);
    this.buildSky();
    this.buildPrecipitation();
    this.generateNotes();
    this.setTimeOfDay(cfg.time ?? 11);
    this.setWeather(cfg.weather || 'clear');
  }

  nearestSampleIndex(x, z, hint = -1) {
    const S = this.samples;
    let best = -1, bestD = Infinity;
    if (hint >= 0) {
      for (let i = Math.max(0, hint - 40); i < Math.min(S.length, hint + 70); i++) {
        const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (bestD < 60 * 60) return best;
    }
    // глобальный поиск через хеш с расширением
    const cell = this.sampleCell, cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let r = 0; r <= 6 && best < 0; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        const arr = this.sampleHash.get(`${cx + dx},${cz + dz}`); if (!arr) continue;
        for (const i of arr) { const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2; if (d < bestD) { bestD = d; best = i; } }
      }
    }
    if (best < 0) { // запасной грубый проход
      for (let i = 0; i < S.length; i += 5) { const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2; if (d < bestD) { bestD = d; best = i; } }
    }
    return best;
  }

  /** Полная информация о точке: высота земли, прогресс по трассе, смещение от центра дороги */
  sampleGround(x, z, hint = -1) {
    const idx = this.nearestSampleIndex(x, z, hint);
    const s = this.samples[idx];
    const ox = x - s.x, oz = z - s.z;
    const lat = ox * s.tz - oz * s.tx; // + = вправо от направления? (tx,tz)x(offset) — знак стабилен
    const along = s.dist + (ox * s.tx + oz * s.tz);
    const terrainH = this.getHeight(x, z);
    const roadH = this.sampleAtDist(along).y; // интерполяция — без дискретных ступенек высоты
    const aLat = Math.abs(lat);
    let h;
    if (aLat < 5.4) h = roadH;
    else if (aLat < 9) h = lerp(roadH, terrainH, smooth((aLat - 5.4) / 3.6));
    else h = terrainH;
    return { height: h, idx, along, lat, onRoad: aLat < 5.6, roadH, terrainH, sample: s };
  }
  sampleAtDist(d) {
    const S = this.samples;
    d = clamp(d, 0, this.totalLength - 0.01);
    let lo = 0, hi = S.length - 1;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; (S[mid].dist <= d) ? lo = mid : hi = mid; }
    const a = S[lo], b = S[hi], t = (d - a.dist) / Math.max(0.01, b.dist - a.dist);
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), tx: lerp(a.tx, b.tx, t), tz: lerp(a.tz, b.tz, t), curv: lerp(a.curv, b.curv, t), idx: lo };
  }
  curvAhead(distAlong, meters = 55) {
    let m = 0;
    for (let d = 0; d < meters; d += 8) m = Math.max(m, Math.abs(this.sampleAtDist(distAlong + d).curv));
    return m;
  }
  startPose(slot = 0) {
    const back = 14 + Math.floor(slot / 2) * 11;
    const s = this.sampleAtDist(back);
    const latOff = (slot % 2 === 0 ? -2.1 : 2.1);
    const x = s.x + s.tz * latOff, z = s.z - s.tx * latOff;
    return { x, y: s.y + 0.4, z, yaw: Math.atan2(s.tx, s.tz) };
  }

  buildHeights() {
    const n = SEG + 1;
    this.heights = new Float32Array(n * n);
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
      const x = (ix / SEG - 0.5) * SIZE, z = (iz / SEG - 0.5) * SIZE;
      this.heights[iz * n + ix] = this.baseHeight(x, z);
    }
    // выравниваем под трассу
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
      const x = (ix / SEG - 0.5) * SIZE, z = (iz / SEG - 0.5) * SIZE;
      const idx = this.nearestSampleIndex(x, z);
      const s = this.samples[idx];
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < 36) {
        const h = this.heights[iz * n + ix];
        this.heights[iz * n + ix] = d < 13 ? s.y - 0.05 : lerp(s.y - 0.05, h, smooth((d - 13) / 23));
      }
    }
  }
  getHeight(x, z) {
    const n = SEG + 1;
    const fx = clamp((x / SIZE + 0.5) * SEG, 0, SEG - 0.001), fz = clamp((z / SIZE + 0.5) * SEG, 0, SEG - 0.001);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const H = this.heights;
    return lerp(lerp(H[iz * n + ix], H[iz * n + ix + 1], tx), lerp(H[(iz + 1) * n + ix], H[(iz + 1) * n + ix + 1], tx), tz);
  }

  buildTerrain(cfg) {
    let geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.getHeight(pos.getX(i), pos.getZ(i)));
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();
    const p2 = geo.attributes.position, nor = geo.attributes.normal;
    const colors = new Float32Array(p2.count * 3);
    const rng = mulberry32(99);
    const themePalettes = {
      forest: { low: new THREE.Color(0x49763a), mid: new THREE.Color(0x63944a), rock: new THREE.Color(0x7d7668), high: new THREE.Color(0x9aa284) },
      mountain: { low: new THREE.Color(0x55763f), mid: new THREE.Color(0x77705f), rock: new THREE.Color(0x67625c), high: new THREE.Color(0xe8eef2) },
      desert: { low: new THREE.Color(0xd99e55), mid: new THREE.Color(0xe5b36b), rock: new THREE.Color(0xa05c38), high: new THREE.Color(0xf0cd8d) },
    };
    const pal = themePalettes[this.theme];
    const snowCover = cfg.weather === 'snow';
    const tmp = new THREE.Color();
    for (let f = 0; f < p2.count; f += 3) {
      const jitter = 0.92 + rng() * 0.16;
      for (let k = 0; k < 3; k++) {
        const i = f + k, y = p2.getY(i), slope = 1 - nor.getY(i);
        tmp.copy(pal.low).lerp(pal.mid, clamp((y + 10) / 26, 0, 1));
        if (slope > 0.18) tmp.lerp(pal.rock, clamp((slope - 0.18) * 3.2, 0, 1));
        if (this.theme === 'mountain' && y > 30) tmp.lerp(pal.high, clamp((y - 30) / 16, 0, 1));
        if (this.theme === 'desert' && y > 16) tmp.lerp(pal.high, 0.4);
        if (snowCover) tmp.lerp(new THREE.Color(0xeef3f8), 0.62);
        colors[i * 3] = tmp.r * jitter; colors[i * 3 + 1] = tmp.g * jitter; colors[i * 3 + 2] = tmp.b * jitter;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  buildRoad(cfg) {
    const S = this.samples, halfW = 5.4;
    const positions = [], colors = [], indices = [];
    const baseCols = { forest: new THREE.Color(0x8d7f68), mountain: new THREE.Color(0x6f6e6e), desert: new THREE.Color(0xc79a63) };
    const base = baseCols[this.theme].clone();
    if (cfg.weather === 'snow') base.lerp(new THREE.Color(0xdfe8ee), 0.45);
    const rng = mulberry32(7);
    const step = 2;
    let vi = 0;
    for (let i = 0; i < S.length - step; i += step) {
      for (const j of [i, i + step]) {
        const s = S[j];
        const rx = s.tz, rz = -s.tx;
        const jitter = 0.9 + rng() * 0.2;
        for (const side of [-1, 1]) {
          positions.push(s.x + rx * halfW * side, s.y + 0.09, s.z + rz * halfW * side);
          const edge = 0.82;
          colors.push(base.r * jitter * edge, base.g * jitter * edge, base.b * jitter * edge);
        }
      }
      indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
      vi += 4;
    }
    // центральная полоса чуть светлее (колея): второй слой ленты
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 });
    const road = new THREE.Mesh(geo, mat);
    road.receiveShadow = true;
    this.scene.add(road);

    // столбики-отражатели
    const postGeo = new THREE.BoxGeometry(0.16, 1.0, 0.16);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6, emissive: 0x330000 });
    const postIdx = [];
    for (let i = 6; i < S.length - 6; i += 9) postIdx.push(i);
    const posts = new THREE.InstancedMesh(postGeo, postMat, postIdx.length * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
    let pi = 0;
    for (const i of postIdx) {
      const s = S[i];
      for (const side of [-1, 1]) {
        pv.set(s.x + s.tz * 6.6 * side, s.y + 0.5, s.z - s.tx * 6.6 * side);
        m4.compose(pv, q, sc); posts.setMatrixAt(pi++, m4);
      }
    }
    posts.instanceMatrix.needsUpdate = true;
    this.scene.add(posts);
  }

  buildProps(rng, cfg) {
    const density = cfg.propDensity ?? 1;
    this.colliders = []; this.colliderHash = new Map();
    const addCollider = (x, z, r, type) => {
      const c = { x, z, r, type };
      this.colliders.push(c);
      const k = `${Math.floor(x / 24)},${Math.floor(z / 24)}`;
      if (!this.colliderHash.has(k)) this.colliderHash.set(k, []);
      this.colliderHash.get(k).push(c);
    };
    this.collidersNear = (x, z) => {
      const out = [], cx = Math.floor(x / 24), cz = Math.floor(z / 24);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const arr = this.colliderHash.get(`${cx + dx},${cz + dz}`);
        if (arr) out.push(...arr);
      }
      return out;
    };

    const nearRoad = (x, z, minD) => {
      const s = this.samples[this.nearestSampleIndex(x, z)];
      return Math.hypot(s.x - x, s.z - z) < minD;
    };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();

    // ---- деревья / кактусы ----
    const treeCount = Math.floor((this.theme === 'desert' ? 260 : this.theme === 'mountain' ? 900 : 1500) * density);
    let trunkMesh, topMesh;
    if (this.theme === 'desert') {
      topMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.42, 3.4, 6), new THREE.MeshStandardMaterial({ color: 0x3f7d3a, flatShading: true, roughness: 0.9 }), treeCount);
    } else {
      trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.28, 1.8, 5), new THREE.MeshStandardMaterial({ color: 0x6b4a2e, flatShading: true, roughness: 1 }), treeCount);
      topMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1.7, 5.2, 7), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.95 }), treeCount);
    }
    const greens = [new THREE.Color(0x2e6b35), new THREE.Color(0x3c7f3c), new THREE.Color(0x27602f), new THREE.Color(0x4c8a45)];
    if (cfg.weather === 'snow') greens.forEach(c => c.lerp(new THREE.Color(0xdfeaf2), 0.35));
    let placed = 0, guard = 0;
    while (placed < treeCount && guard++ < treeCount * 8) {
      // деревья гуще у трассы: выбираем случайную точку трассы и отступаем
      const s = this.samples[Math.floor(rng() * this.samples.length)];
      const ang = rng() * Math.PI * 2, rad = 11 + Math.pow(rng(), 1.6) * 260;
      const x = s.x + Math.cos(ang) * rad, z = s.z + Math.sin(ang) * rad;
      if (Math.abs(x) > SIZE / 2 - 30 || Math.abs(z) > SIZE / 2 - 30) continue;
      if (rad < 40 && nearRoad(x, z, 10.5)) continue;
      const y = this.getHeight(x, z);
      const scl = 0.8 + rng() * 1.5;
      e.set(0, rng() * Math.PI, 0); q.setFromEuler(e);
      if (trunkMesh) { pv.set(x, y + 0.8 * scl, z); sv.set(scl, scl, scl); m4.compose(pv, q, sv); trunkMesh.setMatrixAt(placed, m4); }
      pv.set(x, y + (this.theme === 'desert' ? 1.6 : 3.6) * scl, z); sv.set(scl, scl * (0.9 + rng() * 0.4), scl);
      m4.compose(pv, q, sv); topMesh.setMatrixAt(placed, m4);
      if (this.theme !== 'desert') topMesh.setColorAt(placed, greens[(rng() * greens.length) | 0]);
      if (rad < 55) addCollider(x, z, 0.55 * scl + 0.25, 'tree');
      placed++;
    }
    topMesh.count = placed; if (trunkMesh) trunkMesh.count = placed;
    topMesh.castShadow = true; if (trunkMesh) trunkMesh.castShadow = true;
    if (topMesh.instanceColor) topMesh.instanceColor.needsUpdate = true;
    this.scene.add(topMesh); if (trunkMesh) this.scene.add(trunkMesh);

    // ---- камни ----
    const rockCount = Math.floor((this.theme === 'forest' ? 300 : 520) * density);
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: this.theme === 'desert' ? 0xa06a42 : 0x7b776e, flatShading: true, roughness: 1 }), rockCount);
    let rp = 0; guard = 0;
    while (rp < rockCount && guard++ < rockCount * 8) {
      const s = this.samples[Math.floor(rng() * this.samples.length)];
      const ang = rng() * Math.PI * 2, rad = 9 + Math.pow(rng(), 1.4) * 200;
      const x = s.x + Math.cos(ang) * rad, z = s.z + Math.sin(ang) * rad;
      if (Math.abs(x) > SIZE / 2 - 25 || Math.abs(z) > SIZE / 2 - 25) continue;
      if (rad < 30 && nearRoad(x, z, 8.2)) continue;
      const y = this.getHeight(x, z), scl = 0.5 + Math.pow(rng(), 2) * 2.6;
      e.set(rng() * 3, rng() * 3, rng() * 3); q.setFromEuler(e);
      pv.set(x, y + scl * 0.3, z); sv.set(scl, scl * 0.75, scl); m4.compose(pv, q, sv);
      rocks.setMatrixAt(rp, m4);
      if (rad < 50 && scl > 0.7) addCollider(x, z, scl * 0.85, 'rock');
      rp++;
    }
    rocks.count = rp; rocks.castShadow = true; rocks.receiveShadow = true;
    this.scene.add(rocks);

    // ---- красно-белые блоки на внешней стороне поворотов ----
    const blockSpots = [];
    for (let i = 30; i < this.samples.length - 30; i += 7) {
      const s = this.samples[i];
      if (Math.abs(s.curv) > 0.006) {
        const side = s.curv > 0 ? -1 : 1; // снаружи поворота
        blockSpots.push({ x: s.x + s.tz * 7.6 * side, z: s.z - s.tx * 7.6 * side, y: s.y, yaw: Math.atan2(s.tx, s.tz) });
      }
    }
    if (blockSpots.length) {
      const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.65, 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), blockSpots.length);
      const red = new THREE.Color(0xd90429), white = new THREE.Color(0xf5f5f5);
      blockSpots.forEach((b, i) => {
        e.set(0, b.yaw, 0); q.setFromEuler(e);
        pv.set(b.x, b.y + 0.33, b.z); sv.set(1, 1, 1); m4.compose(pv, q, sv);
        blocks.setMatrixAt(i, m4); blocks.setColorAt(i, i % 2 ? red : white);
        addCollider(b.x, b.z, 0.95, 'block');
      });
      blocks.instanceColor.needsUpdate = true; blocks.castShadow = true;
      this.scene.add(blocks);
    }

    // ---- домики ----
    const houseCols = [0xf2e3c9, 0xd96f4e, 0xead9a0, 0xb8c9d9, 0xe8b4b8];
    for (let hi = 0; hi < 9; hi++) {
      const s = this.samples[Math.floor(60 + rng() * (this.samples.length - 120))];
      const side = rng() > 0.5 ? 1 : -1, off = 19 + rng() * 14;
      const x = s.x + s.tz * off * side, z = s.z - s.tx * off * side, y = this.getHeight(x, z);
      const g = new THREE.Group();
      const w = 5 + rng() * 2.5, h = 2.8 + rng() * 1.2, dpt = 4.5 + rng() * 2;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, dpt), new THREE.MeshStandardMaterial({ color: houseCols[(rng() * houseCols.length) | 0], flatShading: true, roughness: 0.9 }));
      body.position.y = h / 2; body.castShadow = true; body.receiveShadow = true;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, dpt) / 2 * 1.05, 1.9, 4), new THREE.MeshStandardMaterial({ color: 0x8a3b2e, flatShading: true, roughness: 0.95 }));
      roof.position.y = h + 0.95; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
      g.add(body, roof); g.position.set(x, y, z); g.rotation.y = rng() * Math.PI * 2;
      this.scene.add(g);
      addCollider(x, z, Math.max(w, dpt) * 0.52, 'house');
    }

    // ---- зрители у старта и КП ----
    this.spectators = null; this.specData = [];
    const specSpots = [];
    const cpDists = this.checkpointDists();
    for (const d of [10, ...cpDists, this.finishDist - 12]) {
      const s = this.sampleAtDist(Math.max(0, d));
      for (let k = 0; k < 14; k++) {
        const side = k % 2 ? 1 : -1, off = 8 + rng() * 4, along = (rng() - 0.5) * 22;
        specSpots.push({ x: s.x + s.tz * off * side + s.tx * along, z: s.z - s.tx * off * side + s.tz * along, y: s.y });
      }
    }
    if (specSpots.length) {
      const geo = new THREE.CapsuleGeometry(0.32, 0.85, 2, 6);
      const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85 });
      const mesh = new THREE.InstancedMesh(geo, mat, specSpots.length);
      const cols = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0xf78c6b, 0xc77dff].map(c => new THREE.Color(c));
      specSpots.forEach((sp, i) => { mesh.setColorAt(i, cols[(rng() * cols.length) | 0]); this.specData.push({ ...sp, ph: rng() * 6.28 }); });
      mesh.instanceColor.needsUpdate = true; mesh.castShadow = true;
      this.spectators = mesh; this.scene.add(mesh);
    }
  }

  checkpointDists() {
    const out = [];
    for (let d = 430; d < this.finishDist - 160; d += 430) out.push(d);
    return out;
  }

  buildGates() {
    const makeGate = (dist, label, color, big = false) => {
      const s = this.sampleAtDist(clamp(dist, 2, this.totalLength - 5));
      const g = new THREE.Group();
      const poleMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3, emissive: color, emissiveIntensity: 0.25 });
      const h = big ? 6.4 : 5.2;
      for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, h, 7), poleMat);
        pole.position.set(6.3 * side, h / 2, 0); pole.castShadow = true; g.add(pole);
      }
      const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTexture(label, '#141414', '#ffd23f'), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.14, emissiveMap: null });
      bannerMat.emissiveMap = bannerMat.map;
      const banner = new THREE.Mesh(new THREE.BoxGeometry(13.4, big ? 1.5 : 1.1, 0.35), bannerMat);
      banner.position.y = h - 0.4; g.add(banner);
      g.position.set(s.x, s.y, s.z);
      g.rotation.y = Math.atan2(s.tx, s.tz);
      this.scene.add(g);
      return { group: g, bannerMat, poleMat };
    };
    this.startGate = makeGate(8, 'СТАРТ', 0x2a9d8f, true);
    this.finishGate = makeGate(this.finishDist, 'ФИНИШ', 0xffd23f, true);
    this.checkpoints = this.checkpointDists().map((d, i) => {
      const gate = makeGate(d, `КП ${i + 1}`, 0x4361ee);
      return { dist: d, gate, flash: 0 };
    });
  }
  flashCheckpoint(i) { if (this.checkpoints[i]) this.checkpoints[i].flash = 1; }

  buildSky() {
    // купол неба с градиентом
    const skyGeo = new THREE.SphereGeometry(2600, 20, 12);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x3d8fd1) }, bot: { value: new THREE.Color(0xbfe3f2) } },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bot; void main(){ float t = clamp(normalize(vP).y * 1.6 + 0.12, 0.0, 1.0); gl_FragColor = vec4(mix(bot, top, pow(t, 0.8)), 1.0); }`,
    });
    this.skyDome = new THREE.Mesh(skyGeo, this.skyMat);
    this.scene.add(this.skyDome);

    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x5c6e46, 0.7);
    this.scene.add(this.hemi);
    this.amb = new THREE.AmbientLight(0xffffff, 0.12);
    this.scene.add(this.amb);
    this.sun = new THREE.DirectionalLight(0xfff3d6, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.camera.left = -95; this.sun.shadow.camera.right = 95;
    this.sun.shadow.camera.top = 95; this.sun.shadow.camera.bottom = -95;
    this.sun.shadow.camera.near = 20; this.sun.shadow.camera.far = 560;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(this.sun); this.scene.add(this.sun.target);

    this.sunBall = new THREE.Mesh(new THREE.SphereGeometry(42, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }));
    this.scene.add(this.sunBall);

    // звёзды
    const starGeo = new THREE.BufferGeometry();
    const sp = [];
    const rng = mulberry32(5);
    for (let i = 0; i < 700; i++) {
      const th = rng() * Math.PI * 2, ph = Math.acos(rng() * 0.95);
      sp.push(Math.sin(ph) * Math.cos(th) * 2400, Math.cos(ph) * 2400, Math.sin(ph) * Math.sin(th) * 2400);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdfeaff, size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.scene.add(this.stars);

    // облака — уплощённые икосаэдры
    const cloudGeo = new THREE.IcosahedronGeometry(1, 0);
    this.cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, transparent: true, opacity: 0.92 });
    this.clouds = new THREE.InstancedMesh(cloudGeo, this.cloudMat, 70);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
    for (let i = 0; i < 70; i++) {
      pv.set((rng() - 0.5) * 3200, 240 + rng() * 160, (rng() - 0.5) * 3200);
      sv.set(50 + rng() * 90, 9 + rng() * 8, 30 + rng() * 50);
      m4.compose(pv, q, sv); this.clouds.setMatrixAt(i, m4);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
    this.scene.add(this.clouds);
  }

  buildPrecipitation() {
    const make = (count, size, color, opacity) => {
      const geo = new THREE.BufferGeometry();
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) { arr[i * 3] = (Math.random() - 0.5) * 110; arr[i * 3 + 1] = Math.random() * 55; arr[i * 3 + 2] = (Math.random() - 0.5) * 110; }
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false }));
      pts.visible = false; pts.frustumCulled = false;
      this.scene.add(pts);
      return pts;
    };
    this.rainPts = make(2600, 0.16, 0xaac4e8, 0.55);
    this.snowPts = make(1800, 0.32, 0xffffff, 0.9);
  }

  setWeather(id) {
    const w = WEATHERS[id] || WEATHERS.clear;
    this.weatherId = id; this.weather = w;
    this.gripMul = w.grip;
    if (this.scene.fog) this.scene.fog.density = w.fog;
    if (this.rainPts) this.rainPts.visible = w.rain > 0;
    if (this.snowPts) this.snowPts.visible = w.snow > 0;
    if (this.cloudMat) { this.cloudMat.opacity = 0.35 + w.cloud * 0.6; this.cloudMat.color.setScalar(1 - w.cloud * 0.38); }
    this.setTimeOfDay(this.time);
  }

  setTimeOfDay(hours) {
    this.time = ((hours % 24) + 24) % 24;
    const h = this.time;
    let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
    for (let i = 0; i < SKY_KEYS.length - 1; i++) if (h >= SKY_KEYS[i].h && h <= SKY_KEYS[i + 1].h) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
    const t = (h - a.h) / Math.max(0.01, b.h - a.h);
    const wMul = this.weather?.sunMul ?? 1;
    const cTop = new THREE.Color(a.top).lerp(new THREE.Color(b.top), t);
    const cBot = new THREE.Color(a.bot).lerp(new THREE.Color(b.bot), t);
    const cSun = new THREE.Color(a.sun).lerp(new THREE.Color(b.sun), t);
    const cFog = new THREE.Color(a.fog).lerp(new THREE.Color(b.fog), t);
    if (this.weatherId === 'rain' || this.weatherId === 'storm') { cTop.lerp(new THREE.Color(0x4a5568), 0.55); cBot.lerp(new THREE.Color(0x6b7686), 0.5); cFog.lerp(new THREE.Color(0x5d6878), 0.5); }
    if (this.skyMat) { this.skyMat.uniforms.top.value.copy(cTop); this.skyMat.uniforms.bot.value.copy(cBot); }
    if (this.scene.fog) this.scene.fog.color.copy(cFog);
    const sunI = lerp(a.sunI, b.sunI, t) * wMul;
    if (this.sun) { this.sun.color.copy(cSun); this.sun.intensity = sunI + this._flash * 3; }
    if (this.hemi) { this.hemi.intensity = lerp(a.hemiI, b.hemiI, t) * (0.6 + wMul * 0.4) + this._flash * 1.6; this.hemi.color.copy(cTop).lerp(new THREE.Color(0xffffff), 0.4); }
    // положение солнца: 6:00 восток -> 18:00 запад; ночью — луна
    const dayT = (h - 6) / 12;
    const elev = Math.sin(clamp(dayT, -0.2, 1.2) * Math.PI);
    const az = lerp(-1.15, Math.PI + 1.15, clamp(dayT, 0, 1));
    if (elev > -0.05) this.sunDir = new THREE.Vector3(Math.cos(az) * 0.85, Math.max(0.06, elev), 0.42).normalize();
    else this.sunDir = new THREE.Vector3(-0.4, 0.55, -0.5).normalize(); // луна
    this.isNight = sunI < 0.55;
    if (this.sunBall) { this.sunBall.material.color.copy(this.isNight ? new THREE.Color(0xdde8ff) : cSun); this.sunBall.visible = elev > -0.12 || this.isNight; }
    if (this.stars) this.stars.material.opacity = clamp(0.5 - sunI, 0, 0.9);
  }

  applyShadowQuality(enabled, size) {
    if (!this.sun) return;
    this.sun.castShadow = enabled;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
  }

  generateNotes() {
    const NAMES = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть'];
    const notes = [];
    const S = this.samples;
    let i = 14;
    while (i < S.length - 30) {
      const curv = S[i].curv;
      if (Math.abs(curv) < 0.0035) { i += 3; continue; }
      const dirSign = Math.sign(curv);
      let j = i, totalAngle = 0, peak = 0;
      while (j < S.length - 8 && Math.sign(S[j].curv) === dirSign && Math.abs(S[j].curv) > 0.0012) {
        totalAngle += Math.abs(S[j].curv) * (S[Math.min(j + 1, S.length - 1)].dist - S[j].dist);
        peak = Math.max(peak, Math.abs(S[j].curv));
        j += 2;
      }
      const deg = totalAngle * 180 / Math.PI;
      const radius = 1 / Math.max(peak, 0.0001);
      const sevR = radius > 190 ? 6 : radius > 120 ? 5 : radius > 75 ? 4 : radius > 45 ? 3 : radius > 26 ? 2 : 1;
      const sevD = deg < 16 ? 6 : deg < 30 ? 5 : deg < 50 ? 4 : deg < 75 ? 3 : deg < 110 ? 2 : 1;
      const sev = Math.min(sevR, sevD); // берём более строгую оценку
      if (deg > 9) {
        const mid = S[Math.floor((i + j) / 2)];
        // горб/трамплин: локальный максимум высоты с последующим спадом
        let crest = false;
        const before = S[Math.max(0, i - 8)].y, after = S[Math.min(S.length - 1, j + 10)].y;
        if (mid.y - Math.min(before, after) > 1.1) crest = true;
        notes.push({
          dist: Math.max(0, S[i].dist - 8), ApexDist: mid.dist,
          // heading = atan2(tx,tz): убывание курса = поворот вправо для водителя
          dir: dirSign > 0 ? 'L' : 'R', sev, crest,
          caution: sev <= 2, jump: crest && sev >= 5,
        });
      }
      i = Math.max(j, i + 4);
    }
    // отдельно трамплины на прямиках
    for (let k = 30; k < S.length - 30; k += 6) {
      const y0 = S[k - 10].y, yP = S[k].y, y1 = S[k + 12].y;
      if (yP - y0 > 0.9 && yP - y1 > 1.3 && Math.abs(S[k].curv) < 0.002) {
        if (!notes.some(n => Math.abs(n.dist - S[k].dist) < 60)) notes.push({ dist: S[k].dist - 6, ApexDist: S[k].dist, dir: null, sev: 6, crest: true, jump: true, caution: false });
      }
    }
    notes.sort((a, b) => a.dist - b.dist);
    notes.forEach((n, idx) => {
      const next = notes[idx + 1];
      n.gap = next ? Math.round((next.dist - n.dist) / 10) * 10 : 0;
      const dirWord = n.dir === 'R' ? 'Правый' : n.dir === 'L' ? 'Левый' : '';
      n.short = n.jump && !n.dir ? '⤒ Трамплин!' : `${n.dir === 'R' ? '➡' : '⬅'} ${dirWord} ${n.sev}${n.crest && n.dir ? ' через горб' : ''}${n.caution ? ' ⚠' : ''}`;
      n.arrow = !n.dir ? '⤒' : n.dir === 'R' ? (n.sev >= 5 ? '↗' : n.sev === 4 ? '➡' : n.sev === 3 ? '↪' : '⤵') : (n.sev >= 5 ? '↖' : n.sev === 4 ? '⬅' : n.sev === 3 ? '↩' : '⤴');
      let tts = n.jump && !n.dir ? 'Трамплин! Держи прямо' : `${dirWord} ${NAMES[n.sev]}`;
      if (n.crest && n.dir) tts += ', через горб';
      if (n.caution) tts += ', осторожно, не резать';
      if (n.gap >= 70) tts += `. ${n.gap}`;
      n.tts = tts;
    });
    this.notes = notes.filter(n => n.dist < this.finishDist);
  }
  notesAhead(distAlong, count = 5) {
    const out = [];
    for (const n of this.notes) if (n.ApexDist > distAlong - 5) { out.push(n); if (out.length >= count) break; }
    return out;
  }

  update(dt, focus, elapsed) {
    // солнце и купол следуют за машиной (тени всегда резкие рядом)
    if (this.sun && focus) {
      this.sun.position.copy(focus).addScaledVector(this.sunDir, 240);
      this.sun.target.position.copy(focus);
      this.skyDome.position.copy(focus);
      this.stars.position.copy(focus);
      this.sunBall.position.copy(focus).addScaledVector(this.sunDir, 2300);
    }
    if (this.clouds) { this.clouds.position.x = ((elapsed * 4) % 3200); if (focus) this.clouds.position.z = focus.z * 0.15; }
    // осадки
    const updPrecip = (pts, speed, sway) => {
      if (!pts || !pts.visible || !focus) return;
      pts.position.set(focus.x, focus.y - 4, focus.z);
      const arr = pts.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= speed * dt * (0.7 + ((i * 13) % 10) / 16);
        if (sway) arr[i] += Math.sin(elapsed * 1.7 + i) * dt * 2.2;
        if (arr[i + 1] < 0) arr[i + 1] = 52;
      }
      pts.geometry.attributes.position.needsUpdate = true;
    };
    updPrecip(this.rainPts, 55, false);
    updPrecip(this.snowPts, 6.5, true);
    // зрители прыгают
    if (this.spectators) {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3(1, 1, 1);
      const focusD = focus ? focus.length() : 0;
      this.specData.forEach((sp, i) => {
        const near = focus && Math.hypot(sp.x - focus.x, sp.z - focus.z) < 45;
        const jump = near ? Math.abs(Math.sin(elapsed * 5 + sp.ph)) * 0.4 : Math.abs(Math.sin(elapsed * 1.6 + sp.ph)) * 0.07;
        pv.set(sp.x, sp.y + 0.85 + jump, sp.z);
        m4.compose(pv, q, sv); this.spectators.setMatrixAt(i, m4);
      });
      this.spectators.instanceMatrix.needsUpdate = true;
    }
    // вспышки КП
    if (this.checkpoints) for (const cp of this.checkpoints) {
      if (cp.flash > 0) { cp.flash = Math.max(0, cp.flash - dt * 1.4); cp.gate.poleMat.emissiveIntensity = 0.25 + cp.flash * 2.4; cp.gate.bannerMat.emissiveIntensity = 0.14 + cp.flash * 1.2; }
    }
    // ветер и молнии
    const w = this.weather || {};
    if (w.wind) {
      const g = Math.sin(elapsed * 0.6) * Math.sin(elapsed * 1.7 + 2) * 5.5;
      this.windVec.set(g, 0, Math.cos(elapsed * 0.43) * 3.5);
    } else this.windVec.set(0, 0, 0);
    if (w.lightning) {
      this._lightningT -= dt;
      if (this._flash > 0) { this._flash = Math.max(0, this._flash - dt * 5); this.setTimeOfDay(this.time); }
      if (this._lightningT <= 0) {
        this._flash = 0.7 + Math.random() * 0.5;
        this._lightningT = 2.5 + Math.random() * 8;
        this.setTimeOfDay(this.time);
        setTimeout(() => this.onLightning?.(), 250 + Math.random() * 900);
      }
    }
  }
}
