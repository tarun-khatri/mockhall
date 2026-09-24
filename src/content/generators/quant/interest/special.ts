/**
 * quant.interest: CI − SI difference (2 and 3 years), sum becoming k times, sum split at different rates,
 * and instalments.
 */
import type { BuildContext } from '../../types';
import type { InterestFacts } from '../interest';
import { fracTex, gcd, inr, lcm, pct, plain, reduce } from '../../../../lib/format';
import { type Draft, clean, compound, factor, lender, multipleIn, person, stepWithin, yearsText } from './kit';

type D = Draft<InterestFacts>;
const yrs = yearsText;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------------------ */
/* CI − SI, 2 years                                                    */
/* ------------------------------------------------------------------ */

export type Diff2Form = 'find-diff' | 'find-p' | 'find-r' | 'rate-from-si-ci' | 'p-from-si-ci' | 'ci3-from-diff2';

export function diff2(ctx: BuildContext, form: Diff2Form): D {
  const { rng } = ctx;
  const r = rng.pick(form === 'find-r' ? [4, 5, 6, 8, 10, 12, 15, 20] : form === 'ci3-from-diff2' ? [5, 10, 20] : [4, 5, 8, 10, 12, 15, 20]);
  const [, Dd] = factor(r);
  const unit = lcm(Dd ** (form === 'ci3-from-diff2' ? 3 : 2), 10000 / gcd(10000, r * r));
  const P = multipleIn(rng, unit, form === 'find-diff' ? 10000 : 5000, form === 'find-diff' ? 100000 : 120000);
  const SI = (2 * P * r) / 100;
  const CI = compound(P, r, 2) - P;
  const Dv = (P * r * r) / 10000;
  const oneYear = (P * r) / 100;
  const why2 = `CI − SI for 2 years = P × (r/100)²`;
  if (form === 'find-diff') {
    return {
      facts: { form: 'diff2', ask: 'diff', given: { P, R: r } },
      prompt: `Find the difference between the compound interest (compounded annually) and the simple interest on ${inr(P)} at ${r}% per annum for 2 years.`,
      answer: Dv,
      fmt: (x) => inr(x),
      mistakes: [
        { value: oneYear, why: "took one year's interest as the difference", trap: `${inr(oneYear)} is one year's interest; the CI − SI gap is the interest on that interest: ${r}% of ${inr(oneYear)}.` },
        { value: 2 * Dv, why: 'doubled the correction for 2 years', trap: `Only the second year's interest-on-interest creates the gap, so it is counted once.` },
        { value: clean((P * r * r * (300 + r)) / 1e6), why: 'used the 3-year formula' },
        { value: SI, why: 'gave the simple interest' },
        { value: CI, why: 'gave the compound interest' },
      ],
      steps: [`SI for 2 years = 2 × ${r}% of ${inr(P)} = ${inr(SI)}`, `CI for 2 years = ${inr(P)} × (1 + ${r}/100)² − ${inr(P)} = ${inr(CI)}`, `Difference = ${inr(CI)} − ${inr(SI)} = ${inr(Dv)}`],
      shortcut: `${why2} = ${inr(P)} × (${r}/100)² = ${inr(Dv)} — i.e. ${r}% of ${r}% of the sum.`,
      trap: `The gap is only the interest earned on the first year's interest.`,
      tags: ['interest:ci-si-difference', 'trick:ci-si-2yr'],
    };
  }
  if (form === 'find-p') {
    const once = clean((Dv * 100) / r);
    return {
      facts: { form: 'diff2', ask: 'principal', given: { diff: Dv, R: r } },
      prompt: `The difference between the compound interest (compounded annually) and the simple interest on a certain sum at ${r}% per annum for 2 years is ${inr(Dv)}. Find the sum.`,
      answer: P,
      fmt: (x) => inr(x),
      mistakes: [
        { value: once, why: 'divided by r% only once', trap: `${inr(once)} divides by ${r}% once; the difference is ${r}% of ${r}% of the sum, so divide by it twice.` },
        { value: 2 * P, why: 'doubled for two years' },
        { value: P / 2, why: 'halved for two years' },
        { value: clean((Dv * 1e6) / (r * r * (300 + r))), why: 'used the 3-year formula' },
      ],
      steps: [why2, `${inr(Dv)} = P × (${r}/100)² = P × ${r * r}/10000`, `P = ${inr(Dv)} × 10000 ÷ ${r * r} = ${inr(P)}`],
      shortcut: `P = D × (100/r)² = ${inr(Dv)} × ${plain((100 / r) ** 2, 4)} = ${inr(P)}.`,
      trap: `Square the factor 100/r.`,
      tags: ['interest:ci-si-difference', 'trick:ci-si-2yr'],
    };
  }
  if (form === 'find-r') {
    const noRoot = clean((100 * Dv) / P, 2);
    return {
      facts: { form: 'diff2', ask: 'rate', given: { diff: Dv, P } },
      prompt: `The difference between the compound interest (compounded annually) and the simple interest on ${inr(P)} for 2 years is ${inr(Dv)}. Find the rate of interest per annum.`,
      answer: r,
      fmt: (x) => pct(x),
      mistakes: [
        { value: noRoot, why: 'forgot the square root', trap: `${pct(noRoot)} is (r/100)² × 100; the rate is its square root taken on D/P.` },
        { value: 2 * r, why: 'doubled the rate for two years' },
      ],
      steps: [why2, `(r/100)² = ${inr(Dv)} ÷ ${inr(P)} = ${fracTex(Dv, P)}`, `r/100 = ${fracTex(r, 100)}`, `r = ${r}%`],
      shortcut: `D/P = (r/100)² → r = 100 × √(${fracTex(Dv, P)}) = ${r}%.`,
      trap: `Take the square root of D/P before multiplying by 100.`,
      tags: ['interest:ci-si-difference', 'trick:ci-si-2yr'],
      choice: { step: 1 },
    };
  }
  const gap = CI - SI;
  if (form === 'ci3-from-diff2') {
    const A3 = compound(P, r, 3);
    const CI3 = A3 - P;
    const SI3 = (3 * P * r) / 100;
    const Ponce = (Dv * 100) / r;
    const wrongP = clean(compound(Ponce, r, 3) - Ponce);
    return {
      facts: { form: 'diff2', ask: 'ci3', given: { diff: Dv, R: r } },
      prompt: `The difference between the compound interest (compounded annually) and the simple interest on a sum at ${r}% per annum for 2 years is ${inr(Dv)}. Find the compound interest on the same sum at the same rate for 3 years.`,
      answer: CI3,
      fmt: (x) => inr(x),
      mistakes: [
        { value: SI3, why: 'gave the simple interest for 3 years', trap: `${inr(SI3)} is the 3-year simple interest; compound interest is larger.` },
        { value: CI, why: 'stopped at 2 years', trap: `${inr(CI)} is the CI for 2 years; one more year of compounding is needed.` },
        { value: wrongP, why: 'found the sum by dividing by r% only once' },
        { value: clean(CI3 + Dv), why: 'added the given difference again' },
      ],
      steps: [why2, `P = ${inr(Dv)} × (100/${r})² = ${inr(Dv)} × ${plain((100 / r) ** 2, 4)} = ${inr(P)}`, `Amount after 3 years = ${inr(P)} × (1 + ${r}/100)³ = ${inr(A3)}`, `CI = ${inr(A3)} − ${inr(P)} = ${inr(CI3)}`],
      shortcut: `Get the sum from D = P(r/100)², then use the ratio method for 3 years.`,
      trap: `Find the sum first; the 2-year difference is not itself an interest figure.`,
      tags: ['interest:ci-si-difference', 'trick:ci-si-2yr'],
    };
  }
  if (form === 'rate-from-si-ci') {
    const half = clean((100 * gap) / SI, 2);
    return {
      facts: { form: 'diff2', ask: 'rate', given: { SI, CI, T: 2 } },
      prompt: `The simple interest on a sum of money for 2 years is ${inr(SI)}, and the compound interest (compounded annually) on the same sum at the same rate for 2 years is ${inr(CI)}. Find the rate of interest per annum.`,
      answer: r,
      fmt: (x) => pct(x),
      mistakes: [
        { value: half, why: "compared the gap with the 2-year SI instead of one year's SI", trap: `${pct(half)} divides the gap by the whole 2-year SI; the gap is interest on one year's interest, ${inr(SI / 2)}.` },
        { value: clean((100 * gap) / CI, 2), why: 'divided the gap by the CI' },
      ],
      steps: [`SI for 1 year = ${inr(SI)} ÷ 2 = ${inr(SI / 2)}`, `CI − SI = ${inr(gap)} = interest on the first year's interest`, `r = ${inr(gap)} × 100 ÷ ${inr(SI / 2)} = ${r}%`],
      shortcut: `r = 200 × (CI − SI) ÷ SI = 200 × ${inr(gap)} ÷ ${inr(SI)} = ${r}%.`,
      trap: `The gap is earned on one year's interest, not on the 2-year SI.`,
      tags: ['interest:ci-si-difference', 'trick:ci-si-2yr'],
      choice: { step: 1 },
    };
  }
  return {
    facts: { form: 'diff2', ask: 'principal', given: { SI, CI, T: 2 } },
    prompt: `On a certain sum, the simple interest for 2 years is ${inr(SI)} and the compound interest (compounded annually) for 2 years at the same rate is ${inr(CI)}. Find the sum.`,
    answer: P,
    fmt: (x) => inr(x),
    mistakes: [
      { value: 2 * P, why: "used the 2-year SI as one year's interest", trap: `${inr(2 * P)} treats ${inr(SI)} as one year's interest; it is for 2 years.` },
      { value: clean((CI * 100) / (2 * r)), why: 'used the CI as if it were simple interest' },
      { value: P + SI, why: 'gave the amount' },
      { value: P / 2, why: 'halved the sum' },
    ],
    steps: [
      `SI for 1 year = ${inr(SI / 2)}; CI − SI = ${inr(gap)}`,
      `Rate = ${inr(gap)} × 100 ÷ ${inr(SI / 2)} = ${r}%`,
      `Sum = one year's SI × 100 ÷ r = ${inr(SI / 2)} × 100 ÷ ${r} = ${inr(P)}`,
    ],
    shortcut: `P = SI² ÷ [4 × (CI − SI)] = ${plain(SI)}² ÷ (4 × ${plain(gap)}) = ${inr(P)}.`,
    trap: `The 2-year SI covers two years; one year's interest is half of it.`,
    tags: ['interest:ci-si-difference', 'trick:ci-si-2yr'],
  };
}

