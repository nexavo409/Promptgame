// Game engine: state machine + deck/hand mechanics.
// Supports both 2-player hot-seat and Player-vs-AI.

import { CARD_BY_ID } from '../data/cards.js';
import { TOPICS, randomTopic } from '../data/topics.js';
import { RULES, shouldOfferMulligan } from './rules.js';

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makePlayer(name, deckIds, isAI = false) {
  const deck = shuffle(deckIds);
  return {
    name,
    isAI,
    deck,           // array of card ids (top = end)
    hand: [],       // card ids
    discard: [],    // card ids
    score: 0,       // rounds won
    mulliganUsed: false,
    pendingPlay: null,       // { cardIds, prompt } once locked in for the round
    lastResult: null,        // last round's result object
    // Per-round utility state:
    roundUtilityUsed: false, // already activated a utility this round?
    roundUtilityCost: 0,     // cost spent on activated utilities (counts toward 10 limit)
    roundModifiers: [],      // [{ id, text }] appended to composed prompt
    roundScoreBonus: { accuracy: 0, utility: 0, novelty: 0 },
    roundUtilityLog: [],     // [string] human-readable log of activations
  };
}

function drawN(player, n) {
  for (let i = 0; i < n; i++) {
    if (player.deck.length === 0) {
      if (player.discard.length === 0) return; // both empty
      player.deck = shuffle(player.discard);
      player.discard = [];
    }
    const id = player.deck.pop();
    if (id) player.hand.push(id);
  }
}

/**
 * Forfeit the current round: dump hand to discard, draw fresh up to handFloor+1.
 * Used as an escape hatch when the player can't make a viable play.
 */
export function forfeitRound(match, playerIdx) {
  const p = match.players[playerIdx];
  p.discard.push(...p.hand);
  p.hand = [];
  drawN(p, RULES.initialHand - 2); // draw 5 fresh
  p.pendingPlay = { cardIds: [], forfeit: true };
}

/**
 * Ensure the player's hand contains at least 1 card of each required type.
 * If a type is missing, pull a card of that type from deck (or discard if needed)
 * and swap it in by replacing a less-valuable hand card. The displaced card goes
 * to the bottom of the deck so it isn't lost permanently.
 */
function ensureTypesInHand(player, requiredTypes = ['task', 'perspective', 'structure']) {
  for (const type of requiredTypes) {
    if (player.hand.some(id => CARD_BY_ID[id]?.type === type)) continue;

    // Find a card of the needed type, preferring deck over discard.
    let card = null;
    for (let i = player.deck.length - 1; i >= 0; i--) {
      if (CARD_BY_ID[player.deck[i]]?.type === type) {
        card = player.deck.splice(i, 1)[0];
        break;
      }
    }
    if (card === null) {
      for (let i = 0; i < player.discard.length; i++) {
        if (CARD_BY_ID[player.discard[i]]?.type === type) {
          card = player.discard.splice(i, 1)[0];
          break;
        }
      }
    }
    if (card === null) continue; // truly unavailable

    if (player.hand.length === 0) {
      player.hand.push(card);
      continue;
    }

    const swapIdx = pickHandCardToReplace(player);
    const removed = player.hand[swapIdx];
    player.hand[swapIdx] = card;
    player.deck.unshift(removed); // bottom of deck so it isn't lost
  }
}

