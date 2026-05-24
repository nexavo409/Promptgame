// AI client: supports Anthropic API, OpenAI-compatible local servers, and a deterministic mock.
// Priority: OpenAI-compatible URL → Anthropic API key → mock.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL_GENERATE = 'claude-haiku-4-5-20251001';
const MODEL_JUDGE = 'claude-haiku-4-5-20251001';

export function getOpenAIURL() { return localStorage.getItem('pa.lmstudioUrl') || ''; }
export function setOpenAIURL(url) {
  if (url) localStorage.setItem('pa.lmstudioUrl', url.replace(/\/+$/, ''));
  else localStorage.removeItem('pa.lmstudioUrl');
}
export function getOpenAIBearer() { return localStorage.getItem('pa.openaiBearer') || ''; }
export function setOpenAIBearer(token) {
  if (token) localStorage.setItem('pa.openaiBearer', token);
  else localStorage.removeItem('pa.openaiBearer');
}
export const getLMStudioURL = getOpenAIURL;
export const setLMStudioURL = setOpenAIURL;
export function hasApiKey() { return !!localStorage.getItem('pa.apiKey'); }
export function setApiKey(key) {
  if (key) localStorage.setItem('pa.apiKey', key);
  else localStorage.removeItem('pa.apiKey');
}
export function getApiKey() { return localStorage.getItem('pa.apiKey') || ''; }
export function activeBackend() {
  if (getOpenAIURL()) return 'openai-compat';
  if (getApiKey()) return 'anthropic';
  return 'mock';
}
export function hasAIBackend() { return activeBackend() !== 'mock'; }

function resolveChatEndpoint(base) {
  const url = base.replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(url)) return url;
  return url + '/v1/chat/completions';
}

const EXPLAIN_SYSTEM = `あなたはプロンプトエンジニアリングを教える簡潔で実用的な教師です。
以下のお題・ユーザーが書いたプロンプト・AIの出力・採点結果を見て、次の試行で改善できるように短く具体的に講評してください。
出力は厳密に以下の JSON 形式のみ:
{"praise": "...", "improve": "...", "lesson": "..."}`;

const JUDGE_SYSTEM = `あなたはプロンプトエンジニアリング学習アプリの厳格な採点者です。
ユーザーが書いたプロンプトと、それに対するAIの出力を読み、「AIの出力品質」だけではなく「プロンプト自体の設計品質」を重視して採点してください。

採点軸:
- accuracy（正確性）: プロンプトが、お題の目的を正確に伝えられているか。曖昧な依頼、前提不足、対象読者の不明確さがある場合は減点する。AIの出力が正しくても、プロンプトが曖昧なら高得点にしない。
- utility（有用性）: プロンプトが、実用的で再現性のある出力を引き出せる設計になっているか。出力形式、粒度、対象読者、制約条件、評価観点が明示されているほど高評価。単に「教えてください」だけなら最大6点程度に抑える。
- novelty（独自性）: プロンプトに独自の視点、比較軸、読者設定、制約、構成上の工夫があるか。一般的な依頼文だけなら最大4点。箇条書き指定だけなら最大6点。明確な切り口や高度な設計がある場合のみ7点以上にする。

重要ルール:
- AIの出力が良くても、プロンプトが単純・曖昧なら高得点にしない。
- お題をそのまま言い換えただけのプロンプトは、原則として accuracy 6以下、utility 6以下、novelty 4以下。
- 出力形式を指定している場合は utility を加点する。
- 対象読者、役割、制約、比較軸、手順、例示がある場合は加点する。
- 採点は甘くしない。学習者が改善余地を理解できる点数にする。

出力は厳密に以下のJSON形式のみで返してください。
{"accuracy": <int 0..10>, "utility": <int 0..10>, "novelty": <int 0..10>, "rationale": "<1〜2文の根拠>"}`;

const META_PROMPT_SYSTEM = `あなたはプロンプトエンジニアリングの専門家です。
与えられたお題に対して、高得点を取れる「お手本となるプロンプト」を 1 つ書いてください。
含める要素は必要に応じて、役割、出力形式、制約条件、例示、検討手順、対象読者です。
ルール: プロンプト本文だけを返す。説明・前置き・コードフェンスは付けない。元のお題の意図を尊重する。`;

const IMPROVE_SYSTEM = `あなたはプロンプトエンジニアリングの実務コーチです。
ユーザーが書いた既存のプロンプトと、教師からの改善提案を1つ受け取り、その提案だけを丁寧に反映した「改善版プロンプト」を返してください。
ルール: 元の構造と長さを尊重し、提案以外の変更は最小限にする。説明・前置き・コメント・コードフェンスは付けず、本文のみ返す。`;

async function fetchWithTimeout(url, opts, ms = 120000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`タイムアウト（${Math.round(ms / 1000)}秒以内に応答なし）`);
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
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
}

