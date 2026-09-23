/**
 * Question families over grid-like DI data (tables, bar/line charts, pie slices). Every family picks cells,
 * checks that the answer is clean for the difficulty, and returns the prompt, the facts descriptor, worked steps,
 * the exam shortcut and mistake-based distractors.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty } from '../../../types';
import type { Mistake } from '../../shared/options';
import { gcd, indian, isWhole, pct, roundTo } from '../../../../lib/format';
import { cellRef, sumRef, type Ask, type Fmt, type Ref } from './refs';
import { list, type Phraser } from './themes';

export interface VGrid {
  rows: string[];
  cols: string[];
  val(r: number, c: number): number;
  ref(r: number, c: number): Ref;
  ph: Phraser;
  /** Columns are time points (years/months/days) → "% increase from 2022 to 2023" along a row. */
  colsTime: boolean;
  /** Rows are time points (line charts) → "% increase from 2021 to 2022" down a column. */
  rowsTime: boolean;
  /** Summing across the columns of a row makes sense. */
  colsSummable: boolean;
  split: [string, string];
  /** Present tense ("are") for static data, past ("were") for sales-type data. */
  present: boolean;
  /** Name of a new entity for derived questions (an unused row label or the next time point). */
  newName: string | null;
  /** Summing every row is trivial (pie: it is the printed total) — sum only a few rows. */
  partialSums?: boolean;
}

export interface Term {
  v: number;
  ref: Ref;
  /** Phrase used in the question. */
  text: string;
  /** Short label for steps. */
  label: string;
  /** Working shown in steps, e.g. "340 + 280 = 620". */
  calc: string;
  cells: [number, number][];
}

export type Family = 'ratio' | 'pct-of' | 'pct-change' | 'average' | 'difference' | 'sum' | 'derived' | 'special';

export interface QB {
  family: Family;
  ask: Ask;
  prompt: string;
  fmt: Fmt | 'ratio';
  answer: number;
  parts?: [number, number];
  steps: string[];
  shortcut: string;
  mistakes: Mistake[];
  ratioAlt?: { parts: [number, number]; why: string }[];
  cells: [number, number][];
  tags: string[];
}

export const n = (v: number) => indian(v, 2);
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------------------ */
/* Terms                                                               */
/* ------------------------------------------------------------------ */

export function cell(g: VGrid, r: number, c: number): Term {
  const v = g.val(r, c);
  return { v, ref: g.ref(r, c), text: g.ph.cell(g.rows[r], g.cols[c]), label: g.ph.short(g.rows[r], g.cols[c]), calc: n(v), cells: [[r, c]] };
}

export function rowsSum(g: VGrid, rs: number[], c: number, all = false): Term {
  const vals = rs.map((r) => g.val(r, c));
  const v = vals.reduce((a, b) => a + b, 0);
  return {
    v,
    ref: sumRef(rs.map((r) => g.ref(r, c))),
    text: g.ph.rows(rs.map((r) => g.rows[r]), g.cols[c], all),
    label: all ? `total for ${g.cols.length > 1 ? g.cols[c] : 'all'}` : rs.map((r) => g.ph.short(g.rows[r], g.cols[c])).join(' + '),
    calc: `${vals.map(n).join(' + ')} = ${n(v)}`,
    cells: rs.map((r) => [r, c] as [number, number]),
  };
}

export function colsSum(g: VGrid, r: number, cs: number[], all = false): Term {
  const vals = cs.map((c) => g.val(r, c));
  const v = vals.reduce((a, b) => a + b, 0);
  return {
    v,
    ref: sumRef(cs.map((c) => g.ref(r, c))),
    text: g.ph.cols(g.rows[r], cs.map((c) => g.cols[c]), all),
    label: cs.map((c) => g.ph.short(g.rows[r], g.cols[c])).join(' + '),
    calc: `${vals.map(n).join(' + ')} = ${n(v)}`,
    cells: cs.map((c) => [r, c] as [number, number]),
  };
}

