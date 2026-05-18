// Light / dark / auto theme management.
// "auto" follows prefers-color-scheme, the others force a mode.

const KEY = 'pa.theme';
export const THEMES = ['auto', 'light', 'dark'];

export function getThemePref() {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.includes(v) ? v : 'auto';
  } catch { return 'auto'; }
}

export function setThemePref(pref) {
  try {
    if (pref === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {}
  applyTheme(pref);
}

function resolveAuto() {
  return window.matchMedia &&
         window.matchMedia('(prefers-color-scheme: dark)').matches
         ? 'dark' : 'light';
}

export function applyTheme(pref = getThemePref()) {
  const resolved = pref === 'auto' ? resolveAuto() : pref;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePref = pref;
}

export function initTheme() {
  applyTheme();
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getThemePref() === 'auto') applyTheme('auto');
    });
  }
}

export function nextTheme(current = getThemePref()) {
  const i = THEMES.indexOf(current);
  return THEMES[(i + 1) % THEMES.length];
}

export function themeLabel(pref) {
  return pref === 'dark' ? '🌙 ダーク' : pref === 'light' ? '☀️ ライト' : '⌚ 自動';
}
