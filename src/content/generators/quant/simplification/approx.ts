/**
 * Approximation questions. Build backward: a clean "rounded" equation with an integer key is chosen first,
 * then every printed number is nudged to a near-integer (24.98%, 1199.87, 16.02², √624.8). The exact value of the
 * printed expression must stay within 2% of the key, and options are ≥ 8% apart, so the key is always the option
 * nearest to the exact value (SPEC 7.4).
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty } from '../../../types';
import { plain } from '../../../../lib/format';
import { Q, q } from './frac';
import {
  br,
  cbrt,
  chain,
  divide,
  evalF,
  frac,
  hasUnk,
  n,
  num,
  of,
  pct,
  prod,
  sq,
  sqrt,
  tex,
  times,
  unk,
  type Equation,
  type Node,
} from './expr';
import { makeRhs, need, pctBase, Retry, type MistakeQ } from './templates';

export interface ApproxBuilt {
  shown: Equation;
  rounded: Equation;
  /** Key (integer) — the value of the rounded equation's "?". */
  key: Q;
  tags: string[];
  mistakes: MistakeQ[];
  /** Rounding notes such as "$24.98 \approx 25$". */
  roundings: string[];
  shortcut?: string;
  /** Options are neighbouring perfect squares (√? questions). */
  squareOptions?: boolean;
}

interface Intended {
  lhs: Node;
  rhs: Node;
  x?: Q;
  tags: string[];
  /** Print roots of non-perfect squares/cubes (√290 ≈ 17). */
  nonPerfect?: boolean;
  squareOptions?: boolean;
  shortcut?: string;
}

const P_EASY = [10, 20, 25, 30, 40, 50, 60, 75, 15, 35, 45];
const P_MED = [...P_EASY, 12, 18, 24, 36, 44, 55, 65, 70, 80, 90];

function pickP(rng: Rng, d: Difficulty): number {
  return rng.pick(d === 'easy' ? P_EASY : P_MED);
}

const T = (...extra: string[]) => ['simplification:approximation', ...extra];

