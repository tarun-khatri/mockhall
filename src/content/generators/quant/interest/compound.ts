/**
 * Compound-interest scenarios for quant.interest (subtypes ci-annual, ci-half-yearly, ci-quarterly).
 * Principals are multiples of Dⁿ (rate factor N/D per period) so every intermediate amount is a whole rupee.
 */
import type { BuildContext } from '../../types';
import type { Rng } from '../../../../lib/rng';
import type { InterestFacts } from '../interest';
import { inr, lcm, pct, plain } from '../../../../lib/format';
import { type Draft, type Mis, clean, compound, compoundPath, factor, multipleIn, person, scheme, lender, stepWithin, yearsText } from './kit';

type D = Draft<InterestFacts>;
export type Mode = 'annual' | 'half' | 'quarter';

const PER_YEAR: Record<Mode, number> = { annual: 1, half: 2, quarter: 4 };
const PERIOD_WORD: Record<Mode, string> = { annual: 'Year', half: 'Half-year', quarter: 'Quarter' };
const COMPOUNDED: Record<Mode, string> = { annual: 'compounded annually', half: 'compounded half-yearly', quarter: 'compounded quarterly' };

/** "2 years", "1½ years" (as KaTeX), "9 months". */
export function spanText(mode: Mode, n: number): string {
  const months = (12 * n) / PER_YEAR[mode];
  if (months % 12 === 0) return yearsText(months / 12);
  if (months % 6 === 0 && months > 12) return `$${Math.floor(months / 12)}\\frac{1}{2}$ years`;
  return `${months} months`;
}

function tex(N: number, Dn: number, n: number): string {
  return `$\\left(\\frac{${N}}{${Dn}}\\right)^{${n}}$`;
}

function powTex(base: number, n: number): string {
  return n > 1 ? `$${base}^{${n}}$` : String(base);
}

/** Year-by-year (or period-by-period) lines. */
function periodLines(mode: Mode, path: number[], r: number): string[] {
  const out: string[] = [];
  for (let i = 1; i < path.length; i++) {
    out.push(`${PERIOD_WORD[mode]} ${i}: interest = ${plain(r)}% of ${inr(path[i - 1])} = ${inr(path[i] - path[i - 1])} → amount ${inr(path[i])}`);
  }
  return out;
}

function ratioShortcut(P: number, r: number, n: number): string {
  const [N, Dd] = factor(r);
  const Dn = Dd ** n;
  const Nn = N ** n;
  const k = P / Dn;
  return `Ratio method: ${plain(r)}% means each period multiplies the amount by ${N}/${Dd}, so Principal : Amount = ${powTex(Dd, n)} : ${powTex(N, n)} = ${Dn} : ${Nn}. Here P = ${Dn} × ${plain(k)}, so A = ${Nn} × ${plain(k)} = ${inr(Nn * k)}.`;
}

interface Plan {
  mode: Mode;
  R: number;
  n: number;
}

function principalFor(rng: Rng, plan: Plan, min: number, max: number): number {
  const r = plan.R / PER_YEAR[plan.mode];
  const [, Dd] = factor(r);
  return multipleIn(rng, Dd ** plan.n, min, max);
}

type Level = 'easy' | 'medium' | 'hard';

const ANNUAL_PLANS: Record<Level, Plan[]> = {
  easy: [5, 10, 20].map((R) => ({ mode: 'annual' as const, R, n: 2 })),
  medium: [
    ...[4, 5, 8, 10, 12, 15, 20, 25].map((R) => ({ mode: 'annual' as const, R, n: 2 })),
    ...[5, 10, 20].map((R) => ({ mode: 'annual' as const, R, n: 3 })),
  ],
  hard: [
    ...[4, 5, 10, 12.5, 15, 20].map((R) => ({ mode: 'annual' as const, R, n: 3 })),
    { mode: 'annual', R: 10, n: 4 },
    { mode: 'annual', R: 20, n: 4 },
  ],
};

const HALF_PLANS: Record<Level, Plan[]> = {
  easy: [8, 10, 20].map((R) => ({ mode: 'half' as const, R, n: 2 })),
  medium: [
    { mode: 'half', R: 10, n: 3 },
    { mode: 'half', R: 20, n: 3 },
    { mode: 'half', R: 12, n: 2 },
    { mode: 'half', R: 16, n: 2 },
  ],
  hard: [
    { mode: 'half', R: 20, n: 4 },
    { mode: 'half', R: 10, n: 4 },
    { mode: 'half', R: 40, n: 4 },
    { mode: 'half', R: 8, n: 3 },
  ],
};

