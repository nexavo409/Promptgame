// Dev validation script: ensures all referenced card ids exist, presets are valid decks,
// and a dry-run match cycle completes successfully with the mock AI client.

import { CARDS, CARD_BY_ID } from '../src/data/cards.js';
import { SYNERGIES } from '../src/data/synergies.js';
import { PRESET_DECKS, validatePresets } from '../src/game/presets.js';
import { validateDeck, RULES } from '../src/game/rules.js';
import { createMatch, offerMulligan, takeMulligan, startRound, submitPlay,
         endRoundCleanup, checkGameEnd, activateUtility, peekTop, forfeitRound } from '../src/game/engine.js';
import { composePrompt, adjustScore, decideRoundWinner } from '../src/game/scoring.js';
import { chooseAIPlay } from '../src/game/ai_opponent.js';

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); failures++; }
}

console.log('=== Card pool ===');
check('カード数 >= 60', CARDS.length >= 60, `got ${CARDS.length}`);
check('全カードIDがユニーク',
  new Set(CARDS.map(c => c.id)).size === CARDS.length);
check('全カードの type が有効',
  CARDS.every(c => ['task','perspective','structure','utility'].includes(c.type)));
check('全カードの category が有効',
  CARDS.every(c => ['business','academic','creative','tech','education','neutral'].includes(c.category)));
check('全カードの rarity が有効',
  CARDS.every(c => ['common','uncommon','rare','legend'].includes(c.rarity)));
check('全カードに effect',
  CARDS.every(c => c.effect && c.effect.length > 0));

console.log('\n=== Synergies ===');
for (const s of SYNERGIES) {
  if (s.requires.cardIds) {
    for (const id of s.requires.cardIds) {
      check(`シナジー ${s.id} の参照 ${id} が存在`, !!CARD_BY_ID[id]);
    }
  }
}

console.log('\n=== Presets ===');
const presetResults = validatePresets();
for (const r of presetResults) {
  check(`プリセット ${r.id}: size=30`, r.size === 30, `got ${r.size}`);
  check(`プリセット ${r.id}: バリデーション通過`, r.ok, r.errors.join(' / '));
}

console.log('\n=== Utility activation ===');
{
  // Build a match where P1 starts with each utility in hand and verify activation flows.
  const utilCheck = createMatch({
    p1Deck: PRESET_DECKS[0].cards,
    p2Deck: PRESET_DECKS[1].cards,
    p2IsAI: true,
  });
  // Force utilities into P1 hand for testing
  utilCheck.players[0].hand = ['util-explore', 'util-noerror', 'util-priority', 'util-organize', 'util-prep',
    'task-summary', 'struct-bullets'];
  startRound(utilCheck);

  // 1) util-noerror (instant)
  const r1 = activateUtility(utilCheck, 0, 'util-noerror');
  check('util-noerror が発動する', !!r1 && utilCheck.players[0].roundUtilityUsed);
  check('util-noerror で精度ボーナス', utilCheck.players[0].roundScoreBonus.accuracy >= 1.0);
  check('util-noerror が手札から消える', !utilCheck.players[0].hand.includes('util-noerror'));

  // 2) try a second utility same round → should throw
  let threw = false;
  try { activateUtility(utilCheck, 0, 'util-priority'); } catch { threw = true; }
  check('同一ラウンドで2回目の発動はエラー', threw);

  // 3) Reset round, test explore
  utilCheck.round = 2;
  startRound(utilCheck);
  utilCheck.players[0].hand.push('util-explore');
  const looked = peekTop(utilCheck.players[0], 2);
  check('peekTop は2枚返す', looked.length === 2);
  const keptIds = looked.slice(0, 1);
  activateUtility(utilCheck, 0, 'util-explore', { lookedIds: looked, keptIds });
  check('util-explore 発動後、選んだカードが手札にある', utilCheck.players[0].hand.includes(keptIds[0]));

  // 4) Reset, test organize (discard 2, draw 2)
  utilCheck.round = 3;
  startRound(utilCheck);
  utilCheck.players[0].hand.push('util-organize');
  const handBefore = utilCheck.players[0].hand.length;
  const discardIds = utilCheck.players[0].hand.filter(id => id !== 'util-organize').slice(0, 2);
  activateUtility(utilCheck, 0, 'util-organize', { discardIds });
  // After organize: hand should be (before -1 utility -2 discarded +2 drawn) = before -1
  check('util-organize 後の手札サイズが想定通り',
    utilCheck.players[0].hand.length === handBefore - 1,
    `expected ${handBefore - 1}, got ${utilCheck.players[0].hand.length}`);
}

