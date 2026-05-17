// Main app controller. Wires UI events to engine/AI/scoring.

import { CARDS, CARD_BY_ID, TYPE_LABEL, TYPE_HINT, CATEGORY_LABEL, COLOR_BY_TYPE, RARITY_LABEL } from '../data/cards.js';
import { PRESET_DECKS, validatePresets } from '../game/presets.js';
import { validateDeck, RULES, totalCost } from '../game/rules.js';
import { createMatch, startRound, submitPlay,
         bothSubmitted, endRoundCleanup, checkGameEnd, activateUtility, peekTop,
         forfeitRound } from '../game/engine.js';
import { composePrompt, adjustScore, decideRoundWinner } from '../game/scoring.js';
import { generateOutput, judgeOutput, explainResult, hasApiKey, setApiKey, getApiKey,
         hasAIBackend, activeBackend, getLMStudioURL, setLMStudioURL } from '../ai/client.js';
import { chooseAIPlay, chooseAIUtility } from '../game/ai_opponent.js';
import { dailyTick, markPlayedToday, recordRound, mascotMood, weekdayLabels, todayWeekIdx } from '../game/daily.js';

// ---------- State ----------
const state = {
  screen: 'home',         // home | deck | match
  selectedDeck: null,     // {name, cards: cardIds[]}
  workingDeck: [],        // editable deck (cardIds[])
  match: null,
  selectedHand: new Set(),// indexes into the player's hand (non-utility cards)
  organizeMode: null,     // { selected: Set<handIndex> } when 思考整理 is active
  constructStep: 0,       // 0=task, 1=perspective, 2=structure, 3=utility, 4=confirm
  busy: false,
};

const CONSTRUCT_STEPS = [
  { type: 'task',        title: 'タスクを選ぼう',  subtitle: 'AI に "何をさせるか"。1 枚以上選ぶと点数が安定します。', color: '#7c3aed' },
  { type: 'perspective', title: '視点を加えよう',  subtitle: '"だれの立場で考えるか"。お題と合う視点はボーナス。',     color: '#0891b2' },
  { type: 'structure',   title: '書き方を選ぼう',  subtitle: '"どんな形で書くか"。表/箇条書き/提案書など。',          color: '#16a34a' },
  { type: 'confirm',     title: '最終確認',        subtitle: 'この組み合わせで AI に作らせます。',                    color: '#4f46e5' },
];

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', () => {
  const presetValidation = validatePresets();
  const bad = presetValidation.filter(v => !v.ok);
  if (bad.length) console.warn('Invalid presets:', bad);

  bindHome();
  bindHeader();
  show('home');
});

function show(screen) {
  state.screen = screen;
  for (const s of ['home', 'deck', 'match']) {
    document.getElementById(`screen-${s}`).classList.toggle('hidden', s !== screen);
  }
  if (screen === 'home') renderDailyPanel();
}

