// Game rules and constants
import { RARITY_LIMITS } from '../data/cards.js';

export const RULES = {
  deckSize: 30,
  initialHand: 7,
  handFloor: 4,
  costLimit: 10,
  roundsToWin: 3,
  maxRounds: 5,
  minimums: { task: 8, perspective: 4, structure: 4, utility: 2 },
  affinityHit: 1.5,
  affinityMiss: 0.7,
  affinityNeutral: 1.0,
};

/**
 * Validate a deck (array of card ids — duplicates allowed up to rarity limit and same-name cap 3).
 * Returns { ok, errors[] }.
 */
export function validateDeck(cardIds, cardById) {
  const errors = [];

  if (cardIds.length !== RULES.deckSize) {
    errors.push(`デッキは${RULES.deckSize}枚必要です（現在 ${cardIds.length} 枚）`);
  }

  const counts = {};
  for (const id of cardIds) counts[id] = (counts[id] || 0) + 1;

  // Same-name cap = 3
  for (const [id, n] of Object.entries(counts)) {
    if (n > 3) errors.push(`「${cardById[id]?.name || id}」は最大3枚までです（現在 ${n} 枚）`);
  }

  // Rarity caps
  for (const [id, n] of Object.entries(counts)) {
    const card = cardById[id];
    if (!card) continue;
    const limit = RARITY_LIMITS[card.rarity] ?? Infinity;
    if (n > limit) {
      errors.push(`「${card.name}」(${card.rarity}) は最大${limit}枚までです（現在 ${n} 枚）`);
    }
  }

  // Type minimums
  const typeCounts = { task: 0, perspective: 0, structure: 0, utility: 0 };
  for (const id of cardIds) {
    const t = cardById[id]?.type;
    if (t && typeCounts[t] !== undefined) typeCounts[t]++;
  }
  for (const [t, min] of Object.entries(RULES.minimums)) {
    if (typeCounts[t] < min) {
      errors.push(`${t} タイプを最低 ${min} 枚必要です（現在 ${typeCounts[t]} 枚）`);
    }
  }

  return { ok: errors.length === 0, errors, typeCounts };
}

/**
 * Mulligan eligibility: starting hand lacks at least one of task/structure.
 */
export function shouldOfferMulligan(handCards) {
  const types = new Set(handCards.map(c => c.type));
  return !types.has('task') || !types.has('structure');
}

/**
 * Sum of card costs.
 */
export function totalCost(cards) {
  return cards.reduce((s, c) => s + (c.cost || 0), 0);
}
