// Synergy definitions
// A synergy fires when all `requires` tags appear in the union of played cards' tags,
// OR when specified `cardIds` are all present.
// Effect: adds `bonus` raw points to the indicated axis ('accuracy' | 'utility' | 'novelty' | 'all').

export const SYNERGIES = [
  {
    id: 'syn-data-viz',
    name: 'データ可視化シナジー',
    description: '分析タスク × データ志向視点 × 表形式の構造で、有用性に追加点。',
    requires: { tags: ['analysis', 'data'], typeContains: ['structure'] },
    bonus: { utility: 1.5 },
  },
  {
    id: 'syn-creative',
    name: 'クリエイティブシナジー',
    description: '創造的視点 × 物語構造分析 × 描写強化で、独自性に追加点。',
    requires: { cardIds: ['persp-creative', 'task-story', 'task-vivid'], any: 2 },
    bonus: { novelty: 1.8 },
  },
  {
    id: 'syn-exec-brief',
    name: '経営層ブリーフィングシナジー',
    description: 'CEO視点 × エグゼクティブサマリー形式 × 結論先行型で、有用性が大幅に向上。',
    requires: { cardIds: ['persp-ceo', 'struct-execsum', 'struct-conclusionfirst'], any: 2 },
    bonus: { utility: 1.5, accuracy: 0.5 },
  },
  {
    id: 'syn-academic-rigor',
    name: '学術的厳密さシナジー',
    description: '研究者視点 × 批判的視点 × 文献レビューで、正確性が向上。',
    requires: { cardIds: ['persp-researcher', 'persp-critical', 'task-litreview'], any: 2 },
    bonus: { accuracy: 1.5 },
  },
  {
    id: 'syn-tech-spec',
    name: '技術仕様シナジー',
    description: 'エンジニア視点 × 仕様書作成 × Markdown/JSON形式で、有用性が向上。',
    requires: { cardIds: ['persp-engineer', 'task-spec'], tags: ['format'] },
    bonus: { utility: 1.2, accuracy: 0.5 },
  },
  {
    id: 'syn-edu-friendly',
    name: '初学者フレンドリーシナジー',
    description: '教師視点 × 概念説明 × FAQ形式で、有用性と独自性に追加点。',
    requires: { cardIds: ['persp-teacher', 'task-explain', 'struct-faq'], any: 2 },
    bonus: { utility: 1.0, novelty: 0.8 },
  },
  {
    id: 'syn-fact-safety',
    name: '事実重視シナジー',
    description: 'エラー回避 × 論理的視点で、正確性が向上。',
    requires: { cardIds: ['util-noerror', 'persp-logical'] },
    bonus: { accuracy: 1.0 },
  },
  {
    id: 'syn-marketing-pitch',
    name: 'マーケピッチシナジー',
    description: 'マーケター視点 × 提案書形式 × 顧客視点で、有用性が向上。',
    requires: { cardIds: ['persp-marketer', 'struct-proposal', 'persp-customer'], any: 2 },
    bonus: { utility: 1.2, novelty: 0.4 },
  },
];

/**
 * Returns array of triggered synergies given the list of played card objects.
 */
export function detectSynergies(playedCards) {
  const ids = new Set(playedCards.map(c => c.id));
  const tags = new Set(playedCards.flatMap(c => c.tags || []));
  const types = new Set(playedCards.map(c => c.type));

  const triggered = [];
  for (const syn of SYNERGIES) {
    const req = syn.requires;
    let ok = true;

    if (req.cardIds && req.cardIds.length) {
      const matched = req.cardIds.filter(id => ids.has(id)).length;
      const need = req.any ?? req.cardIds.length;
      if (matched < need) ok = false;
    }
    if (ok && req.tags && req.tags.length) {
      if (!req.tags.every(t => tags.has(t))) ok = false;
    }
    if (ok && req.typeContains && req.typeContains.length) {
      if (!req.typeContains.every(t => types.has(t))) ok = false;
    }

    if (ok) triggered.push(syn);
  }
  return triggered;
}
