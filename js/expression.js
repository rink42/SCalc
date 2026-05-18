import { evaluate, formatResult } from './evaluator.js';

let _nextId = 1;
const expressions = new Map(); // id -> Expression
const subscribers = new Set(); // () => void, called on any change

export function subscribe(fn) { subscribers.add(fn); }
function notify() { subscribers.forEach(fn => fn()); }

export function getAll() { return [...expressions.values()]; }
export function getById(id) { return expressions.get(id); }

export function createExpression(linkedFromId = null) {
  const id = String(_nextId++);
  const tokens = [];

  if (linkedFromId) {
    const src = expressions.get(linkedFromId);
    const srcVal = src?.result ?? 0;
    tokens.push({ type: 'number', value: formatResult(srcVal) ?? '0', linked: true });
  }

  const expr = { id, tokens, linkedFromId, result: null, pendingOp: false };
  expressions.set(id, expr);
  _recalculate(expr);
  notify();
  return expr;
}

export function removeExpression(id) {
  expressions.delete(id);
  notify();
}

export function setToken(id, index, value) {
  const expr = expressions.get(id);
  if (!expr) return;
  if (expr.tokens[index]) expr.tokens[index].value = value;
  _recalculate(expr);
  _propagate(id);
  notify();
}

export function insertToken(id, index, token) {
  const expr = expressions.get(id);
  if (!expr) return;
  expr.tokens.splice(index, 0, token);
  _recalculate(expr);
  _propagate(id);
  notify();
}

export function removeToken(id, index) {
  const expr = expressions.get(id);
  if (!expr) return;
  expr.tokens.splice(index, 1);
  _recalculate(expr);
  _propagate(id);
  notify();
}

export function replaceTokens(id, tokens) {
  const expr = expressions.get(id);
  if (!expr) return;
  expr.tokens = tokens;
  _recalculate(expr);
  _propagate(id);
  notify();
}

function _recalculate(expr) {
  expr.result = evaluate(expr.tokens);
}

// Propagate result changes to downstream expressions (topological order).
// If source becomes invalid → break the link, keep last valid value as editable token.
function _propagate(sourceId) {
  const visited = new Set();
  const queue = [sourceId];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);

    for (const expr of expressions.values()) {
      if (expr.linkedFromId !== id) continue;

      const src = expressions.get(id);

      if (src?.result === null) {
        // 來源出錯 → 斷開連結，token[0] 保留現有值但變成可編輯
        expr.linkedFromId = null;
        if (expr.tokens.length > 0 && expr.tokens[0].linked) {
          expr.tokens[0].linked = false;
          // 保留 value 不清零（使用者看到的數字不變）
        }
        _recalculate(expr);
        // 繼續往下傳（這個 expr 的結果可能也改變了）
        queue.push(expr.id);
      } else {
        // 來源正常 → 更新連動值
        const displayVal = formatResult(src.result) ?? '0';
        if (expr.tokens.length > 0 && expr.tokens[0].linked) {
          expr.tokens[0].value = displayVal;
        }
        _recalculate(expr);
        queue.push(expr.id);
      }
    }
  }
}
