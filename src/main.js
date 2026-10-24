import * as THREE from 'three';

/* ================= DATA ================= */
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>a+Math.random()*(b-a);
const randi=(a,b)=>Math.floor(rand(a,b+1));
const choice=a=>a[Math.floor(Math.random()*a.length)];
const dist2=(a,b)=>{const x=a.x-b.x,z=a.z-b.z;return x*x+z*z};

const CLASSES={
  assault:{id:'assault',icon:'🔫',name:'ШТУРМОВИК',char:'Рекс «Волк»',color:0x22d3ee,css:'#22d3ee',hp:130,speed:6.4,weapon:'Винтовка «Импульс»',dmg:34,mag:30,rate:118,auto:true,reload:1.25,spread:.012,desc:'Сбалансированный боец. Способность: СТИМ — скорость и темп огня.',ability:'СТИМ',abilityCd:14,stats:{ОГОНЬ:8,БРОНЯ:6,СКОРОСТЬ:6,ВЫЖИВ:7}},
  medic:{id:'medic',icon:'💉',name:'МЕДИК',char:'Мила «Ангел»',color:0x4ade80,css:'#4ade80',hp:105,speed:6.7,weapon:'ПП «Скальпель»',dmg:21,mag:42,rate:82,auto:true,reload:1.0,spread:.02,desc:'Быстрый ПП и лечение отряда. Способность: МЕД-НОВА — +55 HP себе и союзникам рядом.',ability:'МЕД-НОВА',abilityCd:16,stats:{ОГОНЬ:6,БРОНЯ:4,СКОРОСТЬ:7,ВЫЖИВ:9}},
  heavy:{id:'heavy',icon:'💪',name:'ТЯЖЁЛЫЙ',char:'Гром «Стена»',color:0xfacc15,css:'#facc15',hp:210,speed:5.2,weapon:'Дробовик «Громобой»',dmg:13,pellets:8,mag:6,rate:780,auto:false,reload:2.0,spread:.07,desc:'Танк с дробовиком. Способность: ЭНЕРГОЩИТ — 120 ед. щита на 7 сек.',ability:'ЭНЕРГОЩИТ',abilityCd:18,stats:{ОГОНЬ:10,БРОНЯ:10,СКОРОСТЬ:3,ВЫЖИВ:10}},
  scout:{id:'scout',icon:'🎯',name:'РАЗВЕДЧИК',char:'Призрак «Тень»',color:0xe879f9,css:'#e879f9',hp:90,speed:7.8,weapon:'ДМР «Игла»',dmg:95,mag:10,rate:330,auto:false,reload:1.4,spread:.002,desc:'Скорость и огромный урон в голову. Способность: РЫВОК — мгновенный бросок вперёд.',ability:'РЫВОК',abilityCd:8,stats:{ОГОНЬ:9,БРОНЯ:3,СКОРОСТЬ:10,ВЫЖИВ:4}},
};
const BOT_POOL=[['Кобра','scout'],['Док','medic'],['Бастион','heavy'],['Вектор','assault'],['Nova','medic'],['Тайфун','heavy'],['Фантом','scout'],['Спарк','assault']];
const CHATTER=['Вижу стаю слева!','Держим центр, не расходимся!','Босс скоро выйдет, готовьте гранаты!','Мне нужны патроны… шучу, их бесконечно.','Хороший выстрел!','Черти с севера!','Не дайте плевакам вас достать!','Я прикрываю!','Волна почти зачищена!','Голосовой канал чистый, слышу вас отлично.'];
const ENEMY_TYPES={
  zombie:{hp:90,speed:2.5,dmg:12,score:100,scale:1,color:0x65a30d,headColor:0xa3e635,name:'Зомби'},
  runner:{hp:55,speed:5.6,dmg:9,score:150,scale:.85,color:0xdc2626,headColor:0xfca5a5,name:'Чёрт-бегун'},
  spitter:{hp:70,speed:2.2,dmg:10,score:200,scale:.95,color:0x9333ea,headColor:0xd8b4fe,name:'Плевак',ranged:true},
  brute:{hp:420,speed:1.7,dmg:26,score:400,scale:1.8,color:0x57534e,headColor:0xfacc15,name:'Брут'},
  boss:{hp:2600,speed:2.1,dmg:35,score:5000,scale:3.1,color:0x881337,headColor:0xfb7185,name:'РАЗРУШИТЕЛЬ'},
};

/* ================= AUDIO (procedural) ================= */
let audioCtx=null, soundOn=true;
function ac(){ if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==='suspended')audioCtx.resume(); return audioCtx; }
function tone(f,d=.08,type='square',vol=.12,slide=0){ if(!soundOn)return; try{const c=ac(),o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(f,c.currentTime);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,f+slide),c.currentTime+d);g.gain.setValueAtTime(vol,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+d);o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+d);}catch(e){} }
function noise(d=.12,vol=.2,fc=1200){ if(!soundOn)return; try{const c=ac(),len=c.sampleRate*d,buf=c.createBuffer(1,len,c.sampleRate),data=buf.getChannelData(0);for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*(1-i/len);const s=c.createBufferSource();s.buffer=buf;const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=fc;const g=c.createGain();g.gain.value=vol;s.connect(f).connect(g).connect(c.destination);s.start();}catch(e){} }
const sfx={ shoot(){noise(.07,.16,2600);tone(160,.05,'square',.05,-90)}, shotgun(){noise(.22,.3,900);tone(80,.15,'sawtooth',.12,-40)}, sniper(){noise(.18,.26,3200);tone(300,.12,'square',.08,-220)}, hit(){tone(720,.04,'square',.06)}, kill(){tone(220,.12,'sawtooth',.1,-140);noise(.1,.12,600)}, head(){tone(1100,.07,'square',.09,300)}, hurt(){tone(110,.18,'sawtooth',.14,-50)}, reload(){tone(340,.06,'square',.07);setTimeout(()=>tone(520,.06,'square',.07),160)}, empty(){tone(900,.04,'square',.05)}, boom(){noise(.5,.4,300);tone(55,.45,'sine',.3,-20)}, wave(){tone(196,.3,'sawtooth',.12);setTimeout(()=>tone(294,.35,'sawtooth',.12),180)}, pickup(){tone(660,.08,'sine',.1,300)}, ability(){tone(520,.15,'sine',.12,420)}, groan(){tone(rand(70,130),.28,'sawtooth',.035,rand(-30,30))}, ui(){tone(600,.05,'sine',.06)} };

/* ================= STATE ================= */
const S={screen:'menu',playing:false,paused:false,over:false,playerName:'Игрок-1',cls:'assault',ready:false,room:'SIM-'+randi(1000,9999),
 hp:130,maxHp:130,shield:0,score:0,kills:0,heads:0,shots:0,hits:0,wave:0,toSpawn:0,spawnTimer:0,waveState:'idle',interTimer:0,
 ammo:30,reserve:Infinity,grenades:3,reloading:false,reloadT:0,lastShot:0,abilityCd:0,stimT:0,shieldT:0,combo:0,comboT:0,
 yaw:0,pitch:0,vel:new THREE.Vector3(),onGround:true,shake:0,bobT:0,keys:{},fireHeld:false,micOn:false,micLevel:0,talking:false,openMic:false,ptt:false,muted:false,startedAt:0};
let lobbyPlayers=[]; // {name, cls, bot, ping, ready, talking}

/* ================= THREE SETUP ================= */
const canvas=$('gameCanvas');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));
renderer.setSize(innerWidth,innerHeight);
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x070812);
scene.fog=new THREE.Fog(0x070812,25,95);
const camera=new THREE.PerspectiveCamera(78,innerWidth/innerHeight,.1,200);
camera.position.set(0,1.7,10);
scene.add(new THREE.AmbientLight(0x8899ff,.75));
const moon=new THREE.DirectionalLight(0x22d3ee,1.4); moon.position.set(10,24,8); scene.add(moon);
const magLight=new THREE.PointLight(0xe879f9,30,45); magLight.position.set(-12,6,-12); scene.add(magLight);
const muzzleLight=new THREE.PointLight(0xffcc66,0,12); scene.add(muzzleLight);

