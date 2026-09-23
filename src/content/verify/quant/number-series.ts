/**
 * Independent verifier for quant.number-series: a pattern finder over the printed series using EXACT rational
 * arithmetic (BigInt).
 *
 * Catalogue (re-implemented here): constant difference / ratio, ×k ± c, differences in AP (quadratic), cubic and
 * quartic difference patterns, differences in GP (+ constant), ± consecutive squares / cubes (+ constant),
 * consecutive primes, factorials, increasing multipliers (with or without a constant, ×n ± n, ×n + n², ×k ± n²/n³),
 * ×k + (a + b·n), division by an AP of divisors, alternating additions / multiplications / mixed operations,
 * alternating-sign growing differences, sum of previous two (+ c), weighted two-term recurrences, differences
 * multiplied by an AP of factors, sum of previous three (+ c), and two interleaved series.
 *
 * - Missing number: every pattern that fits the printed terms predicts the blank; exactly one option may be
 *   predicted (by any pattern).
 * - Wrong number: the printed series must fit no pattern, and exactly one option position can be replaced so that
 *   some pattern fits.
 * A fit needs at least one equation left over as a check after its parameters (and the unknown) are determined.
 */
import type { GenResult } from '../../generators/types';
import type { NumberSeriesFacts } from '../../generators/quant/number-series';

/* ---------------------------- rationals ---------------------------- */

interface R {
  n: bigint;
  d: bigint;
}
const gcdB = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};
function r(n: bigint, d = 1n): R {
  if (d === 0n) throw new Error('zero denominator');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcdB(n, d) || 1n;
  return { n: n / g, d: d / g };
}
const ZERO = r(0n);
const ONE = r(1n);
const add = (a: R, b: R) => r(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: R, b: R) => r(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: R, b: R) => r(a.n * b.n, a.d * b.d);
const div = (a: R, b: R) => r(a.n * b.d, a.d * b.n);
const isZero = (a: R) => a.n === 0n;
const eq = (a: R, b: R) => a.n === b.n && a.d === b.d;
const I = (x: number) => r(BigInt(x));
const neg = (a: R) => r(-a.n, a.d);

function parseTerm(s: string): R {
  const t = s.trim();
  const [i, f = ''] = t.split('.');
  if (!/^\d+$/.test(i) || !/^\d*$/.test(f)) throw new Error(`verifier: bad term "${s}"`);
  return r(BigInt(i + f), 10n ** BigInt(f.length));
}

/* ------------------------------ models ----------------------------- */

/** One equation row: Σ coef[j]·θ[j] = rhs for the window starting at index i. */
type Row = { coef: R[]; rhs: R };
interface Pattern {
  name: string;
  span: number; // number of terms in a window
  params: number;
  row(i: number, w: R[]): Row;
}

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];
const FACTORIAL = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 39916800, 479001600];
const pw = (b: number, e: number) => I(b ** e);

