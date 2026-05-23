// AI client: supports Anthropic API, LM Studio (OpenAI-compatible), and a deterministic mock.
// Priority: LM Studio URL → Anthropic API key → mock.
// Browser-side direct call to Anthropic uses anthropic-dangerous-direct-browser-access header.
// (Acceptable for local single-player playtest. Do not deploy a public site with embedded keys.)

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL_GENERATE = 'claude-haiku-4-5-20251001';
const MODEL_JUDGE = 'claude-haiku-4-5-20251001';

// ---- Backend selection ----
// "openai-compat" covers LM Studio / OpenWebUI / Ollama / vLLM and similar
// OpenAI-compatible HTTP servers. Key kept as 'pa.lmstudioUrl' for backwards
// compatibility with existing localStorage values.
export function getOpenAIURL() {
  return localStorage.getItem('pa.lmstudioUrl') || '';
}
export function setOpenAIURL(url) {
  if (url) localStorage.setItem('pa.lmstudioUrl', url.replace(/\/+$/, ''));
  else localStorage.removeItem('pa.lmstudioUrl');
}
export function getOpenAIBearer() {
  return localStorage.getItem('pa.openaiBearer') || '';
}
export function setOpenAIBearer(token) {
  if (token) localStorage.setItem('pa.openaiBearer', token);
  else localStorage.removeItem('pa.openaiBearer');
}
// Backwards-compat aliases (in case other modules still reference old names)
export const getLMStudioURL = getOpenAIURL;
export const setLMStudioURL = setOpenAIURL;

export function activeBackend() {
  if (getOpenAIURL()) return 'openai-compat';
  if (getApiKey()) return 'anthropic';
  return 'mock';
}
export function hasAIBackend() {
  return activeBackend() !== 'mock';
}

/** Resolve the user-supplied URL to a full chat-completions endpoint. */
function resolveChatEndpoint(base) {
  const url = base.replace(/\/+$/, '');
  // If the user gave us a full endpoint, trust it.
  if (/\/chat\/completions$/.test(url)) return url;
  // Common OpenAI-compatible convention: /v1/chat/completions
  return url + '/v1/chat/completions';
}

const EXPLAIN_SYSTEM = `あなたはプロンプトエンジニアリングを教える簡潔で実用的な教師です。
以下のお題・ユーザーが書いたプロンプト・AIの出力・採点結果を見て、
ユーザーが次の試行でプロンプトを改善できるように短く具体的に講評してください。

含めるべき要素（各 1〜2 文、合計でも 5 文以内）:
- praise: このプロンプトの良かった点（書き方の具体的な工夫を取り上げる）
- improve: 次に改善すべき点を 1 つ（プロンプトの実際の言い回しに踏み込んで示す）
- lesson: このレッスンに関連する汎用的なプロンプト技法を 1 つ

出力は厳密に以下の JSON 形式のみ（前置き・コードブロック・説明文なし）:
{"praise": "...", "improve": "...", "lesson": "..."}`;

const JUDGE_SYSTEM = `あなたはプロンプトエンジニアリング学習アプリの公平な採点者です。
ユーザーが書いたプロンプトと、それに対するAIの出力を読み、以下3軸でそれぞれ0〜10点の整数で採点してください。

- accuracy（正確性）: お題に対する内容の的確さ、事実関係の正しさ、論理整合性
- utility（有用性）: 実務での活用可能性、具体性、対象読者にとっての価値
- novelty（独自性）: 出力の工夫、視点の良さ、差別化された切り口

採点は甘すぎず、学習者が改善点を理解できるようにしてください。
お題と無関係な出力、空欄に近い出力、誤情報を含む出力は低く採点してください。

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

/** Fetch with an abort timeout so a hung backend cannot freeze the UI. */
async function fetchWithTimeout(url, opts, ms = 120000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`タイムアウト（${Math.round(ms / 1000)}秒以内に応答なし）`);
    }
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

async function callAnthropic({ model, system, messages, max_tokens = 1024 }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Anthropic APIキーが設定されていません');

  const res = await fetchWithTimeout(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens, system, messages }),
  }, 120000);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  return text;
}

async function callOpenAICompatible({ system, messages, max_tokens = 1024 }) {
  const base = getOpenAIURL();
  if (!base) throw new Error('OpenAI互換サーバーURLが設定されていません');
  const endpoint = resolveChatEndpoint(base);
  const fullMessages = system ? [{ role: 'system', content: system }, ...messages] : messages;
  const token = getOpenAIBearer();

  const headers = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = 'Bearer ' + token;

  // Local LLMs (LM Studio / OpenWebUI / Ollama / vLLM) can be slow; 3 min timeout.
  const res = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      // Most OpenAI-compatible servers ignore this and use the loaded/default
      // model. Some (OpenWebUI) require it — let users override later if needed.
      model: 'local-model',
      messages: fullMessages,
      max_tokens,
      stream: false,
    }),
  }, 180000);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI互換 ${res.status}: ${txt}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/** Dispatch to whichever backend is configured. */
async function callBackend(opts) {
  const backend = activeBackend();
  if (backend === 'openai-compat') return callOpenAICompatible(opts);
  if (backend === 'anthropic') return callAnthropic(opts);
  throw new Error('AIバックエンドが設定されていません');
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
      // Lesson outputs (FAQs, structured explanations, multi-step analyses)
      // can run 5-8k tokens. Be generous to avoid mid-sentence truncation.
      max_tokens: 8192,
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

# ユーザーが書いたプロンプト
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
 * Generate a teaching explanation for a single attempt.
 * Returns { praise, improve, lesson } strings.
 */
export async function explainResult({ topic, composedPrompt, output, judge }) {
  if (!hasAIBackend()) return mockExplain({ topic, composedPrompt, output, judge });
  const userMsg = `# お題
