// MIMU FLOATZ — duration-based float racing

const MAX_DUCKS = 27;
const PLAYER_SPRITE_IDS = [
  'wakanda', 'stoned', 'jedi', 'wizard', 'ninja', 'spiderman',
  'lego', 'space', 'rocket', 'pineapples',
  'luigi', 'bobby', 'super-eggy', 'greenmolt', 'pharoe', 'arggh', 'purple',
  'pirate', 'wizard2', 'mamamia', 'cyborg', 'alien', 'mushy', 'viking', 'samurai',
  'luigi', 'mushy',
];
const TAG_COLORS = [
  '#5eb8d4', '#d4845a', '#a78bfa', '#f472b6', '#34d399', '#fbbf24',
  '#60a5fa', '#fb7185', '#4ade80', '#c084fc', '#22d3ee', '#f97316',
  '#a3e635', '#e879f9', '#38bdf8', '#fb923c', '#4ade80', '#facc15',
  '#c084fc', '#2dd4bf', '#818cf8', '#f472b6', '#94a3b8', '#ef4444', '#14b8a6',
  '#eab308', '#8b5cf6',
];
const DEFAULT_NAMES = [
  'Mimu', 'Floatz', 'Splash', 'Ripple', 'Drift', 'Surge',
  'Wave', 'Current', 'Spray', 'Glide', 'Luigi', 'Bobby',
  'Eggy', 'Molt', 'Pharoe', 'Arggh', 'Purple', 'Pirate',
  'Merlin', 'Mama', 'Cyborg', 'Alien', 'Mushy', 'Viking', 'Samurai',
  'Luigi2', 'Mushy2',
];
const MAX_RACE_SEC = 3600;
const MIN_RACE_SEC = 5;
const ADMIN_PASSWORD = '5555umimwen';
const BROADCAST_KEY = 'mimu-floatz-broadcast';
const PRE_RACE_COUNTDOWN_MS = 30000;

const spriteImages = {};
let spritesReady = false;
let appMode = null; // 'public' | 'admin'
let activeRaceId = null;
let publicSyncTimer = null;
let currentPanel = 'enter';

const SPRITE_PATH = 'assets/sprites/trimmed';

function loadSprites() {
  const unique = [...new Set(PLAYER_SPRITE_IDS)];
  return Promise.all(unique.map(id => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      spriteImages[id] = { img, width: img.naturalWidth, height: img.naturalHeight };
      resolve();
    };
    img.onerror = () => reject(new Error(`Failed to load sprite: ${id}`));
    img.src = `${SPRITE_PATH}/${id}.png`;
  }))).then(() => { spritesReady = true; });
}

function getSpriteId(index) {
  return PLAYER_SPRITE_IDS[index % PLAYER_SPRITE_IDS.length];
}

const RACE_LAYOUT = {
  targetSpriteHeight(laneCount) {
    if (laneCount <= 3) return 108;
    if (laneCount <= 6) return 98;
    if (laneCount <= 10) return 88;
    if (laneCount <= 16) return 76;
    if (laneCount <= 22) return 66;
    return 58;
  },

  planCanvasHeight(containerWidth, laneCount) {
    const spriteH = this.targetSpriteHeight(laneCount);
    const laneSpacing = spriteH * 0.62;
    const skyH = laneCount <= 5
      ? containerWidth * 0.28
      : laneCount <= 12
        ? containerWidth * 0.14
        : containerWidth * 0.085;
    const waterH = laneSpacing * laneCount + spriteH * 0.18;
    return Math.ceil(Math.max(containerWidth * (9 / 16), skyH + waterH));
  },

  compute(w, h, laneCount) {
    const spriteH = this.targetSpriteHeight(laneCount);
    const skyRatio = laneCount <= 5 ? 0.26 : laneCount <= 12 ? 0.11 : 0.075;
    const waterTop = h * skyRatio;
    const waterBottom = h - 6;
    const laneSpacing = (waterBottom - waterTop) / laneCount;
    return { waterTop, waterBottom, laneSpacing, spriteH, laneCount };
  },
};

function getScaledSpriteSize(spriteH, sprite) {
  const scale = spriteH / sprite.height;
  return { w: sprite.width * scale, h: spriteH, scale };
}

function computeSharedTouchProgress(laneCount, duckList) {
  const refW = 960;
  const refH = RACE_LAYOUT.planCanvasHeight(refW, laneCount);
  const { spriteH } = RACE_LAYOUT.compute(refW, refH, laneCount);
  const startX = refW * 0.08;
  const finishX = refW * 0.88;
  const trackLen = finishX - startX;
  let maxFrontReach = 50;
  duckList.forEach((duck, i) => {
    const sprite = spriteImages[duck.spriteId || getSpriteId(i)];
    if (sprite) {
      const size = getScaledSpriteSize(spriteH, sprite);
      maxFrontReach = Math.max(maxFrontReach, size.w * 0.55);
    }
  });
  return (finishX - maxFrontReach - startX) / trackLen;
}

function setRaceCanvasForLaneCount(laneCount) {
  const width = raceSection.getBoundingClientRect().width || 960;
  const height = RACE_LAYOUT.planCanvasHeight(width, laneCount);
  canvas.style.aspectRatio = 'auto';
  canvas.style.height = `${height}px`;
}

function resetRaceCanvasSize() {
  canvas.style.height = '';
  canvas.style.aspectRatio = '16 / 9';
}

// --- State ---
let ducks = [];
let raceAnimId = null;
let raceStartTime = null;
let scene = {};
let confetti = [];

// --- DOM ---
const enterPanel = document.getElementById('enter');
const waitingPanel = document.getElementById('waiting');
const setupPanel = document.getElementById('setup');
const raceSection = document.getElementById('race');
const adminGate = document.getElementById('admin-gate');
const adminPasswordInput = document.getElementById('admin-password');
const adminErrorEl = document.getElementById('admin-error');
const waitingStatusEl = document.getElementById('waiting-status');
const waitingPreviewEl = document.getElementById('waiting-preview');
const duckListEl = document.getElementById('duck-list');
const durationMinInput = document.getElementById('duration-min');
const durationSecInput = document.getElementById('duration-sec');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const raceOverlay = document.getElementById('race-overlay');
const winnerCardEl = document.getElementById('winner-card');
const winnerNameEl = document.getElementById('winner-name');
const winnerWitnessEl = document.getElementById('winner-witness');
const winnerPrizeEl = document.getElementById('winner-prize');
const winnerSubEl = document.getElementById('winner-sub');
const betAmountInput = document.getElementById('bet-amount');
const betUnitLabel = document.getElementById('bet-unit-label');
const betPotHint = document.getElementById('bet-pot-hint');
const betTypeInputs = document.querySelectorAll('input[name="bet-type"]');
const preRaceCountdownEl = document.getElementById('pre-race-countdown');
const countdownNumberEl = document.getElementById('countdown-number');
const countdownHintEl = document.getElementById('countdown-hint');
let lastCountdownSec = -1;