function bindHeader() {
  const keyInput = document.getElementById('apiKeyInput');
  const lmInput = document.getElementById('lmstudioInput');
  const keyStatus = document.getElementById('apiKeyStatus');
  const popover = document.getElementById('settingsPopover');
  const gearBtn = document.getElementById('settingsBtn');

  keyInput.value = getApiKey();
  lmInput.value = getLMStudioURL();
  updateKeyStatus();

  // Settings popover toggle
  gearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popover.classList.toggle('hidden');
  });
  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!popover.classList.contains('hidden')
        && !popover.contains(e.target)
        && e.target !== gearBtn) {
      popover.classList.add('hidden');
    }
  });
  // Don't close when clicking inside
  popover.addEventListener('click', e => e.stopPropagation());

  document.getElementById('saveKeyBtn').addEventListener('click', () => {
    setApiKey(keyInput.value.trim());
    setLMStudioURL(lmInput.value.trim());
    updateKeyStatus();
    popover.classList.add('hidden');
  });
  document.getElementById('clearKeyBtn').addEventListener('click', () => {
    keyInput.value = '';
    lmInput.value = '';
    setApiKey('');
    setLMStudioURL('');
    updateKeyStatus();
  });

  document.getElementById('brandHome').addEventListener('click', () => show('home'));

  function updateKeyStatus() {
    const backend = activeBackend();
    if (backend === 'lmstudio') {
      keyStatus.textContent = '● LM Studio';
      keyStatus.title = `LM Studio (${getLMStudioURL()})`;
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

// ---------- Home screen ----------
function bindHome() {
  // Daily panel (Duolingo-style) — render on every show() back to home
  renderDailyPanel();

  const list = document.getElementById('presetList');
  list.innerHTML = '';
  for (const p of PRESET_DECKS) {
    const row = document.createElement('div');
    row.className = 'preset';
    row.innerHTML = `
      <div class="preset-meta">
        <div class="preset-name">${escape(p.name)}</div>
        <div class="preset-desc">${escape(p.description)}</div>
      </div>
      <div class="preset-actions">
        <button class="btn ghost" data-act="view">構成を見る</button>
        <button class="btn primary" data-act="play">このデッキで対戦</button>
      </div>
    `;
    row.querySelector('[data-act=view]').addEventListener('click', () => openDeckBuilder(p));
    row.querySelector('[data-act=play]').addEventListener('click', () => startMatchWithDeck(p.cards));
    list.appendChild(row);
  }

  document.getElementById('newDeckBtn').addEventListener('click', () => openDeckBuilder(null));
  document.getElementById('howToPlayToggle').addEventListener('click', () => {
    document.getElementById('howToPlay').classList.toggle('hidden');
  });
}

function renderDailyPanel() {
  const host = document.getElementById('dailyPanel');
  if (!host) return;
  const s = dailyTick();
  const mood = mascotMood(s);
  const labels = weekdayLabels();
  const todayIdx = todayWeekIdx();

  const weekHtml = labels.map((lab, i) => {
    const filled = s.weekDays[i];
    const isToday = i === todayIdx;
    return `<div class="day ${filled ? 'filled' : ''} ${isToday ? 'today' : ''}">
      <span class="day-dot">${filled ? '●' : '·'}</span>
      <span class="day-label">${lab}</span>
    </div>`;
  }).join('');

  const missions = (s.missions || []).map(m => `
    <li class="${m.done ? 'done' : ''}">
      <span class="mission-mark">${m.done ? '✅' : '☐'}</span>
      <span class="mission-label">${escape(m.label)}</span>
      <span class="mission-progress">${m.current || 0}/${m.target}</span>
    </li>
  `).join('');

  const doneCount = (s.missions || []).filter(m => m.done).length;
  const totalMissions = (s.missions || []).length;

  host.innerHTML = `
    <div class="daily-card">
      <div class="daily-top">
        <div class="mascot ${mood.mood}">
          <div class="mascot-face">${mood.face}</div>
          <div class="mascot-word">${escape(mood.word)}</div>
        </div>
        <div class="streak">
          <div class="streak-num">🔥 ${s.streak}</div>
          <div class="streak-label">連続記録</div>
        </div>
      </div>
      <div class="week">${weekHtml}</div>
      <div class="missions-block">
        <div class="missions-header">今日のミッション (${doneCount}/${totalMissions})</div>
        <ul class="missions">${missions}</ul>
      </div>
      <div class="daily-stats muted small">
        通算: ${s.totalWins || 0} 勝 / ${s.totalMatches || 0} マッチ
      </div>
    </div>
  `;
}

// ---------- Deck builder ----------
function openDeckBuilder(preset) {
  state.workingDeck = preset ? preset.cards.slice() : [];
  renderDeckBuilder();
  show('deck');
}

function renderDeckBuilder() {
  const pool = document.getElementById('cardPool');
  const tray = document.getElementById('deckTray');
  pool.innerHTML = '';
  tray.innerHTML = '';

  const filterType = document.getElementById('filterType').value;
  const filterCat = document.getElementById('filterCategory').value;
  const filterText = document.getElementById('filterText').value.trim().toLowerCase();

  for (const card of CARDS) {
    if (filterType !== 'all' && card.type !== filterType) continue;
    if (filterCat !== 'all' && card.category !== filterCat) continue;
    if (filterText && !(card.name.toLowerCase().includes(filterText)
                        || card.description.toLowerCase().includes(filterText))) continue;
    const inDeck = state.workingDeck.filter(id => id === card.id).length;
    const el = renderCard(card, { inDeckCount: inDeck });
    el.addEventListener('click', () => {
      addToDeck(card.id);
    });
    pool.appendChild(el);
  }

  // Deck tray grouped by type
  const counts = countByType(state.workingDeck);
  const validation = validateDeck(state.workingDeck, CARD_BY_ID);

  document.getElementById('deckSize').textContent = `${state.workingDeck.length} / ${RULES.deckSize}`;
  document.getElementById('deckTypeCounts').textContent =
    `タスク ${counts.task} / 視点 ${counts.perspective} / 構造 ${counts.structure} / ユーティリティ ${counts.utility}`;

  const errBox = document.getElementById('deckErrors');
  errBox.innerHTML = '';
  if (!validation.ok) {
    for (const e of validation.errors) {
      const li = document.createElement('li');
      li.textContent = e;
      errBox.appendChild(li);
    }
  } else {
    const li = document.createElement('li');
    li.className = 'ok';
    li.textContent = '✓ デッキ要件を満たしています';
    errBox.appendChild(li);
  }

  const playBtn = document.getElementById('playWithDeckBtn');
  playBtn.disabled = !validation.ok;

  // Tray: group cards
  const grouped = {};
  for (const id of state.workingDeck) {
    grouped[id] = (grouped[id] || 0) + 1;
  }
  const ids = Object.keys(grouped).sort((a, b) => {
    const ca = CARD_BY_ID[a], cb = CARD_BY_ID[b];
    if (ca.type !== cb.type) return typeOrder(ca.type) - typeOrder(cb.type);
    return ca.cost - cb.cost;
  });
  for (const id of ids) {
    const card = CARD_BY_ID[id];
    const row = document.createElement('div');
    row.className = 'tray-row';
    row.innerHTML = `
      <span class="tag" style="background:${COLOR_BY_TYPE[card.type]}">${TYPE_LABEL[card.type]}</span>
      <span class="tray-name">${escape(card.name)}</span>
      <span class="tray-cost">${card.cost}</span>
      <span class="tray-count">×${grouped[id]}</span>
      <button class="btn tiny" data-act="rm">−</button>
    `;
    row.querySelector('[data-act=rm]').addEventListener('click', () => removeFromDeck(id));
    tray.appendChild(row);
  }
}

function addToDeck(cardId) {
  const card = CARD_BY_ID[cardId];
  if (!card) return;
  if (state.workingDeck.length >= RULES.deckSize) {
    flash('デッキは30枚までです');
    return;
  }
  const sameCount = state.workingDeck.filter(id => id === cardId).length;
  const rarityLimit = ({ common: Infinity, uncommon: 3, rare: 2, legend: 1 })[card.rarity] ?? Infinity;
  const cap = Math.min(3, rarityLimit);
  if (sameCount >= cap) {
    flash(`「${card.name}」はこれ以上追加できません`);
    return;
  }
  state.workingDeck.push(cardId);
  renderDeckBuilder();
}

function removeFromDeck(cardId) {
  const i = state.workingDeck.lastIndexOf(cardId);
  if (i >= 0) state.workingDeck.splice(i, 1);
  renderDeckBuilder();
}

function bindDeckBuilder() {
  document.getElementById('filterType').addEventListener('change', renderDeckBuilder);
  document.getElementById('filterCategory').addEventListener('change', renderDeckBuilder);
  document.getElementById('filterText').addEventListener('input', renderDeckBuilder);
  document.getElementById('playWithDeckBtn').addEventListener('click', () => {
    startMatchWithDeck(state.workingDeck);
  });
  document.getElementById('clearDeckBtn').addEventListener('click', () => {
    if (confirm('編集中のデッキを空にしますか？')) {
      state.workingDeck = [];
      renderDeckBuilder();
    }
  });
  document.getElementById('backHomeFromDeck').addEventListener('click', () => show('home'));
  document.getElementById('backHomeFromMatch').addEventListener('click', () => {
    if (!state.match || confirm('進行中のマッチを中断してホームに戻りますか？')) {
      state.match = null;
      show('home');
    }
  });
}
document.addEventListener('DOMContentLoaded', bindDeckBuilder);

// ---------- Match ----------
function startMatchWithDeck(playerDeckIds) {
  // Opponent: pick a different preset for variety
  const opponentPreset = pickOpponentPreset(playerDeckIds);
  state.match = createMatch({
    p1Deck: playerDeckIds.slice(),
    p2Deck: opponentPreset.cards.slice(),
    p2IsAI: true,
    p1Name: 'あなた',
    p2Name: `AI: ${opponentPreset.name}`,
  });
  state.selectedHand = new Set();
  markPlayedToday();
  show('match');
  // Skip mulligan: ensureTypesInHand already guarantees a viable starting hand.
  startRound(state.match);
  renderConstructPhase();
}

function pickOpponentPreset(playerDeck) {
  const candidates = PRESET_DECKS.filter(p => JSON.stringify(p.cards) !== JSON.stringify(playerDeck));
  return candidates[Math.floor(Math.random() * candidates.length)] || PRESET_DECKS[0];
}

function renderConstructPhase() {
  state.selectedHand = new Set();
  state.organizeMode = null;
  state.constructStep = 0;
  const m = state.match;
  const me = m.players[0];
  const root = document.getElementById('matchRoot');
  root.innerHTML = '';

  const topic = m.topic;
  const head = document.createElement('div');
  head.className = 'topic-card recipe-topic';
  head.innerHTML = `
    <div class="topic-meta">
      <span class="badge">ラウンド ${m.round} / ${RULES.maxRounds}</span>
      <span class="badge">あなた ${me.score} − ${m.players[1].score} ${escape(m.players[1].name)}</span>
      <span class="badge cat">${CATEGORY_LABEL[topic.category]}</span>
      <span class="badge ${topic.difficulty === 'high' ? 'hi' : ''}">難易度: ${topic.difficulty === 'high' ? '高 (×1.3)' : '標準'}</span>
    </div>
    <h2>お題: ${escape(topic.title)}</h2>
    <p>${escape(topic.brief)}</p>
  `;
  root.appendChild(head);

  const wizard = document.createElement('div');
  wizard.className = 'wizard';
  wizard.innerHTML = `
    <div id="skillsBar" class="skills-bar"></div>
    <div class="wizard-progress" id="wizardProgress"></div>
    <div class="wizard-head" id="wizardHead"></div>
    <p class="hint cost-line">コスト <b id="costTotal">0</b> / ${RULES.costLimit}　<span id="warnArea" class="warn-area"></span></p>
    <div id="utilityLog" class="utility-log"></div>
    <div id="organizeBanner" class="organize-banner hidden"></div>
    <div class="wizard-body" id="wizardBody"></div>
    <div class="wizard-nav" id="wizardNav"></div>
    <details class="prompt-preview" open>
      <summary>📝 いま組み立て中のプロンプト（AIに送られる指示文）</summary>
      <pre id="promptPreviewBody" class="prompt-preview-body">（カードを選ぶとここに反映されます）</pre>
      <p class="muted small">これがそのまま AI に送信されます。実際のプロンプトエンジニアリングで使う言い回しが見えるはずです。</p>
    </details>
    <div class="forfeit-row">
      <button class="btn tiny ghost" id="forfeitBtn" title="今のラウンドを諦めて手札を5枚引き直します。このラウンドは負けになります。">
        手詰まり？ 手札を引き直す（このラウンドを諦める）
      </button>
    </div>
  `;
  root.appendChild(wizard);

  rerenderConstructState();

  wizard.querySelector('#forfeitBtn').addEventListener('click', onForfeit);
}

function gotoStep(n) {
  state.constructStep = Math.max(0, Math.min(CONSTRUCT_STEPS.length - 1, n));
  state.organizeMode = null;
  rerenderConstructState();
}

/**
 * When a card is removed from the player's hand via splice (e.g. utility activation),
 * shift selectedHand indices to match the new hand layout.
 */
function shiftSelectedHandAfterRemoval(removedIdx) {
  const newSet = new Set();
  for (const i of state.selectedHand) {
    if (i === removedIdx) continue;
    if (i > removedIdx) newSet.add(i - 1);
    else newSet.add(i);
  }
  state.selectedHand = newSet;
}

function renderSkillsBar() {
  const bar = document.getElementById('skillsBar');
  if (!bar) return;
  const m = state.match;
  const me = m.players[0];
  const utilCards = me.hand
    .map((id, idx) => ({ id, idx, card: CARD_BY_ID[id] }))
    .filter(x => x.card && x.card.type === 'utility');

  if (utilCards.length === 0 && !me.roundUtilityUsed) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');

  const used = me.roundUtilityUsed;
  bar.innerHTML = `<span class="skills-label">✦ 特殊スキル ${used ? '(発動済み)' : '(1ラウンド1枚)'}</span>`
    + (used
        ? `<span class="skill-used">${escape((me.roundUtilityLog || []).join(' / '))}</span>`
        : utilCards.map(({ id, card }) =>
            `<button class="skill-btn" data-cardid="${escape(id)}" title="${escape(card.description)} / ${escape(card.example)}">
              <span class="skill-name">${escape(card.name)}</span>
              <span class="skill-cost">${card.cost}</span>
             </button>`
          ).join('')
      );
  bar.querySelectorAll('.skill-btn').forEach(btn => {
    btn.addEventListener('click', () => onActivateUtility(btn.dataset.cardid));
  });
}

function rerenderConstructState() {
  const m = state.match;
  const me = m.players[0];
  const progressEl = document.getElementById('wizardProgress');
  const headEl = document.getElementById('wizardHead');
  const bodyEl = document.getElementById('wizardBody');
  const navEl = document.getElementById('wizardNav');
  const costEl = document.getElementById('costTotal');
  const utilLogEl = document.getElementById('utilityLog');
  const organizeBanner = document.getElementById('organizeBanner');

  renderSkillsBar();

  const stepIdx = state.constructStep;
  const step = CONSTRUCT_STEPS[stepIdx];

  // Progress dots
  progressEl.innerHTML = CONSTRUCT_STEPS.map((s, i) => {
    const cls = i < stepIdx ? 'done' : i === stepIdx ? 'current' : 'pending';
    return `<div class="step-dot ${cls}" style="--c:${s.color}" title="${escape(s.title)}">
      <span class="dot"></span><span class="dot-label">${escape(s.title)}</span>
    </div>`;
  }).join('<div class="step-sep"></div>');

  // Step header
  headEl.innerHTML = `
    <div class="wizard-step-num">STEP ${stepIdx + 1} / ${CONSTRUCT_STEPS.length}</div>
    <h3 class="wizard-step-title" style="border-left-color:${step.color}">${escape(step.title)}</h3>
    <p class="wizard-step-sub muted">${escape(step.subtitle)}</p>
  `;

  bodyEl.innerHTML = '';

  // Utility activation log (visible all steps)
  if (me.roundUtilityLog && me.roundUtilityLog.length) {
    utilLogEl.innerHTML = me.roundUtilityLog.map(l =>
      `<div class="util-log-row">✦ ${escape(l)}</div>`).join('');
  } else {
    utilLogEl.innerHTML = '';
  }

  // Organize mode banner
  if (state.organizeMode) {
    organizeBanner.classList.remove('hidden');
    const n = state.organizeMode.selected.size;
    organizeBanner.innerHTML = `
      <b>思考整理: 捨てるカードを選択中</b>（${n}枚選択中 / 引き直し ${n}枚）
      <button class="btn tiny primary" id="orgConfirm" ${n === 0 ? 'disabled' : ''}>確定</button>
      <button class="btn tiny ghost" id="orgCancel">取消</button>
    `;
    organizeBanner.querySelector('#orgConfirm').addEventListener('click', confirmOrganize);
    organizeBanner.querySelector('#orgCancel').addEventListener('click', cancelOrganize);
  } else {
    organizeBanner.classList.add('hidden');
  }

  // Cost summary (visible all steps)
  const selectedCards = [...state.selectedHand].map(i => CARD_BY_ID[me.hand[i]]).filter(Boolean);
  const selectedCost = totalCost(selectedCards);
  const utilCost = me.roundUtilityCost || 0;
  const totalCostNow = selectedCost + utilCost;
  costEl.textContent = totalCostNow;
  costEl.style.color = totalCostNow > RULES.costLimit ? '#dc2626' : '#111';

  const hasTask = selectedCards.some(c => c.type === 'task');
  const hasStruct = selectedCards.some(c => c.type === 'structure');
  const warnEl = document.getElementById('warnArea');
  const warnings = [];
  if (totalCostNow > RULES.costLimit) warnings.push({ type: 'err', text: `コストオーバー（${totalCostNow}/${RULES.costLimit}）` });
  warnEl.innerHTML = warnings.map(w =>
    `<span class="warn-chip ${w.type}">${escape(w.text)}</span>`).join('');

  // ===== Step body =====
  if (step.type === 'confirm') {
    renderConfirmStep(bodyEl, selectedCards, totalCostNow, hasTask, hasStruct);
  } else {
    renderPickStep(bodyEl, step, selectedCards);
  }

  // ===== Live prompt preview =====
  const previewEl = document.getElementById('promptPreviewBody');
  if (previewEl) {
    if (selectedCards.length === 0 && (!me.roundModifiers || me.roundModifiers.length === 0)) {
      previewEl.textContent = '（カードを選ぶとここに反映されます）';
    } else {
      previewEl.textContent = composePrompt(selectedCards, m.topic, me.roundModifiers || []);
    }
  }

  // ===== Step nav =====
  renderStepNav(navEl, stepIdx, totalCostNow, selectedCards.length, hasTask, hasStruct);
}

function renderPickStep(bodyEl, step, selectedCards) {
  const m = state.match;
  const me = m.players[0];
  const handIndices = me.hand
    .map((id, idx) => ({ id, idx, card: CARD_BY_ID[id] }))
    .filter(x => x.card && x.card.type === step.type)
    .sort((a, b) => a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name, 'ja'));

  // Show ingredients (filtered) on left, current selection on right
  bodyEl.innerHTML = `
    <div class="recipe-grid">
      <div class="ingredients">
        <h4>🧂 食材棚（手札の ${escape(TYPE_LABEL[step.type])} カード）</h4>
        <div id="stepHand" class="hand"></div>
      </div>
      <div class="recipe-side">
        <h4>📝 これまでに選んだカード</h4>
        <div id="selectedList" class="selected-list"></div>
        <div id="synergyPreview" class="synergy-preview"></div>
      </div>
    </div>
  `;

  const stepHand = bodyEl.querySelector('#stepHand');
  if (handIndices.length === 0) {
    stepHand.innerHTML = `<p class="muted small">この種別のカードは手札にありません。「飛ばす」で次へ進めます。</p>`;
  } else {
    handIndices.forEach(({ id, idx, card }) => {
      const isUtility = card.type === 'utility';
      const isSelected = !isUtility && state.selectedHand.has(idx);
      const isOrganizeMark = state.organizeMode && state.organizeMode.selected.has(idx);
      const el = renderCard(card, { selected: isSelected || isOrganizeMark, dense: true });

      if (state.organizeMode) {
        if (!isUtility) {
          el.addEventListener('click', () => {
            if (state.organizeMode.selected.has(idx)) state.organizeMode.selected.delete(idx);
            else state.organizeMode.selected.add(idx);
            rerenderConstructState();
          });
        } else {
          el.classList.add('disabled');
        }
      } else if (isUtility) {
        const btn = document.createElement('button');
        btn.className = 'btn tiny primary util-activate';
        btn.textContent = me.roundUtilityUsed ? '発動済み' : '発動';
        btn.disabled = me.roundUtilityUsed;
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onActivateUtility(id);
        });
        el.appendChild(btn);
      } else {
        el.addEventListener('click', () => {
          if (state.selectedHand.has(idx)) state.selectedHand.delete(idx);
          else state.selectedHand.add(idx);
          rerenderConstructState();
        });
      }
      stepHand.appendChild(el);
    });
  }

  // Recipe side: cumulative selection
  const selList = bodyEl.querySelector('#selectedList');
  if (selectedCards.length === 0) {
    selList.innerHTML = `<p class="muted small">まだ何も選んでいません</p>`;
  } else {
    selectedCards.forEach((c, i) => {
      const row = document.createElement('div');
      row.className = 'recipe-step-row';
      row.innerHTML = `<span class="recipe-step-num">${i + 1}</span>
        <span class="recipe-step-pill" style="background:${COLOR_BY_TYPE[c.type]}">${TYPE_LABEL[c.type]}</span>
        <span class="recipe-step-name">${escape(c.name)}</span>
        <span class="recipe-step-cost">${c.cost}</span>`;
      selList.appendChild(row);
    });
  }

  // Synergy preview
  const synEl = bodyEl.querySelector('#synergyPreview');
  import('../data/synergies.js').then(({ detectSynergies }) => {
    const syns = detectSynergies(selectedCards);
    synEl.innerHTML = syns.length
      ? `<b>合わせ技ボーナス:</b> ` + syns.map(s => `<span class="syn-chip" title="${escape(s.description)}">${escape(s.name)}</span>`).join('')
      : `<span class="muted">合わせ技なし</span>`;
  });
}