/** New entity p% more (p < 0: less) than term t in column c. */
function grown(g: VGrid, t: Term, c: number, p: number): { term: Term; sentence: string } | null {
  if (!g.newName) return null;
  const v = roundTo((t.v * (100 + p)) / 100, 9);
  const text = g.ph.cell(g.newName, g.cols[c]);
  const term: Term = {
    v,
    ref: { op: 'grow', x: t.ref, p },
    text,
    label: g.ph.short(g.newName, g.cols[c]),
    calc: `${100 + p}% of ${n(t.v)} = ${n(v)}`,
    cells: t.cells,
  };
  const sentence = `${cap(text)} ${g.present ? 'is' : 'was'} ${Math.abs(p)}% ${p > 0 ? 'more' : 'less'} than ${t.text}.`;
  return { term, sentence };
}

const stepOf = (t: Term) => `${cap(t.label)}: ${t.calc}`;

/* ------------------------------------------------------------------ */
/* Cleanliness                                                         */
/* ------------------------------------------------------------------ */

function safeRound(v: number): boolean {
  const x = v * 100;
  return Math.abs(x - Math.floor(x) - 0.5) > 1e-6;
}

export function pctOK(v: number, d: Difficulty): boolean {
  if (!(v > 0) || !Number.isFinite(v)) return false;
  if (d === 'easy') return isWhole(v);
  if (d === 'medium') return isWhole(v * 4) || isWhole(v * 3);
  return safeRound(v);
}

export function numOK(v: number, d: Difficulty): boolean {
  if (!(v > 0)) return false;
  if (d === 'easy') return isWhole(v);
  if (d === 'medium') return isWhole(v * 2);
  return isWhole(roundTo(v * 100, 6));
}

const RATIO_LIMIT: Record<Difficulty, number> = { easy: 30, medium: 60, hard: 150, extreme: 400 };

function reduced(a: number, b: number): [number, number] | null {
  if (!isWhole(a) || !isWhole(b) || a <= 0 || b <= 0) return null;
  const A = Math.round(a);
  const B = Math.round(b);
  const k = gcd(A, B);
  return [A / k, B / k];
}

/** Percentages that keep x·p/100 whole. */
function growPcts(rng: Rng, v: number, allowLess: boolean): number[] {
  const base = [5, 10, 15, 20, 25, 30, 40, 50, 60, 12.5, 35, 45];
  const all = allowLess ? [...base, -10, -20, -25, -15, -30, -40] : base;
  return rng.shuffle(all).filter((p) => isWhole((v * p) / 100));
}

/* ------------------------------------------------------------------ */
/* Selection helpers                                                   */
/* ------------------------------------------------------------------ */

function idx(k: number): number[] {
  return Array.from({ length: k }, (_, i) => i);
}

function twoTerms(rng: Rng, g: VGrid, d: Difficulty): { A: Term; B: Term; extra?: string } | null {
  const R = g.rows.length;
  const C = g.cols.length;
  const level = d === 'extreme' && !g.newName ? 'hard' : d;
  if (level === 'easy' || (C === 1 && level === 'medium' && rng.chance(0.5))) {
    const c = rng.int(0, C - 1);
    const [r1, r2] = rng.sample(idx(R), 2);
    return { A: cell(g, r1, c), B: cell(g, r2, c) };
  }
  if (level === 'medium') {
    if (rng.chance(0.5) && C > 1) {
      const a: [number, number] = [rng.int(0, R - 1), rng.int(0, C - 1)];
      let b: [number, number] = [rng.int(0, R - 1), rng.int(0, C - 1)];
      if (a[0] === b[0] && a[1] === b[1]) b = [(b[0] + 1) % R, b[1]];
      return { A: cell(g, a[0], a[1]), B: cell(g, b[0], b[1]) };
    }
    const c = rng.int(0, C - 1);
    const [r1, r2, r3] = rng.sample(idx(R), 3);
    const c2 = rng.int(0, C - 1);
    return rng.chance(0.5) ? { A: rowsSum(g, [r1, r2].sort(), c), B: cell(g, r3, c2) } : { A: cell(g, r3, c2), B: rowsSum(g, [r1, r2].sort(), c) };
  }
  if (level === 'hard') {
    if (R >= 4) {
      const [r1, r2, r3, r4] = rng.sample(idx(R), 4);
      const c1 = rng.int(0, C - 1);
      const c2 = rng.int(0, C - 1);
      return { A: rowsSum(g, [r1, r2].sort(), c1), B: rowsSum(g, [r3, r4].sort(), c2) };
    }
    return null;
  }
  // extreme: a derived entity against a sum
  const c = rng.int(0, C - 1);
  const [r1, r2, r3] = rng.sample(idx(R), 3);
  const base = cell(g, r1, c);
  const ps = growPcts(rng, base.v, true);
  if (!ps.length) return null;
  const gr = grown(g, base, c, ps[0]);
  if (!gr) return null;
  const c2 = rng.int(0, C - 1);
  return { A: gr.term, B: rowsSum(g, [r2, r3].sort(), c2), extra: gr.sentence };
}