${topic.title}（${topic.category} / ${topic.difficulty}）
${topic.brief}

# ユーザーが書いたプロンプト
${composedPrompt}

# AIの出力
${output}

# 採点結果
正しさ ${judge.accuracy} / 役立ち ${judge.utility} / 新しさ ${judge.novelty} / 計 ${judge.accuracy + judge.utility + judge.novelty} 点
判定根拠: ${judge.rationale || ''}

このプロンプトについて、初心者にわかりやすい教師として講評してください。JSON のみで返答。`;

  try {
    const text = await callBackend({
      model: MODEL_JUDGE,
      system: EXPLAIN_SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
      max_tokens: 800,
    });
    return parseExplainResponse(text);
  } catch (e) {
    const fallback = mockExplain({ topic, composedPrompt, output, judge });
    fallback.lesson = `[API解説失敗のためモック] ${fallback.lesson}`;
    return fallback;
  }
}

const META_PROMPT_SYSTEM = `あなたはプロンプトエンジニアリングの専門家です。
与えられたお題に対して、高得点を取れる「お手本となるプロンプト」を 1 つ書いてください。

含めるべき要素（必要に応じて取捨選択）:
- 役割の付与 ("あなたは○○です")
- 出力形式の明示 (箇条書き / 表 / 段落数など)
- 制約条件 (字数・禁止事項など)
- 必要なら例示 (Few-shot) や段階的な検討手順
- 対象読者の明確化

ルール:
- プロンプト本文だけを返す
- 説明・前置き・コードフェンスは一切付けない
- 元のお題の意図を尊重する`;

/**
 * Have the AI write its own prompt for the given topic. Used for "AI vs You".
 */
export async function generateAIPrompt(topic) {
  if (!hasAIBackend()) return mockAIPrompt(topic);
  const userMsg = `お題: ${topic.title}
${topic.brief}

このお題に対する高品質なプロンプトを 1 つ書いてください。`;
  try {
    const text = await callBackend({
      model: MODEL_GENERATE,
      system: META_PROMPT_SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
      max_tokens: 2048,
    });
    return text.trim().replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim();
  } catch (e) {
    return mockAIPrompt(topic);
  }
}

function mockAIPrompt(topic) {
  return `あなたは ${topic.category === 'tech' ? '経験豊富なシニアエンジニア' :
          topic.category === 'business' ? '実務経験豊富なコンサルタント' :
          topic.category === 'education' ? 'ベテランの教育者' :
          topic.category === 'creative' ? 'プロのライター' :
          topic.category === 'academic' ? '学術研究者' : '専門家'} です。

お題: ${topic.title}
${topic.brief}

以下の構造で回答してください:
1. 概要 (3行以内で要点を提示)
2. 詳細 (箇条書き 3〜5項目で展開)
3. 結論・推奨アクション

対象読者: 想定される初学者にも理解できるよう、専門用語は補足してください。
制約: 推測や憶測は明示し、事実と意見を分けてください。`;
}

const IMPROVE_SYSTEM = `あなたはプロンプトエンジニアリングの実務コーチです。
ユーザーが書いた既存のプロンプトと、教師からの改善提案を1つ受け取り、
その提案だけを丁寧に反映した「改善版プロンプト」を返してください。

ルール:
- 元のプロンプトの構造と長さを尊重し、提案以外の部分は最小限の変更にとどめる
- 提案を 1 つだけ反映する（推測で勝手に追加機能を入れない）
- 説明・前置き・コメントは一切書かず、改善版プロンプトの本文のみを返す
- コードブロック・引用符で囲まず、生のテキストで返す`;

/**
 * Rewrite the user's prompt by applying a single teacher-suggested improvement.
 * Returns the improved prompt as plain text (no markdown wrapping).
 */
export async function improvePrompt({ prompt, improveAdvice, topic }) {
  if (!hasAIBackend()) return mockImprovePrompt({ prompt, improveAdvice });
  const userMsg = `# 元のプロンプト
${prompt}

# 教師からの改善提案
${improveAdvice}

# お題（参考）
${topic.title}: ${topic.brief}