const obstacles=[]; // {x,z,w,d,h,mesh}
function addBox(x,z,w,d,h,color,emissive=0x000000){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.75,metalness:.25,emissive,emissiveIntensity:.7}));
  m.position.set(x,h/2,z); scene.add(m); obstacles.push({x,z,w,d,h,mesh:m});
  const edge=new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),new THREE.LineBasicMaterial({color:0x22d3ee,transparent:true,opacity:.35}));
  edge.position.copy(m.position); scene.add(edge); return m;
}
function buildMap(){
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(90,90),new THREE.MeshStandardMaterial({color:0x0b1026,roughness:.9}));
  floor.rotation.x=-Math.PI/2; scene.add(floor);
  const grid=new THREE.GridHelper(90,45,0x22d3ee,0x25306b); grid.position.y=.02; grid.material.transparent=true; grid.material.opacity=.5; scene.add(grid);
  // border walls (visual + collision via bounds)
  const wallMat={color:0x111936,emissive:0x0e7490};
  [[0,-32,64,1,4],[0,32,64,1,4],[-32,0,1,64,4],[32,0,1,64,4]].forEach(([x,z,w,d,h])=>addBox(x,z,w,d,h,wallMat.color,wallMat.emissive));
  addBox(-10,-8,6,3,2.2,0x1e293b,0x164e63); addBox(11,6,7,3,2.2,0x1e293b,0x701a75);
  addBox(-14,12,4,6,3,0x1e293b,0x164e63); addBox(15,-14,4,6,3,0x1e293b,0x701a75);
  addBox(0,-18,8,3,1.4,0x334155,0x0e7490); addBox(0,20,8,3,1.4,0x334155,0xe879f9);
  addBox(-22,-20,3,3,5,0x0f172a,0x22d3ee); addBox(22,20,3,3,5,0x0f172a,0xe879f9);
  addBox(20,-4,3,3,4,0x0f172a,0x22d3ee); addBox(-20,4,3,3,4,0x0f172a,0xe879f9);
  addBox(6,-2,3,8,1.2,0x334155,0x164e63); addBox(-6,16,8,3,1.2,0x334155,0x164e63);
  // floating sim cubes
  for(let i=0;i<26;i++){const c=new THREE.Mesh(new THREE.BoxGeometry(rand(.5,1.6),rand(.5,1.6),rand(.5,1.6)),new THREE.MeshStandardMaterial({color:0x0f172a,emissive:Math.random()<.5?0x22d3ee:0xe879f9,emissiveIntensity:.9,transparent:true,opacity:.85}));
    c.position.set(rand(-28,28),rand(5,13),rand(-28,28)); c.userData.float=true; scene.add(c); floaters.push(c);}
  // spawn portals
  [[0,-30],[0,30],[-30,0],[30,0]].forEach(([x,z])=>{const p=new THREE.Mesh(new THREE.TorusGeometry(2.4,.16,10,28),new THREE.MeshBasicMaterial({color:0xe879f9}));p.position.set(x,2.6,z);p.lookAt(0,2.6,0);scene.add(p);portals.push(p);spawnPoints.push(new THREE.Vector3(x*.92,0,z*.92));});
}
const floaters=[],portals=[],spawnPoints=[];
buildMap();

/* ---- weapon viewmodel ---- */
const gun=new THREE.Group(); camera.add(gun); scene.add(camera); gun.position.set(.34,-.34,-.65);
let gunParts={};
function buildGun(clsId){
  while(gun.children.length)gun.remove(gun.children[0]);
  const c=CLASSES[clsId], mat=new THREE.MeshStandardMaterial({color:0x1f2937,roughness:.4,metalness:.7}), acc=new THREE.MeshStandardMaterial({color:c.color,emissive:c.color,emissiveIntensity:1.4});
  const body=new THREE.Mesh(new THREE.BoxGeometry(.13,.18,.62),mat); gun.add(body);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,clsId==='scout'?.7:.42,8),mat); barrel.rotation.x=Math.PI/2; barrel.position.set(0,.05,-.5); gun.add(barrel);
  const mag=new THREE.Mesh(new THREE.BoxGeometry(.09,.22,.13),mat); mag.position.set(0,-.18,.02); mag.rotation.x=.2; gun.add(mag);
  const glow=new THREE.Mesh(new THREE.BoxGeometry(.145,.05,.3),acc); glow.position.set(0,.03,-.08); gun.add(glow);
  const sight=new THREE.Mesh(new THREE.BoxGeometry(.04,.09,.04),acc); sight.position.set(0,.15,-.15); gun.add(sight);
  if(clsId==='heavy'){const pump=new THREE.Mesh(new THREE.BoxGeometry(.15,.1,.2),acc);pump.position.set(0,-.02,-.35);gun.add(pump);}
  gunParts={glow};
  const flash=new THREE.Mesh(new THREE.PlaneGeometry(.34,.34),new THREE.MeshBasicMaterial({color:0xffd166,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));
  flash.position.set(0,.05,clsId==='scout'?-.9:-.75); flash.name='flash'; gun.add(flash); gunParts.flash=flash;
}
buildGun('assault');

/* ---- particles (single Points pool) ---- */
const PMAX=900, pGeo=new THREE.BufferGeometry();
const pPos=new Float32Array(PMAX*3), pCol=new Float32Array(PMAX*3);
pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3)); pGeo.setAttribute('color',new THREE.BufferAttribute(pCol,3));
const points=new THREE.Points(pGeo,new THREE.PointsMaterial({size:.16,vertexColors:true,transparent:true,opacity:.95,depthWrite:false})); points.frustumCulled=false; scene.add(points);
const parts=[]; for(let i=0;i<PMAX;i++)parts.push({life:0,x:0,y:-99,z:0,vx:0,vy:0,vz:0,r:1,g:1,b:1});
let pCursor=0;
function spawnParticles(pos,color,count=10,speed=4,up=2,life=.55){
  const col=new THREE.Color(color);
  for(let n=0;n<count;n++){const p=parts[pCursor];pCursor=(pCursor+1)%PMAX;
    p.life=rand(life*.5,life);p.maxLife=p.life;p.x=pos.x;p.y=pos.y;p.z=pos.z;
    const a=rand(0,Math.PI*2),s=rand(.3,1)*speed;p.vx=Math.cos(a)*s;p.vz=Math.sin(a)*s;p.vy=rand(0,up);
    p.r=col.r;p.g=col.g;p.b=col.b;}
}
function updateParticles(dt){
  for(let i=0;i<PMAX;i++){const p=parts[i];
    if(p.life>0){p.life-=dt;p.vy-=6*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(p.y<.05){p.y=.05;p.vy*=.4;}
      pPos[i*3]=p.x;pPos[i*3+1]=p.y;pPos[i*3+2]=p.z;const f=Math.max(0,p.life/(p.maxLife||.5));pCol[i*3]=p.r*f;pCol[i*3+1]=p.g*f;pCol[i*3+2]=p.b*f;}
    else{pPos[i*3+1]=-99;}}
  pGeo.attributes.position.needsUpdate=true;pGeo.attributes.color.needsUpdate=true;
}
/* ---- tracers pool ---- */
const tracers=[];
for(let i=0;i<28;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.02,.02,1),new THREE.MeshBasicMaterial({color:0xa5f3fc,transparent:true,opacity:0}));m.visible=false;scene.add(m);tracers.push({m,life:0});}
function tracer(from,to,color=0xa5f3fc){const t=tracers.find(t=>t.life<=0)||tracers[0];const d=from.distanceTo(to);t.m.visible=true;t.m.material.color.set(color);t.m.material.opacity=.9;t.life=.07;
  t.m.position.copy(from).lerp(to,.5);t.m.scale.z=Math.max(.1,d);t.m.lookAt(to);}
/* ---- floating damage numbers ---- */
const dmgPool=[];for(let i=0;i<22;i++){const d=document.createElement('div');d.className='dmgNum';d.style.display='none';$('damageNumbers').appendChild(d);dmgPool.push(d);}
function dmgNum(worldPos,text,cls=''){const d=dmgPool.find(x=>x.style.display==='none')||dmgPool[0];const v=worldPos.clone().project(camera);if(v.z>1)return;
  d.className='dmgNum '+cls;d.textContent=text;d.style.left=((v.x*.5+.5)*innerWidth+rand(-14,14))+'px';d.style.top=((-v.y*.5+.5)*innerHeight)+'px';d.style.display='block';
  d.style.animation='none';void d.offsetWidth;d.style.animation='';setTimeout(()=>d.style.display='none',700);}

