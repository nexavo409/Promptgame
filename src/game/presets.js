// Preset starter decks (each must be 30 cards, satisfy minimums).
// Type minimums: task >=8, perspective >=4, structure >=4, utility >=2.

import { CARDS } from '../data/cards.js';

function repeat(id, n) { return Array(n).fill(id); }

// Balanced 30-card deck spanning multiple categories.
const BALANCED = [
  // Tasks (12)
  ...repeat('task-swot', 2),
  ...repeat('task-3c', 2),
  ...repeat('task-summary', 2),
  ...repeat('task-analyze', 2),
  ...repeat('task-propose', 1),
  ...repeat('task-explain', 1),
  ...repeat('task-spec', 1),
  ...repeat('task-compare', 1),
  // Perspectives (8)
  ...repeat('persp-ceo', 1),
  ...repeat('persp-customer', 2),
  ...repeat('persp-engineer', 1),
  ...repeat('persp-logical', 2),
  ...repeat('persp-neutral', 1),
  ...repeat('persp-critical', 1),
  // Structures (6)
  ...repeat('struct-conclusionfirst', 2),
  ...repeat('struct-bullets', 1),
  ...repeat('struct-table', 1),
  ...repeat('struct-markdown', 1),
  ...repeat('struct-prep', 1),
  // Utilities (4)
  ...repeat('util-explore', 2),
  ...repeat('util-organize', 1),
  ...repeat('util-noerror', 1),
];

const BUSINESS_FOCUS = [
  // Tasks (12)
  ...repeat('task-swot', 3),
  ...repeat('task-3c', 2),
  ...repeat('task-pest', 2),
  ...repeat('task-4p', 2),
  ...repeat('task-kpi', 2),
  ...repeat('task-propose', 1),
  // Perspectives (8)
  ...repeat('persp-ceo', 2),
  ...repeat('persp-customer', 2),
  ...repeat('persp-marketer', 2),
  ...repeat('persp-investor', 1),
  ...repeat('persp-logical', 1),
  // Structures (6)
  ...repeat('struct-execsum', 2),
  ...repeat('struct-conclusionfirst', 2),
  ...repeat('struct-proposal', 1),
  ...repeat('struct-priority', 1),
  // Utilities (4)
  ...repeat('util-explore', 2),
  ...repeat('util-priority', 1),
  ...repeat('util-noerror', 1),
];

const TECH_FOCUS = [
  // Tasks (12)
  ...repeat('task-spec', 3),
  ...repeat('task-api', 2),
  ...repeat('task-test', 2),
  ...repeat('task-codereview', 2),
  ...repeat('task-erroranalysis', 2),
  ...repeat('task-summary', 1),
  // Perspectives (8)
  ...repeat('persp-engineer', 3),
  ...repeat('persp-logical', 2),
  ...repeat('persp-critical', 1),
  ...repeat('persp-neutral', 2),
  // Structures (6)
  ...repeat('struct-markdown', 2),
  ...repeat('struct-json', 2),
  ...repeat('struct-table', 1),
  ...repeat('struct-bullets', 1),
  // Utilities (4)
  ...repeat('util-noerror', 1),
  ...repeat('util-explore', 2),
  ...repeat('util-organize', 1),
];

const CREATIVE_EDU = [
  // Tasks (12)
  ...repeat('task-story', 2),
  ...repeat('task-character', 2),
  ...repeat('task-vivid', 2),
  ...repeat('task-dialogue', 1),
  ...repeat('task-explain', 2),
  ...repeat('task-qa', 2),
  ...repeat('task-summary', 1),
  // Perspectives (8)
  ...repeat('persp-creative', 2),
  ...repeat('persp-designer', 2),
  ...repeat('persp-teacher', 2),
  ...repeat('persp-newhire', 1),
  ...repeat('persp-neutral', 1),
  // Structures (6)
  ...repeat('struct-faq', 2),
  ...repeat('struct-bullets', 1),
  ...repeat('struct-markdown', 1),
  ...repeat('struct-prep', 1),
  ...repeat('struct-chrono', 1),
  // Utilities (4)
  ...repeat('util-explore', 2),
  ...repeat('util-organize', 1),
  ...repeat('util-prep', 1),
];

export const PRESET_DECKS = [
  { id: 'balanced', name: 'バランス型スターター', description: '複数カテゴリに対応する汎用デッキ。', cards: BALANCED },
  { id: 'business', name: 'ビジネス特化', description: '経営・マーケのお題に強い。', cards: BUSINESS_FOCUS },
  { id: 'tech',     name: 'エンジニアリング特化', description: '技術系お題で本領発揮。', cards: TECH_FOCUS },
  { id: 'creative', name: 'クリエイティブ＋教育', description: '創作・教育系お題で強み。', cards: CREATIVE_EDU },
];

// Sanity check (dev-only): warn if any preset is invalid.
import { validateDeck } from './rules.js';
import { CARD_BY_ID } from '../data/cards.js';
export function validatePresets() {
  return PRESET_DECKS.map(p => ({
    id: p.id,
    ...validateDeck(p.cards, CARD_BY_ID),
    size: p.cards.length,
  }));
}