const QUARTER_PLANS: Record<Level, Plan[]> = {
  easy: [
    { mode: 'quarter', R: 20, n: 2 },
    { mode: 'quarter', R: 40, n: 2 },
    { mode: 'quarter', R: 12, n: 2 },
    { mode: 'quarter', R: 16, n: 2 },
  ],
  medium: [
    { mode: 'quarter', R: 20, n: 3 },
    { mode: 'quarter', R: 40, n: 3 },
    { mode: 'quarter', R: 40, n: 4 },
  ],
  hard: [
    { mode: 'quarter', R: 20, n: 4 },
    { mode: 'quarter', R: 40, n: 4 },
    { mode: 'quarter', R: 16, n: 3 },
  ],
};

const PLANS: Record<Mode, Record<Level, Plan[]>> = { annual: ANNUAL_PLANS, half: HALF_PLANS, quarter: QUARTER_PLANS };

const RANGE: Record<Level, [number, number]> = { easy: [4000, 40000], medium: [5000, 80000], hard: [5000, 200000] };

/** Mistakes common to every "find CI / amount" question. */
function ciMistakes(plan: Plan, P: number, ask: 'ci' | 'amount'): Mis[] {
  const { mode, R, n } = plan;
  const k = PER_YEAR[mode];
  const r = R / k;
  const years = n / k;
  const A = compound(P, r, n);
  const CI = A - P;
  const SI = (P * R * years) / 100;
  const out: Mis[] = [];
  const asAsked = (amount: number) => (ask === 'ci' ? amount - P : amount);
  if (mode !== 'annual') {
    let slower: number;
    let label: string;
    if (mode === 'half') {
      label = 'compounded annually instead of half-yearly';
      slower = Number.isInteger(years) ? compound(P, R, years) : compound(P, R, Math.floor(years)) * (1 + R / 200);
    } else {
      label = 'compounded half-yearly instead of quarterly';
      slower = n % 2 === 0 ? compound(P, R / 2, n / 2) : NaN;
    }
    const v = clean(asAsked(slower));
    out.push({
      value: v,
      why: label,
      trap: `${inr(v)} comes from compounding ${mode === 'half' ? 'once a year' : 'every six months'}; here interest is added every ${mode === 'half' ? 'six months' : 'three months'}, so it starts earning interest sooner.`,
    });
    const noSplit = clean(asAsked(compound(P, R, n)));
    out.push({
      value: noSplit,
      why: `used ${plain(R)}% per ${mode === 'half' ? 'half-year' : 'quarter'} (did not divide the annual rate)`,
      trap: `${inr(noSplit)} applies the full ${plain(R)}% every ${mode === 'half' ? 'half-year' : 'quarter'}; the rate per period is only ${plain(r)}%.`,
    });
  }
  if (ask === 'ci') {
    out.push({ value: clean(SI), why: 'calculated simple interest', trap: `${inr(SI)} is simple interest — it ignores the interest earned on earlier interest.` });
    out.push({ value: A, why: 'forgot to subtract the principal', trap: `${inr(A)} is the amount; subtract the principal ${inr(P)} to get the interest.` });
    if (mode === 'annual' && n === 3) {
      out.push({ value: clean(SI + (P * R * R) / 10000), why: 'used the two-year CI − SI correction for three years' });
    }
    out.push({ value: clean(compound(P, r, n - 1) - P), why: `compounded for one ${mode === 'annual' ? 'year' : 'period'} too few` });
    out.push({ value: clean(compound(P, r, n + 1) - P), why: `compounded for one ${mode === 'annual' ? 'year' : 'period'} too many` });
  } else {
    out.push({ value: CI, why: 'gave only the interest', trap: `${inr(CI)} is only the interest; the amount includes the principal ${inr(P)}.` });
    out.push({
      value: clean(P + SI),
      why: 'used simple interest',
      trap: `${inr(P + SI)} uses simple interest; with compounding the interest grows every ${mode === 'annual' ? 'year' : 'period'}.`,
    });
    out.push({ value: clean(compound(P, r, n - 1)), why: 'one period too few' });
    out.push({ value: clean(compound(P, r, n + 1)), why: 'one period too many' });
  }
  return out;
}