/* ------------------------------------------------------------------ */
/* Families                                                            */
/* ------------------------------------------------------------------ */

function ratioQ(rng: Rng, g: VGrid, d: Difficulty): QB | null {
  for (let t = 0; t < 40; t++) {
    const pick = twoTerms(rng, g, d);
    if (!pick) continue;
    const { A, B, extra } = pick;
    const red = reduced(A.v, B.v);
    if (!red || red[0] === red[1] || Math.max(...red) > RATIO_LIMIT[d]) continue;
    const alts: { parts: [number, number]; why: string }[] = [{ parts: [red[1], red[0]], why: 'you write the ratio the other way round' }];
    // neighbouring cell read by mistake
    const [nr, nc] = B.cells[0];
    const nb = (nr + 1) % g.rows.length;
    const wrongB = reduced(A.v, B.v - g.val(nr, nc) + g.val(nb, nc));
    if (wrongB) alts.push({ parts: wrongB, why: `you read ${g.ph.short(g.rows[nb], g.cols[nc])} instead of ${g.ph.short(g.rows[nr], g.cols[nc])}` });
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [2, 1],
      [1, 2],
    ]) {
      const x = red[0] + dx;
      const y = red[1] + dy;
      if (x > 0 && y > 0) {
        const k = gcd(x, y);
        alts.push({ parts: [x / k, y / k], why: 'you slip while cancelling common factors' });
      }
    }
    const k = gcd(Math.round(A.v), Math.round(B.v));
    return {
      family: 'ratio',
      ask: { kind: 'ratio', a: A.ref, b: B.ref },
      prompt: `${extra ? extra + ' ' : ''}What is the ratio of ${A.text} to ${B.text}?`,
      fmt: 'ratio',
      answer: A.v / B.v,
      parts: red,
      steps: [stepOf(A), stepOf(B), `Required ratio = ${n(A.v)} : ${n(B.v)} = ${red[0]} : ${red[1]} (dividing both by ${k})`],
      shortcut: `Cancel the common factor (${k}) straight away instead of writing out the full numbers.`,
      mistakes: [],
      ratioAlt: alts,
      cells: [...A.cells, ...B.cells],
      tags: ['di:ratio'],
    };
  }
  return null;
}

function pctOfQ(rng: Rng, g: VGrid, d: Difficulty): QB | null {
  for (let t = 0; t < 40; t++) {
    const pick = twoTerms(rng, g, d);
    if (!pick) continue;
    const { A, B, extra } = pick;
    const v = (A.v / B.v) * 100;
    if (v < 5 || v > 400 || !pctOK(v, d)) continue;
    const red = reduced(A.v, B.v);
    return {
      family: 'pct-of',
      ask: { kind: 'pct-of', a: A.ref, b: B.ref },
      prompt: `${extra ? extra + ' ' : ''}${cap(A.text)} is what percent of ${B.text}?`,
      fmt: 'pct',
      answer: v,
      steps: [stepOf(A), stepOf(B), `Required percentage = ${n(A.v)} ÷ ${n(B.v)} × 100 = ${pct(v)}`],
      shortcut: red && red[1] <= 40 ? `Reduce first: ${n(A.v)} : ${n(B.v)} = ${red[0]} : ${red[1]}, and $\\frac{${red[0]}}{${red[1]}}$ = ${pct(v)}.` : 'Write it as a fraction and cancel before multiplying by 100.',
      mistakes: [
        { value: (B.v / A.v) * 100, why: 'you divide the other way round' },
        { value: (A.v / (A.v + B.v)) * 100, why: 'you divide by the total of the two numbers' },
        { value: (Math.abs(A.v - B.v) / B.v) * 100, why: 'you find the percentage difference instead' },
      ].filter((m) => m.value > 0 && m.value / v > 0.3 && m.value / v < 3),
      cells: [...A.cells, ...B.cells],
      tags: ['di:percent-of'],
    };
  }
  return null;
}

