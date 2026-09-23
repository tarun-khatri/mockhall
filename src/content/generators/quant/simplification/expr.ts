/**
 * Expression trees for simplification questions: KaTeX rendering, exact evaluation, float evaluation and
 * step-by-step working (BODMAS order, then isolating "?" when it sits inside the expression).
 *
 * BODMAS conventions used everywhere (the verifier parses the rendered TeX with the same rules):
 *  - "of" (p% of x, a/b of x) binds tighter than × and ÷.
 *  - A product chain has at most one ÷ and it comes last (a × b ÷ c), so "÷ then ×" ambiguity never arises.
 *  - Sums are evaluated left to right; nested groups always carry explicit brackets.
 */
import { plain } from '../../../../lib/format';
import { Q, q } from './frac';

export type NumFmt = 'int' | 'dec' | 'frac' | 'mixed';

export type Node =
  | { t: 'num'; n: number; d: number; f: NumFmt }
  | { t: 'unk' }
  | { t: 'sum'; items: { neg: boolean; x: Node }[] }
  | { t: 'prod'; items: Node[]; div?: Node }
  | { t: 'pct'; p: Node; x: Node }
  | { t: 'of'; f: Node; x: Node }
  | { t: 'pow'; b: Node; e: Node }
  | { t: 'root'; k: 2 | 3; x: Node }
  | { t: 'br'; s: 0 | 1 | 2; x: Node }
  | { t: 'frac'; a: Node; b: Node };

export interface Equation {
  lhs: Node;
  rhs: Node;
}

/* ------------------------------------------------------------------ */
/* Constructors                                                        */
/* ------------------------------------------------------------------ */

export function num(v: number | Q, f?: NumFmt): Node {
  const val = v instanceof Q ? v : Q.dec(v);
  const fmt: NumFmt = f ?? (val.isInt() ? 'int' : val.isDecimal(4) ? 'dec' : 'frac');
  return { t: 'num', n: val.n, d: val.d, f: fmt };
}
export const unk = (): Node => ({ t: 'unk' });
export const frac = (n: number, d: number): Node => num(q(n, d), 'frac');
export const mixed = (n: number, d: number): Node => num(q(n, d), 'mixed');
export const dec = (v: number): Node => num(Q.dec(v), Q.dec(v).isInt() ? 'int' : 'dec');

/** chain(a, ['+', b], ['-', c]) → a + b − c */
export function chain(first: Node, ...rest: ['+' | '-', Node][]): Node {
  return { t: 'sum', items: [{ neg: false, x: first }, ...rest.map(([op, x]) => ({ neg: op === '-', x }))] };
}
export function prod(items: Node[], div?: Node): Node {
  return div ? { t: 'prod', items, div } : { t: 'prod', items };
}
export const times = (...items: Node[]): Node => prod(items);
export const divide = (a: Node, b: Node): Node => prod([a], b);
export const pct = (p: Node, x: Node): Node => ({ t: 'pct', p, x });
export const of = (f: Node, x: Node): Node => ({ t: 'of', f, x });
export const pow = (b: Node, e: Node | number): Node => ({ t: 'pow', b, e: typeof e === 'number' ? num(e) : e });
export const sq = (b: Node | number): Node => pow(typeof b === 'number' ? num(b) : b, 2);
export const cube = (b: Node | number): Node => pow(typeof b === 'number' ? num(b) : b, 3);
export const sqrt = (x: Node | number): Node => ({ t: 'root', k: 2, x: typeof x === 'number' ? num(x) : x });
export const cbrt = (x: Node | number): Node => ({ t: 'root', k: 3, x: typeof x === 'number' ? num(x) : x });
export const br = (x: Node, s: 0 | 1 | 2 = 0): Node => ({ t: 'br', s, x });
export const fracx = (a: Node, b: Node): Node => ({ t: 'frac', a, b });
export const n = (v: number): Node => num(v);

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export function hasUnk(node: Node): boolean {
  switch (node.t) {
    case 'unk':
      return true;
    case 'num':
      return false;
    case 'sum':
      return node.items.some((i) => hasUnk(i.x));
    case 'prod':
      return node.items.some(hasUnk) || (node.div ? hasUnk(node.div) : false);
    case 'pct':
      return hasUnk(node.p) || hasUnk(node.x);
    case 'of':
      return hasUnk(node.f) || hasUnk(node.x);
    case 'pow':
      return hasUnk(node.b) || hasUnk(node.e);
    case 'root':
    case 'br':
      return hasUnk(node.x);
    case 'frac':
      return hasUnk(node.a) || hasUnk(node.b);
  }
}

