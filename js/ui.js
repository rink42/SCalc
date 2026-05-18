import { getAll, getById, subscribe, removeExpression } from './expression.js';
import { formatResult } from './evaluator.js';

const container   = document.getElementById('expressions-container');
const historyArea = document.getElementById('history-area');

// ── Cursor state ────────────────────────────────────────────────────────────
let activeId    = null;
let tokenIndex  = null;
let charIndex   = null;   // position within number token; null = end
let pendingOpId = null;   // waiting for operator after pressing =

// ── Callbacks ────────────────────────────────────────────────────────────────
const _onCursorChange = [];
const _onPendingOp    = [];

export function onCursorUpdate(fn)    { _onCursorChange.push(fn); }
export function onPendingOpSelect(fn) { _onPendingOp.push(fn); }

export function getCursor()      { return { exprId: activeId, tokenIndex, charIndex }; }
export function getPendingOpId() { return pendingOpId; }
export function getSelectedHistId() { return null; } // no longer used
export function clearSelectedHist() {}               // no longer used

export function setCursor(exprId, idx, charIdx = null) {
  pendingOpId = null;
  activeId    = exprId;
  tokenIndex  = idx;
  charIndex   = charIdx;
  render();
  _onCursorChange.forEach(fn => fn({ exprId, tokenIndex: idx, charIndex: charIdx }));
}

export function setPendingOp(exprId) {
  pendingOpId = exprId;
  activeId    = exprId;
  tokenIndex  = null;
  charIndex   = null;
  render();
}

export function clearPendingOp() {
  pendingOpId = null;
  render();
}

export function scrollToBottom() {
  historyArea.scrollTop = historyArea.scrollHeight;
}

export function refresh() { render(); }

// ── Subscribe & render ───────────────────────────────────────────────────────
subscribe(render);

function render() {
  const all = getAll();
  container.innerHTML = '';

  if (all.length === 0) {
    const hint = document.createElement('div');
    hint.style.cssText = 'text-align:center;color:#556;font-size:18px;padding:40px 0';
    hint.textContent = '按任意數字開始計算';
    container.appendChild(hint);
    return;
  }

  for (const expr of all) {
    container.appendChild(buildRow(expr));
  }
}

function buildRow(expr) {
  const row = document.createElement('div');
  row.className = 'expr-row';
  row.dataset.id = expr.id;

  const isCursor = activeId === expr.id;
  const tokens   = expr.tokens;

  // ── Tokens ────────────────────────────────────────────────────────────────
  if (tokens.length === 0 && isCursor) {
    // empty active expression: show cursor
    const cur = document.createElement('span');
    cur.className = 'cur-token cursor-active';
    cur.textContent = '​';
    row.appendChild(cur);
  }

  tokens.forEach((tok, i) => {
    if (i > 0) {
      const sp = document.createElement('span');
      sp.className = 'cur-token spacer';
      sp.textContent = ' ';
      row.appendChild(sp);
    }

    const isActiveToken = isCursor && tokenIndex === i;
    const isNumber = tok.type === 'number' && !tok.linked
                     && tok.value !== '(' && tok.value !== ')';

    if (isNumber) {
      // 數字 token：拆成字元 span，任意位置皆可點擊定位游標
      const wrapper = document.createElement('span');
      wrapper.className = 'cur-token num';
      if (isActiveToken) wrapper.classList.add('active');

      tok.value.split('').forEach((ch, ci) => {
        const cSpan = document.createElement('span');
        cSpan.className = 'cur-char';
        if (isActiveToken) {
          const showCursor = charIndex === null
            ? ci === tok.value.length - 1
            : ci === charIndex;
          if (showCursor) cSpan.classList.add('cursor-here');
        }
        cSpan.textContent = ch;
        cSpan.addEventListener('click', e => {
          e.stopPropagation();
          setCursor(expr.id, i, ci);
        });
        wrapper.appendChild(cSpan);
      });

      row.appendChild(wrapper);
    } else {
      // operator / paren / linked
      const span = document.createElement('span');
      span.className = 'cur-token ' + tokenClass(tok);
      if (tok.linked) span.classList.add('linked');
      if (isActiveToken) span.classList.add('active');
      span.textContent = tok.value;
      if (!tok.linked) {
        span.addEventListener('click', () => setCursor(expr.id, i, null));
      }
      row.appendChild(span);
    }
  });

  // 游標在末尾
  if (isCursor && tokenIndex != null && tokenIndex >= tokens.length) {
    const cur = document.createElement('span');
    cur.className = 'cur-token cursor-active';
    cur.textContent = '​';
    row.appendChild(cur);
  }

  // ── = result ──────────────────────────────────────────────────────────────
  if (tokens.length > 0) {
    const group = document.createElement('span');
    group.className = 'cur-result-group';

    const eqSpan = document.createElement('span');
    eqSpan.className = 'cur-token eq-sep';
    eqSpan.textContent = ' = ';
    group.appendChild(eqSpan);

    const resSpan = document.createElement('span');
    resSpan.className = 'cur-token result';

    if (pendingOpId === expr.id) {
      resSpan.classList.add('pending');
      resSpan.textContent = formatResult(expr.result) ?? '0';
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
    row.appendChild(group);
  }

  // ── 點擊整列（非 token）→ 設為 active，游標在末尾 ────────────────────────
  row.addEventListener('click', () => {
    if (activeId !== expr.id) {
      setCursor(expr.id, expr.tokens.length, null);
    }
  });

  return row;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function tokenClass(tok) {
  if (tok.type === 'operator')                return 'op';
  if (tok.value === '(' || tok.value === ')') return 'paren';
  return 'num';
}