function stripTail(text: string, label: string): string {
  for (const s of [` in ${label}`, ` on ${label}`]) if (text.endsWith(s)) return text.slice(0, -s.length);
  return text;
}

function pctChangeQ(rng: Rng, g: VGrid, d: Difficulty): QB | null {
  const R = g.rows.length;
  const C = g.cols.length;
  for (let t = 0; t < 40; t++) {
    let from: Term;
    let to: Term;
    let prompt: string;
    let timeWise = true;
    if (g.colsTime && C >= 2) {
      const r = rng.int(0, R - 1);
      const [c1, c2] = rng.sample(idx(C), 2).sort((a, b) => a - b);
      from = cell(g, r, c1);
      to = cell(g, r, c2);
      const base = stripTail(to.text, g.cols[c2]);
      prompt = `What is the percentage ${to.v >= from.v ? 'increase' : 'decrease'} in ${base} from ${g.cols[c1]} to ${g.cols[c2]}?`;
    } else if (g.rowsTime) {
      const c = rng.int(0, C - 1);
      const [r1, r2] = rng.sample(idx(R), 2).sort((a, b) => a - b);
      from = cell(g, r1, c);
      to = cell(g, r2, c);
      const base = stripTail(to.text, g.rows[r2]);
      prompt = `What is the percentage ${to.v >= from.v ? 'increase' : 'decrease'} in ${base} from ${g.rows[r1]} to ${g.rows[r2]}?`;
    } else {
      timeWise = false;
      const pick = twoTerms(rng, g, d === 'extreme' ? 'hard' : d);
      if (!pick) continue;
      to = pick.A;
      from = pick.B;
      prompt = `By what percent is ${to.text} ${to.v >= from.v ? 'more' : 'less'} than ${from.text}?`;
    }
    const diff = Math.abs(to.v - from.v);
    const v = (diff / from.v) * 100;
    if (v < 1 || v > 200 || !pctOK(v, d)) continue;
    const up = to.v >= from.v;
    return {
      family: 'pct-change',
      ask: { kind: 'pct-change', from: from.ref, to: to.ref },
      prompt,
      fmt: 'pct',
      answer: v,
      steps: [stepOf(from), stepOf(to), `Change = ${n(Math.max(to.v, from.v))} − ${n(Math.min(to.v, from.v))} = ${n(diff)}`, `Percentage ${timeWise ? (up ? 'increase' : 'decrease') : up ? 'more' : 'less'} = ${n(diff)} ÷ ${n(from.v)} × 100 = ${pct(v)}`],
      shortcut: `The base is always the ${timeWise ? 'earlier (old) value' : 'value after "than"'}: change ÷ ${n(from.v)}.`,
      mistakes: [
        { value: (diff / to.v) * 100, why: `you divide by ${n(to.v)} instead of the base ${n(from.v)}` },
        { value: (to.v / from.v) * 100, why: 'you give the new value as a percentage of the old one instead of the change' },
        { value: (diff / (to.v + from.v)) * 100, why: 'you divide the change by the sum of both values' },
      ].filter((m) => m.value > 0 && m.value / v > 0.3 && m.value / v < 3),
      cells: [...from.cells, ...to.cells],
      tags: ['di:percent-change', 'trap:percent-base'],
    };
  }
  return null;
}

