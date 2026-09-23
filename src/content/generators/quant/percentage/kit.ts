/**
 * Chapter kit — a self-contained copy lives in each quant chapter folder (percentage, profit-loss,
 * ratio-proportion, ages, averages, partnership, mixtures) so chapters never import each other.
 *
 * Names and pronouns, exact fractions, exact percentage formatting, ratio options with a uniform
 * correct rank, and the `emit` helpers that turn a built-backward question into a GenResult.
 */
import type { Rng } from '../../../../lib/rng';
import type { BuildContext, GenResult } from '../../types';
import type { VisualSpec } from '../../../types';
import { makeQuestion, single } from '../../shared/question';
import { numericChoices, type Mistake } from '../../shared/options';
import { targetSeconds } from '../../../targets';
import { gcd, indian, isWhole, mixedTex, plain, ratio } from '../../../../lib/format';

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

export type G = 'm' | 'f';
export interface Person {
  name: string;
  g: G;
}

const MALE = [
  'Aarav', 'Rohan', 'Vikram', 'Arjun', 'Karthik', 'Suresh', 'Ramesh', 'Manoj', 'Imran', 'Farhan',
  'Gurpreet', 'Anil', 'Sanjay', 'Deepak', 'Rahul', 'Nikhil', 'Pranav', 'Siddharth', 'Abhishek', 'Mohan',
  'Venkat', 'Srinivas', 'Ravi', 'Tenzing', 'Joseph', 'Arnab', 'Sourav', 'Bhavesh', 'Jignesh', 'Rajesh',
  'Mahesh', 'Naveen', 'Prakash', 'Salim', 'Omkar', 'Vinay', 'Sunil', 'Ajay', 'Tarun', 'Kunal',
  'Harish', 'Dinesh', 'Gopal', 'Lalit', 'Yusuf', 'Ashok', 'Biju', 'Hemant', 'Jatin', 'Wasim',
];
const FEMALE = [
  'Priya', 'Ananya', 'Kavya', 'Sneha', 'Pooja', 'Meera', 'Lakshmi', 'Divya', 'Nandini', 'Fatima',
  'Ayesha', 'Simran', 'Harleen', 'Deepa', 'Anjali', 'Shreya', 'Radhika', 'Sunita', 'Rekha', 'Geeta',
  'Asha', 'Neha', 'Ritu', 'Swati', 'Aparna', 'Bhavna', 'Mary', 'Rupali', 'Moumita', 'Kavitha',
  'Revathi', 'Tanvi', 'Isha', 'Jyoti', 'Manpreet', 'Zoya', 'Nisha', 'Uma', 'Sangeeta', 'Pallavi',
  'Shalini', 'Farah', 'Lalita', 'Bindu', 'Rashmi', 'Komal', 'Megha', 'Preeti', 'Sushma', 'Yamini',
];

/** n distinct people with distinct initials; genders random unless given. */
export function pickPeople(rng: Rng, n: number, genders?: readonly (G | undefined)[]): Person[] {
  const out: Person[] = [];
  for (let i = 0; i < n; i++) {
    const g: G = genders?.[i] ?? (rng.chance(0.5) ? 'm' : 'f');
    const pool = (g === 'm' ? MALE : FEMALE).filter((x) => !out.some((p) => p.name[0] === x[0]));
    out.push({ name: rng.pick(pool), g });
  }
  return out;
}

export const he = (p: Person): string => (p.g === 'm' ? 'he' : 'she');
export const He = (p: Person): string => (p.g === 'm' ? 'He' : 'She');
export const his = (p: Person): string => (p.g === 'm' ? 'his' : 'her');
export const him = (p: Person): string => (p.g === 'm' ? 'him' : 'her');

/* ------------------------------------------------------------------ */
/* Exact fractions (small integers only)                               */
/* ------------------------------------------------------------------ */

export type Fr = readonly [number, number];

