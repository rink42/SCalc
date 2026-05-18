import './ui.js';
import { initKeypad } from './keypad.js';
import { createExpression } from './expression.js';
import { setCursor, scrollToBottom } from './ui.js';

initKeypad();

const first = createExpression();
setCursor(first.id, 0);
scrollToBottom();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
