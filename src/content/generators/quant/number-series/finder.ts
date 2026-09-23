/**
 * Pattern finder used by the generator to reject ambiguous series. A model is a recurrence whose equation for each
 * window of consecutive terms is LINEAR in its parameters θ: A·θ = B (A, B computed from the window's terms).
 * With one unknown term (the "?" or a suspected wrong term) the parameters are fitted on windows that avoid it,
 * then the unknown is solved from a window that contains it. A fit counts only if at least one equation is left
 * over as a genuine check.
 */

export interface Model {
  id: string;
  /** Window = terms i … i+order. */
  order: number;
  k: number;
  eq(i: number, w: number[]): { A: number[]; B: number };
}

const P = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];
const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 39916800, 479001600];

function models(): Model[] {
  const m: Model[] = [];
  const o1 = (id: string, k: number, f: (i: number, a: number, b: number) => { A: number[]; B: number }) => m.push({ id, order: 1, k, eq: (i, w) => f(i, w[0], w[1]) });
  o1('ap', 1, (_i, a, b) => ({ A: [1], B: b - a }));
  o1('gp', 1, (_i, a, b) => ({ A: [a], B: b }));
  o1('affine', 2, (_i, a, b) => ({ A: [a, 1], B: b }));
  o1('ap2', 2, (i, a, b) => ({ A: [1, i], B: b - a }));
  o1('ap3', 3, (i, a, b) => ({ A: [1, i, i * i], B: b - a }));
  o1('ap4', 4, (i, a, b) => ({ A: [1, i, i * i, i * i * i], B: b - a }));
  for (const q of [2, 3]) o1(`dgp${q}`, 2, (i, a, b) => ({ A: [1, q ** i], B: b - a }));
  for (let s = 0; s <= 12; s++)
    for (const g of [1, -1]) {
      o1(`dsq${s}${g}`, 1, (i, a, b) => ({ A: [1], B: b - a - g * (i + s) ** 2 }));
      if (s <= 8) o1(`dcube${s}${g}`, 1, (i, a, b) => ({ A: [1], B: b - a - g * (i + s) ** 3 }));
      if (s <= 6) o1(`dprime${s}${g}`, 0, (i, a, b) => ({ A: [], B: b - a - g * P[i + s] }));
      if (s <= 7) o1(`mulsq${s}${g}`, 1, (i, a, b) => ({ A: [a], B: b - g * (i + s) ** 2 }));
      if (s <= 5) o1(`mulcube${s}${g}`, 1, (i, a, b) => ({ A: [a], B: b - g * (i + s) ** 3 }));
    }
  for (let s = 1; s <= 4; s++) o1(`dfact${s}`, 0, (i, a, b) => ({ A: [], B: b - a - FACT[i + s] }));
  for (let s = 0; s <= 6; s++) o1(`mulapsq${s}`, 1, (i, a, b) => ({ A: [a], B: b - i * a - (i + s) ** 2 }));
  o1('mulap', 2, (i, a, b) => ({ A: [a, i * a], B: b }));
  o1('mulapc', 3, (i, a, b) => ({ A: [a, i * a, 1], B: b }));
  for (const g of [1, -1]) o1(`same${g}`, 2, (i, a, b) => ({ A: [a + g, i * (a + g)], B: b }));
  o1('mulk-ap', 3, (i, a, b) => ({ A: [a, 1, i], B: b }));
  o1('div', 2, (i, a, b) => ({ A: [b, i * b], B: a }));
  o1('alt-add', 2, (i, a, b) => ({ A: [i % 2 === 0 ? 1 : 0, i % 2], B: b - a }));
  o1('alt-mul', 2, (i, a, b) => ({ A: [i % 2 === 0 ? a : 0, i % 2 ? a : 0], B: b }));
  for (const ph of [0, 1]) o1(`alt-mix${ph}`, 2, (i, a, b) => ((i + ph) % 2 === 0 ? { A: [a, 0], B: b } : { A: [0, 1], B: b - a }));
  o1('alt-ap', 2, (i, a, b) => ({ A: [(-1) ** i, i * (-1) ** i], B: b - a }));
  m.push({ id: 'fib', order: 2, k: 1, eq: (_i, w) => ({ A: [1], B: w[2] - w[1] - w[0] }) });
  m.push({ id: 'fibw', order: 2, k: 2, eq: (_i, w) => ({ A: [w[1], w[0]], B: w[2] }) });
  m.push({ id: 'dmul', order: 2, k: 2, eq: (i, w) => ({ A: [w[1] - w[0], i * (w[1] - w[0])], B: w[2] - w[1] }) });
  m.push({ id: 'trib', order: 3, k: 1, eq: (_i, w) => ({ A: [1], B: w[3] - w[2] - w[1] - w[0] }) });
  return m;
}