function intended(rng: Rng, d: Difficulty): Intended {
  if (d === 'easy') {
    switch (rng.int(0, 3)) {
      case 0: {
        const a = rng.int(12, 49);
        const b = rng.int(5, 25);
        const c = rng.int(20, 199);
        return { lhs: chain(times(n(a), n(b)), ['+', n(c)]), rhs: unk(), tags: T() };
      }
      case 1: {
        const b = rng.int(5, 25);
        const qv = rng.int(8, 60);
        const c = rng.int(20, 199);
        return { lhs: chain(divide(n(b * qv), n(b)), ['+', n(c)]), rhs: unk(), tags: T() };
      }
      case 2: {
        const p = pickP(rng, d);
        const X = pctBase(rng, q(p), 200, 2000);
        const c = rng.int(20, 199);
        return { lhs: chain(pct(n(p), n(X)), ['+', n(c)]), rhs: unk(), tags: T('trick:percent-fraction') };
      }
      default: {
        const a = rng.int(12, 49);
        const b = rng.int(5, 25);
        const c = rng.int(20, Math.min(199, a * b - 30));
        return { lhs: chain(times(n(a), n(b)), ['-', n(c)]), rhs: unk(), tags: T() };
      }
    }
  }
  if (d === 'medium') {
    switch (rng.int(0, 4)) {
      case 0: {
        const p = pickP(rng, d);
        const X = pctBase(rng, q(p), 300, 2400);
        const s = rng.int(11, 30);
        return { lhs: chain(pct(n(p), n(X)), ['+', sq(s)]), rhs: unk(), tags: T('trick:percent-fraction', 'trick:squares-cubes') };
      }
      case 1: {
        const s = rng.int(11, 35);
        const a = rng.int(3, 12);
        const b = rng.int(10, s * a - 10);
        return { lhs: chain(times(sqrt(s * s), n(a)), ['-', n(b)]), rhs: unk(), tags: T('trick:squares-cubes') };
      }
      case 2: {
        const qd = rng.pick([3, 4, 5, 6, 7, 8, 9]);
        const p = rng.pick([1, 2, 3, 4, 5, 6, 7, 8].filter((x) => x < qd && gcdInt(x, qd) === 1));
        const X = qd * rng.int(Math.ceil(100 / qd), Math.floor(1500 / qd));
        const a = rng.int(11, 30);
        const b = rng.int(3, 12);
        return { lhs: chain(of(frac(p, qd), n(X)), ['+', times(n(a), n(b))]), rhs: unk(), tags: T() };
      }
      case 3: {
        const c = rng.int(3, 12);
        const a = c * rng.int(3, 12);
        const b = rng.int(11, 40);
        const dd = rng.int(20, 199);
        return { lhs: chain(prod([n(a), n(b)], n(c)), ['+', n(dd)]), rhs: unk(), tags: T() };
      }
      default: {
        const p = pickP(rng, d);
        const X = pctBase(rng, q(p), 300, 2400);
        const P = (p * X) / 100;
        const s = rng.int(11, 35);
        const c = rng.int(20, 199);
        need(P - s > 20);
        return { lhs: chain(pct(n(p), n(X)), ['-', sqrt(s * s)], ['+', n(c)]), rhs: unk(), tags: T('trick:percent-fraction') };
      }
    }
  }
  if (d === 'hard') {
    switch (rng.int(0, 3)) {
      case 0: {
        const p = pickP(rng, d);
        const X = pctBase(rng, q(p), 400, 3000);
        const P = (p * X) / 100;
        const m = rng.int(11, 30);
        const s = rng.int(11, 30);
        const a = rng.int(3, 9);
        need(P + m * m - s * a > 50);
        return { lhs: chain(pct(n(p), n(X)), ['+', sq(m)], ['-', times(sqrt(s * s), n(a))]), rhs: unk(), tags: T('trick:percent-fraction') };
      }
      case 1: {
        const x = rng.int(11, 60);
        const a = rng.int(3, 15);
        const p = pickP(rng, d);
        const X = pctBase(rng, q(p), 200, 2000);
        const Tv = x * a + (p * X) / 100;
        return { lhs: chain(times(unk(), n(a)), ['+', pct(n(p), n(X))]), rhs: makeRhs(rng, Tv, 'hard'), x: q(x), tags: T('simplification:missing-inside') };
      }
      case 2: {
        const qd = rng.pick([3, 4, 5, 7, 8]);
        const p = rng.pick([1, 2, 3, 4, 5, 6].filter((x) => x < qd && gcdInt(x, qd) === 1));
        const X = qd * rng.int(Math.ceil(150 / qd), Math.floor(1500 / qd));
        const r = pickP(rng, d);
        const Y = pctBase(rng, q(r), 200, 1600);
        const a = rng.int(11, 30);
        const b = rng.int(3, 9);
        const c = rng.int(20, 150);
        need((p * X) / qd + (r * Y) / 100 - a * b > 30);
        return { lhs: chain(of(frac(p, qd), n(X)), ['+', pct(n(r), n(Y))], ['-', times(n(a), n(b))], ['+', n(c)]), rhs: unk(), tags: T() };
      }
      default: {
        const c = rng.int(3, 12);
        const a = c * rng.int(3, 15);
        const b = rng.int(11, 40);
        const p = pickP(rng, d);
        const X = pctBase(rng, q(p), 200, 2000);
        const D = rng.int(20, 150);
        need((a * b) / c + (p * X) / 100 - D > 30);
        return { lhs: chain(prod([n(a), n(b)], n(c)), ['+', pct(n(p), n(X))], ['-', n(D)]), rhs: unk(), tags: T() };
      }
    }
  }
  // extreme: double approximation
  switch (rng.int(0, 3)) {
    case 0: {
      const x = rng.int(12, 35);
      const a = rng.int(11, 30);
      const b = rng.int(3, 12);
      const c = rng.int(11, 30);
      const P = x * x + a * b - c * c;
      need(P > 40);
      const p = rng.pick([10, 20, 25, 50]);
      const X = (P * 100) / p;
      need(Number.isInteger(X) && X <= 9999);
      return {
        lhs: chain(sq(unk()), ['+', times(n(a), n(b))]),
        rhs: chain(pct(n(p), n(X)), ['+', sq(c)]),
        x: q(x),
        tags: T('simplification:missing-inside', 'trick:squares-cubes'),
        shortcut: 'Round everything, find ?² and then the nearest perfect square.',
      };
    }
    case 1: {
      const s = rng.int(11, 30);
      const a = rng.int(3, 12);
      const t = rng.int(4, 15);
      const b = rng.int(3, 12);
      return {
        lhs: chain(times(sqrt(s * s), n(a)), ['+', times(cbrt(t ** 3), n(b))]),
        rhs: unk(),
        tags: T('trick:squares-cubes'),
        nonPerfect: true,
        shortcut: 'Replace each root by the root of the nearest perfect square/cube.',
      };
    }
    case 2: {
      const p = pickP(rng, 'medium');
      const Xs = pctBase(rng, q(p), 300, 2400);
      const P = (p * Xs) / 100;
      const divs: number[] = [];
      for (let a = 3; a <= 12; a++) if (P % a === 0) divs.push(a);
      need(divs.length > 0);
      const a = rng.pick(divs);
      const Y = rng.int(40, Math.max(41, Math.floor(Xs / 3)));
      need(Xs - Y > 50);
      const b = rng.int(11, 30);
      return {
        lhs: chain(divide(br(pct(n(p), br(chain(n(Xs - Y), ['+', n(Y)]))), 1), n(a)), ['+', sq(b)]),
        rhs: unk(),
        tags: T('simplification:nested-brackets'),
      };
    }
    default: {
      const y = rng.int(12, 22);
      const a = rng.int(3, 12);
      const b = rng.int(20, 199);
      return {
        lhs: chain(times(sqrt(unk()), n(a)), ['+', n(b)]),
        rhs: makeRhs(rng, y * a + b, 'hard'),
        x: q(y * y),
        tags: T('simplification:missing-inside', 'trick:squares-cubes'),
        squareOptions: true,
        shortcut: '√? comes out close to a whole number, so ? is close to a perfect square — the options are neighbouring squares.',
      };
    }
  }
}

