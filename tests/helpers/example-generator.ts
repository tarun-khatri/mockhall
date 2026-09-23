/**
 * REFERENCE EXAMPLE for generator authors — not shipped. Shows the full pattern:
 * defineGenerator → build backward → mistake-based numericChoices → facts for an independent verifier.
 */
import { defineGenerator, type GenResult } from '../../src/content/generators/types';
import { makeQuestion, single } from '../../src/content/generators/shared/question';
import { numericChoices } from '../../src/content/generators/shared/options';
import { targetSeconds } from '../../src/content/targets';
import { inr } from '../../src/lib/format';

export interface ExampleFacts {
  principal: number;
  rate: number;
  years: number;
}

export const exampleGenerator = defineGenerator<ExampleFacts>(
  { name: 'quant.example', version: 1, subject: 'quant', chapter: 'interest' },
  [{ id: 'si-basic', label: 'Simple interest' }],
  ({ meta, seed, difficulty, subtype, rng }) => {
    // Build backward: pick values so the interest is a whole number of rupees.
    const years = rng.int(2, difficulty === 'easy' ? 3 : 6);
    const rate = rng.pick([4, 5, 6, 8, 10, 12, 12.5, 15]);
    const principal = rng.int(4, 40) * 500;
    const interest = (principal * rate * years) / 100;

    const choices = numericChoices(rng, interest, {
      format: (n) => inr(n),
      mistakes: [
        { value: principal + interest, why: 'gave the amount instead of the interest' },
        { value: (principal * rate) / 100, why: 'interest for one year only' },
        { value: (principal * rate * (years + 1)) / 100, why: 'off-by-one in years' },
      ],
    });

    const q = makeQuestion(meta, seed, {
      subtype: subtype.id,
      difficulty,
      prompt: `Find the simple interest on ${inr(principal)} at ${rate}% per annum for ${years} years.`,
      options: choices.options,
      answerIndex: choices.answerIndex,
      solution: {
        steps: [`SI = P × R × T / 100`, `= ${inr(principal)} × ${rate} × ${years} / 100`, `= ${inr(interest)}`],
        shortcut: `${rate * years}% of ${inr(principal)} in one step.`,
        trap: `${inr(principal + interest)} is the amount (P + SI), not the interest.`,
      },
      tags: ['interest:simple'],
      targetSeconds: targetSeconds('arithmetic', difficulty),
    });
    return { item: single(q), facts: { principal, rate, years } };
  },
);

/** Independent verifier: brute-force year-by-year accumulation (different method from the formula). */
export function verifyExample(res: GenResult<ExampleFacts>): string[] {
  const { principal, rate, years } = res.facts;
  let si = 0;
  for (let y = 0; y < years; y++) si += (principal * rate) / 100;
  return [inr(si)];
}