export const MODELS = models();
const SUB_MODELS = MODELS.filter((x) => ['ap', 'gp', 'affine', 'ap2'].includes(x.id));

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));

/** Solve A·θ = B using the first independent rows (partial pivoting). Returns null if rank < k. */
function solve(rows: { A: number[]; B: number }[], k: number): number[] | null {
  if (k === 0) return [];
  const M = rows.map((r) => [...r.A, r.B]);
  const used: number[] = [];
  const pivRows: number[][] = [];
  for (let col = 0; col < k; col++) {
    let best = -1;
    let bestAbs = 1e-9;
    for (let r = 0; r < M.length; r++) {
      if (used.includes(r)) continue;
      const v = Math.abs(M[r][col]);
      const scale = Math.max(1, ...M[r].map(Math.abs));
      if (v / scale > bestAbs) {
        bestAbs = v / scale;
        best = r;
      }
    }
    if (best < 0) return null;
    used.push(best);
    const pr = M[best];
    for (let r = 0; r < M.length; r++) {
      if (r === best) continue;
      const f = M[r][col] / pr[col];
      if (f !== 0) for (let c = col; c <= k; c++) M[r][c] -= f * pr[c];
    }
    pivRows.push(pr);
  }
  // back-substitute: each pivot row now has a single non-zero among the columns
  const theta = new Array(k).fill(0);
  used.forEach((r, col) => {
    theta[col] = M[r][k] / M[r][col];
  });
  return theta;
}

const resid = (e: { A: number[]; B: number }, th: number[]) => e.A.reduce((s, a, j) => s + a * th[j], 0) - e.B;

export interface Fit {
  id: string;
  /** Value of the unknown term (null when there is no unknown). */
  value: number | null;
}

/** Fit one model to `seq` with at most one null. */
export function fitModel(model: Model, seq: (number | null)[]): Fit | null {
  const n = seq.length;
  const hole = seq.indexOf(null);
  const wins: number[] = [];
  for (let i = 0; i + model.order < n; i++) wins.push(i);
  const hits = (i: number) => hole >= i && hole <= i + model.order;
  const known = wins.filter((i) => hole < 0 || !hits(i));
  const holeW = hole < 0 ? [] : wins.filter(hits);
  const rows = known.map((i) => model.eq(i, seq.slice(i, i + model.order + 1) as number[]));
  const th = solve(rows, model.k);
  if (!th) return null;
  if (th.some((x) => !Number.isFinite(x))) return null;
  for (const r of rows) {
    const e = resid(r, th);
    if (!Number.isFinite(e) || (!close(e, 0) && Math.abs(e) > 1e-7 * Math.max(1, Math.abs(r.B)))) return null;
  }
  let checks = known.length - model.k;
  let value: number | null = null;
  if (hole >= 0) {
    for (const i of holeW) {
      const w = (x: number) => seq.slice(i, i + model.order + 1).map((t) => (t === null ? x : t)) as number[];
      const r0 = resid(model.eq(i, w(0)), th);
      const r1 = resid(model.eq(i, w(1)), th);
      if (value === null) {
        if (Math.abs(r1 - r0) < 1e-12) continue;
        value = -r0 / (r1 - r0);
        if (!Number.isFinite(value)) return null;
      } else {
        const r = resid(model.eq(i, w(value)), th);
        if (!Number.isFinite(r) || Math.abs(r) > 1e-7 * Math.max(1, Math.abs(value))) return null;
        checks++;
      }
    }
    if (value === null) return null;
  }
  if (checks < 1) return null;
  return { id: model.id, value };
}

function twinFits(seq: (number | null)[]): Fit[] {
  const parts = [0, 1].map((ph) => seq.filter((_, i) => i % 2 === ph));
  const res = parts.map((p) => SUB_MODELS.map((mm) => fitModel(mm, p)).filter((f): f is Fit => !!f));
  if (!res[0].length || !res[1].length) return [];
  const holePart = parts.findIndex((p) => p.includes(null));
  if (holePart < 0) return [{ id: 'twin', value: null }];
  return res[holePart].map((f) => ({ id: `twin-${f.id}`, value: f.value }));
}

/** Every model that fits the sequence (with at most one null). */
export function allFits(seq: (number | null)[]): Fit[] {
  const out: Fit[] = [];
  for (const mm of MODELS) {
    const f = fitModel(mm, seq);
    if (f) out.push(f);
  }
  if (seq.length >= 7) out.push(...twinFits(seq));
  return out;
}

export function sameValue(a: number, b: number): boolean {
  return close(a, b);
}
