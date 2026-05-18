import { getAll, getById, subscribe, removeExpression, createExpression } from './expression.js';
import { formatResult } from './evaluator.js';

const histContainer  = document.getElementById('history-container');
const currentExprEl  = document.getElementById('current-expr');
const historyArea    = document.getElementById('history-area');

// ── State ──────────────────────────────────────────────────────────────────
// activeId: the expression shown in the large current area (always the latest,
//           unless user tapped a history row to select it for deletion)
let activeId   = null;
let tokenIndex = null;    // cursor position within activeId's tokens
let pendingOpId = null;   // id of expr whose result was clicked → waiting for op
let selectedHistId = null; // history row selected (broom will clear this one)

// ── Callbacks for keypad ────────────────────────────────────────────────────
const _onCursorChange = [];
const _onPendingOp    = [];

export function onCursorUpdate(fn)   { _onCursorChange.push(fn); }
export function onPendingOpSelect(fn){ _onPendingOp.push(fn); }

export function getCursor()      { return { exprId: activeId, tokenIndex }; }
export function getPendingOpId() { return pendingOpId; }
export function getSelectedHistId() { return selectedHistId; }

export function setCursor(exprId, idx) {
  pendingOpId    = null;
  selectedHistId = null;
  activeId       = exprId;
  tokenIndex     = idx;
  render();
  _onCursorChange.forEach(fn => fn({ exprId, tokenIndex: idx }));
}

export function setPendingOp(exprId) {
  pendingOpId    = exprId;
  selectedHistId = null;
  activeId       = exprId;
  tokenIndex     = null;
  render();
}

export function clearPendingOp() {
  pendingOpId = null;
  render();
}

export function setSelectedHist(exprId) {
  selectedHistId = exprId;
  pendingOpId    = null;
  render();
}

export function clearSelectedHist() {
  selectedHistId = null;
  render();
}

export function scrollToBottom() {
  historyArea.scrollTop = historyArea.scrollHeight;
}

export function refresh() { render(); }

// ── Subscribe ───────────────────────────────────────────────────────────────
subscribe(render);

// ── Render ───────────────────────────────────────────────────────────────────
function render() {
  const all   = getAll();
  const curId = activeId ?? (all.length ? all[all.length - 1].id : null);
  const hist  = all.filter(e => e.id !== curId);
  const cur   = all.find(e => e.id === curId) ?? null;

  renderHistory(hist);
  renderCurrent(cur);
}

// ── History rows (small) ─────────────────────────────────────────────────────
function renderHistory(exprs) {
  histContainer.innerHTML = '';
  if (exprs.length === 0) return;

  for (const expr of exprs) {
    const row = document.createElement('div');
    row.className = 'hist-row';
    if (expr.id === selectedHistId) row.classList.add('selected-hist');
    row.dataset.id = expr.id;

    const exprStr = tokensToDisplay(expr.tokens);
    const resStr  = expr.result !== null
      ? '= ' + formatResult(expr.result)
      : '= !錯誤';

    row.innerHTML =
      `<span class="hist-expr">${escHtml(exprStr)}</span> ` +
      `<span class="hist-result">${escHtml(resStr)}</span>`;

    row.addEventListener('click', () => {
      if (selectedHistId === expr.id) {
        // second click = clear
        if (activeId === expr.id) { activeId = null; tokenIndex = null; }
        removeExpression(expr.id);
        selectedHistId = null;
        render();
      } else {
        setSelectedHist(expr.id);
      }
    });

    histContainer.appendChild(row);
  }
}

// ── Current expression (large, right-aligned) ────────────────────────────────
function renderCurrent(expr) {
  currentExprEl.innerHTML = '';

  if (!expr) return;

  const tokens   = expr.tokens;
  const isCursor = activeId === expr.id;

  if (tokens.length === 0) {
    // 空運算式：只顯示游標，不顯示錯誤
    const cur = document.createElement('span');
    cur.className = 'cur-token cursor-active';
    cur.textContent = '​';
    currentExprEl.appendChild(cur);
    return;
  }

  // 渲染每個 token
  tokens.forEach((tok, i) => {
    // 在 token 前加空格（第一個除外）
    if (i > 0) {
      const sp = document.createElement('span');
      sp.className = 'cur-token spacer';
      sp.textContent = ' ';
      currentExprEl.appendChild(sp);
    }

    const span = document.createElement('span');
    span.className = 'cur-token ' + tokenClass(tok);
    if (tok.linked) span.classList.add('linked');
    span.textContent = tok.value;

    const isActive = isCursor && tokenIndex === i;
    if (isActive) span.classList.add('active', 'cursor-active');

    if (!tok.linked) {
      span.addEventListener('click', () => setCursor(expr.id, i));
    }
    currentExprEl.appendChild(span);
  });

  // 游標在末尾（past last token）
  if (isCursor && tokenIndex != null && tokenIndex >= tokens.length) {
    const cur = document.createElement('span');
    cur.className = 'cur-token cursor-active';
    cur.textContent = '​';
    currentExprEl.appendChild(cur);
  }

  // = result：接在 tokens 後面，整組不折行
  if (tokens.length > 0) {
    const group = document.createElement('span');
    group.className = 'cur-result-group'; // inline-block + nowrap

    const eqSpan = document.createElement('span');
    eqSpan.className = 'cur-token eq-sep';
    eqSpan.textContent = ' = ';
    group.appendChild(eqSpan);

    const resSpan = document.createElement('span');
    resSpan.className = 'cur-token result';

    if (pendingOpId === expr.id) {
      resSpan.classList.add('pending');
      resSpan.textContent = formatResult(expr.result) ?? '0';
      resSpan.title = '選擇運算子繼續計算';
    } else if (expr.result !== null) {
      resSpan.textContent = formatResult(expr.result);
      resSpan.addEventListener('click', () => {
        setPendingOp(expr.id);
        _onPendingOp.forEach(fn => fn(expr.id, expr.result));
      });
    } else {
      resSpan.classList.add('error');
      resSpan.textContent = '!錯誤';
    }

    group.appendChild(resSpan);
    currentExprEl.appendChild(group);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function tokensToDisplay(tokens) {
  return tokens.map(t => t.value).join(' ');
}

function tokenClass(tok) {
  if (tok.type === 'operator')                return 'op';
  if (tok.value === '(' || tok.value === ')') return 'paren';
  return 'num';
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
