import { getAll, getById, subscribe, removeExpression, createExpression } from './expression.js';
import { formatResult } from './evaluator.js';

const histContainer  = document.getElementById('history-container');
const currentExprEl  = document.getElementById('current-expr');
const historyArea    = document.getElementById('history-area');

// ── State ──────────────────────────────────────────────────────────────────
// activeId: the expression shown in the large current area (always the latest,
//           unless user tapped a history row to select it for deletion)
let activeId   = null;
let tokenIndex = null;    // which token is active
let charIndex  = null;    // which character within the active number token (null = end)
let pendingOpId = null;
let selectedHistId = null;

// ── Callbacks for keypad ────────────────────────────────────────────────────
const _onCursorChange = [];
const _onPendingOp    = [];

export function onCursorUpdate(fn)   { _onCursorChange.push(fn); }
export function onPendingOpSelect(fn){ _onPendingOp.push(fn); }

export function getCursor()      { return { exprId: activeId, tokenIndex, charIndex }; }
export function getPendingOpId() { return pendingOpId; }
export function getSelectedHistId() { return selectedHistId; }

// setCursor(exprId, tokenIdx, charIdx?)
// charIdx: position within number token; null = end of token (default)
export function setCursor(exprId, idx, charIdx = null) {
  pendingOpId    = null;
  selectedHistId = null;
  activeId       = exprId;
  tokenIndex     = idx;
  charIndex      = charIdx;
  render();
  _onCursorChange.forEach(fn => fn({ exprId, tokenIndex: idx, charIndex: charIdx }));
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
    if (i > 0) {
      const sp = document.createElement('span');
      sp.className = 'cur-token spacer';
      sp.textContent = ' ';
      currentExprEl.appendChild(sp);
    }

    const isActiveToken = isCursor && tokenIndex === i;
    const isNumber = tok.type === 'number' && !tok.linked
                     && tok.value !== '(' && tok.value !== ')';

    if (isNumber) {
      // ── 所有數字 token 都拆成字元 span → 可直接點某個字定位游標 ──
      const wrapper = document.createElement('span');
      wrapper.className = 'cur-token num';
      if (isActiveToken) wrapper.classList.add('active');

      const chars = tok.value.split('');
      chars.forEach((ch, ci) => {
        const cSpan = document.createElement('span');
        cSpan.className = 'cur-char';

        if (isActiveToken) {
          // 游標線：charIndex===null 表示末尾（最後一字之後）
          const showCursor = charIndex === null
            ? ci === chars.length - 1
            : ci === charIndex;
          if (showCursor) cSpan.classList.add('cursor-here');
        }

        cSpan.textContent = ch;
        cSpan.addEventListener('click', e => {
          e.stopPropagation();
          setCursor(expr.id, i, ci); // 直接定位到這個字
        });
        wrapper.appendChild(cSpan);
      });

      currentExprEl.appendChild(wrapper);
    } else {
      // ── operator / paren / linked token：整體顯示 ──
      const span = document.createElement('span');
      span.className = 'cur-token ' + tokenClass(tok);
      if (tok.linked) span.classList.add('linked');
      if (isActiveToken) span.classList.add('active');
      span.textContent = tok.value;
      if (!tok.linked) {
        span.addEventListener('click', () => setCursor(expr.id, i, null));
      }
      currentExprEl.appendChild(span);
    }
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
