// Машина: low-poly модель из примитивов + аркадная физика с дрифтом, прыжками и повреждениями
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export function buildCarMesh(colorHex = '#e63946', stripeHex = '#ffffff', { headlight = false } = {}) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), metalness: 0.55, roughness: 0.32, flatShading: true });
  const paint2 = new THREE.MeshStandardMaterial({ color: new THREE.Color(stripeHex), metalness: 0.4, roughness: 0.4, flatShading: true });
  const black = new THREE.MeshStandardMaterial({ color: 0x17181c, metalness: 0.3, roughness: 0.7, flatShading: true });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0e2030, metalness: 0.9, roughness: 0.12, flatShading: true });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.9, roughness: 0.25, flatShading: true });

  const body = new THREE.Group(); g.add(body);
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = body) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; parent.add(m); return m;
  };
  // кузов: машина смотрит в +Z
  add(new THREE.BoxGeometry(1.82, 0.5, 4.15), paint, 0, 0.52, 0);                 // низ
  add(new THREE.BoxGeometry(1.7, 0.34, 1.15), paint, 0, 0.72, 1.62, -0.1);          // капот
  add(new THREE.BoxGeometry(1.56, 0.5, 1.95), glass, 0, 0.98, -0.18, 0.06);         // кабина (стекло)
  add(new THREE.BoxGeometry(1.6, 0.1, 1.7), paint, 0, 1.24, -0.22);                 // крыша
  add(new THREE.BoxGeometry(0.5, 0.14, 0.65), black, 0, 1.32, 0.15);                // воздухозаборник
  add(new THREE.BoxGeometry(1.86, 0.3, 0.35), black, 0, 0.36, 2.02);                // передний бампер
  add(new THREE.BoxGeometry(1.86, 0.34, 0.3), black, 0, 0.4, -2.02);                // задний бампер
  add(new THREE.BoxGeometry(0.34, 0.06, 4.18), paint2, 0, 0.785, 0);                // полоса
  add(new THREE.BoxGeometry(1.5, 0.07, 0.5), black, 0, 1.12, -1.95);                // спойлер
  add(new THREE.BoxGeometry(0.08, 0.3, 0.3), black, -0.62, 0.95, -1.92);
  add(new THREE.BoxGeometry(0.08, 0.3, 0.3), black, 0.62, 0.95, -1.92);
  add(new THREE.BoxGeometry(1.9, 0.12, 0.7), black, 0, 0.24, 1.95);                 // сплиттер
  for (const sx of [-1, 1]) {                                                       // арки/пороги
    add(new THREE.BoxGeometry(0.14, 0.22, 1.15), black, sx * 0.9, 0.3, 0);
    add(new THREE.BoxGeometry(0.3, 0.05, 0.5), paint2, sx * 0.93, 0.62, -0.4);      // номерной борт
  }
  // фары
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xffedb0, emissiveIntensity: 1.6 });
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.42, 0.16, 0.08), headMat, sx * 0.58, 0.66, 2.08);
  for (const sx of [-1, 0, 1]) add(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 8), headMat, sx * 0.4, 0.86, 1.98, Math.PI / 2); // люстра
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x7a0d18, emissive: 0xff1a2e, emissiveIntensity: 0.7 });
  add(new THREE.BoxGeometry(1.5, 0.14, 0.07), tailMat, 0, 0.68, -2.12);
  add(new THREE.CylinderGeometry(0.07, 0.08, 0.22, 7), chrome, 0.55, 0.3, -2.2, Math.PI / 2); // выхлоп
  // шлемы экипажа
  const helmetL = add(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd23f, flatShading: true, roughness: 0.4 }), -0.36, 1.02, 0.28);
  const helmetR = add(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, flatShading: true, roughness: 0.4 }), 0.36, 1.02, 0.28);

  // колёса
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10); wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.32, 6); hubGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.95, flatShading: true });
  const wheels = {};
  const mkWheel = (name, x, z, steerable) => {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.36, z);
    const spin = new THREE.Group(); pivot.add(spin);
    const tire = new THREE.Mesh(wheelGeo, tireMat); tire.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, chrome);
    spin.add(tire, hub); g.add(pivot);
    wheels[name] = { pivot, spin, steerable };
  };
  mkWheel('fl', -0.86, 1.38, true); mkWheel('fr', 0.86, 1.38, true);
  mkWheel('rl', -0.86, -1.38, false); mkWheel('rr', 0.86, -1.38, false);

  let spot = null, cone = null;
  if (headlight) {
    spot = new THREE.SpotLight(0xffeec4, 0, 130, 0.46, 0.45, 1.1);
    spot.position.set(0, 0.9, 2.0);
    spot.target.position.set(0, 0.2, 34);
    g.add(spot, spot.target);
    const coneGeo = new THREE.ConeGeometry(4.6, 26, 12, 1, true); coneGeo.rotateX(-Math.PI / 2); coneGeo.translate(0, 0, 13);
    cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xffedb5, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    cone.position.set(0, 0.75, 2.0);
    g.add(cone);
  }
  return {
    group: g, body, wheels, tailMat, headMat, spot, cone, helmetL, helmetR,
    setBrake(v) { tailMat.emissiveIntensity = v ? 3.2 : 0.7; },
    setLights(on, fx = true) {
      headMat.emissiveIntensity = on ? 3.4 : 0.4;
      if (spot) spot.intensity = on ? 900 : 0;
      if (cone) cone.material.opacity = on && fx ? 0.07 : 0;
    },
    setColor(c1, c2) { paint.color.set(c1); if (c2) paint2.color.set(c2); },
    animateWheels(steerVis, spinDelta) {
      for (const w of Object.values(wheels)) { if (w.steerable) w.pivot.rotation.y = steerVis; w.spin.rotation.x += spinDelta; }
    },
  };
}

