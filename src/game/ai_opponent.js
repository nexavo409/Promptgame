// Simple heuristic AI opponent: picks a budget-constrained subset that aligns with the topic,
// and optionally activates a single utility card per round.

import { CARD_BY_ID } from '../data/cards.js';
import { RULES } from './rules.js';
import { cardAffinity } from './scoring.js';
import { detectSynergies } from '../data/synergies.js';

/**
 * Decide which utility (if any) the AI should activate this round.
 * Returns { cardId, options } or null. Only chooses zero-interaction utilities.
 */
export function chooseAIUtility(handIds, topic, remainingBudget) {
  const candidates = ['util-noerror', 'util-priority'];
  for (const id of candidates) {
    const inHand = handIds.includes(id);
    if (!inHand) continue;
    const card = CARD_BY_ID[id];
    if (card.cost > remainingBudget) continue;
    return { cardId: id, options: {} };
  }
  return null;
}

/**
 * Choose a play for the AI given its hand and the topic.
 * Strategy: greedy by value-per-cost, ensuring at least one task + one structure if possible,
 * and skipping cards that would push total cost above the limit.
 */
export function chooseAIPlay(handIds, topic, reservedCost = 0) {
  // Utilities are activated separately — exclude them from the played set.
  const hand = handIds.map(id => CARD_BY_ID[id]).filter(c => c && c.type !== 'utility');

  const scored = hand.map(card => ({
    card,
    score: heuristic(card, topic),
  })).sort((a, b) => b.score - a.score);

  const chosen = [];
  const chosenIds = new Set();
  let cost = reservedCost;

  // Phase 1: ensure at least one task
  const task = scored.find(s => s.card.type === 'task' && cost + s.card.cost <= RULES.costLimit);
  if (task) { chosen.push(task.card); chosenIds.add(task.card.id); cost += task.card.cost; }

  // Phase 2: ensure at least one structure
  const struct = scored.find(s => s.card.type === 'structure' && !chosenIds.has(s.card.id)
                                  && cost + s.card.cost <= RULES.costLimit);
  if (struct) { chosen.push(struct.card); chosenIds.add(struct.card.id); cost += struct.card.cost; }

  // Phase 3: greedy fill
  for (const { card } of scored) {
    if (chosenIds.has(card.id)) continue;
    if (cost + card.cost > RULES.costLimit) continue;
    // Cap perspective at 3 and structure at 2
    const sameTypeCount = chosen.filter(c => c.type === card.type).length;
    if (card.type === 'perspective' && sameTypeCount >= 3) continue;
    if (card.type === 'structure' && sameTypeCount >= 2) continue;
    // Skip if marginal — only add if it improves synergy or affinity
    const beforeSyn = detectSynergies(chosen).length;
    chosen.push(card);
    const afterSyn = detectSynergies(chosen).length;
    const affinity = cardAffinity(card, topic.category);
    if (afterSyn <= beforeSyn && affinity < RULES.affinityHit && chosen.length > 3) {
      // revert: marginal addition
      chosen.pop();
      continue;
    }
    chosenIds.add(card.id);
    cost += card.cost;
  }

  return chosen.map(c => c.id);
}

function heuristic(card, topic) {
  const aff = cardAffinity(card, topic.category);
  // Value-per-cost, with bonuses for task/structure essentials
  const base = aff * (card.type === 'task' ? 4 : card.type === 'structure' ? 3 : card.type === 'perspective' ? 2.5 : 1.5);
  const costPenalty = card.cost ? card.cost * 0.6 : 0.1;
  return base - costPenalty;
}
