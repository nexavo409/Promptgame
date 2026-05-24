// Prompt Architect — Lesson-based prompt engineering tutor.

import { LESSONS, LESSON_BY_ID, FREE_TOPICS, CATEGORY_LABEL, checkPass, passText } from '../data/lessons.js';
import { loadCustomTopics, saveCustomTopic, updateCustomTopic, deleteCustomTopic, getCustomTopic } from '../data/custom-topics.js';
import { PROMPT_CATEGORIES, PROMPT_LIBRARY, getPromptsByCategory } from '../data/prompt-library.js';
import { loadLessonProgress, recordAttempt, resetLesson, unlockedLessons,
         saveDraft, loadDraft, clearDraft } from '../game/progress.js';
import { generateOutput, judgeOutput, explainResult, improvePrompt, generateAIPrompt,
         hasApiKey, setApiKey, getApiKey,
         hasAIBackend, activeBackend,
         getOpenAIURL, setOpenAIURL, getOpenAIBearer, setOpenAIBearer } from '../ai/client.js';
import { lineDiff, renderDiffHtml } from '../game/diff.js';
import { renderMarkdown } from '../util/markdown.js';
import { initTheme, getThemePref, setThemePref, nextTheme, themeLabel } from '../util/theme.js';
import { startHeroTyper } from '../util/hero-typer.js';

const state = {
  screen: 'home',
  currentLesson: null,
  currentTopic: null,
  customMode: false,
  attempt: null,
  vsAttempt: null,
  compare: new Set(),
  draftSource: 'user',
  busy: false,
};

function draftSlot() {
  if (state.screen === 'lesson' && state.currentLesson) return 'lesson.' + state.currentLesson.id;
  if (state.screen === 'free') return 'free';
  return null;
}

function attachMobileKeyboardScroll(ta) {
  if (!ta) return;
  ta.addEventListener('focus', () => setTimeout(() => {
    try { ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
  }, 350));
}

initTheme();
document.addEventListener('DOMContentLoaded', () => {
  bindHeader();
  bindFooter();
  show('home');
  initKeyboardDetection();
  startHeroTyper();
});

function bindFooter() {
  document.querySelectorAll('.app-footer a[data-nav]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      if (['home', 'library', 'about'].includes(a.dataset.nav)) show(a.dataset.nav);
    });
  });
}

function initKeyboardDetection() {
  if (!window.visualViewport) return;
  const check = () => document.documentElement.classList.toggle('kb-open', window.innerHeight - window.visualViewport.height > 120);
  window.visualViewport.addEventListener('resize', check);
  window.visualViewport.addEventListener('scroll', check);
  check();
}

function show(screen) {
  const prev = state.screen;
  state.screen = screen;
  for (const s of ['home', 'lesson', 'free', 'library', 'about']) {
    document.getElementById(`screen-${s}`)?.classList.toggle('hidden', s !== screen);
  }
  if (screen !== 'lesson') document.getElementById('lessonRoot').innerHTML = '';
  if (screen !== 'free') document.getElementById('freeRoot').innerHTML = '';
  if (screen !== 'library') document.getElementById('libraryRoot').innerHTML = '';
  if (screen !== 'about') document.getElementById('aboutRoot').innerHTML = '';
  if (prev !== screen) state.busy = false;
  if (screen === 'home') renderHome();
  if (screen === 'library') renderLibrary();
  if (screen === 'about') renderAbout();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function bindHeader() {
  const keyInput = document.getElementById('apiKeyInput');
  const lmInput = document.getElementById('lmstudioInput');
  const bearerInput = document.getElementById('bearerInput');
  const keyStatus = document.getElementById('apiKeyStatus');
  const popover = document.getElementById('settingsPopover');
  const gearBtn = document.getElementById('settingsBtn');
  keyInput.value = getApiKey();
  lmInput.value = getOpenAIURL();
  if (bearerInput) bearerInput.value = getOpenAIBearer();
  updateKeyStatus();
  gearBtn.addEventListener('click', e => { e.stopPropagation(); popover.classList.toggle('hidden'); });
  document.addEventListener('click', e => {
    if (!popover.classList.contains('hidden') && !popover.contains(e.target) && e.target !== gearBtn) popover.classList.add('hidden');
  });
  popover.addEventListener('click', e => e.stopPropagation());
  document.getElementById('saveKeyBtn').addEventListener('click', () => {
    setApiKey(keyInput.value.trim());
    setOpenAIURL(lmInput.value.trim());
    if (bearerInput) setOpenAIBearer(bearerInput.value.trim());
    updateKeyStatus(); popover.classList.add('hidden');
  });
  document.getElementById('clearKeyBtn').addEventListener('click', () => {
    keyInput.value = ''; lmInput.value = ''; if (bearerInput) bearerInput.value = '';
    setApiKey(''); setOpenAIURL(''); setOpenAIBearer(''); updateKeyStatus();
  });
  document.getElementById('brandHome').addEventListener('click', () => show('home'));
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    const refresh = () => { themeBtn.textContent = themeLabel(getThemePref()); };
    refresh(); themeBtn.addEventListener('click', () => { setThemePref(nextTheme()); refresh(); });
  }
  function updateKeyStatus() {
    const backend = activeBackend();
    if (backend === 'openai-compat') {
      const url = getOpenAIURL();
      keyStatus.textContent = `● ${/openwebui|\/api\/chat\/completions$/i.test(url) ? 'OpenWebUI' : 'OpenAI互換'}`;
      keyStatus.title = url;
    } else if (backend === 'anthropic') keyStatus.textContent = '● Claude';
    else keyStatus.textContent = '○ モック';
    keyStatus.classList.toggle('live', hasAIBackend());
  }
}

