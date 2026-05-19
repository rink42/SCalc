import { getById, getAll, createExpression, setToken, insertToken, removeToken, removeExpression } from './expression.js';
import { formatResult } from './evaluator.js';
import {
  getCursor, getPendingOpId,
  setCursor, clearPendingOp,
  setPendingOp, scrollToBottom,
} from './ui.js';

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
    const { exprId } = getCursor();
    if (exprId) {
      removeExpression(exprId);
      // active 移到最後一個剩餘運算式
      const rest = getAll();
      const last = rest[rest.length - 1];
      setCursor(last ? last.id : null, last ? last.tokens.length : null);
    }
    return;
  }

  // ── Collapse / expand keypad ─────────────────────────────────────────────
  if (key === 'collapse') {
    const area = document.getElementById('keypad-area');
    const btn  = document.querySelector('[data-key="collapse"]');
    const collapsed = area.classList.toggle('collapsed');
    btn.innerHTML = collapsed ? '&#8963;' : '&#8964;';
    return;
  }

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
    // 數字 / 括號 / 小數點 → 新開一個運算式
    if (key !== '⌫' && key !== '=') {
      const newExpr = createExpression();
      const idx = appendKey(newExpr.id, 0, key);
      setCursor(newExpr.id, idx);
      scrollToBottom();
      return;
    }
    // ⌫ / = fall through（在原運算式上操作）
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
  const expr    = getById(exprId);
  const tokens  = expr.tokens;
  const { charIndex: ci } = getCursor();

  const cur     = tokens[curIdx];
  const prevTok = curIdx > 0 ? tokens[curIdx - 1] : null;
  // 游標是否位於兩個相鄰 operator 之間（cursor ON 第二個 op）
  const betweenOps = cur?.type === 'operator' && prevTok?.type === 'operator';

  // ── Operator ──────────────────────────────────────────────────────────────
  if (isOperator(key)) {
    if (betweenOps) {
      // 替換「前一個」operator（op1），並移除「當前」operator（op2）
      setToken(exprId, curIdx - 1, key);
      removeToken(exprId, curIdx);       // op2 在 curIdx，移除後長度 -1
      return curIdx;                     // 游標在新 op 之後，準備輸入數字
    }
    if (cur?.type === 'operator' && !cur.linked) {
      // 游標在單個 op 上 → 替換
      setToken(exprId, curIdx, key);
      return curIdx + 1;
    }
    // 一般情況：插在游標之後
    const at = curIdx < tokens.length ? curIdx + 1 : tokens.length;
    insertToken(exprId, at, { type: 'operator', value: key });
    // 若前一個也是 op → 游標停在新 op 上（兩 op 之間），等待輸入數字
    if (prevTok?.type === 'operator') return at;
    return at + 1;
  }

  // ── 括號 ──────────────────────────────────────────────────────────────────
  if (key === '(' || key === ')') {
    if (key === '(' && betweenOps) {
      insertToken(exprId, curIdx, { type: 'number', value: '(' });
      return curIdx;  // 游標停在 ( 上，而非 op2 上，避免下一個 ( 插在 op2 後面
    }
    const at = curIdx < tokens.length ? curIdx + 1 : tokens.length;
    insertToken(exprId, at, { type: 'number', value: key });
    // 游標停在剛插入的括號上，不往後跳
    // 這樣連按 (( 會緊接在一起，不會跳過中間的 token
    return at;
  }

  // ── 數字 / 小數點 / 00 ────────────────────────────────────────────────────
  if (betweenOps) {
    // 在兩 op 之間插入數字（插在 op2 前面）
    insertToken(exprId, curIdx, { type: 'number', value: key === '00' ? '0' : key });
    return curIdx; // 游標在新數字上
  }

  if (cur?.type === 'number' && !cur.linked && cur.value !== '(' && cur.value !== ')') {
    if ((key === '.' && cur.value.includes('.')) ||
        (key === '00' && cur.value === '0')) return curIdx;

    if (ci !== null) {
      // 字元游標模式：在 ci 之後插入
      const ins = key === '00' ? '00' : key;
      const newVal = cur.value.slice(0, ci + 1) + ins + cur.value.slice(ci + 1);
      setToken(exprId, curIdx, newVal);
      setCursor(exprId, curIdx, ci + ins.length);
      return curIdx;
    }
    setToken(exprId, curIdx, cur.value + key);
    return curIdx;
  }

  // 沒有數字 token 在游標上 → 新建
  // 若游標在 op 上，而前一個是 `(` 或另一個 op（已被 betweenOps 處理），
  // 則插在 op 「前」；若前一個是數字，則插在 op 「後」（夾在 op 和下一 token 間）
  const insertAt = (cur?.type === 'operator' && prevTok?.value === '(')
    ? curIdx           // 插在 op 前（緊接在 ( 後）
    : cur?.type === 'operator'
      ? curIdx + 1     // 插在 op 後（原行為）
      : cur?.value === '('
        ? curIdx + 1   // 游標在 ( 上 → 插在 ( 後面
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
