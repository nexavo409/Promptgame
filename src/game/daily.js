// Daily streak / missions / mascot mood — localStorage-backed.

const LS_PREFIX = 'pa.daily.';
const K_LAST_DATE = LS_PREFIX + 'lastPlayDate';
const K_STREAK = LS_PREFIX + 'streak';
const K_WEEK = LS_PREFIX + 'weekDays'; // [bool x7] indexed mon..sun
const K_MISSIONS = LS_PREFIX + 'missions';
const K_MISSIONS_DATE = LS_PREFIX + 'missionsDate';
const K_TOTAL_MATCHES = LS_PREFIX + 'totalMatches';
const K_TOTAL_WINS = LS_PREFIX + 'totalWins';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayOfWeekMonZero() {
  // JS: 0=Sun..6=Sat → reindex to 0=Mon..6=Sun
  const j = new Date().getDay();
  return (j + 6) % 7;
}
function daysBetween(aISO, bISO) {
  const a = new Date(aISO + 'T00:00:00Z');
  const b = new Date(bISO + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

export function loadState() {
  try {
    return {
      lastDate: localStorage.getItem(K_LAST_DATE),
      streak: parseInt(localStorage.getItem(K_STREAK) || '0', 10),
      weekDays: JSON.parse(localStorage.getItem(K_WEEK) || '[false,false,false,false,false,false,false]'),
      missions: JSON.parse(localStorage.getItem(K_MISSIONS) || 'null'),
      missionsDate: localStorage.getItem(K_MISSIONS_DATE),
      totalMatches: parseInt(localStorage.getItem(K_TOTAL_MATCHES) || '0', 10),
      totalWins: parseInt(localStorage.getItem(K_TOTAL_WINS) || '0', 10),
    };
  } catch {
    return { lastDate: null, streak: 0, weekDays: [false,false,false,false,false,false,false], missions: null, missionsDate: null, totalMatches: 0, totalWins: 0 };
  }
}

function save(state) {
  try {
    localStorage.setItem(K_LAST_DATE, state.lastDate || '');
    localStorage.setItem(K_STREAK, String(state.streak));
    localStorage.setItem(K_WEEK, JSON.stringify(state.weekDays));
    if (state.missions) localStorage.setItem(K_MISSIONS, JSON.stringify(state.missions));
    if (state.missionsDate) localStorage.setItem(K_MISSIONS_DATE, state.missionsDate);
    localStorage.setItem(K_TOTAL_MATCHES, String(state.totalMatches || 0));
    localStorage.setItem(K_TOTAL_WINS, String(state.totalWins || 0));
  } catch {}
}

// Daily mission templates. Each generates a fresh mission per day.
const MISSION_TEMPLATES = [
  { id: 'win-1', label: 'マッチに1回勝つ', target: 1, kind: 'matchWin' },
  { id: 'win-2', label: 'マッチに2回勝つ', target: 2, kind: 'matchWin' },
  { id: 'play-3', label: 'ラウンドを3回プレイする', target: 3, kind: 'roundPlay' },
  { id: 'use-task', label: 'タスクカードを5枚使う', target: 5, kind: 'useType', extra: 'task' },
  { id: 'use-perspective', label: '視点カードを5枚使う', target: 5, kind: 'useType', extra: 'perspective' },
  { id: 'use-structure', label: '構造カードを5枚使う', target: 5, kind: 'useType', extra: 'structure' },
  { id: 'util-fire', label: '特殊カードを発動する', target: 1, kind: 'utilityFire' },
  { id: 'synergy', label: '合わせ技を1回発動する', target: 1, kind: 'synergyFire' },
  { id: 'high-diff', label: '高難易度のお題に挑む', target: 1, kind: 'highDifficulty' },
];

function pickThreeRandom(rng = Math.random) {
  const pool = MISSION_TEMPLATES.slice();
  const picked = [];
  while (picked.length < 3 && pool.length) {
    const i = Math.floor(rng() * pool.length);
    picked.push({ ...pool[i], current: 0, done: false });
    pool.splice(i, 1);
  }
  return picked;
}

/** Call once per page load. Rolls daily missions and updates streak window. */
export function dailyTick() {
  const s = loadState();
  const today = todayISO();

  // Roll new missions if not today
  if (s.missionsDate !== today) {
    s.missions = pickThreeRandom();
    s.missionsDate = today;
  }

  // Decay streak if a full day was missed
  if (s.lastDate) {
    const gap = daysBetween(s.lastDate, today);
    if (gap > 1) {
      s.streak = 0;
      s.weekDays = [false,false,false,false,false,false,false];
    }
  }

  save(s);
  return s;
}

/** Mark today as played; bumps streak if first play of the day. */
export function markPlayedToday() {
  const s = loadState();
  const today = todayISO();
  if (s.lastDate !== today) {
    if (s.lastDate && daysBetween(s.lastDate, today) === 1) {
      s.streak = (s.streak || 0) + 1;
    } else {
      s.streak = 1;
    }
    s.lastDate = today;
    s.weekDays[dayOfWeekMonZero()] = true;
  }
  save(s);
  return s;
}

/**
 * Update mission progress after a round resolves.
 * roundReport: { won, didPlay, usedTypes: Set<string>, utilityFired, synergyFired, topicDifficulty }
 * matchEnded: { ended: bool, won: bool }
 */
export function recordRound(roundReport, matchEnded = null) {
  const s = loadState();
  if (!s.missions) s.missions = pickThreeRandom();
  for (const m of s.missions) {
    if (m.done) continue;
    let inc = 0;
    switch (m.kind) {
      case 'roundPlay': if (roundReport.didPlay) inc = 1; break;
      case 'useType':   inc = roundReport.usedTypes?.[m.extra] || 0; break;
      case 'utilityFire': if (roundReport.utilityFired) inc = 1; break;
      case 'synergyFire': if (roundReport.synergyFired) inc = 1; break;
      case 'highDifficulty': if (roundReport.topicDifficulty === 'high') inc = 1; break;
      case 'matchWin': if (matchEnded?.ended && matchEnded?.won) inc = 1; break;
    }
    m.current = Math.min(m.target, (m.current || 0) + inc);
    if (m.current >= m.target) m.done = true;
  }
  if (matchEnded?.ended) {
    s.totalMatches = (s.totalMatches || 0) + 1;
    if (matchEnded.won) s.totalWins = (s.totalWins || 0) + 1;
  }
  save(s);
  return s;
}

export function mascotMood(state) {
  const s = state || loadState();
  if (s.streak >= 7) return { face: '★ω★', mood: 'great', word: 'すごい1週間連続！' };
  if (s.streak >= 3) return { face: '◕‿◕', mood: 'happy', word: '調子いいね！' };
  if (s.streak >= 1) return { face: '◔‿◔', mood: 'ok', word: '今日もありがとう' };
  return { face: '・_・', mood: 'sleepy', word: 'やあ、また遊びにきて' };
}

export function weekdayLabels() {
  return ['月', '火', '水', '木', '金', '土', '日'];
}
export function todayWeekIdx() { return dayOfWeekMonZero(); }

// Test-only reset
export function _resetForTest() {
  for (const k of [K_LAST_DATE, K_STREAK, K_WEEK, K_MISSIONS, K_MISSIONS_DATE, K_TOTAL_MATCHES, K_TOTAL_WINS]) {
    try { localStorage.removeItem(k); } catch {}
  }
}
