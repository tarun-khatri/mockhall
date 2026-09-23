import type { Rng } from '../../../lib/rng';
import type { Rich } from '../../types';
import { normaliseOption } from '../../rich';
import { isWhole, roundTo } from '../../../lib/format';

/**
 * Option builders. All of them keep the correct letter uniformly distributed over A–E (SPEC 7.4),
 * except fixedChoices, where the generator must pick its target answer uniformly itself (build backward).
 */

export interface Choices {
  options: Rich[];
  answerIndex: number;
}

export function assertDistinct(options: readonly Rich[], where = 'options'): void {
  const keys = options.map(normaliseOption);
  if (new Set(keys).size !== keys.length) throw new Error(`${where}: options not distinct: ${JSON.stringify(options)}`);
}

/** Non-numeric options (names, words, statements): correct placed at a uniformly random position. */
export function shuffleChoices(rng: Rng, correct: Rich, distractors: readonly Rich[]): Choices {
  if (distractors.length !== 4) throw new Error(`shuffleChoices: need 4 distractors, got ${distractors.length}`);
  assertDistinct([correct, ...distractors], 'shuffleChoices');
  const pos = rng.int(0, 4);
  const others = rng.shuffle(distractors);
  return { options: [...others.slice(0, pos), correct, ...others.slice(pos)], answerIndex: pos };
}

/**
 * Options in a fixed conventional order (e.g. inequality "Only I / Only II / Either / Neither / Both",
 * or names sorted alphabetically). Choose the target answer uniformly BEFORE constructing the question.
 */
export function fixedChoices(options: readonly Rich[], answerIndex: number): Choices {
  if (options.length !== 5) throw new Error(`fixedChoices: need 5 options, got ${options.length}`);
  assertDistinct(options, 'fixedChoices');
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 4) throw new Error(`fixedChoices: bad index ${answerIndex}`);
  return { options: [...options], answerIndex };
}

/** A distractor produced by a real mistake. `why` documents the mistake (SPEC 7.4). */
export interface Mistake {
  value: number;
  why: string;
}

export interface NumericChoiceOpts {
  /** Display formatter, e.g. (n) => inr(n) or (n) => pct(n). Every option uses the same one. */
  format: (n: number) => Rich;
  /** Mistake-based distractors, most tempting first. Invalid / duplicate ones are skipped. */
  mistakes?: readonly Mistake[];
  /** Spacing for filler distractors when mistakes run out (default: a "nice" 4–15% of the answer). */
  step?: number;
  /** Only integer distractors (default: true when the answer is an integer). */
  integer?: boolean;
  /** Distractors must be > min (default 0) … */
  min?: number;
  /** … or ≥ 0 when allowZero … */
  allowZero?: boolean;
  /** … unless negatives are meaningful (e.g. temperature, net change). */
  allowNegative?: boolean;
  /** Minimum relative gap between any two options (approximation: 0.08). */
  minGap?: number;
  /** Force the correct option's rank 0–4 (tests only). */
  rank?: number;
}

export interface NumericChoices extends Choices {
  /** Option values, ascending (same order as options). */
  values: number[];
  /** Mistakes that made it into the options. */
  used: Mistake[];
}

function niceNumber(x: number): number {
  if (!(x > 0)) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / 10 ** exp;
  const nf = f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10;
  return nf * 10 ** exp;
}

function autoStep(rng: Rng, correct: number, integer: boolean): number {
  const mag = Math.abs(correct) || 1;
  const step = niceNumber(mag * rng.pick([0.04, 0.06, 0.08, 0.1, 0.125, 0.15]));
  return integer ? Math.max(1, Math.round(step)) : step;
}

/**
 * Numeric options: ascending, same format, answer rank uniform over A–E.
 * Mistake distractors are used first (on whichever side of the answer they fall); fillers at multiples of
 * `step` complete the side that needs more.
 */
export function numericChoices(rng: Rng, correct: number, opts: NumericChoiceOpts): NumericChoices {
  if (!Number.isFinite(correct)) throw new Error(`numericChoices: bad answer ${correct}`);
  const integer = opts.integer ?? isWhole(correct);
  const fmt = opts.format;
  const key = (v: number) => normaliseOption(fmt(v));
  const valid = (v: number) =>
    Number.isFinite(v) &&
    (opts.allowNegative || v > (opts.min ?? 0) || (opts.allowZero && v === 0 && (opts.min ?? 0) <= 0)) &&
    (!integer || isWhole(v));
  const correctKey = key(correct);

  const seen = new Set([correctKey]);
  const below: Mistake[] = [];
  const above: Mistake[] = [];
  for (const m of opts.mistakes ?? []) {
    if (!valid(m.value)) continue;
    const k = key(m.value);
    if (seen.has(k)) continue;
    seen.add(k);
    (m.value < correct ? below : above).push(m);
  }

  const step = opts.step ?? autoStep(rng, correct, integer);
  const gapOk = (v: number, chosen: number[]) =>
    !opts.minGap || chosen.every((c) => Math.abs(v - c) >= opts.minGap! * Math.max(Math.abs(v), Math.abs(c)));

  const first = opts.rank ?? rng.int(0, 4);
  const ranks = [first, ...rng.shuffle([0, 1, 2, 3, 4].filter((r) => r !== first))];

  for (const rank of ranks) {
    const chosen: number[] = [correct];
    const keys = new Set([correctKey]);
    const used: Mistake[] = [];
    const take = (list: Mistake[], n: number): number => {
      for (const m of list) {
        if (n === 0) break;
        const k = key(m.value);
        if (keys.has(k) || !gapOk(m.value, chosen)) continue;
        chosen.push(m.value);
        keys.add(k);
        used.push(m);
        n--;
      }
      return n;
    };
    const fill = (dir: -1 | 1, n: number): number => {
      for (let k = 1; n > 0 && k <= 60; k++) {
        const v = roundTo(correct + dir * k * step, 6);
        if (!valid(v)) break;
        const kk = key(v);
        if (keys.has(kk) || !gapOk(v, chosen)) continue;
        chosen.push(v);
        keys.add(kk);
        n--;
      }
      return n;
    };
    let needBelow = take(below, rank);
    let needAbove = take(above, 4 - rank);
    needBelow = fill(-1, needBelow);
    needAbove = fill(1, needAbove);
    if (needBelow === 0 && needAbove === 0) {
      const values = chosen.slice().sort((a, b) => a - b);
      return { options: values.map(fmt), answerIndex: values.indexOf(correct), values, used };
    }
  }
  throw new Error(`numericChoices: could not build 5 distinct options around ${correct}`);
}