// --- Setup UI ---
function renderDuckList() {
  duckListEl.innerHTML = '';
  ducks.forEach((duck, i) => {
    const row = document.createElement('div');
    row.className = 'duck-row';
    const sid = duck.spriteId || getSpriteId(i);
    row.innerHTML = `
      <div class="duck-badge"><img src="${SPRITE_PATH}/${sid}.png" alt=""></div>
      <input type="text" value="${escapeHtml(duck.name)}" maxlength="20" placeholder="Racer name..." data-index="${i}">
      <button type="button" class="btn-remove" data-index="${i}" title="Remove">×</button>
    `;
    duckListEl.appendChild(row);
  });

  document.getElementById('add-duck').style.display = ducks.length >= MAX_DUCKS ? 'none' : '';
  updateBetPotHint();

  duckListEl.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', e => {
      ducks[+e.target.dataset.index].name = e.target.value.trim() || 'Unnamed Mimu';
    });
  });

  duckListEl.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      if (ducks.length <= 2) return;
      ducks.splice(+btn.dataset.index, 1);
      ducks.forEach((d, idx) => {
        d.spriteId = getSpriteId(idx);
        d.tagColor = TAG_COLORS[idx % TAG_COLORS.length];
      });
      renderDuckList();
    });
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function addDuck(name) {
  if (ducks.length >= MAX_DUCKS) return;
  const i = ducks.length;
  ducks.push({
    name: name || DEFAULT_NAMES[i % DEFAULT_NAMES.length],
    spriteId: getSpriteId(i),
    tagColor: TAG_COLORS[i % TAG_COLORS.length],
    x: 0,
    y: 0,
    progress: 0,
    bobPhase: Math.random() * Math.PI * 2,
    splashes: [],
    displaySize: null,
  });
  renderDuckList();
}

function clampDurationInputs() {
  let min = Math.max(0, Math.min(60, parseInt(durationMinInput.value, 10) || 0));
  let sec = Math.max(0, Math.min(59, parseInt(durationSecInput.value, 10) || 0));
  let total = min * 60 + sec;

  if (total > MAX_RACE_SEC) {
    min = 60;
    sec = 0;
  }
  if (total < MIN_RACE_SEC) {
    min = 0;
    sec = MIN_RACE_SEC;
  }

  durationMinInput.value = min;
  durationSecInput.value = sec;
  return min * 60 + sec;
}

durationMinInput.addEventListener('change', clampDurationInputs);
durationSecInput.addEventListener('change', clampDurationInputs);

document.getElementById('add-duck').addEventListener('click', () => addDuck());
document.getElementById('start-race').addEventListener('click', () => startRaceFromSetup());
document.getElementById('race-again').addEventListener('click', resetToSetup);
document.getElementById('double-or-nothin').addEventListener('click', startDoubleOrNothin);
document.getElementById('btn-wait-race').addEventListener('click', enterPublicWaiting);
document.getElementById('btn-admin').addEventListener('click', openAdminGate);
document.getElementById('admin-submit').addEventListener('click', tryAdminLogin);
document.getElementById('admin-cancel').addEventListener('click', closeAdminGate);
document.getElementById('btn-leave-waiting').addEventListener('click', returnToEnter);
document.getElementById('public-wait-next').addEventListener('click', returnToPublicWaiting);

adminPasswordInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') tryAdminLogin();
});

window.addEventListener('storage', e => {
  if (e.key === BROADCAST_KEY && appMode === 'public') {
    handleBroadcastUpdate(readBroadcast());
  }
});

betAmountInput.addEventListener('input', () => {
  betAmountInput.value = Math.max(1, parseInt(betAmountInput.value, 10) || 1);
  updateBetPotHint();
});
betAmountInput.addEventListener('change', () => {
  betAmountInput.value = Math.max(1, parseInt(betAmountInput.value, 10) || 1);
  updateBetPotHint();
});
betTypeInputs.forEach(input => {
  input.addEventListener('change', updateBetUnitLabel);
});

const BET_DEFAULTS = { ape: 500, mimu: 1 };

function getDefaultBetStake(type) {
  return BET_DEFAULTS[type] ?? 500;
}
function readBetSettings() {
  const type = document.querySelector('input[name="bet-type"]:checked')?.value === 'mimu' ? 'mimu' : 'ape';
  const stake = Math.max(1, parseInt(betAmountInput.value, 10) || getDefaultBetStake(type));
  return { type, stake };
}

function formatBetTotal(bet, playerCount) {
  const total = bet.stake * playerCount;
  if (bet.type === 'ape') {
    return `${total.toLocaleString()} $APE`;
  }
  const label = total === 1 ? 'MIMU NFT' : 'MIMU NFTs';
  return `${total.toLocaleString()} ${label}`;
}

function formatBetStake(bet) {
  if (bet.type === 'ape') {
    return `${bet.stake.toLocaleString()} $APE`;
  }
  const label = bet.stake === 1 ? 'MIMU NFT' : 'MIMU NFTs';
  return `${bet.stake.toLocaleString()} ${label}`;
}

function updateBetUnitLabel() {
  const type = document.querySelector('input[name="bet-type"]:checked')?.value === 'mimu' ? 'mimu' : 'ape';
  betAmountInput.value = getDefaultBetStake(type);
  betUnitLabel.textContent = type === 'ape' ? '$APE per racer' : 'MIMU NFT per racer';
  updateBetPotHint();
}

function updateBetPotHint() {
  const bet = readBetSettings();
  const total = formatBetTotal(bet, ducks.length);
  const stake = formatBetStake(bet);
  betPotHint.textContent = `Total pot: ${total} (${stake} × ${ducks.length} racers)`;
  publishWaitingPreview();
}