function renderHome() {
  document.getElementById('startLessonOneBtn')?.addEventListener('click', () => openLesson('lesson-01'), { once: true });
  document.getElementById('exploreLibraryBtn')?.addEventListener('click', () => show('library'), { once: true });
  const root = document.getElementById('lessonList');
  if (!root) return;
  root.innerHTML = '';
  const unlocked = unlockedLessons(LESSONS);
  for (const lesson of LESSONS) {
    const p = loadLessonProgress(lesson.id);
    const isUnlocked = unlocked.has(lesson.id);
    const row = document.createElement('div');
    row.className = 'lesson-row' + (!isUnlocked ? ' locked' : '') + (p.passed ? ' passed' : '');
    row.innerHTML = `
      <div class="lesson-num">${lesson.number}</div>
      <div class="lesson-meta"><div class="lesson-title">${escape(lesson.title)}</div><div class="lesson-tech muted small">${escape(lesson.technique)}</div><div class="lesson-summary">${escape(lesson.summary)}</div></div>
      <div class="lesson-status"><div class="lesson-status-icon">${!isUnlocked ? '🔒' : p.passed ? '✅' : '▶'}</div><div class="lesson-status-label muted small">${!isUnlocked ? 'ロック中' : p.passed ? '通過済み' : '挑戦できる'}</div></div>
      <div class="lesson-actions"><button class="btn primary" ${!isUnlocked ? 'disabled' : ''}>${p.passed ? 'もう一度' : '挑戦する'}</button></div>`;
    if (isUnlocked) row.querySelector('button').addEventListener('click', () => openLesson(lesson.id));
    root.appendChild(row);
  }
  const free = document.getElementById('freePracticeRow');
  if (free) {
    free.innerHTML = `<div class="lesson-num">🆓</div><div class="lesson-meta"><div class="lesson-title">自由練習</div><div class="lesson-tech muted small">好きなお題で何度でも実験</div><div class="lesson-summary">レッスンを離れて自由にプロンプトを書きたい時に。</div></div><div class="lesson-status"><div class="lesson-status-icon">∞</div></div><div class="lesson-actions"><button class="btn ghost" id="freePracticeBtn">自由練習を開く</button></div>`;
    free.querySelector('#freePracticeBtn').addEventListener('click', openFreePractice);
  }
  renderCustomTopics();
}

function renderCustomTopics() {
  const host = document.getElementById('customTopicsArea');
  if (!host) return;
  host.innerHTML = `<div class="custom-topics-bar"><button class="btn primary" id="newCustomTopicBtn">＋ 新規お題を作る</button></div><div class="custom-empty muted small">自作お題機能は簡易版で動作中です。</div>`;
  host.querySelector('#newCustomTopicBtn').addEventListener('click', () => flash('この簡易版ではホームからの新規作成UIは省略されています'));
}