/* ================= ENTITIES ================= */
const enemies=[],bots=[],projectiles=[],pickups=[],grenadeObjs=[];
function makeLabel(text,color='#fff'){const cv=document.createElement('canvas');cv.width=256;cv.height=56;const x=cv.getContext('2d');x.font='bold 26px sans-serif';x.textAlign='center';x.fillStyle=color;x.shadowColor='#000';x.shadowBlur=6;x.fillText(text,128,36);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthWrite:false}));sp.scale.set(2.4,.52,1);return sp;}
function buildEnemyMesh(type){
  const t=ENEMY_TYPES[type],g=new THREE.Group(),s=t.scale;
  const mat=new THREE.MeshStandardMaterial({color:t.color,roughness:.8,emissive:t.color,emissiveIntensity:.12});
  const body=new THREE.Mesh(new THREE.BoxGeometry(.62*s,0.95*s,.36*s),mat);body.position.y=.95*s;g.add(body);
  const head=new THREE.Mesh(new THREE.BoxGeometry(.4*s,.42*s,.4*s),new THREE.MeshStandardMaterial({color:t.headColor,roughness:.6,emissive:t.headColor,emissiveIntensity:.25}));head.position.y=1.68*s;g.add(head);
  const eye=new THREE.Mesh(new THREE.BoxGeometry(.3*s,.06*s,.02*s),new THREE.MeshBasicMaterial({color:type==='boss'?0xff0000:0x000000}));eye.position.set(0,1.72*s,.21*s);g.add(eye);
  [-1,1].forEach(side=>{const arm=new THREE.Mesh(new THREE.BoxGeometry(.16*s,.75*s,.16*s),mat);arm.position.set(.42*s*side,1.05*s,.12*s);arm.rotation.x=-.7;g.add(arm);
    const leg=new THREE.Mesh(new THREE.BoxGeometry(.2*s,.55*s,.2*s),mat);leg.position.set(.17*s*side,.28*s,0);g.add(leg);});
  if(type==='boss'){const crown=new THREE.Mesh(new THREE.ConeGeometry(.5*s,.8*s,6),new THREE.MeshBasicMaterial({color:0xfacc15}));crown.position.y=2.15*s;g.add(crown);}
  head.userData.part='head';body.userData.part='body';
  return {g,head,body,mat};
}
function collide(pos,r){
  pos.x=clamp(pos.x,-30.5,30.5);pos.z=clamp(pos.z,-30.5,30.5);
  for(const o of obstacles){if(o.h<1)continue;const dx=Math.max(Math.abs(pos.x-o.x)-o.w/2,0),dz=Math.max(Math.abs(pos.z-o.z)-o.d/2,0);
    if(dx*dx+dz*dz<r*r){const px=(o.w/2+r)-Math.abs(pos.x-o.x),pz=(o.d/2+r)-Math.abs(pos.z-o.z);
      if(px<pz)pos.x=o.x+Math.sign(pos.x-o.x||1)*(o.w/2+r);else pos.z=o.z+Math.sign(pos.z-o.z||1)*(o.d/2+r);}}
}
function spawnEnemy(forceType){
  const w=S.wave;let type=forceType;
  if(!type){const roll=Math.random();
    if(w>=3&&roll<.10)type='brute';else if(w>=2&&roll<.28)type='spitter';else if(w>=2&&roll<.55)type='runner';else type='zombie';}
  const t=ENEMY_TYPES[type],sp=choice(spawnPoints).clone();sp.x+=rand(-2,2);sp.z+=rand(-2,2);
  const {g,head,body,mat}=buildEnemyMesh(type);g.position.copy(sp);scene.add(g);
  const hpScale=1+(S.wave-1)*.13;
  const e={type,g,head,body,mat,hp:t.hp*hpScale,maxHp:t.hp*hpScale,speed:t.speed*rand(.85,1.15),dmg:t.dmg,score:t.score,attackCd:0,spitCd:rand(1,2.4),flash:0,phase:rand(0,6),dead:false,isBoss:type==='boss',chargeCd:3,charging:0,summonCd:8};
  head.userData.enemy=e;body.userData.enemy=e;enemies.push(e);
  spawnParticles(sp.clone().setY(1.4),0xe879f9,14,3,3,.6);
  if(e.isBoss){$('bossBarWrap').classList.remove('hidden');showBanner('☠ РАЗРУШИТЕЛЬ ☠','Босс симуляции! Цельтесь в голову!');sfx.wave();}
  return e;
}
function spawnBotMesh(name,clsId){
  const c=CLASSES[clsId],g=new THREE.Group();
  const mat=new THREE.MeshStandardMaterial({color:c.color,roughness:.6,emissive:c.color,emissiveIntensity:.3});
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.34,.75,4,10),mat);body.position.y=1.05;g.add(body);
  const visor=new THREE.Mesh(new THREE.BoxGeometry(.42,.16,.1),new THREE.MeshBasicMaterial({color:0x0ea5e9}));visor.position.set(0,1.62,.3);g.add(visor);
  const bgun=new THREE.Mesh(new THREE.BoxGeometry(.09,.12,.55),new THREE.MeshStandardMaterial({color:0x1f2937}));bgun.position.set(.3,1.15,.25);g.add(bgun);
  const label=makeLabel(name+ ' · '+c.name,c.css);label.position.y=2.35;g.add(label);scene.add(g);
  return g;
}
function makePickup(pos,kind){
  const colors={health:0x4ade80,grenade:0xfb923c,shield:0x38bdf8};
  const m=new THREE.Mesh(new THREE.OctahedronGeometry(.32),new THREE.MeshStandardMaterial({color:colors[kind],emissive:colors[kind],emissiveIntensity:1.6}));
  m.position.copy(pos).setY(.8);scene.add(m);pickups.push({m,kind,t:0});
}

/* ================= LOBBY ================= */
function renderClasses(){
  $('classCards').innerHTML=Object.values(CLASSES).map(c=>`<div class="classCard ${S.cls===c.id?'sel':''}" data-cls="${c.id}">
    <div class="cIcon">${c.icon}</div><h4 style="color:${c.css}">${c.name}</h4><div class="charName">${c.char}</div><p>${c.weapon} · HP ${c.hp}</p>
    ${Object.entries(c.stats).map(([k,v])=>`<div class="statRow"><span style="width:52px">${k}</span><div class="barBg"><div class="barFill" style="width:${v*10}%;background:${c.css}"></div></div><b>${v}</b></div>`).join('')}</div>`).join('');
  document.querySelectorAll('.classCard').forEach(el=>el.onclick=()=>{S.cls=el.dataset.cls;sfx.ui();renderClasses();buildGun(S.cls);renderSlots();});
  const c=CLASSES[S.cls];
  $('classDetail').innerHTML=`<b style="color:${c.css}">${c.icon} ${c.name} — ${c.char}</b><br/>${c.desc}<br/><span class="dim">Оружие: ${c.weapon} · урон ${c.dmg}${c.pellets?'×'+c.pellets:''} · магазин ${c.mag} · способность [Q]: ${c.ability} (перезарядка ${c.abilityCd}с)</span>`;
}
function renderSlots(){
  const me={name:S.playerName,cls:S.cls,bot:false,ping:18,ready:S.ready,talking:S.talking};
  const list=[me,...lobbyPlayers];
  let html='';
  for(let i=0;i<6;i++){const p=list[i];
    if(!p)html+=`<div class="slot empty"><div class="avatar">➕</div><div><div class="sName">Свободный слот</div><div class="sMeta">ожидание игрока…</div></div></div>`;
    else{const c=CLASSES[p.cls];html+=`<div class="slot"><div class="avatar" style="background:${c.css}33;border:1px solid ${c.css}">${c.icon}</div>
      <div><div class="sName">${p.name}${p.bot?' <span class="dim" style="font-size:10px">ИИ</span>':''}</div><div class="sMeta">${c.name} · ${p.bot?'локальный ИИ':'пинг '+p.ping+' мс'}</div></div>
      ${p.ready?'<span class="readyTag">ГОТОВ</span>':''}<span class="micDot ${p.talking?'talking':''}">🎙️</span></div>`;}}
  $('slots').innerHTML=html;$('slotCount').textContent=list.length+'/6';
}
function voiceLog(text,who='sys',name=''){
  const el=$('voiceLog');if(!el)return;const d=document.createElement('div');d.className=who==='me'?'vlMe':who==='bot'?'vlBot':'vlSys';
  d.textContent=(who==='sys'?'':(name?name+': ':'🎙 Вы: '))+text;el.appendChild(d);el.scrollTop=el.scrollHeight;
  while(el.children.length>24)el.removeChild(el.firstChild);
}
function setupLobby(){
  S.playerName=$('playerName').value.trim()||'Игрок-1';S.ready=false;$('readyBtn').classList.remove('readyOn');$('readyBtn').textContent='✓ ГОТОВ';$('startBtn').classList.add('hidden');
  lobbyPlayers=[];renderClasses();renderSlots();
  // simulated network players + bots trickle in
  const pool=[...BOT_POOL].sort(()=>Math.random()-.5);let idx=0;
  const timer=setInterval(()=>{ if(S.screen!=='lobby'){clearInterval(timer);return;}
    if(lobbyPlayers.length>=3||idx>=pool.length){clearInterval(timer);return;}
    const [name,cls]=pool[idx++];const isBot=lobbyPlayers.length>=2;
    lobbyPlayers.push({name,cls,bot:isBot,ping:randi(19,86),ready:true,talking:false});
    voiceLog(`${name} вошёл в комнату`,'sys');tone(740,.07,'sine',.05);renderSlots();
  },1400);
}
$('fillBots').onchange=()=>{ // refill bot slots instantly for display
  if($('fillBots').checked){const pool=[...BOT_POOL].sort(()=>Math.random()-.5);
    while(lobbyPlayers.length<5){const [name,cls]=pool[lobbyPlayers.length%pool.length];if(lobbyPlayers.some(p=>p.name===name))break;lobbyPlayers.push({name,cls,bot:true,ping:0,ready:true,talking:false});}}
  else lobbyPlayers=lobbyPlayers.filter(p=>!p.bot);
  renderSlots();
};