async function callOpenAICompatible({ system, messages, max_tokens = 1024 }) {
  const base = getOpenAIURL();
  if (!base) throw new Error('OpenAI互換サーバーURLが設定されていません');
  const headers = { 'content-type': 'application/json' };
  const token = getOpenAIBearer();
  if (token) headers.authorization = 'Bearer ' + token;
  const res = await fetchWithTimeout(resolveChatEndpoint(base), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'local-model',
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
      max_tokens,
      stream: false,
    }),
  }, 180000);
  if (!res.ok) throw new Error(`OpenAI互換 ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  const finishReason = data.choices?.[0]?.finish_reason;
  let content = stripLeakedThinking(msg?.content || '').trim();
  if (!content && msg?.reasoning_content && finishReason === 'stop') content = msg.reasoning_content.trim();
  if (!content && finishReason === 'length') {
    throw new Error('reasoning モデルがトークン予算を全て内部思考に費やし、出力が切り捨てられました (finish_reason=length)。max_tokens を増やすか、非 reasoning モデルへの切り替えをお試しください。');
  }
  return content;
}

function stripLeakedThinking(text) {
  if (!text) return '';
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\s*Thinking Process:[\s\S]*?(?=\n\n[^\d\s\-*])/i, '');
}

async function callBackend(opts) {
  const backend = activeBackend();
  if (backend === 'openai-compat') return callOpenAICompatible(opts);
  if (backend === 'anthropic') return callAnthropic(opts);
  throw new Error('AIバックエンドが設定されていません');
}

export async function generateOutput(composedPrompt) {
  if (!hasAIBackend()) return mockGenerate(composedPrompt);
  try {
    const text = await callBackend({ model: MODEL_GENERATE, messages: [{ role: 'user', content: composedPrompt }], max_tokens: 8192 });
    if (!text || !text.trim()) {
      return ['【AIが応答本文を生成しませんでした】', 'reasoning モデルがトークン予算を全て内部思考に費やし、出力欄が空のまま返ってきた可能性があります。', '対策: より小さな reasoning モデル / 非 reasoning モデルに切り替える、または LM Studio 側で max_tokens を増やす。'].join('\n');
    }
    return text;
  } catch (e) {
    return `【API呼び出しエラー — モック出力にフォールバック】\n${e.message}\n\n` + mockGenerate(composedPrompt);
  }
}

export async function judgeOutput({ topic, composedPrompt, output }) {
  if (!hasAIBackend()) return mockJudge({ topic, composedPrompt, output });
  if (!output || !output.trim()) {
    return { accuracy: 0, utility: 0, novelty: 0, rationale: 'AIが応答本文を生成しなかったため採点できません。reasoning モデルがトークン予算を内部思考に使い切った可能性があります。' };
  }
  const userMsg = `# お題\n${topic.title}\n${topic.brief}\n\n# ユーザーが書いたプロンプト\n${composedPrompt}\n\n# AIの出力\n${output}\n\n上記を採点してください。JSONのみを返答してください。`;
  try {
    const text = await callBackend({ model: MODEL_JUDGE, system: JUDGE_SYSTEM, messages: [{ role: 'user', content: userMsg }], max_tokens: 2048 });
    return applyPromptQualityCaps(parseJudgeResponse(text), composedPrompt);
  } catch (e) {
    const fallback = mockJudge({ topic, composedPrompt, output });
    fallback.rationale = `[API判定失敗のためモック採点] ${e.message} ${fallback.rationale || ''}`.trim();
    return fallback;
  }
}

export async function explainResult({ topic, composedPrompt, output, judge }) {
  if (!hasAIBackend()) return mockExplain({ composedPrompt, judge });
  const userMsg = `# お題\n${topic.title}（${topic.category} / ${topic.difficulty}）\n${topic.brief}\n\n# ユーザーが書いたプロンプト\n${composedPrompt}\n\n# AIの出力\n${output}\n\n# 採点結果\n正しさ ${judge.accuracy} / 役立ち ${judge.utility} / 新しさ ${judge.novelty} / 計 ${judge.accuracy + judge.utility + judge.novelty} 点\n判定根拠: ${judge.rationale || ''}\n\nこのプロンプトについて、初心者にわかりやすい教師として講評してください。JSON のみで返答。`;
  try {
    const text = await callBackend({ model: MODEL_JUDGE, system: EXPLAIN_SYSTEM, messages: [{ role: 'user', content: userMsg }], max_tokens: 2048 });
    return parseExplainResponse(text);
  } catch (e) {
    const fallback = mockExplain({ composedPrompt, judge });
    fallback.lesson = `[API解説失敗のためモック] ${fallback.lesson}`;
    return fallback;
  }
}