function renderConfirmStep(bodyEl, selectedCards, totalCostNow, hasTask, hasStruct) {
  const warnings = [];
  if (selectedCards.length === 0) warnings.push({ type: 'err', text: 'カードが 1 枚も選ばれていません' });
  if (!hasTask && selectedCards.length > 0) warnings.push({ type: 'warn', text: 'タスクが入っていません（出力品質↓）' });
  if (!hasStruct && selectedCards.length > 0) warnings.push({ type: 'warn', text: '構造が入っていません（出力品質↓）' });
  if (totalCostNow > RULES.costLimit) warnings.push({ type: 'err', text: `コストオーバー（${totalCostNow}/${RULES.costLimit}）` });

  bodyEl.innerHTML = `
    <div class="confirm-block">
      <h4>🍽 この組み合わせでAIに作らせます</h4>
      <div class="selected-list" id="confirmList"></div>
      <div id="synergyPreview" class="synergy-preview"></div>
      <div class="confirm-warnings">
        ${warnings.map(w => `<div class="warn-chip ${w.type}">${escape(w.text)}</div>`).join('') || '<span class="muted small">問題ありません ✓</span>'}
      </div>
    </div>
  `;
  const list = bodyEl.querySelector('#confirmList');
  if (selectedCards.length === 0) {
    list.innerHTML = `<p class="muted">前のステップに戻ってカードを選んでください</p>`;
  } else {
    selectedCards.forEach((c, i) => {
      const row = document.createElement('div');
      row.className = 'recipe-step-row';
      row.innerHTML = `<span class="recipe-step-num">${i + 1}</span>
        <span class="recipe-step-pill" style="background:${COLOR_BY_TYPE[c.type]}">${TYPE_LABEL[c.type]}</span>
        <span class="recipe-step-name">${escape(c.name)}</span>
        <span class="recipe-step-cost">${c.cost}</span>`;
      list.appendChild(row);
    });
  }
  const synEl = bodyEl.querySelector('#synergyPreview');
  import('../data/synergies.js').then(({ detectSynergies }) => {
    const syns = detectSynergies(selectedCards);
    synEl.innerHTML = syns.length
      ? `<b>合わせ技ボーナス:</b> ` + syns.map(s => `<span class="syn-chip" title="${escape(s.description)}">${escape(s.name)}</span>`).join('')
      : `<span class="muted">合わせ技なし</span>`;
  });
}

