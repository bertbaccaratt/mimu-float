// MIMU FLOATZ — procedural UI SFX + low-fi race ambience (Web Audio API)

const AudioEngine = (() => {
  const STORAGE_KEY = 'mimu-floatz-muted';
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let musicRunning = false;
  let musicTimer = null;
  let musicStep = 0;
  let vinylNode = null;
  let muted = localStorage.getItem(STORAGE_KEY) === '1';

  function ensureContext() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    applyMasterVolume();
    musicGain = ctx.createGain();
    musicGain.connect(masterGain);
    musicGain.gain.value = 0.038;
    return ctx;
  }

  function applyMasterVolume() {
    if (!masterGain) return;
    masterGain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
  }

  function isMuted() {
    return muted;
  }

  function setMuted(value) {
    muted = !!value;
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    applyMasterVolume();
    if (muted) stopRaceMusic(true);
    updateMuteButton();
  }

  function toggleMute() {
    ensureContext();
    setMuted(!muted);
    if (!muted) {
      playUiClick('select');
      const raceEl = document.getElementById('race');
      if (raceEl && !raceEl.classList.contains('hidden')) {
        startRaceMusic();
      }
    }
  }

  function updateMuteButton() {
    const btn = document.getElementById('mute-toggle');
    if (!btn) return;
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    btn.title = muted ? 'Unmute sound' : 'Mute sound';
    btn.querySelector('.mute-icon').textContent = muted ? '🔇' : '🔊';
  }

  function initMuteButton() {
    const btn = document.getElementById('mute-toggle');
    if (!btn) return;
    updateMuteButton();
    btn.addEventListener('click', () => toggleMute());
  }

  function playUiClick(variant = 'default') {
    if (muted) return;
    const ac = ensureContext();
    if (!ac) return;

    const t = ac.currentTime;
    const out = ac.createGain();
    out.connect(masterGain);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(variant === 'primary' ? 0.14 : 0.1, t + 0.004);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);

    const tone = ac.createOscillator();
    const toneGain = ac.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(
      variant === 'primary' ? 520 : variant === 'remove' ? 380 : variant === 'select' ? 640 : 480,
      t
    );
    tone.frequency.exponentialRampToValueAtTime(
      variant === 'remove' ? 280 : 320,
      t + 0.045
    );
    toneGain.gain.value = variant === 'primary' ? 0.55 : 0.42;
    tone.connect(toneGain);
    toneGain.connect(out);
    tone.start(t);
    tone.stop(t + 0.08);

    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.025), ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = 1 - i / data.length;
      data[i] = (Math.random() * 2 - 1) * env * env;
    }
    const noise = ac.createBufferSource();
    noise.buffer = buf;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = variant === 'select' ? 2200 : 1800;
    const noiseGain = ac.createGain();
    noiseGain.gain.value = variant === 'primary' ? 0.08 : 0.05;
    noise.connect(hp);
    hp.connect(noiseGain);
    noiseGain.connect(out);
    noise.start(t);
    noise.stop(t + 0.03);
  }

  const LOFI_PROGRESSION = [
    { f: [220, 261.63, 329.63, 392], d: 1.8 },
    { f: [174.61, 220, 261.63, 329.63], d: 1.8 },
    { f: [261.63, 329.63, 392, 493.88], d: 1.8 },
    { f: [196, 246.94, 293.66, 369.99], d: 1.8 },
  ];

  function playLoFiChord(freqs, start, duration) {
    if (!ctx || muted) return;
    const t = start;
    const chordGain = ctx.createGain();
    chordGain.connect(musicGain);
    chordGain.gain.setValueAtTime(0.0001, t);
    chordGain.gain.linearRampToValueAtTime(0.22, t + 0.08);
    chordGain.gain.setValueAtTime(0.18, t + duration - 0.12);
    chordGain.gain.linearRampToValueAtTime(0.0001, t + duration);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(680, t);
    lp.Q.value = 0.6;
    lp.connect(chordGain);

    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const detune = (i - 1.5) * 6;
      osc.frequency.setValueAtTime(freq, t);
      osc.detune.value = detune;
      const v = ctx.createGain();
      v.gain.value = 0.11 / freqs.length;
      osc.connect(v);
      v.connect(lp);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    });
  }

  function playLoFiKick(start) {
    if (!ctx || muted) return;
    const t = start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.11);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g);
    g.connect(musicGain);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  function playLoFiHat(start) {
    if (!ctx || muted) return;
    const t = start;
    const len = Math.floor(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.value = 0.018;
    src.connect(hp);
    hp.connect(g);
    g.connect(musicGain);
    src.start(t);
    src.stop(t + 0.04);
  }

  function startVinylBed() {
    if (!ctx || vinylNode || muted) return;
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.018 * white) / 1.018;
      data[i] = last;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.014;
    src.connect(lp);
    lp.connect(g);
    g.connect(musicGain);
    src.start();
    vinylNode = src;
  }

  function stopVinylBed() {
    if (!vinylNode) return;
    try { vinylNode.stop(); } catch (_) { /* already stopped */ }
    vinylNode = null;
  }

  function scheduleMusicStep() {
    if (!musicRunning || !ctx || muted) return;

    const bar = LOFI_PROGRESSION[musicStep % LOFI_PROGRESSION.length];
    const start = ctx.currentTime + 0.05;
    const beat = bar.d / 4;

    playLoFiChord(bar.f, start, bar.d * 0.92);
    for (let b = 0; b < 4; b++) {
      playLoFiKick(start + b * beat);
      if (b % 2 === 1) playLoFiHat(start + b * beat + beat * 0.5);
    }

    musicStep += 1;
    musicTimer = setTimeout(scheduleMusicStep, bar.d * 1000 - 40);
  }

  function startRaceMusic() {
    if (muted) return;
    ensureContext();
    if (!ctx) return;
    if (musicRunning) return;
    musicRunning = true;
    musicStep = 0;
    startVinylBed();
    scheduleMusicStep();
  }

  function stopRaceMusic(immediate = false) {
    musicRunning = false;
    stopVinylBed();
    if (musicTimer) {
      clearTimeout(musicTimer);
      musicTimer = null;
    }
    if (musicGain && ctx && !immediate) {
      const t = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(t);
      musicGain.gain.setValueAtTime(musicGain.gain.value, t);
      musicGain.gain.linearRampToValueAtTime(0.0001, t + 0.6);
      setTimeout(() => {
        if (!musicRunning && musicGain) musicGain.gain.value = 0.038;
      }, 650);
    }
  }

  function bindSetupUiSounds() {
    const setup = document.getElementById('setup');
    if (!setup) return;
    setup.addEventListener('click', (e) => {
      const betOption = e.target.closest('.bet-option');
      const btn = e.target.closest('button');
      if (!betOption && !btn) return;
      ensureContext();
      if (btn?.classList.contains('btn-primary')) playUiClick('primary');
      else if (btn?.classList.contains('btn-remove')) playUiClick('remove');
      else if (betOption) playUiClick('select');
      else if (btn) playUiClick();
    });
  }

  function bindOverlayUiSounds() {
    document.getElementById('double-or-nothin')?.addEventListener('click', () => {
      ensureContext();
      playUiClick('primary');
    });
    document.getElementById('race-again')?.addEventListener('click', () => {
      ensureContext();
      playUiClick();
    });
  }

  function init() {
    initMuteButton();
    bindSetupUiSounds();
    bindOverlayUiSounds();
  }

  function playEpicWin() {
    if (muted) return;
    const ac = ensureContext();
    if (!ac) return;

    const t = ac.currentTime;
    const out = ac.createGain();
    out.connect(masterGain);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.2, t + 0.03);
    out.gain.exponentialRampToValueAtTime(0.08, t + 0.5);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);

    [392, 493.88, 587.33, 783.99].forEach((freq, i) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = i === 3 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.07);
      g.gain.setValueAtTime(0.0001, t + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.12 / (i + 1), t + i * 0.07 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.55);
      osc.connect(g);
      g.connect(out);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.6);
    });
  }

  return {
    init,
    ensureContext,
    playUiClick,
    playEpicWin,
    startRaceMusic,
    stopRaceMusic,
    toggleMute,
    isMuted,
  };
})();

document.addEventListener('DOMContentLoaded', () => AudioEngine.init());
