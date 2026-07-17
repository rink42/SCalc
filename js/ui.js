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
      // 同時在顯示時加上千分位逗號
      const wrapper = document.createElement('span');
      wrapper.className = 'cur-token num';
      if (isActiveToken) wrapper.classList.add('active');

      const chars = tok.value.split('');
      chars.forEach((ch, ci) => {
        // 在每 3 位後插入逗號（從右往左數）
        // 例：1234 → 1,234；12345 → 12,345
        const intLen = tok.value.indexOf('.') !== -1
          ? tok.value.indexOf('.')
          : tok.value.length;
        const isBeforeDecimal = ci < intLen;

        if (isBeforeDecimal && ci > 0 && (intLen - ci) % 3 === 0) {
          const comma = document.createElement('span');
          comma.className = 'cur-comma';
          comma.textContent = ',';
          // 點擊逗號會定位游標在逗號前面的字符（用於在那裡插入）
          comma.addEventListener('click', e => {
            e.stopPropagation();
            setCursor(expr.id, i, ci - 1);
          });
          wrapper.appendChild(comma);
        }

        const cSpan = document.createElement('span');
        cSpan.className = 'cur-char';
        const isLastChar = ci === tok.value.length - 1;
        if (isActiveToken) {
          if (charIndex === null) {
            // 末尾模式：游標畫在最後一字「之後」（4|+）
            if (isLastChar) cSpan.classList.add('cursor-after');
          } else if (ci === charIndex) {
            cSpan.classList.add('cursor-here');
          }
        }
        cSpan.textContent = ch;
        cSpan.addEventListener('click', e => {
          e.stopPropagation();
          // 用點擊位置判斷左半 / 右半：左半→游標在此字前，右半→在此字後
          const rect = cSpan.getBoundingClientRect();
          const rightHalf = (e.clientX - rect.left) > rect.width / 2;
          if (!rightHalf) {
            setCursor(expr.id, i, ci);            // 此字之前
          } else if (isLastChar) {
            setCursor(expr.id, i, null);          // 末尾，數字與運算子邊界
          } else {
            setCursor(expr.id, i, ci + 1);        // 下一字之前
          }
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