function renderStepNav(navEl, stepIdx, totalCostNow, selectedLen, hasTask, hasStruct) {
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === CONSTRUCT_STEPS.length - 1;
  navEl.innerHTML = `
    <button class="btn" id="navBack" ${isFirst ? 'disabled' : ''}>← 戻る</button>
    <div class="nav-spacer"></div>
    ${isLast
      ? `<button class="btn primary big" id="navSubmit">これで実行する</button>`
      : `<button class="btn ghost" id="navSkip">この種別は飛ばす</button>
         <button class="btn primary" id="navNext">次へ →</button>`}
  `;
  navEl.querySelector('#navBack')?.addEventListener('click', () => gotoStep(stepIdx - 1));
  navEl.querySelector('#navSkip')?.addEventListener('click', () => gotoStep(stepIdx + 1));
  navEl.querySelector('#navNext')?.addEventListener('click', () => gotoStep(stepIdx + 1));
  const submitBtn = navEl.querySelector('#navSubmit');
  if (submitBtn) {
    const ok = totalCostNow <= RULES.costLimit && selectedLen > 0 && !state.organizeMode;
    submitBtn.disabled = !ok;
    submitBtn.addEventListener('click', onSubmitPlay);
  }
}

async function onForfeit() {
  const m = state.match;
  const me = m.players[0];
  const opp = m.players[1];
  if (!confirm('今のラウンドを諦めて手札を5枚引き直しますか？\n（このラウンドは負けになります）')) return;
  if (state.busy) return;
  state.busy = true;
  try {
    forfeitRound(m, 0);
    // Opponent still plays their normal round so the match progresses naturally.
    const aiUtil = chooseAIUtility(opp.hand, m.topic, RULES.costLimit - (opp.roundUtilityCost || 0));
    if (aiUtil) { try { activateUtility(m, 1, aiUtil.cardId, aiUtil.options); } catch (_) {} }
    const aiIds = chooseAIPlay(opp.hand, m.topic, opp.roundUtilityCost || 0);
    submitPlay(m, 1, aiIds);

    renderResolving();
    setResolvingStatus('相手の出力のみを生成中…');

    const aiCards = aiIds.map(id => CARD_BY_ID[id]);
    const aiPrompt = composePrompt(aiCards, m.topic, opp.roundModifiers);
    const aiOutput = await generateOutput(aiPrompt);
    const aiJudge = await judgeOutput({ topic: m.topic, composedPrompt: aiPrompt, output: aiOutput });
    const aiAdj = adjustScore({ baseScore: aiJudge, playedCards: aiCards, topic: m.topic, utilityBonus: opp.roundScoreBonus });

    const playerResult = {
      playedCards: [], prompt: '(放棄)', output: 'このラウンドは放棄されました。',
      judge: { accuracy: 0, utility: 0, novelty: 0, rationale: '放棄' },
      utilityLog: me.roundUtilityLog.slice(),
      finalAxes: { accuracy: 0, utility: 0, novelty: 0 }, total: 0,
      breakdown: { baseScore: { accuracy: 0, utility: 0, novelty: 0 }, affinityMultiplier: 1,
        synergyBonus: { accuracy: 0, utility: 0, novelty: 0 }, synergiesTriggered: [],
        difficultyMultiplier: 1, utilityBonus: me.roundScoreBonus },
      forfeit: true,
    };
    const aiResult = {
      playedCards: aiCards, prompt: aiPrompt, output: aiOutput, judge: aiJudge,
      utilityLog: opp.roundUtilityLog.slice(), ...aiAdj,
    };
    const roundResult = { round: m.round, topic: m.topic, winner: 1, players: [playerResult, aiResult] };
    endRoundCleanup(m, roundResult);

    const ending = checkGameEnd(m);
    recordRound({
      didPlay: false, won: false, usedTypes: {}, utilityFired: false,
      synergyFired: false, topicDifficulty: m.topic.difficulty,
    }, ending !== null ? { ended: true, won: ending === 0 } : null);

    renderRoundResult(roundResult);
  } catch (e) {
    console.error(e);
    alert('エラー: ' + e.message);
  } finally {
    state.busy = false;
  }
}

