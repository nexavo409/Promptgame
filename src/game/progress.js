// Lesson progress — localStorage-backed.
// For each lesson we track: passed (bool), bestScore { accuracy, utility, novelty, total },
// attempts count, and the history of (prompt, output, judge) for the last few tries.

const PREFIX = 'pa.progress.';
const MAX_HISTORY = 5;

function key(lessonId, field) { return `${PREFIX}${lessonId}.${field}`; }

export function loadLessonProgress(lessonId) {
  try {
    return {
      passed: localStorage.getItem(key(lessonId, 'passed')) === '1',
      bestScore: JSON.parse(localStorage.getItem(key(lessonId, 'bestScore')) || 'null'),
      attempts: parseInt(localStorage.getItem(key(lessonId, 'attempts')) || '0', 10),
      history: JSON.parse(localStorage.getItem(key(lessonId, 'history')) || '[]'),
    };
  } catch {
    return { passed: false, bestScore: null, attempts: 0, history: [] };
  }
}

export function recordAttempt(lessonId, { prompt, output, judge, explanation, passed }) {
  const cur = loadLessonProgress(lessonId);
  const total = (judge.accuracy || 0) + (judge.utility || 0) + (judge.novelty || 0);
  const score = { accuracy: judge.accuracy, utility: judge.utility, novelty: judge.novelty, total };

  const attempts = cur.attempts + 1;
  const passedNow = passed || cur.passed;
  let bestScore = cur.bestScore;
  if (!bestScore || total > bestScore.total) bestScore = score;

  const history = [
    { ts: Date.now(), prompt, output, judge, explanation, passed },
    ...cur.history,
  ].slice(0, MAX_HISTORY);

  try {
    localStorage.setItem(key(lessonId, 'passed'), passedNow ? '1' : '0');
    localStorage.setItem(key(lessonId, 'bestScore'), JSON.stringify(bestScore));
    localStorage.setItem(key(lessonId, 'attempts'), String(attempts));
    localStorage.setItem(key(lessonId, 'history'), JSON.stringify(history));
  } catch {}

  return { passed: passedNow, bestScore, attempts, history };
}

export function resetLesson(lessonId) {
  for (const f of ['passed', 'bestScore', 'attempts', 'history']) {
    try { localStorage.removeItem(key(lessonId, f)); } catch {}
  }
}

// ===== Draft auto-save =====
// Saves the user's in-progress prompt per lesson / mode so a page refresh
// (or LM Studio hiccup) doesn't blow away their typing.
const DRAFT_PREFIX = 'pa.draft.';

export function saveDraft(slotId, text) {
  try {
    if (text && text.length > 0) localStorage.setItem(DRAFT_PREFIX + slotId, text);
    else localStorage.removeItem(DRAFT_PREFIX + slotId);
  } catch {}
}

export function loadDraft(slotId) {
  try { return localStorage.getItem(DRAFT_PREFIX + slotId) || ''; }
  catch { return ''; }
}

export function clearDraft(slotId) {
  try { localStorage.removeItem(DRAFT_PREFIX + slotId); } catch {}
}

/** Whether lessons N and earlier are unlocked. Returns set of unlocked ids. */
export function unlockedLessons(lessons) {
  const unlocked = new Set();
  for (const l of lessons) {
    unlocked.add(l.id);
    const p = loadLessonProgress(l.id);
    if (!p.passed) break; // stop unlocking after first un-passed lesson
  }
  return unlocked;
}