function openLesson(lessonId) {
  const lesson = LESSON_BY_ID[lessonId];
  if (!lesson) return;
  Object.assign(state, { currentLesson: lesson, currentTopic: lesson.topic, attempt: null, compare: new Set(), draftSource: 'user', customMode: false, vsAttempt: null });
  show('lesson'); renderLesson();
}

function renderLesson() {
  const lesson = state.currentLesson, topic = lesson.topic, p = loadLessonProgress(lesson.id), root = document.getElementById('lessonRoot');
  root.innerHTML = `<div class="screen-toolbar"><button class="btn ghost" id="backToHome">← レッスン一覧</button><span class="muted small">Lesson ${lesson.number} / ${LESSONS.length}</span></div>
  <div class="lesson-pane"><div class="lesson-header"><h1>${escape(lesson.title)}</h1><p class="lesson-tech">📚 学ぶ技法: <b>${escape(lesson.technique)}</b></p></div>
  <details class="lesson-explainer" open><summary>📖 解説</summary><p>${escape(lesson.explainer).replace(/\n/g, '<br>')}</p><p class="hint-line">💡 <b>ヒント:</b> ${escape(lesson.hint || '')}</p>${lesson.examplePrompt ? `<details class="example-prompt"><summary>📝 サンプルを見る</summary><pre>${escape(lesson.examplePrompt)}</pre><button class="btn tiny ghost" id="copyExampleBtn">サンプルを使う</button></details>` : ''}</details>
  <div class="topic-card"><div class="topic-meta"><span class="badge cat">${escape(CATEGORY_LABEL[topic.category] || topic.category)}</span><span class="badge">${topic.difficulty === 'high' ? '難易度: 高' : '難易度: 標準'}</span><span class="badge">通過: ${escape(passText(lesson.passCondition))}</span></div><h2>お題: ${escape(topic.title)}</h2><p>${escape(topic.brief)}</p></div>
  <div class="prompt-editor"><label><b>✍️ あなたのプロンプト</b></label><textarea id="promptInput" rows="10"></textarea><div class="editor-actions"><span class="muted small" id="charCount">0 字</span><button class="btn primary big" id="tryBtn">試す（AIに送信）</button></div></div><div id="resultArea"></div>${p.history.length ? '<details class="history-panel" open><summary>📜 過去の試行</summary><div id="historyList"></div><div id="historyDiff"></div></details>' : ''}</div>`;
  document.getElementById('backToHome').addEventListener('click', () => show('home'));
  const ta = document.getElementById('promptInput');
  ta.value = loadDraft(draftSlot()) || '';
  document.getElementById('charCount').textContent = `${ta.value.length} 字`;
  ta.addEventListener('input', () => { document.getElementById('charCount').textContent = `${ta.value.length} 字`; saveDraft(draftSlot(), ta.value); });
  attachMobileKeyboardScroll(ta);
  document.getElementById('tryBtn').addEventListener('click', onTry);
  document.getElementById('copyExampleBtn')?.addEventListener('click', e => { e.preventDefault(); ta.value = lesson.examplePrompt; state.draftSource = 'sample'; saveDraft(draftSlot(), ta.value); });
  if (state.attempt) renderResult(state.attempt);
  renderHistory(p.history || []);
}

function renderHistory(history) {
  const list = document.getElementById('historyList');
  if (!list) return;
  list.innerHTML = history.map((h, i) => `<div class="history-row"><div class="history-head"><span class="history-num">#${history.length - i}</span><span class="history-score">${((h.judge.accuracy||0)+(h.judge.utility||0)+(h.judge.novelty||0)).toFixed(1)} 点</span><span class="history-axes muted small">正${h.judge.accuracy} / 役${h.judge.utility} / 新${h.judge.novelty}</span>${h.passed ? '<span class="badge passed">通過</span>' : ''}</div><details><summary>プロンプト</summary><pre>${escape(h.prompt)}</pre></details><details><summary>AIの出力</summary><div class="md-body">${renderMarkdown(h.output)}</div></details></div>`).join('');
}