// ----- Utility activation flow -----
function onActivateUtility(cardId) {
  const m = state.match;
  const me = m.players[0];
  if (me.roundUtilityUsed) return;

  const card = CARD_BY_ID[cardId];
  const selectedCost = totalCost([...state.selectedHand].map(i => CARD_BY_ID[me.hand[i]]));
  const remaining = RULES.costLimit - selectedCost - (me.roundUtilityCost || 0);
  if (card.cost > remaining) {
    flash(`コスト残量が不足（残${remaining} / 必要${card.cost}）`);
    return;
  }

  if (cardId === 'util-explore' || cardId === 'util-prep') {
    const n = cardId === 'util-explore' ? 2 : 5;
    const k = cardId === 'util-explore' ? 1 : 2;
    openLookModal(cardId, n, k);
  } else if (cardId === 'util-organize') {
    enterOrganizeMode(cardId);
  } else {
    // Instant utilities (noerror, priority)
    const utilHandIdx = me.hand.indexOf(cardId);
    try {
      activateUtility(m, 0, cardId);
      shiftSelectedHandAfterRemoval(utilHandIdx);
      rerenderConstructState();
    } catch (e) { flash(e.message); }
  }
}

function openLookModal(cardId, n, k) {
  const m = state.match;
  const me = m.players[0];
  const looked = peekTop(me, n);
  if (looked.length === 0) {
    flash('山札が空のため発動できません');
    return;
  }
  const selected = new Set();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${escape(CARD_BY_ID[cardId].name)}: 上${looked.length}枚から最大${k}枚を選択</h3>
      <p class="muted">選んだカードは手札に加わり、残りは山札の底に戻ります。</p>
      <div class="modal-cards" id="modalCards"></div>
      <div class="modal-actions">
        <button class="btn ghost" id="modalCancel">キャンセル</button>
        <button class="btn primary" id="modalConfirm" disabled>確定</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const cardsEl = overlay.querySelector('#modalCards');
  looked.forEach((id, i) => {
    const card = CARD_BY_ID[id];
    const el = renderCard(card);
    el.addEventListener('click', () => {
      if (selected.has(i)) {
        selected.delete(i);
        el.classList.remove('selected');
      } else {
        if (selected.size >= k) {
          flash(`最大${k}枚まで`);
          return;
        }
        selected.add(i);
        el.classList.add('selected');
      }
      overlay.querySelector('#modalConfirm').disabled = selected.size === 0;
    });
    cardsEl.appendChild(el);
  });

  overlay.querySelector('#modalCancel').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  overlay.querySelector('#modalConfirm').addEventListener('click', () => {
    const keptIds = [...selected].map(i => looked[i]);
    const utilHandIdx = m.players[0].hand.indexOf(cardId);
    try {
      activateUtility(m, 0, cardId, { lookedIds: looked, keptIds });
      shiftSelectedHandAfterRemoval(utilHandIdx);
      document.body.removeChild(overlay);
      rerenderConstructState();
    } catch (e) { flash(e.message); }
  });
}