上記の改善提案を反映した「改善版プロンプト」だけを出力してください。`;

  try {
    const text = await callBackend({
      model: MODEL_GENERATE,
      system: IMPROVE_SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
      max_tokens: 2048,
    });
    // Strip code-fence wrapping if the model added it anyway.
    return text.trim().replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim();
  } catch (e) {
    return mockImprovePrompt({ prompt, improveAdvice });
  }
}

function mockImprovePrompt({ prompt, improveAdvice }) {
  return `${prompt}\n\n[モック改善版 — 実APIで利用するとここに改善版が表示されます]\n（教師からの提案: ${improveAdvice}）`;
}

function parseExplainResponse(text) {
  const obj = extractJsonObject(text, '解説JSON');
  return {
    praise: String(obj.praise || ''),
    improve: String(obj.improve || ''),
    lesson: String(obj.lesson || ''),
  };
}

function mockExplain({ composedPrompt = '', judge }) {
  const total = (judge.accuracy || 0) + (judge.utility || 0) + (judge.novelty || 0);
  const len = composedPrompt.length;
  const hasRole = /あなたは|として|役割|persona|you are/i.test(composedPrompt);
  const hasFormat = /箇条書き|表|json|markdown|形式で|フォーマット|段落|字以内|文字以内/.test(composedPrompt);
  const hasConstraint = /しない|使わない|禁止|以内|限定|だけ/.test(composedPrompt);
  const hasExample = /例(\d|:|：)|例えば|input.*output|example/i.test(composedPrompt);

  // Praise: pick what looks well-done
  let praise = 'お題に対してプロンプトを書き、AIに具体的な指示を出せています。';
  if (hasRole && hasFormat) praise = '「役割」と「出力形式」の両方を明示できており、AIが回答の方向性をつかみやすいプロンプトです。';
  else if (hasRole) praise = '冒頭で役割を与えており、回答の専門性と視点が定まりやすいプロンプトです。';
  else if (hasFormat) praise = '出力形式を明示できており、後から使い回せる構造的な回答を引き出せています。';
  else if (hasExample) praise = '具体例を示すFew-shot的な指示ができており、AIが形式を真似しやすい構成です。';
  else if (len > 200) praise = '一定の情報量があるプロンプトで、お題の文脈をAIに渡せています。';

  // Improve: pick the lowest-hanging fruit
  let improve = '次は「役割」「出力形式」「制約」のうち、まだ書いていないものを1つ加えると安定します。';
  if (judge.accuracy < 7) improve = '前提条件や禁止事項を明示すると、誤解や曖昧な回答を減らせます（例: 「事実に基づき、推測は明示せよ」）。';
  else if (judge.utility < 7) improve = '実務で使いやすくするため、箇条書き・表・手順番号など出力形式を指定してみましょう。';
  else if (judge.novelty < 7) improve = '視点を1つ加える（「初学者向け」「批判的に」など）と、ありきたりでない切り口が出やすくなります。';
  else if (!hasExample) improve = '出力例を1〜2個示すFew-shot形式にすると、AIが期待する形式を確実に真似てくれます。';
  else if (!hasConstraint) improve = '「○○しない」「△△字以内」など制約を1つ追加すると、回答がさらに引き締まります。';

  const lessons = [
    'プロンプトは「目的・対象読者・出力形式」を明示するだけで安定します。',
    'AIに役割を与えると、回答の専門性と視点が定まりやすくなります。',
    '制約条件（字数・禁止事項）は書いた分だけ回答が引き締まります。',
    '入出力例を1〜2個示すと、AIは形式やトーンを真似しやすくなります。',
    '一度で完成を狙わず、出力を見てプロンプトを修正していくのが上達の近道です。',
    '「ステップ1: ... / ステップ2: ...」と検討手順を指定すると、抜け漏れが減ります。',
  ];
  const lesson = `[モック解説] ${lessons[(len + total) % lessons.length]}`;

  return { praise, improve, lesson };
}

/**
 * Robustly extract the first top-level JSON object from an LLM response.
 * Handles common failure modes seen with local/cloud models:
 *   - <think>...</think> reasoning preambles (DeepSeek-R1, QwQ)
 *   - ```json ... ``` code fences
 *   - Greedy-regex traps when there's a 2nd `{` later in the text
 *   - String literals containing `{` or `}`
 * Throws a descriptive error if nothing parseable is found.
 */
export function extractJsonObject(text, label = 'JSON') {
  if (!text || !text.trim()) {
    throw new Error(`${label}: 空応答（max_tokens不足や認証エラーの可能性）`);
  }

  // 1) Strip reasoning blocks.
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2) Strip enclosing markdown fences.
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/```\s*$/i, '').trim();

  // 3) Walk the first balanced {...}, respecting string literals.
  const start = cleaned.indexOf('{');
  if (start < 0) {
    const preview = cleaned.slice(0, 80).replace(/\s+/g, ' ');
    throw new Error(`${label}が返されませんでした (応答冒頭: "${preview}")`);
  }
  let depth = 0;
  let end = -1;
  let inStr = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (inStr) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) throw new Error(`${label}の閉じ括弧が見つかりません`);

  try { return JSON.parse(cleaned.slice(start, end + 1)); }
  catch (e) { throw new Error(`${label}のパースに失敗: ${e.message}`); }
}

function parseJudgeResponse(text) {
  const obj = extractJsonObject(text, '採点JSON');
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
