// Весь звук синтезируется WebAudio: мотор, занос, ветер, дождь, музыка, SFX + TTS штурмана
import { S } from './settings.js';

class AudioSys {
  constructor() { this.ready = false; this.musicTimer = null; this.step = 0; }
  init() {
    if (this.ready) { this.ctx?.resume(); return; }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx = ctx;
      this.master = ctx.createGain(); this.master.connect(ctx.destination);
      this.gMusic = ctx.createGain(); this.gMusic.connect(this.master);
      this.gEngine = ctx.createGain(); this.gEngine.connect(this.master);
      this.gSfx = ctx.createGain(); this.gSfx.connect(this.master);
      this.gVoice = ctx.createGain(); this.gVoice.connect(this.master);
      // шумовой буфер на все случаи жизни
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // --- мотор: 2 осциллятора через фильтр ---
      this.engOsc1 = ctx.createOscillator(); this.engOsc1.type = 'sawtooth';
      this.engOsc2 = ctx.createOscillator(); this.engOsc2.type = 'square';
      this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.Q.value = 2;
      this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
      this.engOsc1.connect(this.engFilter); this.engOsc2.connect(this.engFilter);
      this.engFilter.connect(this.engGain); this.engGain.connect(this.gEngine);
      this.engOsc1.start(); this.engOsc2.start();
      // --- занос/гравий ---
      this.skid = this.loopNoise('bandpass', 900, 0.8); this.skid.gain.gain.value = 0; this.skid.gain.connect(this.gEngine);
      // --- ветер ---
      this.wind = this.loopNoise('lowpass', 400, 0.4); this.wind.gain.gain.value = 0; this.wind.gain.connect(this.gEngine);
      // --- дождь ---
      this.rain = this.loopNoise('highpass', 1800, 0.3); this.rain.gain.gain.value = 0; this.rain.gain.connect(this.gSfx);
      this.applyVolumes();
      this.ready = true;
    } catch (e) { console.warn('Audio недоступен', e); }
  }
  loopNoise(type, freq, q) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const gain = this.ctx.createGain(); gain.gain.value = 0;
    src.connect(f); f.connect(gain); src.start();
    return { src, filter: f, gain };
  }
  applyVolumes() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(S.master, t, 0.05);
    this.gMusic.gain.setTargetAtTime(S.musicOn ? S.music : 0, t, 0.1);
    this.gEngine.gain.setTargetAtTime(S.engineVol, t, 0.05);
    this.gSfx.gain.setTargetAtTime(S.sfx, t, 0.05);
    this.gVoice.gain.setTargetAtTime(S.voiceVol, t, 0.05);
  }
  /** rpm01: 0..1, load: 0..1 газ, skidAmt: 0..1, speed01: 0..1 */
  engine(rpm01, load, skidAmt, speed01, surfaceGravel = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const freq = 55 + rpm01 * 210 + Math.sin(t * 31) * rpm01 * 2.5;
    this.engOsc1.frequency.setTargetAtTime(freq, t, 0.03);
    this.engOsc2.frequency.setTargetAtTime(freq * 0.5 + 1.5, t, 0.03);
    this.engFilter.frequency.setTargetAtTime(300 + rpm01 * 1900 + load * 900, t, 0.05);
    this.engGain.gain.setTargetAtTime(0.05 + load * 0.11 + rpm01 * 0.045, t, 0.06);
    this.skid.gain.gain.setTargetAtTime(Math.min(0.22, skidAmt * 0.22 + surfaceGravel * 0.05), t, 0.05);
    this.skid.filter.frequency.setTargetAtTime(600 + skidAmt * 900 + surfaceGravel * 300, t, 0.1);
    this.wind.gain.gain.setTargetAtTime(speed01 * speed01 * 0.14, t, 0.15);
    this.wind.filter.frequency.setTargetAtTime(250 + speed01 * 750, t, 0.2);
  }
  engineStop() { if (this.ready) { const t = this.ctx.currentTime; this.engGain.gain.setTargetAtTime(0.02, t, 0.1); this.skid.gain.gain.setTargetAtTime(0, t, 0.1); this.wind.gain.gain.setTargetAtTime(0, t, 0.2); } }
  setRain(v) { if (this.ready) this.rain.gain.gain.setTargetAtTime(v * 0.06, this.ctx.currentTime, 0.4); }

  tone(freq, dur, { type = 'sine', vol = 0.16, slide = 0, delay = 0, dest } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.gSfx); o.start(t); o.stop(t + dur + 0.05);
  }
  noiseBurst(dur, { vol = 0.2, freq = 500, type = 'lowpass', delay = 0 } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.gSfx); src.start(t); src.stop(t + dur + 0.05);
  }
  click() { this.tone(660, 0.06, { type: 'triangle', vol: 0.08 }); }
  hover() { this.tone(440, 0.04, { type: 'sine', vol: 0.04 }); }
  countBeep() { this.tone(440, 0.16, { type: 'square', vol: 0.14 }); }
  goBeep() { this.tone(880, 0.45, { type: 'square', vol: 0.18 }); this.tone(1320, 0.45, { type: 'sine', vol: 0.1 }); }
  checkpoint() { this.tone(784, 0.12, { vol: 0.14 }); this.tone(1175, 0.2, { vol: 0.14, delay: 0.09 }); }
  pop() { this.tone(980, 0.09, { type: 'triangle', vol: 0.1, slide: 320 }); }
  crash(v = 1) { this.noiseBurst(0.35, { vol: 0.32 * v, freq: 380 }); this.tone(70, 0.3, { type: 'sine', vol: 0.3 * v, slide: -30 }); }
  scrape() { this.noiseBurst(0.14, { vol: 0.1, freq: 2400, type: 'bandpass' }); }
  horn() { this.tone(392, 0.35, { type: 'sawtooth', vol: 0.12 }); this.tone(494, 0.35, { type: 'sawtooth', vol: 0.1 }); }
  thunder() { this.noiseBurst(1.4, { vol: 0.25, freq: 140 }); this.noiseBurst(0.4, { vol: 0.14, freq: 900, type: 'bandpass' }); }
  fanfare() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', vol: 0.15, delay: i * 0.12 })); }
  fail() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.13, delay: i * 0.16 })); }

  // --- простенькая синт-музыка: драйвовый арпеджио-луп ---
  startMusic() {
    if (!this.ready || this.musicTimer) return;
    const chords = [[110, 130.8, 164.8], [87.3, 110, 130.8], [98, 123.5, 146.8], [130.8, 164.8, 196]]; // Am F G C(ish)
    const tick = () => {
      if (!S.musicOn) return;
      const bar = Math.floor(this.step / 8) % 4, s = this.step % 8;
      const [root] = chords[bar];
      if (s % 2 === 0) this.tone(root, 0.22, { type: 'triangle', vol: 0.12, dest: this.gMusic });
      const arp = chords[bar][s % 3] * 2;
      this.tone(arp, 0.16, { type: 'sawtooth', vol: 0.028, dest: this.gMusic });
      if (s === 0) this.noiseBurst(0.05, { vol: 0.015, freq: 6000, type: 'highpass' });
      this.step++;
    };
    this.musicTimer = setInterval(tick, 214); // ~140bpm восьмые
  }
  stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } }

  // --- голос штурмана (TTS) ---
  speak(text, { interrupt = false } = {}) {
    if (!S.tts || !('speechSynthesis' in window)) return;
    try {
      if (interrupt) speechSynthesis.cancel();
      else if (speechSynthesis.speaking && speechSynthesis.pending) return; // не копим очередь
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU'; u.rate = S.ttsRate; u.pitch = 0.92; u.volume = Math.min(1, S.voiceVol);
      const v = speechSynthesis.getVoices().find(v => v.lang?.toLowerCase().startsWith('ru'));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch {}
  }
  stopSpeak() { try { speechSynthesis.cancel(); } catch {} }
}
export const audio = new AudioSys();
if ('speechSynthesis' in window) speechSynthesis.getVoices();
