// Arena totals — persisted in localStorage (accurate per label)

const ArenaStats = (() => {
  const STORAGE_KEY = 'mimu-floatz-arena-stats';
  const VISITOR_ID_KEY = 'mimu-floatz-visitor-id';
  const MAX_RECORDED_RACES = 1000;

  function defaultStats() {
    return {
      visitors: 0,
      races: 0,
      apeCoinWon: 0,
      mimuNftWon: 0,
      losses: 0,
      recordedRaceIds: [],
    };
  }

  function read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...defaultStats(), ...parsed };
      }
    } catch { /* ignore */ }
    return defaultStats();
  }

  function write(stats) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  }

  function int(n) {
    const v = Math.floor(Number(n));
    return Number.isFinite(v) ? Math.max(0, v) : 0;
  }

  function formatApe(n) {
    return `${int(n).toLocaleString()} $APE`;
  }

  function formatNft(n) {
    const v = int(n);
    return `${v.toLocaleString()} ${v === 1 ? 'MIMU NFT' : 'MIMU NFTs'}`;
  }

  function formatCount(n) {
    return int(n).toLocaleString();
  }

  function render() {
    const s = read();
    const map = {
      'stat-races': formatCount(s.races),
      'stat-apecoin': formatApe(s.apeCoinWon),
      'stat-mimu-nft': formatNft(s.mimuNftWon),
      'stat-losses': formatCount(s.losses),
      'stat-visitors': formatCount(s.visitors),
    };
    Object.entries(map).forEach(([id, text]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    });
  }

  /** One unique visitor per browser profile (first visit only). */
  function recordVisitor() {
    let visitorId = localStorage.getItem(VISITOR_ID_KEY);
    const isNewVisitor = !visitorId;
    if (!visitorId) {
      visitorId = `vis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(VISITOR_ID_KEY, visitorId);
    }

    if (isNewVisitor) {
      const s = read();
      s.visitors += 1;
      write(s);
    }
    render();
  }

  /**
   * Record a fully completed race exactly once.
   * - Total Races Ran: +1 per finished race
   * - Total APECOIN / MIMU NFT Won: full pot paid to the winner
   * - Total Race Losses: +1 per non-winning racer
   */
  function recordRaceComplete(raceId, bet) {
    if (!raceId || !bet) return;

    const s = read();
    if (!Array.isArray(s.recordedRaceIds)) s.recordedRaceIds = [];
    if (s.recordedRaceIds.includes(raceId)) return;

    const playerCount = int(bet.playerCount);
    const stake = int(bet.stake);
    if (playerCount < 1 || stake < 1) return;

    const pot = stake * playerCount;
    const betType = bet.type === 'mimu' ? 'mimu' : 'ape';

    s.races += 1;
    if (betType === 'mimu') s.mimuNftWon += pot;
    else s.apeCoinWon += pot;
    if (playerCount > 1) s.losses += playerCount - 1;

    s.recordedRaceIds.push(raceId);
    if (s.recordedRaceIds.length > MAX_RECORDED_RACES) {
      s.recordedRaceIds = s.recordedRaceIds.slice(-MAX_RECORDED_RACES);
    }

    write(s);
    render();
  }

  return {
    render,
    recordVisitor,
    recordRaceComplete,
  };
})();

window.addEventListener('storage', (e) => {
  if (e.key === 'mimu-floatz-arena-stats') ArenaStats.render();
});