function pickHandCardToReplace(player) {
  const typeCounts = {};
  for (const id of player.hand) {
    const t = CARD_BY_ID[id]?.type;
    if (t) typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  // 1) Duplicate utilities first (1/round limit makes extras useless)
  if ((typeCounts.utility || 0) > 1) {
    for (let i = 0; i < player.hand.length; i++) {
      if (CARD_BY_ID[player.hand[i]]?.type === 'utility') return i;
    }
  }
  // 2) Duplicates of main types
  for (let i = 0; i < player.hand.length; i++) {
    const t = CARD_BY_ID[player.hand[i]]?.type;
    if (t !== 'utility' && typeCounts[t] > 1) return i;
  }
  // 3) Single utility (better than removing a unique main-type card)
  for (let i = 0; i < player.hand.length; i++) {
    if (CARD_BY_ID[player.hand[i]]?.type === 'utility') return i;
  }
  // 4) Fallback
  return player.hand.length - 1;
}

/** Peek N cards from top of deck without removing them (returns array of ids, top-first). */
export function peekTop(player, n) {
  // Top = end of deck array
  const out = [];
  for (let i = 0; i < n; i++) {
    const idx = player.deck.length - 1 - i;
    if (idx >= 0) out.push(player.deck[idx]);
    else break;
  }
  return out;
}

/** Resolve a "look top N, take K" pick: keep cards by id (added to hand), rest go to bottom. */
function resolveLookPick(player, lookedIds, keptIds) {
  // Remove the looked-at cards from the top of the deck (in order).
  for (let i = 0; i < lookedIds.length; i++) {
    player.deck.pop();
  }
  const kept = new Set(keptIds);
  for (const id of lookedIds) {
    if (kept.has(id)) player.hand.push(id);
    else player.deck.unshift(id); // bottom
  }
}

export function createMatch({ p1Deck, p2Deck, p2IsAI = true, p1Name = 'あなた', p2Name = 'AI対戦者' }) {
  const p1 = makePlayer(p1Name, p1Deck, false);
  const p2 = makePlayer(p2Name, p2Deck, p2IsAI);
  drawN(p1, RULES.initialHand);
  drawN(p2, RULES.initialHand);
  ensureTypesInHand(p1);
  ensureTypesInHand(p2);

  return {
    phase: 'mulligan',     // mulligan | reveal-topic | construct | resolve | round-end | game-end
    round: 1,
    topic: null,
    players: [p1, p2],
    roundLog: [],          // per-round result objects
    rng: Math.random,
  };
}

export function offerMulligan(match) {
  return match.players.map(p => ({
    name: p.name,
    canMulligan: !p.mulliganUsed && shouldOfferMulligan(p.hand.map(id => CARD_BY_ID[id])),
  }));
}

export function takeMulligan(match, playerIdx) {
  const p = match.players[playerIdx];
  if (p.mulliganUsed) return;
  p.deck = shuffle(p.deck.concat(p.hand));
  p.hand = [];
  drawN(p, RULES.initialHand);
  ensureTypesInHand(p);
  p.mulliganUsed = true;
}

export function startRound(match) {
  if (match.round > 1) {
    // Draw phase: each player draws 1
    for (const p of match.players) drawN(p, 1);
  }
  match.topic = randomTopic(match.rng);
  match.phase = 'construct';
  for (const p of match.players) {
    p.pendingPlay = null;
    p.roundUtilityUsed = false;
    p.roundUtilityCost = 0;
    p.roundModifiers = [];
    p.roundScoreBonus = { accuracy: 0, utility: 0, novelty: 0 };
    p.roundUtilityLog = [];
    // Guarantee at least 1 task, 1 perspective, 1 structure are in hand.
    ensureTypesInHand(p);
  }
}

/**
 * Activate a utility card. Removes it from hand (to discard), applies effect.
 * For 'look' utilities, the caller must supply options.lookedIds + options.keptIds.
 * For 'discard' utilities, the caller supplies options.discardIds (ids in hand to discard).
 * Returns a result object with `log` string.
 */
export function activateUtility(match, playerIdx, cardId, options = {}) {
  const p = match.players[playerIdx];
  if (p.roundUtilityUsed) {
    throw new Error('このラウンドは既にユーティリティを発動済みです');
  }
  const handIdx = p.hand.indexOf(cardId);
  if (handIdx < 0) throw new Error('そのカードは手札にありません');
  const card = CARD_BY_ID[cardId];
  if (!card || card.type !== 'utility') throw new Error('ユーティリティカードではありません');

  // Remove utility from hand → discard
  p.hand.splice(handIdx, 1);
  p.discard.push(cardId);

  // Track cost (counts toward 10-cost cap together with selected cards)
  p.roundUtilityCost += card.cost;
  p.roundUtilityUsed = true;

  let log = '';
  switch (cardId) {
    case 'util-explore': {
      // Caller already peeked; resolve pick
      resolveLookPick(p, options.lookedIds || [], options.keptIds || []);
      log = `知識探索: 上${(options.lookedIds || []).length}枚から${(options.keptIds || []).length}枚を手札に追加`;
      break;
    }
    case 'util-prep': {
      resolveLookPick(p, options.lookedIds || [], options.keptIds || []);
      log = `完璧な準備: 上${(options.lookedIds || []).length}枚から${(options.keptIds || []).length}枚を手札に追加`;
      break;
    }
    case 'util-organize': {
      const discardIds = options.discardIds || [];
      for (const id of discardIds) {
        const i = p.hand.indexOf(id);
        if (i >= 0) {
          p.hand.splice(i, 1);
          p.discard.push(id);
        }
      }
      drawN(p, discardIds.length);
      log = `思考整理: ${discardIds.length}枚捨てて同数引いた`;
      break;
    }
    case 'util-noerror': {
      p.roundModifiers.push({ id: cardId, text: '事実性と整合性を最優先し、確信のない情報は「不確か」と明示してください。出力前に内部で誤情報チェックを行ってください。' });
      p.roundScoreBonus.accuracy += 1.0;
      log = `エラー回避: 事実性ブースト発動 (+精度1.0)`;
      break;
    }
    case 'util-priority': {
      p.roundModifiers.push({ id: cardId, text: '構築されたすべてのカード指示を最大限尊重し、各観点を妥協なく統合してください。' });
      p.roundScoreBonus.utility += 0.6;
      p.roundScoreBonus.novelty += 0.4;
      log = `優先度最高: 出力品質ブースト発動 (+有用0.6, +独自0.4)`;
      break;
    }
    default: {
      log = `${card.name}: 効果を発動`;
    }
  }
  p.roundUtilityLog.push(log);
  return { log, card };
}

/**
 * Submit a play for player by index. cardIds is an ordered array referenced from their hand.
 */
export function submitPlay(match, playerIdx, cardIds) {
  const p = match.players[playerIdx];
  // Validate all in hand
  const handCounts = {};
  for (const id of p.hand) handCounts[id] = (handCounts[id] || 0) + 1;
  for (const id of cardIds) {
    if (!handCounts[id] || handCounts[id] <= 0) {
      throw new Error(`手札にないカードが含まれています: ${id}`);
    }
    handCounts[id]--;
  }
  p.pendingPlay = { cardIds: cardIds.slice() };
}

export function bothSubmitted(match) {
  return match.players.every(p => p.pendingPlay);
}

/**
 * Discards played cards and refills hands up to handFloor.
 */
export function endRoundCleanup(match, roundResult) {
  for (let i = 0; i < 2; i++) {
    const p = match.players[i];
    const played = p.pendingPlay?.cardIds || [];
    // Remove played from hand (one occurrence per id)
    for (const id of played) {
      const idx = p.hand.indexOf(id);
      if (idx >= 0) p.hand.splice(idx, 1);
      p.discard.push(id);
    }
    p.pendingPlay = null;
    // Refill to handFloor
    if (p.hand.length < RULES.handFloor) {
      drawN(p, RULES.handFloor - p.hand.length);
    }
  }
  // Award score
  const winner = roundResult.winner; // 0 | 1 | -1 (tie)
  if (winner === 0) match.players[0].score++;
  else if (winner === 1) match.players[1].score++;
  match.players[0].lastResult = roundResult;
  match.players[1].lastResult = roundResult;
  match.roundLog.push(roundResult);
}

export function checkGameEnd(match) {
  const [a, b] = match.players;
  if (a.score >= RULES.roundsToWin) return 0;
  if (b.score >= RULES.roundsToWin) return 1;
  if (match.round >= RULES.maxRounds) {
    if (a.score > b.score) return 0;
    if (b.score > a.score) return 1;
    return -1;
  }
  return null;
}
