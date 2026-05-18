/**
 * Recursive-descent parser for arithmetic expressions.
 * Supports: +, -, *, /, (), unary minus, decimals.
 * Returns null on any error (syntax, division by zero).
 */

export function evaluate(tokens) {
  const src = tokensToString(tokens);
  if (!src.trim()) return null;
  try {
    const result = parseExpr(src.trim(), { pos: 0 });
    return isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function tokensToString(tokens) {
  return tokens.map(t => {
    if (t.type === 'operator') {
      if (t.value === '×') return '*';
      if (t.value === '÷') return '/';
    }
    return t.value;
  }).join('');
}

// Grammar:
//   expr   = term (('+' | '-') term)*
//   term   = unary (('*' | '/') unary)*
//   unary  = '-' unary | primary
//   primary = number | '(' expr ')'

function parseExpr(src, ctx) {
  let val = parseTerm(src, ctx);
  while (ctx.pos < src.length) {
    const ch = src[ctx.pos];
    if (ch !== '+' && ch !== '-') break;
    ctx.pos++;
    const right = parseTerm(src, ctx);
    val = ch === '+' ? val + right : val - right;
  }
  return val;
}

function parseTerm(src, ctx) {
  let val = parseUnary(src, ctx);
  while (ctx.pos < src.length) {
    const ch = src[ctx.pos];
    if (ch !== '*' && ch !== '/') break;
    ctx.pos++;
    const right = parseUnary(src, ctx);
    if (ch === '/') {
      if (right === 0) throw new Error('div by zero');
      val = val / right;
    } else {
      val = val * right;
    }
  }
  return val;
}

function parseUnary(src, ctx) {
  if (src[ctx.pos] === '-') {
    ctx.pos++;
    return -parseUnary(src, ctx);
  }
  if (src[ctx.pos] === '+') {
    ctx.pos++;
    return parseUnary(src, ctx);
  }
  return parsePrimary(src, ctx);
}

function parsePrimary(src, ctx) {
  if (src[ctx.pos] === '(') {
    ctx.pos++;
    const val = parseExpr(src, ctx);
    if (src[ctx.pos] !== ')') throw new Error('missing )');
    ctx.pos++;
    return val;
  }
  return parseNumber(src, ctx);
}

function parseNumber(src, ctx) {
  const start = ctx.pos;
  while (ctx.pos < src.length && /[\d.]/.test(src[ctx.pos])) ctx.pos++;
  if (ctx.pos === start) throw new Error('expected number at ' + ctx.pos);
  const n = parseFloat(src.slice(start, ctx.pos));
  if (isNaN(n)) throw new Error('invalid number');
  return n;
}

export function formatResult(value) {
  if (value === null) return null;
  // Avoid floating-point noise: round to 10 significant digits
  const rounded = parseFloat(value.toPrecision(10));
  // Show integers without decimal
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}