export class CarSim {
  constructor(world, meshParts, opts = {}) {
    this.world = world;
    this.mesh = meshParts;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.steerVis = 0; this.wheelSpin = 0;
    this.grounded = true; this.vy = 0; this.slopeVy = 0;
    this.airTime = 0; this.damage = 0;
    this.speed = 0; this.fwdSpeed = 0; this.latSpeed = 0;
    this.driftAngle = 0; this.sliding = 0;
    this.trackIdx = 0; this.along = 0; this.lat = 0; this.onRoad = true;
    this.rpm = 0; this.gear = 1;
    this.opts = opts;
    this.events = {};
    this.bodyPitch = 0; this.bodyRoll = 0;
    this.crashedTimer = 0;
  }
  reset(pose) {
    this.pos.set(pose.x, pose.y + 0.42, pose.z);
    this.vel.set(0, 0, 0); this.yaw = pose.yaw; this.vy = 0;
    this.lastGroundY = null; this.slopeVy = 0; this.yawRate = 0;
    this.damage = 0; this.airTime = 0; this.grounded = true;
    const gi = this.world.sampleGround(this.pos.x, this.pos.z, -1);
    this.trackIdx = gi.idx; this.along = gi.along; this.lat = gi.lat;
    this.pos.y = gi.height + 0.42;
    this.syncMesh(0, true);
  }
  resetToTrack() {
    const s = this.world.sampleAtDist(Math.max(4, this.along - 6));
    this.pos.set(s.x, s.y + 0.5, s.z);
    this.vel.set(0, 0, 0); this.vy = 0;
    this.lastGroundY = null; this.slopeVy = 0; this.yawRate = 0;
    this.yaw = Math.atan2(s.tx, s.tz);
    this.grounded = true;
    this.trackIdx = s.idx;
  }
  get forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }

  /** input: {throttle -1..1, steer -1..1, handbrake} */
  step(dt, input, cfg = {}) {
    const ev = this.events;
    ev.landed = 0; ev.crash = 0; ev.scrape = false; ev.airEnded = 0; ev.nearMisses = null;
    dt = Math.min(dt, 0.05);
    const gripMul = (cfg.gripMul ?? 1) * this.world.gripMul;
    const damageOn = cfg.damage !== false;
    const assist = cfg.assist ?? 0.5;
    const dmgFactor = damageOn ? clamp(1 - this.damage / 160, 0.45, 1) : 1;

    const f = this.forward, r = { x: f.z, z: -f.x };
    let fwd = this.vel.x * f.x + this.vel.z * f.z;
    let latV = this.vel.x * r.x + this.vel.z * r.z;
    const speedAbs = Math.hypot(this.vel.x, this.vel.z);

    if (this.grounded) {
      const topSpeed = 62 * (cfg.topSpeedMul || 1);
      const reverseTop = 11;
      const th = input.throttle;
      // двигатель: тяга падает к максималке; тормоза и задний ход
      if (th > 0) {
        fwd += th * 19 * dmgFactor * clamp(1 - Math.max(0, fwd) / topSpeed, 0, 1) * dt + th * 1.2 * dt;
      } else if (th < 0) {
        if (fwd > 0.6) fwd -= (cfg.abs === false ? 21 : 19) * -th * dt;
        else fwd = Math.max(-reverseTop, fwd + th * 8.5 * dt);
      }
      if (input.handbrake) fwd -= fwd * Math.min(1, 1.15 * dt);
      // уклон дороги тянет машину
      const slopeAhead = (this.world.sampleAtDist(this.along + 5).y - this.world.sampleAtDist(Math.max(0, this.along - 5)).y) / 10;
      fwd -= slopeAhead * 10.5 * dt * Math.sign(fwd || 1) * Math.min(1, Math.abs(fwd) / 4 + 0.25);
      // ---- рулевое: целевая угловая скорость, зависящая от скорости ----
      const spd = Math.abs(fwd);
      const speedFactor = clamp(spd / 6, 0, 1);
      this.steerVis = lerp(this.steerVis, input.steer * 0.5 * (1 - clamp(spd / 70, 0, 0.55)), 1 - Math.exp(-12 * dt));
      const latGripBase = (this.onRoad ? 8.6 : 5.6) * gripMul;
      let latGrip = latGripBase;
      let maxYaw = clamp(2.35 - spd * 0.027, 0.6, 2.35); // рад/с: резко на месте, плавно на скорости
      if (input.handbrake && spd > 5) { latGrip *= 0.2; maxYaw *= 1.22; }
      else if (Math.abs(latV) > 4.2) latGrip *= 0.52; // уже в заносе — легче держать
      if (cfg.traction && !input.handbrake) latGrip *= 1.1;
      latGrip *= (0.78 + assist * 0.5);
      // steer>0 (вправо) -> курс atan2(x,z) убывает; на заднем ходе эффект обратный
      let targetYawRate = -input.steer * maxYaw * clamp(fwd / 5.5, -1, 1) * speedFactor;
      // ассистент: не даём довернуть в разворот, если занос уже большой (контрруление не трогаем)
      const driftNow = spd > 4 ? Math.atan2(Math.abs(latV), spd) : 0;
      if (driftNow > 0.62 && Math.sign(targetYawRate) === Math.sign(this.yawRate || targetYawRate)) {
        targetYawRate *= 1 - clamp((driftNow - 0.62) * 1.5, 0, 0.75) * (0.35 + assist * 0.65);
      }
      this.yawRate = lerp(this.yawRate || 0, targetYawRate, 1 - Math.exp(-9 * dt));
      this.yaw += this.yawRate * dt;
      // гасим боковую скорость сцеплением шин
      latV *= Math.exp(-latGrip * dt);
      // сопротивления: аэродинамика + качение + грунт вне трассы
      fwd -= fwd * Math.abs(fwd) * (this.onRoad ? 0.00047 : 0.0009) * dt;
      fwd -= fwd * (this.onRoad ? 0.045 : 0.55) * dt;
      if (!this.onRoad) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 3.0 * dt);
    } else {
      this.airTime += dt;
      this.yaw -= input.steer * 0.35 * dt; // лёгкая коррекция в прыжке
    }

    // ВАЖНО: пересобираем скорость в ТОМ ЖЕ базисе, в котором раскладывали в начале шага.
    // Скорость живёт в мировом пространстве и отстаёт от повернувшегося носа — отсюда занос.
    this.vel.x = f.x * fwd + r.x * latV;
    this.vel.z = f.z * fwd + r.z * latV;
    // ветер (гроза)
    if (this.world.windVec.lengthSq() > 0.01 && this.grounded) {
      this.vel.x += this.world.windVec.x * dt * 0.35;
      this.vel.z += this.world.windVec.z * dt * 0.35;
    }

    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.x = clamp(this.pos.x, -1350, 1350);
    this.pos.z = clamp(this.pos.z, -1350, 1350);

    const gi = this.world.sampleGround(this.pos.x, this.pos.z, this.trackIdx);
    this.trackIdx = gi.idx; this.along = gi.along; this.lat = gi.lat; this.onRoad = gi.onRoad;
    const groundY = gi.height + 0.42;

    // --- вертикаль: чистая баллистика + наследование скорости рельефа.
    // На гребне земля уходит вниз, а машина по инерции летит дальше — прыжок получается сам.
    const groundVyRaw = dt > 0 ? (groundY - (this.lastGroundY ?? groundY)) / dt : 0;
    this.slopeVy = lerp(this.slopeVy || 0, clamp(groundVyRaw, -32, 32), 0.45);
    this.lastGroundY = groundY;
    this.vy -= 26 * dt;
    const newY = this.pos.y + this.vy * dt;
    if (newY <= groundY) {
      if (!this.grounded) {
        const impact = -this.vy;
        ev.airEnded = this.airTime;
        ev.landed = impact;
        if (impact > 11 && damageOn) { this.damage = clamp(this.damage + (impact - 10) * 2.2, 0, 100); ev.crash = clamp((impact - 10) / 8, 0.2, 1); }
        if (!this.onRoad) { this.vel.x *= 0.93; this.vel.z *= 0.93; }
      }
      this.pos.y = groundY;
      this.vy = this.slopeVy; // едем по рельефу: вертикальная скорость = скорости рельефа
      this.grounded = true;
      this.airTime = 0;
    } else {
      this.pos.y = newY;
      if (newY - groundY > 0.05) {
        if (this.grounded) this.airTime = 0;
        this.grounded = false;
      }
    }

    // столкновения с объектами
    const colliders = this.world.collidersNear ? this.world.collidersNear(this.pos.x, this.pos.z) : [];
    ev.nearMisses = [];
    for (const c of colliders) {
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      const d2 = dx * dx + dz * dz, rr = c.r + 0.95;
      if (d2 < rr * rr && d2 > 0.0001) {
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
        this.pos.x = c.x + nx * rr; this.pos.z = c.z + nz * rr;
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) {
          const bounce = c.type === 'block' ? 0.35 : 0.18;
          this.vel.x -= (1 + bounce) * vn * nx;
          this.vel.z -= (1 + bounce) * vn * nz;
          this.vel.x *= 0.72; this.vel.z *= 0.72;
          const impact = -vn;
          if (impact > 2.5) {
            ev.crash = Math.max(ev.crash, clamp(impact / 16, 0.15, 1));
            if (damageOn && c.type !== 'block') this.damage = clamp(this.damage + impact * 1.1, 0, 100);
            this.yaw += (Math.random() - 0.5) * impact * 0.012;
          } else ev.scrape = true;
          this.crashedTimer = 0.4;
        }
      } else if (d2 < (rr + 1.5) ** 2 && speedAbs > 16 && c.type !== 'block') {
        ev.nearMisses.push(c);
      }
    }

    // производные состояния
    const f2 = this.forward, r2 = { x: f2.z, z: -f2.x };
    this.fwdSpeed = this.vel.x * f2.x + this.vel.z * f2.z;
    this.latSpeed = this.vel.x * r2.x + this.vel.z * r2.z;
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.driftAngle = this.speed > 4 ? Math.atan2(Math.abs(this.latSpeed), Math.abs(this.fwdSpeed)) : 0;
    this.sliding = clamp(Math.abs(this.latSpeed) / 9, 0, 1.4) * (this.grounded ? 1 : 0);
    // обороты/передачи (для звука и HUD)
    const gearTops = [0, 13, 23, 33, 44, 58];
    let gear = 1; while (gear < 5 && Math.abs(this.fwdSpeed) > gearTops[gear]) gear++;
    this.gear = this.fwdSpeed < -0.5 ? 0 : gear; // 0 = R
    const lo = gearTops[gear - 1] || 0, hi = gearTops[gear] || 58;
    const gearPos = clamp((Math.abs(this.fwdSpeed) - lo) / (hi - lo), 0, 1);
    this.rpm = clamp(0.22 + gearPos * 0.72 + Math.max(0, input.throttle) * 0.1 + this.sliding * 0.12, 0, 1.06);
    this.syncMesh(dt);
    return ev;
  }

  syncMesh(dt = 0, snap = false) {
    const m = this.mesh; if (!m) return;
    m.group.position.copy(this.pos);
    // наклон по рельефу + динамика кузова
    const f = this.forward;
    let targetPitch = 0, targetRoll = 0;
    if (this.grounded) {
      const hF = this.world.sampleGround(this.pos.x + f.x * 1.6, this.pos.z + f.z * 1.6, this.trackIdx).height;
      const hB = this.world.sampleGround(this.pos.x - f.x * 1.6, this.pos.z - f.z * 1.6, this.trackIdx).height;
      const hL = this.world.sampleGround(this.pos.x + f.z * 1.2, this.pos.z - f.x * 1.2, this.trackIdx).height;
      const hR = this.world.sampleGround(this.pos.x - f.z * 1.2, this.pos.z + f.x * 1.2, this.trackIdx).height;
      targetPitch = Math.atan2(hB - hF, 3.2);
      targetRoll = Math.atan2(hL - hR, 2.4);
    } else {
      targetPitch = clamp(-this.vy * 0.022, -0.4, 0.4);
    }
    const k = snap ? 1 : 1 - Math.exp(-9 * Math.max(dt, 0.001));
    this.pitch = lerp(this.pitch, targetPitch, k);
    this.roll = lerp(this.roll, targetRoll, k);
    m.group.rotation.set(0, 0, 0);
    m.group.rotation.order = 'YXZ';
    m.group.rotation.y = this.yaw;
    m.group.rotation.x = this.pitch;
    m.group.rotation.z = this.roll;
    // крен кузова от боковой перегрузки и приседание от газа
    const latLoad = clamp(-this.latSpeed * 0.016, -0.09, 0.09);
    this.bodyRoll = lerp(this.bodyRoll, latLoad, k);
    m.body.rotation.z = this.bodyRoll;
    const spinDelta = dt * this.fwdSpeed / 0.36;
    m.animateWheels(-this.steerVis, spinDelta); // правая сторона машины — локальный -X
  }
}