/** easy/medium/hard — find CI or amount for the given compounding mode. */
export function ciFind(ctx: BuildContext, mode: Mode, level: Level): D {
  const { rng } = ctx;
  const plan = rng.pick(PLANS[mode][level]);
  const [min, max] = RANGE[level];
  const P = principalFor(rng, plan, min, max);
  const k = PER_YEAR[mode];
  const r = plan.R / k;
  const path = compoundPath(P, r, plan.n);
  const A = path[plan.n];
  const CI = A - P;
  const ask = level === 'hard' && rng.chance(0.7) ? 'ci' : rng.pick(['ci', 'amount'] as const);
  const p = person(rng);
  const span = spanText(mode, plan.n);
  const where = scheme(rng);
  const who = lender(rng);
  const prompt =
    ask === 'ci'
      ? rng.pick([
          `Find the compound interest on ${inr(P)} at ${plain(plan.R)}% per annum for ${span}, ${COMPOUNDED[mode]}.`,
          `${p.name} invested ${inr(P)} in ${where} that pays ${plain(plan.R)}% per annum compound interest, ${COMPOUNDED[mode]}. How much interest will ${p.he} earn in ${span}?`,
        ])
      : rng.pick([
          `What will ${inr(P)} amount to in ${span} at ${plain(plan.R)}% per annum compound interest, ${COMPOUNDED[mode]}?`,
          `${p.name} borrowed ${inr(P)} from ${who} at ${plain(plan.R)}% per annum compound interest, ${COMPOUNDED[mode]}. What amount will ${p.he} owe at the end of ${span}?`,
        ]);
  const [N, Dd] = factor(r);
  const steps = [
    ...(mode === 'annual'
      ? []
      : [
          `Rate per ${mode === 'half' ? 'half-year' : 'quarter'} = ${plain(plan.R)}% ÷ ${k} = ${plain(r)}%`,
          `Number of ${mode === 'half' ? 'half-years' : 'quarters'} = ${plan.n}`,
        ]),
    `Amount = P × (1 + r/100)ⁿ = ${inr(P)} × ${tex(N, Dd, plan.n)}`,
    ...periodLines(mode, path, r),
    ...(ask === 'ci' ? [`CI = ${inr(A)} − ${inr(P)} = ${inr(CI)}`] : [`Amount = ${inr(A)}`]),
  ];
  const eff2 = 2 * r + (r * r) / 100;
  return {
    facts: { form: 'ci-find', ask, given: { P, R: plan.R, perYear: k, periods: plan.n } },
    prompt,
    answer: ask === 'ci' ? CI : A,
    fmt: (x) => inr(x),
    mistakes: ciMistakes(plan, P, ask),
    steps,
    shortcut:
      plan.n === 2
        ? `Effective rate for two periods = ${plain(r)} + ${plain(r)} + (${plain(r)} × ${plain(r)})/100 = ${plain(eff2)}%, so CI = ${plain(eff2)}% of ${inr(P)} = ${inr(CI)}.`
        : ratioShortcut(P, r, plan.n),
    trap: `Compound interest adds each period's interest to the principal before the next period.`,
    tags: ['interest:compound', `interest:${mode === 'annual' ? 'annual' : mode === 'half' ? 'half-yearly' : 'quarterly'}`, 'trick:ratio-method'],
    ...(ask === 'amount' ? { choice: { min: P, step: stepWithin(CI) } } : {}),
  };
}

