// Prompt Architect — Lesson-based prompt engineering tutor.

import { LESSONS, LESSON_BY_ID, FREE_TOPICS, CATEGORY_LABEL, checkPass, passText } from '../data/lessons.js';
import { loadCustomTopics, saveCustomTopic, updateCustomTopic, deleteCustomTopic, getCustomTopic } from '../data/custom-topics.js';
import { loadLessonProgress, recordAttempt, resetLesson, unlockedLessons,
         saveDraft, loadDraft, clearDraft } from '../game/progress.js';
import { generateOutput, judgeOutput, explainResult, improvePrompt, generateAIPrompt,
         hasApiKey, setApiKey, getApiKey,
         hasAIBackend, activeBackend,
         getOpenAIURL, setOpenAIURL, getOpenAIBearer, setOpenAIBearer } from '../ai/client.js';
import { lineDiff, renderDiffHtml } from '../game/diff.js';
import { renderMarkdown } from '../util/markdown.js';

const state = {
  screen: 'home',         // home | lesson | free
  currentLesson: null,
  currentTopic: null,     // for free / custom mode
  customMode: false,      // true when the current topic is a user-defined one
  attempt: null,          // { prompt, output, judge, explanation, passed } | null
  vsAttempt: null,        // AI's competing attempt (for "AI vs You" mode)
  compare: new Set(),     // history indices selected for diff compare
  draftSource: 'user',    // 'user' | 'ai-improved' | 'sample' — origin tag for the current draft
  busy: false,
};

function draftSlot() {
  if (state.screen === 'lesson' && state.currentLesson) return 'lesson.' + state.currentLesson.id;
  if (state.screen === 'free') return 'free';
  return null;
}

// On iOS, when the textarea is focused the on-screen keyboard covers half the
// viewport. Auto-scroll the textarea above the keyboard so the user can see
// what they're typing.
function attachMobileKeyboardScroll(ta) {
  if (!ta) return;
  ta.addEventListener('focus', () => {
    setTimeout(() => {
      try { ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    }, 350); // wait for keyboard slide-in animation
  });
  if (window.visualViewport) {
    const onResize = () => {
      if (document.activeElement === ta) {
        try { ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
      }
    };
    window.visualViewport.addEventListener('resize', onResize);
    // Clean up the listener once the textarea is gone from the DOM
    const observer = new MutationObserver(() => {
      if (!document.body.contains(ta)) {
        window.visualViewport.removeEventListener('resize', onResize);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

// ============== Boot ==============
document.addEventListener('DOMContentLoaded', () => {
  bindHeader();
  bindHome();
  show('home');
  initKeyboardDetection();
});

/**
 * Detect iOS / Android on-screen keyboard via visualViewport.
 * When it's open, toggle html.kb-open so CSS can hide the sticky 試す
 * button (which otherwise covers the line being typed).
 */
function initKeyboardDetection() {
  if (!window.visualViewport) return;
  const check = () => {
    const diff = window.innerHeight - window.visualViewport.height;
    const kbOpen = diff > 120; // keyboard occupies > ~120px of viewport
    document.documentElement.classList.toggle('kb-open', kbOpen);
  };
  window.visualViewport.addEventListener('resize', check);
  window.visualViewport.addEventListener('scroll', check);
  check();

  // iOS Safari sometimes ignores CSS touch-action on text-heavy elements
  // (summary, list rows). Belt-and-suspenders: cancel the default action
  // of the SECOND tap if it lands within 320 ms of the first. This kills
  // double-tap zoom without harming single taps or pinch zoom.
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouch <= 320) {
      // But don't block typing into form fields
      const tag = (e.target && e.target.tagName) || '';
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
      }
    }
    lastTouch = now;
  }, { passive: false });
}

function show(screen) {
  const prev = state.screen;
  state.screen = screen;
  for (const s of ['home', 'lesson', 'free']) {
    document.getElementById(`screen-${s}`).classList.toggle('hidden', s !== screen);
  }
  // Clear non-active screen roots so duplicate IDs (e.g. #promptInput) never coexist.
  if (screen !== 'lesson') {
    const r = document.getElementById('lessonRoot');
    if (r) r.innerHTML = '';
  }
  if (screen !== 'free') {
    const r = document.getElementById('freeRoot');
    if (r) r.innerHTML = '';
  }
  // Defensive: if user navigates while a request was hung, free the lock.
  if (prev !== screen) state.busy = false;
  if (screen === 'home') renderHome();
}

// ============== Header / settings ==============
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

  gearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popover.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!popover.classList.contains('hidden') && !popover.contains(e.target) && e.target !== gearBtn) {
      popover.classList.add('hidden');
    }
  });
  popover.addEventListener('click', e => e.stopPropagation());

  document.getElementById('saveKeyBtn').addEventListener('click', () => {
    setApiKey(keyInput.value.trim());
    setOpenAIURL(lmInput.value.trim());
    if (bearerInput) setOpenAIBearer(bearerInput.value.trim());
    updateKeyStatus();
    popover.classList.add('hidden');
  });
  document.getElementById('clearKeyBtn').addEventListener('click', () => {
    keyInput.value = '';
    lmInput.value = '';
    if (bearerInput) bearerInput.value = '';
    setApiKey('');
    setOpenAIURL('');
    setOpenAIBearer('');
    updateKeyStatus();
  });
  document.getElementById('brandHome').addEventListener('click', () => show('home'));

  function updateKeyStatus() {
    const backend = activeBackend();
    if (backend === 'openai-compat') {
      const url = getOpenAIURL();
      const host = url.replace(/^https?:\/\//, '').split('/')[0];
      const looksLikeOpenWebUI = /openwebui|\/api\/chat\/completions$/i.test(url);
      const label = looksLikeOpenWebUI ? 'OpenWebUI' : 'OpenAI互換';
      keyStatus.textContent = `● ${label}`;
      keyStatus.title = `${label} (${url})${getOpenAIBearer() ? ' • Bearer設定済' : ''}`;
    } else if (backend === 'anthropic') {
      keyStatus.textContent = '● Claude';
      keyStatus.title = 'Anthropic Claude API';
    } else {
      keyStatus.textContent = '○ モック';
      keyStatus.title = 'API未設定。決定論的モック採点で動作。';
    }
    keyStatus.classList.toggle('live', hasAIBackend());
  }
}