function averageQ(rng: Rng, g: VGrid, d: Difficulty): QB | null {
  const R = g.rows.length;
  const C = g.cols.length;
  for (let t = 0; t < 40; t++) {
    let items: Term[];
    let text: string;
    if (g.colsTime && C >= 3 && (d === 'hard' || d === 'extreme') && rng.chance(0.4)) {
      const r = rng.int(0, R - 1);
      const cs = rng.sample(idx(C), rng.int(3, C)).sort((a, b) => a - b);
      items = cs.map((c) => cell(g, r, c));
      text = g.ph.avgCols(g.rows[r], cs.map((c) => g.cols[c]));
    } else {
      const k = d === 'easy' ? 3 : d === 'medium' ? rng.int(3, Math.min(4, R)) : rng.int(Math.min(4, R), R);
      const c = rng.int(0, C - 1);
      const rs = rng.sample(idx(R), k).sort((a, b) => a - b);
      items = rs.map((r) => cell(g, r, c));
      text = g.ph.avgRows(rs.map((r) => g.rows[r]), g.cols[c]);
    }
    const k = items.length;
    const S = items.reduce((a, b) => a + b.v, 0);
    const v = S / k;
    if (!numOK(v, d)) continue;
    const fmt: Fmt = isWhole(v) ? 'int' : 'num';
    const base = Math.round(v / 10) * 10;
    const devs = items.map((i) => i.v - base);
    const last = items[items.length - 1];
    return {
      family: 'average',
      ask: { kind: 'average', items: items.map((i) => i.ref), fmt },
      prompt: `What is ${text}?`,
      fmt,
      answer: v,
      steps: [`Sum = ${items.map((i) => n(i.v)).join(' + ')} = ${n(S)}`, `Average = ${n(S)} ÷ ${k} = ${n(v)}`],
      shortcut: `Deviation method: take ${base} as the working average; deviations ${devs.map((x) => (x >= 0 ? `+${n(x)}` : `−${n(-x)}`)).join(', ')} add up to ${n(devs.reduce((a, b) => a + b, 0))}, so the average is ${base} ${devs.reduce((a, b) => a + b, 0) >= 0 ? '+' : '−'} ${n(Math.abs(devs.reduce((a, b) => a + b, 0)) / k)} = ${n(v)}.`,
      mistakes: [
        { value: S / (k - 1), why: `you divide by ${k - 1} instead of ${k}` },
        { value: S / (k + 1), why: `you divide by ${k + 1} instead of ${k}` },
        { value: (S - last.v) / k, why: `you leave out ${last.label} but still divide by ${k}` },
      ].filter((m) => (fmt === 'int' ? isWhole(m.value) : isWhole(roundTo(m.value * 100, 6)))),
      cells: items.flatMap((i) => i.cells),
      tags: ['di:average'],
    };
  }
  return null;
}

function differenceQ(rng: Rng, g: VGrid, d: Difficulty): QB | null {
  const R = g.rows.length;
  const C = g.cols.length;
  for (let t = 0; t < 40; t++) {
    let A: Term;
    let B: Term;
    let extra = '';
    if (d === 'hard' && g.colsSummable && C >= 2) {
      const [r1, r2] = rng.sample(idx(R), 2);
      A = colsSum(g, r1, idx(C), true);
      B = colsSum(g, r2, idx(C), true);
    } else {
      const pick = twoTerms(rng, g, d);
      if (!pick) continue;
      ({ A, B } = pick);
      extra = pick.extra ?? '';
    }
    const v = Math.abs(A.v - B.v);
    if (!(v > 0) || !isWhole(v)) continue;
    const [nr, nc] = B.cells[0];
    const nb = (nr + 1) % R;
    const wrong = Math.abs(A.v - (B.v - g.val(nr, nc) + g.val(nb, nc)));
    return {
      family: 'difference',
      ask: { kind: 'difference', a: A.ref, b: B.ref, fmt: 'int' },
      prompt: `${extra ? extra + ' ' : ''}What is the difference between ${A.text} and ${B.text}?`,
      fmt: 'int',
      answer: v,
      steps: [stepOf(A), stepOf(B), `Difference = ${n(Math.max(A.v, B.v))} − ${n(Math.min(A.v, B.v))} = ${n(v)}`],
      shortcut: 'Subtract column by column (or compare deviations) instead of adding everything up first.',
      mistakes: [
        { value: wrong, why: `you read ${g.ph.short(g.rows[nb], g.cols[nc])} instead of ${g.ph.short(g.rows[nr], g.cols[nc])}` },
        { value: A.v + B.v, why: 'you add the two quantities instead of subtracting' },
        { value: v + 10, why: 'you make a borrowing slip of 10 while subtracting' },
      ].filter((m) => m.value > 0 && m.value !== v && m.value / v < 3 && m.value / v > 0.3),
      cells: [...A.cells, ...B.cells],
      tags: ['di:difference'],
    };
  }
  return null;
}

