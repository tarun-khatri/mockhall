import type { Rng } from '../../../../lib/rng';
import type { Rich } from '../../../types';
import { fixedChoices, shuffleChoices, type Choices } from '../../shared/options';

/** Standard count options used by real papers for "How many such …" questions. */
export const COUNT_OPTIONS: readonly string[] = ['None', 'One', 'Two', 'Three', 'More than three'];

/** Category index of a count on COUNT_OPTIONS (0 … 4, where 4 = "More than three"). */
export function countCategory(n: number): number {
  return Math.max(0, Math.min(4, n));
}

export function countChoices(count: number): Choices {
  return fixedChoices(COUNT_OPTIONS, countCategory(count));
}

/** 'upto3': None / One / Two / Three / More than three.  'upto4': One / Two / Three / Four / More than four (count ≥ 1). */
export type CountStyle = 'upto3' | 'upto4';
export const COUNT_OPTIONS_4: readonly string[] = ['One', 'Two', 'Three', 'Four', 'More than four'];

export function countStyleOptions(style: CountStyle): readonly string[] {
  return style === 'upto4' ? COUNT_OPTIONS_4 : COUNT_OPTIONS;
}

export function countStyleChoices(count: number, style: CountStyle): Choices {
  if (style === 'upto3') return countChoices(count);
  if (count < 1) throw new Error('countStyleChoices: "upto4" options need a count of at least one');
  return fixedChoices(COUNT_OPTIONS_4, Math.min(count - 1, 4));
}

/** Escape characters that mean something in Rich text ($ opens maths, * is emphasis, \ escapes). */
export function esc(s: string): string {
  return s.replace(/[\\$*]/g, (c) => `\\${c}`);
}

export const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** Pick 4 distinct distractors (most tempting first) from candidates, topping up from `fill`. */
export function pickDistractors(rng: Rng, correct: string, candidates: readonly string[], fill: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set([correct]);
  for (const c of candidates) {
    if (out.length === 4) break;
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  for (const c of rng.shuffle(fill)) {
    if (out.length === 4) break;
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  if (out.length < 4) throw new Error(`pickDistractors: not enough distinct values around ${correct}`);
  return out;
}

/** Shuffle a correct value among 4 distractors (all rendered with `render`). */
export function shuffledOptions(rng: Rng, correct: string, distractors: readonly string[], render: (s: string) => Rich = (s) => s): Choices {
  return shuffleChoices(rng, render(correct), distractors.map(render));
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
