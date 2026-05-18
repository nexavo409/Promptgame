// Hero typewriter — loops through sample prompts.
// Minimal implementation: just setTimeout + textContent. No reduced-motion
// guard (the typing is slow and gentle) and no visibility handler
// (an earlier version had one that could stall on some browsers).

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

  let i = 0;
  let j = 0;
  let phase = 'type';

  function tick() {
    const current = PROMPTS[i];
    switch (phase) {
      case 'type':
        j++;
        el.textContent = current.slice(0, j);
        if (j >= current.length) {
          phase = 'hold';
          setTimeout(tick, HOLD_MS);
        } else {
          setTimeout(tick, TYPE_MS + Math.random() * TYPE_JIT);
        }
        break;
      case 'hold':
        phase = 'erase';
        setTimeout(tick, ERASE_MS);
        break;
      case 'erase':
        j--;
        el.textContent = current.slice(0, j);
        if (j <= 0) {
          i = (i + 1) % PROMPTS.length;
          phase = 'type';
          setTimeout(tick, NEXT_MS);
        } else {
          setTimeout(tick, ERASE_MS);
        }
        break;
    }
  }

  el.textContent = '';
  setTimeout(tick, 300);
}