/** Number of numeric "terms" printed (leaves), used for the difficulty ladder. */
export function leafCount(node: Node): number {
  switch (node.t) {
    case 'unk':
    case 'num':
      return 1;
    case 'sum':
      return node.items.reduce((s, i) => s + leafCount(i.x), 0);
    case 'prod':
      return node.items.reduce((s, i) => s + leafCount(i), 0) + (node.div ? leafCount(node.div) : 0);
    case 'pct':
      return leafCount(node.p) + leafCount(node.x);
    case 'of':
      return leafCount(node.f) + leafCount(node.x);
    case 'pow':
      return leafCount(node.b);
    case 'root':
    case 'br':
      return leafCount(node.x);
    case 'frac':
      return leafCount(node.a) + leafCount(node.b);
  }
}

function unwrap(node: Node): Node {
  return node.t === 'br' ? unwrap(node.x) : node;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

export function qTex(v: Q, style: 'auto' | 'improper' | 'mixed' | 'dec' = 'auto'): string {
  if (v.isInt()) return String(v.n);
  if (style === 'dec' || (style === 'auto' && v.isDecimal(4))) return plain(v.toNumber(), 6);
  const sign = v.n < 0 ? '-' : '';
  const a = Math.abs(v.n);
  if (style === 'mixed' && a > v.d) return `${sign}${Math.floor(a / v.d)}\\frac{${a % v.d}}{${v.d}}`;
  return `${sign}\\frac{${a}}{${v.d}}`;
}

function numTex(node: Extract<Node, { t: 'num' }>): string {
  const v = q(node.n, node.d);
  switch (node.f) {
    case 'int':
      if (!v.isInt()) throw new Error('num: int format on a fraction');
      return String(v.n);
    case 'dec':
      if (!v.isDecimal(6)) throw new Error('num: dec format on a non-terminating value');
      return plain(v.toNumber(), 6);
    case 'frac':
      return qTex(v, 'improper');
    case 'mixed':
      return qTex(v, 'mixed');
  }
}

function hasFrac(node: Node): boolean {
  switch (node.t) {
    case 'num':
      return node.f === 'frac' || node.f === 'mixed';
    case 'unk':
      return false;
    case 'frac':
      return true;
    case 'sum':
      return node.items.some((i) => hasFrac(i.x));
    case 'prod':
      return node.items.some(hasFrac) || (node.div ? hasFrac(node.div) : false);
    case 'pct':
      return hasFrac(node.p) || hasFrac(node.x);
    case 'of':
      return hasFrac(node.f) || hasFrac(node.x);
    case 'pow':
      return hasFrac(node.b);
    case 'root':
    case 'br':
      return hasFrac(node.x);
  }
}

const ATOMIC = new Set<Node['t']>(['num', 'unk', 'pow', 'root', 'br', 'frac']);

function assertChild(ok: boolean, what: string): void {
  if (!ok) throw new Error(`expr: ambiguous rendering (${what})`);
}

export function tex(node: Node): string {
  switch (node.t) {
    case 'num':
      return numTex(node);
    case 'unk':
      return '?';
    case 'sum':
      return node.items
        .map((it, i) => {
          assertChild(it.x.t !== 'sum', 'sum inside sum');
          if (i === 0 && it.neg) throw new Error('expr: leading minus');
          return (i === 0 ? '' : it.neg ? ' - ' : ' + ') + tex(it.x);
        })
        .join('');
    case 'prod': {
      for (const it of node.items) assertChild(it.t !== 'sum' && it.t !== 'prod', 'sum/prod inside prod');
      if (node.div) assertChild(ATOMIC.has(node.div.t), 'non-atomic divisor');
      const body = node.items.map(tex).join(' \\times ');
      return node.div ? `${body} \\div ${tex(node.div)}` : body;
    }
    case 'pct':
      assertChild(node.p.t === 'num' || node.p.t === 'unk', 'percent value');
      assertChild(ATOMIC.has(node.x.t) || node.x.t === 'pct' || node.x.t === 'of', 'percent base');
      return `${tex(node.p)}\\% \\text{ of } ${tex(node.x)}`;
    case 'of':
      assertChild(node.f.t === 'num' || node.f.t === 'frac', 'fraction in "of"');
      assertChild(ATOMIC.has(node.x.t) || node.x.t === 'pct' || node.x.t === 'of', '"of" base');
      return `${tex(node.f)} \\text{ of } ${tex(node.x)}`;
    case 'pow': {
      const b = node.b;
      let base: string;
      if (b.t === 'num') base = b.f === 'int' ? tex(b) : `\\left(${tex(b)}\\right)`;
      else if (b.t === 'unk' || b.t === 'br') base = tex(b);
      else if (b.t === 'root') base = `\\left(${tex(b)}\\right)`;
      else throw new Error('expr: power base must be a number, ? or a bracket');
      return `${base}^{${tex(node.e)}}`;
    }
    case 'root':
      return node.k === 2 ? `\\sqrt{${tex(node.x)}}` : `\\sqrt[3]{${tex(node.x)}}`;
    case 'br': {
      const inner = tex(node.x);
      const big = hasFrac(node.x);
      const [l, r] = node.s === 0 ? ['(', ')'] : node.s === 1 ? ['[', ']'] : ['\\{', '\\}'];
      return big ? `\\left${l}${inner}\\right${r}` : `${l}${inner}${r}`;
    }
    case 'frac':
      return `\\frac{${tex(node.a)}}{${tex(node.b)}}`;
  }
}

export function eqTex(eq: Equation, approx = false): string {
  return `${tex(eq.lhs)} ${approx ? '\\approx' : '='} ${tex(eq.rhs)}`;
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

export function evalQ(node: Node, x?: Q): Q {
  switch (node.t) {
    case 'num':
      return q(node.n, node.d);
    case 'unk':
      if (!x) throw new Error('evalQ: unknown without a value');
      return x;
    case 'sum':
      return node.items.reduce((acc, it, i) => {
        const v = evalQ(it.x, x);
        return i === 0 ? v : it.neg ? acc.sub(v) : acc.add(v);
      }, q(0));
    case 'prod': {
      let v = node.items.reduce((acc, it) => acc.mul(evalQ(it, x)), q(1));
      if (node.div) v = v.div(evalQ(node.div, x));
      return v;
    }
    case 'pct':
      return evalQ(node.p, x).div(q(100)).mul(evalQ(node.x, x));
    case 'of':
      return evalQ(node.f, x).mul(evalQ(node.x, x));
    case 'pow': {
      const e = evalQ(node.e, x);
      // (√a)^(2m) = a^m, (∛a)^(3m) = a^m
      if (node.b.t === 'root' && e.isInt() && e.n % node.b.k === 0) return evalQ(node.b.x, x).pow(e.n / node.b.k);
      const b = evalQ(node.b, x);
      if (e.isInt()) return b.pow(e.n);
      const r = b.root(e.d);
      if (!r) throw new Error('evalQ: inexact fractional power');
      return r.pow(e.n);
    }
    case 'root': {
      const r = evalQ(node.x, x).root(node.k);
      if (!r) throw new Error('evalQ: inexact root');
      return r;
    }
    case 'br':
      return evalQ(node.x, x);
    case 'frac':
      return evalQ(node.a, x).div(evalQ(node.b, x));
  }
}

export function evalF(node: Node, x = 0): number {
  switch (node.t) {
    case 'num':
      return node.n / node.d;
    case 'unk':
      return x;
    case 'sum':
      return node.items.reduce((acc, it, i) => {
        const v = evalF(it.x, x);
        return i === 0 ? v : it.neg ? acc - v : acc + v;
      }, 0);
    case 'prod': {
      let v = node.items.reduce((acc, it) => acc * evalF(it, x), 1);
      if (node.div) v /= evalF(node.div, x);
      return v;
    }
    case 'pct':
      return (evalF(node.p, x) / 100) * evalF(node.x, x);
    case 'of':
      return evalF(node.f, x) * evalF(node.x, x);
    case 'pow':
      return Math.pow(evalF(node.b, x), evalF(node.e, x));
    case 'root':
      return node.k === 2 ? Math.sqrt(evalF(node.x, x)) : Math.cbrt(evalF(node.x, x));
    case 'br':
      return evalF(node.x, x);
    case 'frac':
      return evalF(node.a, x) / evalF(node.b, x);
  }
}

/* ------------------------------------------------------------------ */
/* Worked steps                                                        */
/* ------------------------------------------------------------------ */

/** % ↔ fraction table taught in class. */
const PCT_FRACTIONS: [number, number, string][] = [
  [5, 1, '\\frac{1}{20}'],
  [10, 1, '\\frac{1}{10}'],
  [25, 2, '\\frac{1}{8}'],
  [20, 1, '\\frac{1}{5}'],
  [25, 1, '\\frac{1}{4}'],
  [75, 2, '\\frac{3}{8}'],
  [40, 1, '\\frac{2}{5}'],
  [50, 1, '\\frac{1}{2}'],
  [60, 1, '\\frac{3}{5}'],
  [125, 2, '\\frac{5}{8}'],
  [75, 1, '\\frac{3}{4}'],
  [80, 1, '\\frac{4}{5}'],
  [175, 2, '\\frac{7}{8}'],
  [50, 3, '\\frac{1}{6}'],
  [100, 3, '\\frac{1}{3}'],
  [200, 3, '\\frac{2}{3}'],
  [25, 3, '\\frac{1}{12}'],
  [25, 4, '\\frac{1}{16}'],
  [100, 9, '\\frac{1}{9}'],
  [100, 7, '\\frac{1}{7}'],
  [15, 1, '\\frac{3}{20}'],
  [30, 1, '\\frac{3}{10}'],
  [35, 1, '\\frac{7}{20}'],
  [45, 1, '\\frac{9}{20}'],
  [70, 1, '\\frac{7}{10}'],
  [90, 1, '\\frac{9}{10}'],
];

export function pctFraction(p: Q): string | null {
  const hit = PCT_FRACTIONS.find(([n0, d0]) => q(n0, d0).eq(p));
  return hit ? hit[2] : null;
}

export interface StepCtx {
  steps: string[];
  /** Render non-integer intermediate values as decimals (decimal questions) or fractions. */
  decimals: boolean;
}

function valTex(v: Q, ctx: StepCtx): string {
  if (v.isInt()) return String(v.n);
  if (ctx.decimals && v.isDecimal(4)) return plain(v.toNumber(), 6);
  return qTex(v, 'improper');
}

function lcmInt(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y) [x, y] = [y, x % y];
  return (a / x) * b;
}

/**
 * Reduce a ?-free node to a number, recording one step per operation (innermost first).
 * Returns the number node that replaces it.
 */
export function reduce(node: Node, ctx: StepCtx): Node {
  switch (node.t) {
    case 'num':
      return node;
    case 'unk':
      throw new Error('reduce: unknown');
    case 'br':
      return reduce(node.x, ctx);
    default:
      break;
  }
  const v = evalQ(node);
  let reduced: Node;
  switch (node.t) {
    case 'sum':
      reduced = { t: 'sum', items: node.items.map((it) => ({ neg: it.neg, x: reduce(it.x, ctx) })) };
      break;
    case 'prod':
      reduced = prod(
        node.items.map((it) => reduce(it, ctx)),
        node.div ? reduce(node.div, ctx) : undefined,
      );
      break;
    case 'pct':
      reduced = pct(reduce(node.p, ctx), reduce(node.x, ctx));
      break;
    case 'of':
      reduced = of(node.f.t === 'num' ? node.f : reduce(node.f, ctx), reduce(node.x, ctx));
      break;
    case 'pow':
      reduced = pow(reduce(node.b, ctx), reduce(node.e, ctx));
      break;
    case 'root':
      reduced = { t: 'root', k: node.k, x: reduce(node.x, ctx) };
      break;
    case 'frac':
      reduced = fracx(reduce(node.a, ctx), reduce(node.b, ctx));
      break;
  }
  const out = num(v, v.isInt() ? 'int' : ctx.decimals && v.isDecimal(4) ? 'dec' : 'frac');
  ctx.steps.push(stepFor(reduced, v, ctx));
  return out;
}

function stepFor(reduced: Node, v: Q, ctx: StepCtx): string {
  const lhs = tex(reduced);
  const rhs = valTex(v, ctx);
  if (reduced.t === 'pct' && reduced.p.t === 'num') {
    const hint = pctFraction(q(reduced.p.n, reduced.p.d));
    if (hint) return `$${lhs} = ${hint} \\times ${tex(reduced.x)} = ${rhs}$`;
  }
  if (reduced.t === 'sum') {
    const vals = reduced.items.map((it) => evalQ(it.x));
    if (vals.some((x) => !x.isInt()) && !(ctx.decimals && vals.every((x) => x.isDecimal(4)))) {
      const L = vals.reduce((acc, x) => lcmInt(acc, x.d), 1);
      const parts = reduced.items
        .map((it, i) => (i === 0 ? '' : it.neg ? ' - ' : ' + ') + `\\frac{${(vals[i].n * L) / vals[i].d}}{${L}}`)
        .join('');
      const total = v.mul(q(L));
      const combined = `\\frac{${total.n}}{${L}}`;
      const tail = total.isInt() && L === v.d ? '' : ` = ${rhs}`;
      return `$${lhs} = ${parts} = ${combined}${tail}$`;
    }
  }
  return `$${lhs} = ${rhs}$`;
}

/** Reduce every ?-free subtree of a ?-containing node; the ? path keeps its structure. */
export function reduceKnown(node: Node, ctx: StepCtx): Node {
  if (!hasUnk(node)) return reduce(node, ctx);
  switch (node.t) {
    case 'unk':
      return node;
    case 'num':
      return node;
    case 'sum':
      return { t: 'sum', items: node.items.map((it) => ({ neg: it.neg, x: reduceKnown(it.x, ctx) })) };
    case 'prod':
      return prod(
        node.items.map((it) => reduceKnown(it, ctx)),
        node.div ? reduceKnown(node.div, ctx) : undefined,
      );
    case 'pct':
      return pct(reduceKnown(node.p, ctx), reduceKnown(node.x, ctx));
    case 'of':
      return of(node.f, reduceKnown(node.x, ctx));
    case 'pow':
      return pow(reduceKnown(node.b, ctx), reduceKnown(node.e, ctx));
    case 'root':
      return { t: 'root', k: node.k, x: reduceKnown(node.x, ctx) };
    case 'br':
      return br(reduceKnown(node.x, ctx), node.s);
    case 'frac':
      return fracx(reduceKnown(node.a, ctx), reduceKnown(node.b, ctx));
  }
}

/**
 * Undo the operations around "?" one at a time: node (containing ?) = target.
 * Returns the value of ?; pushes one step per inversion.
 */
export function isolate(node: Node, target: Q, ctx: StepCtx): Q {
  const node0 = node;
  switch (node0.t) {
    case 'unk':
      return target;
    case 'br':
      return isolate(node0.x, target, ctx);
    case 'sum': {
      const idx = node0.items.findIndex((it) => hasUnk(it.x));
      const it = node0.items[idx];
      const others = node0.items.filter((_, i) => i !== idx);
      const s = others.reduce((acc, o) => (o.neg ? acc.sub(evalQ(o.x)) : acc.add(evalQ(o.x))), q(0));
      const inner = tex(it.x);
      let next: Q;
      let how: string;
      if (!it.neg) {
        next = target.sub(s);
        how = s.sign >= 0 ? `${valTex(target, ctx)} - ${valTex(s, ctx)}` : `${valTex(target, ctx)} + ${valTex(s.neg(), ctx)}`;
      } else {
        next = s.sub(target);
        how = `${valTex(s, ctx)} - ${valTex(target, ctx)}`;
      }
      ctx.steps.push(`$${inner} = ${how} = ${valTex(next, ctx)}$`);
      return isolate(it.x, next, ctx);
    }
    case 'prod': {
      if (node0.div && hasUnk(node0.div)) {
        const k = node0.items.reduce((acc, i) => acc.mul(evalQ(i)), q(1));
        const next = k.div(target);
        ctx.steps.push(`$${tex(node0.div)} = ${valTex(k, ctx)} \\div ${valTex(target, ctx)} = ${valTex(next, ctx)}$`);
        return isolate(node0.div, next, ctx);
      }
      const idx = node0.items.findIndex(hasUnk);
      const k = node0.items.filter((_, i) => i !== idx).reduce((acc, i) => acc.mul(evalQ(i)), q(1));
      const dv = node0.div ? evalQ(node0.div) : q(1);
      const next = target.mul(dv).div(k);
      const inner = tex(node0.items[idx]);
      let how: string;
      if (node0.div && !k.eq(q(1))) how = `\\frac{${valTex(target, ctx)} \\times ${valTex(dv, ctx)}}{${valTex(k, ctx)}}`;
      else if (node0.div) how = `${valTex(target, ctx)} \\times ${valTex(dv, ctx)}`;
      else how = `${valTex(target, ctx)} \\div ${valTex(k, ctx)}`;
      ctx.steps.push(`$${inner} = ${how} = ${valTex(next, ctx)}$`);
      return isolate(node0.items[idx], next, ctx);
    }
    case 'pct': {
      if (hasUnk(node0.p)) {
        const base = evalQ(node0.x);
        const next = target.mul(q(100)).div(base);
        ctx.steps.push(`$${tex(node0.p)} = \\frac{${valTex(target, ctx)} \\times 100}{${valTex(base, ctx)}} = ${valTex(next, ctx)}$`);
        return isolate(node0.p, next, ctx);
      }
      const p = evalQ(node0.p);
      const next = target.mul(q(100)).div(p);
      ctx.steps.push(`$${tex(node0.x)} = \\frac{${valTex(target, ctx)} \\times 100}{${valTex(p, ctx)}} = ${valTex(next, ctx)}$`);
      return isolate(node0.x, next, ctx);
    }
    case 'of': {
      const f = evalQ(node0.f);
      const next = target.div(f);
      ctx.steps.push(`$${tex(node0.x)} = ${valTex(target, ctx)} \\times \\frac{${f.d}}{${f.n}} = ${valTex(next, ctx)}$`);
      return isolate(node0.x, next, ctx);
    }
    case 'pow': {
      if (hasUnk(node0.e)) throw new Error('isolate: unknown exponent');
      const e = evalQ(node0.e);
      if (!e.isInt() || (e.n !== 2 && e.n !== 3)) throw new Error('isolate: only squares and cubes');
      const r = target.root(e.n);
      if (!r) throw new Error('isolate: inexact root');
      const sym = e.n === 2 ? `\\sqrt{${valTex(target, ctx)}}` : `\\sqrt[3]{${valTex(target, ctx)}}`;
      ctx.steps.push(`$${tex(node0.b)} = ${sym} = ${valTex(r, ctx)}$`);
      return isolate(node0.b, r, ctx);
    }
    case 'root': {
      const next = target.pow(node0.k);
      ctx.steps.push(`$${tex(node0.x)} = ${valTex(target, ctx)}^{${node0.k}} = ${valTex(next, ctx)}$`);
      return isolate(node0.x, next, ctx);
    }
    case 'frac': {
      if (hasUnk(node0.a)) {
        const b = evalQ(node0.b);
        const next = target.mul(b);
        ctx.steps.push(`$${tex(node0.a)} = ${valTex(target, ctx)} \\times ${valTex(b, ctx)} = ${valTex(next, ctx)}$`);
        return isolate(node0.a, next, ctx);
      }
      const a = evalQ(node0.a);
      const next = a.div(target);
      ctx.steps.push(`$${tex(node0.b)} = ${valTex(a, ctx)} \\div ${valTex(target, ctx)} = ${valTex(next, ctx)}$`);
      return isolate(node0.b, next, ctx);
    }
    case 'num':
      throw new Error('isolate: no unknown');
  }
}

/** Top-level additive terms of an expression (brackets around the whole expression ignored). */
export function topTerms(node: Node): { neg: boolean; x: Node }[] {
  const u = unwrap(node);
  return u.t === 'sum' ? u.items : [{ neg: false, x: u }];
}