// ============== Home (lesson list) ==============
function bindHome() {
  // Initial render happens via show('home') -> renderHome()
}

function renderHome() {
  const root = document.getElementById('lessonList');
  if (!root) return;
  root.innerHTML = '';

  const unlocked = unlockedLessons(LESSONS);

  for (const lesson of LESSONS) {
    const p = loadLessonProgress(lesson.id);
    const isUnlocked = unlocked.has(lesson.id);
    const row = document.createElement('div');
    row.className = 'lesson-row';
    if (!isUnlocked) row.classList.add('locked');
    if (p.passed) row.classList.add('passed');

    const statusIcon = !isUnlocked ? '🔒' : p.passed ? '✅' : '▶';
    const statusLabel = !isUnlocked ? 'ロック中' :
                        p.passed ? `通過 (ベスト ${p.bestScore?.total?.toFixed(1) ?? '?'} 点)` :
                        '挑戦できる';

    row.innerHTML = `
      <div class="lesson-num">${lesson.number}</div>
      <div class="lesson-meta">
        <div class="lesson-title">${escape(lesson.title)}</div>
        <div class="lesson-tech muted small">${escape(lesson.technique)}</div>
        <div class="lesson-summary">${escape(lesson.summary)}</div>
      </div>
      <div class="lesson-status">
        <div class="lesson-status-icon">${statusIcon}</div>
        <div class="lesson-status-label muted small">${escape(statusLabel)}</div>
      </div>
      <div class="lesson-actions">
        <button class="btn primary" ${!isUnlocked ? 'disabled' : ''}>${p.passed ? 'もう一度' : '挑戦する'}</button>
      </div>
    `;
    if (isUnlocked) {
      row.querySelector('button').addEventListener('click', () => openLesson(lesson.id));
    }
    root.appendChild(row);
  }

  // Free practice
  const free = document.getElementById('freePracticeRow');
  if (free) {
    free.innerHTML = `
      <div class="lesson-num">🆓</div>
      <div class="lesson-meta">
        <div class="lesson-title">自由練習</div>
        <div class="lesson-tech muted small">好きなお題で何度でも実験</div>
        <div class="lesson-summary">レッスンを離れて自由にプロンプトを書きたい時に。お題はランダムから選びます。</div>
      </div>
      <div class="lesson-status"><div class="lesson-status-icon">∞</div></div>
      <div class="lesson-actions">
        <button class="btn ghost" id="freePracticeBtn">自由練習を開く</button>
      </div>
    `;
    free.querySelector('#freePracticeBtn').addEventListener('click', openFreePractice);
  }

  renderCustomTopics();
}