/* ================= MIC / VOICE ================= */
let micStream=null,analyser=null,micData=null,recognition=null;
async function enableMic(fromPause=false){
  if(micStream){toast('🎙️ Микрофон уже включён');return;}
  try{
    micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
    const ctx=ac();const src=ctx.createMediaStreamSource(micStream);analyser=ctx.createAnalyser();analyser.fftSize=512;src.connect(analyser);micData=new Uint8Array(analyser.frequencyBinCount);
    S.micOn=true;$('micStatus').textContent='подключён ✓ говорите…';$('micBtn').textContent='🎙️ Микрофон включён ✓';
    toast('🎙️ Микрофон подключён! Удерживайте V, чтобы говорить в игре.');
    voiceLog('микрофон подключён','sys');startVoiceCommands();
  }catch(e){ $('micStatus').textContent='доступ запрещён — проверьте разрешения браузера';toast('⚠️ Нет доступа к микрофону. Разрешите его в браузере.'); }
}
function updateMic(){
  let level=0;
  if(analyser&&micData){analyser.getByteFrequencyData(micData);let sum=0;for(let i=0;i<40;i++)sum+=micData[i];level=clamp(sum/40/140,0,1);}
  S.micLevel=level;
  const canTalk=S.micOn&&!S.muted&&(S.openMic||S.ptt);
  S.talking=canTalk&&level>.16;
  $('micTestFill').style.width=(level*100)+'%';
  $('micMeterFill').style.width=(level*100)+'%';
  $('micState').textContent=!S.micOn?'МИКРОФОН ВЫКЛ':S.muted?'ЗАГЛУШЁН (M)':S.talking?'🔴 В ЭФИРЕ':S.openMic?'ОТКРЫТЫЙ МИКРОФОН':'ДЕРЖИТЕ V';
  $('voiceHud').classList.toggle('talking',S.talking);
  $('micIcon').textContent=S.talking?'🔴':S.micOn?'🎙️':'🔇';
}
function startVoiceCommands(){
  if(!$('voiceCmds').checked)return;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){voiceLog('голосовые команды: браузер не поддерживает распознавание речи','sys');return;}
  try{recognition=new SR();recognition.lang='ru-RU';recognition.continuous=true;recognition.interimResults=false;
    recognition.onresult=e=>{const txt=e.results[e.results.length-1][0].transcript.toLowerCase().trim();onVoiceCommand(txt);};
    recognition.onend=()=>{if(S.micOn&&$('voiceCmds').checked){try{recognition.start()}catch(e){}}};
    recognition.start();voiceLog('голосовые команды активны: «граната», «лечи», «перезарядка»','sys');
  }catch(e){}
}
function onVoiceCommand(txt){
  if(S.screen!=='game')return;
  showVoiceToast('🎙️ «'+txt+'»');
  if(/гранат/.test(txt))throwGrenade();
  else if(/леч|помощ|медик|аптеч/.test(txt))useAbility();
  else if(/перезаряд/.test(txt))startReload();
  else if(/огонь|стреля/.test(txt)){S.fireHeld=true;setTimeout(()=>S.fireHeld=false,700);}
  voiceLog(txt,'me');
}
function showVoiceToast(t){const el=$('voiceToast');el.textContent=t;el.classList.remove('hidden');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.add('hidden'),2200);}
let toastT=null;
function toast(t){const el=$('toast');el.textContent=t;el.classList.remove('hidden');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.add('hidden'),3400);}

/* ================= GAME FLOW ================= */
function showScreen(name){
  S.screen=name;
  ['menuScreen','lobbyScreen','pauseScreen','overScreen','howScreen'].forEach(id=>$(id).classList.add('hidden'));
  $('hud').classList.toggle('hidden',name!=='game'&&name!=='pause');
  if(name==='menu'){$('menuScreen').classList.remove('hidden');renderScores($('menuScoresBody'));}
  if(name==='lobby'){$('lobbyScreen').classList.remove('hidden');setupLobby();}
  if(name==='pause')$('pauseScreen').classList.remove('hidden');
  if(name==='over')$('overScreen').classList.remove('hidden');
  if(name==='game'){}
}
function startGame(){
  const c=CLASSES[S.cls];
  Object.assign(S,{playing:true,paused:false,over:false,hp:c.hp,maxHp:c.hp,shield:0,score:0,kills:0,heads:0,shots:0,hits:0,wave:0,ammo:c.mag,grenades:3,abilityCd:0,stimT:0,shieldT:0,combo:0,reloading:false,waveState:'idle',interTimer:1.2,startedAt:Date.now()});
  camera.position.set(0,1.7,14);S.yaw=0;S.pitch=0;S.vel.set(0,0,0);
  // clear old
  enemies.forEach(e=>scene.remove(e.g));enemies.length=0;
  bots.forEach(b=>scene.remove(b.g));bots.length=0;
  pickups.forEach(p=>scene.remove(p.m));pickups.length=0;
  projectiles.forEach(p=>scene.remove(p.m));projectiles.length=0;
  grenadeObjs.forEach(p=>scene.remove(p.m));grenadeObjs.length=0;
  $('bossBarWrap').classList.add('hidden');
  // bots from lobby
  const squad=$('fillBots').checked?lobbyPlayers:lobbyPlayers.filter(p=>!p.bot);
  squad.slice(0,5).forEach((p,i)=>{const a=(i+1)/ (squad.length+1)*Math.PI*2;
    const g=spawnBotMesh(p.name,p.cls);g.position.set(Math.cos(a)*4,0,12+Math.sin(a)*3);
    bots.push({name:p.name,cls:p.cls,g,hp:CLASSES[p.cls].hp,maxHp:CLASSES[p.cls].hp,fireCd:rand(.3,1),strafe:rand(0,6),dead:false,healCd:5});});
  buildGun(S.cls);buildTeamPanel();updateWeaponHud();updateHpHud();
  showScreen('game');$('hud').classList.remove('hidden');
  if('ontouchstart'in window)$('touchControls').classList.remove('hidden');
  showBanner('УРОВЕНЬ 01','НЕОНОВЫЙ ПОЛИГОН · удержите симуляцию!');
  voiceLog('Симуляция запущена. Удачи, отряд!','sys');
  canvas.requestPointerLock&&!('ontouchstart'in window)&&canvas.requestPointerLock();
}
function nextWave(){
  S.wave++;S.toSpawn=7+S.wave*3+(S.wave%5===0?4:0);S.spawnTimer=0;S.waveState='spawning';
  if(S.wave%5===0){spawnEnemy('boss');S.toSpawn=Math.max(4,S.toSpawn-6);showBanner('ВОЛНА '+S.wave+' — БОСС','Разрушитель в симуляции!');}
  else showBanner('ВОЛНА '+S.wave,S.wave===1?'Зомби уже идут. Цельтесь в голову!':choice(['Они злятся…','Держите периметр!','Новая стая в порталах!','Не дайте им окружить вас!']));
  sfx.wave();$('waveNum').textContent=S.wave;addScore(0); // refresh
}
function showBanner(t,sub){$('waveBannerTitle').textContent=t;$('waveBannerSub').textContent=sub;const b=$('waveBanner');b.classList.remove('hidden');b.style.animation='none';void b.offsetWidth;b.style.animation='';clearTimeout(b._t);b._t=setTimeout(()=>b.classList.add('hidden'),2600);}
function centerMsg(t,ms=2200){const el=$('centerMsg');el.textContent=t;el.classList.remove('hidden');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.add('hidden'),ms);}
function endGame(){
  S.playing=false;S.over=true;document.exitPointerLock&&document.exitPointerLock();
  $('stScore').textContent=S.score;$('stWave').textContent=S.wave;$('stKills').textContent=S.kills;$('stHead').textContent=S.heads;
  $('stAcc').textContent=(S.shots?Math.round(S.hits/S.shots*100):0)+'%';
  $('overSub').textContent=`${S.playerName} · ${CLASSES[S.cls].name} · полигон захвачен на волне ${S.wave}`;
  saveScore();showScreen('over');renderScores($('overScoresBody'),true);
  tone(160,0.6,'sawtooth',.15,-100);
}
function pauseGame(){if(!S.playing||S.over)return;S.paused=true;document.exitPointerLock&&document.exitPointerLock();showScreen('pause');$('hud').classList.remove('hidden');}
function resumeGame(){S.paused=false;showScreen('game');if(!('ontouchstart'in window))canvas.requestPointerLock();}