async function onTry() {
  if (state.busy) return;
  const lesson = state.currentLesson, topic = state.currentTopic, ta = document.getElementById('promptInput'), prompt = ta.value.trim();
  if (!prompt || prompt.length < 10) { flash('プロンプトを入力してください'); return; }
  state.busy = true; document.getElementById('tryBtn').disabled = true; renderResolving();
  try {
    const output = await generateOutput(prompt); setResolvingStatus('採点中…');
    const judge = await judgeOutput({ topic, composedPrompt: prompt, output }); setResolvingStatus('教師が解説中…');
    const explanation = await explainResult({ topic, composedPrompt: prompt, output, judge });
    const attempt = { prompt, output, judge, explanation, passed: checkPass(judge, lesson.passCondition), source: state.draftSource };
    state.attempt = attempt; recordAttempt(lesson.id, attempt); clearDraft(draftSlot()); state.draftSource = 'user'; renderLesson();
  } catch (e) { alert('エラー: ' + e.message); renderLesson(); }
  finally { state.busy = false; }
}

function renderResult(attempt) {
  const area = document.getElementById('resultArea');
  const { prompt, output, judge, explanation, passed } = attempt;
  const total = (judge.accuracy || 0) + (judge.utility || 0) + (judge.novelty || 0);
  area.innerHTML = `<div class="result-block ${passed ? 'passed' : 'not-passed'}"><div class="result-banner"><span class="result-icon">📊</span> <b>結果: ${total.toFixed(1)} 点</b></div><div class="result-score"><span>合計 <b>${total.toFixed(1)}</b> / 30</span><span>正しさ ${judge.accuracy}</span><span>役立ち ${judge.utility}</span><span>新しさ ${judge.novelty}</span></div><details class="output-detail" open><summary>🤖 AIの出力</summary><div class="md-body">${renderMarkdown(output)}</div></details><details class="judge-detail"><summary>判定の根拠</summary><p>${escape(judge.rationale || '—')}</p></details><div class="teacher-panel"><div class="teacher-head">📚 教師からのひと言</div><p><b>👍 良かった点:</b> ${escape(explanation.praise)}</p><p><b>🌱 もっと良くするには:</b> ${escape(explanation.improve)}</p><button class="btn improve-btn-big" id="aiImproveBtn">💡 この提案で AI に改善版を書かせる →</button><p class="lesson"><b>💡 今日のレッスン:</b> ${escape(explanation.lesson)}</p></div><div class="result-actions"><button class="btn ghost" id="vsAiBtn">🤖 AI の解答も見る</button><button class="btn ghost" id="backToHomeBtn">← レッスン一覧へ</button></div><div id="vsAiArea"></div></div>`;
  document.getElementById('backToHomeBtn').addEventListener('click', () => show('home'));
  document.getElementById('aiImproveBtn').addEventListener('click', () => onAIImprove(attempt));
  document.getElementById('vsAiBtn').addEventListener('click', () => onVsAI(attempt));
  area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const ta = document.getElementById('promptInput'); if (ta && !ta.value) ta.value = prompt;
}

async function onAIImprove(attempt) {
  if (state.busy) return;
  state.busy = true;
  try {
    const improved = await improvePrompt({ prompt: attempt.prompt, improveAdvice: attempt.explanation?.improve || '', topic: state.currentTopic });
    const ta = document.getElementById('promptInput');
    if (ta) { ta.value = improved; saveDraft(draftSlot(), ta.value); state.draftSource = 'ai-improved'; document.getElementById('charCount').textContent = `${ta.value.length} 字`; flash('改善版をエディタに挿入しました'); }
  } finally { state.busy = false; }
}

async function onVsAI(userAttempt) {
  if (state.busy) return;
  state.busy = true;
  const host = document.getElementById('vsAiArea');
  if (host) host.innerHTML = '<div class="vs-loading">🤖 AIが同じお題に挑戦中…</div>';
  try {
    const aiPrompt = await generateAIPrompt(state.currentTopic);
    const aiOutput = await generateOutput(aiPrompt);
    const aiJudge = await judgeOutput({ topic: state.currentTopic, composedPrompt: aiPrompt, output: aiOutput });
    const aiTotal = (aiJudge.accuracy || 0) + (aiJudge.utility || 0) + (aiJudge.novelty || 0);
    if (host) host.innerHTML = `<div class="vs-panel"><h4>🥊 AI vs あなた</h4><div class="vs-stat ai"><div class="vs-total">AI: ${aiTotal.toFixed(1)}</div><div class="vs-axes muted small">正${aiJudge.accuracy} / 役${aiJudge.utility} / 新${aiJudge.novelty}</div></div><details open><summary>🤖 AI が書いたプロンプト</summary><pre>${escape(aiPrompt)}</pre></details></div>`;
  } finally { state.busy = false; }
}