/** medium/hard — principal from the CI (or amount). */
export function ciPrincipal(ctx: BuildContext, mode: Mode, level: 'medium' | 'hard'): D {
  const { rng } = ctx;
  const plans: Plan[] =
    mode === 'annual'
      ? level === 'medium'
        ? [5, 10, 20, 4, 8].map((R) => ({ mode, R, n: 2 }))
        : [...[5, 10, 20, 4, 8, 15].map((R) => ({ mode, R, n: 2 })), ...[5, 10, 20].map((R) => ({ mode, R, n: 3 }))]
      : PLANS[mode][level === 'medium' ? 'easy' : 'medium'];
  const plan = rng.pick(plans);
  const P = principalFor(rng, plan, 5000, level === 'medium' ? 60000 : 120000);
  const k = PER_YEAR[mode];
  const r = plan.R / k;
  const A = compound(P, r, plan.n);
  const CI = A - P;
  const years = plan.n / k;
  const [N, Dd] = factor(r);
  const Nn = N ** plan.n;
  const Dn = Dd ** plan.n;
  const givenAmount = level === 'hard' && rng.chance(0.35);
  const span = spanText(mode, plan.n);
  const p = person(rng);
  const periodNote = mode === 'annual' ? [] : [`Rate per ${mode === 'half' ? 'half-year' : 'quarter'} = ${plain(r)}%, number of periods = ${plan.n}`];
  if (givenAmount) {
    const siStyle = clean((A * 100) / (100 + plan.R * years));
    return {
      facts: { form: 'ci-principal', ask: 'principal', given: { A, R: plan.R, perYear: k, periods: plan.n } },
      prompt: `${p.name} received ${inr(A)} at the end of ${span} from a deposit that earned ${plain(plan.R)}% per annum compound interest, ${COMPOUNDED[mode]}. How much had ${p.he} deposited?`,
      answer: P,
      fmt: (x) => inr(x),
      mistakes: [
        { value: siStyle, why: 'discounted with simple interest', trap: `${inr(siStyle)} removes simple interest; the deposit grew by compound interest, so divide by ${tex(N, Dd, plan.n)}.` },
        { value: clean(A * (1 - (plan.R * years) / 100)), why: 'subtracted the interest percentage from the amount' },
        { value: clean((A * Dd) / N), why: 'discounted for one period only' },
        { value: CI, why: 'gave the interest instead of the principal' },
      ],
      steps: [...periodNote, `A = P × ${tex(N, Dd, plan.n)} = P × ${Nn}/${Dn}`, `P = ${inr(A)} × ${Dn} ÷ ${Nn} = ${inr(P)}`],
      shortcut: `P : A = ${Dn} : ${Nn}; ${Nn} units = ${inr(A)} → 1 unit = ${inr(A / Nn)} → P = ${Dn} units = ${inr(P)}.`,
      trap: `Undo the growth by dividing by the whole factor ${Nn}/${Dn}.`,
      tags: ['interest:compound', 'interest:find-principal', 'trick:ratio-method'],
    };
  }
  const asSI = clean((CI * 100) / (plan.R * years));
  return {
    facts: { form: 'ci-principal', ask: 'principal', given: { CI, R: plan.R, perYear: k, periods: plan.n } },
    prompt: rng.pick([
      `The compound interest on a sum of money for ${span} at ${plain(plan.R)}% per annum, ${COMPOUNDED[mode]}, is ${inr(CI)}. Find the sum.`,
      `${p.name} earned ${inr(CI)} as compound interest in ${span} on a deposit at ${plain(plan.R)}% per annum, ${COMPOUNDED[mode]}. How much had ${p.he} deposited?`,
    ]),
    answer: P,
    fmt: (x) => inr(x),
    mistakes: [
      { value: asSI, why: 'treated the CI as simple interest', trap: `${inr(asSI)} treats ${inr(CI)} as simple interest; compound interest is larger than SI, so the true sum is smaller.` },
      { value: clean((CI * Dn) / Nn), why: 'divided the CI by the growth factor as if it were the amount' },
      { value: clean(P + CI), why: 'gave the amount instead of the sum' },
      { value: clean((CI * 100) / plan.R), why: "used one year's rate only" },
    ],
    steps: [...periodNote, `CI = P × [${tex(N, Dd, plan.n)} − 1] = P × ${Nn - Dn}/${Dn}`, `P = ${inr(CI)} × ${Dn} ÷ ${Nn - Dn} = ${inr(P)}`],
    shortcut: `P : CI = ${Dn} : ${Nn - Dn}; ${Nn - Dn} units = ${inr(CI)} → 1 unit = ${inr(CI / (Nn - Dn))} → P = ${Dn} units = ${inr(P)}.`,
    trap: `CI is ${Nn - Dn}/${Dn} of the principal — not ${plain(plan.R * years)}% of it.`,
    tags: ['interest:compound', 'interest:find-principal', 'trick:ratio-method'],
  };
}