/* highscores */
function getScores(){try{return JSON.parse(localStorage.getItem('protocol6_scores')||'[]')}catch(e){return[]}}
function saveScore(){const arr=getScores();arr.push({name:S.playerName,cls:CLASSES[S.cls].name,wave:S.wave,score:S.score,date:Date.now(),me:true});arr.sort((a,b)=>b.score-a.score);localStorage.setItem('protocol6_scores',JSON.stringify(arr.slice(0,10)));}
function renderScores(tbody,markLast=false){const arr=getScores();const last=arr.length-1;
  tbody.innerHTML=arr.length?arr.map((s,i)=>`<tr class="${markLast&&i===arr.findIndex(x=>x.me)?'me':''}"><td>${i+1}</td><td>${s.name}</td><td>${s.cls}</td><td>${s.wave}</td><td><b>${s.score}</b></td></tr>`).join(''):'<tr><td colspan="5" class="dim">Пока пусто — станьте первым!</td></tr>';}

/* ================= COMBAT ================= */
const raycaster=new THREE.Raycaster();
function addScore(base,killerName){
  if(base>0){S.combo++;S.comboT=4;const mult=1+Math.min(4,S.combo>=20?4:S.combo>=12?3:S.combo>=6?2:S.combo>=3?1:0)*0.5;S.score+=Math.round(base*mult);}
  $('scoreVal').textContent=S.score;$('comboVal').textContent=S.combo>=3?`🔥 СЕРИЯ ×${S.combo}`:'';
}
function killFeed(t){const d=document.createElement('div');d.textContent=t;$('killFeed').appendChild(d);setTimeout(()=>d.remove(),4100);while($('killFeed').children.length>5)$('killFeed').firstChild.remove();}
function shake(v){S.shake=Math.min(1,S.shake+v);}
function playerShoot(){
  const c=CLASSES[S.cls],now=performance.now(),rate=c.rate*(S.stimT>0?.62:1);
  if(S.reloading||now-S.lastShot<rate)return;
  if(S.ammo<=0){sfx.empty();startReload();return;}
  S.lastShot=now;S.ammo--;S.shots+=(c.pellets||1);
  if(S.cls==='heavy')sfx.shotgun();else if(S.cls==='scout')sfx.sniper();else sfx.shoot();
  gun.position.z=-.55;gun.rotation.x=.06;shake(S.cls==='heavy'?.22:S.cls==='scout'?.18:.07);S.pitch+=S.cls==='heavy'?.012:.004;
  if(gunParts.flash){gunParts.flash.material.opacity=.95;gunParts.flash.rotation.z=rand(0,3);}
  muzzleLight.position.copy(camera.position);muzzleLight.intensity=18;
  const pellets=c.pellets||1;
  for(let p=0;p<pellets;p++){
    const dir=new THREE.Vector3(rand(-1,1)*c.spread,rand(-1,1)*c.spread,-1).normalize().applyQuaternion(camera.quaternion);
    raycaster.set(camera.position,dir);raycaster.far=90;
    const meshes=[];enemies.forEach(e=>{if(!e.dead)meshes.push(e.head,e.body);});
    const hitsArr=raycaster.intersectObjects(meshes,false);
    let end=camera.position.clone().add(dir.multiplyScalar(60));
    if(hitsArr.length){const h=hitsArr[0];end=h.point;damageEnemy(h.object.userData.enemy,c.dmg,h.object.userData.part==='head',h.point);}
    else{ // obstacle impact spark
      const obs=obstacles.map(o=>o.mesh);const oh=raycaster.intersectObjects(obs,false);if(oh.length){end=oh[0].point;spawnParticles(end,0x67e8f9,4,2,1,.3);}}
    const muzzle=new THREE.Vector3(.3,-.25,-1.1).applyQuaternion(camera.quaternion).add(camera.position);
    tracer(muzzle,end,S.cls==='medic'?0x86efac:0xa5f3fc);
  }
  spawnParticles(camera.position.clone().add(new THREE.Vector3(0,-.1,-1).applyQuaternion(camera.quaternion)),0xffd166,2,1,.3,.2);
  updateWeaponHud();
  if(S.ammo===0)startReload();
}
function damageEnemy(e,dmg,isHead,point){
  if(!e||e.dead)return;const final=isHead?dmg*2.2:dmg;e.hp-=final;e.flash=1;S.hits++;
  sfx.hit();if(isHead)sfx.head();
  const hm=$('hitmarker');hm.className='';void hm.offsetWidth;hm.className='show'+(e.hp<=0?' kill':'');hm.id='hitmarker';
  dmgNum(point||e.g.position.clone().setY(1.6),Math.round(final)+(isHead?' 💥':''),isHead?'crit':'');
  spawnParticles(point||e.g.position.clone().setY(1.2),e.type==='runner'?0xef4444:0xa3e635,isHead?10:6,3.5,2.5,.5);
  if(e.hp<=0)killEnemy(e,isHead);else if(e.isBoss)updateBossBar();
}
function killEnemy(e,isHead){
  e.dead=true;S.kills++;addScore(e.score+(isHead?50:0));
  sfx.kill();killFeed(`${isHead?'💥 Хедшот · ':''}${ENEMY_TYPES[e.type].name} +${e.score}`);
  spawnParticles(e.g.position.clone().setY(1.2),e.type==='boss'?0xfacc15:0xe879f9,e.isBoss?60:20,5,4,.8);
  shake(e.isBoss?.6:.12);
  if(e.isBoss){$('bossBarWrap').classList.add('hidden');sfx.boom();centerMsg('🏆 БОСС УНИЧТОЖЕН! +5000 и волна гранат',3000);S.grenades=Math.min(6,S.grenades+2);updateWeaponHud();}
  if(Math.random()<(e.isBoss?1:.14))makePickup(e.g.position,choice(['health','health','grenade','shield']));
  // death anim handled in loop via e.deathT
  e.deathT=.45;
  if(Math.random()<.3)sfx.groan();
}
function updateBossBar(){const b=enemies.find(e=>e.isBoss&&!e.dead);if(b)$('bossBar').style.width=clamp(b.hp/b.maxHp*100,0,100)+'%';}
function startReload(){const c=CLASSES[S.cls];if(S.reloading||S.ammo===c.mag)return;S.reloading=true;S.reloadT=c.reload;$('reloadHint').classList.remove('hidden');sfx.reload();gun.rotation.x=-.5;}
function throwGrenade(){
  if(!S.playing||S.paused||S.grenades<=0){if(S.grenades<=0)toast('Нет гранат! Ищите оранжевые подборы 🟠');return;}
  S.grenades--;updateWeaponHud();
  const m=new THREE.Mesh(new THREE.SphereGeometry(.14,10,10),new THREE.MeshStandardMaterial({color:0xfb923c,emissive:0xea580c,emissiveIntensity:1.6}));
  m.position.copy(camera.position);scene.add(m);
  const vel=new THREE.Vector3(0,.35,-1).applyQuaternion(camera.quaternion).multiplyScalar(17);vel.y+=3;
  grenadeObjs.push({m,vel,t:2.2});tone(300,.1,'square',.07,-100);
}
function explode(pos){
  sfx.boom();shake(.55);$('flashOverlay').style.opacity=.35;setTimeout(()=>$('flashOverlay').style.opacity=0,60);
  spawnParticles(pos,0xfb923c,42,7,5,.8);spawnParticles(pos,0xfacc15,22,4,6,.6);
  const ring=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),new THREE.MeshBasicMaterial({color:0xfdba74,transparent:true,opacity:.7,wireframe:true}));
  ring.position.copy(pos);scene.add(ring);setTimeout(()=>scene.remove(ring),280);let rs=1;const iv=setInterval(()=>{rs+=.7;ring.scale.setScalar(rs);ring.material.opacity-=.12;if(ring.material.opacity<=0)clearInterval(iv);},30);
  enemies.forEach(e=>{if(!e.dead&&e.g.position.distanceTo(pos)<6.5)damageEnemy(e,170,false,e.g.position.clone().setY(1.3));});
  if(camera.position.distanceTo(pos)<4)hurtPlayer(12);
}
function useAbility(){
  if(!S.playing||S.paused||S.abilityCd>0)return;const c=CLASSES[S.cls];S.abilityCd=c.abilityCd;sfx.ability();
  if(S.cls==='assault'){S.stimT=5;centerMsg('⚡ СТИМ! Темп и скорость повышены',1600);}
  if(S.cls==='medic'){healPlayer(55);bots.forEach(b=>{if(!b.dead&&b.g.position.distanceTo(camera.position)<11){b.hp=Math.min(b.maxHp,b.hp+55);spawnParticles(b.g.position.clone().setY(1.4),0x4ade80,12,2,3,.6);}});
    $('healVignette').style.opacity=1;setTimeout(()=>$('healVignette').style.opacity=0,350);centerMsg('💚 МЕД-НОВА! Отряд вылечен',1600);buildTeamPanel();}
  if(S.cls==='heavy'){S.shield=120;S.shieldT=7;centerMsg('🛡️ ЭНЕРГОЩИТ АКТИВЕН',1600);}
  if(S.cls==='scout'){const fwd=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);fwd.y=0;fwd.normalize();S.vel.add(fwd.multiplyScalar(15));spawnParticles(camera.position.clone().setY(1),0xe879f9,18,3,2,.5);centerMsg('💨 РЫВОК!',900);}
  updateHpHud();
}
function healPlayer(v){S.hp=Math.min(S.maxHp,S.hp+v);const p=camera.position.clone();p.y=1.4;dmgNum(p,'+ '+v,'heal');updateHpHud();}
function hurtPlayer(dmg){
  if(S.shield>0){const absorbed=Math.min(S.shield,dmg);S.shield-=absorbed;dmg-=absorbed;}
  if(dmg>0){S.hp-=dmg;sfx.hurt();shake(.3);$('damageVignette').style.opacity=1;setTimeout(()=>$('damageVignette').style.opacity=S.hp<35?.55:0,130);}
  updateHpHud();if(S.hp<=0){S.hp=0;endGame();}
}
function updateHpHud(){$('hpText').textContent=Math.ceil(S.hp)+' / '+S.maxHp;$('hpBar').style.width=clamp(S.hp/S.maxHp*100,0,100)+'%';$('hpBar').classList.toggle('low',S.hp<S.maxHp*.3);
  $('shieldBar').style.width=clamp(S.shield/120*100,0,100)+'%';$('armorText').textContent=S.shield>0?'🛡️ '+Math.ceil(S.shield):'';
  if(S.hp<35)$('damageVignette').style.opacity=.55;}
