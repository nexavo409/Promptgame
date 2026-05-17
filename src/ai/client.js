// AI client: supports Anthropic API, LM Studio (OpenAI-compatible), and a deterministic mock.
// Priority: LM Studio URL → Anthropic API key → mock.
// Browser-side direct call to Anthropic uses anthropic-dangerous-direct-browser-access header.
// (Acceptable for local single-player playtest. Do not deploy a public site with embedded keys.)

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL_GENERATE = 'claude-haiku-4-5-20251001';
const MODEL_JUDGE = 'claude-haiku-4-5-20251001';

// ---- Backend selection ----
export function getLMStudioURL() {
  return localStorage.getItem('pa.lmstudioUrl') || '';
}
export function setLMStudioURL(url) {
  if (url) localStorage.setItem('pa.lmstudioUrl', url.replace(/\/+$/, ''));
  else localStorage.removeItem('pa.lmstudioUrl');
}
export function activeBackend() {
  if (getLMStudioURL()) return 'lmstudio';
  if (getApiKey()) return 'anthropic';
  return 'mock';
}
export function hasAIBackend() {
  return activeBackend() !== 'mock';
}

const EXPLAIN_SYSTEM = `あなたはプロンプトエンジニアリングを教える親切で簡潔な教師です。
以下のお題・プレイヤーが組み立てたプロンプト・AIの出力・採点結果を見て、
初心者プレイヤーが「プロンプトの書き方」を学べるような短い解説を行ってください。

含めるべき要素（各 1〜2 文、合計でも 5 文以内）:
- praise: このプロンプトの良かった点（どのカード選択が何を効かせたか、具体的に）
- improve: もっと良くするには（次回試せる技法を 1 つ）
- lesson: プロンプトエンジニアリング上の「ひと言レッスン」（汎用テクニック）

出力は厳密に以下の JSON 形式のみ（前置き・コードブロック・説明文なし）:
{"praise": "...", "improve": "...", "lesson": "..."}`;

const JUDGE_SYSTEM = `あなたはプロンプトトレーディングカードゲームの公平な審査員です。
プレイヤーが組み立てたプロンプトと、それに対するAIの出力を読み、以下3軸でそれぞれ0〜10点の整数で採点してください。

- accuracy（正確性）: お題に対する内容の的確さ、事実関係の正しさ、論理整合性
- utility（有用性）: 実務での活用可能性、具体性、対象読者にとっての価値
- novelty（独自性）: 他の出力との差別化、深い洞察、新しい切り口

出力は厳密に以下のJSON形式のみで返してください。説明文・コードブロック・前置きは一切付けないでください。
{"accuracy": <int 0..10>, "utility": <int 0..10>, "novelty": <int 0..10>, "rationale": "<1〜2文の根拠>"}`;

export function hasApiKey() {
  return !!localStorage.getItem('pa.apiKey');
}

export function setApiKey(key) {
  if (key) localStorage.setItem('pa.apiKey', key);
  else localStorage.removeItem('pa.apiKey');
}

export function getApiKey() {
  return localStorage.getItem('pa.apiKey') || '';
}

async function callAnthropic({ model, system, messages, max_tokens = 1024 }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Anthropic APIキーが設定されていません');

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens, system, messages }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  return text;
}