/** hard — different rates in successive years. */
export function ciDifferentRates(ctx: BuildContext): D {
  const { rng } = ctx;
  const n = rng.chance(0.7) ? 3 : 2;
  const rates = rng.sample([4, 5, 8, 10, 15, 20, 25], n);
  const unit = rates.reduce((u, r) => u * factor(r)[1], 1);
  const P = multipleIn(rng, unit, 5000, 150000);
  const path = [P];
  for (const r of rates) path.push(compound(path[path.length - 1], r, 1));
  const A = path[n];
  const CI = A - P;
  const sumRates = rates.reduce((a, b) => a + b, 0);
  const ord = ['first', 'second', 'third'];
  const parts = rates.map((r, i) => `${r}% for the ${ord[i]} year`);
  const rateText = parts.length === 3 ? `${parts[0]}, ${parts[1]} and ${parts[2]}` : `${parts[0]} and ${parts[1]}`;
  const avg = sumRates / n;
  const avgOk = Number.isFinite(clean(avg, 2));
  return {
    facts: { form: 'ci-different-rates', ask: 'ci', given: { P }, list: rates },
    prompt: `Find the compound interest on ${inr(P)} for ${n} years if the rate of interest is ${rateText}, compounded annually.`,
    answer: CI,
    fmt: (x) => inr(x),
    mistakes: [
      { value: (P * sumRates) / 100, why: 'added simple interest year by year', trap: `${inr((P * sumRates) / 100)} charges each year's rate on the original ${inr(P)} — that is simple interest.` },
      { value: A, why: 'forgot to subtract the principal', trap: `${inr(A)} is the amount; subtract ${inr(P)}.` },
      { value: avgOk ? clean(compound(P, avg, n) - P) : NaN, why: 'used the average rate for all years' },
      { value: path[n - 1] - P, why: 'left out the last year' },
    ],
    steps: [...rates.map((r, i) => `Year ${i + 1}: ${r}% of ${inr(path[i])} = ${inr(path[i + 1] - path[i])} → amount ${inr(path[i + 1])}`), `CI = ${inr(A)} − ${inr(P)} = ${inr(CI)}`],
    shortcut: `Multiply the yearly factors: ${inr(P)} × ${rates.map((r) => factor(r).join('/')).join(' × ')} = ${inr(A)}.`,
    trap: `Each year's rate applies to the amount at the start of that year.`,
    tags: ['interest:compound', 'interest:changing-rate'],
  };
}

/** hard — CI for 2 years from the SI for 2 years. */
export function ciFromSi(ctx: BuildContext): D {
  const { rng } = ctx;
  const R = rng.pick([4, 5, 8, 10, 12, 15, 20]);
  const [, Dd] = factor(R);
  const P = multipleIn(rng, Dd * Dd, 5000, 80000);
  const S = (2 * P * R) / 100;
  const C = compound(P, R, 2) - P;
  const extra = (P * R * R) / 10000;
  const wrong = clean(S * (1 + R / 100));
  return {
    facts: { form: 'ci-from-si', ask: 'ci', given: { SI: S, R, T: 2 } },
    prompt: `The simple interest on a sum of money for 2 years at ${R}% per annum is ${inr(S)}. What is the compound interest on the same sum at the same rate for 2 years, compounded annually?`,
    answer: C,
    fmt: (x) => inr(x),
    mistakes: [
      { value: wrong, why: 'added the rate on the whole 2-year SI', trap: `${inr(wrong)} adds ${R}% of the whole 2-year SI; the extra in CI is ${R}% of only the first year's interest.` },
      { value: S, why: 'assumed CI equals SI', trap: `CI equals SI only for one year; in the second year CI also earns interest on the first year's interest.` },
      { value: clean(S + 2 * extra), why: 'doubled the correction term' },
      { value: clean(S * (1 + R / 100) ** 2 - S), why: 'grew the SI itself by compound interest' },
    ],
    steps: [
      `SI for 1 year = ${inr(S)} ÷ 2 = ${inr(S / 2)}`,
      `In year 2, CI also earns ${R}% on the first year's interest: ${R}% of ${inr(S / 2)} = ${inr(extra)}`,
      `CI = ${inr(S)} + ${inr(extra)} = ${inr(C)}`,
    ],
    shortcut: `CI (2 years) = SI × (1 + R/200) = ${inr(S)} × ${plain(1 + R / 200, 4)} = ${inr(C)}.`,
    trap: `The CI − SI gap for 2 years is interest on one year's interest only.`,
    tags: ['interest:compound', 'interest:ci-vs-si'],
  };
}