function openFreePractice() { state.currentTopic = randomFreeTopic(); state.currentLesson = null; state.attempt = null; show('free'); renderFree(); }
function randomFreeTopic() { return FREE_TOPICS[Math.floor(Math.random() * FREE_TOPICS.length)]; }
function freeSlotId() { return state.currentTopic ? `free.${state.currentTopic.id}` : null; }
function renderFree() {
  const topic = state.currentTopic, root = document.getElementById('freeRoot');
  root.innerHTML = `<div class="screen-toolbar"><button class="btn ghost" id="backToHomeFromFree">← レッスン一覧</button><span class="muted small">🆓 自由練習モード</span><button class="btn tiny ghost" id="reshuffleBtn" style="margin-left:auto">🔄 別のお題</button></div><div class="lesson-pane"><div class="topic-card"><div class="topic-meta"><span class="badge cat">${escape(CATEGORY_LABEL[topic.category] || topic.category)}</span></div><h2>お題: ${escape(topic.title)}</h2><p>${escape(topic.brief)}</p></div><div class="prompt-editor"><label><b>✍️ あなたのプロンプト</b></label><textarea id="promptInput" rows="10"></textarea><div class="editor-actions"><span class="muted small" id="charCount">0 字</span><button class="btn primary big" id="tryBtn">試す（AIに送信）</button></div></div><div id="resultArea"></div></div>`;
  document.getElementById('backToHomeFromFree').addEventListener('click', () => show('home'));
  document.getElementById('reshuffleBtn').addEventListener('click', openFreePractice);
  const ta = document.getElementById('promptInput'); ta.addEventListener('input', () => document.getElementById('charCount').textContent = `${ta.value.length} 字`);
  document.getElementById('tryBtn').addEventListener('click', onTryFree);
}
async function onTryFree() {
  if (state.busy) return;
  const prompt = document.getElementById('promptInput').value.trim(), topic = state.currentTopic;
  if (!prompt || prompt.length < 10) { flash('プロンプトを入力してください'); return; }
  state.busy = true; renderResolving();
  try {
    const output = await generateOutput(prompt); setResolvingStatus('採点中…');
    const judge = await judgeOutput({ topic, composedPrompt: prompt, output }); setResolvingStatus('教師が解説中…');
    const explanation = await explainResult({ topic, composedPrompt: prompt, output, judge });
    state.attempt = { prompt, output, judge, explanation, passed: false, source: state.draftSource };
    renderFree(); renderResult(state.attempt);
  } finally { state.busy = false; }
}

function renderLibrary() { document.getElementById('libraryRoot').innerHTML = '<div class="screen-toolbar"><button class="btn ghost" id="libraryBack">← ホームに戻る</button></div><div class="library-pane"><h1>📚 プロンプトライブラリ</h1><p class="muted">簡易表示中です。</p></div>'; document.getElementById('libraryBack').addEventListener('click', () => show('home')); }
function renderAbout() { document.getElementById('aboutRoot').innerHTML = '<div class="screen-toolbar"><button class="btn ghost" id="aboutBack">← ホームに戻る</button></div><div class="about-pane"><h1>📖 このアプリについて</h1><p>プロンプトエンジニアリング学習ツールです。</p></div>'; document.getElementById('aboutBack').addEventListener('click', () => show('home')); }
function renderResolving() { const target = document.getElementById('resultArea'); if (target) target.innerHTML = '<div class="headspace"><h3 id="resolvingStatus" class="headspace-title">AI があなたのプロンプトを実行中</h3><p class="muted small">処理中…</p></div>'; }
function setResolvingStatus(t) { const el = document.getElementById('resolvingStatus'); if (el) el.textContent = t; }
function escape(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function flash(msg) { const el = document.getElementById('toast'); if (!el) alert(msg); else { el.textContent = msg; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1600); } }
