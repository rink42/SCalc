import './ui.js';
import { initKeypad, handleKey } from './keypad.js';
import { createExpression } from './expression.js';
import { setCursor, scrollToBottom } from './ui.js';

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

  const mapped = KEY_MAP[e.key];
  if (mapped) {
    e.preventDefault();
    handleKey(mapped);
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