// ============== Custom topics (My Topics) ==============
function renderCustomTopics() {
  const host = document.getElementById('customTopicsArea');
  if (!host) return;
  const list = loadCustomTopics();

  let html = `
    <div class="custom-topics-bar">
      <button class="btn primary" id="newCustomTopicBtn">＋ 新規お題を作る</button>
    </div>
  `;

  if (list.length === 0) {
    html += `<div class="custom-empty muted small">まだ自作お題はありません。「＋ 新規お題を作る」から追加してみよう。</div>`;
  } else {
    html += '<div class="custom-list">';
    for (const t of list) {
      html += `
        <div class="lesson-row custom" data-id="${escape(t.id)}">
          <div class="lesson-num">🛠️</div>
          <div class="lesson-meta">
            <div class="lesson-title">${escape(t.title || '(無題)')}</div>
            <div class="lesson-tech muted small">
              <span class="badge cat">${escape(CATEGORY_LABEL[t.category] || t.category)}</span>
              <span class="badge">${t.difficulty === 'high' ? '難易度: 高' : '難易度: 標準'}</span>
            </div>
            <div class="lesson-summary">${escape((t.brief || '').slice(0, 120))}${(t.brief || '').length > 120 ? '…' : ''}</div>
          </div>
          <div class="lesson-status"><div class="lesson-status-icon">▶</div></div>
          <div class="lesson-actions custom-actions">
            <button class="btn primary" data-act="practice">練習する</button>
            <button class="btn ghost tiny" data-act="edit">編集</button>
            <button class="btn ghost tiny" data-act="delete" title="削除">🗑️</button>
          </div>
        </div>
      `;
    }
    html += '</div>';
  }
  host.innerHTML = html;

  host.querySelector('#newCustomTopicBtn').addEventListener('click', () => openCustomTopicEditor(null));
  host.querySelectorAll('.lesson-row.custom').forEach(row => {
    const id = row.dataset.id;
    row.querySelector('[data-act=practice]').addEventListener('click', () => openCustomTopicPractice(id));
    row.querySelector('[data-act=edit]').addEventListener('click', () => openCustomTopicEditor(id));
    row.querySelector('[data-act=delete]').addEventListener('click', () => {
      const t = getCustomTopic(id);
      if (!t) return;
      if (confirm(`お題「${t.title}」を削除しますか？\n（過去の試行履歴も同時に削除されます）`)) {
        deleteCustomTopic(id);
        // Also clean up its practice history slot
        try { Object.keys(localStorage).filter(k => k.startsWith('pa.progress.custom.' + id)).forEach(k => localStorage.removeItem(k)); } catch {}
        renderCustomTopics();
      }
    });
  });
}

