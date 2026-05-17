// Scoring: affinity multipliers, synergy bonuses, score axes.

import { RULES } from './rules.js';
import { detectSynergies } from '../data/synergies.js';
import { DIFFICULTY_BONUS } from '../data/topics.js';

/**
 * For each card, compute its affinity multiplier vs the topic category.
 */
export function cardAffinity(card, topicCategory) {
  if (!card.category || card.category === 'neutral') return RULES.affinityNeutral;
  if (card.category === topicCategory) return RULES.affinityHit;
  return RULES.affinityMiss;
}

/**
 * Compose the prompt text the player's cards instruct the AI to execute.
 * `modifiers` is an array of { id, text } from activated utilities.
 */
export function composePrompt(playedCards, topic, modifiers = []) {
  const tasks = playedCards.filter(c => c.type === 'task');
  const perspectives = playedCards.filter(c => c.type === 'perspective');
  const structures = playedCards.filter(c => c.type === 'structure');

  const parts = [];
  if (perspectives.length) {
    parts.push(`【視点・スタンス】\n` + perspectives.map(c => `- ${c.name}: ${c.effect}`).join('\n'));
  }
  if (tasks.length) {
    parts.push(`【実施するタスク】\n` + tasks.map(c => `- ${c.name}: ${c.effect}`).join('\n'));
  }
  if (structures.length) {
    parts.push(`【出力構造】\n` + structures.map(c => `- ${c.name}: ${c.effect}`).join('\n'));
  }
  if (modifiers.length) {
    parts.push(`【発動済みユーティリティ指示】\n` + modifiers.map(m => `- ${m.text}`).join('\n'));
  }

  const header = `お題（カテゴリ: ${topic.category} / 難易度: ${topic.difficulty}）\n${topic.title}\n${topic.brief}`;
  const instructions = parts.join('\n\n');

  return `${header}\n\n${instructions}\n\n上記の指示と構造に従い、お題に対する最良の出力を作成してください。`;
}

/**
 * Apply affinity and synergy adjustments to a base AI score.
 * baseScore: { accuracy, utility, novelty } each 0..10
 * Returns { finalAxes, total, breakdown }
 */
export function adjustScore({ baseScore, playedCards, topic, utilityBonus = { accuracy: 0, utility: 0, novelty: 0 } }) {
  // Per-card affinity averaged into a multiplier
  const aff = playedCards.length === 0 ? 1
    : playedCards.reduce((s, c) => s + cardAffinity(c, topic.category), 0) / playedCards.length;

  const synergies = detectSynergies(playedCards);
  const synergyBonus = synergies.reduce((acc, s) => {
    const b = s.bonus || {};
    acc.accuracy += b.accuracy || 0;
    acc.utility += b.utility || 0;
    acc.novelty += b.novelty || 0;
    if (b.all) {
      acc.accuracy += b.all; acc.utility += b.all; acc.novelty += b.all;
    }
    return acc;
  }, { accuracy: 0, utility: 0, novelty: 0 });

  // Difficulty bonus applies to final total
  const diffMult = DIFFICULTY_BONUS[topic.difficulty] ?? 1.0;

  const finalAxes = {
    accuracy: clamp(baseScore.accuracy * aff + synergyBonus.accuracy + (utilityBonus.accuracy || 0), 0, 10),
    utility:  clamp(baseScore.utility  * aff + synergyBonus.utility  + (utilityBonus.utility  || 0), 0, 10),
    novelty:  clamp(baseScore.novelty  * aff + synergyBonus.novelty  + (utilityBonus.novelty  || 0), 0, 10),
  };
  const rawTotal = finalAxes.accuracy + finalAxes.utility + finalAxes.novelty;
  const total = rawTotal * diffMult;

  return {
    finalAxes,
    total,
    breakdown: {
      baseScore,
      affinityMultiplier: aff,
      synergyBonus,
      synergiesTriggered: synergies,
      difficultyMultiplier: diffMult,
      utilityBonus,
    },
  };
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Decide round winner: higher total wins. Tie → fewer cards wins (efficiency rule).
 * If still tied → -1.
 */
export function decideRoundWinner(p1Result, p2Result) {
  const diff = p1Result.total - p2Result.total;
  if (Math.abs(diff) > 0.001) return diff > 0 ? 0 : 1;
  const c1 = p1Result.playedCards.length;
  const c2 = p2Result.playedCards.length;
  if (c1 < c2) return 0;
  if (c2 < c1) return 1;
  return -1;
}
