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

// Propagate result changes to expressions linked to this one (topological order).
function _propagate(sourceId) {
  const visited = new Set();
  const queue = [sourceId];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    for (const expr of expressions.values()) {
      if (expr.linkedFromId === id) {
        const src = expressions.get(id);
        const srcVal = src?.result ?? 0;
        const displayVal = formatResult(srcVal) ?? '0';
        if (expr.tokens.length > 0 && expr.tokens[0].linked) {
          expr.tokens[0].value = displayVal;
        }
        _recalculate(expr);
        queue.push(expr.id);
      }
    }
  }
}