function updateWeaponHud(){const c=CLASSES[S.cls];$('weaponName').textContent=c.weapon.toUpperCase();$('classIconHud').textContent=c.icon;$('abilityName').textContent=c.ability;
  $('ammoMag').textContent=S.ammo;$('ammoReserve').textContent='∞';$('grenadeCount').textContent=S.grenades;}
function buildTeamPanel(){
  $('teamPanel').innerHTML=`<div class="mate"><div class="mTop"><span>${CLASSES[S.cls].icon} ${S.playerName} (вы)</span><span>${Math.ceil(S.hp)} HP</span></div><div class="mBarBg"><div class="mBar" style="width:${S.hp/S.maxHp*100}%;background:#4ade80"></div></div></div>`+
   bots.map(b=>`<div class="mate ${b.dead?'dead':''}"><div class="mTop"><span>${CLASSES[b.cls].icon} ${b.name}</span><span>${b.dead?'💀':Math.ceil(b.hp)+' HP'}</span></div><div class="mBarBg"><div class="mBar" style="width:${clamp(b.hp/b.maxHp*100,0,100)}%;background:${CLASSES[b.cls].css}"></div></div></div>`).join('');
}

/* ================= ENEMY / BOT AI ================= */
function updateEnemies(dt){
  const pp=camera.position;
  for(let i=enemies.length-1;i>=0;i--){const e=enemies[i],g=e.g;
    if(e.dead){e.deathT-=dt;g.rotation.x=-Math.min(Math.PI/2,(.45-e.deathT)*3);g.position.y-=dt*.7;g.scale.multiplyScalar(1-dt*.7);
      if(e.deathT<=0){scene.remove(g);enemies.splice(i,1);}continue;}
    e.flash=Math.max(0,e.flash-dt*6);e.mat.emissiveIntensity=.12+e.flash*1.6;
    // target: player or random alive bot
    let target=pp,tPos=pp,isPlayer=true;
    const nearBots=bots.filter(b=>!b.dead);
    if(nearBots.length&&Math.random()<.003){/* occasional retarget */}
    if(e.type!=='boss'&&nearBots.length){let best=null,bd=1e9;nearBots.forEach(b=>{const d=dist2(b.g.position,g.position);if(d<bd){bd=d;best=b;}});
      if(best&&bd<dist2(pp,g.position)*.8){tPos=best.g.position;target=best;isPlayer=false;}}
    const dx=tPos.x-g.position.x,dz=tPos.z-g.position.z,d=Math.hypot(dx,dz)||.01;
    const dirx=dx/d,dirz=dz/d;
    let speed=e.speed;
    // boss charge
    if(e.isBoss){e.chargeCd-=dt;e.summonCd-=dt;
      if(e.charging>0){e.charging-=dt;speed=10;}
      else if(e.chargeCd<=0&&d<18){e.charging=.7;e.chargeCd=rand(4,7);centerMsg('⚠️ БОСС ИДЁТ В РЫВОК!',1200);}
      if(e.summonCd<=0&&enemies.length<16){e.summonCd=11;for(let k=0;k<3;k++)spawnEnemy(choice(['zombie','runner']));centerMsg('☠ Босс призвал миньонов!',1500);}
      updateBossBar();}
    const stopDist=e.type==='boss'?3.2:1.5;
    if(d>stopDist&&( !ENEMY_TYPES[e.type].ranged || d>10)){
      g.position.x+=dirx*speed*dt;g.position.z+=dirz*speed*dt;
      g.position.y=Math.abs(Math.sin(performance.now()*.008+e.phase))*(e.type==='runner'?.35:.12);
    }
    // separation
    for(const o of enemies){if(o!==e&&!o.dead){const ox=g.position.x-o.g.position.x,oz=g.position.z-o.g.position.z,od=ox*ox+oz*oz;if(od>0&&od<1.1){g.position.x+=ox*dt*2;g.position.z+=oz*dt*2;}}}
    collide(g.position,.55*ENEMY_TYPES[e.type].scale);
    g.lookAt(tPos.x,g.position.y,tPos.z);
    g.children.forEach((ch,idx)=>{if(idx>=3)ch.rotation.x=Math.sin(performance.now()*.01+e.phase)*.6-.4;});
    e.attackCd-=dt;e.spitCd-=dt;
    if(ENEMY_TYPES[e.type].ranged&&d<16&&e.spitCd<=0){e.spitCd=rand(1.8,2.8);
      const m=new THREE.Mesh(new THREE.SphereGeometry(.16,8,8),new THREE.MeshBasicMaterial({color:0xd8b4fe}));m.position.copy(g.position).setY(1.5);scene.add(m);
      const targetPos=(isPlayer?pp.clone().setY(1.3):target.g.position.clone().setY(1.2));
      projectiles.push({m,vel:targetPos.sub(m.position).normalize().multiplyScalar(13),fromEnemy:true});tone(240,.15,'sawtooth',.04,120);}
    if(d<(e.type==='boss'?3.6:1.8)&&e.attackCd<=0){e.attackCd=e.type==='boss'?.9:1.05;
      g.children.forEach((ch,idx)=>{if(idx>=3)ch.rotation.x=-1.6;});
      if(isPlayer)hurtPlayer(e.dmg);else{target.hp-=e.dmg;if(target.hp<=0&&!target.dead){target.dead=true;target.hp=0;target.g.rotation.x=Math.PI/2;killFeed(`💀 ${target.name} выбыл!`);setTimeout(()=>{if(S.playing){target.dead=false;target.hp=target.maxHp*.6;target.g.rotation.x=0;target.g.position.set(rand(-4,4),0,rand(8,14));killFeed(`✚ ${target.name} вернулся в бой`);buildTeamPanel();}},9000);}buildTeamPanel();}
      spawnParticles(g.position.clone().setY(1.3),0xfb7185,5,2,2,.4);}
  }
}
function updateBots(dt){
  bots.forEach(b=>{if(b.dead)return;const g=b.g;b.fireCd-=dt;b.strafe+=dt;
    let target=null,bd=1e9;enemies.forEach(e=>{if(!e.dead){const d=dist2(g.position,e.g.position);if(d<bd){bd=d;target=e;}}});
    if(!target){ // follow player loosely
      const dx=camera.position.x-g.position.x,dz=camera.position.z-g.position.z,d=Math.hypot(dx,dz);
      if(d>5){g.position.x+=dx/d*4.4*dt;g.position.z+=dz/d*4.4*dt;g.lookAt(camera.position.x,0,camera.position.z);}
      if(b.cls==='medic')b.hp=Math.min(b.maxHp,b.hp+dt*2);
      return;}
    const tp=target.g.position,d=Math.sqrt(bd);
    const strafeX=Math.cos(b.strafe*1.3)*2.2,strafeZ=Math.sin(b.strafe*1.3)*2.2;
    const want=target.type==='brute'||target.isBoss?11:8;
    const mx=(tp.x-g.position.x)/d,mz=(tp.z-g.position.z)/d;
    if(d>want+2){g.position.x+=mx*4.6*dt;g.position.z+=mz*4.6*dt;}
    else if(d<want-3){g.position.x-=mx*3.6*dt;g.position.z-=mz*3.6*dt;}
    g.position.x+=strafeX*dt*.7;g.position.z+=strafeZ*dt*.7;
    collide(g.position,.5);g.position.y=Math.abs(Math.sin(performance.now()*.009+b.strafe))*0.08;
    g.lookAt(tp.x,0,tp.z);
    if(b.fireCd<=0&&d<30){b.fireCd=CLASSES[b.cls].id==='heavy'?0.9:rand(.35,.6);
      const from=g.position.clone().setY(1.35),to=tp.clone().setY(rand(1,1.7));
      tracer(from,to,new THREE.Color(CLASSES[b.cls].color).getHex());
      spawnParticles(to,0xfca5a5,3,2,1,.3);
      if(Math.random()<.62)damageEnemy(target,CLASSES[b.cls].dmg*.75,Math.random()<.12,to);
      if(Math.random()<.25)tone(rand(500,700),.04,'square',.015);}
    // medic bot heals player sometimes
    if(b.cls==='medic'&&S.hp<S.maxHp*.55&&Math.random()<dt*.25){healPlayer(18);centerMsg(`💚 ${b.name} подлечил вас +18`,1300);spawnParticles(camera.position.clone().setY(1.2),0x4ade80,10,2,2,.5);}
  });
}
function updateProjectiles(dt){
  for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];p.m.position.addScaledVector(p.vel,dt);
    const d=p.m.position.distanceTo(camera.position.clone().setY(1.3));
    if(p.fromEnemy&&d<.9){hurtPlayer(11);scene.remove(p.m);projectiles.splice(i,1);continue;}
    if(p.m.position.y<0||p.m.position.length()>70){scene.remove(p.m);projectiles.splice(i,1);}}
  for(let i=grenadeObjs.length-1;i>=0;i--){const g=grenadeObjs[i];g.t-=dt;g.vel.y-=18*dt;g.m.position.addScaledVector(g.vel,dt);
    if(g.m.position.y<.15){g.m.position.y=.15;g.vel.y*=-.35;g.vel.x*=.7;g.vel.z*=.7;}
    if(g.t<=0){explode(g.m.position.clone());scene.remove(g.m);grenadeObjs.splice(i,1);}}
  for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];p.t+=dt;p.m.rotation.y+=dt*3;p.m.position.y=.8+Math.sin(p.t*3)*.15;
    if(p.m.position.distanceTo(camera.position)<1.7){sfx.pickup();
      if(p.kind==='health'){healPlayer(40);toast('✚ Аптечка +40 HP');}
      if(p.kind==='grenade'){S.grenades=Math.min(6,S.grenades+2);toast('🟠 +2 гранаты');updateWeaponHud();}
      if(p.kind==='shield'){S.shield=Math.min(120,S.shield+60);toast('🛡️ +60 к щиту');updateHpHud();}
      scene.remove(p.m);pickups.splice(i,1);}}
}