/** ИИ-водитель: ведёт машину по траектории; caution 0..1 — насколько заранее тормозит (зависит от штурмана) */
export function aiInput(sim, world, skill = 1, caution = 1, dt = 0.016) {
  const lookAhead = clamp(6 + sim.speed * 0.85, 8, 42);
  const jitter = Math.sin(performance.now() * 0.0011 + (sim.opts.seed || 0)) * (1 - skill) * 2.2;
  const target = world.sampleAtDist(sim.along + lookAhead);
  const laneTarget = clamp((sim.opts.lane || 0) + jitter - sim.lat * 0.3, -3.2, 3.2); // тянемся к центру дороги
  const tx = target.x + target.tz * laneTarget;
  const tz = target.z - target.tx * laneTarget;
  const dx = tx - sim.pos.x, dz = tz - sim.pos.z;
  const desiredYaw = Math.atan2(dx, dz);
  let dyaw = desiredYaw - sim.yaw;
  while (dyaw > Math.PI) dyaw -= 2 * Math.PI; while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
  // наш steer: + = вправо; yaw растёт против часовой (влево) в трёхмерной СК с forward=(sin,cos)… калибровка:
  const steer = clamp(-dyaw * 1.9 - sim.latSpeed * 0.012, -1, 1);
  // целевая скорость по кривизне впереди
  const curv = world.curvAhead(sim.along + 4, 26 + sim.speed * 1.15 * caution);
  const cornerSpeed = (curv < 0.0012 ? 56 : clamp(Math.sqrt(11.5 * (0.75 + caution * 0.45) / curv), 9, 56)) * Math.sqrt(world.gripMul || 1);
  const targetSpeed = cornerSpeed * skill;
  let throttle = 0;
  if (sim.fwdSpeed < targetSpeed - 1.5) throttle = 1;
  else if (sim.fwdSpeed > targetSpeed + 2.5) throttle = -clamp((sim.fwdSpeed - targetSpeed) / 9, 0.25, 1);
  else throttle = 0.25;
  // если сильно вылетел с трассы — не газуем в стену
  if (Math.abs(sim.lat) > 16 && sim.fwdSpeed > 14) throttle = Math.min(throttle, 0);
  const handbrake = Math.abs(dyaw) > 0.75 && sim.speed > 13 && Math.random() < 0.5;
  // застревание: задний ход
  if (sim.speed < 1.2 && sim.grounded) {
    sim._stuckT = (sim._stuckT || 0) + dt;
    if (sim._stuckT > 1.4) { if (sim._stuckT < 3.2) return { throttle: -1, steer: -steer, handbrake: false, targetSpeed }; sim.resetToTrack(); sim._stuckT = 0; }
  } else sim._stuckT = 0;
  return { throttle, steer, handbrake, targetSpeed };
}