console.log('\n=== Type-guarantee in starting hand ===');
{
  for (const preset of PRESET_DECKS) {
    for (let trial = 0; trial < 10; trial++) {
      const tm = createMatch({ p1Deck: preset.cards, p2Deck: PRESET_DECKS[0].cards });
      startRound(tm);
      const types = new Set(tm.players[0].hand.map(id => CARD_BY_ID[id]?.type));
      const ok = types.has('task') && types.has('perspective') && types.has('structure');
      check(`${preset.id} trial${trial}: 手札に主要3種が揃う`, ok,
        `types=[${[...types].join(',')}]`);
    }
  }
}

console.log('\n=== Forfeit escape hatch ===');
{
  const fm = createMatch({ p1Deck: PRESET_DECKS[0].cards, p2Deck: PRESET_DECKS[1].cards, p2IsAI: true });
  startRound(fm);
  const handBefore = fm.players[0].hand.length;
  forfeitRound(fm, 0);
  check('放棄後の手札は5枚', fm.players[0].hand.length === 5,
    `expected 5, got ${fm.players[0].hand.length}`);
  check('放棄前の手札はすべて捨て札へ',
    fm.players[0].discard.length >= handBefore);
  check('pendingPlay に forfeit フラグ',
    fm.players[0].pendingPlay && fm.players[0].pendingPlay.forfeit === true);
}

console.log('\n=== Dry-run match ===');
const p1Deck = PRESET_DECKS[0].cards;
const p2Deck = PRESET_DECKS[1].cards;
const match = createMatch({ p1Deck, p2Deck, p2IsAI: true, p1Name: 'P1', p2Name: 'P2' });
check('初期手札7枚', match.players[0].hand.length === 7);
check('mulligan判定が動く', offerMulligan(match).length === 2);

// Simulate 5 rounds.
for (let r = 1; r <= 5; r++) {
  if (r > 1) match.round = r;
  startRound(match);
  check(`R${r}: トピック生成`, !!match.topic);

  // P1: pick the AI-chooser output as a proxy for "any valid play"
  const p1Ids = chooseAIPlay(match.players[0].hand, match.topic);
  const p2Ids = chooseAIPlay(match.players[1].hand, match.topic);
  // Tasks ideally present; if not, hand simply lacked one (real edge case, not a bug).
  const p1HasTaskInHand = match.players[0].hand.some(id => CARD_BY_ID[id]?.type === 'task');
  const p2HasTaskInHand = match.players[1].hand.some(id => CARD_BY_ID[id]?.type === 'task');
  check(`R${r}: P1のプレイにタスク有り（手札にあれば）`,
    !p1HasTaskInHand || p1Ids.some(id => CARD_BY_ID[id].type === 'task'));
  check(`R${r}: P2のプレイにタスク有り（手札にあれば）`,
    !p2HasTaskInHand || p2Ids.some(id => CARD_BY_ID[id].type === 'task'));

  submitPlay(match, 0, p1Ids);
  submitPlay(match, 1, p2Ids);

  // Mock judge directly (avoid importing fetch-dependent module trivially)
  const p1Cards = p1Ids.map(id => CARD_BY_ID[id]);
  const p2Cards = p2Ids.map(id => CARD_BY_ID[id]);
  const p1Prompt = composePrompt(p1Cards, match.topic);
  const p2Prompt = composePrompt(p2Cards, match.topic);
  const mockJudge = { accuracy: 6, utility: 6, novelty: 5, rationale: 'dry-run' };
  const p1Adj = adjustScore({ baseScore: mockJudge, playedCards: p1Cards, topic: match.topic });
  const p2Adj = adjustScore({ baseScore: { ...mockJudge, accuracy: 5 }, playedCards: p2Cards, topic: match.topic });

  const p1Res = { playedCards: p1Cards, prompt: p1Prompt, output: 'mock', judge: mockJudge, ...p1Adj };
  const p2Res = { playedCards: p2Cards, prompt: p2Prompt, output: 'mock', judge: mockJudge, ...p2Adj };

  const winner = decideRoundWinner(p1Res, p2Res);
  endRoundCleanup(match, { round: r, topic: match.topic, winner, players: [p1Res, p2Res] });

  const ending = checkGameEnd(match);
  check(`R${r}: 手札が4枚以上に補充`,
    match.players[0].hand.length >= RULES.handFloor || (match.players[0].deck.length + match.players[0].discard.length === 0));

  if (ending !== null) {
    console.log(`  ℹ マッチ終了 (R${r}): winner=${ending}, score=${match.players[0].score}-${match.players[1].score}`);
    break;
  }
}

console.log(`\n=== ${failures === 0 ? 'OK' : `FAILED: ${failures}`} ===`);
process.exit(failures === 0 ? 0 : 1);