/* ------------------------------------------------------------------ */
/* CI − SI, 3 years                                                    */
/* ------------------------------------------------------------------ */

export type Diff3Form = 'find-diff' | 'find-p' | 'from-diff2' | 'rate-from-diffs' | 'si-from-diff3';

export function diff3(ctx: BuildContext, form: Diff3Form, rates: readonly number[], maxP = 200000): D {
  const { rng } = ctx;
  const r = rng.pick(rates);
  const [, Dd] = factor(r);
  const P = multipleIn(rng, Dd ** 3, 5000, maxP);
  const SI3 = (3 * P * r) / 100;
  const CI3 = compound(P, r, 3) - P;
  const D3 = CI3 - SI3;
  const D2 = (P * r * r) / 10000;
  const k = plain(3 + r / 100, 4);
  const formula = `CI − SI for 3 years = P × (r/100)² × (3 + r/100)`;
  if (form === 'find-diff') {
    const two = clean((P * r * r) / 10000);
    return {
      facts: { form: 'diff3', ask: 'diff', given: { P, R: r } },
      prompt: `Find the difference between the compound interest (compounded annually) and the simple interest on ${inr(P)} at ${r}% per annum for 3 years.`,
      answer: D3,
      fmt: (x) => inr(x),
      mistakes: [
        { value: two, why: 'used the 2-year formula', trap: `${inr(two)} is the 2-year gap P(r/100)²; for 3 years multiply it by (3 + r/100).` },
        { value: clean((3 * P * r * r) / 10000), why: 'left out the (r/100)³ term', trap: `3P(r/100)² misses the interest earned on interest-on-interest in year 3.` },
        { value: clean((P * r ** 3) / 1e6), why: 'kept only the (r/100)³ term' },
        { value: SI3, why: 'gave the simple interest' },
        { value: CI3, why: 'gave the compound interest' },
      ],
      steps: [`SI for 3 years = 3 × ${r}% of ${inr(P)} = ${inr(SI3)}`, `CI for 3 years = ${inr(compound(P, r, 3))} − ${inr(P)} = ${inr(CI3)}`, `Difference = ${inr(CI3)} − ${inr(SI3)} = ${inr(D3)}`],
      shortcut: `${formula} = ${inr(D2)} × ${k} = ${inr(D3)}.`,
      trap: `For 3 years the gap is more than three times the 2-year gap.`,
      tags: ['interest:ci-si-difference', 'trick:ci-si-3yr'],
    };
  }
  if (form === 'find-p') {
    const two = clean((D3 * 10000) / (r * r));
    return {
      facts: { form: 'diff3', ask: 'principal', given: { diff: D3, R: r } },
      prompt: `The difference between the compound interest (compounded annually) and the simple interest on a sum at ${r}% per annum for 3 years is ${inr(D3)}. Find the sum.`,
      answer: P,
      fmt: (x) => inr(x),
      mistakes: [
        { value: two, why: 'used the 2-year formula', trap: `${inr(two)} uses P(r/100)², which is the 2-year gap; the 3-year gap has the extra factor (3 + r/100).` },
        { value: clean((D3 * 10000) / (3 * r * r)), why: 'left out the (r/100)³ term' },
        { value: clean((D3 * 100) / r), why: 'divided by r% only once' },
      ],
      steps: [formula, `${inr(D3)} = P × (${r}/100)² × ${k}`, `P = ${inr(D3)} ÷ (${r * r}/10000 × ${k}) = ${inr(P)}`],
      shortcut: `P = D₃ ÷ [(r/100)² × (3 + r/100)] = ${inr(D3)} ÷ ${plain((r * r * (300 + r)) / 1e6, 6)} = ${inr(P)}.`,
      trap: `Include both the 3(r/100)² and (r/100)³ parts.`,
      tags: ['interest:ci-si-difference', 'trick:ci-si-3yr'],
    };
  }
  if (form === 'from-diff2') {
    return {
      facts: { form: 'diff3', ask: 'diff3', given: { diff2: D2, R: r } },
      prompt: `The difference between the compound interest (compounded annually) and the simple interest on a certain sum at ${r}% per annum for 2 years is ${inr(D2)}. What is the difference between them on the same sum at the same rate for 3 years?`,
      answer: D3,
      fmt: (x) => inr(x),
      mistakes: [
        { value: 3 * D2, why: 'tripled the 2-year difference', trap: `${inr(3 * D2)} ignores the interest on the 2-year gap itself in year 3; multiply by (3 + r/100), not 3.` },
        { value: clean(1.5 * D2), why: 'scaled the difference in proportion to the years' },
        { value: clean(D2 * (1 + r / 100)), why: 'grew the 2-year difference by one year of interest' },
        { value: clean(D2 * (2 + r / 100)), why: 'used (2 + r/100) as the factor' },
      ],
      steps: [`2-year gap: P(r/100)² = ${inr(D2)}`, `3-year gap: P(r/100)²(3 + r/100) = ${inr(D2)} × (3 + ${r}/100)`, `= ${inr(D2)} × ${k} = ${inr(D3)}`],
      shortcut: `D₃ = D₂ × (3 + r/100).`,
      trap: `The 3-year gap is not 3 × the 2-year gap.`,
      tags: ['interest:ci-si-difference', 'trick:ci-si-3yr'],
    };
  }
  if (form === 'rate-from-diffs') {
    return {
      facts: { form: 'diff3', ask: 'rate', given: { diff2: D2, diff3: D3 } },
      prompt: `On a certain sum, the difference between the compound interest (compounded annually) and the simple interest is ${inr(D2)} for 2 years and ${inr(D3)} for 3 years, at the same rate. Find the rate of interest per annum.`,
      answer: r,
      fmt: (x) => pct(x),
      mistakes: [
        { value: clean(r / 3, 2), why: 'divided the excess by 3 × D₂', trap: `Divide the excess over 3 × D₂ by D₂ itself: D₃ − 3D₂ = D₂ × r/100.` },
        { value: clean(((D3 - D2) * 100) / (2 * D2) - 100, 2), why: 'spread the growth of the gap over 2 years' },
      ],
      steps: [`D₃ = D₂ × (3 + r/100)`, `D₃ ÷ D₂ = ${inr(D3)} ÷ ${inr(D2)} = ${k}`, `r/100 = ${k} − 3 = ${plain(r / 100, 4)}`, `r = ${r}%`],
      shortcut: `r = (D₃ − 3D₂) × 100 ÷ D₂ = ${inr(D3 - 3 * D2)} × 100 ÷ ${inr(D2)} = ${r}%.`,
      trap: `D₃/D₂ is 3 + r/100, not 1 + r/100.`,
      tags: ['interest:ci-si-difference', 'trick:ci-si-3yr'],
      choice: { step: 1 },
    };
  }
  const P2 = clean((D3 * 10000) / (r * r));
  const wrongSI = clean((3 * P2 * r) / 100);
  return {
    facts: { form: 'diff3', ask: 'si3', given: { diff: D3, R: r } },
    prompt: `The difference between the compound interest (compounded annually) and the simple interest on a sum at ${r}% per annum for 3 years is ${inr(D3)}. Find the simple interest on the same sum at the same rate for 3 years.`,
    answer: SI3,
    fmt: (x) => inr(x),
    mistakes: [
      { value: wrongSI, why: 'found the sum with the 2-year formula', trap: `${inr(wrongSI)} comes from P = D ÷ (r/100)², the 2-year formula; the 3-year gap has the extra factor (3 + r/100).` },
      { value: (2 * P * r) / 100, why: 'gave the 2-year SI' },
      { value: CI3, why: 'gave the compound interest' },
      { value: P, why: 'gave the sum instead of the interest' },
    ],
    steps: [formula, `P = ${inr(D3)} ÷ (${r * r}/10000 × ${k}) = ${inr(P)}`, `SI for 3 years = 3 × ${r}% of ${inr(P)} = ${inr(SI3)}`],
    shortcut: `SI₃ ÷ D₃ = 3(r/100) ÷ [(r/100)²(3 + r/100)] — find P first, then 3r% of it.`,
    trap: `Use the 3-year difference formula to get the sum.`,
    tags: ['interest:ci-si-difference', 'trick:ci-si-3yr'],
  };
}