/* ================= PLAYER UPDATE ================= */
const joyVec={x:0,y:0};let lookTouch=null;
function updatePlayer(dt){
  const c=CLASSES[S.cls];
  const sprint=S.keys['ShiftLeft']||S.keys['ShiftRight'];
  let speed=c.speed*(sprint?1.35:1)*(S.stimT>0?1.25:1);
  const fwd=new THREE.Vector3(-Math.sin(S.yaw),0,-Math.cos(S.yaw)),right=new THREE.Vector3(-fwd.z,0,fwd.x);
  const move=new THREE.Vector3();
  const f=(S.keys['KeyW']?1:0)-(S.keys['KeyS']?1:0)-joyVec.y;
  const r=(S.keys['KeyD']?1:0)-(S.keys['KeyA']?1:0)+joyVec.x;
  move.addScaledVector(fwd,f).addScaledVector(right,r);
  if(move.lengthSq()>0){move.normalize();S.bobT+=dt*(sprint?11:8);}
  S.vel.x=move.x*speed;S.vel.z=move.z*speed;
  S.vel.y-=22*dt;
  camera.position.addScaledVector(S.vel,dt);
  if(camera.position.y<=1.7){camera.position.y=1.7;S.vel.y=0;S.onGround=true;}
  collide(camera.position,.65);
  camera.position.x=clamp(camera.position.x,-30,30);camera.position.z=clamp(camera.position.z,-30,30);
  const bobY=Math.sin(S.bobT*2)*.045*(move.lengthSq()?1:0),bobX=Math.cos(S.bobT)*.02*(move.lengthSq()?1:0);
  S.shake=Math.max(0,S.shake-dt*3.2);
  const shx=rand(-1,1)*S.shake*.05,shy=rand(-1,1)*S.shake*.05;
  camera.rotation.order='YXZ';camera.rotation.y=S.yaw;camera.rotation.x=S.pitch+shy;camera.rotation.z=bobX*.4+shx;
  camera.position.y=1.7+bobY+ (S.onGround?0:camera.position.y-1.7);
  // fix: keep physics y separate via camera y already; store base
  gun.position.y=-.34+Math.sin(S.bobT*2)*.012*(move.lengthSq()?1:0);
  gun.position.x=.34+Math.cos(S.bobT)*.006*(move.lengthSq()?1:0);
  gun.position.z+=(-0.65-gun.position.z)*Math.min(1,dt*14);gun.rotation.x+= (0-gun.rotation.x)*Math.min(1,dt*10);
  if(gunParts.flash&&gunParts.flash.material.opacity>0)gunParts.flash.material.opacity=Math.max(0,gunParts.flash.material.opacity-dt*14);
  muzzleLight.intensity=Math.max(0,muzzleLight.intensity-dt*160);
  if(S.fireHeld)playerShoot();
  if(S.reloading){S.reloadT-=dt;gun.rotation.x=-.5+Math.sin((CLASSES[S.cls].reload-S.reloadT)*6)*.08;if(S.reloadT<=0){S.reloading=false;S.ammo=CLASSES[S.cls].mag;$('reloadHint').classList.add('hidden');updateWeaponHud();}}
  S.abilityCd=Math.max(0,S.abilityCd-dt);S.stimT=Math.max(0,S.stimT-dt);S.shieldT=Math.max(0,S.shieldT-dt);
  if(S.shieldT===0&&S.shield>0&&S.cls==='heavy')S.shield=0;
  if(S.comboT>0){S.comboT-=dt;if(S.comboT<=0){S.combo=0;$('comboVal').textContent='';}}
  const cdFrac=1-S.abilityCd/CLASSES[S.cls].abilityCd;$('abilityCd').style.width=(cdFrac*100)+'%';
  $('abilityBox').classList.toggle('ready',S.abilityCd<=0);
  // regen small for medic class passive
  if(S.cls==='medic')S.hp=Math.min(S.maxHp,S.hp+dt*2.2);
  // low hp heartbeat
  if(S.hp<30&&Math.random()<dt*1.2)tone(55,.12,'sine',.12);
}
function updateWave(dt){
  const alive=enemies.filter(e=>!e.dead).length;
  $('enemiesLeft').textContent=alive+S.toSpawn;
  if(S.waveState==='idle'){S.interTimer-=dt;if(S.interTimer<=0)nextWave();}
  else if(S.waveState==='spawning'){
    S.spawnTimer-=dt;
    if(S.toSpawn>0&&S.spawnTimer<=0&&alive<22){spawnEnemy();S.toSpawn--;S.spawnTimer=S.wave%5===0?.9:.55;}
    if(S.toSpawn<=0)S.waveState='fighting';
  }else if(S.waveState==='fighting'){
    if(alive===0&&enemies.length===0){const bonus=250+S.wave*75;S.score+=bonus;$('scoreVal').textContent=S.score;
      showBanner('ВОЛНА '+S.wave+' ЗАЧИЩЕНА','Бонус +'+bonus+' · Следующая волна через 5 сек');sfx.pickup();
      if(S.wave%3===0){S.grenades=Math.min(6,S.grenades+1);toast('🟠 Выдана граната за зачистку');updateWeaponHud();}
      S.waveState='idle';S.interTimer=5;buildTeamPanel();}
  }
}

/* ================= MAIN LOOP ================= */
const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.05),t=performance.now()*.001;
  floaters.forEach((f,i)=>{f.rotation.x+=dt*.3;f.rotation.y+=dt*.4;f.position.y+=Math.sin(t+i)*dt*.25;});
  portals.forEach((p,i)=>{p.rotation.z+=dt*(1+i*.2);});
  points.rotation.y=0;
  if(S.playing&&!S.paused){
    updatePlayer(dt);updateEnemies(dt);updateBots(dt);updateProjectiles(dt);updateWave(dt);
    tracers.forEach(tr=>{if(tr.life>0){tr.life-=dt;tr.m.material.opacity=Math.max(0,tr.life/.07)*.9;if(tr.life<=0)tr.m.visible=false;}});
    // random groans + bot chatter
    if(Math.random()<dt*.25&&enemies.length)sfx.groan();
    if(Math.random()<dt*.03&&bots.length){const b=choice(bots);voiceLog(choice(CHATTER),'bot',b.name);const lp=lobbyPlayers.find(p=>p.name===b.name);if(lp){lp.talking=true;renderSlots();setTimeout(()=>{lp.talking=false;if(S.screen==='game'){}},1800);}}
  }
  updateParticles(dt);updateMic();
  // idle camera drift in menu
  if(S.screen==='menu'||S.screen==='lobby'){
    const a=t*.07;camera.position.set(Math.sin(a)*20,6+Math.sin(t*.3)*1.2,Math.cos(a)*20);camera.lookAt(0,1.5,0);gun.visible=false;
  }else gun.visible=true;
  renderer.render(scene,camera);
}
animate();