function gcdInt(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return Math.abs(a);
}

/* ------------------------------------------------------------------ */
/* Perturbation                                                        */
/* ------------------------------------------------------------------ */

function delta(rng: Rng, v: number, shrink: number): number {
  let pool: number[];
  if (v < 10) pool = [1, 2, 3, 4, 5];
  else if (v < 100) pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12];
  else if (v < 1000) pool = [2, 3, 4, 5, 6, 8, 10, 12, 13, 15, 18, 22, 25];
  else pool = [5, 8, 10, 12, 13, 15, 20, 25, 30, 40];
  const cents = Math.max(1, Math.round(rng.pick(pool) / shrink));
  return (rng.chance(0.5) ? -1 : 1) * cents;
}

/** v ± δ as an exact 2-dp decimal node; returns [node, shown text]. */
function nudge(rng: Rng, v: number, shrink: number): Node {
  const c = delta(rng, v, shrink);
  const shown = q(Math.round(v * 100) + c, 100);
  need(shown.sign > 0);
  return num(shown, 'dec');
}

interface PCtx {
  rng: Rng;
  shrink: number;
  nonPerfect: boolean;
  notes: string[];
}

function perturb(node: Node, c: PCtx): Node {
  switch (node.t) {
    case 'num': {
      if (node.f !== 'int') return node;
      const v = node.n;
      if (v < 2 || (v < 10 && c.rng.chance(0.25))) return node;
      const out = nudge(c.rng, v, c.shrink);
      c.notes.push(`$${tex(out)} \\approx ${v}$`);
      return out;
    }
    case 'unk':
      return node;
    case 'sum':
      return { t: 'sum', items: node.items.map((it) => ({ neg: it.neg, x: perturb(it.x, c) })) };
    case 'prod':
      return prod(
        node.items.map((it) => perturb(it, c)),
        node.div ? perturb(node.div, c) : undefined,
      );
    case 'pct': {
      let p = node.p;
      if (p.t === 'num' && p.f === 'int') {
        const cents = (c.rng.chance(0.5) ? -1 : 1) * Math.max(1, Math.round(c.rng.int(1, 5) / c.shrink));
        p = num(q(p.n * 100 + cents, 100), 'dec');
        c.notes.push(`$${tex(p)}\\% \\approx ${node.p.t === 'num' ? node.p.n : ''}\\%$`);
      }
      return pct(p, perturb(node.x, c));
    }
    case 'of':
      return of(node.f, perturb(node.x, c));
    case 'pow': {
      if (node.b.t === 'num' && node.b.f === 'int') {
        const v = node.b.n;
        const cents = (c.rng.chance(0.5) ? -1 : 1) * Math.max(1, Math.round(c.rng.int(1, 4) / c.shrink));
        const b = num(q(v * 100 + cents, 100), 'dec');
        c.notes.push(`$${tex(b)} \\approx ${v}$`);
        return { t: 'pow', b, e: node.e };
      }
      return { t: 'pow', b: perturb(node.b, c), e: node.e };
    }
    case 'root': {
      if (node.x.t === 'num' && node.x.f === 'int') {
        const N = node.x.n;
        const r = Math.round(node.k === 2 ? Math.sqrt(N) : Math.cbrt(N));
        let inner: Node;
        if (c.nonPerfect) {
          const k = node.k === 2 ? c.rng.int(1, Math.max(1, Math.min(3, Math.floor(r / 4)))) : c.rng.int(2, Math.max(2, Math.min(9, r)));
          inner = n(N + (c.rng.chance(0.5) ? -k : k));
        } else {
          const cents = (c.rng.chance(0.5) ? -1 : 1) * Math.max(1, Math.round(c.rng.int(2, 60) / c.shrink));
          inner = num(q(N * 100 + cents, 100), 'dec');
        }
        const sym = node.k === 2 ? '\\sqrt' : '\\sqrt[3]';
        c.notes.push(`$${sym}{${tex(inner)}} \\approx ${sym}{${N}} = ${r}$`);
        return { t: 'root', k: node.k, x: inner };
      }
      return { t: 'root', k: node.k, x: perturb(node.x, c) };
    }
    case 'br':
      return br(perturb(node.x, c), node.s);
    case 'frac':
      return { t: 'frac', a: perturb(node.a, c), b: perturb(node.b, c) };
  }
}