export function fr(n: number, d = 1): Fr {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) throw new Error(`fr: bad ${n}/${d}`);
  const g = gcd(n, d) || 1;
  const s = d < 0 ? -1 : 1;
  return [(s * n) / g, (s * d) / g];
}
export const fadd = (a: Fr, b: Fr): Fr => fr(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
export const fsub = (a: Fr, b: Fr): Fr => fr(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
export const fmul = (a: Fr, b: Fr): Fr => fr(a[0] * b[0], a[1] * b[1]);
export const fdiv = (a: Fr, b: Fr): Fr => fr(a[0] * b[1], a[1] * b[0]);
export const fval = (a: Fr): number => a[0] / a[1];
export const fabs = (a: Fr): Fr => [Math.abs(a[0]), a[1]];
export const fisInt = (a: Fr): boolean => a[1] === 1;
export const feq = (a: Fr, b: Fr): boolean => a[0] === b[0] && a[1] === b[1];
/** Least common multiple of several positive integers. */
export function lcmAll(xs: readonly number[]): number {
  return xs.reduce((acc, x) => (acc * x) / (gcd(acc, x) || 1), 1);
}
/** n × a computed as (n × num) / den, which is exact whenever the result is whole. */
export const scale = (n: number, a: Fr): number => (n * a[0]) / a[1];
/** Percentage p (as a fraction) → multiplying factor (100 + p)/100. Negative p = decrease. */
export const factor = (p: Fr): Fr => fr(100 * p[1] + p[0], 100 * p[1]);
/** Fraction → percentage fraction (×100). */
export const toPct = (a: Fr): Fr => fr(a[0] * 100, a[1]);

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** Denominator (≤ 400) that makes v whole, or 0. Tolerant of the 6-dp rounding numericChoices applies to fillers. */
export function denomOf(v: number): number {
  for (let q = 1; q <= 400; q++) {
    const p = v * q;
    if (Math.abs(p - Math.round(p)) < 1e-5 * q) return q;
  }
  return 0;
}

/**
 * Exact number: terminating (≤ 2 dp) → "12.5"; otherwise a KaTeX mixed fraction "$16\frac{2}{3}$".
 * Values with no small denominator (only ever distractors) fall back to 2 dp; the verifiers compare
 * options by exact value, so a rounded distractor can never be mistaken for the key.
 */
export function fmtExact(v: number, group = true): string {
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (isWhole(a * 100, 1e-9)) return sign + (group ? indian(a, 2) : plain(a, 2));
  const q = denomOf(a);
  if (!q) return sign + (group ? indian(a, 2) : plain(a, 2));
  const m = mixedTex(Math.round(a * q), q);
  return sign ? `$-${m.slice(1)}` : m;
}

/** Exact percentage: "12.5%" or "$16\frac{2}{3}$%". */
export function fmtPct(v: number): string {
  return `${fmtExact(v, false)}%`;
}

/** Percentage from a fraction (used for stated inputs). */
export const pctF = (p: Fr): string => fmtPct(fval(p));

/** Quantity with a unit: qty(12.5, 'litre') → "12.5 litres" (singular for exactly 1). */
export function qty(v: number, unit: string, plural = `${unit}s`): string {
  return `${fmtExact(v)} ${v === 1 ? unit : plural}`;
}

/** Rupees with Indian grouping (paise shown only when present). */
export function rs(v: number): string {
  return (v < 0 ? '-' : '') + `₹${indian(Math.abs(v), 2)}`;
}

/** "a, b and c". */
export function listAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Fraction as KaTeX (for steps): 3/4 → "$\frac{3}{4}$", 5 → "5". */
export function texFr(a: Fr): string {
  if (a[1] === 1) return String(a[0]);
  return a[0] < 0 ? `$-\\frac{${-a[0]}}{${a[1]}}$` : `$\\frac{${a[0]}}{${a[1]}}$`;
}

/** Inline TeX for a fraction inside an existing $…$ segment. */
export function tfr(a: Fr): string {
  if (a[1] === 1) return String(a[0]);
  return a[0] < 0 ? `-\\frac{${-a[0]}}{${a[1]}}` : `\\frac{${a[0]}}{${a[1]}}`;
}

/* ------------------------------------------------------------------ */
/* Ratio options                                                       */
/* ------------------------------------------------------------------ */

export function reduceParts(parts: readonly number[]): number[] {
  const g = parts.reduce((acc, x) => gcd(acc, x), 0) || 1;
  return parts.map((x) => x / g);
}

const ratioKey = (parts: readonly number[]): string => reduceParts(parts).join(':');

/** Sort value of a ratio: share of the first term, then of the second (works for 2- and 3-part ratios). */
function ratioSortValue(parts: readonly number[]): [number, number] {
  const s = parts.reduce((a, b) => a + b, 0);
  return [parts[0] / s, (parts[1] ?? 0) / s];
}
function ratioCmp(a: readonly number[], b: readonly number[]): number {
  const [a0, a1] = ratioSortValue(a);
  const [b0, b1] = ratioSortValue(b);
  if (Math.abs(a0 - b0) > 1e-12) return a0 - b0;
  return a1 - b1;
}

export interface RatioMistake {
  parts: number[];
  why: string;
  trap?: string;
}

export interface RatioChoices {
  options: string[];
  answerIndex: number;
  used: RatioMistake[];
}

/**
 * Ratio options ("3 : 4"), sorted by the first term's share, correct rank uniform over A–E.
 * Mistake ratios first; nearby fillers complete whichever side needs more.
 */
export function ratioChoices(rng: Rng, correct: readonly number[], mistakes: readonly RatioMistake[]): RatioChoices {
  const answer = reduceParts(correct);
  if (answer.some((x) => !(x > 0) || !Number.isInteger(x))) throw new Error(`ratioChoices: bad answer ${answer}`);
  const ansKey = ratioKey(answer);
  const valid = (p: readonly number[]) => p.length === answer.length && p.every((x) => Number.isInteger(x) && x > 0);
  const seen = new Set([ansKey]);
  const below: RatioMistake[] = [];
  const above: RatioMistake[] = [];
  for (const m of mistakes) {
    if (!valid(m.parts)) continue;
    const k = ratioKey(m.parts);
    if (seen.has(k)) continue;
    seen.add(k);
    const c = ratioCmp(m.parts, answer);
    if (c === 0) continue;
    (c < 0 ? below : above).push({ ...m, parts: reduceParts(m.parts) });
  }
  // Fillers: small perturbations of the answer (and of the reversed answer for 2-part ratios).
  const fillers: number[][] = [];
  const n = answer.length;
  for (let d = 1; d <= 6; d++) {
    for (let i = 0; i < n; i++) {
      for (const s of [1, -1]) {
        const p = answer.slice();
        p[i] += s * d;
        if (valid(p)) fillers.push(p);
      }
    }
  }
  if (n === 3) {
    for (const perm of [[0, 2, 1], [1, 0, 2], [2, 1, 0], [1, 2, 0], [2, 0, 1]]) fillers.push(perm.map((j) => answer[j]));
  }
  const fillBelow: number[][] = [];
  const fillAbove: number[][] = [];
  for (const f of rng.shuffle(fillers)) {
    const k = ratioKey(f);
    if (seen.has(k)) continue;
    seen.add(k);
    const c = ratioCmp(f, answer);
    if (c === 0) continue;
    (c < 0 ? fillBelow : fillAbove).push(reduceParts(f));
  }
  // Prefer fillers close to the answer.
  const dist = (p: number[]) => Math.abs(ratioSortValue(p)[0] - ratioSortValue(answer)[0]);
  fillBelow.sort((a, b) => dist(a) - dist(b));
  fillAbove.sort((a, b) => dist(a) - dist(b));

  const first = rng.int(0, 4);
  const ranks = [first, ...rng.shuffle([0, 1, 2, 3, 4].filter((r) => r !== first))];
  for (const rank of ranks) {
    const needB = rank;
    const needA = 4 - rank;
    const usedB = below.slice(0, needB);
    const usedA = above.slice(0, needA);
    const fb = fillBelow.slice(0, needB - usedB.length);
    const fa = fillAbove.slice(0, needA - usedA.length);
    if (usedB.length + fb.length < needB || usedA.length + fa.length < needA) continue;
    const all = [answer, ...usedB.map((m) => m.parts), ...fb, ...usedA.map((m) => m.parts), ...fa].sort(ratioCmp);
    const options = all.map((p) => ratio(...p));
    const answerIndex = all.findIndex((p) => ratioKey(p) === ansKey);
    return { options, answerIndex, used: [...usedB, ...usedA] };
  }
  throw new Error(`ratioChoices: could not build options around ${ansKey}`);
}

/* ------------------------------------------------------------------ */
/* Emit                                                                */
/* ------------------------------------------------------------------ */

export interface Mist extends Mistake {
  /** Full trap sentence shown when this distractor is among the options. */
  trap?: string;
}

interface AskBase<F> {
  facts: F;
  prompt: string;
  steps: string[];
  shortcut: string;
  /** Fallback trap when no documented distractor with a trap sentence made it into the options. */
  trap: string;
  tags: string[];
  visual?: VisualSpec;
}

export interface NumAsk<F> extends AskBase<F> {
  answer: number;
  format: (n: number) => string;
  mistakes: Mist[];
  step?: number;
  integer?: boolean;
  allowNegative?: boolean;
  allowZero?: boolean;
  min?: number;
  /** Round fractional mistakes for whole-number answers (default: on for ₹/count answers, off for %). */
  roundMistakes?: boolean;
}

export interface RatioAsk<F> extends AskBase<F> {
  answer: number[];
  mistakes: RatioMistake[];
}

function finish<F>(ctx: BuildContext, a: AskBase<F>, options: string[], answerIndex: number, trap: string): GenResult<F> {
  const q = makeQuestion(ctx.meta, ctx.seed, {
    subtype: ctx.subtype.id,
    difficulty: ctx.difficulty,
    prompt: a.prompt,
    options,
    answerIndex,
    solution: { steps: a.steps, shortcut: a.shortcut, trap, ...(a.visual ? { visual: a.visual } : {}) },
    tags: a.tags,
    targetSeconds: targetSeconds('arithmetic', ctx.difficulty),
  });
  return { item: single(q), facts: a.facts };
}

/** Numeric question: mistake-based options, ascending, uniform correct rank. */
export function emit<F>(ctx: BuildContext, a: NumAsk<F>): GenResult<F> {
  // numericChoices stops filling at the first invalid filler, so a fractional step needs non-integer mode.
  const integer = a.integer ?? (isWhole(a.answer) && (a.step === undefined || isWhole(a.step)));
  // Whole-number answers (₹, people, marks): a mistake that lands on a fraction is shown rounded, as real
  // papers do — unless the rounded value is within 1% of the key (it would read as "almost right").
  const pctLike = /%|increase|decrease|No change/.test(a.format(a.answer));
  const roundM = a.roundMistakes ?? (integer && !pctLike);
  const mistakes: Mist[] = roundM
    ? a.mistakes.flatMap((m) => {
        if (!Number.isFinite(m.value) || isWhole(m.value)) return [m];
        const r = Math.round(m.value);
        if (Math.abs(r - a.answer) <= 0.01 * Math.abs(a.answer)) return [];
        const trap = m.trap?.split(a.format(m.value)).join(a.format(r));
        return [{ value: r, why: `${m.why} (shown rounded)`, ...(trap ? { trap } : {}) }];
      })
    : a.mistakes;
  const choices = numericChoices(ctx.rng, a.answer, {
    format: a.format,
    mistakes,
    integer,
    ...(a.step !== undefined ? { step: a.step } : {}),
    ...(a.allowNegative ? { allowNegative: true } : {}),
    ...(a.allowZero ? { allowZero: true } : {}),
    ...(a.min !== undefined ? { min: a.min } : {}),
  });
  const hit = mistakes.find((m) => m.trap && choices.used.includes(m));
  return finish(ctx, a, choices.options, choices.answerIndex, hit?.trap ?? a.trap);
}

/** Ratio question: "3 : 4" options sorted by value, uniform correct rank. */
export function emitRatio<F>(ctx: BuildContext, a: RatioAsk<F>): GenResult<F> {
  const choices = ratioChoices(ctx.rng, a.answer, a.mistakes);
  const hit = a.mistakes.find((m) => m.trap && choices.used.some((u) => ratioKey(u.parts) === ratioKey(m.parts)));
  return finish(ctx, a, choices.options, choices.answerIndex, hit?.trap ?? a.trap);
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** Uniform pick of a multiple of `unit` in [lo, hi]. */
export function multipleIn(rng: Rng, lo: number, hi: number, unit: number): number {
  const a = Math.ceil(lo / unit);
  const b = Math.floor(hi / unit);
  if (b < a) throw new Error(`multipleIn: no multiple of ${unit} in [${lo}, ${hi}]`);
  return rng.int(a, b) * unit;
}

/** Retry a constructive attempt until it returns a value (build-backward searches). */
export function attempt<T>(label: string, tries: number, fn: () => T | null | undefined): T {
  for (let i = 0; i < tries; i++) {
    const v = fn();
    if (v !== null && v !== undefined) return v;
  }
  throw new Error(`${label}: no valid construction in ${tries} tries`);
}

export { plain, indian, isWhole, gcd };