function catalogue(): Pattern[] {
  const P: Pattern[] = [];
  const two = (name: string, params: number, row: (i: number, a: R, b: R) => Row) => P.push({ name, span: 2, params, row: (i, w) => row(i, w[0], w[1]) });
  // differences
  two('constant difference', 1, (_i, a, b) => ({ coef: [ONE], rhs: sub(b, a) }));
  two('differences in AP', 2, (i, a, b) => ({ coef: [ONE, I(i)], rhs: sub(b, a) }));
  two('quadratic differences', 3, (i, a, b) => ({ coef: [ONE, I(i), I(i * i)], rhs: sub(b, a) }));
  two('cubic differences', 4, (i, a, b) => ({ coef: [ONE, I(i), I(i * i), I(i * i * i)], rhs: sub(b, a) }));
  for (const q of [2, 3]) two(`differences ${q}^n + c`, 2, (i, a, b) => ({ coef: [ONE, pw(q, i)], rhs: sub(b, a) }));
  for (let s = 0; s <= 12; s++) {
    for (const sign of [1, -1]) {
      two(`± squares from ${s}`, 1, (i, a, b) => ({ coef: [ONE], rhs: sub(sub(b, a), I(sign * (i + s) ** 2)) }));
      if (s <= 8) two(`± cubes from ${s}`, 1, (i, a, b) => ({ coef: [ONE], rhs: sub(sub(b, a), I(sign * (i + s) ** 3)) }));
      if (s <= 6) two(`± primes from ${s}`, 0, (i, a, b) => ({ coef: [], rhs: sub(sub(b, a), I(sign * PRIMES[i + s])) }));
      if (s <= 7) two(`×k ± squares from ${s}`, 1, (i, a, b) => ({ coef: [a], rhs: sub(b, I(sign * (i + s) ** 2)) }));
      if (s <= 5) two(`×k ± cubes from ${s}`, 1, (i, a, b) => ({ coef: [a], rhs: sub(b, I(sign * (i + s) ** 3)) }));
    }
  }
  for (let s = 1; s <= 4; s++) two(`factorial differences from ${s}`, 0, (i, a, b) => ({ coef: [], rhs: sub(sub(b, a), I(FACTORIAL[i + s])) }));
  for (let s = 0; s <= 6; s++) two(`×(k+n) + (n+${s})²`, 1, (i, a, b) => ({ coef: [a], rhs: sub(sub(b, mul(I(i), a)), I((i + s) ** 2)) }));
  // multiplicative
  two('constant ratio', 1, (_i, a, b) => ({ coef: [a], rhs: b }));
  two('×k + c', 2, (_i, a, b) => ({ coef: [a, ONE], rhs: b }));
  two('increasing multipliers', 2, (i, a, b) => ({ coef: [a, mul(I(i), a)], rhs: b }));
  two('increasing multipliers + c', 3, (i, a, b) => ({ coef: [a, mul(I(i), a), ONE], rhs: b }));
  for (const sign of [1, -1]) two(`×n ${sign > 0 ? '+' : '−'} n`, 2, (i, a, b) => ({ coef: [add(a, I(sign)), mul(I(i), add(a, I(sign)))], rhs: b }));
  two('×k + AP', 3, (i, a, b) => ({ coef: [a, ONE, I(i)], rhs: b }));
  two('÷ AP of divisors', 2, (i, a, b) => ({ coef: [b, mul(I(i), b)], rhs: a }));
  // alternating
  two('alternating additions', 2, (i, a, b) => ({ coef: [I(i % 2 === 0 ? 1 : 0), I(i % 2)], rhs: sub(b, a) }));
  two('alternating multipliers', 2, (i, a, b) => ({ coef: [i % 2 === 0 ? a : ZERO, i % 2 ? a : ZERO], rhs: b }));
  for (const ph of [0, 1]) two(`alternate × and + (phase ${ph})`, 2, (i, a, b) => ((i + ph) % 2 === 0 ? { coef: [a, ZERO], rhs: b } : { coef: [ZERO, ONE], rhs: sub(b, a) }));
  two('alternating-sign AP differences', 2, (i, a, b) => ({ coef: [I((-1) ** i), I(i * (-1) ** i)], rhs: sub(b, a) }));
  // longer windows
  P.push({ name: 'sum of previous two + c', span: 3, params: 1, row: (_i, w) => ({ coef: [ONE], rhs: sub(sub(w[2], w[1]), w[0]) }) });
  P.push({ name: 'weighted previous two', span: 3, params: 2, row: (_i, w) => ({ coef: [w[1], w[0]], rhs: w[2] }) });
  P.push({ name: 'differences × AP', span: 3, params: 2, row: (i, w) => ({ coef: [sub(w[1], w[0]), mul(I(i), sub(w[1], w[0]))], rhs: sub(w[2], w[1]) }) });
  P.push({ name: 'sum of previous three + c', span: 4, params: 1, row: (_i, w) => ({ coef: [ONE], rhs: sub(sub(sub(w[3], w[2]), w[1]), w[0]) }) });
  return P;
}

const PATTERNS = catalogue();
const PART_PATTERNS = PATTERNS.filter((p) => ['constant difference', 'constant ratio', '×k + c', 'differences in AP'].includes(p.name));

/** Exact Gauss–Jordan on the given rows; returns θ when the rows determine it uniquely. */
function determine(rows: Row[], k: number): R[] | null {
  if (k === 0) return [];
  const M = rows.map((x) => [...x.coef, x.rhs]);
  const pivotOf: number[] = [];
  const taken = new Set<number>();
  for (let col = 0; col < k; col++) {
    const pr = M.findIndex((row, idx) => !taken.has(idx) && !isZero(row[col]));
    if (pr < 0) return null;
    taken.add(pr);
    pivotOf[col] = pr;
    const p = M[pr][col];
    for (let c = 0; c <= k; c++) M[pr][c] = div(M[pr][c], p);
    M.forEach((row, idx) => {
      if (idx === pr || isZero(row[col])) return;
      const f = row[col];
      for (let c = 0; c <= k; c++) row[c] = sub(row[c], mul(f, M[pr][c]));
    });
  }
  return pivotOf.map((pr) => M[pr][k]);
}

