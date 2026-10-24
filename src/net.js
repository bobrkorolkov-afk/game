// Онлайн: WebSocket-лобби (комнаты, команды, роли, чат, синхронизация гонки) + голос WebRTC mesh
import { S } from './settings.js';

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

export class Net {
  constructor() {
    this.ws = null; this.connected = false; this.myId = null;
    this.code = null; this.players = []; this.cfg = null; this.hostId = null;
    this.ping = 0; this._pingTimer = null; this._intentionalClose = false;
    // голос
    this.localStream = null; this.peers = new Map(); // id -> {pc, audioEl, sender}
    this.micOn = false; this.pttActive = false; this.speaking = false;
    this.mutedPlayers = new Set();
    this.micLevel = 0;
    this._audioCtx = null; this._analyser = null; this._vadTimer = null;
    // колбэки (назначает main.js)
    this.onLobby = this.onChat = this.onPos = this.onNote = this.onQuick = null;
    this.onCountdown = this.onResults = this.onRaceStopped = this.onRooms = null;
    this.onError = this.onConnected = this.onVoiceState = this.onPeerLeft = null;
  }
  get me() { return this.players.find(p => p.id === this.myId) || null; }
  get inRoom() { return !!this.code; }
  teammate() { const me = this.me; return me ? this.players.find(p => p.team === me.team && p.id !== me.id) : null; }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    this._intentionalClose = false;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try { this.ws = new WebSocket(`${proto}//${location.host}/ws`); }
    catch { this.onConnected?.(false); return; }
    this.ws.onopen = () => { this.connected = true; this.onConnected?.(true); this._startPing(); };
    this.ws.onclose = () => {
      this.connected = false; this.code = null; this.players = [];
      this._stopPing(); this.closeAllPeers();
      this.onConnected?.(false);
      if (!this._intentionalClose) setTimeout(() => this.connect(), 3500); // автопереподключение сервера
    };
    this.ws.onerror = () => {};
    this.ws.onmessage = (e) => this._onMessage(e);
  }
  disconnect() { this._intentionalClose = true; try { this.ws?.close(); } catch {} }
  send(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  _startPing() { this._stopPing(); this._pingTimer = setInterval(() => this.send({ t: 'ping', ts: performance.now() }), 4000); }
  _stopPing() { if (this._pingTimer) clearInterval(this._pingTimer); }

  _onMessage(e) {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    switch (m.t) {
      case 'welcome': this.myId = m.id; this.onRooms?.(m.rooms || []); break;
      case 'rooms': this.onRooms?.(m.rooms || []); break;
      case 'created': this.code = m.code; break;
      case 'joined': this.code = m.code; break;
      case 'left': this.code = null; this.players = []; this.closeAllPeers(); break;
      case 'lobby': {
        this.code = m.code; this.players = m.players; this.cfg = m.cfg; this.hostId = m.hostId;
        this._syncPeers();
        this.onLobby?.(m);
        break;
      }
      case 'chat': this.onChat?.(m); break;
      case 'error': this.onError?.(m.msg); break;
      case 'pos': this.onPos?.(m.id, m.team, m.p); break;
      case 'note': this.onNote?.(m); break;
      case 'quick': this.onQuick?.(m); break;
      case 'countdown': this.onCountdown?.(m); break;
      case 'results': this.onResults?.(m.results); break;
      case 'raceStopped': this.onRaceStopped?.(); break;
      case 'peerLeft': this._closePeer(m.id); this.onPeerLeft?.(m.id); break;
      case 'voiceState': this.onVoiceState?.(m.id, m); break;
      case 'signal': this._onSignal(m.from, m.data); break;
      case 'pong': this.ping = Math.round(performance.now() - m.ts); break;
    }
  }

  // ---- лобби API ----
  listRooms() { this.send({ t: 'list' }); }
  createRoom(name, cfg) { this.send({ t: 'create', name, color: S.carColor, cfg }); }
  joinRoom(code, name) { this.send({ t: 'join', code, name, color: S.carColor }); }
  leaveRoom() { this.send({ t: 'leave' }); this.code = null; this.players = []; this.closeAllPeers(); }
  setSlot(team, role) { this.send({ t: 'slot', team, role }); }
  setReady(v) { this.send({ t: 'ready', v }); }
  setProfile(name, color) { this.send({ t: 'profile', name, color }); }
  updateCfg(cfg) { this.send({ t: 'cfg', cfg }); }
  chat(msg) { this.send({ t: 'chat', msg }); }
  startRace() { this.send({ t: 'start' }); }
  stopRace() { this.send({ t: 'stopRace' }); }
  backToLobby() { this.send({ t: 'backToLobby' }); }
  sendPos(p) { this.send({ t: 'pos', p }); }
  sendNote(note) { this.send({ t: 'note', note }); }
  sendQuick(cmd) { this.send({ t: 'quick', cmd }); }
  sendFinish(time, score, dnf, driver) { this.send({ t: 'finish', time, score, dnf, driver }); }

  // ---- голос WebRTC ----
  async enableMic() {
    if (this.localStream) { this.micOn = true; this._applyMicGate(); this._broadcastVoiceState(); return true; }
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: S.echoCancel, noiseSuppression: S.noiseSupp, autoGainControl: true },
      });
    } catch (err) { this.onError?.('Нет доступа к микрофону: ' + (err.name === 'NotAllowedError' ? 'разрешите микрофон в браузере' : err.message)); return false; }
    this.micOn = true;
    const track = this.localStream.getAudioTracks()[0];
    for (const peer of this.peers.values()) this._attachTrack(peer, track);
    this._startVAD();
    this._applyMicGate();
    this._broadcastVoiceState();
    return true;
  }
  disableMic() {
    this.micOn = false;
    this.localStream?.getAudioTracks().forEach(t => { t.enabled = false; });
    this.speaking = false;
    this._broadcastVoiceState();
  }
  setPTT(active) { this.pttActive = active; this._applyMicGate(); }
  get micLive() {
    if (!this.micOn || !this.localStream) return false;
    if (S.micMode === 'off') return false;
    if (S.micMode === 'open') return true;
    return this.pttActive; // ptt
  }
  _applyMicGate() {
    const live = this.micLive;
    this.localStream?.getAudioTracks().forEach(t => t.enabled = live);
    if (!live && this.speaking) { this.speaking = false; this._broadcastVoiceState(); }
  }
  _broadcastVoiceState() { this.send({ t: 'voiceState', speaking: this.speaking, muted: !this.micLive, hasMic: !!this.localStream }); this.onVoiceState?.(this.myId, { speaking: this.speaking, muted: !this.micLive, hasMic: !!this.localStream }); }

  _startVAD() {
    try {
      this._audioCtx = this._audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const src = this._audioCtx.createMediaStreamSource(this.localStream);
      this._analyser = this._audioCtx.createAnalyser(); this._analyser.fftSize = 512;
      src.connect(this._analyser);
      const buf = new Uint8Array(this._analyser.frequencyBinCount);
      clearInterval(this._vadTimer);
      this._vadTimer = setInterval(() => {
        if (!this._analyser) return;
        this._analyser.getByteTimeDomainData(buf);
        let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        this.micLevel = Math.min(1, Math.sqrt(sum / buf.length) * 4);
        const speakingNow = this.micLive && this.micLevel > 0.06;
        if (speakingNow !== this.speaking) { this.speaking = speakingNow; this._broadcastVoiceState(); }
      }, 110);
    } catch {}
  }

  _syncPeers() {
    if (!this.code) return;
    const others = this.players.filter(p => p.id !== this.myId);
    for (const p of others) if (!this.peers.has(p.id)) this._createPeer(p.id, this.myId < p.id);
    for (const id of [...this.peers.keys()]) if (!others.find(p => p.id === id)) this._closePeer(id);
    this.refreshVoiceVolumes();
  }
  _createPeer(id, initiator) {
    const pc = new RTCPeerConnection(ICE);
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true; audioEl.playsInline = true; audioEl.style.display = 'none';
    document.body.appendChild(audioEl);
    const peer = { pc, audioEl, sender: null, makingOffer: false };
    this.peers.set(id, peer);
    pc.ontrack = (ev) => { audioEl.srcObject = ev.streams[0]; audioEl.play?.().catch(() => {}); this.refreshVoiceVolumes(); };
    pc.onicecandidate = (ev) => { if (ev.candidate) this.send({ t: 'signal', to: id, data: { candidate: ev.candidate } }); };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.send({ t: 'signal', to: id, data: { desc: pc.localDescription } });
      } catch {} finally { peer.makingOffer = false; }
    };
    const track = this.localStream?.getAudioTracks()[0];
    if (track) this._attachTrack(peer, track);
    else pc.addTransceiver('audio', { direction: 'recvonly' });
    if (initiator) pc.dispatchEvent(new Event('negotiationneeded'));
    return peer;
  }
  _attachTrack(peer, track) {
    const sender = peer.pc.getSenders().find(s => s.track?.kind === 'audio' || !s.track);
    if (sender) { sender.replaceTrack(track).catch(() => {}); peer.sender = sender; }
    else peer.sender = peer.pc.addTrack(track, this.localStream);
  }
  async _onSignal(from, data) {
    let peer = this.peers.get(from);
    if (!peer) peer = this._createPeer(from, false);
    const pc = peer.pc;
    try {
      if (data.desc) {
        const polite = this.myId > from;
        const collision = data.desc.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        if (collision && !polite) return;
        await pc.setRemoteDescription(data.desc);
        if (data.desc.type === 'offer') {
          await pc.setLocalDescription();
          this.send({ t: 'signal', to: from, data: { desc: pc.localDescription } });
        }
      } else if (data.candidate) {
        await pc.addIceCandidate(data.candidate);
      }
    } catch (e) { /* гонки сигналинга игнорируем */ }
  }
  _closePeer(id) {
    const peer = this.peers.get(id); if (!peer) return;
    try { peer.pc.close(); } catch {}
    peer.audioEl.remove();
    this.peers.delete(id);
  }
  closeAllPeers() { for (const id of [...this.peers.keys()]) this._closePeer(id); }
  setPlayerMuted(id, v) { v ? this.mutedPlayers.add(id) : this.mutedPlayers.delete(id); this.refreshVoiceVolumes(); }
  refreshVoiceVolumes() {
    const me = this.me;
    for (const [id, peer] of this.peers) {
      const p = this.players.find(x => x.id === id);
      let vol = S.voiceVol;
      if (this.mutedPlayers.has(id)) vol = 0;
      else if ((this.cfg?.voiceChannel || S.voiceChannel) === 'team' && me && p && p.team !== me.team) vol = 0; // только своя команда
      peer.audioEl.volume = Math.max(0, Math.min(1, vol));
    }
  }
}
export const net = new Net();
