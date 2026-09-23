/**
 * Chapter-local helpers for quant.interest (kept inside the chapter folder so the chapter stays self-contained).
 */
import type { BuildContext, GenResult } from '../../types';
import { makeQuestion, single } from '../../shared/question';
import { numericChoices, type Mistake, type NumericChoiceOpts } from '../../shared/options';
import { targetSeconds } from '../../../targets';
import type { Rng } from '../../../../lib/rng';
import { isWhole, lcm, reduce, roundTo } from '../../../../lib/format';

/** A mistake-based distractor plus the sentence shown as the trap when it is the most tempting option. */
export interface Mis extends Mistake {
  trap?: string;
}

export interface Draft<F> {
  facts: F;
  prompt: string;
  answer: number;
  fmt: (n: number) => string;
  /** Most tempting first. */
  mistakes: Mis[];
  steps: string[];
  shortcut?: string;
  /** Fallback trap when none of the trap-carrying mistakes made it into the options. */
  trap: string;
  tags: string[];
  choice?: Omit<NumericChoiceOpts, 'format' | 'mistakes'>;
}

/** Options stay within this factor of the answer (real papers keep options of similar magnitude). */
const MAGNITUDE = 3;

export function finish<F>(ctx: BuildContext, d: Draft<F>): GenResult<F> {
  const a = Math.abs(d.answer);
  const mistakes = d.mistakes.filter((m) => Number.isFinite(m.value) && (a === 0 || (Math.abs(m.value) <= a * MAGNITUDE && Math.abs(m.value) >= a / MAGNITUDE)));
  const step = d.choice?.step;
  const integer = d.choice?.integer ?? (isWhole(d.answer) && (step === undefined || isWhole(step)));
  const choices = numericChoices(ctx.rng, d.answer, { format: d.fmt, mistakes, ...d.choice, integer });
  const tempting = mistakes.find((m) => m.trap && choices.used.includes(m));
  const q = makeQuestion(ctx.meta, ctx.seed, {
    subtype: ctx.subtype.id,
    difficulty: ctx.difficulty,
    prompt: d.prompt,
    options: choices.options,
    answerIndex: choices.answerIndex,
    solution: {
      steps: d.steps,
      ...(d.shortcut ? { shortcut: d.shortcut } : {}),
      trap: tempting?.trap ?? d.trap,
    },
    tags: d.tags,
    targetSeconds: targetSeconds('arithmetic', ctx.difficulty),
  });
  return { item: single(q), facts: d.facts };
}

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

/** v when it has at most `dp` decimals (float-tolerant), otherwise NaN (so numericChoices skips it). */
export function clean(v: number, dp = 0): number {
  if (!Number.isFinite(v)) return NaN;
  const f = 10 ** dp;
  return isWhole(v * f, 1e-7) ? roundTo(v, dp) : NaN;
}

/** A multiple of `unit` in [min, max], preferring round multiples (of 1000, 500, 100…). */
export function multipleIn(rng: Rng, unit: number, min: number, max: number, prefer: readonly number[] = [1000, 500, 100]): number {
  for (const p of prefer) {
    const base = lcm(unit, p);
    const lo = Math.max(1, Math.ceil(min / base));
    const hi = Math.floor(max / base);
    if (hi - lo >= 2) return base * rng.int(lo, hi);
  }
  const lo = Math.max(1, Math.ceil(min / unit));
  const hi = Math.max(lo, Math.floor(max / unit));
  return unit * rng.int(lo, hi);
}

/** Largest "nice" filler step that still fits `slots` options inside `gap` (e.g. between the principal and an amount). */
export function stepWithin(gap: number, slots = 5): number {
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
  let best = 1;
  for (const s of nice) if (s <= gap / slots) best = s;
  return best;
}

/** Growth factor (100 + r)/100 as a reduced fraction [N, D]; r may have up to 2 decimals. */
export function factor(r: number): [number, number] {
  return reduce(Math.round((100 + r) * 100), 10000);
}

/** Amount after `n` periods at `r`% per period, exact when P is a multiple of D^n. */
export function compound(P: number, r: number, n: number): number {
  const [N, D] = factor(r);
  let a = P;
  for (let i = 0; i < n; i++) a = (a * N) / D;
  return roundTo(a, 6);
}

/** Compound amount path P, A1, A2, … (length n + 1). */
export function compoundPath(P: number, r: number, n: number): number[] {
  const out = [P];
  for (let i = 1; i <= n; i++) out.push(compound(P, r, i));
  return out;
}

export function sum(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

const NAMES: readonly (readonly [string, 'm' | 'f'])[] = [
  ['Ramesh', 'm'], ['Priya', 'f'], ['Arjun', 'm'], ['Kavita', 'f'], ['Suresh', 'm'], ['Meena', 'f'],
  ['Harpreet', 'f'], ['Gurpreet', 'm'], ['Anjali', 'f'], ['Rahul', 'm'], ['Farhan', 'm'], ['Ayesha', 'f'],
  ['Joseph', 'm'], ['Lakshmi', 'f'], ['Karthik', 'm'], ['Divya', 'f'], ['Sanjay', 'm'], ['Pooja', 'f'],
  ['Venkatesh', 'm'], ['Sneha', 'f'], ['Imran', 'm'], ['Nasreen', 'f'], ['Biswajit', 'm'], ['Moumita', 'f'],
  ['Rohan', 'm'], ['Tanvi', 'f'], ['Manoj', 'm'], ['Sunita', 'f'], ['Deepak', 'm'], ['Ritu', 'f'],
  ['Senthil', 'm'], ['Selvi', 'f'], ['Tenzin', 'm'], ['Anita', 'f'], ['Vikram', 'm'], ['Neha', 'f'],
  ['Pranav', 'm'], ['Aditi', 'f'], ['Hemant', 'm'], ['Jyoti', 'f'], ['Mohan', 'm'], ['Bhavna', 'f'],
];

export interface Person {
  name: string;
  he: string;
  his: string;
  him: string;
}

function toPerson([name, g]: readonly [string, 'm' | 'f']): Person {
  return g === 'm' ? { name, he: 'he', his: 'his', him: 'him' } : { name, he: 'she', his: 'her', him: 'her' };
}

export function person(rng: Rng): Person {
  return toPerson(rng.pick(NAMES));
}

export function people(rng: Rng, k: number): Person[] {
  return rng.sample(NAMES, k).map(toPerson);
}

export function lender(rng: Rng): string {
  return rng.pick(['a bank', 'a cooperative bank', 'a finance company', 'a moneylender', 'a credit society', 'a small finance bank']);
}

export function scheme(rng: Rng): string {
  return rng.pick(['a bank', 'a cooperative bank', 'a post office scheme', 'a savings scheme', 'a small finance bank', 'a credit society']);
}

/** "3 years", "1 year", "8 months", "2 years 6 months". */
export function periodText(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const ys = y ? `${y} year${y === 1 ? '' : 's'}` : '';
  const ms = m ? `${m} month${m === 1 ? '' : 's'}` : '';
  return [ys, ms].filter(Boolean).join(' ');
}

export function yearsText(n: number): string {
  return `${n} year${n === 1 ? '' : 's'}`;
}

export const WORD_ORD = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
export const WORD_NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