/** extreme — rate or sum from the amounts after t and t+1 years. */
export function ciFromAmounts(ctx: BuildContext): D {
  const { rng } = ctx;
  const R = rng.pick([4, 5, 8, 10, 12.5, 15, 20, 25]);
  const t = rng.int(2, 3);
  const [N, Dd] = factor(R);
  const P = multipleIn(rng, Dd ** (t + 1), 5000, 200000);
  const A1 = compound(P, R, t);
  const A2 = compound(P, R, t + 1);
  const ask = rng.pick(['rate', 'principal'] as const);
  const prompt = `A sum of money invested at compound interest, compounded annually, amounts to ${inr(A1)} in ${yearsText(t)} and to ${inr(A2)} in ${yearsText(t + 1)}. ${
    ask === 'rate' ? 'Find the rate of interest per annum.' : 'Find the sum.'
  }`;
  const stepsRate = [`Interest in year ${t + 1} = ${inr(A2)} − ${inr(A1)} = ${inr(A2 - A1)}`, `This is one year's interest on ${inr(A1)}`, `Rate = ${inr(A2 - A1)} × 100 ÷ ${inr(A1)} = ${pct(R)}`];
  if (ask === 'rate') {
    const wrongBase = clean(((A2 - A1) * 100) / A2, 2);
    return {
      facts: { form: 'ci-from-amounts', ask, given: { A1, t1: t, A2, t2: t + 1 } },
      prompt,
      answer: R,
      fmt: (x) => pct(x),
      mistakes: [
        { value: wrongBase, why: 'took the rate on the later amount', trap: `${pct(wrongBase)} measures the interest against ${inr(A2)}; it was earned on ${inr(A1)}.` },
        { value: clean(((A2 - A1) * 100) / A1 / t, 2), why: 'divided by the number of years as in SI' },
      ],
      steps: stepsRate,
      shortcut: `Consecutive CI amounts differ by one year's interest on the earlier amount: ${inr(A2 - A1)} ÷ ${inr(A1)} = ${plain(R)}/100.`,
      trap: `The last year's interest is earned on the earlier amount.`,
      tags: ['interest:compound', 'interest:two-amounts'],
      choice: { step: Number.isInteger(R) ? (R >= 5 ? 1 : 0.5) : 2.5 },
    };
  }
  const siStyle = A1 - t * (A2 - A1);
  return {
    facts: { form: 'ci-from-amounts', ask, given: { A1, t1: t, A2, t2: t + 1 } },
    prompt,
    answer: P,
    fmt: (x) => inr(x),
    mistakes: [
      {
        value: siStyle,
        why: "subtracted t equal years of the last year's interest (SI thinking)",
        trap: `${inr(siStyle)} subtracts ${t} equal years of interest; under CI each earlier year earned less, so the sum is larger than that.`,
      },
      { value: clean((A1 * Dd ** (t - 1)) / N ** (t - 1)), why: 'discounted one year too few' },
      { value: clean((A1 * Dd ** (t + 1)) / N ** (t + 1)), why: 'discounted one year too many' },
      { value: A1 - (A2 - A1), why: "subtracted only one year's interest" },
    ],
    steps: [...stepsRate, `Sum = ${inr(A1)} ÷ ${tex(N, Dd, t)} = ${inr(P)}`],
    shortcut: `Rate from consecutive amounts, then P : A = ${Dd ** t} : ${N ** t}.`,
    trap: `Under CI the yearly interest grows, so you cannot subtract equal years of interest.`,
    tags: ['interest:compound', 'interest:two-amounts'],
  };
}

/** extreme — fractional year (n½ years) compounded annually. */
export function ciFractionYear(ctx: BuildContext): D {
  const { rng } = ctx;
  const R = rng.pick([4, 5, 8, 10, 20]);
  const n = rng.int(1, 2);
  const [, Dd] = factor(R);
  const [, halfD] = factor(R / 2);
  const P = multipleIn(rng, Dd ** n * halfD, 5000, 200000);
  const An = compound(P, R, n);
  const A = An + (An * R) / 200;
  const CI = A - P;
  const growth = `$\\left(1 + \\frac{${R}}{100}\\right)^{${n}}$`;
  const fullYear = clean(compound(P, R, n + 1) - P);
  return {
    facts: { form: 'ci-fraction-year', ask: 'ci', given: { P, R, years: n, halfYear: 1 } },
    prompt: `Find the compound interest on ${inr(P)} at ${R}% per annum for $${n}\\frac{1}{2}$ years, the interest being compounded annually.`,
    answer: CI,
    fmt: (x) => inr(x),
    mistakes: [
      { value: fullYear, why: 'charged a full year for the last half-year', trap: `${inr(fullYear)} charges ${R}% for the last half-year; for half a year the interest is only ${plain(R / 2)}%.` },
      { value: An - P, why: 'ignored the half-year' },
      { value: clean((P * R * (n + 0.5)) / 100), why: 'calculated simple interest' },
      { value: clean(compound(P, R / 2, 2 * n + 1) - P), why: 'compounded half-yearly instead' },
      { value: A, why: 'gave the amount' },
    ],
    steps: [
      `Amount after ${yearsText(n)} = ${inr(P)} × ${growth} = ${inr(An)}`,
      `For the remaining half-year, interest = ${plain(R / 2)}% of ${inr(An)} = ${inr((An * R) / 200)}`,
      `Amount = ${inr(A)}; CI = ${inr(A)} − ${inr(P)} = ${inr(CI)}`,
    ],
    shortcut: `A = P × ${growth} × $\\left(1 + \\frac{${R}}{200}\\right)$ — the last half-year gets half the annual rate.`,
    trap: `A half-year at ${R}% per annum earns ${plain(R / 2)}%, not ${R}%.`,
    tags: ['interest:compound', 'interest:fraction-year'],
  };
}