function enterOrganizeMode(cardId) {
  state.organizeMode = { cardId, selected: new Set() };
  rerenderConstructState();
}
function cancelOrganize() {
  state.organizeMode = null;
  rerenderConstructState();
}
function confirmOrganize() {
  const m = state.match;
  const me = m.players[0];
  const { cardId } = state.organizeMode;
  const indices = [...state.organizeMode.selected].sort((a, b) => b - a); // high→low
  const discardIds = indices.map(i => me.hand[i]);
  try {
    activateUtility(m, 0, cardId, { discardIds });
    state.organizeMode = null;
    // Recompute selectedHand because indices changed.
    state.selectedHand = new Set();
    rerenderConstructState();
  } catch (e) { flash(e.message); }
}

async function onSubmitPlay() {
  if (state.busy) return;
  state.busy = true;
  try {
    const m = state.match;
    const me = m.players[0];
    const opp = m.players[1];

    const playerIds = [...state.selectedHand].map(i => me.hand[i]);
    submitPlay(m, 0, playerIds);

    // AI: first decide on utility activation, then pick the play
    const oppUtilCostBefore = opp.roundUtilityCost || 0;
    const aiUtil = chooseAIUtility(opp.hand, m.topic, RULES.costLimit - oppUtilCostBefore);
    if (aiUtil) {
      try { activateUtility(m, 1, aiUtil.cardId, aiUtil.options); } catch (_) {}
    }
    const aiIds = chooseAIPlay(opp.hand, m.topic, opp.roundUtilityCost || 0);
    submitPlay(m, 1, aiIds);

    renderResolving();

    // Generate outputs in parallel
    const playerCards = playerIds.map(id => CARD_BY_ID[id]);
    const aiCards = aiIds.map(id => CARD_BY_ID[id]);
    const playerPrompt = composePrompt(playerCards, m.topic, me.roundModifiers);
    const aiPrompt = composePrompt(aiCards, m.topic, opp.roundModifiers);

    const [playerOutput, aiOutput] = await Promise.all([
      generateOutput(playerPrompt),
      generateOutput(aiPrompt),
    ]);

    setResolvingStatus('出力を採点中…');

    const [playerJudge, aiJudge] = await Promise.all([
      judgeOutput({ topic: m.topic, composedPrompt: playerPrompt, output: playerOutput }),
      judgeOutput({ topic: m.topic, composedPrompt: aiPrompt, output: aiOutput }),
    ]);

    setResolvingStatus('教師が解説中…');

    const playerExplain = await explainResult({
      topic: m.topic, composedPrompt: playerPrompt, output: playerOutput,
      judge: playerJudge, playedCards: playerCards,
    });

    const playerResult = {
      playedCards: playerCards,
      prompt: playerPrompt,
      output: playerOutput,
      judge: playerJudge,
      explanation: playerExplain,
      utilityLog: me.roundUtilityLog.slice(),
      ...adjustScore({ baseScore: playerJudge, playedCards: playerCards, topic: m.topic, utilityBonus: me.roundScoreBonus }),
    };
    const aiResult = {
      playedCards: aiCards,
      prompt: aiPrompt,
      output: aiOutput,
      judge: aiJudge,
      utilityLog: opp.roundUtilityLog.slice(),
      ...adjustScore({ baseScore: aiJudge, playedCards: aiCards, topic: m.topic, utilityBonus: opp.roundScoreBonus }),
    };

    const winner = decideRoundWinner(playerResult, aiResult);
    const roundResult = {
      round: m.round,
      topic: m.topic,
      winner,
      players: [playerResult, aiResult],
    };
    endRoundCleanup(m, roundResult);

    // Update daily missions
    const usedTypes = {};
    for (const c of playerCards) usedTypes[c.type] = (usedTypes[c.type] || 0) + 1;
    const ending = checkGameEnd(m);
    recordRound({
      didPlay: true,
      won: winner === 0,
      usedTypes,
      utilityFired: !!(me.roundUtilityLog && me.roundUtilityLog.length),
      synergyFired: (playerResult.breakdown.synergiesTriggered || []).length > 0,
      topicDifficulty: m.topic.difficulty,
    }, ending !== null ? { ended: true, won: ending === 0 } : null);

    renderRoundResult(roundResult);
  } catch (e) {
    console.error(e);
    alert('エラー: ' + e.message);
  } finally {
    state.busy = false;
  }
}