/* ------------------------------------------------------------------ */
/* Sum becoming k times                                                */
/* ------------------------------------------------------------------ */

export type MultipleForm = 'si-double-rate' | 'si-k-time' | 'si-k1-k2' | 'si-frac-rate' | 'ci-power' | 'si-to-ci' | 'ci-power-frac';

export function multiple(ctx: BuildContext, form: MultipleForm): D {
  const { rng } = ctx;
  if (form === 'si-double-rate') {
    const n = rng.pick([4, 5, 8, 10, 16, 20, 25]);
    const R = 100 / n;
    const twice = clean(200 / n, 2);
    return {
      facts: { form: 'multiple', ask: 'rate', given: { ci: 0, k1: 2, years1: n } },
      prompt: rng.pick([
        `At what rate of simple interest per annum will a sum of money double itself in ${yrs(n)}?`,
        `A sum of money lent at simple interest doubles itself in ${yrs(n)}. Find the rate of interest per annum.`,
      ]),
      answer: R,
      fmt: (x) => pct(x),
      mistakes: [
        { value: twice, why: "took 'double' to mean interest = twice the sum", trap: `When the sum doubles, the interest equals the sum once (100%), not twice.` },
        { value: clean(100 / (n + 1), 2), why: 'counted one year too many' },
        { value: clean(100 / (n - 1), 2), why: 'counted one year too few' },
      ],
      steps: [`Doubling means SI = P, i.e. 100% of P`, `100% in ${yrs(n)} → ${plain(R)}% per year`],
      shortcut: `Rate = 100 ÷ ${n} = ${plain(R)}%.`,
      trap: `Doubling adds 100% of the sum as interest.`,
      tags: ['interest:simple', 'interest:doubling'],
    };
  }
  if (form === 'si-k-time') {
    const n = rng.pick([4, 5, 6, 8, 10, 12]);
    const k = rng.pick([3, 4, 5]);
    const ans = n * (k - 1);
    const prop = clean((n * k) / 2);
    return {
      facts: { form: 'multiple', ask: 'time', given: { ci: 0, k1: 2, years1: n, k2: k } },
      prompt: `A sum of money doubles itself in ${yrs(n)} at simple interest. In how many years will it become ${k} times itself at the same rate?`,
      answer: ans,
      fmt: (x) => yrs(x),
      mistakes: [
        { value: prop, why: 'scaled the doubling time in proportion to the multiple', trap: `${yrs(prop)} scales by ${k}/2, but only the interest grows linearly: ${k} times needs ${k - 1} × 100% interest.` },
        { value: n * k, why: 'multiplied the doubling time by the multiple', trap: `Becoming ${k} times means interest of ${k - 1} times the sum, not ${k} times.` },
        { value: n * (k - 1) + n, why: 'counted one doubling period too many' },
      ],
      steps: [`Doubling: interest = 100% of P in ${yrs(n)}`, `${k} times: interest = ${(k - 1) * 100}% of P`, `Time = ${k - 1} × ${n} = ${yrs(ans)}`],
      shortcut: `Interest needed ÷ interest per ${n} years = (${k} − 1) ÷ (2 − 1) = ${k - 1} periods of ${n} years.`,
      trap: `Count the interest, not the multiple: ${k} times = ${k - 1} times the sum as interest.`,
      tags: ['interest:simple', 'interest:doubling'],
      choice: { step: 1 },
    };
  }
  if (form === 'si-k1-k2') {
    const k1 = rng.pick([2, 3, 4]);
    const n = (k1 - 1) * rng.pick([2, 3, 4, 5]);
    const k2 = k1 + rng.int(1, 4);
    const ans = (n * (k2 - 1)) / (k1 - 1);
    return {
      facts: { form: 'multiple', ask: 'time', given: { ci: 0, k1, years1: n, k2 } },
      prompt: `A sum of money becomes ${k1} times itself in ${yrs(n)} at simple interest. In how many years will it become ${k2} times itself at the same rate?`,
      answer: ans,
      fmt: (x) => yrs(x),
      mistakes: [
        { value: clean((n * k2) / k1), why: 'scaled the time by the ratio of the multiples', trap: `Time is proportional to the interest (multiple − 1), not to the multiple itself.` },
        { value: n * (k2 - k1), why: 'used the extra multiple only' },
        { value: clean((n * (k2 - 1)) / k1), why: 'divided by the first multiple instead of (multiple − 1)' },
      ],
      steps: [`Interest of ${k1 - 1} × P takes ${yrs(n)} → ${plain(n / (k1 - 1))} years per 100%`, `${k2} times needs interest of ${k2 - 1} × P`, `Time = ${k2 - 1} × ${plain(n / (k1 - 1))} = ${yrs(ans)}`],
      shortcut: `T₂ = T₁ × (k₂ − 1) ÷ (k₁ − 1) = ${n} × ${k2 - 1} ÷ ${k1 - 1} = ${ans}.`,
      trap: `Work with interest multiples (k − 1), not the amount multiples.`,
      tags: ['interest:simple', 'interest:doubling'],
      choice: { step: 1 },
    };
  }
  if (form === 'si-frac-rate') {
    const opt = rng.pick([
      { p: 7, q: 5, n: 4 },
      { p: 5, q: 4, n: 5 },
      { p: 8, q: 5, n: 6 },
      { p: 3, q: 2, n: 4 },
      { p: 6, q: 5, n: 2 },
      { p: 9, q: 8, n: 2 },
      { p: 13, q: 10, n: 3 },
      { p: 11, q: 8, n: 3 },
      { p: 7, q: 4, n: 6 },
      { p: 9, q: 5, n: 8 },
    ]);
    const R = ((opt.p / opt.q - 1) * 100) / opt.n;
    return {
      facts: { form: 'multiple', ask: 'rate', given: { ci: 0, fracNum: opt.p, fracDen: opt.q, years1: opt.n } },
      prompt: `A sum of money at simple interest becomes ${fracTex(opt.p, opt.q)} of itself in ${yrs(opt.n)}. Find the rate of interest per annum.`,
      answer: R,
      fmt: (x) => pct(x),
      mistakes: [
        { value: clean((opt.p / opt.q - 1) * 100, 2), why: 'forgot to divide by the time', trap: `${pct((opt.p / opt.q - 1) * 100)} is the interest for all ${opt.n} years; divide by ${opt.n}.` },
        { value: clean((opt.p / opt.q) * (100 / opt.n), 2), why: 'used the whole amount as the interest', trap: `The amount is ${fracTex(opt.p, opt.q)} of the sum; the interest is only ${fracTex(opt.p - opt.q, opt.q)} of it.` },
      ],
      steps: [`Interest = ${fracTex(opt.p, opt.q)}P − P = ${fracTex(opt.p - opt.q, opt.q)}P = ${plain((opt.p / opt.q - 1) * 100)}% of P`, `Rate = ${plain((opt.p / opt.q - 1) * 100)}% ÷ ${opt.n} = ${pct(R)}`],
      shortcut: `Rate = (fraction − 1) × 100 ÷ time.`,
      trap: `Subtract the principal before converting to a rate.`,
      tags: ['interest:simple', 'interest:doubling'],
    };
  }
  if (form === 'ci-power') {
    const b = rng.pick([2, 2, 3]);
    const m = rng.pick(b === 2 ? [2, 3, 4] : [2, 3]);
    const n = rng.int(3, 8);
    const target = b ** m;
    const ans = m * n;
    const word = b === 2 ? 'doubles' : 'triples';
    const prop = clean((n * target) / b);
    const siThink = clean((n * (target - 1)) / (b - 1));
    return {
      facts: { form: 'multiple', ask: 'time', given: { ci: 1, k1: b, years1: n, k2: target } },
      prompt: `A sum of money ${word} itself in ${yrs(n)} at compound interest (compounded annually). In how many years will it become ${target} times itself?`,
      answer: ans,
      fmt: (x) => yrs(x),
      mistakes: [
        { value: prop, why: `divided the target multiple by ${b}`, trap: `${yrs(prop)} scales time in proportion to the multiple; under CI the multiple grows as a power: ${target} = ${b}^${m}.` },
        { value: siThink, why: 'treated it as simple interest', trap: `Linear growth is simple interest; with compounding every ${n} years the whole sum is multiplied by ${b}.` },
        { value: n * target, why: 'multiplied the time by the target multiple' },
      ],
      steps: [`Every ${yrs(n)} the amount is multiplied by ${b}`, `${target} = $${b}^{${m}}$, so ${m} such periods are needed`, `Time = ${m} × ${n} = ${yrs(ans)}`],
      shortcut: `Under CI, multiples compound: ${b} → $${b}^{2}$ → $${b}^{3}$… one step every ${yrs(n)}.`,
      trap: `CI multiplies; SI adds.`,
      tags: ['interest:compound', 'interest:doubling'],
      choice: { step: 1 },
    };
  }
  if (form === 'si-to-ci') {
    const n = rng.pick([4, 5, 8, 10, 20]);
    const R = 100 / n;
    const [, Dd] = factor(R);
    const X = multipleIn(rng, Dd * Dd, 5000, 50000);
    const CI = compound(X, R, 2) - X;
    const SI = (2 * X * R) / 100;
    return {
      facts: { form: 'multiple', ask: 'ci', given: { ci: 0, k1: 2, years1: n, X } },
      prompt: `A sum of money doubles itself in ${yrs(n)} at simple interest. What will be the compound interest (compounded annually) on ${inr(X)} for 2 years at the same rate?`,
      answer: CI,
      fmt: (x) => inr(x),
      mistakes: [
        { value: SI, why: 'gave simple interest', trap: `${inr(SI)} is the simple interest; the question asks for compound interest at that rate.` },
        { value: (X * R) / 100, why: "gave one year's interest" },
        { value: X + CI, why: 'gave the amount' },
        { value: clean((X * R * R) / 10000), why: 'gave only the CI − SI difference' },
      ],
      steps: [`Doubling in ${yrs(n)} at SI → rate = 100 ÷ ${n} = ${plain(R)}%`, `CI = ${inr(X)} × (1 + ${plain(R)}/100)² − ${inr(X)}`, `= ${inr(X + CI)} − ${inr(X)} = ${inr(CI)}`],
      shortcut: `Two-year effective rate = ${plain(R)} + ${plain(R)} + ${plain(R)}²/100 = ${plain(2 * R + (R * R) / 100)}% of ${inr(X)}.`,
      trap: `Find the rate from the SI doubling, then compound it.`,
      tags: ['interest:compound', 'interest:doubling'],
    };
  }
  // ci-power-frac: becomes b² times in n years (n even) → b^m times
  const b = rng.pick([2, 3]);
  const m = rng.pick(b === 2 ? [3, 5] : [3]);
  const n = 2 * rng.int(2, 5);
  const target = b ** m;
  const ans = (m * n) / 2;
  const prop = clean((n * target) / (b * b));
  const siThink = clean((n * (target - 1)) / (b * b - 1));
  return {
    facts: { form: 'multiple', ask: 'time', given: { ci: 1, k1: b * b, years1: n, k2: target } },
    prompt: `A sum of money becomes ${b * b} times itself in ${yrs(n)} at compound interest (compounded annually). In how many years will it become ${target} times itself?`,
    answer: ans,
    fmt: (x) => yrs(x),
    mistakes: [
      { value: prop, why: 'scaled time in proportion to the multiple', trap: `${yrs(prop)} scales linearly; under CI, ${b * b} = $${b}^{2}$ in ${n} years means ×${b} every ${n / 2} years.` },
      { value: siThink, why: 'treated it as simple interest' },
      { value: m * n, why: `took ${b * b} times as one step of ×${b}` },
    ],
    steps: [`${b * b} = $${b}^{2}$ in ${yrs(n)} → the sum is multiplied by ${b} every ${yrs(n / 2)}`, `${target} = $${b}^{${m}}$ → ${m} steps`, `Time = ${m} × ${n / 2} = ${yrs(ans)}`],
    shortcut: `Write both multiples as powers of ${b}: time is proportional to the exponent (${m} vs 2).`,
    trap: `Exponents, not multiples, scale with time under CI.`,
    tags: ['interest:compound', 'interest:doubling'],
    choice: { step: 1 },
  };
}

