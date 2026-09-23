/**
 * Chapter-local helpers for quant.mensuration (kept inside the chapter folder so the chapter stays self-contained).
 */
import type { BuildContext, GenResult } from '../../types';
import { makeQuestion, single } from '../../shared/question';
import { numericChoices, type Mistake, type NumericChoiceOpts } from '../../shared/options';
import { targetSeconds } from '../../../targets';
import type { Rng } from '../../../../lib/rng';
import { indian, inr, isWhole, mixedTex, plain, roundTo } from '../../../../lib/format';

export interface Mis extends Mistake {
  trap?: string;
}

export interface Draft<F> {
  facts: F;
  prompt: string;
  answer: number;
  fmt: (n: number) => string;
  mistakes: Mis[];
  steps: string[];
  shortcut?: string;
  trap: string;
  tags: string[];
  choice?: Omit<NumericChoiceOpts, 'format' | 'mistakes'>;
}

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
    solution: { steps: d.steps, ...(d.shortcut ? { shortcut: d.shortcut } : {}), trap: tempting?.trap ?? d.trap },
    tags: d.tags,
    targetSeconds: targetSeconds('arithmetic', ctx.difficulty),
  });
  return { item: single(q), facts: d.facts };
}

export function clean(v: number, dp = 0): number {
  if (!Number.isFinite(v)) return NaN;
  return isWhole(v * 10 ** dp, 1e-7) ? roundTo(v, dp) : NaN;
}

/** v when it is a fraction with denominator ≤ maxDen, else NaN (usable as a mixed-fraction option). */
export function cleanFrac(v: number, maxDen = 12): number {
  if (!Number.isFinite(v) || v <= 0) return NaN;
  for (let q = 1; q <= maxDen; q++) if (isWhole(v * q, 1e-7)) return v;
  return NaN;
}

/** Plain or mixed-fraction KaTeX text for a simple fraction (falls back to a decimal). */
export function num(v: number): string {
  if (!Number.isFinite(v)) return plain(v);
  for (let q = 1; q <= 60; q++) {
    if (isWhole(v * q, 1e-7)) {
      const p = Math.round(v * q);
      return q === 1 ? String(p) : mixedTex(p, q);
    }
  }
  return plain(v);
}

/** Number with Indian grouping (integers) or a mixed fraction, then the unit. */
export const unitFmt = (unit: string) => (v: number) => `${Number.isInteger(v) ? indian(v) : isWhole(v * 100, 1e-7) ? indian(v) : num(v)} ${unit}`;
export const rupees = (v: number) => inr(v);
export const days = (v: number) => `${num(v)} day${v === 1 ? '' : 's'}`;
export const hours = (v: number) => `${num(v)} hour${v === 1 ? '' : 's'}`;
export const count = (unit: string) => (v: number) => `${num(v)} ${unit}`;

export function gcdN(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
export function lcmN(...xs: number[]): number {
  return xs.reduce((acc, x) => (acc * x) / gcdN(acc, x), 1);
}

/* ---------------------------- words ---------------------------- */

const NAMES: readonly (readonly [string, 'm' | 'f'])[] = [
  ['Ramesh', 'm'], ['Priya', 'f'], ['Arjun', 'm'], ['Kavita', 'f'], ['Suresh', 'm'], ['Meena', 'f'],
  ['Harpreet', 'f'], ['Gurpreet', 'm'], ['Anjali', 'f'], ['Rahul', 'm'], ['Farhan', 'm'], ['Ayesha', 'f'],
  ['Joseph', 'm'], ['Lakshmi', 'f'], ['Karthik', 'm'], ['Divya', 'f'], ['Sanjay', 'm'], ['Pooja', 'f'],
  ['Venkatesh', 'm'], ['Sneha', 'f'], ['Imran', 'm'], ['Nasreen', 'f'], ['Biswajit', 'm'], ['Moumita', 'f'],
  ['Rohan', 'm'], ['Tanvi', 'f'], ['Manoj', 'm'], ['Sunita', 'f'], ['Deepak', 'm'], ['Ritu', 'f'],
];

export function names(rng: Rng, k: number): string[] {
  return rng.sample(NAMES, k).map(([n]) => n);
}

export function job(rng: Rng): string {
  return rng.pick([
    'a piece of work',
    'a job',
    'the painting of a school building',
    'the tiling of a bank branch floor',
    'the digging of a farm pond',
    'the wiring of a house',
    'the plastering of a wall',
    'the stitching of an order of uniforms',
  ]);
}