const residual = (row: Row, th: R[]) => sub(row.coef.reduce((s, c, j) => add(s, mul(c, th[j])), ZERO), row.rhs);

/** Value(s) the unknown takes under pattern p; [] if p does not fit (or leaves no check). null entry = no unknown. */
function fitPattern(p: Pattern, seq: (R | null)[]): (R | null)[] {
  const n = seq.length;
  const hole = seq.findIndex((x) => x === null);
  const starts = Array.from({ length: Math.max(0, n - p.span + 1) }, (_, i) => i);
  const touches = (i: number) => hole >= i && hole < i + p.span;
  const clean = starts.filter((i) => hole < 0 || !touches(i));
  const dirty = hole < 0 ? [] : starts.filter(touches);
  const rows = clean.map((i) => p.row(i, seq.slice(i, i + p.span) as R[]));
  const th = determine(rows, p.params);
  if (!th) return [];
  if (rows.some((row) => !isZero(residual(row, th)))) return [];
  let spare = clean.length - p.params;
  let x: R | null = null;
  for (const i of dirty) {
    const win = (v: R) => seq.slice(i, i + p.span).map((t) => t ?? v);
    if (x === null) {
      const at0 = residual(p.row(i, win(ZERO)), th);
      const at1 = residual(p.row(i, win(ONE)), th);
      const slope = sub(at1, at0);
      if (isZero(slope)) continue;
      x = div(neg(at0), slope);
    } else {
      if (!isZero(residual(p.row(i, win(x)), th))) return [];
      spare++;
    }
  }
  if (hole >= 0 && x === null) return [];
  return spare >= 1 ? [x] : [];
}

function interleaved(seq: (R | null)[]): (R | null)[] {
  if (seq.length < 7) return [];
  const halves = [seq.filter((_, i) => i % 2 === 0), seq.filter((_, i) => i % 2 === 1)];
  const fits = halves.map((h) => PART_PATTERNS.flatMap((p) => fitPattern(p, h)));
  if (!fits[0].length || !fits[1].length) return [];
  const withHole = halves.findIndex((h) => h.includes(null));
  return withHole < 0 ? [null] : fits[withHole];
}

function predictions(seq: (R | null)[]): (R | null)[] {
  return [...PATTERNS.flatMap((p) => fitPattern(p, seq)), ...interleaved(seq)];
}

/* ----------------------------- verify ------------------------------ */

export function verify(res: GenResult<NumberSeriesFacts>): (number | string)[] {
  return res.item.questions.map((q) => {
    const body = q.prompt.split('\n\n').pop() ?? '';
    const seq = body.split(',').map((s) => (s.trim() === '?' ? null : parseTerm(s)));
    const facts = res.facts.shown;
    if (facts.length !== seq.length || facts.some((v, i) => (v === null) !== (seq[i] === null) || (v !== null && Number(seq[i]!.n) / Number(seq[i]!.d) !== v))) {
      throw new Error('verifier: facts disagree with the printed series');
    }
    const options = q.options.map(parseTerm);
    if (seq.includes(null)) {
      const preds = predictions(seq).filter((x): x is R => x !== null);
      if (!preds.length) throw new Error('verifier: no pattern explains the series');
      const hit = options.map((o, i) => (preds.some((p) => eq(p, o)) ? i : -1)).filter((i) => i >= 0);
      if (hit.length !== 1) throw new Error(`verifier: ${hit.length} options are explained by some pattern`);
      return hit[0];
    }
    if (predictions(seq).length) throw new Error('verifier: the printed series already follows a pattern');
    const full = seq as R[];
    const candidates = options
      .map((o, k) => {
        const pos = full.map((t, i) => (eq(t, o) ? i : -1)).filter((i) => i >= 0);
        if (pos.length !== 1) throw new Error('verifier: option is not a unique printed term');
        const repaired = predictions(full.map((t, i) => (i === pos[0] ? null : t)));
        return repaired.some((x) => x !== null && !eq(x, o)) ? k : -1;
      })
      .filter((k) => k >= 0);
    if (candidates.length !== 1) throw new Error(`verifier: ${candidates.length} options could be the wrong number`);
    return candidates[0];
  });
}