function openCustomTopicEditor(editingId) {
  const existing = editingId ? getCustomTopic(editingId) : null;
  const isEdit = !!existing;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal custom-editor">
      <h3>${isEdit ? '✏️ お題を編集' : '＋ 新しいお題を作る'}</h3>
      <p class="muted small">自分の実務課題や、興味のあるテーマでプロンプトを練習できます。</p>

      <label class="form-label">お題タイトル <span class="muted small">(必須・1〜100文字)</span></label>
      <input type="text" id="ctTitle" placeholder="例: 新人向け Git/GitHub 入門資料" maxlength="200" value="${escape(existing?.title || '')}" />

      <label class="form-label">詳細・課題内容 <span class="muted small">(AIに伝える具体的な内容)</span></label>
      <textarea id="ctBrief" rows="5" placeholder="例: 新入社員 5 名向けに、Git の基本操作（clone / add / commit / push / pull）を 30分で理解できる資料を作りたい。図解と例を含めること。" maxlength="2000">${escape(existing?.brief || '')}</textarea>

      <div class="form-row">
        <div>
          <label class="form-label">カテゴリ</label>
          <select id="ctCategory">
            <option value="business" ${existing?.category === 'business' ? 'selected' : ''}>ビジネス</option>
            <option value="tech" ${existing?.category === 'tech' ? 'selected' : ''}>技術</option>
            <option value="creative" ${existing?.category === 'creative' ? 'selected' : ''}>創作</option>
            <option value="education" ${existing?.category === 'education' || (!existing && true) ? 'selected' : ''}>教育</option>
            <option value="academic" ${existing?.category === 'academic' ? 'selected' : ''}>学術</option>
            <option value="neutral" ${existing?.category === 'neutral' ? 'selected' : ''}>汎用</option>
          </select>
        </div>
        <div>
          <label class="form-label">難易度</label>
          <select id="ctDifficulty">
            <option value="standard" ${existing?.difficulty !== 'high' ? 'selected' : ''}>標準</option>
            <option value="high" ${existing?.difficulty === 'high' ? 'selected' : ''}>高</option>
          </select>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn ghost" id="ctCancelBtn">キャンセル</button>
        <button class="btn primary" id="ctSaveBtn">${isEdit ? '保存' : '作成'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#ctCancelBtn').addEventListener('click', () => document.body.removeChild(overlay));
  overlay.querySelector('#ctSaveBtn').addEventListener('click', () => {
    const title = overlay.querySelector('#ctTitle').value.trim();
    const brief = overlay.querySelector('#ctBrief').value.trim();
    const category = overlay.querySelector('#ctCategory').value;
    const difficulty = overlay.querySelector('#ctDifficulty').value;
    if (!title) { flash('タイトルを入力してください'); return; }
    if (!brief) { flash('課題内容を入力してください'); return; }
    if (isEdit) {
      updateCustomTopic(editingId, { title, brief, category, difficulty });
    } else {
      saveCustomTopic({ title, brief, category, difficulty });
    }
    document.body.removeChild(overlay);
    renderCustomTopics();
  });
}

function openCustomTopicPractice(id) {
  const t = getCustomTopic(id);
  if (!t) return;
  state.currentLesson = null;
  state.currentTopic = t;
  state.attempt = null;
  state.compare = new Set();
  state.draftSource = 'user';
  state.customMode = true;
  show('free');
  renderFree();
}

// ============== Lesson screen ==============
function openLesson(lessonId) {
  const lesson = LESSON_BY_ID[lessonId];
  if (!lesson) return;
  state.currentLesson = lesson;
  state.currentTopic = lesson.topic;
  state.attempt = null;
  state.compare = new Set();
  state.draftSource = 'user';
  state.customMode = false;
  state.vsAttempt = null;
  show('lesson');
  renderLesson();
}

function renderLesson() {
  const lesson = state.currentLesson;
  if (!lesson) return;
  const root = document.getElementById('lessonRoot');
  const p = loadLessonProgress(lesson.id);
  const topic = lesson.topic;

  root.innerHTML = `
    <div class="screen-toolbar">
      <button class="btn ghost" id="backToHome">← レッスン一覧</button>
      <span class="muted small">Lesson ${lesson.number} / ${LESSONS.length}</span>
    </div>

    <div class="lesson-pane">
      <div class="lesson-header">
        <h1>${escape(lesson.title)}</h1>
        <p class="lesson-tech">📚 学ぶ技法: <b>${escape(lesson.technique)}</b></p>
      </div>

      <details class="lesson-explainer" open>
        <summary>📖 解説（クリックで折りたたみ）</summary>
        <p>${escape(lesson.explainer).replace(/\n/g, '<br>')}</p>
        ${lesson.hint ? `<p class="hint-line">💡 <b>ヒント:</b> ${escape(lesson.hint)}</p>` : ''}
        ${lesson.examplePrompt ? `
          <details class="example-prompt">
            <summary>📝 詰まったらサンプルを見る</summary>
            <p class="muted small">まずは自分で書いてみるのがおすすめ。それでも詰まったら参考に。</p>
            <pre>${escape(lesson.examplePrompt)}</pre>
            <button class="btn tiny ghost" id="copyExampleBtn">詰まったらサンプルを使う</button>
          </details>
        ` : ''}
      </details>

      <div class="topic-card">
        <div class="topic-meta">
          <span class="badge cat">${escape(CATEGORY_LABEL[topic.category] || topic.category)}</span>
          <span class="badge">${topic.difficulty === 'high' ? '難易度: 高' : '難易度: 標準'}</span>
          <span class="badge">通過: ${escape(passText(lesson.passCondition))}</span>
          ${p.passed ? `<span class="badge passed">✅ 通過済み (${p.bestScore.total.toFixed(1)})</span>` : ''}
        </div>
        <h2>お題: ${escape(topic.title)}</h2>
        <p>${escape(topic.brief)}</p>
      </div>

      <div class="prompt-editor">
        <label for="promptInput"><b>✍️ あなたのプロンプト</b></label>
        <textarea id="promptInput" rows="10" placeholder="ここに自由にプロンプトを書いて、AIに送信します..."></textarea>
        <div class="editor-actions">
          <span class="muted small" id="charCount">0 字</span>
          <button class="btn primary big" id="tryBtn">試す（AIに送信）</button>
        </div>
      </div>

      <div id="resultArea"></div>

      ${p.history.length > 0 ? `
        <details class="history-panel" open>
          <summary>📜 このレッスンの過去の試行 (${p.history.length}件)</summary>
          <div id="historyList"></div>
          <div id="historyDiff"></div>
        </details>
      ` : ''}
    </div>
  `;

  document.getElementById('backToHome').addEventListener('click', () => show('home'));
  const ta = document.getElementById('promptInput');
  // Restore draft if any
  const draft = loadDraft(draftSlot());
  if (draft) ta.value = draft;
  document.getElementById('charCount').textContent = `${ta.value.length} 字`;
  ta.addEventListener('input', () => {
    document.getElementById('charCount').textContent = `${ta.value.length} 字`;
    saveDraft(draftSlot(), ta.value);
  });
  attachMobileKeyboardScroll(ta);
  document.getElementById('tryBtn').addEventListener('click', onTry);
  const copyBtn = document.getElementById('copyExampleBtn');
  if (copyBtn) copyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    ta.value = lesson.examplePrompt;
    document.getElementById('charCount').textContent = `${ta.value.length} 字`;
    saveDraft(draftSlot(), ta.value);
    state.draftSource = 'sample';
    ta.focus();
  });

  if (state.attempt) renderResult(state.attempt);
  renderHistory(p.history);
}

