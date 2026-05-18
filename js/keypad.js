import { getById, createExpression, setToken, insertToken, removeToken } from './expression.js';
import { formatResult } from './evaluator.js';
import {
  getCursor, getPendingOpId, getSelectedHistId,
  setCursor, clearPendingOp, clearSelectedHist,
  setPendingOp, scrollToBottom, refresh,
  onCursorUpdate, onPendingOpSelect,
} from './ui.js';
import { removeExpression } from './expression.js';

export function initKeypad() {
  document.getElementById('keypad').addEventListener('click', e => {
    const btn = e.target.closest('.key');
    if (!btn) return;
    handleKey(btn.dataset.key);
  });
}

function handleKey(key) {
  // ── Broom (clear) ────────────────────────────────────────────────────────
  if (key === 'clear') {
    const histId = getSelectedHistId();
    if (histId) {
      removeExpression(histId);
      clearSelectedHist();
    } else {
      const { exprId } = getCursor();
      if (exprId) {
        removeExpression(exprId);
        setCursor(null, null);
      }
    }
    return;
  }

  // ── Scroll to bottom ────────────────────────────────────────────────────
  if (key === 'scroll') { scrollToBottom(); return; }

  // ── Pending-op mode ──────────────────────────────────────────────────────
  const pendingId = getPendingOpId();
  if (pendingId !== null) {
    if (isOperator(key)) {
      const srcExpr = getById(pendingId);
      const srcVal  = formatResult(srcExpr?.result ?? 0) ?? '0';
      const newExpr = createExpression(pendingId);
      // tokens[0] = linked number; insert operator at index 1
      insertToken(newExpr.id, 1, { type: 'operator', value: key });
      clearPendingOp();
      setCursor(newExpr.id, 2);
      scrollToBottom();
      return;
    }
    clearPendingOp();
    // fall through to normal input on the same expression
  }

  const { exprId, tokenIndex } = getCursor();

  // ── No active expression: start a new one ────────────────────────────────
  if (exprId === null) {
    if (key === '⌫' || key === '=') return;
    const newExpr = createExpression();
    const idx = appendKey(newExpr.id, 0, key);
    setCursor(newExpr.id, idx);
    scrollToBottom();
    return;
  }

  const expr = getById(exprId);
  if (!expr) return;

  // ── Special keys ─────────────────────────────────────────────────────────
  if (key === '⌫') { handleBackspace(expr, tokenIndex); return; }
  if (key === '=')  { handleEquals(expr); return; }
  if (key === '%')  { handlePercent(expr, tokenIndex); return; }

  const newIdx = appendKey(exprId, tokenIndex, key);
  setCursor(exprId, newIdx);
}

// Insert a key at the current cursor position; return next cursor index.
function appendKey(exprId, curIdx, key) {
  const expr   = getById(exprId);
  const tokens = expr.tokens;

  if (isOperator(key)) {
    const cur = tokens[curIdx];
    // 游標正好在某個 operator → 直接替換
    if (cur && cur.type === 'operator' && !cur.linked) {
      setToken(exprId, curIdx, key);
      return curIdx + 1; // cursor moves past operator
    }
    // 其他情況：插在游標「之後」（curIdx + 1）
    const at = curIdx < tokens.length ? curIdx + 1 : tokens.length;
    insertToken(exprId, at, { type: 'operator', value: key });
    return at + 1; // cursor ready for next number
  }

  if (key === '(' || key === ')') {
    const at = curIdx < tokens.length ? curIdx + 1 : tokens.length;
    insertToken(exprId, at, { type: 'number', value: key });
    return at + 1;
  }

  // Digit, dot, or '00'
  const cur = tokens[curIdx];
  const { charIndex: ci } = getCursor();
  if (cur && cur.type === 'number' && !cur.linked && cur.value !== '(' && cur.value !== ')') {
    if ((key === '.' && cur.value.includes('.')) ||
        (key === '00' && cur.value === '0')) return curIdx;

    if (ci !== null) {
      // 字元游標模式：在 ci 之後插入
      const ins = key === '00' ? '00' : key;
      const newVal = cur.value.slice(0, ci + 1) + ins + cur.value.slice(ci + 1);
      setToken(exprId, curIdx, newVal);
      // 游標移到插入字元末尾
      setCursor(exprId, curIdx, ci + ins.length);
      return curIdx;
    }

    setToken(exprId, curIdx, cur.value + key);
    return curIdx; // stay on same token (charIndex remains null = end)
  }

  // 沒有數字 token 在游標上 → 新建一個
  // 若游標在 operator 上，插在它「之後」；否則插在末尾
  const cur2 = tokens[curIdx];
  const insertAt = (cur2 && cur2.type === 'operator')
    ? curIdx + 1
    : Math.min(curIdx, tokens.length);
  insertToken(exprId, insertAt, { type: 'number', value: key === '00' ? '0' : key });
  return insertAt;
}

function handleBackspace(expr, idx) {
  const tokens = expr.tokens;
  const cur = tokens[idx];
  const { charIndex } = getCursor();

  if (!cur || cur.linked) {
    // 游標在 token 外 or linked token → 刪前一個 token 的最後字
    if (idx > 0 && !tokens[idx - 1]?.linked) {
      const prev = tokens[idx - 1];
      if (prev.value.length > 1) {
        setToken(expr.id, idx - 1, prev.value.slice(0, -1));
        setCursor(expr.id, idx - 1, null);
      } else {
        removeToken(expr.id, idx - 1);
        setCursor(expr.id, idx - 1, null);
      }
    }
    return;
  }

  if (charIndex !== null) {
    // ── 字元游標模式：刪 charIndex 那個字 ──
    const val = cur.value;
    const newVal = val.slice(0, charIndex) + val.slice(charIndex + 1);
    if (newVal === '') {
      removeToken(expr.id, idx);
      setCursor(expr.id, Math.max(0, idx - 1), null);
    } else {
      setToken(expr.id, idx, newVal);
      // 游標留在同位置（現在指向原 charIndex 的下一字，或末尾）
      const newCharIdx = charIndex >= newVal.length ? null : charIndex;
      setCursor(expr.id, idx, newCharIdx);
    }
  } else {
    // ── 末尾模式：刪最後一個字 ──
    if (cur.value.length > 1) {
      setToken(expr.id, idx, cur.value.slice(0, -1));
    } else {
      removeToken(expr.id, idx);
      setCursor(expr.id, Math.max(0, idx - 1), null);
    }
  }
}

function handleEquals(expr) {
  if (expr.result !== null) {
    setPendingOp(expr.id); // result 綠底白字，等待下一個運算子
  } else {
    setCursor(expr.id, expr.tokens.length);
  }
}

function handlePercent(expr, idx) {
  // If current token is a number, append /100 as operator tokens
  const tokens = expr.tokens;
  const cur = tokens[idx];
  if (cur && cur.type === 'number' && !cur.linked) {
    const at = idx + 1;
    insertToken(expr.id, at,     { type: 'operator', value: '÷' });
    insertToken(expr.id, at + 1, { type: 'number',   value: '100' });
    setCursor(expr.id, at + 2);
  }
}

function isOperator(key) {
  return ['+', '-', '×', '÷'].includes(key);
}