function sumQ(rng: Rng, g: VGrid, d: Difficulty): QB | null {
  const R = g.rows.length;
  const C = g.cols.length;
  for (let t = 0; t < 20; t++) {
    let T: Term;
    let items: number[];
    if (d === 'easy' || g.partialSums) {
      const c = rng.int(0, C - 1);
      const rs = rng.sample(idx(R), d === 'easy' ? 3 : rng.int(2, 3)).sort((a, b) => a - b);
      T = rowsSum(g, rs, c);
      items = rs.map((r) => g.val(r, c));
    } else if ((d === 'hard' || d === 'extreme') && g.colsSummable && C >= 3 && rng.chance(0.5)) {
      const r = rng.int(0, R - 1);
      T = colsSum(g, r, idx(C), true);
      items = idx(C).map((c) => g.val(r, c));
    } else {
      const c = rng.int(0, C - 1);
      T = rowsSum(g, idx(R), c, true);
      items = idx(R).map((r) => g.val(r, c));
    }
    const S = T.v;
    const leftOut = items[items.length - 1];
    return {
      family: 'sum',
      ask: { kind: 'sum', items: T.ref.op === 'sum' ? T.ref.items : [T.ref], fmt: 'int' },
      prompt: `What is ${T.text}?`,
      fmt: 'int',
      answer: S,
      steps: [`Total = ${T.calc}`],
      shortcut: 'Add in pairs that make round numbers, or add the hundreds first and then the rest.',
      mistakes: [
        { value: S - leftOut, why: 'you leave out the last value' },
        { value: S - items[0] + items[items.length - 1], why: 'you count one value twice and miss another' },
        { value: S + 10, why: 'you make a carrying slip of 10 while adding' },
        { value: S - 10, why: 'you make a carrying slip of 10 while adding' },
      ].filter((m) => m.value > 0 && m.value !== S),
      cells: T.cells,
      tags: ['di:sum'],
    };
  }
  return null;
}