function renderResolving() {
  const root = document.getElementById('matchRoot');
  const reflections = [
    'なぜ、その組み合わせを選んだのでしょう？',
    'この瞬間、自分の選択を振り返ってみましょう。',
    '今回のお題に、あなたのカードはどう響くでしょうか。',
    '結果より、選んだ理由を覚えておきましょう。',
    'ひと呼吸。次の一手は、もう手の中にあります。',
  ];
  const reflection = reflections[Math.floor(Math.random() * reflections.length)];
  root.innerHTML = `
    <div class="headspace">
      <div class="breath-stage">
        <div class="orb"></div>
        <div class="orb-label" id="breathLabel">息を吸って…</div>
      </div>
      <h3 id="resolvingStatus" class="headspace-title">AI が考えています</h3>
      <p class="reflection">${escape(reflection)}</p>
      <p class="muted small">${
        activeBackend() === 'lmstudio' ? '🟢 LM Studio を呼び出し中' :
        activeBackend() === 'anthropic' ? '🟢 Anthropic API を呼び出し中' :
        '○ モック実行中（APIキー未設定）'
      }</p>
    </div>
  `;
  // Cycle the breathing label every 4 seconds
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

function renderRoundResult(rr) {
  const m = state.match;
  const root = document.getElementById('matchRoot');
  root.innerHTML = '';

  const winnerLabel = rr.winner === 0 ? 'あなたの勝ち' : rr.winner === 1 ? '相手の勝ち' : '引き分け';
  const head = document.createElement('div');
  head.className = 'result-head';
  head.innerHTML = `
    <h2>ラウンド ${rr.round} 結果: ${winnerLabel}</h2>
    <p>スコア: あなた <b>${m.players[0].score}</b> − <b>${m.players[1].score}</b> ${escape(m.players[1].name)}</p>
  `;
  root.appendChild(head);

  const sideWrap = document.createElement('div');
  sideWrap.className = 'result-sides';
  sideWrap.appendChild(renderResultSide('あなた', rr.players[0]));
  sideWrap.appendChild(renderResultSide(m.players[1].name, rr.players[1]));
  root.appendChild(sideWrap);

  const ending = checkGameEnd(m);
  const actions = document.createElement('div');
  actions.className = 'actions';
  if (ending !== null) {
    const msg = ending === 0 ? '🎉 マッチ勝利！' : ending === 1 ? '😢 マッチ敗北' : '引き分け';
    actions.innerHTML = `<h3>${msg}</h3>
      <button class="btn primary" id="backHome">ホームに戻る</button>`;
    actions.querySelector('#backHome').addEventListener('click', () => show('home'));
  } else {
    actions.innerHTML = `<button class="btn primary" id="nextRound">次ラウンドへ</button>`;
    actions.querySelector('#nextRound').addEventListener('click', () => {
      m.round++;
      startRound(m);
      renderConstructPhase();
    });
  }
  root.appendChild(actions);
}

function renderResultSide(name, r) {
  const wrap = document.createElement('div');
  wrap.className = 'result-side';
  const syns = r.breakdown.synergiesTriggered;

  wrap.innerHTML = `
    <h3>${escape(name)}</h3>
    <div class="result-score">
      <span>合計 <b>${r.total.toFixed(1)}</b></span>
      <span title="お題に対する内容の的確さ">正しさ ${r.finalAxes.accuracy.toFixed(1)}</span>
      <span title="実務での活用しやすさ">役立ち ${r.finalAxes.utility.toFixed(1)}</span>
      <span title="他と差別化できる独自性">新しさ ${r.finalAxes.novelty.toFixed(1)}</span>
    </div>
    <div class="result-detail">
      <p><b>AIの講評:</b> ${escape(r.judge.rationale || '—')}</p>
      <p><b>お題との相性:</b> ${r.breakdown.affinityMultiplier.toFixed(2)} ×
         <b>難易度ボーナス:</b> ${r.breakdown.difficultyMultiplier.toFixed(2)}</p>
      ${syns.length ? `<p><b>合わせ技:</b> ${syns.map(s => escape(s.name)).join(', ')}</p>` : ''}
      ${r.utilityLog && r.utilityLog.length ? `<p><b>使った特殊技:</b> ${r.utilityLog.map(escape).join(' / ')}</p>` : ''}
      ${r.forfeit ? `<p class="forfeit-tag">⚑ このラウンドは放棄しました</p>` : ''}
    </div>
    ${r.explanation ? `
      <div class="teacher-panel">
        <div class="teacher-head">📚 教師からのひと言</div>
        <p><b>👍 良かった点:</b> ${escape(r.explanation.praise)}</p>
        <p><b>🌱 もっと良くするには:</b> ${escape(r.explanation.improve)}</p>
        <p class="lesson"><b>💡 今日のレッスン:</b> ${escape(r.explanation.lesson)}</p>
      </div>
    ` : ''}
    <details class="played-cards">
      <summary>使用したカード（${r.playedCards.length}枚）</summary>
      <div class="cards-mini">
        ${r.playedCards.map(c => `<div class="card-mini" style="border-left-color:${COLOR_BY_TYPE[c.type]}">
          <b>${escape(c.name)}</b> <span class="muted">${c.cost}</span>
        </div>`).join('')}
      </div>
    </details>
    <details class="output">
      <summary>組み立てたプロンプト</summary>
      <pre>${escape(r.prompt)}</pre>
    </details>
    <details class="output" open>
      <summary>AIの出力</summary>
      <pre>${escape(r.output)}</pre>
    </details>
  `;
  return wrap;
}

// ---------- Card rendering ----------
function renderCard(card, opts = {}) {
  const el = document.createElement('div');
  el.className = 'card';
  if (opts.selected) el.classList.add('selected');
  if (opts.compact) el.classList.add('compact');
  if (opts.dense) el.classList.add('dense');
  el.style.borderTopColor = COLOR_BY_TYPE[card.type];
  const showExample = !opts.dense && !opts.compact;
  el.innerHTML = `
    <div class="card-head">
      <span class="card-type" style="background:${COLOR_BY_TYPE[card.type]}" title="${escape(TYPE_HINT[card.type])}">${TYPE_LABEL[card.type]}</span>
      <span class="card-cost" title="コスト${card.cost}（10ポイントまで使える）">${card.cost}</span>
    </div>
    <div class="card-name">${escape(card.name)}</div>
    <div class="card-cat">${CATEGORY_LABEL[card.category]} · <span class="rarity ${card.rarity}">${RARITY_LABEL[card.rarity]}</span></div>
    <div class="card-effect">${escape(card.description)}</div>
    ${showExample ? `<div class="card-example muted">${escape(card.example)}</div>` : ''}
    ${opts.inDeckCount ? `<div class="card-indeck">採用中 ×${opts.inDeckCount}</div>` : ''}
  `;
  el.title = `【${TYPE_LABEL[card.type]}＝${TYPE_HINT[card.type]}】
${card.description}
${card.example}

📝 このカードを使うと、AI に次の指示が追加されます:
「${card.effect}」

→ 実プロンプトでも同じ言い回しがそのまま使えます。`;
  return el;
}

// ---------- Helpers ----------
function escape(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
function countByType(ids) {
  const r = { task: 0, perspective: 0, structure: 0, utility: 0 };
  for (const id of ids) { const t = CARD_BY_ID[id]?.type; if (t) r[t]++; }
  return r;
}
function typeOrder(t) { return ['task','perspective','structure','utility'].indexOf(t); }
function flash(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1600);
}
