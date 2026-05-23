// Dev validation script for the lesson-based version.

import fs from 'node:fs';
import { LESSONS, LESSON_BY_ID, FREE_TOPICS, checkPass, passText } from '../src/data/lessons.js';

// client.js touches localStorage / fetch at import time only inside functions,
// so importing the module is safe under Node and lets us unit-test the
// JSON extractor that handles judge / explain responses.
const { extractJsonObject } = await import('../src/ai/client.js').catch(() => ({}));

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); failures++; }
}

console.log('=== Lessons ===');
check('レッスン数が 8', LESSONS.length === 8, `got ${LESSONS.length}`);
check('全レッスンIDがユニーク',
  new Set(LESSONS.map(l => l.id)).size === LESSONS.length);
check('全レッスンに title / technique / explainer / topic / passCondition',
  LESSONS.every(l => l.title && l.technique && l.explainer && l.topic && l.passCondition));
check('全レッスンの topic に title / brief / category / difficulty',
  LESSONS.every(l => l.topic.title && l.topic.brief && l.topic.category && l.topic.difficulty));
check('passCondition の type が有効',
  LESSONS.every(l => ['each', 'axis', 'total'].includes(l.passCondition.type)));
check('passText が空文字列を返さない',
  LESSONS.every(l => passText(l.passCondition).length > 0));

console.log('\n=== Free topics ===');
check('自由練習用お題が存在', FREE_TOPICS.length > 0);
check('全自由お題に必要フィールド',
  FREE_TOPICS.every(t => t.title && t.brief && t.category && t.difficulty));

console.log('\n=== checkPass ===');
check('each: 全軸 7 → 通過 (閾値7)',
  checkPass({ accuracy: 7, utility: 7, novelty: 7 }, { type: 'each', threshold: 7 }));
check('each: 1軸 6 → 不通過 (閾値7)',
  !checkPass({ accuracy: 7, utility: 6, novelty: 9 }, { type: 'each', threshold: 7 }));
check('axis utility: 役立ち 7 → 通過 (閾値7)',
  checkPass({ accuracy: 5, utility: 7, novelty: 5 }, { type: 'axis', axis: 'utility', threshold: 7 }));
check('axis utility: 役立ち 6 → 不通過',
  !checkPass({ accuracy: 10, utility: 6, novelty: 10 }, { type: 'axis', axis: 'utility', threshold: 7 }));
check('total: 合計 25 → 通過 (閾値24)',
  checkPass({ accuracy: 8, utility: 9, novelty: 8 }, { type: 'total', threshold: 24 }));
check('total: 合計 23 → 不通過',
  !checkPass({ accuracy: 8, utility: 8, novelty: 7 }, { type: 'total', threshold: 24 }));

console.log('\n=== Legacy TCG wording ===');
// Phrases that would betray the abandoned TCG framing. These should appear
// only in README's "履歴" section (which explains the pivot).
const TCG_PHRASES = [
  'トレーディングカード',
  'カードゲーム',
  'プレイヤーが使ったカード',
  'プレイヤーが組み立てたプロンプト',
  'デッキ',
  'シナジー',
  'レアリティ',
  '合わせ技',
];

const filesToCheck = [
  'src/data/lessons.js',
  'src/game/progress.js',
  'src/ai/client.js',
  'src/ui/app.js',
  'index.html',
  'styles.css',
];

for (const rel of filesToCheck) {
  const txt = fs.readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
  for (const phrase of TCG_PHRASES) {
    check(`${rel} に旧TCG文言「${phrase}」がない`, !txt.includes(phrase));
  }
}

// Also check that LESSON definitions don't mention raw "CoT" by itself.
const lessonsText = fs.readFileSync(new URL('../src/data/lessons.js', import.meta.url), 'utf8');
check('lessons.js に独立した "CoT" 表記がない', !/\bCoT\b/.test(lessonsText));

console.log('\n=== JSON 抽出 (extractJsonObject) ===');
if (typeof extractJsonObject !== 'function') {
  check('extractJsonObject が import できる', false, 'export missing');
} else {
  // Happy path
  const a = extractJsonObject('{"accuracy":7,"utility":6,"novelty":5,"rationale":"ok"}');
  check('そのままの JSON を抽出', a.accuracy === 7 && a.utility === 6);

  // Markdown code fence (very common with cloud models)
  const b = extractJsonObject('```json\n{"accuracy":8,"utility":8,"novelty":7,"rationale":"良い"}\n```');
  check('```json フェンスを剥がして抽出', b.accuracy === 8 && b.rationale === '良い');

  // Plain ``` fence
  const c = extractJsonObject('```\n{"accuracy":3,"utility":3,"novelty":3,"rationale":"n"}\n```');
  check('``` フェンスを剥がして抽出', c.accuracy === 3);

  // <think>...</think> reasoning preamble (DeepSeek-R1 / QwQ)
  const d = extractJsonObject(
    '<think>うーん、この出力は{箇条書き}じゃないし...</think>\n' +
    '{"accuracy":6,"utility":5,"novelty":4,"rationale":"普通"}');
  check('<think> ブロックを除去して抽出',
    d.accuracy === 6 && d.utility === 5 && d.rationale === '普通');

  // Prose preamble before the JSON
  const e = extractJsonObject(
    'はい、採点します。以下のJSONです:\n{"accuracy":9,"utility":9,"novelty":9,"rationale":"優れている"}');
  check('前置きプロセの後ろから抽出', e.accuracy === 9);

  // String literal containing braces (must not confuse balance counter)
  const f = extractJsonObject('{"accuracy":5,"utility":5,"novelty":5,"rationale":"出力に { や } を含む"}');
  check('文字列内の中括弧を無視して抽出', f.rationale === '出力に { や } を含む');

  // Empty / malformed inputs throw
  let threw = false;
  try { extractJsonObject(''); } catch { threw = true; }
  check('空応答は例外を投げる', threw);

  threw = false;
  try { extractJsonObject('ごめんなさい、わかりません。'); } catch { threw = true; }
  check('JSONを含まないプロセは例外', threw);

  threw = false;
  try { extractJsonObject('{"accuracy":7'); } catch { threw = true; }
  check('閉じ括弧のないJSONは例外', threw);
}

console.log(`\n=== ${failures === 0 ? 'OK' : `FAILED: ${failures}`} ===`);
process.exit(failures === 0 ? 0 : 1);