/* ------------------------------------------------------------------ */
/* Sum split at different rates                                        */
/* ------------------------------------------------------------------ */

export type SplitForm = 'annual' | 'total-t' | 'equal-interest' | 'three-equal' | 'interest-gap' | 'ci-equal';

export function split(ctx: BuildContext, form: SplitForm): D {
  const { rng } = ctx;
  const p = person(rng);
  if (form === 'annual' || form === 'total-t') {
    const r1 = rng.pick([4, 5, 6, 8, 9, 10]);
    const r2 = r1 + rng.pick([2, 3, 4, 5, 6]);
    const t = form === 'annual' ? 1 : rng.int(2, 4);
    const S = rng.int(form === 'annual' ? 6 : 8, form === 'annual' ? 24 : 40) * 1000;
    let x = rng.int(Math.ceil(S / 2500), Math.floor((4 * S) / 2500)) * 500;
    if (2 * x === S) x += 500;
    const I = (t * (x * r1 + (S - x) * r2)) / 100;
    const askLow = rng.chance(0.5);
    const askRate = askLow ? r1 : r2;
    const ans = askLow ? x : S - x;
    const other = S - ans;
    const allLow = (S * r1 * t) / 100;
    const extra = I - allLow;
    const avg = clean((100 * I) / (S * t), 2);
    const [ra, rb] = reduce(x, S - x);
    const prompt =
      form === 'annual'
        ? `${p.name} lent ${inr(S)} in two parts, one at ${r1}% and the other at ${r2}% per annum simple interest. ${cap(p.he)} receives ${inr(I)} as interest every year. How much did ${p.he} lend at ${askRate}%?`
        : `${p.name} invested ${inr(S)} in two schemes, a part at ${r1}% and the rest at ${r2}% per annum simple interest. The total interest earned in ${yrs(t)} was ${inr(I)}. How much was invested at ${askRate}%?`;
    return {
      facts: { form: 'split-two', ask: 'part', given: { S, r1, r2, t, I, askRate } },
      prompt,
      answer: ans,
      fmt: (v) => inr(v),
      mistakes: [
        { value: other, why: 'gave the part at the other rate', trap: `${inr(other)} is the part at ${askLow ? r2 : r1}% — check which part goes with which rate.` },
        { value: S / 2, why: 'assumed an equal split', trap: `An equal split would give ${inr((t * S * (r1 + r2)) / 200)} of interest, not ${inr(I)}.` },
        { value: (100 * I) / (t * askRate) < S ? clean((100 * I) / (t * askRate)) : NaN, why: 'put all the interest on one part' },
      ],
      steps: [
        `If all ${inr(S)} earned ${r1}%, interest ${t > 1 ? `for ${yrs(t)}` : 'per year'} = ${inr(allLow)}`,
        `Actual interest is ${inr(extra)} more`,
        `Each ₹100 moved to ${r2}% earns ₹${(r2 - r1) * t} more${t > 1 ? ` in ${yrs(t)}` : ''}`,
        `Part at ${r2}% = ${inr(extra)} × 100 ÷ ${(r2 - r1) * t} = ${inr(S - x)}`,
        ...(askLow ? [`Part at ${r1}% = ${inr(S)} − ${inr(S - x)} = ${inr(x)}`] : []),
      ],
      shortcut: Number.isFinite(avg)
        ? `Alligation: average rate = ${plain(avg)}%, so (part at ${r1}%) : (part at ${r2}%) = (${r2} − ${plain(avg)}) : (${plain(avg)} − ${r1}) = ${ra} : ${rb}.`
        : `Assume everything at ${r1}% and move the excess interest to the ${r2}% part.`,
      trap: `The part at the higher rate is found from the excess interest.`,
      tags: ['interest:simple', 'interest:split', 'trick:alligation'],
      choice: { step: stepWithin(Math.min(ans, S - ans)) },
    };
  }
  if (form === 'equal-interest') {
    let r1: number;
    let r2: number;
    let t1: number;
    let t2: number;
    do {
      [r1, r2] = rng.sample([4, 5, 6, 8, 10, 12, 15], 2);
      t1 = rng.int(2, 5);
      t2 = rng.int(2, 5);
    } while (r1 * t1 === r2 * t2);
    const [a, b] = reduce(r2 * t2, r1 * t1);
    const k = multipleIn(rng, 100, 1000, 60000 / (a + b), [500, 100]);
    const S = (a + b) * k;
    const first = a * k;
    const askFirst = rng.chance(0.5);
    const ans = askFirst ? first : S - first;
    const byRates = clean((S * (askFirst ? r2 : r1)) / (r1 + r2));
    return {
      facts: { form: 'split-equal', ask: 'part', given: { S, r1, t1, r2, t2, which: askFirst ? 1 : 2 } },
      prompt: `Divide ${inr(S)} into two parts such that the simple interest on the first part for ${yrs(t1)} at ${r1}% per annum equals the simple interest on the second part for ${yrs(t2)} at ${r2}% per annum. What is the ${askFirst ? 'first' : 'second'} part?`,
      answer: ans,
      fmt: (v) => inr(v),
      mistakes: [
        { value: S - ans, why: 'split in the direct ratio of rate × time (swapped the parts)', trap: `${inr(S - ans)} is the other part — equal interest needs the parts in the inverse ratio of rate × time.` },
        { value: S / 2, why: 'assumed an equal split' },
        { value: byRates, why: 'ignored the times' },
        { value: clean((S * (askFirst ? t2 : t1)) / (t1 + t2)), why: 'ignored the rates' },
      ],
      steps: [
        `First part × ${r1} × ${t1} = second part × ${r2} × ${t2}`,
        `First : second = ${r2 * t2} : ${r1 * t1} = ${a} : ${b}`,
        `${askFirst ? 'First' : 'Second'} part = ${inr(S)} × ${askFirst ? a : b}/${a + b} = ${inr(ans)}`,
      ],
      shortcut: `Equal interest → parts inversely proportional to (rate × time): ${a} : ${b}.`,
      trap: `Bigger rate × time needs the smaller part.`,
      tags: ['interest:simple', 'interest:split'],
      choice: { step: stepWithin(Math.min(ans, S - ans)) },
    };
  }
  if (form === 'three-equal') {
    const rates = rng.sample([4, 5, 6, 8, 10, 12, 15, 20], 3).sort((a, b) => a - b);
    const L = rates.reduce((acc, r) => lcm(acc, r), 1);
    const raw = rates.map((r) => L / r);
    const g = raw.reduce((acc, v) => gcd(acc, v), 0);
    const parts = raw.map((v) => v / g);
    const total = parts[0] + parts[1] + parts[2];
    const k = multipleIn(rng, 100, 1000, 150000 / total, [500, 100]);
    const S = total * k;
    const i = rng.int(0, 2);
    const ans = parts[i] * k;
    const j = i === 0 ? 2 : 0;
    const direct = clean((S * rates[i]) / (rates[0] + rates[1] + rates[2]));
    return {
      facts: { form: 'split-three', ask: 'part', given: { S, askRate: rates[i] }, list: rates },
      prompt: `${inr(S)} is divided into three parts such that the simple interest on them at ${rates[0]}%, ${rates[1]}% and ${rates[2]}% per annum respectively, for the same period, is equal. Find the part invested at ${rates[i]}%.`,
      answer: ans,
      fmt: (v) => inr(v),
      mistakes: [
        { value: direct, why: 'split in the direct ratio of the rates', trap: `${inr(direct)} splits in the ratio of the rates; equal interest needs the inverse ratio (higher rate → smaller part).` },
        { value: parts[j] * k, why: 'picked the part for another rate', trap: `${inr(parts[j] * k)} is the part at ${rates[j]}%.` },
        { value: clean(S / 3), why: 'assumed equal parts' },
      ],
      steps: [
        `Equal interest for the same period → part × rate is the same for all three`,
        `Parts ∝ 1/${rates[0]} : 1/${rates[1]} : 1/${rates[2]} = ${raw.join(' : ')} (× ${L})${g > 1 ? ` = ${parts.join(' : ')}` : ''}`,
        `Part at ${rates[i]}% = ${inr(S)} × ${parts[i]}/${total} = ${inr(ans)}`,
      ],
      shortcut: `Inverse ratio of rates: multiply 1/${rates[0]}, 1/${rates[1]}, 1/${rates[2]} by the LCM ${L}.`,
      trap: `The highest rate gets the smallest part.`,
      tags: ['interest:simple', 'interest:split'],
      choice: { step: stepWithin(Math.min(ans, S - ans)) },
    };
  }
  if (form === 'interest-gap') {
    let r1 = 0;
    let r2 = 0;
    let t = 0;
    let S = 0;
    let x = 0;
    let d = 0;
    for (let tries = 0; tries < 50; tries++) {
      [r1, r2] = rng.sample([4, 5, 6, 8, 10, 12], 2);
      t = rng.int(1, 4);
      S = rng.int(10, 40) * 1000;
      x = rng.int(2, S / 500 - 2) * 500;
      d = (t * (x * r1 - (S - x) * r2)) / 100;
      if (d > 0 && Number.isInteger(d) && 2 * x !== S) break;
    }
    if (!(d > 0 && Number.isInteger(d) && 2 * x !== S)) {
      r1 = 10;
      r2 = 8;
      t = 2;
      S = 20000;
      x = 12000;
      d = (t * (x * r1 - (S - x) * r2)) / 100;
    }
    const flipped = clean((S * r2 - (100 * d) / t) / (r1 + r2));
    return {
      facts: { form: 'split-gap', ask: 'part', given: { S, r1, r2, t, gap: d } },
      prompt: `${inr(S)} is lent in two parts, the first at ${r1}% and the second at ${r2}% per annum simple interest. The interest on the first part for ${yrs(t)} exceeds the interest on the second part for ${yrs(t)} by ${inr(d)}. Find the first part.`,
      answer: x,
      fmt: (v) => inr(v),
      mistakes: [
        { value: S - x, why: 'gave the second part', trap: `${inr(S - x)} is the second part.` },
        { value: flipped < S ? flipped : NaN, why: 'took the gap the other way round', trap: `That makes the second part's interest the larger one; here the first part earns ${inr(d)} more.` },
        { value: ((100 * d) / t + S * r1) / (r1 + r2) < S ? clean(((100 * d) / t + S * r1) / (r1 + r2)) : NaN, why: 'mixed up the two rates' },
      ],
      steps: [
        `Let the first part be ₹x: x × ${r1} × ${t}/100 − (${S} − x) × ${r2} × ${t}/100 = ${d}`,
        `x × ${plain(((r1 + r2) * t) / 100)} = ${d} + ${plain((S * r2 * t) / 100)} = ${plain(d + (S * r2 * t) / 100)}`,
        `x = ${inr(x)}`,
      ],
      shortcut: `Form one linear equation in the first part and solve; check with the options.`,
      trap: `Keep track of which part earns more.`,
      tags: ['interest:simple', 'interest:split'],
      choice: { step: stepWithin(Math.min(x, S - x)) },
    };
  }
  // ci-equal
  const r = rng.pick([4, 5, 10, 20, 25]);
  const delta = [10, 20, 25].includes(r) && rng.chance(0.4) ? 2 : 1;
  const [N, Dd] = factor(r);
  const a = N ** delta;
  const b = Dd ** delta;
  const k = multipleIn(rng, 1, Math.ceil(5000 / (a + b)), Math.floor(250000 / (a + b)), [100, 50, 10]);
  const S = (a + b) * k;
  const bigShare = a * k;
  const smallShare = b * k;
  const ages = rng.chance(0.5);
  const askBig = rng.chance(0.5);
  const ans = askBig ? bigShare : smallShare;
  let prompt: string;
  let tShort: number;
  let tLong: number;
  if (ages) {
    const target = rng.pick([18, 21]);
    const elder = rng.int(12, target - 2);
    const younger = elder - delta;
    tShort = target - elder;
    tLong = target - younger;
    prompt = `${p.name} divides ${inr(S)} between ${p.his} two children, aged ${elder} and ${younger} years, and invests each share at ${r}% per annum compound interest, compounded annually, so that each child receives the same amount on turning ${target}. What is the ${askBig ? 'elder' : 'younger'} child's share?`;
  } else {
    tShort = rng.int(1, 3);
    tLong = tShort + delta;
    prompt = `Divide ${inr(S)} between A and B so that the amount of A's share after ${yrs(tShort)} equals the amount of B's share after ${yrs(tLong)}, both at ${r}% per annum compound interest, compounded annually. What is ${askBig ? "A's" : "B's"} share?`;
  }
  const siRatioA = 100 + r * tLong;
  const siRatioB = 100 + r * tShort;
  const siShare = clean((S * (askBig ? siRatioA : siRatioB)) / (siRatioA + siRatioB));
  return {
    facts: { form: 'split-ci', ask: 'part', given: { S, R: r, tShort, tLong, askShort: askBig ? 1 : 0 } },
    prompt,
    answer: ans,
    fmt: (v) => inr(v),
    mistakes: [
      { value: askBig ? smallShare : bigShare, why: 'swapped the two shares', trap: `${inr(askBig ? smallShare : bigShare)} is the other share — the one invested for fewer years must be larger.` },
      { value: S / 2, why: 'split equally' },
      { value: siShare, why: 'used simple interest' },
      ...(delta === 2 ? [{ value: clean((S * (askBig ? N : Dd)) / (N + Dd)), why: 'used one year of growth instead of two' }] : []),
    ],
    steps: [
      `Let the shares be x (for ${yrs(tShort)}) and y (for ${yrs(tLong)})`,
      `x × $\\left(\\frac{${N}}{${Dd}}\\right)^{${tShort}}$ = y × $\\left(\\frac{${N}}{${Dd}}\\right)^{${tLong}}$`,
      `x : y = $\\left(\\frac{${N}}{${Dd}}\\right)^{${delta}}$ = ${a} : ${b}`,
      `${askBig ? 'x' : 'y'} = ${inr(S)} × ${askBig ? a : b}/${a + b} = ${inr(ans)}`,
    ],
    shortcut: `Only the gap in years matters: shares are in the ratio (1 + r/100)^gap : 1 = ${a} : ${b}.`,
    trap: `The share invested for fewer years must be bigger.`,
    tags: ['interest:compound', 'interest:split'],
    choice: { step: stepWithin(Math.min(ans, S - ans)) },
  };
}

