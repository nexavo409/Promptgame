// Hero typewriter — loops through sample prompts, typing them char by char.
// Pure JS setInterval, no SMIL/CSS-animation quirks.

const PROMPTS = [
  `あなたは新人エンジニアの教育担当です。
React の状態管理 (useState / useReducer / Context) の
使い分けを初心者にもわかるように説明してください。`,
  `AI とは何かを小学生にもわかるように説明してください。
制約:
- 200 字以内
- 専門用語は使わない
- 身近な例えを 1 つ含める`,
  `次の問題を順を追って考えてください。
ステップ 1: 必要な条件の整理
ステップ 2: 計算の要約
ステップ 3: 最終結論`,
];

const TYPE_MS  = 38;   // base ms per char while typing
const TYPE_JIT = 30;   // jitter on type interval
const HOLD_MS  = 2200; // time the full prompt stays visible
const ERASE_MS = 14;   // ms per char while erasing
const NEXT_MS  = 450;  // gap between prompts

export function startHeroTyper() {
  const el = document.querySelector('.hero-demo-text');
  if (!el) return;

  // Respect reduced motion: just show the first prompt statically.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = PROMPTS[0];
    return;
  }

  let i = 0;          // current prompt index
  let j = 0;          // chars typed so far
  let phase = 'type'; // 'type' | 'hold' | 'erase' | 'gap'
  let timer = null;
  let running = true;

  // Pause when the tab is hidden (saves CPU + lets text restart fresh)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
      if (timer) { clearTimeout(timer); timer = null; }
    } else if (!running) {
      running = true;
      tick();
    }
  });

  function schedule(ms) {
    if (!running) return;
    timer = setTimeout(tick, ms);
  }

  function tick() {
    const current = PROMPTS[i];
    switch (phase) {
      case 'type':
        j++;
        el.textContent = current.slice(0, j);
        if (j >= current.length) { phase = 'hold'; schedule(HOLD_MS); }
        else                      { schedule(TYPE_MS + Math.random() * TYPE_JIT); }
        break;
      case 'hold':
        phase = 'erase';
        schedule(ERASE_MS);
        break;
      case 'erase':
        j--;
        el.textContent = current.slice(0, j);
        if (j <= 0) { phase = 'gap'; schedule(NEXT_MS); }
        else        { schedule(ERASE_MS); }
        break;
      case 'gap':
        i = (i + 1) % PROMPTS.length;
        phase = 'type';
        schedule(TYPE_MS);
        break;
    }
  }

  // Start fresh
  el.textContent = '';
  schedule(NEXT_MS);
}
