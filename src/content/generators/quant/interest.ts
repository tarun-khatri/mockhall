/**
 * quant.interest — Simple & compound interest (SPEC 8.1 Q9).
 *
 * Subtypes: SI basics, CI annual / half-yearly / quarterly, CI − SI difference (2 and 3 years),
 * sum becoming k times, sum split at different rates, instalments (extreme).
 * Numbers are built backward: principals are multiples of Dⁿ (rate factor N/D) so every amount is whole.
 */
import { defineGenerator, type BuildContext, type SubtypeDef } from '../types';
import type { Difficulty } from '../../types';
import { finish, type Draft } from './interest/kit';
import { siFind, siMonths, siPrincipal, siRate, siRateChange, siRateEqTime, siRateIncrease, siRateTimeChange, siReinvest, siTime, siTwoAmounts, siTwoSums } from './interest/simple';
import { ciDifferentRates, ciFind, ciFractionYear, ciFrequencyGap, ciFromAmounts, ciFromSi, ciPrincipal } from './interest/compound';
import { diff2, diff3, instalments, multiple, split } from './interest/special';

/**
 * Ground-truth inputs (the givens stated in the prompt) — never the answer.
 * Money in ₹, rates in % per annum, times in years unless the key says otherwise (e.g. `months`).
 */
export interface InterestFacts {
  /** Scenario id, e.g. 'si-find', 'ci-find', 'diff2', 'split-two', 'ci-instalment'. */
  form: string;
  /** Quantity asked: 'si' | 'amount' | 'ci' | 'principal' | 'rate' | 'time' | 'diff' | 'diff3' | 'si3' | 'part' | 'instalment' | 'loan'. */
  ask: string;
  /** The givens exactly as stated. */
  given: Record<string, number>;
  /** Ordered values stated in the prompt (e.g. year-wise rates, the three rates of a split). */
  list?: number[];
}

type D = Draft<InterestFacts>;
type Builder = (ctx: BuildContext) => D;

const META = { name: 'quant.interest', version: 1, subject: 'quant', chapter: 'interest' } as const;

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'si-basic', label: 'Simple interest', weight: 3 },
  { id: 'ci-annual', label: 'Compound interest (annual)', weight: 3 },
  { id: 'ci-half-yearly', label: 'CI compounded half-yearly', weight: 1 },
  { id: 'ci-quarterly', label: 'CI compounded quarterly', weight: 1 },
  { id: 'ci-si-diff-2yr', label: 'CI − SI difference (2 years)', weight: 2 },
  { id: 'ci-si-diff-3yr', label: 'CI − SI difference (3 years)', weight: 1 },
  { id: 'sum-multiple', label: 'Sum doubling / tripling', weight: 1 },
  { id: 'sum-split', label: 'Sum split at different rates', weight: 1 },
  { id: 'instalments', label: 'Instalments', difficulties: ['extreme'], weight: 1 },
];

const PLAN: Record<string, Partial<Record<Difficulty, Builder[]>>> = {
  'si-basic': {
    easy: [siFind],
    medium: [siMonths, siPrincipal, siRate, siTime, (c) => siTwoAmounts(c, 'principal')],
    hard: [(c) => siTwoAmounts(c, 'rate'), siRateEqTime, siRateIncrease, siTwoSums, (c) => siRateChange(c, 'si')],
    extreme: [(c) => siRateChange(c, 'principal'), siRateTimeChange, siReinvest],
  },
  'ci-annual': {
    easy: [(c) => ciFind(c, 'annual', 'easy')],
    medium: [(c) => ciFind(c, 'annual', 'medium'), (c) => ciPrincipal(c, 'annual', 'medium')],
    hard: [(c) => ciFind(c, 'annual', 'hard'), (c) => ciPrincipal(c, 'annual', 'hard'), ciDifferentRates, ciFromSi],
    extreme: [ciFromAmounts, ciFractionYear],
  },
  'ci-half-yearly': {
    easy: [(c) => ciFind(c, 'half', 'easy')],
    medium: [(c) => ciFind(c, 'half', 'medium'), (c) => ciPrincipal(c, 'half', 'medium')],
    hard: [(c) => ciFind(c, 'half', 'hard'), (c) => ciPrincipal(c, 'half', 'hard')],
    extreme: [(c) => ciFrequencyGap(c, 'half')],
  },
  'ci-quarterly': {
    easy: [(c) => ciFind(c, 'quarter', 'easy')],
    medium: [(c) => ciFind(c, 'quarter', 'medium'), (c) => ciPrincipal(c, 'quarter', 'medium')],
    hard: [(c) => ciFind(c, 'quarter', 'hard'), (c) => ciPrincipal(c, 'quarter', 'hard')],
    extreme: [(c) => ciFrequencyGap(c, 'quarter')],
  },
  'ci-si-diff-2yr': {
    easy: [(c) => diff2(c, 'find-diff')],
    medium: [(c) => diff2(c, 'find-p')],
    hard: [(c) => diff2(c, 'find-r'), (c) => diff2(c, 'rate-from-si-ci')],
    extreme: [(c) => diff2(c, 'p-from-si-ci'), (c) => diff2(c, 'ci3-from-diff2')],
  },
  'ci-si-diff-3yr': {
    easy: [(c) => diff3(c, 'find-diff', [5, 10, 20], 50000)],
    medium: [(c) => diff3(c, 'find-diff', [4, 5, 10, 15, 20]), (c) => diff3(c, 'find-p', [5, 10, 20])],
    hard: [(c) => diff3(c, 'find-p', [4, 5, 10, 15, 20]), (c) => diff3(c, 'from-diff2', [4, 5, 10, 15, 20])],
    extreme: [(c) => diff3(c, 'rate-from-diffs', [5, 10, 15, 20, 25]), (c) => diff3(c, 'si-from-diff3', [5, 10, 20])],
  },
  'sum-multiple': {
    easy: [(c) => multiple(c, 'si-double-rate'), (c) => multiple(c, 'si-k-time')],
    medium: [(c) => multiple(c, 'si-k1-k2'), (c) => multiple(c, 'si-frac-rate')],
    hard: [(c) => multiple(c, 'ci-power')],
    extreme: [(c) => multiple(c, 'si-to-ci'), (c) => multiple(c, 'ci-power-frac')],
  },
  'sum-split': {
    easy: [(c) => split(c, 'annual')],
    medium: [(c) => split(c, 'total-t'), (c) => split(c, 'equal-interest')],
    hard: [(c) => split(c, 'three-equal'), (c) => split(c, 'interest-gap')],
    extreme: [(c) => split(c, 'ci-equal')],
  },
  instalments: {
    extreme: [(c) => instalments(c, 'ci2-inst'), (c) => instalments(c, 'ci2-loan'), (c) => instalments(c, 'ci3-inst'), (c) => instalments(c, 'si-inst')],
  },
};

export const generator = defineGenerator<InterestFacts>(META, SUBTYPES, (ctx) => {
  const builders = PLAN[ctx.subtype.id]?.[ctx.difficulty];
  if (!builders?.length) throw new Error(`${META.name}: no builder for ${ctx.subtype.id}/${ctx.difficulty}`);
  const build = ctx.rng.pick(builders);
  return finish(ctx, build(ctx));
});