function derivedQ(rng: Rng, g: VGrid, d: Difficulty): QB | null {
  const R = g.rows.length;
  const C = g.cols.length;
  const were = g.present ? 'are' : 'were';
  for (let t = 0; t < 40; t++) {
    const variant = !g.newName ? 'split' : d === 'easy' || d === 'medium' ? rng.pick(['split', 'grow']) : rng.pick(['split', 'grow-ratio', 'grow']);
    const r = rng.int(0, R - 1);
    const c = rng.int(0, C - 1);
    const base = cell(g, r, c);
    if (variant === 'split') {
      const ps = rng.shuffle([10, 15, 20, 25, 30, 35, 40, 45, 55, 60, 65, 70, 75, 80, 12.5, 37.5]).filter((p) => isWhole((base.v * p) / 100));
      if (!ps.length) continue;
      const p = ps[0];
      const askRest = rng.chance(0.7);
      const share = askRest ? 100 - p : p;
      const v = (base.v * share) / 100;
      const [part, rest] = g.split;
      const ofPhrase = base.text.replace(/^the number of /, 'the ');
      return {
        family: 'derived',
        ask: { kind: 'value', x: { op: 'pctof', p: { op: 'const', v: share }, x: base.ref }, fmt: 'int' },
        prompt: `Of ${ofPhrase}, ${p}% ${were} ${part}. How many of them ${were} ${askRest ? rest : part}?`,
        fmt: 'int',
        answer: v,
        steps: [stepOf(base), ...(askRest ? [`${cap(rest)} = 100% − ${p}% = ${share}%`] : []), `${share}% of ${n(base.v)} = ${n(v)}`],
        shortcut: askRest ? `Go straight to the remaining ${share}% instead of finding ${p}% and subtracting.` : `${p}% of ${n(base.v)} in one step.`,
        mistakes: [
          { value: (base.v * (100 - share)) / 100, why: `you find the ${askRest ? part : rest} instead of the ${askRest ? rest : part}` },
          { value: base.v - share, why: `you subtract ${share} instead of taking ${share}%` },
          { value: v + 10, why: 'you make a slip of 10 in the multiplication' },
        ].filter((m) => m.value > 0 && isWhole(m.value) && m.value !== v),
        cells: base.cells,
        tags: ['di:derived', 'di:sub-split'],
      };
    }
    const ps = growPcts(rng, base.v, true);
    if (!ps.length) continue;
    const p = ps[0];
    const gr = grown(g, base, c, p);
    if (!gr) continue;
    const X = gr.term;
    if (variant === 'grow') {
      return {
        family: 'derived',
        ask: { kind: 'value', x: X.ref, fmt: 'int' },
        prompt: `${gr.sentence} What is ${X.text}?`,
        fmt: 'int',
        answer: X.v,
        steps: [stepOf(base), `${cap(X.label)} = ${X.calc}`],
        shortcut: `${Math.abs(p)}% ${p > 0 ? 'more' : 'less'} means × ${(100 + p) / 100}: ${n(base.v)} × ${(100 + p) / 100} = ${n(X.v)}.`,
        mistakes: [
          { value: (base.v * (100 - p)) / 100, why: `you take ${Math.abs(p)}% ${p > 0 ? 'less' : 'more'} instead of ${p > 0 ? 'more' : 'less'}` },
          { value: base.v + p, why: `you add ${p} instead of ${p}%` },
          { value: (base.v * Math.abs(p)) / 100, why: `you give only the ${Math.abs(p)}% part` },
        ].filter((m) => m.value > 0 && isWhole(m.value) && m.value !== X.v && m.value / X.v > 0.3),
        cells: base.cells,
        tags: ['di:derived', 'di:new-entity'],
      };
    }
    // grow-ratio: new entity against another cell
    const r2 = (r + rng.int(1, R - 1)) % R;
    const c2 = rng.int(0, C - 1);
    const B = cell(g, r2, c2);
    const red = reduced(X.v, B.v);
    if (!red || red[0] === red[1] || Math.max(...red) > RATIO_LIMIT[d]) continue;
    const k = gcd(Math.round(X.v), Math.round(B.v));
    const alts: { parts: [number, number]; why: string }[] = [{ parts: [red[1], red[0]], why: 'you write the ratio the other way round' }];
    const plain0 = reduced(base.v, B.v);
    if (plain0) alts.push({ parts: plain0, why: `you forget to increase ${base.label} by ${p}%` });
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ]) {
      const x = red[0] + dx;
      const y = red[1] + dy;
      const kk = gcd(x, y);
      alts.push({ parts: [x / kk, y / kk], why: 'you slip while cancelling common factors' });
    }
    return {
      family: 'derived',
      ask: { kind: 'ratio', a: X.ref, b: B.ref },
      prompt: `${gr.sentence} What is the ratio of ${X.text} to ${B.text}?`,
      fmt: 'ratio',
      answer: X.v / B.v,
      parts: red,
      steps: [stepOf(base), `${cap(X.label)} = ${X.calc}`, stepOf(B), `Required ratio = ${n(X.v)} : ${n(B.v)} = ${red[0]} : ${red[1]} (dividing both by ${k})`],
      shortcut: `Keep the factor: ${n(base.v)} × ${(100 + p) / 100} : ${n(B.v)}, then cancel.`,
      mistakes: [],
      ratioAlt: alts,
      cells: [...base.cells, ...B.cells],
      tags: ['di:derived', 'di:new-entity', 'di:ratio'],
    };
  }
  return null;
}

export const FAMILIES: Record<Exclude<Family, 'special'>, (rng: Rng, g: VGrid, d: Difficulty) => QB | null> = {
  ratio: ratioQ,
  'pct-of': pctOfQ,
  'pct-change': pctChangeQ,
  average: averageQ,
  difference: differenceQ,
  sum: sumQ,
  derived: derivedQ,
};

/**
 * Five questions (or `count`) over a grid: always one derived-entity / sub-split question (seen in every
 * 2024–26 set), the rest from distinct families. Returns null when the data cannot support a clean set.
 */
export function gridQuestions(rng: Rng, g: VGrid, d: Difficulty, count: number, special: (() => QB | null)[] = []): QB[] | null {
  const others = rng.shuffle(['ratio', 'pct-of', 'pct-change', 'average', 'difference', 'sum'] as const);
  const out: QB[] = [];
  const seen = new Set<string>();
  const add = (q: QB | null) => {
    if (!q || seen.has(q.prompt) || out.length >= count) return;
    seen.add(q.prompt);
    out.push(q);
  };
  add(derivedQ(rng, g, d));
  for (const s of special) add(s());
  for (const f of others) {
    if (out.length >= count) break;
    add(FAMILIES[f](rng, g, d));
  }
  if (out.length < count) return null;
  // derived question somewhere in the middle, as in papers
  const [first, ...rest] = out;
  const pos = rng.int(1, Math.min(3, rest.length));
  rest.splice(pos, 0, first);
  return rest;
}

export { list, cellRef };
