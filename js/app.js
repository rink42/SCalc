import './ui.js';
import { initKeypad, handleKey } from './keypad.js';
import { createExpression, getAll, getById } from './expression.js';
import { getCursor, setCursor, scrollToBottom } from './ui.js';

initKeypad();

const first = createExpression();
setCursor(first.id, 0);
scrollToBottom();

// 鍵盤對應表：key → data-key
const KEY_MAP = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
  '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '.': '.', '+': '+', '-': '-', '*': '×', '/': '÷',
  'Enter': '=', '=': '=',
  'Backspace': '⌫',
  '%': '%',
  '(': '(', ')': ')',
};

document.addEventListener('keydown', e => {
  // Ctrl+Delete = 掃把（清除當前運算式）
  if (e.ctrlKey && e.key === 'Delete') {
    e.preventDefault();
    handleKey('clear');
    return;
  }
  // 忽略其他組合鍵
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  // 方向鍵移動游標
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
      e.key === 'ArrowUp'   || e.key === 'ArrowDown') {
    e.preventDefault();
    moveCursor(e.key);
    return;
  }

  const mapped = KEY_MAP[e.key];
  if (mapped) {
    e.preventDefault();
    handleKey(mapped);
  }
});

function moveCursor(key) {
  const { exprId, tokenIndex, charIndex } = getCursor();
  if (!exprId) return;
  const expr = getById(exprId);
  if (!expr) return;
  const tokens = expr.tokens;

  if (key === 'ArrowUp' || key === 'ArrowDown') {
    // 上下：切換運算式
    const all = getAll();
    const idx = all.findIndex(e => e.id === exprId);
    const next = key === 'ArrowUp' ? all[idx - 1] : all[idx + 1];
    if (!next) return;
    const clampedTok = Math.min(tokenIndex ?? next.tokens.length, next.tokens.length);
    setCursor(next.id, clampedTok, null);
    return;
  }

  const right = key === 'ArrowRight';
  const tok = tokens[tokenIndex];
  const isNum = tok?.type === 'number' && !tok?.linked
                && tok?.value !== '(' && tok?.value !== ')';

  if (right) {
    if (isNum && charIndex !== null) {
      // 在數字中：右移一格
      const next = charIndex + 1;
      if (next < tok.value.length) {
        setCursor(exprId, tokenIndex, next);
      } else {
        // 到數字末尾
        setCursor(exprId, tokenIndex, null);
      }
    } else {
      // 末尾 or operator：跳到下一個 token
      const nextIdx = tokenIndex + 1;
      if (nextIdx <= tokens.length) {
        const nextTok = tokens[nextIdx];
        const nextIsNum = nextTok?.type === 'number' && !nextTok?.linked
                          && nextTok?.value !== '(' && nextTok?.value !== ')';
        setCursor(exprId, nextIdx, nextIsNum ? 0 : null);
      }
    }
  } else {
    // 左移
    if (isNum && charIndex !== null) {
      if (charIndex > 0) {
        setCursor(exprId, tokenIndex, charIndex - 1);
      } else {
        // 在數字開頭：跳到前一個 token 末尾
        const prevIdx = tokenIndex - 1;
        if (prevIdx >= 0) {
          const prevTok = tokens[prevIdx];
          const prevIsNum = prevTok?.type === 'number' && !prevTok?.linked
                            && prevTok?.value !== '(' && prevTok?.value !== ')';
          setCursor(exprId, prevIdx, prevIsNum ? null : null);
        }
      }
    } else if (isNum && charIndex === null) {
      // 數字末尾 → 移到最後一字之前
      setCursor(exprId, tokenIndex, tok.value.length - 1);
    } else {
      // operator 或 token 外：跳到前一個 token
      const prevIdx = tokenIndex - 1;
      if (prevIdx >= 0) {
        const prevTok = tokens[prevIdx];
        const prevIsNum = prevTok?.type === 'number' && !prevTok?.linked
                          && prevTok?.value !== '(' && prevTok?.value !== ')';
        setCursor(exprId, prevIdx, prevIsNum ? null : null);
      }
    }
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