function renderHistory(history) {
  const list = document.getElementById('historyList');
  if (!list) return;
  list.innerHTML = '';

  // Compare control bar
  const bar = document.createElement('div');
  bar.className = 'history-compare-bar';
  const selCount = state.compare.size;
  bar.innerHTML = `
    <span class="muted small">2つの試行にチェック → 比較すると差分が見えます (${selCount}/2 選択中)</span>
    <button class="btn tiny primary" id="compareBtn" ${selCount === 2 ? '' : 'disabled'}>選んだ2つを比較</button>
    ${selCount > 0 ? '<button class="btn tiny ghost" id="clearCompareBtn">選択解除</button>' : ''}
  `;
  list.appendChild(bar);

  bar.querySelector('#compareBtn')?.addEventListener('click', () => renderDiff(history));
  bar.querySelector('#clearCompareBtn')?.addEventListener('click', () => {
    state.compare.clear();
    document.getElementById('historyDiff').innerHTML = '';
    renderHistory(history);
  });

  history.forEach((h, i) => {
    const total = (h.judge.accuracy || 0) + (h.judge.utility || 0) + (h.judge.novelty || 0);
    const row = document.createElement('div');
    row.className = 'history-row';
    const checked = state.compare.has(i) ? 'checked' : '';
    const disabled = !state.compare.has(i) && state.compare.size >= 2 ? 'disabled' : '';
    const sourceBadge = h.source === 'ai-improved'
      ? '<span class="badge source-ai" title="教師の提案でAIに書き直してもらった版">💡 AI改善版</span>'
      : h.source === 'sample'
      ? '<span class="badge source-sample" title="サンプルプロンプトをそのまま使った版">📝 サンプル使用</span>'
      : '';
    row.innerHTML = `
      <div class="history-head">
        <label class="compare-check" title="比較対象に含める">
          <input type="checkbox" class="history-check" data-idx="${i}" ${checked} ${disabled} />
        </label>
        <span class="history-num">#${history.length - i}</span>
        <span class="history-score">${total.toFixed(1)} 点</span>
        <span class="history-axes muted small">正${h.judge.accuracy} / 役${h.judge.utility} / 新${h.judge.novelty}</span>
        ${sourceBadge}
        ${h.passed ? '<span class="badge passed">通過</span>' : ''}
        <span class="history-time muted small">${formatTime(h.ts)}</span>
      </div>
      <details>
        <summary>プロンプト</summary>
        <pre>${escape(h.prompt)}</pre>
      </details>
      <details>
        <summary>AIの出力</summary>
        <div class="md-body">${renderMarkdown(h.output)}</div>
      </details>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll('.history-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = parseInt(cb.dataset.idx, 10);
      if (cb.checked) {
        if (state.compare.size >= 2) { cb.checked = false; return; }
        state.compare.add(idx);
      } else {
        state.compare.delete(idx);
      }
      renderHistory(history);
    });
  });
}

function renderDiff(history) {
  const idxs = [...state.compare].sort((a, b) => b - a); // older first (newer has smaller idx)
  if (idxs.length !== 2) return;
  const older = history[idxs[0]];
  const newer = history[idxs[1]];
  const totalOld = (older.judge.accuracy || 0) + (older.judge.utility || 0) + (older.judge.novelty || 0);
  const totalNew = (newer.judge.accuracy || 0) + (newer.judge.utility || 0) + (newer.judge.novelty || 0);
  const delta = totalNew - totalOld;
  const deltaStr = (delta > 0 ? '+' : '') + delta.toFixed(1);

  const ops = lineDiff(older.prompt, newer.prompt);
  const diffHtml = renderDiffHtml(ops, escape);

  const host = document.getElementById('historyDiff');
  if (!host) return;
  host.innerHTML = `
    <div class="diff-panel">
      <div class="diff-head">
        <b>📊 試行 #${history.length - idxs[0]} → #${history.length - idxs[1]}</b>
        <span class="muted small">${totalOld.toFixed(1)} 点 → ${totalNew.toFixed(1)} 点 (<b class="${delta >= 0 ? 'delta-up' : 'delta-down'}">${deltaStr} 点</b>)</span>
        <button class="btn tiny ghost" id="closeDiffBtn">× 閉じる</button>
      </div>
      <p class="muted small">緑 = 新しいバージョンで追加された行 / 赤 = 古いバージョンにあって消えた行 / 白 = 共通</p>
      <div class="diff-body">${diffHtml}</div>
    </div>
  `;
  host.querySelector('#closeDiffBtn')?.addEventListener('click', () => {
    host.innerHTML = '';
  });
  host.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function onTry() {
  if (state.busy) return;
  const lesson = state.currentLesson;
  if (!lesson) return;
  const topic = state.currentTopic;
  const ta = document.getElementById('promptInput');
  const prompt = ta.value.trim();
  if (!prompt) { flash('プロンプトを入力してください'); return; }
  if (prompt.length < 10) { flash('もう少し長く書いてみよう'); return; }

  state.busy = true;
  const tryBtn = document.getElementById('tryBtn');
  tryBtn.disabled = true;
  renderResolving();

  try {
    const output = await generateOutput(prompt);
    setResolvingStatus('採点中…');
    const judge = await judgeOutput({ topic, composedPrompt: prompt, output });
    setResolvingStatus('教師が解説中…');
    const explanation = await explainResult({ topic, composedPrompt: prompt, output, judge });

    const passed = checkPass(judge, lesson.passCondition);
    const source = state.draftSource;
    const attempt = { prompt, output, judge, explanation, passed, source };
    state.attempt = attempt;
    state.vsAttempt = null;
    recordAttempt(lesson.id, attempt);
    clearDraft(draftSlot());
    state.draftSource = 'user';

    // Re-render the lesson (so history updates), then surface the result
    renderLesson();
  } catch (e) {
    console.error(e);
    alert('エラー: ' + e.message);
    renderLesson();
  } finally {
    state.busy = false;
  }
}

function renderResult(attempt) {
  const area = document.getElementById('resultArea');
  if (!area) return;
  const { prompt, output, judge, explanation, passed } = attempt;
  const total = (judge.accuracy || 0) + (judge.utility || 0) + (judge.novelty || 0);
  const isFree = state.screen === 'free';

  area.innerHTML = `
    <div class="result-block ${passed ? 'passed' : isFree ? 'free' : 'not-passed'}">
      <div class="result-banner">
        ${passed
          ? `<span class="result-icon">🎉</span> <b>通過しました！</b>`
          : isFree
            ? `<span class="result-icon">📊</span> <b>結果: ${total.toFixed(1)} 点</b>`
            : `<span class="result-icon">📊</span> <b>結果: ${total.toFixed(1)} 点（通過まであと一息）</b>`}
      </div>
      <div class="result-score">
        <span>合計 <b>${total.toFixed(1)}</b> / 30</span>
        <span title="お題に対する内容の的確さ">正しさ ${judge.accuracy}</span>
        <span title="実務での活用しやすさ">役立ち ${judge.utility}</span>
        <span title="他と差別化できる独自性">新しさ ${judge.novelty}</span>
      </div>
      <details class="output-detail" open>
        <summary>🤖 AIの出力</summary>
        <div class="md-body">${renderMarkdown(output)}</div>
      </details>
      <details class="judge-detail">
        <summary>判定の根拠</summary>
        <p>${escape(judge.rationale || '—')}</p>
      </details>
      <div class="teacher-panel">
        <div class="teacher-head">📚 教師からのひと言</div>
        <p><b>👍 良かった点:</b> ${escape(explanation.praise)}</p>
        <p class="improve-line">
          <b>🌱 もっと良くするには:</b> ${escape(explanation.improve)}
          <button class="btn tiny ghost improve-btn" id="aiImproveBtn"
                  title="教師の提案を反映した改善版プロンプトをAIに作らせて、エディタに挿入します">
            💡 AIに改善版を書かせる
          </button>
        </p>
        <p class="lesson"><b>💡 今日のレッスン:</b> ${escape(explanation.lesson)}</p>
      </div>
      <div class="result-actions">
        <button class="btn ghost" id="vsAiBtn" title="同じお題でAIにもプロンプトを書かせて比較します">
          🤖 AI の解答も見る
        </button>
        ${passed && state.currentLesson && nextLesson(state.currentLesson.id)
          ? `<button class="btn primary" id="nextLessonBtn">次のレッスンへ →</button>`
          : ''}
        <button class="btn ghost" id="backToHomeBtn">← レッスン一覧へ</button>
      </div>
      <div id="vsAiArea"></div>
    </div>
  `;
  document.getElementById('backToHomeBtn')?.addEventListener('click', () => show('home'));
  document.getElementById('nextLessonBtn')?.addEventListener('click', () => {
    const nxt = nextLesson(state.currentLesson.id);
    if (nxt) openLesson(nxt.id);
  });
  document.getElementById('aiImproveBtn')?.addEventListener('click', () => onAIImprove(attempt));
  document.getElementById('vsAiBtn')?.addEventListener('click', () => onVsAI(attempt));

  // If we already have AI's competing attempt for this round, surface it again
  if (state.vsAttempt) renderVsAI(state.vsAttempt, attempt);

  area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Set the prompt back into textarea so user sees what they sent
  const ta = document.getElementById('promptInput');
  if (ta && !ta.value) ta.value = prompt;
}

async function onVsAI(userAttempt) {
  if (state.busy) return;
  const topic = state.currentTopic;
  if (!topic || !userAttempt) return;

  state.busy = true;
  const btn = document.getElementById('vsAiBtn');
  if (btn) { btn.disabled = true; btn.textContent = '🤖 AI も書いてます…'; }
  const host = document.getElementById('vsAiArea');
  if (host) host.innerHTML = `<div class="vs-loading">🤖 AIが同じお題に挑戦中…</div>`;

  try {
    const aiPrompt = await generateAIPrompt(topic);
    const aiOutput = await generateOutput(aiPrompt);
    const aiJudge = await judgeOutput({ topic, composedPrompt: aiPrompt, output: aiOutput });
    const vsAttempt = { prompt: aiPrompt, output: aiOutput, judge: aiJudge };
    state.vsAttempt = vsAttempt;
    renderVsAI(vsAttempt, userAttempt);
  } catch (e) {
    if (host) host.innerHTML = `<div class="vs-loading" style="color:#dc2626">エラー: ${escape(e.message)}</div>`;
  } finally {
    state.busy = false;
    if (btn) { btn.disabled = false; btn.textContent = '🤖 AI の解答も見る'; }
  }
}

function renderVsAI(vsAttempt, userAttempt) {
  const host = document.getElementById('vsAiArea');
  if (!host) return;
  const userTotal = (userAttempt.judge.accuracy || 0) + (userAttempt.judge.utility || 0) + (userAttempt.judge.novelty || 0);
  const aiTotal = (vsAttempt.judge.accuracy || 0) + (vsAttempt.judge.utility || 0) + (vsAttempt.judge.novelty || 0);
  const delta = userTotal - aiTotal;
  const verdict = delta > 0.5 ? '🏆 あなたの勝ち' : delta < -0.5 ? '🤖 AI の勝ち' : '🤝 ほぼ互角';

  host.innerHTML = `
    <div class="vs-panel">
      <div class="vs-head">
        <h4>🥊 AI vs あなた</h4>
        <div class="vs-verdict">${verdict}</div>
      </div>
      <div class="vs-summary">
        <div class="vs-stat you">
          <div class="vs-label">あなた</div>
          <div class="vs-total">${userTotal.toFixed(1)}</div>
          <div class="vs-axes muted small">正${userAttempt.judge.accuracy} / 役${userAttempt.judge.utility} / 新${userAttempt.judge.novelty}</div>
        </div>
        <div class="vs-vs">vs</div>
        <div class="vs-stat ai">
          <div class="vs-label">🤖 AI</div>
          <div class="vs-total">${aiTotal.toFixed(1)}</div>
          <div class="vs-axes muted small">正${vsAttempt.judge.accuracy} / 役${vsAttempt.judge.utility} / 新${vsAttempt.judge.novelty}</div>
        </div>
      </div>

      <details class="vs-detail" open>
        <summary>🤖 AI が書いたプロンプト（お手本として参考に）</summary>
        <pre>${escape(vsAttempt.prompt)}</pre>
      </details>
      <details class="vs-detail">
        <summary>🤖 AI の出力</summary>
        <div class="md-body">${renderMarkdown(vsAttempt.output)}</div>
      </details>
      <details class="vs-detail">
        <summary>判定の根拠</summary>
        <p class="muted small">${escape(vsAttempt.judge.rationale || '—')}</p>
      </details>
      <p class="vs-tip muted small">
        💡 AI のプロンプトの工夫を観察して、次の試行に取り入れてみよう。
        「AI vs You」は対戦ではなく、上手な書き手のお手本を見るための機能です。
      </p>
    </div>
  `;
  host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function onAIImprove(attempt) {
  if (state.busy) return;
  const topic = state.currentTopic;
  if (!topic || !attempt) return;
  state.busy = true;
  const btn = document.getElementById('aiImproveBtn');
  if (btn) { btn.disabled = true; btn.textContent = '✏️ 改善版を生成中…'; }
  try {
    const improved = await improvePrompt({
      prompt: attempt.prompt,
      improveAdvice: attempt.explanation?.improve || '',
      topic,
    });
    const ta = document.getElementById('promptInput');
    if (ta) {
      ta.value = improved;
      ta.focus();
      saveDraft(draftSlot(), ta.value);
      state.draftSource = 'ai-improved';
      const cc = document.getElementById('charCount');
      if (cc) cc.textContent = `${ta.value.length} 字`;
      ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flash('改善版をエディタに挿入しました。試してみよう！');
    }
  } catch (e) {
    alert('改善版の生成に失敗: ' + e.message);
  } finally {
    state.busy = false;
    if (btn) { btn.disabled = false; btn.textContent = '💡 AIに改善版を書かせる'; }
  }
}

function nextLesson(currentId) {
  const idx = LESSONS.findIndex(l => l.id === currentId);
  return idx >= 0 && idx + 1 < LESSONS.length ? LESSONS[idx + 1] : null;
}

// ============== Free practice screen ==============
function openFreePractice() {
  state.currentLesson = null;
  state.currentTopic = randomFreeTopic();
  state.attempt = null;
  state.compare = new Set();
  state.draftSource = 'user';
  state.customMode = false;
  state.vsAttempt = null;
  show('free');
  renderFree();
}

function freeSlotId() {
  if (!state.currentTopic) return null;
  // Custom-topic histories live under their own slot prefix so they don't
  // collide with the random free topics.
  const prefix = state.customMode ? 'custom' : 'free';
  return `${prefix}.${state.currentTopic.id}`;
}

function randomFreeTopic() {
  return FREE_TOPICS[Math.floor(Math.random() * FREE_TOPICS.length)];
}

function renderFree() {
  const topic = state.currentTopic;
  const slot = freeSlotId();
  const p = slot ? loadLessonProgress(slot) : { history: [] };

  const root = document.getElementById('freeRoot');
  const isCustom = state.customMode;
  root.innerHTML = `
    <div class="screen-toolbar">
      <button class="btn ghost" id="backToHomeFromFree">← レッスン一覧</button>
      <span class="muted small">${isCustom ? '🛠️ マイお題' : '🆓 自由練習モード'}</span>
      <button class="btn tiny ghost" id="reshuffleBtn" style="margin-left:auto">${isCustom ? '別のお題を選ぶ →' : '🔄 別のお題'}</button>
    </div>

    <div class="lesson-pane">
      <div class="topic-card">
        <div class="topic-meta">
          <span class="badge cat">${escape(CATEGORY_LABEL[topic.category] || topic.category)}</span>
          <span class="badge">${topic.difficulty === 'high' ? '難易度: 高' : '難易度: 標準'}</span>
          <span class="badge">${isCustom ? '自作お題（通過条件なし）' : '自由練習（通過条件なし）'}</span>
          ${p.bestScore ? `<span class="badge passed">このお題のベスト ${p.bestScore.total.toFixed(1)}</span>` : ''}
        </div>
        <h2>お題: ${escape(topic.title)}</h2>
        <p>${escape(topic.brief)}</p>
      </div>

      <div class="prompt-editor">
        <label><b>✍️ あなたのプロンプト</b></label>
        <textarea id="promptInput" rows="10" placeholder="ここに自由にプロンプトを書いて、AIに送信します..."></textarea>
        <div class="editor-actions">
          <span class="muted small" id="charCount">0 字</span>
          <button class="btn primary big" id="tryBtn">試す（AIに送信）</button>
        </div>
      </div>

      <div id="resultArea"></div>

      ${p.history.length > 0 ? `
        <details class="history-panel" open>
          <summary>📜 このお題の過去の試行 (${p.history.length}件)</summary>
          <div id="historyList"></div>
          <div id="historyDiff"></div>
        </details>
      ` : ''}
    </div>
  `;

  document.getElementById('backToHomeFromFree').addEventListener('click', () => show('home'));
  document.getElementById('reshuffleBtn').addEventListener('click', () => {
    if (state.customMode) {
      // For custom topics, go back to the list (home) so user can pick another
      show('home');
    } else {
      state.currentTopic = randomFreeTopic();
      state.attempt = null;
      state.compare = new Set();
      state.draftSource = 'user';
      state.vsAttempt = null;
      renderFree();
    }
  });
  const ta = document.getElementById('promptInput');
  const draft = loadDraft(draftSlot());
  if (draft) ta.value = draft;
  document.getElementById('charCount').textContent = `${ta.value.length} 字`;
  ta.addEventListener('input', () => {
    document.getElementById('charCount').textContent = `${ta.value.length} 字`;
    saveDraft(draftSlot(), ta.value);
  });
  attachMobileKeyboardScroll(ta);
  document.getElementById('tryBtn').addEventListener('click', onTryFree);

  if (state.attempt) renderResult(state.attempt);
  if (p.history.length > 0) renderHistory(p.history);
}

async function onTryFree() {
  if (state.busy) return;
  const topic = state.currentTopic;
  const ta = document.getElementById('promptInput');
  const prompt = ta.value.trim();
  if (!prompt) { flash('プロンプトを入力してください'); return; }
  if (prompt.length < 10) { flash('もう少し長く書いてみよう'); return; }

  state.busy = true;
  document.getElementById('tryBtn').disabled = true;
  renderResolving();

  try {
    const output = await generateOutput(prompt);
    setResolvingStatus('採点中…');
    const judge = await judgeOutput({ topic, composedPrompt: prompt, output });
    setResolvingStatus('教師が解説中…');
    const explanation = await explainResult({ topic, composedPrompt: prompt, output, judge });

    const source = state.draftSource;
    const attempt = { prompt, output, judge, explanation, passed: false, source };
    state.attempt = attempt;
    state.vsAttempt = null;
    const slot = freeSlotId();
    if (slot) recordAttempt(slot, attempt);
    clearDraft(draftSlot());
    state.draftSource = 'user';
    renderFree();
  } catch (e) {
    console.error(e);
    alert('エラー: ' + e.message);
    renderFree();
  } finally {
    state.busy = false;
  }
}

// ============== Headspace resolving overlay ==============
function renderResolving() {
  const target = document.getElementById(state.screen === 'lesson' ? 'resultArea' : 'resultArea');
  if (!target) return;
  const reflections = [
    'なぜ、その書き方を選んだのでしょう？',
    'この瞬間、自分のプロンプトを振り返ってみましょう。',
    'AIに「何を」「だれの立場で」「どう書くか」、明示しましたか？',
    '次の試行では、どこを変えてみたいですか？',
    'ひと呼吸。プロンプトは何度でも書き直せます。',
  ];
  const reflection = reflections[Math.floor(Math.random() * reflections.length)];
  target.innerHTML = `
    <div class="headspace">
      <div class="breath-stage">
        <div class="orb"></div>
        <div class="orb-label" id="breathLabel">息を吸って…</div>
      </div>
      <h3 id="resolvingStatus" class="headspace-title">AI があなたのプロンプトを実行中</h3>
      <p class="reflection">${escape(reflection)}</p>
      <p class="muted small">${
        activeBackend() === 'openai-compat' ? '🟢 OpenAI互換サーバーを呼び出し中' :
        activeBackend() === 'anthropic' ? '🟢 Anthropic API を呼び出し中' :
        '○ モック実行中（APIキー未設定）'
      }</p>
    </div>
  `;
  let phase = 0;
  const label = document.getElementById('breathLabel');
  if (label) {
    const cycle = setInterval(() => {
      if (!document.getElementById('breathLabel')) { clearInterval(cycle); return; }
      phase = (phase + 1) % 2;
      label.textContent = phase === 0 ? '息を吸って…' : 'ゆっくり吐いて…';
    }, 4000);
  }
}
function setResolvingStatus(t) {
  const el = document.getElementById('resolvingStatus');
  if (el) el.textContent = t;
}

// ============== Helpers ==============
function escape(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
function formatTime(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function flash(msg) {
  const el = document.getElementById('toast');
  if (!el) { alert(msg); return; }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1600);
}