/* ================= INPUT ================= */
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
document.addEventListener('pointerlockchange',()=>{ if(!document.pointerLockElement&&S.playing&&!S.paused&&!S.over&&!('ontouchstart'in window)){ /* keep playing, click to re-lock */ }});
canvas.addEventListener('click',()=>{if(S.playing&&!S.paused&&!document.pointerLockElement&&!('ontouchstart'in window))canvas.requestPointerLock();});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&S.playing&&!S.paused){S.yaw-=e.movementX*.0021;S.pitch=clamp(S.pitch-e.movementY*.0021,-1.35,1.35);}});
document.addEventListener('mousedown',e=>{if(S.playing&&!S.paused&&document.pointerLockElement===canvas&&e.button===0)S.fireHeld=true;});
document.addEventListener('mouseup',e=>{if(e.button===0)S.fireHeld=false;});
addEventListener('keydown',e=>{
  S.keys[e.code]=true;
  if(e.code==='KeyV')S.ptt=true;
  if(!S.playing)return;
  if(e.code==='KeyP'||e.code==='Escape'){S.paused?resumeGame():pauseGame();}
  if(S.paused||S.over)return;
  if(e.code==='KeyR')startReload();
  if(e.code==='KeyQ')useAbility();
  if(e.code==='KeyG')throwGrenade();
  if(e.code==='KeyM'){S.muted=!S.muted;toast(S.muted?'🔇 Микрофон заглушён':'🎙️ Микрофон включён');}
  if(e.code==='Space'&&S.onGround){S.vel.y=8.4;S.onGround=false;e.preventDefault();}
});
addEventListener('keyup',e=>{S.keys[e.code]=false;if(e.code==='KeyV')S.ptt=false;
  if(e.code==='KeyR'&&(S.over||$('pauseScreen')&&!$('pauseScreen').classList.contains('hidden'))){/* handled below */}});
addEventListener('keydown',e=>{if(e.code==='KeyR'&&(S.over||S.paused))startGame();});
document.addEventListener('contextmenu',e=>{if(S.playing)e.preventDefault();});

/* touch */
const joy=$('joystick'),knob=$('joyKnob');let joyId=null;
joy.addEventListener('touchstart',e=>{joyId=e.changedTouches[0].identifier;},{passive:true});
addEventListener('touchmove',e=>{
  for(const t of e.changedTouches){
    if(t.identifier===joyId){const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=(t.clientX-cx)/(r.width/2),dy=(t.clientY-cy)/(r.height/2);const m=Math.hypot(dx,dy);if(m>1){dx/=m;dy/=m;}joyVec.x=dx;joyVec.y=dy;knob.style.transform=`translate(calc(-50% + ${dx*34}px),calc(-50% + ${dy*34}px))`;}
    else if(lookTouch&&t.identifier===lookTouch.id){S.yaw-=(t.clientX-lookTouch.x)*.005;S.pitch=clamp(S.pitch-(t.clientY-lookTouch.y)*.005,-1.3,1.3);lookTouch.x=t.clientX;lookTouch.y=t.clientY;}
  }
  if(S.playing)e.preventDefault();
},{passive:false});
addEventListener('touchend',e=>{for(const t of e.changedTouches){if(t.identifier===joyId){joyId=null;joyVec.x=joyVec.y=0;knob.style.transform='translate(-50%,-50%)';}if(lookTouch&&t.identifier===lookTouch.id)lookTouch=null;}});
canvas.addEventListener('touchstart',e=>{const t=e.changedTouches[0];if(t.clientX>innerWidth*.4)lookTouch={id:t.identifier,x:t.clientX,y:t.clientY};},{passive:true});
function bindHold(id,down,up){const el=$(id);el.addEventListener('touchstart',e=>{e.preventDefault();down();},{passive:false});el.addEventListener('touchend',e=>{e.preventDefault();up&&up();},{passive:false});}
bindHold('btnFire',()=>S.fireHeld=true,()=>S.fireHeld=false);
bindHold('btnJump',()=>{if(S.onGround){S.vel.y=8.4;S.onGround=false;}});
bindHold('btnAbility',()=>useAbility());
bindHold('btnReload',()=>startReload());
bindHold('btnMic',()=>{if(!S.micOn)enableMic();S.ptt=true;},()=>S.ptt=false);

/* ================= UI WIRING ================= */
$('toLobbyBtn').onclick=()=>{sfx.ui();S.playerName=$('playerName').value.trim()||'Игрок-1';showScreen('lobby');voiceLog('Комната '+S.room+' создана. Вы — хост.','sys');};
$('quickBtn').onclick=()=>{sfx.ui();S.playerName=$('playerName').value.trim()||'Игрок-1';lobbyPlayers=BOT_POOL.slice(0,4).map(([name,cls])=>({name,cls,bot:true,ping:0,ready:true,talking:false}));startGame();};
$('joinBtn').onclick=()=>{const code=$('joinCode').value.trim().toUpperCase();if(code.length<4){toast('Введите код комнаты, например SIM-1234');return;}S.room=code;sfx.ui();S.playerName=$('playerName').value.trim()||'Игрок-1';showScreen('lobby');$('roomCode').textContent=code;voiceLog('Подключение к '+code+'… установлено ✓','sys');toast('✅ Подключено к комнате '+code);};
$('howBtn').onclick=()=>{$('howScreen').classList.remove('hidden');};
$('closeHowBtn').onclick=()=>{$('howScreen').classList.add('hidden');};
$('scoresBtn').onclick=()=>{const el=$('menuScores');el.classList.toggle('hidden');renderScores($('menuScoresBody'));};
$('soundBtn').onclick=()=>{soundOn=!soundOn;$('soundBtn').textContent=soundOn?'🔊 Звук: вкл':'🔇 Звук: выкл';if(soundOn)sfx.ui();};
$('leaveLobbyBtn').onclick=()=>showScreen('menu');
$('copyCodeBtn').onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(S.room);toast('📋 Код комнаты скопирован: '+S.room);};
$('readyBtn').onclick=()=>{S.ready=!S.ready;$('readyBtn').classList.toggle('readyOn',S.ready);$('readyBtn').textContent=S.ready?'✓ ВЫ ГОТОВЫ':'✓ ГОТОВ';$('startBtn').classList.toggle('hidden',!S.ready);$('readyHint').textContent=S.ready?'Отряд ждёт запуска. Боты и игроки подтянутся автоматически.':'Вы — хост. Нажмите «Готов», затем запускайте.';renderSlots();sfx.ui();};
$('startBtn').onclick=()=>{if($('fillBots').checked&&lobbyPlayers.length<5){const pool=[...BOT_POOL].sort(()=>Math.random()-.5);while(lobbyPlayers.length<5){const [name,cls]=pool[lobbyPlayers.length%pool.length];if(lobbyPlayers.some(p=>p.name===name))break;lobbyPlayers.push({name,cls,bot:true,ping:0,ready:true,talking:false});}}startGame();};
$('micBtn').onclick=()=>enableMic();
$('micBtnPause').onclick=()=>enableMic(true);
$('openMic').onchange=e=>{S.openMic=e.target.checked;toast(S.openMic?'🎙️ Открытый микрофон':'🎙️ Режим Push-to-Talk (V)');};
$('pauseBtn').onclick=()=>pauseGame();
$('resumeBtn').onclick=()=>resumeGame();
$('restartBtnPause').onclick=()=>startGame();
$('restartBtnOver').onclick=()=>startGame();
$('quitBtn').onclick=()=>{S.playing=false;showScreen('menu');};
$('menuBtnOver').onclick=()=>showScreen('menu');
$('testVoiceCmdBtn').onclick=()=>{if(!S.micOn){toast('Сначала включите микрофон');return;}toast('Скажите: «граната», «лечи» или «перезарядка» (в игре)');showVoiceToast('🎧 Слушаю… скажите команду');};
setInterval(()=>{if(S.screen==='lobby')$('pingVal').textContent='пинг '+randi(18,42)+' мс';},2500);
renderScores($('menuScoresBody'));
setInterval(()=>{ // update team panel hp smoothly
  if(S.playing)buildTeamPanel();
},600);
// occasional lobby talking dots
setInterval(()=>{if(S.screen==='lobby'&&lobbyPlayers.length){const p=choice(lobbyPlayers);p.talking=true;renderSlots();if(Math.random()<.6)voiceLog(choice(CHATTER),'bot',p.name);setTimeout(()=>{p.talking=false;renderSlots();},1600);}},5200);
$('roomCode').textContent=S.room;
