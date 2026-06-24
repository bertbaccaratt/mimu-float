// Public prediction market — shared via localStorage across viewer tabs

const Predictions = (() => {
  const STORAGE_KEY = 'mimu-floatz-predictions';
  const VIEWER_KEY = 'mimu-floatz-viewer-id';
  const MAX_TICKETS = 3;
  const VOTE_LOCK_RATIO = 0.22;

  let raceId = null;
  let ducks = [];
  let locked = false;
  let panelEl = null;
  let ticketsEl = null;
  let statusEl = null;
  let picksEl = null;
  let resultEl = null;

  function getViewerId() {
    let id = sessionStorage.getItem(VIEWER_KEY);
    if (!id) {
      id = `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(VIEWER_KEY, id);
    }
    return id;
  }

  function readAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function writeAll(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function getRaceData() {
    if (!raceId) return null;
    const all = readAll();
    if (!all[raceId]) {
      all[raceId] = { weights: {}, voters: {} };
      writeAll(all);
    }
    return all[raceId];
  }

  function getMyTickets() {
    const data = getRaceData();
    if (!data) return {};
    const mine = data.voters[getViewerId()] || {};
    return { ...mine };
  }

  function ticketsSpent(mine = getMyTickets()) {
    return Object.values(mine).reduce((s, n) => s + n, 0);
  }

  function ticketsLeft() {
    return MAX_TICKETS - ticketsSpent();
  }

  function getTotalWeight() {
    const data = getRaceData();
    if (!data) return 0;
    return Object.values(data.weights).reduce((s, n) => s + n, 0);
  }

  function castTicket(duckIndex) {
    if (locked || appMode !== 'public' || !raceId) return;
    if (ticketsLeft() <= 0) return;
    if (typeof scene !== 'undefined' && scene.raceOver) return;

    const inPreRace = typeof scene !== 'undefined' && scene.preRace;
    if (!inPreRace && raceStartTime) {
      const elapsed = performance.now() - raceStartTime;
      if (scene.raceDurationMs && elapsed / scene.raceDurationMs >= VOTE_LOCK_RATIO) {
        lock();
        return;
      }
    }

    const all = readAll();
    if (!all[raceId]) all[raceId] = { weights: {}, voters: {} };
    const data = all[raceId];
    const viewerId = getViewerId();

    if (!data.voters[viewerId]) data.voters[viewerId] = {};
    data.voters[viewerId][duckIndex] = (data.voters[viewerId][duckIndex] || 0) + 1;
    data.weights[duckIndex] = (data.weights[duckIndex] || 0) + 1;

    writeAll(all);
    AudioEngine.ensureContext();
    AudioEngine.playUiClick('select');
    render();
  }

  function lock() {
    locked = true;
    render();
  }

  function checkTimeLock() {
    if (locked || !raceStartTime || !scene.raceDurationMs || scene.preRace) return;
    const elapsed = performance.now() - raceStartTime;
    if (elapsed / scene.raceDurationMs >= VOTE_LOCK_RATIO) lock();
  }

  function showResult(winnerIndex) {
    if (!panelEl || appMode !== 'public') return;
    locked = true;

    const mine = getMyTickets();
    const myWeight = Object.values(mine).reduce((s, n) => s + n, 0);
    const pickedWinner = mine[winnerIndex] > 0;
    const topPick = Object.entries(mine).sort((a, b) => b[1] - a[1])[0];
    const topName = topPick ? ducks[+topPick[0]]?.name : null;

    resultEl.classList.remove('hidden');
    if (myWeight === 0) {
      resultEl.className = 'predict-result predict-result--miss';
      resultEl.textContent = '😅 No tickets placed — sit out next time!';
    } else if (pickedWinner) {
      resultEl.className = 'predict-result predict-result--win';
      resultEl.textContent = `🎯 CALLED IT! Your pick ${ducks[winnerIndex].name} won!`;
    } else {
      resultEl.className = 'predict-result predict-result--lose';
      resultEl.textContent = `💨 ${topName} didn't float hard enough. Better luck next race!`;
    }
    render();
  }

  function render() {
    if (!panelEl || !picksEl) return;
    checkTimeLock();

    const left = ticketsLeft();
    const mine = getMyTickets();
    const data = getRaceData();
    const total = getTotalWeight();

    if (typeof scene !== 'undefined' && scene.preRace) {
      ticketsEl.textContent = `🎟️ ${left} ticket${left === 1 ? '' : 's'} left · race starting soon!`;
    } else if (locked || left === 0) {
      ticketsEl.textContent = left === 0 && !locked
        ? 'All tickets placed — good luck!'
        : 'Bets locked — race heating up!';
    } else {
      const pctLeft = Math.ceil((1 - VOTE_LOCK_RATIO) * 100);
      ticketsEl.textContent = `🎟️ ${left} ticket${left === 1 ? '' : 's'} left · closes early in the race`;
    }

    picksEl.innerHTML = '';
    ducks.forEach((duck, i) => {
      const w = data?.weights[i] || 0;
      const pct = total > 0 ? Math.round((w / total) * 100) : 0;
      const myVotes = mine[i] || 0;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'predict-pick';
      btn.disabled = locked || left === 0 || (typeof scene !== 'undefined' && scene.raceOver);
      if (myVotes > 0) btn.classList.add('predict-pick--mine');

      btn.innerHTML = `
        <span class="predict-pick-top">
          <img src="${SPRITE_PATH}/${duck.spriteId}.png" alt="">
          <span class="predict-name">${escapeHtml(duck.name)}</span>
          ${myVotes ? `<span class="predict-my-votes">×${myVotes}</span>` : ''}
        </span>
        <span class="predict-bar"><span class="predict-bar-fill" style="width:${pct}%"></span></span>
        <span class="predict-pct">${total > 0 ? `${pct}% crowd` : 'be first!'}</span>
      `;
      btn.addEventListener('click', () => castTicket(i));
      picksEl.appendChild(btn);
    });

    if (total > 0) {
      statusEl.textContent = `${total} ticket${total === 1 ? '' : 's'} in the pool`;
    } else {
      statusEl.textContent = 'Place up to 3 tickets on your pick(s)';
    }
  }

  function show(rId, duckList) {
    if (appMode !== 'public') return;
    raceId = rId;
    ducks = duckList;
    locked = false;
    panelEl = document.getElementById('predict-panel');
    ticketsEl = document.getElementById('predict-tickets');
    statusEl = document.getElementById('predict-status');
    picksEl = document.getElementById('predict-picks');
    resultEl = document.getElementById('predict-result');
    if (!panelEl) return;

    resultEl.classList.add('hidden');
    panelEl.classList.remove('hidden');
    render();
  }

  function hide() {
    raceId = null;
    ducks = [];
    locked = false;
    document.getElementById('predict-panel')?.classList.add('hidden');
  }

  function onStorage(e) {
    if (e.key === STORAGE_KEY && raceId && appMode === 'public') render();
  }

  function init() {
    window.addEventListener('storage', onStorage);
  }

  function tick() {
    if (!raceId || appMode !== 'public') return;
    const wasLocked = locked;
    checkTimeLock();
    if (!wasLocked && locked) render();
  }

  return { init, show, hide, showResult, tick, lock };
})();

document.addEventListener('DOMContentLoaded', () => Predictions.init());