/** extreme — difference between two compounding frequencies. */
export function ciFrequencyGap(ctx: BuildContext, mode: 'half' | 'quarter'): D {
  const { rng } = ctx;
  const opt =
    mode === 'half'
      ? rng.pick([
          { R: 10, months: 12 },
          { R: 20, months: 12 },
          { R: 8, months: 12 },
          { R: 12, months: 12 },
          { R: 20, months: 24 },
          { R: 10, months: 24 },
        ])
      : rng.pick([
          { R: 20, months: 6 },
          { R: 40, months: 6 },
          { R: 20, months: 12 },
          { R: 40, months: 12 },
        ]);
  const { R, months } = opt;
  const fast = mode === 'half' ? 2 : 4;
  const slow = mode === 'half' ? 1 : 2;
  const nFast = (months * fast) / 12;
  const nSlow = (months * slow) / 12;
  const [, dF] = factor(R / fast);
  const [, dS] = factor(R / slow);
  const P = multipleIn(rng, lcm(dF ** nFast, dS ** nSlow), 5000, 400000);
  const cFast = compound(P, R / fast, nFast) - P;
  const cSlow = compound(P, R / slow, nSlow) - P;
  const diff = cFast - cSlow;
  const slowWord = mode === 'half' ? 'annually' : 'half-yearly';
  const fastWord = mode === 'half' ? 'half-yearly' : 'quarterly';
  const span = months % 12 === 0 ? yearsText(months / 12) : `${months} months`;
  const rf = R / fast;
  return {
    facts: { form: 'ci-frequency-gap', ask: 'diff', given: { P, R, months, fast, slow } },
    prompt: `Find the difference between the compound interest on ${inr(P)} for ${span} at ${R}% per annum when the interest is compounded ${fastWord} and when it is compounded ${slowWord}.`,
    answer: diff,
    fmt: (x) => inr(x),
    mistakes: [
      {
        value: clean((P * R * R) / 10000),
        why: 'used the two-year CI − SI formula with the annual rate',
        trap: `P(R/100)² is the 2-year CI − SI gap at ${R}%; here each period is a ${mode === 'half' ? 'half-year' : 'quarter'} at ${plain(rf)}%.`,
      },
      { value: cFast, why: 'gave the CI itself, not the difference' },
      { value: clean((2 * P * rf * rf) / 10000), why: 'doubled the one-step correction' },
      { value: clean((P * rf * rf) / 20000), why: 'halved the correction' },
    ],
    steps: [
      `Compounded ${fastWord}: rate ${plain(rf)}% for ${nFast} periods → CI = ${inr(cFast)}`,
      `Compounded ${slowWord}: rate ${plain(R / slow)}% for ${nSlow} period${nSlow === 1 ? '' : 's'} → CI = ${inr(cSlow)}`,
      `Difference = ${inr(cFast)} − ${inr(cSlow)} = ${inr(diff)}`,
    ],
    shortcut:
      nSlow === 1
        ? `Over one ${mode === 'half' ? 'year' : 'half-year'} the gap is interest on the first period's interest: P × (${plain(rf)}/100)² = ${inr(diff)}.`
        : `Compute both amounts with the ratio method and subtract.`,
    trap: `More frequent compounding adds interest on interest within the same span.`,
    tags: ['interest:compound', 'interest:compounding-frequency'],
  };
}