/* ------------------------------------------------------------------ */
/* Instalments                                                         */
/* ------------------------------------------------------------------ */

export type InstalmentForm = 'ci2-inst' | 'ci2-loan' | 'ci3-inst' | 'si-inst';

export function instalments(ctx: BuildContext, form: InstalmentForm): D {
  const { rng } = ctx;
  const p = person(rng);
  const who = lender(rng);
  if (form === 'si-inst') {
    const T = rng.int(2, 4);
    const r = rng.pick([5, 6, 8, 10, 12, 15]);
    const coef = 200 * T + r * T * (T - 1);
    const unit = 200 / gcd(200, coef);
    const x = multipleIn(rng, unit, 2000, 30000, [100, 50, 10]);
    const A = (x * coef) / 200;
    const pairs = (T * (T - 1)) / 2;
    return {
      facts: { form: 'si-instalment', ask: 'instalment', given: { A, T, R: r } },
      prompt: `What equal annual instalment, paid at the end of each year, will discharge a debt of ${inr(A)} due in ${yrs(T)} at ${r}% per annum simple interest?`,
      answer: x,
      fmt: (v) => inr(v),
      mistakes: [
        { value: clean(A / T), why: 'divided the debt equally, ignoring interest', trap: `${inr(A / T)} ignores that earlier instalments earn interest until the debt falls due.` },
        { value: clean((A * 100) / ((100 + r * T) * T)), why: 'removed interest on the whole debt, then divided equally' },
        { value: clean((A * 200) / (200 * T + r * T * (T + 1))), why: 'gave every instalment one extra year of interest' },
      ],
      steps: [
        `An instalment paid at the end of year k earns SI for (${T} − k) years until the due date`,
        `Total value on the due date: x × [${T} + ${r}/100 × (${Array.from({ length: T }, (_, i) => T - 1 - i).join(' + ')})] = x × (${T} + ${plain((r * pairs) / 100)})`,
        `x × ${plain(coef / 200)} = ${inr(A)}`,
        `x = ${inr(A)} ÷ ${plain(coef / 200)} = ${inr(x)}`,
      ],
      shortcut: `x = Debt ÷ [T + r × T(T − 1)/200] = ${inr(A)} ÷ ${plain(coef / 200)}.`,
      trap: `Instalments paid early earn interest until the due date.`,
      tags: ['interest:simple', 'interest:instalments'],
    };
  }
  const three = form === 'ci3-inst';
  const r = three ? rng.pick([5, 10, 20, 25]) : rng.pick([4, 5, 8, 10, 20, 25]);
  const [N, Dd] = factor(r);
  const unit = three ? Dd * (N * N + N * Dd + Dd * Dd) : Dd * (N + Dd);
  const k = multipleIn(rng, 1, Math.ceil(5000 / unit), Math.floor(250000 / unit), [100, 50, 10, 5]);
  const P = unit * k;
  const I = (three ? N ** 3 : N * N) * k;
  const n = three ? 3 : 2;
  const units = three ? [N * N * Dd, N * Dd * Dd, Dd ** 3] : [N * Dd, Dd * Dd];
  const instUnits = three ? N ** 3 : N * N;
  if (form === 'ci2-loan') {
    const twice = 2 * I;
    return {
      facts: { form: 'ci-instalment', ask: 'loan', given: { I, R: r, n } },
      prompt: `${p.name} repaid a loan in two equal annual instalments of ${inr(I)} each, the first at the end of the first year. If interest was charged at ${r}% per annum compounded annually, how much had ${p.he} borrowed?`,
      answer: P,
      fmt: (v) => inr(v),
      mistakes: [
        { value: twice, why: 'added the instalments', trap: `${inr(twice)} is the total repaid; part of each instalment is interest, so the loan is smaller.` },
        { value: clean((twice * Dd) / N), why: 'discounted both instalments by one year' },
        { value: clean((twice * Dd * Dd) / (N * N)), why: 'discounted both instalments by two years' },
        { value: clean((twice * 100) / (100 + 2 * r)), why: 'removed simple interest for 2 years' },
      ],
      steps: [
        `Present value of the 1st instalment = ${inr(I)} ÷ ${fracTex(N, Dd)} = ${inr((I * Dd) / N)}`,
        `Present value of the 2nd instalment = ${inr(I)} ÷ $\\left(\\frac{${N}}{${Dd}}\\right)^{2}$ = ${inr((I * Dd * Dd) / (N * N))}`,
        `Loan = ${inr((I * Dd) / N)} + ${inr((I * Dd * Dd) / (N * N))} = ${inr(P)}`,
      ],
      shortcut: `Take each instalment = ${instUnits} units; its present values are ${units.join(' and ')} units, so the loan = ${unit} units.`,
      trap: `Each instalment must be discounted for the years before it is paid.`,
      tags: ['interest:compound', 'interest:instalments'],
    };
  }
  const g = N / Dd;
  const naive = clean((P * g ** n) / n);
  return {
    facts: { form: 'ci-instalment', ask: 'instalment', given: { P, R: r, n } },
    prompt: `${p.name} borrowed ${inr(P)} from ${who} at ${r}% per annum compound interest, compounded annually. The loan is to be repaid in ${three ? 'three' : 'two'} equal annual instalments, the first at the end of the first year. Find the amount of each instalment.`,
    answer: I,
    fmt: (v) => inr(v),
    mistakes: [
      { value: naive, why: `split the ${n}-year amount into ${n} equal parts`, trap: `${inr(naive)} splits the ${n}-year amount equally, but the early instalments are paid before the full interest builds up.` },
      { value: clean((P / n) * g), why: 'added one year of interest to an equal share' },
      { value: clean((P * (1 + (n * r) / 100)) / n), why: 'used simple interest' },
      { value: clean(P / n), why: 'ignored the interest' },
    ],
    steps: [
      `Let each instalment be ₹x. Its present values are x ÷ ${fracTex(N, Dd)}${three ? `, x ÷ $\\left(\\frac{${N}}{${Dd}}\\right)^{2}$ and x ÷ $\\left(\\frac{${N}}{${Dd}}\\right)^{3}$` : ` and x ÷ $\\left(\\frac{${N}}{${Dd}}\\right)^{2}$`}`,
      `Sum of present values = loan: x × ${unit}/${instUnits} = ${inr(P)}`,
      `x = ${inr(P)} × ${instUnits} ÷ ${unit} = ${inr(I)}`,
    ],
    shortcut: `Take each instalment = ${instUnits} units; its present values are ${units.join(', ')} units, so the loan = ${unit} units = ${inr(P)} → 1 unit = ${inr(k)} → instalment = ${inr(I)}.`,
    trap: `Discount each instalment separately; they are paid at different times.`,
    tags: ['interest:compound', 'interest:instalments'],
  };
}