/** Exact solution of the printed equation for "?" (bisection; "?" appears once, monotonically). */
export function solveShown(eq: Equation): number {
  const f = (x: number) => evalF(eq.lhs, x) - evalF(eq.rhs, x);
  let lo = 1e-6;
  let hi = 1e7;
  const flo = f(lo);
  const fhi = f(hi);
  if (!(Number.isFinite(flo) && Number.isFinite(fhi)) || Math.sign(flo) === Math.sign(fhi)) throw new Retry('no sign change');
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.sign(fm) === Math.sign(flo)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function exactShownValue(eq: Equation): number {
  if (eq.rhs.t === 'unk' && !hasUnk(eq.lhs)) return evalF(eq.lhs);
  return solveShown(eq);
}

export function buildApprox(rng: Rng, d: Difficulty): ApproxBuilt {
  const it = intended(rng, d);
  const rounded: Equation = { lhs: it.lhs, rhs: it.rhs };
  let key: Q;
  if (it.x) key = it.x;
  else {
    const v = evalF(it.lhs);
    need(Number.isInteger(Math.round(v * 1e6) / 1e6) && Math.abs(v - Math.round(v)) < 1e-9, 'approx key not integer');
    key = q(Math.round(v));
  }
  need(key.isInt() && key.n > 0, 'approx key');
  const K = key.toNumber();
  for (const shrink of [1, 1.5, 2.5, 4, 8]) {
    const c: PCtx = { rng, shrink, nonPerfect: !!it.nonPerfect, notes: [] };
    const shown: Equation = { lhs: perturb(it.lhs, c), rhs: perturb(it.rhs, c) };
    const exact = exactShownValue(shown);
    if (Math.abs(exact - K) / K <= 0.018) {
      return {
        shown,
        rounded,
        key,
        tags: it.tags,
        mistakes: [],
        roundings: c.notes,
        shortcut: it.shortcut,
        squareOptions: it.squareOptions,
      };
    }
  }
  throw new Retry('approximation drifted too far from the key');
}

/** Printed decimal text helper for notes. */
export function shownText(v: number): string {
  return plain(v, 2);
}