export async function generateAIPrompt(topic) {
  if (!hasAIBackend()) return mockAIPrompt(topic);
  const userMsg = `お題: ${topic.title}\n${topic.brief}\n\nこのお題に対する高品質なプロンプトを 1 つ書いてください。`;
  try {
    const text = await callBackend({ model: MODEL_GENERATE, system: META_PROMPT_SYSTEM, messages: [{ role: 'user', content: userMsg }], max_tokens: 4096 });
    return stripCodeFence(text);
  } catch (e) {
    return mockAIPrompt(topic);
  }
}

export async function improvePrompt({ prompt, improveAdvice, topic }) {
  if (!hasAIBackend()) return mockImprovePrompt({ prompt, improveAdvice });
  const userMsg = `# 元のプロンプト\n${prompt}\n\n# 教師からの改善提案\n${improveAdvice}\n\n# お題（参考）\n${topic.title}: ${topic.brief}\n\n上記の改善提案を反映した「改善版プロンプト」だけを出力してください。`;
  try {
    const text = await callBackend({ model: MODEL_GENERATE, system: IMPROVE_SYSTEM, messages: [{ role: 'user', content: userMsg }], max_tokens: 4096 });
    return stripCodeFence(text);
  } catch (e) {
    return `${prompt}\n\n[改善版生成エラー: ${e.message}]\n（元のプロンプトをそのまま返しています）`;
  }
}

function stripCodeFence(text) {
  return String(text || '').trim().replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim();
}

function analyzePromptFeatures(prompt) {
  return {
    hasRole: /あなたは|として|専門家|コンサルタント|教師|エンジニア|管理栄養士|ライター|you are/i.test(prompt),
    hasFormat: /箇条書き|表|JSON|Markdown|形式|構成|段落|項目|リスト/.test(prompt),
    hasConstraint: /以内|禁止|使わない|含める|除外|制約|条件|だけ|必ず/.test(prompt),
    hasExample: /例|入力|出力|サンプル|例えば|few-shot/i.test(prompt),
    hasSteps: /ステップ|手順|順に|まず|次に|最後に|Step/i.test(prompt),
    hasAudience: /初心者|小学生|中学生|経営者|読者|対象|向け|ユーザー/.test(prompt),
    hasPerspective: /比較|観点|メリット|デメリット|リスク|注意点|批判的|中立的/.test(prompt),
  };
}

function countPromptFeatures(features) { return Object.values(features).filter(Boolean).length; }

function applyPromptQualityCaps(judge, prompt) {
  const features = analyzePromptFeatures(prompt || '');
  const featureCount = countPromptFeatures(features);
  const capped = { ...judge };
  if (featureCount === 0) {
    capped.accuracy = Math.min(capped.accuracy, 6);
    capped.utility = Math.min(capped.utility, 6);
    capped.novelty = Math.min(capped.novelty, 4);
    capped.rationale = appendRationale(capped.rationale, 'プロンプト自体が単純で、役割・出力形式・制約・対象読者などの設計要素が不足しています。');
    return capped;
  }
  if (featureCount === 1 && features.hasFormat) {
    capped.novelty = Math.min(capped.novelty, 6);
    capped.rationale = appendRationale(capped.rationale, '出力形式は指定されていますが、独自の視点や対象読者の指定はまだ限定的です。');
    return capped;
  }
  return capped;
}

function appendRationale(base, extra) {
  if (!base) return extra;
  if (base.includes(extra)) return base;
  return `${base} ${extra}`;
}

function parseExplainResponse(text) {
  const obj = extractJsonObject(text, '解説JSON');
  return { praise: String(obj.praise || ''), improve: String(obj.improve || ''), lesson: String(obj.lesson || '') };
}