function readBroadcast() {
  try {
    const raw = localStorage.getItem(BROADCAST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function publishBroadcast(data) {
  localStorage.setItem(BROADCAST_KEY, JSON.stringify({ ...data, updatedAt: Date.now() }));
}

function publishWaitingPreview() {
  if (appMode !== 'admin') return;
  const bet = readBetSettings();
  publishBroadcast({
    state: 'waiting',
    preview: {
      racerCount: ducks.length,
      pot: formatBetTotal(bet, ducks.length),
    },
  });
}

function setAppMode(mode) {
  appMode = mode;
  document.body.classList.toggle('mode-admin', mode === 'admin');
  document.body.classList.toggle('mode-public', mode === 'public');
}

function showPanel(name) {
  currentPanel = name;
  enterPanel.classList.toggle('hidden', name !== 'enter');
  waitingPanel.classList.toggle('hidden', name !== 'waiting');
  setupPanel.classList.toggle('hidden', name !== 'setup');
  raceSection.classList.toggle('hidden', name !== 'race');
}

function updateWaitingUI(broadcast) {
  if (!broadcast || broadcast.state === 'waiting') {
    waitingStatusEl.textContent = 'Hang tight — the next race is being prepared…';
    if (broadcast?.preview) {
      waitingPreviewEl.textContent = `${broadcast.preview.racerCount} racers · ${broadcast.preview.pot} pot`;
    } else {
      waitingPreviewEl.textContent = '';
    }
  } else if (broadcast.state === 'countdown') {
    const sec = Math.max(0, Math.ceil(((broadcast.countdownEndsAt || broadcast.startedAt) - Date.now()) / 1000));
    waitingStatusEl.textContent = sec > 0 ? `Get ready! Race starts in ${sec}…` : 'Race is starting!';
    waitingPreviewEl.textContent = broadcast.preview
      ? `${broadcast.preview.racerCount} racers · ${broadcast.preview.pot} pot · vote now!`
      : 'Head to the race view to place your picks!';
  } else if (broadcast.state === 'racing') {
    waitingStatusEl.textContent = 'Race is starting — get ready!';
    waitingPreviewEl.textContent = broadcast.preview
      ? `${broadcast.preview.racerCount} racers · ${broadcast.preview.pot} pot`
      : '';
  } else if (broadcast.state === 'finished') {
    waitingStatusEl.textContent = 'Race complete — waiting for the next one…';
    waitingPreviewEl.textContent = '';
  }
}

function stopPublicSync() {
  if (publicSyncTimer) {
    clearInterval(publicSyncTimer);
    publicSyncTimer = null;
  }
}

function startPublicSync() {
  stopPublicSync();
  const tick = () => handleBroadcastUpdate(readBroadcast());
  tick();
  publicSyncTimer = setInterval(tick, 400);
}

function handleBroadcastUpdate(broadcast) {
  if (appMode !== 'public' || !broadcast) return;

  if (currentPanel === 'waiting') {
    updateWaitingUI(broadcast);
    if ((broadcast.state === 'countdown' || broadcast.state === 'racing')
        && broadcast.raceId !== activeRaceId) {
      joinPublicRace(broadcast);
    }
  }

  if (currentPanel === 'race' && scene.preRace && broadcast.state === 'racing'
      && broadcast.raceId === activeRaceId) {
    activateRace();
  }

  if (currentPanel === 'race') {
    if (broadcast.state === 'finished' && broadcast.raceId === activeRaceId && !scene.raceOver) {
      finishRaceFromSync();
    }
    if (broadcast.state === 'waiting' && scene.raceOver) {
      returnToPublicWaiting();
    }
  }
}

function openAdminGate() {
  adminErrorEl.classList.add('hidden');
  adminPasswordInput.value = '';
  adminGate.classList.remove('hidden');
  adminGate.setAttribute('aria-hidden', 'false');
  adminPasswordInput.focus();
}

function closeAdminGate() {
  adminGate.classList.add('hidden');
  adminGate.setAttribute('aria-hidden', 'true');
}

function tryAdminLogin() {
  if (adminPasswordInput.value !== ADMIN_PASSWORD) {
    adminErrorEl.classList.remove('hidden');
    return;
  }
  closeAdminGate();
  setAppMode('admin');
  showPanel('setup');
  publishWaitingPreview();
  AudioEngine.ensureContext();
}

function enterPublicWaiting() {
  setAppMode('public');
  showPanel('waiting');
  activeRaceId = null;
  startPublicSync();
  AudioEngine.ensureContext();
}

function returnToPublicWaiting() {
  cancelAnimationFrame(raceAnimId);
  raceOverlay.classList.add('hidden');
  raceOverlay.classList.remove('race-overlay--epic');
  winnerCardEl.classList.remove('winner-card--epic');
  winnerWitnessEl.classList.add('hidden');
  confetti = [];
  raceStartTime = null;
  activeRaceId = null;
  showPreRaceCountdown(false);
  lastCountdownSec = -1;
  scene = {};
  AudioEngine.stopRaceMusic();
  resetRaceCanvasSize();
  Predictions.hide();
  showPanel('waiting');
  startPublicSync();
}

function returnToEnter() {
  stopPublicSync();
  setAppMode(null);
  document.body.classList.remove('mode-admin', 'mode-public');
  activeRaceId = null;
  showPanel('enter');
  ArenaStats.render();
}

function collectDuckNames() {
  duckListEl.querySelectorAll('input').forEach((input, i) => {
    if (ducks[i]) ducks[i].name = input.value.trim() || `Duck ${i + 1}`;
  });
}

function validateSetup() {
  if (!spritesReady) {
    alert('Sprites still loading — try again in a moment!');
    return false;
  }
  collectDuckNames();
  if (ducks.length < 2) {
    alert('Add at least 2 racers!');
    return false;
  }
  const total = clampDurationInputs();
  if (total < MIN_RACE_SEC) {
    alert(`Race must be at least ${MIN_RACE_SEC} seconds.`);
    return false;
  }
  const bet = readBetSettings();
  if (bet.stake < 1) {
    alert('Enter a wager of at least 1.');
    return false;
  }
  return true;
}

class RaceRng {
  constructor(fromSeed = null) {
    this.buf = new Uint32Array(128);
    this.pos = 128;
    if (fromSeed) {
      this.buf.set(fromSeed.slice(0, 128));
      this.pos = 0;
    } else {
      this.reseed();
    }
  }

  reseed() {
    if (window.crypto && crypto.getRandomValues) {
      crypto.getRandomValues(this.buf);
    } else {
      for (let i = 0; i < this.buf.length; i++) {
        this.buf[i] = (Math.random() * 0x100000000) >>> 0;
      }
    }
    this.pos = 0;
  }

  nextUint32() {
    if (this.pos >= this.buf.length) this.reseed();
    return this.buf[this.pos++];
  }

  next() {
    return this.nextUint32() / 0x100000000;
  }

  nextInt(max) {
    if (max <= 1) return 0;
    const limit = Math.floor(0x100000000 / max) * max;
    let value;
    do {
      value = this.nextUint32();
    } while (value >= limit);
    return value % max;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

function pickRandomWinner(count, rng) {
  const slots = rng.shuffle(Array.from({ length: count }, (_, i) => i));
  return slots[0];
}

function sampleKeyframes(kf, t) {
  if (t <= kf[0].t) return kf[0].p;
  if (t >= kf[kf.length - 1].t) return kf[kf.length - 1].p;
  for (let i = 0; i < kf.length - 1; i++) {
    if (t >= kf[i].t && t <= kf[i + 1].t) {
      const local = (t - kf[i].t) / (kf[i + 1].t - kf[i].t);
      const smooth = local * local * (3 - 2 * local);
      return lerp(kf[i].p, kf[i + 1].p, smooth);
    }
  }
  return kf[kf.length - 1].p;
}

function buildDuckKeyframes(startProgress, touchProgress, durationMs, rng, isWinner) {
  const trackRange = touchProgress - startProgress;
  const nearFinish = touchProgress - (isWinner ? 0.012 : 0.04);
  const lowBand = startProgress + trackRange * 0.05;
  const midBand = startProgress + trackRange * 0.45;
  const highBand = startProgress + trackRange * (isWinner ? 0.82 : 0.68);
  const phase = rng.next() * 6.28;
  const kf = [{ t: 0, p: startProgress }];

  const chargeCount = Math.max(5, Math.floor(durationMs / 2600));
  for (let c = 0; c < chargeCount; c++) {
    const chargeT = 0.04 + ((c / chargeCount) * 0.92 + rng.next() * 0.06 + phase * 0.006) % 0.94;
    const chargeDepth = nearFinish - rng.next() * trackRange * (isWinner ? 0.08 : 0.14);
    const retreatT = chargeT + 0.012 + rng.next() * 0.028;
    const retreatDepth = lowBand + trackRange * (0.12 + rng.next() * (isWinner ? 0.42 : 0.52));

    kf.push({ t: chargeT, p: chargeDepth });
    kf.push({ t: retreatT, p: retreatDepth });

    if (rng.next() < (isWinner ? 0.62 : 0.5)) {
      const reSurgeT = retreatT + 0.008 + rng.next() * 0.022;
      kf.push({
        t: reSurgeT,
        p: midBand + trackRange * (0.1 + rng.next() * (isWinner ? 0.45 : 0.35)),
      });
    }
  }

  const swerveCount = Math.max(8, Math.floor(durationMs / 1800));
  for (let s = 0; s < swerveCount; s++) {
    kf.push({
      t: 0.04 + rng.next() * 0.94,
      p: lowBand + rng.next() * trackRange * (isWinner ? 0.82 : 0.72),
    });
  }

  const lateSurges = Math.max(4, Math.floor(durationMs / 5000));
  for (let s = 0; s < lateSurges; s++) {
    const t0 = 0.78 + (s / lateSurges) * 0.19 + rng.next() * 0.015;
    kf.push({ t: t0, p: nearFinish - rng.next() * trackRange * (isWinner ? 0.06 : 0.12) });
    kf.push({ t: t0 + 0.01 + rng.next() * 0.02, p: midBand + rng.next() * trackRange * 0.35 });
  }

  kf.sort((a, b) => a.t - b.t);

  const merged = [kf[0]];
  for (let i = 1; i < kf.length; i++) {
    if (kf[i].t - merged[merged.length - 1].t < 0.01) {
      merged[merged.length - 1].p = kf[i].p;
    } else {
      merged.push(kf[i]);
    }
  }

  const cap = isWinner ? touchProgress - 0.006 : nearFinish;
  for (const k of merged) {
    k.p = Math.max(startProgress, Math.min(cap, k.p));
  }

  merged.push({ t: 0.995, p: isWinner ? nearFinish : midBand + trackRange * rng.next() * 0.35 });
  return merged;
}

function buildRaceTrajectories(duckCount, winnerIndex, raceDurationMs, startProgress, touchProgress, rng) {
  const steps = Math.max(240, Math.floor(raceDurationMs / 100));
  const allKeyframes = Array.from({ length: duckCount }, (_, i) =>
    buildDuckKeyframes(startProgress, touchProgress, raceDurationMs, rng, i === winnerIndex)
  );

  const history = Array.from({ length: duckCount }, () => []);

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    for (let i = 0; i < duckCount; i++) {
      history[i].push(sampleKeyframes(allKeyframes[i], t));
    }
  }

  pinPhotoFinish(history, winnerIndex, startProgress, touchProgress, steps);
  return { trajectories: history, steps };
}

function pinPhotoFinish(history, winnerIndex, startProgress, touchProgress, steps) {
  const last = steps;
  const gaps = Array.from({ length: MAX_DUCKS }, (_, i) => 0.045 + i * 0.018);
  const snapFrame = Math.max(1, last - 1);

  let leaderIdx = winnerIndex;
  let leaderPos = history[winnerIndex][snapFrame];
  history.forEach((h, i) => {
    if (h[snapFrame] > leaderPos) {
      leaderPos = h[snapFrame];
      leaderIdx = i;
    }
  });

  if (leaderIdx !== winnerIndex) {
    const swap = history[winnerIndex][snapFrame];
    history[winnerIndex][snapFrame] = leaderPos + 0.004;
    history[leaderIdx][snapFrame] = swap - 0.006;
  }

  history[winnerIndex][last] = touchProgress;

  const others = history
    .map((h, i) => ({ i, p: h[snapFrame] }))
    .filter(d => d.i !== winnerIndex)
    .sort((a, b) => b.p - a.p);

  others.forEach((o, rank) => {
    const gap = gaps[rank] ?? 0.28 + rank * 0.02;
    const natural = history[o.i][snapFrame] + (touchProgress - history[winnerIndex][snapFrame]) * 0.35;
    history[o.i][last] = Math.min(natural, touchProgress - gap);
    history[o.i][last] = Math.max(startProgress, history[o.i][last]);
  });
}

function sampleTrajectory(trajectories, duckIndex, t) {
  const len = trajectories[0].length;
  const pos = t * (len - 1);
  const idx = Math.floor(pos);
  const frac = pos - idx;
  const a = trajectories[duckIndex][idx];
  const b = trajectories[duckIndex][Math.min(idx + 1, len - 1)];
  return lerp(a, b, frac);
}

function trajectorySpeed(trajectories, duckIndex, t) {
  const dt = 0.004;
  const a = sampleTrajectory(trajectories, duckIndex, Math.max(0, t - dt));
  const b = sampleTrajectory(trajectories, duckIndex, Math.min(1, t + dt));
  return (b - a) / (2 * dt);
}

function computeTargetProgress(duckIndex, elapsedMs) {
  const { raceDurationMs, trajectories, startProgress, touchProgress } = scene;
  const t = Math.min(1, elapsedMs / raceDurationMs);
  const p = sampleTrajectory(trajectories, duckIndex, t);
  return Math.max(startProgress, Math.min(touchProgress, p));
}

function resetToSetup() {
  if (appMode !== 'admin') return;
  cancelAnimationFrame(raceAnimId);
  raceOverlay.classList.add('hidden');
  raceOverlay.classList.remove('race-overlay--epic');
  winnerCardEl.classList.remove('winner-card--epic');
  winnerWitnessEl.classList.add('hidden');
  confetti = [];
  raceStartTime = null;
  activeRaceId = null;
  showPreRaceCountdown(false);
  lastCountdownSec = -1;
  AudioEngine.stopRaceMusic();
  resetRaceCanvasSize();
  publishWaitingPreview();
  showPanel('setup');
}

// --- Canvas sizing ---
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: rect.width, h: rect.height };
}

window.addEventListener('resize', () => {
  if (!raceSection.classList.contains('hidden') && scene.laneCount) {
    setRaceCanvasForLaneCount(scene.laneCount);
  }
  if (!raceSection.classList.contains('hidden')) resizeCanvas();
});

function formatTime(totalSec) {
  const sec = Math.max(0, Math.ceil(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function startRaceFromSetup() {
  if (appMode !== 'admin') return;
  if (!validateSetup()) return;
  launchRace(clampDurationInputs() * 1000, readBetSettings(), false);
}

function startDoubleOrNothin() {
  if (appMode !== 'admin' || !scene.bet) return;
  const doubledStake = scene.bet.stake * 2;
  betAmountInput.value = doubledStake;
  const typeInput = document.querySelector(`input[name="bet-type"][value="${scene.bet.type}"]`);
  if (typeInput) typeInput.checked = true;
  updateBetUnitLabel();

  const bet = {
    type: scene.bet.type,
    stake: doubledStake,
  };

  cancelAnimationFrame(raceAnimId);
  raceOverlay.classList.add('hidden');
  confetti = [];
  raceStartTime = null;

  launchRace(scene.raceDurationMs, bet, true);
}

function prepareRaceFromRng(raceRng, raceDurationMs, bet, isDoubleOrNothin) {
  const winnerIndex = pickRandomWinner(ducks.length, raceRng);
  const startProgress = 0.08;
  const laneCount = ducks.length;

  setRaceCanvasForLaneCount(laneCount);
  const { w, h } = resizeCanvas();
  const { waterTop, laneSpacing, spriteH } = RACE_LAYOUT.compute(w, h, laneCount);
  const startX = w * 0.08;
  const finishX = w * 0.88;
  const trackLen = finishX - startX;

  ducks.forEach((duck, i) => {
    const sprite = spriteImages[duck.spriteId || getSpriteId(i)];
    if (sprite) {
      duck.displaySize = getScaledSpriteSize(spriteH, sprite);
    }
  });
  const touchProgress = computeSharedTouchProgress(laneCount, ducks);

  const laneOrder = raceRng.shuffle(Array.from({ length: laneCount }, (_, i) => i));

  ducks.forEach((duck, i) => {
    duck.y = waterTop + laneSpacing * (laneOrder[i] + 0.5);
    duck.laneY = duck.y;
    duck.progress = startProgress;
    duck.x = startX + duck.progress * trackLen;
    duck.bobPhase = raceRng.next() * Math.PI * 2;
    duck.splashes = [];
    duck.raceSeed = raceRng.next();
    duck.displayProgress = startProgress;
    duck.racing = false;
    duck.fallingBack = false;
  });

  const raceScript = buildRaceTrajectories(
    ducks.length, winnerIndex, raceDurationMs, startProgress, touchProgress, raceRng
  );

  return {
    w, h, startX, finishX, waterTop, laneSpacing, spriteH, laneCount,
    raceDurationMs, winnerIndex, trajectories: raceScript.trajectories,
    startProgress, touchProgress, trackLen,
    bet: { ...bet, playerCount: laneCount, isDoubleOrNothin },
  };
}

function showPreRaceCountdown(show) {
  if (!preRaceCountdownEl) return;
  preRaceCountdownEl.classList.toggle('hidden', !show);
}

function updateCountdownDisplay() {
  if (!scene.preRace || !countdownNumberEl) return;
  const sec = Math.max(0, Math.ceil((scene.startedAt - Date.now()) / 1000));
  countdownNumberEl.textContent = sec > 0 ? String(sec) : 'GO!';
  countdownNumberEl.classList.toggle('countdown-number--go', sec === 0);
  countdownNumberEl.classList.toggle('countdown-number--pulse', sec > 0 && sec <= 3);

  if (countdownHintEl) {
    countdownHintEl.textContent = appMode === 'public'
      ? 'Place your picks below!'
      : 'Race starting soon…';
  }

  if (sec !== lastCountdownSec && sec > 0 && sec <= 3) {
    AudioEngine.ensureContext();
    AudioEngine.playUiClick('select');
  }
  lastCountdownSec = sec;
}

function activateRace() {
  if (!scene.preRace) return;
  scene.preRace = false;
  showPreRaceCountdown(false);
  lastCountdownSec = -1;

  if (appMode === 'admin') {
    const current = readBroadcast() || {};
    publishBroadcast({ ...current, state: 'racing' });
  }

  startRaceMotion(scene.startedAt);
}

function startRaceMotion(startedAtMs) {
  const elapsed = Date.now() - startedAtMs;
  if (elapsed >= scene.raceDurationMs) {
    finishRaceFromSync();
    return;
  }

  raceStartTime = performance.now() - elapsed;
  cancelAnimationFrame(raceAnimId);
  AudioEngine.ensureContext();
  AudioEngine.startRaceMusic();
  raceAnimId = requestAnimationFrame(raceLoop);
}

function preRaceLoop(now) {
  const time = now || performance.now();
  const dt = Math.min(0.05, (time - scene.lastFrameTime) / 1000);
  scene.lastFrameTime = time;
  scene.time += dt;

  ducks.forEach(d => { d.bobPhase += dt * 3; });

  if (scene.flowLines) {
    updateWaterFlow(dt, scene.w, scene.h, scene.waterTop, scene.startX, scene.finishX);
  }
  if (appMode === 'public') Predictions.tick();

  updateCountdownDisplay();

  if (Date.now() >= scene.startedAt) {
    activateRace();
    return;
  }

  drawScene();
  raceAnimId = requestAnimationFrame(preRaceLoop);
}

function applyRaceScene(raceData, startedAtMs, options = {}) {
  const fxLevel = raceData.laneCount > 16 ? 'lite' : raceData.laneCount > 10 ? 'medium' : 'full';
  const preRace = options.preRace ?? (Date.now() < startedAtMs);

  scene = {
    ...raceData,
    startedAt: startedAtMs,
    preRace,
    time: 0,
    ripples: initRipples(raceData.w, raceData.h, raceData.laneCount),
    flowLines: initWaterFlow(raceData.w, raceData.h, raceData.waterTop, raceData.startX, raceData.finishX, raceData.laneCount),
    fxLevel,
    raceOver: false,
    lastFrameTime: performance.now(),
    lastLeader: -1,
  };

  ducks.forEach((duck) => {
    duck.displayProgress = scene.startProgress;
    duck.progress = scene.startProgress;
    duck.x = scene.startX + duck.progress * scene.trackLen;
    duck.splashes = [];
    duck.racing = false;
    duck.fallingBack = false;
  });

  if (preRace) {
    raceStartTime = null;
    lastCountdownSec = -1;
    showPreRaceCountdown(true);
    updateCountdownDisplay();
    cancelAnimationFrame(raceAnimId);
    raceAnimId = requestAnimationFrame(preRaceLoop);
    return;
  }

  showPreRaceCountdown(false);
  startRaceMotion(startedAtMs);
}

function buildRaceBroadcast(raceData, rngSeed, startedAt, preview, state, raceId) {
  return {
    state,
    raceId,
    startedAt,
    countdownEndsAt: state === 'countdown' ? startedAt : undefined,
    rngSeed,
    touchProgress: raceData.touchProgress,
    startProgress: raceData.startProgress,
    raceDurationMs: raceData.raceDurationMs,
    winnerIndex: raceData.winnerIndex,
    bet: raceData.bet,
    preview,
    ducks: ducks.map(d => ({
      name: d.name,
      spriteId: d.spriteId,
      tagColor: d.tagColor,
    })),
  };
}

function restoreDucksFromBroadcast(broadcastDucks) {
  ducks = broadcastDucks.map((d, i) => ({
    name: d.name,
    spriteId: d.spriteId || getSpriteId(i),
    tagColor: d.tagColor || TAG_COLORS[i % TAG_COLORS.length],
    x: 0,
    y: 0,
    progress: 0,
    bobPhase: 0,
    splashes: [],
    displaySize: null,
  }));
}

function joinPublicRace(broadcast) {
  if (!broadcast?.rngSeed) return;
  if (activeRaceId === broadcast.raceId && currentPanel === 'race' && scene && !scene.preRace) return;
  if (!spritesReady) {
    setTimeout(() => joinPublicRace(broadcast), 250);
    return;
  }

  stopPublicSync();
  activeRaceId = broadcast.raceId;
  restoreDucksFromBroadcast(broadcast.ducks);

  showPanel('race');
  raceOverlay.classList.add('hidden');
  raceOverlay.classList.remove('race-overlay--epic');
  winnerCardEl.classList.remove('winner-card--epic');
  winnerWitnessEl.classList.add('hidden');
  confetti = [];

  const raceRng = new RaceRng(broadcast.rngSeed);
  const raceData = prepareRaceFromRng(
    raceRng,
    broadcast.raceDurationMs,
    broadcast.bet,
    broadcast.bet?.isDoubleOrNothin
  );

  const inCountdown = broadcast.state === 'countdown' || Date.now() < broadcast.startedAt;
  applyRaceScene(raceData, broadcast.startedAt, { preRace: inCountdown });

  Predictions.show(activeRaceId, ducks.map(d => ({
    name: d.name,
    spriteId: d.spriteId,
    tagColor: d.tagColor,
  })));

  if (broadcast.state === 'finished') {
    finishRaceFromSync();
  } else {
    publicSyncTimer = setInterval(() => handleBroadcastUpdate(readBroadcast()), 400);
  }
}

function finishRaceFromSync() {
  if (scene.raceOver) return;
  const last = scene.trajectories[0].length - 1;
  ducks.forEach((duck, i) => {
    duck.displayProgress = scene.trajectories[i][last];
    duck.progress = duck.displayProgress;
    duck.x = scene.startX + duck.displayProgress * scene.trackLen;
  });
  scene.raceOver = true;
  cancelAnimationFrame(raceAnimId);
  showWinner();
}

function launchRace(raceDurationMs, bet, isDoubleOrNothin) {
  const raceRng = new RaceRng();
  const rngSeed = Array.from(raceRng.buf);
  const raceId = String(Date.now());
  const raceStartsAt = Date.now() + PRE_RACE_COUNTDOWN_MS;

  showPanel('race');
  raceOverlay.classList.add('hidden');
  raceOverlay.classList.remove('race-overlay--epic');
  winnerCardEl.classList.remove('winner-card--epic');
  winnerWitnessEl.classList.add('hidden');
  confetti = [];

  const raceData = prepareRaceFromRng(raceRng, raceDurationMs, bet, isDoubleOrNothin);
  activeRaceId = raceId;

  if (appMode === 'admin') {
    const preview = {
      racerCount: ducks.length,
      pot: formatBetTotal(bet, ducks.length),
    };
    publishBroadcast(buildRaceBroadcast(
      raceData, rngSeed, raceStartsAt, preview, 'countdown', raceId
    ));
  }

  applyRaceScene(raceData, raceStartsAt, { preRace: true });
}

function initRipples(w, h, laneCount = 6) {
  const ripples = [];
  const count = laneCount > 20 ? 10 : laneCount > 12 ? 14 : 18;
  for (let i = 0; i < count; i++) {
    ripples.push({
      x: Math.random() * w,
      y: h * 0.42 + Math.random() * h * 0.45,
      r: 5 + Math.random() * 20,
      phase: Math.random() * Math.PI * 2,
      speed: 0.02 + Math.random() * 0.03,
      drift: 18 + Math.random() * 22,
    });
  }
  return ripples;
}

function initWaterFlow(w, h, waterTop, startX, finishX, laneCount = 6) {
  const lines = [];
  const count = laneCount > 20 ? 14 : laneCount > 12 ? 20 : 28;
  for (let i = 0; i < count; i++) {
    lines.push({
      x: startX + Math.random() * (finishX - startX),
      y: waterTop + 18 + Math.random() * (h - waterTop - 28),
      len: 28 + Math.random() * 55,
      speed: 45 + Math.random() * 70,
      width: 1 + Math.random() * 2.5,
      alpha: 0.07 + Math.random() * 0.14,
      phase: Math.random() * Math.PI * 2,
      wobble: 0.4 + Math.random() * 1.2,
    });
  }
  return lines;
}

function updateWaterFlow(dt, w, h, waterTop, startX, finishX) {
  scene.flowLines.forEach(line => {
    line.x -= line.speed * dt;
    line.phase += line.wobble * dt;
    if (line.x + line.len < startX - 20) {
      line.x = finishX + Math.random() * 40;
      line.y = waterTop + 18 + Math.random() * (h - waterTop - 28);
      line.len = 28 + Math.random() * 55;
    }
  });

  scene.ripples.forEach(r => {
    r.x -= r.drift * dt;
    if (r.x < startX - 30) r.x = finishX + Math.random() * 30;
  });
}

function raceLoop(now) {
  const time = now || performance.now();
  const dt = Math.min(0.05, (time - scene.lastFrameTime) / 1000);
  scene.lastFrameTime = time;
  scene.time += dt;
  if (scene.flowLines) {
    updateWaterFlow(dt, scene.w, scene.h, scene.waterTop, scene.startX, scene.finishX);
  }
  if (appMode === 'public') Predictions.tick();
  updateRace(dt);
  drawScene();
  if (!scene.raceOver) {
    raceAnimId = requestAnimationFrame(raceLoop);
  }
}

function updateRace(dt) {
  if (scene.preRace || !raceStartTime) return;

  const elapsed = performance.now() - raceStartTime;
  const remaining = scene.raceDurationMs - elapsed;

  if (remaining <= 0) {
    const last = scene.trajectories[0].length - 1;
    ducks.forEach((duck, i) => {
      duck.displayProgress = scene.trajectories[i][last];
      duck.progress = duck.displayProgress;
      duck.x = scene.startX + duck.displayProgress * scene.trackLen;
    });
    scene.raceOver = true;
    showWinner();
    return;
  }

  const t = elapsed / scene.raceDurationMs;

  ducks.forEach((duck, i) => {
    const target = computeTargetProgress(i, elapsed);
    const diff = target - duck.displayProgress;
    const snap = Math.abs(diff) > 0.012 ? 0.42 : Math.abs(diff) > 0.005 ? 0.26 : 0.14;
    duck.displayProgress += diff * snap;
    duck.progress = duck.displayProgress;
    duck.x = scene.startX + duck.displayProgress * scene.trackLen;

    const speed = trajectorySpeed(scene.trajectories, i, t);
    duck.fallingBack = speed < -0.015;
    duck.racing = speed > 0.02;
    duck.bobPhase += dt * (5 + Math.abs(speed) * 4);
    updateSplashes(duck, dt, speed);
  });

  const sorted = ducks.map((d, i) => ({ i, p: d.displayProgress })).sort((a, b) => b.p - a.p);
  const leaderIdx = sorted[0].i;
  if (leaderIdx !== scene.lastLeader && scene.lastLeader !== -1) {
    ducks[leaderIdx].bobPhase += 0.8;
    const splashN = scene.laneCount > 16 ? 2 : scene.laneCount > 10 ? 4 : 6;
    for (let n = 0; n < splashN; n++) {
      ducks[leaderIdx].splashes.push({
        x: ducks[leaderIdx].x - 10,
        y: ducks[leaderIdx].laneY,
        vx: -2 - Math.random() * 3,
        vy: -2 - Math.random() * 2,
        life: 1,
        size: 3 + Math.random() * 4,
      });
    }
  }
  scene.lastLeader = leaderIdx;
}

function updateSplashes(duck, dt, speed) {
  const moving = Math.abs(speed) > 0.008;
  if (!moving) return;
  if (scene.laneCount > 20 && duck.splashes.length > 2) return;
  const crowd = scene.laneCount > 16 ? 0.35 : scene.laneCount > 10 ? 0.6 : 1;
  const rate = (0.15 + Math.min(0.5, Math.abs(speed) * 1.5)) * crowd;
  if (Math.random() < rate * dt * 60) {
    const back = speed >= 0;
    duck.splashes.push({
      x: duck.x + (back ? -18 : 14),
      y: duck.laneY + Math.sin(duck.bobPhase) * 3,
      vx: back ? -1 - Math.random() * 2 : 1 + Math.random() * 2,
      vy: -1 - Math.random() * 2,
      life: 1,
      size: 2 + Math.random() * 3,
    });
  }
  duck.splashes = duck.splashes.filter(s => {
    s.x += s.vx * dt * 60;
    s.y += s.vy * dt * 60;
    s.vy += 0.08 * dt * 60;
    s.life -= 0.04 * dt * 60;
    return s.life > 0;
  });
  if (duck.splashes.length > (scene.laneCount > 16 ? 4 : 8)) {
    duck.splashes.splice(0, duck.splashes.length - (scene.laneCount > 16 ? 4 : 8));
  }
}

function showWinner() {
  const winner = ducks[scene.winnerIndex];
  const bet = scene.bet;
  const isEpic = !!(bet && bet.isDoubleOrNothin);

  winnerCardEl.classList.toggle('winner-card--epic', isEpic);
  raceOverlay.classList.toggle('race-overlay--epic', isEpic);
  winnerWitnessEl.classList.toggle('hidden', !isEpic);

  winnerNameEl.textContent = `${winner.name} wins!`;

  if (isEpic) {
    winnerPrizeEl.textContent = `Wins ${formatBetTotal(bet, bet.playerCount)}`;
    winnerSubEl.textContent = `${formatBetStake(bet)} × ${bet.playerCount} racers · Double or Nothin`;
    spawnConfetti(true);
    AudioEngine.playEpicWin();
  } else if (bet) {
    winnerPrizeEl.textContent = `Wins ${formatBetTotal(bet, bet.playerCount)}`;
    winnerSubEl.textContent = `${formatBetStake(bet)} × ${bet.playerCount} racers`;
    spawnConfetti(false);
  } else {
    winnerPrizeEl.textContent = '';
    winnerSubEl.textContent = 'What a finish! 🎉';
    spawnConfetti(false);
  }

  document.getElementById('public-wait-next').classList.toggle('hidden', appMode !== 'public');

  if (appMode === 'admin' && activeRaceId) {
    const current = readBroadcast() || {};
    publishBroadcast({ ...current, state: 'finished', raceId: activeRaceId });
  }

  if (appMode === 'public') {
    Predictions.showResult(scene.winnerIndex);
  }

  if (appMode === 'admin' && activeRaceId && bet) {
    ArenaStats.recordRaceComplete(activeRaceId, bet);
  }

  raceOverlay.classList.remove('hidden');
  drawScene();
}

function spawnConfetti(epic = false) {
  const colors = epic
    ? ['#FFD54F', '#FFC107', '#FF9F43', '#FF6B35', '#FFE082', '#FFFFFF', '#26C6DA']
    : ['#FFD93D', '#FF6B35', '#26C6DA', '#AB47BC', '#66BB6A', '#FF5252'];
  const count = epic ? 280 : 120;
  for (let i = 0; i < count; i++) {
    confetti.push({
      x: Math.random() * scene.w,
      y: epic ? -20 - Math.random() * scene.h * 0.4 : -10 - Math.random() * 100,
      vx: (Math.random() - 0.5) * (epic ? 6 : 4),
      vy: (2 + Math.random() * 4) * (epic ? 1.35 : 1),
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * (epic ? 0.35 : 0.2),
      color: colors[Math.floor(Math.random() * colors.length)],
      w: (6 + Math.random() * 8) * (epic ? 1.2 : 1),
      h: (4 + Math.random() * 6) * (epic ? 1.2 : 1),
    });
  }
}

// --- Drawing ---
function drawScene() {
  const { w, h } = scene;
  ctx.clearRect(0, 0, w, h);

  drawSky(w, h);
  drawHills(w, h);
  drawPond(w, h);
  drawReeds(w, h);
  drawLilyPads(w, h);
  drawFinishLine(w, h);
  drawStartBanner(w, h);

  ducks.forEach((duck, i) => {
    duck.splashes.forEach(s => drawSplash(s));
    drawMimu(duck);
  });

  const ranked = ducks.map((d, i) => ({ d, i })).sort((a, b) => b.d.progress - a.d.progress);
  if (scene.laneCount <= 14) {
    ranked.forEach(({ d }, rank) => drawNameTag(d, rank + 1));
  } else {
    ranked.slice(0, 3).forEach(({ d }, rank) => drawNameTag(d, rank + 1));
  }

  drawConfetti();
  drawHUD(w, h);
}

function drawSky(w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h * 0.45);
  grad.addColorStop(0, '#0a0e17');
  grad.addColorStop(0.5, '#141c2b');
  grad.addColorStop(1, '#1a2436');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h * 0.45);

  // Stars
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  for (let i = 0; i < 40; i++) {
    const sx = (Math.sin(i * 47.3 + 1.2) * 0.5 + 0.5) * w;
    const sy = (Math.cos(i * 31.7 + 2.8) * 0.5 + 0.5) * h * 0.32;
    const r = (i % 3 === 0) ? 1.2 : 0.6;
    ctx.globalAlpha = 0.3 + (i % 5) * 0.12;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Moon
  const moonX = w * 0.82;
  const moonY = h * 0.11;
  const moonGrad = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 42);
  moonGrad.addColorStop(0, '#e8edf5');
  moonGrad.addColorStop(0.6, '#b8c5d8');
  moonGrad.addColorStop(1, 'rgba(184, 197, 216, 0)');
  ctx.fillStyle = moonGrad;
  ctx.beginPath();
  ctx.arc(moonX, moonY, 42, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(200, 210, 230, 0.25)';
  drawCloud(w * 0.15 + Math.sin(scene.time * 0.3) * 8, h * 0.1, 1);
  drawCloud(w * 0.55 + Math.sin(scene.time * 0.2 + 1) * 6, h * 0.07, 0.7);
}

function drawCloud(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = 0.92;
  [[0, 0, 28], [-25, 8, 22], [25, 6, 24], [-12, -10, 18], [15, -8, 20]].forEach(([cx, cy, r]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawHills(w, h) {
  ctx.fillStyle = '#1a2820';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.38);
  ctx.bezierCurveTo(w * 0.2, h * 0.28, w * 0.4, h * 0.42, w * 0.55, h * 0.34);
  ctx.bezierCurveTo(w * 0.7, h * 0.26, w * 0.85, h * 0.36, w, h * 0.32);
  ctx.lineTo(w, h * 0.45);
  ctx.lineTo(0, h * 0.45);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#122018';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.4);
  ctx.bezierCurveTo(w * 0.3, h * 0.35, w * 0.6, h * 0.43, w, h * 0.38);
  ctx.lineTo(w, h * 0.48);
  ctx.lineTo(0, h * 0.48);
  ctx.closePath();
  ctx.fill();
}

function drawPond(w, h) {
  const waterTop = h * 0.38;
  const grad = ctx.createLinearGradient(0, waterTop, 0, h);
  grad.addColorStop(0, '#1a3344');
  grad.addColorStop(0.4, '#0f2430');
  grad.addColorStop(1, '#081018');
  ctx.fillStyle = grad;
  ctx.fillRect(0, waterTop, w, h - waterTop);

  drawWaterCurrent(w, h, waterTop);

  scene.ripples.forEach(r => {
    r.phase += r.speed;
    const alpha = 0.08 + Math.sin(r.phase) * 0.05;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const radius = r.r + Math.sin(r.phase) * 4;
    ctx.ellipse(r.x, r.y, radius, radius * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.globalAlpha = 0.06;
  const trackLen = (scene.finishX - scene.startX) + 120;
  for (let i = 0; i < 6; i++) {
    const cx = scene.finishX + 60 - ((scene.time * 35 + i * 70) % trackLen);
    const cy = waterTop + 40 + i * 35;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 40, 12, Math.sin(scene.time + i) * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawWaterCurrent(w, h, waterTop) {
  if (!scene.flowLines) return;

  const { startX, finishX } = scene;
  ctx.save();
  ctx.beginPath();
  ctx.rect(startX - 10, waterTop, finishX - startX + 20, h - waterTop);
  ctx.clip();

  scene.flowLines.forEach(line => {
    const y = line.y + Math.sin(line.phase) * 3;
    const x2 = line.x - line.len;

    const grad = ctx.createLinearGradient(line.x, y, x2, y);
    grad.addColorStop(0, `rgba(255, 255, 255, 0)`);
    grad.addColorStop(0.35, `rgba(120, 180, 210, ${line.alpha * 0.7})`);
    grad.addColorStop(1, `rgba(160, 210, 230, ${line.alpha})`);

    ctx.strokeStyle = grad;
    ctx.lineWidth = line.width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(line.x, y);
    ctx.quadraticCurveTo(
      line.x - line.len * 0.45, y + Math.sin(line.phase * 1.3) * 2,
      x2, y + Math.sin(line.phase * 0.8) * 1.5
    );
    ctx.stroke();

    // Small arrow head pointing left (finish → start)
    ctx.fillStyle = `rgba(140, 190, 220, ${line.alpha})`;
    ctx.beginPath();
    ctx.moveTo(x2, y);
    ctx.lineTo(x2 + 7, y - 3);
    ctx.lineTo(x2 + 7, y + 3);
    ctx.closePath();
    ctx.fill();
  });

  // Broad slow bands drifting finish → start
  for (let i = 0; i < 4; i++) {
    const bandW = 120 + i * 30;
    const offset = (scene.time * (22 + i * 6) + i * 180) % (finishX - startX + bandW);
    const bx = finishX + bandW - offset;
    const by = waterTop + 30 + i * ((h - waterTop) / 5);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.025 + i * 0.008})`;
    ctx.beginPath();
    ctx.ellipse(bx, by, bandW, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawReeds(w, h) {
  const bases = [w * 0.04, w * 0.12, w * 0.92, w * 0.97];
  bases.forEach((bx, i) => {
    const sway = Math.sin(scene.time * 1.5 + i) * 4;
    ctx.strokeStyle = i % 2 ? '#1e3d28' : '#152a1c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx, h);
    ctx.quadraticCurveTo(bx + sway, h * 0.55, bx + sway * 1.5, h * 0.38);
    ctx.stroke();

    if (i % 2 === 0) {
      ctx.fillStyle = '#3d2e24';
      ctx.beginPath();
      ctx.ellipse(bx + sway * 1.5, h * 0.36, 5, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawLilyPads(w, h) {
  const pads = [
    [w * 0.25, h * 0.72, 22],
    [w * 0.62, h * 0.65, 18],
    [w * 0.78, h * 0.78, 25],
  ];
  pads.forEach(([px, py, r], i) => {
    const bob = Math.sin(scene.time * 0.8 + i) * 2;
    ctx.fillStyle = '#1e4a28';
    ctx.beginPath();
    ctx.arc(px, py + bob, r, 0.2, Math.PI * 2 - 0.2);
    ctx.lineTo(px, py + bob);
    ctx.fill();
    ctx.strokeStyle = '#143820';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (i === 1) {
      ctx.fillStyle = '#f48fb1';
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(px + Math.cos(a) * 6, py + bob + Math.sin(a) * 6, 4, 7, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath();
      ctx.arc(px, py + bob, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawFinishLine(w, h) {
  const fx = scene.finishX;
  const top = scene.waterTop;
  const bottom = h - 10;

  const checkSize = 12;
  for (let y = top; y < bottom; y += checkSize) {
    ctx.fillStyle = ((y / checkSize) | 0) % 2 ? '#c8d4e0' : '#2a3340';
    ctx.fillRect(fx - 4, y, 8, checkSize);
  }

  ctx.fillStyle = '#c45c5c';
  ctx.beginPath();
  ctx.moveTo(fx + 6, top + 10);
  ctx.lineTo(fx + 70, top + 30);
  ctx.lineTo(fx + 6, top + 50);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8ecf0';
  ctx.font = 'bold 11px Fredoka, sans-serif';
  ctx.fillText('FINISH', fx + 14, top + 36);
}

function drawStartBanner(w, h) {
  const sx = scene.startX - 10;
  const top = scene.waterTop + 10;
  ctx.fillStyle = '#2a4a58';
  ctx.fillRect(sx - 60, top, 55, 28);
  ctx.strokeStyle = '#3d6a7a';
  ctx.lineWidth = 2;
  ctx.strokeRect(sx - 60, top, 55, 28);
  ctx.fillStyle = '#c8dce8';
  ctx.font = 'bold 12px Fredoka, sans-serif';
  ctx.fillText('START', sx - 52, top + 19);
}

function drawMimu(duck) {
  const sprite = spriteImages[duck.spriteId];
  if (!sprite || !duck.displaySize) return;

  const bob = Math.sin(duck.bobPhase) * 3;
  const { w, h } = duck.displaySize;
  const left = duck.x - w * 0.38;
  const top = duck.laneY - h / 2 + bob;

  if (duck.racing && !scene.raceOver) {
    ctx.strokeStyle = 'rgba(160, 210, 230, 0.45)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(left - 8 - i * 10, duck.laneY - 4 + i * 4);
      ctx.lineTo(left - 24 - i * 12, duck.laneY - 4 + i * 4);
      ctx.stroke();
    }
  }

  if (duck.fallingBack && !scene.raceOver) {
    ctx.strokeStyle = 'rgba(255, 140, 100, 0.4)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(left + w * 0.2 + i * 8, duck.laneY + 4 + i * 4);
      ctx.lineTo(left + w * 0.55 + i * 10, duck.laneY + 4 + i * 4);
      ctx.stroke();
    }
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite.img, left, top, w, h);

  const leader = [...ducks].sort((a, b) => b.progress - a.progress)[0];
  if (leader === duck && !scene.raceOver) {
    ctx.font = 'bold 14px Fredoka, sans-serif';
    ctx.fillText('👑', left + w * 0.1, top - 4);
  }
}

function drawNameTag(duck, rank) {
  const bob = Math.sin(duck.bobPhase) * 4;
  const x = duck.x;
  const tagLift = scene.laneCount > 20 ? 16 : scene.laneCount > 14 ? 20 : scene.laneCount > 8 ? 26 : scene.laneCount > 5 ? 30 : 38;
  const y = duck.laneY + bob - tagLift;
  const text = duck.name;
  const label = rank ? `#${rank} ${text}` : text;
  ctx.font = '600 13px Fredoka, sans-serif';
  const tw = ctx.measureText(label).width;

  ctx.fillStyle = 'rgba(30, 38, 50, 0.92)';
  roundRect(ctx, x - tw / 2 - 10, y - 12, tw + 20, 24, 10);
  ctx.fill();
  ctx.strokeStyle = duck.tagColor || '#5eb8d4';
  ctx.lineWidth = 2;
  roundRect(ctx, x - tw / 2 - 10, y - 12, tw + 20, 24, 10);
  ctx.stroke();

  ctx.fillStyle = '#e8ecf0';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y + 5);
  ctx.textAlign = 'left';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawSplash(s) {
  ctx.fillStyle = `rgba(255, 255, 255, ${s.life * 0.7})`;
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2);
  ctx.fill();
}

function drawConfetti() {
  confetti.forEach(c => {
    c.x += c.vx;
    c.y += c.vy;
    c.vy += 0.05;
    c.rot += c.rotV;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.fillStyle = c.color;
    ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.restore();
  });
  confetti = confetti.filter(c => c.y < scene.h + 20);
}

function drawHUD(w, h) {
  if (!raceStartTime) return;

  const elapsed = performance.now() - raceStartTime;
  const remaining = Math.max(0, scene.raceDurationMs - elapsed);
  const remainingSec = remaining / 1000;

  const timerLabel = formatTime(remainingSec);
  ctx.font = '600 14px Fredoka, sans-serif';
  const timerW = ctx.measureText(timerLabel).width + 36;

  ctx.fillStyle = 'rgba(30, 38, 50, 0.88)';
  roundRect(ctx, 12, 12, timerW, 32, 8);
  ctx.fill();
  ctx.fillStyle = '#a8c4d8';
  ctx.fillText(`⏱ ${timerLabel}`, 22, 34);

  const standing = [...ducks].sort((a, b) => b.progress - a.progress);

  standing.forEach((d, i) => {
    if (i >= 6) return;
    const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
    ctx.fillStyle = 'rgba(30, 38, 50, 0.82)';
    roundRect(ctx, w - 168, 12 + i * 26, 156, 22, 6);
    ctx.fill();
    ctx.font = '600 12px Fredoka, sans-serif';
    ctx.fillStyle = i === 0 ? '#ffd54f' : '#c8d4e0';
    const label = d.name.length > 9 ? d.name.slice(0, 8) + '…' : d.name;
    ctx.fillText(`${medals[i] || (i + 1 + '.')} ${label}`, w - 160, 27 + i * 26);
  });
}

// --- Init ---
const startRaceBtn = document.getElementById('start-race');
startRaceBtn.disabled = true;
startRaceBtn.textContent = 'Loading racers…';
showPanel('enter');
ArenaStats.recordVisitor();

loadSprites().then(() => {
  startRaceBtn.disabled = false;
  startRaceBtn.textContent = 'Start Race';
  addDuck('Mimu');
  addDuck('Floatz');
  addDuck('Splash');
  updateBetPotHint();
}).catch(err => {
  console.error(err);
  startRaceBtn.textContent = 'Sprites failed to load';
  alert('Could not load racer sprites. Check assets/sprites/trimmed/ folder.');
});
