/**
 * Chapter-local helpers for quant.speed-distance (kept inside the chapter folder so the chapter stays self-contained).
 */
import type { BuildContext, GenResult } from '../../types';
import { makeQuestion, single } from '../../shared/question';
import { numericChoices, type Mistake, type NumericChoiceOpts } from '../../shared/options';
import { targetSeconds } from '../../../targets';
import type { Rng } from '../../../../lib/rng';
import { isWhole, mixedTex, plain, roundTo } from '../../../../lib/format';

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

/** Options stay within this factor of the answer (the ×5/18 slip is 3.6×, so allow 4×). */
const MAGNITUDE = 4;

export function finish<F>(ctx: BuildContext, d: Draft<F>): GenResult<F> {
  const a = Math.abs(d.answer);
  const mistakes = d.mistakes.filter(
    (m) =>
      Number.isFinite(m.value) &&
      (a === 0 || (Math.abs(m.value) <= a * MAGNITUDE && Math.abs(m.value) >= a / MAGNITUDE)) &&
      !(d.fmt(m.value).endsWith('km/h') && m.value > 180),
  );
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

/** v when it has at most `dp` decimals (float-tolerant), otherwise NaN. */
export function clean(v: number, dp = 0): number {
  if (!Number.isFinite(v)) return NaN;
  return isWhole(v * 10 ** dp, 1e-7) ? roundTo(v, dp) : NaN;
}

/** v when it is a fraction with denominator ≤ maxDen, else NaN (for mixed-fraction options). */
export function cleanFrac(v: number, maxDen = 12): number {
  if (!Number.isFinite(v)) return NaN;
  for (let q = 1; q <= maxDen; q++) if (isWhole(v * q, 1e-7)) return v;
  return NaN;
}

/** [numerator, denominator] for a value that is a fraction with a small denominator. */
export function toFrac(v: number, maxDen = 60): [number, number] {
  for (let q = 1; q <= maxDen; q++) if (isWhole(v * q, 1e-7)) return [Math.round(v * q), q];
  throw new Error(`toFrac: ${v} is not a simple fraction`);
}

/** "3", "2.5" → "$2\frac{1}{2}$" etc. */
export function num(v: number): string {
  if (!Number.isFinite(cleanFrac(v, 60))) return plain(v);
  const [p, q] = toFrac(v);
  return q === 1 ? String(p) : mixedTex(p, q);
}

export function stepWithin(gap: number, slots = 5): number {
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  let best = 1;
  for (const s of nice) if (s <= gap / slots) best = s;
  return best;
}

/* ---------------------------- units & formats ---------------------------- */

export const kmh = (v: number) => `${plain(v)} km/h`;
export const ms = (v: number) => `${plain(v)} m/s`;
export const metres = (v: number) => `${plain(v)} m`;
export const km = (v: number) => `${plain(v)} km`;
export const secs = (v: number) => `${num(v)} seconds`;
export const mins = (v: number) => `${num(v)} minutes`;
export const hrs = (v: number) => `${num(v)} hour${v === 1 ? '' : 's'}`;

/** Minutes since midnight → "10:30 a.m.". */
export function clockText(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h24 < 12 ? 'a.m.' : 'p.m.';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

/** km/h → m/s as a KaTeX step. */
export function toMsStep(v: number): string {
  return `${plain(v)} km/h = ${plain(v)} × $\\frac{5}{18}$ m/s = ${plain((v * 5) / 18)} m/s`;
}

/* ---------------------------- words ---------------------------- */

const NAMES: readonly (readonly [string, 'm' | 'f'])[] = [
  ['Ramesh', 'm'], ['Priya', 'f'], ['Arjun', 'm'], ['Kavita', 'f'], ['Suresh', 'm'], ['Meena', 'f'],
  ['Harpreet', 'f'], ['Gurpreet', 'm'], ['Anjali', 'f'], ['Rahul', 'm'], ['Farhan', 'm'], ['Ayesha', 'f'],
  ['Joseph', 'm'], ['Lakshmi', 'f'], ['Karthik', 'm'], ['Divya', 'f'], ['Sanjay', 'm'], ['Pooja', 'f'],
  ['Venkatesh', 'm'], ['Sneha', 'f'], ['Imran', 'm'], ['Nasreen', 'f'], ['Biswajit', 'm'], ['Moumita', 'f'],
  ['Rohan', 'm'], ['Tanvi', 'f'], ['Manoj', 'm'], ['Sunita', 'f'], ['Deepak', 'm'], ['Ritu', 'f'],
  ['Senthil', 'm'], ['Selvi', 'f'], ['Tenzin', 'm'], ['Anita', 'f'], ['Vikram', 'm'], ['Neha', 'f'],
];

export interface Person {
  name: string;
  he: string;
  his: string;
  him: string;
  He: string;
}

function toPerson([name, g]: readonly [string, 'm' | 'f']): Person {
  return g === 'm' ? { name, he: 'he', his: 'his', him: 'him', He: 'He' } : { name, he: 'she', his: 'her', him: 'her', He: 'She' };
}

export function person(rng: Rng): Person {
  return toPerson(rng.pick(NAMES));
}

export function people(rng: Rng, k: number): Person[] {
  return rng.sample(NAMES, k).map(toPerson);
}

const TOWNS = [
  'Rampur', 'Sitapur', 'Chandpur', 'Devgarh', 'Madhavpur', 'Lakshmipur', 'Shantinagar', 'Sonepur', 'Raigarh', 'Nandgaon',
  'Kishanpur', 'Bhavani Nagar', 'Ratnagiri Road', 'Anandpur', 'Kalyanpur', 'Hirapur', 'Govindpur', 'Tirunagar', 'Balapur', 'Moti Bagh',
];

export function towns(rng: Rng, k: number): string[] {
  return rng.sample(TOWNS, k);
}

export function vehicle(rng: Rng): string {
  return rng.pick(['car', 'bus', 'motorcyclist', 'truck', 'van']);
}