async function callLMStudio({ system, messages, max_tokens = 1024 }) {
  const base = getLMStudioURL();
  if (!base) throw new Error('LM Studio URL is not set');
  const endpoint = base + '/v1/chat/completions';
  const fullMessages = system ? [{ role: 'system', content: system }, ...messages] : messages;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'local-model',  // LM Studio uses whichever model is currently loaded
      messages: fullMessages,
      max_tokens,
      stream: false,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`LM Studio ${res.status}: ${txt}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/** Dispatch to whichever backend is configured. */
async function callBackend(opts) {
  const backend = activeBackend();
  if (backend === 'lmstudio') return callLMStudio(opts);
  if (backend === 'anthropic') return callAnthropic(opts);
  throw new Error('No AI backend configured');
}

/**
 * Generate an output for a composed prompt.
 */
export async function generateOutput(composedPrompt) {
  if (!hasAIBackend()) {
    return mockGenerate(composedPrompt);
  }
  try {
    return await callBackend({
      model: MODEL_GENERATE,
      messages: [{ role: 'user', content: composedPrompt }],
      max_tokens: 1024,
    });
  } catch (e) {
    return `【API呼び出しエラー — モック出力にフォールバック】\n${e.message}\n\n` + mockGenerate(composedPrompt);
  }
}

/**
 * Judge an output. Returns { accuracy, utility, novelty, rationale }.
 */
export async function judgeOutput({ topic, composedPrompt, output }) {
  if (!hasAIBackend()) {
    return mockJudge({ topic, composedPrompt, output });
  }
  const userMsg = `# お題
${topic.title}
${topic.brief}

# プレイヤーが組み立てたプロンプト
${composedPrompt}

# AIの出力
${output}

上記を採点してください。JSONのみを返答してください。`;

  try {
    const text = await callBackend({
      model: MODEL_JUDGE,
      system: JUDGE_SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
      max_tokens: 400,
    });
    return parseJudgeResponse(text);
  } catch (e) {
    const fallback = mockJudge({ topic, composedPrompt, output });
    fallback.rationale = `[API判定失敗のためモック採点] ${e.message}`;
    return fallback;
  }
}

/**
 * Generate a teaching explanation for a single play result.
 * Returns { praise, improve, lesson } strings.
 */
export async function explainResult({ topic, composedPrompt, output, judge, playedCards = [] }) {
  if (!hasAIBackend()) return mockExplain({ topic, composedPrompt, output, judge, playedCards });
  const cardList = playedCards.map(c => `[${c.type}] ${c.name}: ${c.effect}`).join('\n');
  const userMsg = `# お題
${topic.title}（${topic.category} / ${topic.difficulty}）
${topic.brief}

# プレイヤーが使ったカード
${cardList || '(なし)'}

# 組み立てられたプロンプト
${composedPrompt}

# AIの出力
${output}

# 採点結果
正しさ ${judge.accuracy} / 役立ち ${judge.utility} / 新しさ ${judge.novelty} / 計 ${judge.accuracy + judge.utility + judge.novelty} 点
判定根拠: ${judge.rationale || ''}

このプロンプトについて、初心者にわかりやすい教師として解説してください。JSON のみで返答。`;

  try {
    const text = await callBackend({
      model: MODEL_JUDGE,
      system: EXPLAIN_SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
      max_tokens: 500,
    });
    return parseExplainResponse(text);
  } catch (e) {
    const fallback = mockExplain({ topic, composedPrompt, output, judge, playedCards });
    fallback.lesson = `[API解説失敗のためモック] ${fallback.lesson}`;
    return fallback;
  }
}

function parseExplainResponse(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('解説のJSONが見つかりません');
  let obj;
  try { obj = JSON.parse(match[0]); }
  catch { throw new Error('解説JSONのパースに失敗'); }
  return {
    praise: String(obj.praise || ''),
    improve: String(obj.improve || ''),
    lesson: String(obj.lesson || ''),
  };
}

function mockExplain({ topic, playedCards, judge }) {
  const total = (judge.accuracy || 0) + (judge.utility || 0) + (judge.novelty || 0);
  const hasTask = playedCards.some(c => c.type === 'task');
  const hasStruct = playedCards.some(c => c.type === 'structure');
  const hasPersp = playedCards.some(c => c.type === 'perspective');
  const matched = playedCards.filter(c => c.category === topic.category);

  let praise;
  if (matched.length) {
    praise = `お題カテゴリ（${topic.category}）に合う「${matched[0].name}」が点数を押し上げました。カードと話題の相性は大事です。`;
  } else if (hasTask && hasStruct) {
    praise = `タスクと構造の両方を入れた基本構成。プロンプトの背骨ができていたので AI も応えやすかったはずです。`;
  } else {
    praise = `${playedCards.length}枚のカードで指示を組み立てられました。少ない情報でも AI は推測で補ってくれます。`;
  }

  let improve;
  if (!hasPersp) improve = `「視点（だれの立場で考えるか）」を1枚加えると、出力に角度がついて差別化されます。`;
  else if (!hasStruct) improve = `「構造（どんな形で書くか）」を入れると、AI の出力が読みやすくなります。`;
  else if (matched.length === 0) improve = `今回はお題と相性の良いカードがありませんでした。次は ${topic.category} 系のカードも視野に入れてみましょう。`;
  else improve = `合わせ技ボーナスを狙ってカード同士の組み合わせを意識すると、もう一段スコアが伸びます。`;

  const lessons = [
    'プロンプトは「何を／だれの立場で／どう書くか」の3要素が揃うと安定します。',
    'AI に役割を与える（CEO・教師・批判的視点など）と出力の方向性が定まります。',
    '出力フォーマット（箇条書き・表・JSON）を指定するだけで使い物にならない出力が減ります。',
    '事実重視の指示を入れると幻覚（誤情報）が減りやすくなります。',
    '同じお題でも視点を変えると違う発見が得られる、これがプロンプトを試行錯誤する価値です。',
  ];
  const lesson = `[モック解説] ${lessons[(playedCards.length + total) % lessons.length]}`;

  return { praise, improve, lesson };
}

function parseJudgeResponse(text) {
  // Extract JSON object
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('判定結果のJSONが見つかりません');
  let obj;
  try { obj = JSON.parse(match[0]); }
  catch { throw new Error('判定結果JSONのパースに失敗'); }
  return {
    accuracy: clampInt(obj.accuracy, 0, 10),
    utility: clampInt(obj.utility, 0, 10),
    novelty: clampInt(obj.novelty, 0, 10),
    rationale: obj.rationale || '',
  };
}

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v) || 0);
  return Math.max(lo, Math.min(hi, n));
}

// ===== Mock fallback =====
// Deterministic — derived from composed prompt content for repeatability without API.

function mockGenerate(composedPrompt) {
  const hash = simpleHash(composedPrompt);
  const samples = [
    '【モック出力】依頼内容を踏まえ、要点を3つに整理しました。\n1. 主要な論点の特定\n2. 根拠データの提示\n3. 実行可能な推奨アクション\nなお本出力はモックであり、実運用にはAPIキー設定を推奨します。',
    '【モック出力】お題について以下の観点で整理しました。背景・現状分析・提案・期待効果・リスクの順で記述しています（簡略版）。実APIではより具体的な出力が得られます。',
    '【モック出力】指示された構造に従いつつ、最も重要な結論を冒頭に置きました。詳細はAPIキー設定後にお試しください。',
  ];
  return samples[hash % samples.length];
}

function mockJudge({ topic, composedPrompt, output }) {
  // Heuristic: longer & more category-aligned prompts get higher scores.
  const hash = simpleHash(composedPrompt + output);
  const len = composedPrompt.length;
  const categoryHits = (composedPrompt.match(new RegExp(topic.category, 'g')) || []).length;
  const base = 5 + Math.min(3, Math.floor(len / 400)) + Math.min(2, categoryHits);

  const jitter = (seed, range) => ((simpleHash(composedPrompt + seed) % (range * 2 + 1)) - range);
  return {
    accuracy: clampInt(base + jitter('a', 2), 0, 10),
    utility: clampInt(base + jitter('u', 2), 0, 10),
    novelty: clampInt(base - 1 + jitter('n', 2), 0, 10),
    rationale: `[モック採点] 文量${len}文字、お題カテゴリ言及${categoryHits}回をベースに採点。APIキー設定で本格採点が可能です。`,
  };
}

function simpleHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