export function extractJsonObject(text, label = 'JSON') {
  if (!text || !text.trim()) throw new Error(`${label}: 空応答（max_tokens不足や認証エラーの可能性）`);
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/```\s*$/i, '').trim();
  const start = cleaned.indexOf('{');
  if (start < 0) throw new Error(`${label}が返されませんでした (応答冒頭: "${cleaned.slice(0, 80).replace(/\s+/g, ' ')}")`);
  let depth = 0, end = -1, inStr = false, escape = false;
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
  return { accuracy: clampInt(obj.accuracy, 0, 10), utility: clampInt(obj.utility, 0, 10), novelty: clampInt(obj.novelty, 0, 10), rationale: obj.rationale || '' };
}

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v) || 0);
  return Math.max(lo, Math.min(hi, n));
}

function mockGenerate(composedPrompt) {
  const samples = [
    '【モック出力】依頼内容を踏まえ、要点を3つに整理しました。\n1. 主要な論点の特定\n2. 根拠データの提示\n3. 実行可能な推奨アクション\nなお本出力はモックであり、実運用にはAPIキー設定を推奨します。',
    '【モック出力】お題について以下の観点で整理しました。背景・現状分析・提案・期待効果・リスクの順で記述しています（簡略版）。実APIではより具体的な出力が得られます。',
    '【モック出力】指示された構造に従いつつ、最も重要な結論を冒頭に置きました。詳細はAPIキー設定後にお試しください。',
  ];
  return samples[simpleHash(composedPrompt) % samples.length];
}

function mockJudge({ topic, composedPrompt, output }) {
  const len = composedPrompt.length;
  const categoryHits = (composedPrompt.match(new RegExp(topic.category, 'g')) || []).length;
  const base = 5 + Math.min(3, Math.floor(len / 400)) + Math.min(2, categoryHits);
  const jitter = (seed, range) => ((simpleHash(composedPrompt + output + seed) % (range * 2 + 1)) - range);
  const raw = {
    accuracy: clampInt(base + jitter('a', 2), 0, 10),
    utility: clampInt(base + jitter('u', 2), 0, 10),
    novelty: clampInt(base - 1 + jitter('n', 2), 0, 10),
    rationale: `[モック採点] 文量${len}文字、お題カテゴリ言及${categoryHits}回をベースに採点。APIキー設定で本格採点が可能です。`,
  };
  return applyPromptQualityCaps(raw, composedPrompt);
}

function mockExplain({ composedPrompt = '', judge }) {
  const total = (judge.accuracy || 0) + (judge.utility || 0) + (judge.novelty || 0);
  const len = composedPrompt.length;
  const features = analyzePromptFeatures(composedPrompt);
  let praise = 'お題に対してプロンプトを書き、AIに指示を出せています。';
  if (features.hasRole && features.hasFormat) praise = '「役割」と「出力形式」の両方を明示できており、AIが回答の方向性をつかみやすいプロンプトです。';
  else if (features.hasRole) praise = '冒頭で役割を与えており、回答の専門性と視点が定まりやすいプロンプトです。';
  else if (features.hasFormat) praise = '出力形式を明示できており、後から使い回せる構造的な回答を引き出せています。';
  else if (features.hasExample) praise = '具体例を示すFew-shot的な指示ができており、AIが形式を真似しやすい構成です。';
  else if (len > 200) praise = '一定の情報量があるプロンプトで、お題の文脈をAIに渡せています。';

  let improve = '次は「役割」「出力形式」「制約」のうち、まだ書いていないものを1つ加えると安定します。';
  if (judge.accuracy < 7) improve = '前提条件や禁止事項を明示すると、誤解や曖昧な回答を減らせます。';
  else if (judge.utility < 7) improve = '実務で使いやすくするため、箇条書き・表・手順番号など出力形式を指定してみましょう。';
  else if (judge.novelty < 7) improve = '対象読者や比較観点を1つ加えると、ありきたりでない切り口が出やすくなります。';
  else if (!features.hasExample) improve = '出力例を1〜2個示すFew-shot形式にすると、AIが期待する形式を確実に真似てくれます。';
  else if (!features.hasConstraint) improve = '「○○しない」「△△字以内」など制約を1つ追加すると、回答がさらに引き締まります。';
  const lessons = [
    'プロンプトは「目的・対象読者・出力形式」を明示するだけで安定します。',
    'AIに役割を与えると、回答の専門性と視点が定まりやすくなります。',
    '制約条件（字数・禁止事項）は書いた分だけ回答が引き締まります。',
    '入出力例を1〜2個示すと、AIは形式やトーンを真似しやすくなります。',
    '一度で完成を狙わず、出力を見てプロンプトを修正していくのが上達の近道です。',
    '「ステップ1: ... / ステップ2: ...」と検討手順を指定すると、抜け漏れが減ります。',
  ];
  return { praise, improve, lesson: `[モック解説] ${lessons[(len + total) % lessons.length]}` };
}

function mockAIPrompt(topic) {
  const role = topic.category === 'tech' ? '経験豊富なシニアエンジニア' : topic.category === 'business' ? '実務経験豊富なコンサルタント' : topic.category === 'education' ? 'ベテランの教育者' : topic.category === 'creative' ? 'プロのライター' : topic.category === 'academic' ? '学術研究者' : '専門家';
  return `あなたは ${role} です。\n\nお題: ${topic.title}\n${topic.brief}\n\n以下の構造で回答してください:\n1. 概要 (3行以内で要点を提示)\n2. 詳細 (箇条書き 3〜5項目で展開)\n3. 結論・推奨アクション\n\n対象読者: 想定される初学者にも理解できるよう、専門用語は補足してください。\n制約: 推測や憶測は明示し、事実と意見を分けてください。`;
}

function mockImprovePrompt({ prompt, improveAdvice }) {
  return `${prompt}\n\n[モック改善版 — 実APIで利用するとここに改善版が表示されます]\n（教師からの提案: ${improveAdvice}）`;
}

function simpleHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
