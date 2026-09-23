/**
 * Simple-interest scenarios for quant.interest (subtype si-basic).
 * Every builder chooses clean answers first, then states only the givens in `facts`.
 */
import type { BuildContext } from '../../types';
import type { InterestFacts } from '../interest';
import { fracTex, gcd, inr, pct, plain, reduce } from '../../../../lib/format';
import { type Draft, type Mis, clean, compound, lender, multipleIn, people, periodText, person, scheme, stepWithin, yearsText } from './kit';

type D = Draft<InterestFacts>;
const yrs = yearsText;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Multiple of `unit` so that P × R × T / 100 is whole (R may be x.5). */
function siUnit(R: number, T: number): number {
  const r2 = Math.round(R * 2);
  return 200 / gcd(200, r2 * T);
}

/** easy — find SI or amount from P, R, T. */
export function siFind(ctx: BuildContext): D {
  const { rng } = ctx;
  const P = rng.int(4, 40) * 500;
  const R = rng.pick([4, 5, 6, 8, 9, 10, 12, 15]);
  const T = rng.int(2, 5);
  const yearly = (P * R) / 100;
  const SI = yearly * T;
  const A = P + SI;
  const ask = rng.pick(['si', 'amount'] as const);
  const p = person(rng);
  const place = scheme(rng);
  const who = lender(rng);
  const ciAmt = clean(compound(P, R, T));
  let prompt: string;
  let mistakes: Mis[];
  if (ask === 'si') {
    prompt = rng.pick([
      `Find the simple interest on ${inr(P)} at ${R}% per annum for ${yrs(T)}.`,
      `${p.name} deposited ${inr(P)} in ${place} at ${R}% per annum simple interest. How much interest will ${p.he} earn in ${yrs(T)}?`,
    ]);
    mistakes = [
      { value: A, why: 'gave the amount (P + SI) instead of the interest', trap: `${inr(A)} is the amount (principal + interest); the question asks only for the interest.` },
      { value: ciAmt - P, why: 'compounded the interest', trap: `${inr(ciAmt - P)} is compound interest; simple interest is the same ${inr(yearly)} every year.` },
      { value: yearly * (T + 1), why: 'counted one year too many' },
      { value: yearly, why: 'interest for one year only', trap: `${inr(yearly)} is the interest for one year only; multiply by ${T} years.` },
    ];
  } else {
    prompt = rng.pick([
      `${p.name} borrowed ${inr(P)} from ${who} at ${R}% per annum simple interest. What amount will ${p.he} have to repay at the end of ${yrs(T)}?`,
      `Find the amount on ${inr(P)} at ${R}% per annum simple interest for ${yrs(T)}.`,
    ]);
    mistakes = [
      { value: SI, why: 'gave only the interest', trap: `${inr(SI)} is only the interest; the amount also includes the principal ${inr(P)}.` },
      { value: ciAmt, why: 'used compound interest', trap: `${inr(ciAmt)} is the compound amount; with simple interest the interest is the same ${inr(yearly)} each year.` },
      { value: P + yearly * (T - 1), why: 'counted one year too few' },
      { value: P + yearly, why: 'added one year of interest only' },
    ];
  }
  const steps = [
    `SI = P × R × T ÷ 100`,
    `SI = ${inr(P)} × ${R} × ${T} ÷ 100 = ${inr(SI)}`,
    ...(ask === 'amount' ? [`Amount = P + SI = ${inr(P)} + ${inr(SI)} = ${inr(A)}`] : []),
  ];
  return {
    facts: { form: 'si-find', ask, given: { P, R, T } },
    prompt,
    answer: ask === 'si' ? SI : A,
    fmt: (n) => inr(n),
    mistakes,
    steps,
    shortcut: `${R}% for ${T} years = ${R * T}% in all, and ${R * T}% of ${inr(P)} = ${inr(SI)}.`,
    trap: `Simple interest is charged on the principal only, so it is the same every year.`,
    tags: ['interest:simple', ask === 'si' ? 'interest:find-si' : 'interest:find-amount'],
    ...(ask === 'amount' ? { choice: { min: P, step: stepWithin(SI) } } : {}),
  };
}

/** medium — SI for a period given in months. */
export function siMonths(ctx: BuildContext): D {
  const { rng } = ctx;
  const R = rng.pick([6, 8, 9, 10, 12, 12.5, 15, 18]);
  const m = rng.pick([4, 6, 8, 9, 15, 18, 20, 30, 42]);
  const unit = 2400 / gcd(2400, Math.round(R * 2) * m);
  const P = multipleIn(rng, unit, 5000, 60000);
  const SI = (P * R * m) / 1200;
  const yearly = (P * R) / 100;
  const y = Math.floor(m / 12);
  const mm = m % 12;
  const p = person(rng);
  const prompt = rng.pick([
    `Find the simple interest on ${inr(P)} at ${R}% per annum for ${periodText(m)}.`,
    `${p.name} borrowed ${inr(P)} at ${R}% per annum simple interest and cleared the loan after ${periodText(m)}. How much interest did ${p.he} pay?`,
  ]);
  const mistakes: Mis[] = [];
  if (mm > 0 && mm <= 9) {
    const wrongT = y + mm / 10;
    mistakes.push({
      value: clean((P * R * wrongT) / 100),
      why: `wrote ${periodText(m)} as ${plain(wrongT)} years`,
      trap: `${periodText(m)} is ${fracTex(m, 12)} of a year, not ${plain(wrongT)} years — a month is 1/12 of a year, not 1/10.`,
    });
  }
  if (m < 12) mistakes.push({ value: (P * R * m) / 100, why: 'treated the months as years', trap: `Using ${m} as the time treats ${m} months as ${m} years; convert months to years first (÷ 12).` });
  if (y > 0 && mm > 0) mistakes.push({ value: clean((P * R * y) / 100), why: 'ignored the extra months', trap: `That ignores the extra ${mm} months — the time is ${fracTex(m, 12)} years.` });
  mistakes.push({ value: clean(P + SI), why: 'gave the amount instead of the interest' });
  mistakes.push({ value: clean(yearly), why: 'interest for one year' });
  return {
    facts: { form: 'si-months', ask: 'si', given: { P, R, months: m } },
    prompt,
    answer: SI,
    fmt: (n) => inr(n),
    mistakes,
    steps: [
      `Time = ${periodText(m)} = ${m}/12 of a year = ${fracTex(m, 12)} year${m > 12 ? 's' : ''}`,
      `SI = P × R × T ÷ 100 = ${inr(P)} × ${R} × ${fracTex(m, 12)} ÷ 100`,
      `SI = ${inr(SI)}`,
    ],
    shortcut: `Interest for 1 year = ${R}% of ${inr(P)} = ${inr(yearly)}; for ${m} months it is ${inr(yearly)} × ${fracTex(m, 12)} = ${inr(SI)}.`,
    trap: `Convert months to years by dividing by 12.`,
    tags: ['interest:simple', 'interest:months'],
  };
}

/** medium — find the principal from the amount (or the SI), rate and time. */
export function siPrincipal(ctx: BuildContext): D {
  const { rng } = ctx;
  const R = rng.pick([4, 5, 6, 8, 10, 12, 12.5, 15]);
  const T = rng.int(2, 6);
  const P = multipleIn(rng, siUnit(R, T), 4000, 50000);
  const RT = R * T;
  const SI = (P * RT) / 100;
  const A = P + SI;
  const given = rng.pick(['amount', 'si'] as const);
  const p = person(rng);
  const who = lender(rng);
  if (given === 'amount') {
    const wrongDiscount = clean((A * (100 - RT)) / 100);
    return {
      facts: { form: 'si-principal', ask: 'principal', given: { A, R, T } },
      prompt: rng.pick([
        `What sum of money will amount to ${inr(A)} in ${yrs(T)} at ${R}% per annum simple interest?`,
        `${p.name} cleared a loan by paying ${inr(A)} at the end of ${yrs(T)}. If ${who} charged ${R}% per annum simple interest, how much had ${p.he} borrowed?`,
      ]),
      answer: P,
      fmt: (n) => inr(n),
      mistakes: [
        {
          value: wrongDiscount,
          why: `subtracted ${plain(RT)}% of the amount instead of dividing by ${plain(100 + RT)}%`,
          trap: `${inr(wrongDiscount)} takes ${plain(RT)}% of ${inr(A)} off the amount, but the ${plain(RT)}% interest was charged on the principal, not on the amount.`,
        },
        { value: clean((A * 100) / (100 + R)), why: 'used one year of interest only' },
        { value: clean((A * 100) / (100 + R * (T + 1))), why: 'counted one year too many' },
        { value: clean((A * 100) / (100 + R * (T - 1))), why: 'counted one year too few' },
      ],
      steps: [
        `In ${yrs(T)} at ${R}%, ₹100 earns ₹${plain(RT)} interest, so ₹100 becomes ₹${plain(100 + RT)}`,
        `Sum = Amount × 100 ÷ ${plain(100 + RT)}`,
        `Sum = ${inr(A)} × 100 ÷ ${plain(100 + RT)} = ${inr(P)}`,
      ],
      shortcut: `${plain(100 + RT)}% of the sum = ${inr(A)} → 1% = ${inr(A / (100 + RT))} → 100% = ${inr(P)}.`,
      trap: `Interest is a percentage of the principal, so divide the amount by ${plain(100 + RT)}%.`,
      tags: ['interest:simple', 'interest:find-principal'],
    };
  }
  return {
    facts: { form: 'si-principal', ask: 'principal', given: { SI, R, T } },
    prompt: rng.pick([
      `The simple interest on a sum of money for ${yrs(T)} at ${R}% per annum is ${inr(SI)}. Find the sum.`,
      `${p.name} paid ${inr(SI)} as simple interest on a loan taken from ${who} at ${R}% per annum for ${yrs(T)}. How much had ${p.he} borrowed?`,
    ]),
    answer: P,
    fmt: (n) => inr(n),
    mistakes: [
      {
        value: clean((SI * 100) / R),
        why: 'ignored the time',
        trap: `${inr(clean((SI * 100) / R))} is the sum that earns ${inr(SI)} in one year; here that interest is for ${T} years.`,
      },
      { value: A, why: 'added the interest to the sum (gave the amount)', trap: `${inr(A)} is the amount (sum + interest); the question asks for the sum lent.` },
      { value: clean((SI * 100) / (R * (T + 1))), why: 'counted one year too many' },
      { value: clean((SI * 100) / (R * (T - 1))), why: 'counted one year too few' },
    ],
    steps: [`SI = P × R × T ÷ 100, so P = SI × 100 ÷ (R × T)`, `P = ${inr(SI)} × 100 ÷ (${R} × ${T})`, `P = ${inr(SI)} × 100 ÷ ${plain(RT)} = ${inr(P)}`],
    shortcut: `${plain(RT)}% of the sum = ${inr(SI)} → 1% = ${inr(SI / RT)} → sum = ${inr(P)}.`,
    trap: `Use the total rate for all ${T} years (${plain(RT)}%), not one year's rate.`,
    tags: ['interest:simple', 'interest:find-principal'],
  };
}

/** medium — find the rate from P, A and T. */
export function siRate(ctx: BuildContext): D {
  const { rng } = ctx;
  const R = rng.pick([5, 6, 7, 8, 9, 10, 11, 12, 12.5, 15]);
  const T = rng.int(2, 6);
  const P = multipleIn(rng, siUnit(R, T), 4000, 50000);
  const SI = (P * R * T) / 100;
  const A = P + SI;
  const [a, b] = people(rng, 2);
  const amountAsInterest = clean((A * 100) / (P * T), 2);
  return {
    facts: { form: 'si-rate', ask: 'rate', given: { P, A, T } },
    prompt: rng.pick([
      `A sum of ${inr(P)} amounts to ${inr(A)} in ${yrs(T)} at simple interest. Find the rate of interest per annum.`,
      `${a.name} lent ${inr(P)} to ${b.name} at simple interest and received ${inr(A)} in all after ${yrs(T)}. What was the rate of interest per annum?`,
    ]),
    answer: R,
    fmt: (n) => pct(n),
    mistakes: [
      { value: clean(R * T, 2), why: 'forgot to divide by the time', trap: `${pct(R * T)} is the total rate for all ${T} years; divide by ${T} to get the rate per annum.` },
      { value: amountAsInterest, why: 'used the amount as the interest', trap: `${pct(amountAsInterest)} treats the whole amount ${inr(A)} as interest; the interest is only ${inr(SI)}.` },
      { value: clean((SI * 100) / (A * T), 2), why: 'took the amount as the base' },
    ],
    steps: [`SI = ${inr(A)} − ${inr(P)} = ${inr(SI)}`, `R = SI × 100 ÷ (P × T)`, `R = ${inr(SI)} × 100 ÷ (${inr(P)} × ${T}) = ${pct(R)}`],
    shortcut: `Interest ${inr(SI)} is ${pct(R * T)} of ${inr(P)} over ${T} years → ${pct(R)} per year.`,
    trap: `Subtract the principal first — only ${inr(SI)} is interest.`,
    tags: ['interest:simple', 'interest:find-rate'],
    choice: { step: Number.isInteger(R) ? 1 : 2.5 },
  };
}

/** medium — find the time. */
export function siTime(ctx: BuildContext): D {
  const { rng } = ctx;
  const R = rng.pick([4, 5, 6, 8, 10, 12, 12.5, 15]);
  const T = rng.int(5, 10);
  const P = multipleIn(rng, siUnit(R, T), 4000, 50000);
  const SI = (P * R * T) / 100;
  const A = P + SI;
  const yearly = (P * R) / 100;
  const givenAmount = rng.chance(0.6);
  const asInterest = clean((A * 100) / (P * R));
  return {
    facts: givenAmount ? { form: 'si-time', ask: 'time', given: { P, A, R } } : { form: 'si-time', ask: 'time', given: { P, SI, R } },
    prompt: givenAmount
      ? `In how many years will ${inr(P)} amount to ${inr(A)} at ${R}% per annum simple interest?`
      : `At ${R}% per annum simple interest, in how many years will a sum of ${inr(P)} earn an interest of ${inr(SI)}?`,
    answer: T,
    fmt: (n) => yrs(n),
    mistakes: [
      ...(givenAmount
        ? [{ value: asInterest, why: 'used the amount as the interest', trap: `${yrs(asInterest)} treats the amount ${inr(A)} as interest; the interest is only ${inr(SI)}.` }]
        : [{ value: clean((SI * 100) / P), why: 'forgot to divide by the rate' }]),
      { value: T + 1, why: 'off by one year' },
    ],
    steps: [
      ...(givenAmount ? [`SI = ${inr(A)} − ${inr(P)} = ${inr(SI)}`] : []),
      `Interest for one year = ${R}% of ${inr(P)} = ${inr(yearly)}`,
      `T = ${inr(SI)} ÷ ${inr(yearly)} = ${yrs(T)}`,
    ],
    shortcut: `T = SI × 100 ÷ (P × R) = ${inr(SI)} × 100 ÷ (${inr(P)} × ${R}) = ${T}.`,
    trap: `Only the interest (amount − principal) grows with time.`,
    tags: ['interest:simple', 'interest:find-time'],
    choice: { step: 1 },
  };
}

/** medium (ask sum) / hard (ask rate) — amounts after two different periods. */
export function siTwoAmounts(ctx: BuildContext, ask: 'principal' | 'rate'): D {
  const { rng } = ctx;
  const R = rng.pick(ask === 'rate' ? [5, 6, 7, 8, 9, 10, 11, 12, 12.5, 15] : [4, 5, 6, 8, 10, 12, 12.5, 15]);
  const P = multipleIn(rng, siUnit(R, 1), 4000, 40000);
  const yearly = (P * R) / 100;
  const t1 = rng.int(2, 4);
  const gap = rng.int(1, ask === 'rate' ? 3 : 2);
  const t2 = t1 + gap;
  const A1 = P + t1 * yearly;
  const A2 = P + t2 * yearly;
  const prompt = `A sum of money lent at simple interest amounts to ${inr(A1)} in ${yrs(t1)} and to ${inr(A2)} in ${yrs(t2)}. ${
    ask === 'principal' ? 'Find the sum.' : 'Find the rate of interest per annum.'
  }`;
  const steps = [
    `Interest for ${yrs(gap)} = ${inr(A2)} − ${inr(A1)} = ${inr(gap * yearly)}`,
    ...(gap > 1 ? [`Interest for 1 year = ${inr(gap * yearly)} ÷ ${gap} = ${inr(yearly)}`] : []),
    `Interest for ${yrs(t1)} = ${t1} × ${inr(yearly)} = ${inr(t1 * yearly)}`,
    `Sum = ${inr(A1)} − ${inr(t1 * yearly)} = ${inr(P)}`,
    ...(ask === 'rate' ? [`Rate = ${inr(yearly)} × 100 ÷ ${inr(P)} = ${pct(R)}`] : []),
  ];
  const mistakes: Mis[] =
    ask === 'principal'
      ? [
          { value: A1 - gap * yearly, why: 'subtracted the difference only once', trap: `${inr(A1 - gap * yearly)} removes only ${yrs(gap)} of interest from ${inr(A1)}, but ${inr(A1)} contains ${yrs(t1)} of interest.` },
          { value: A1 - t1 * gap * yearly, why: 'did not divide the difference by the gap in years' },
          { value: A2 - t1 * yearly, why: 'subtracted from the later amount' },
          { value: A1 - yearly, why: 'subtracted one year of interest only' },
        ]
      : [
          { value: clean(gap * R, 2), why: 'did not divide the difference by the gap in years', trap: `${pct(gap * R)} uses the interest for ${yrs(gap)} as if it were one year's interest.` },
          { value: clean((yearly * 100) / A1, 2), why: 'took the rate on the first amount instead of the sum' },
          { value: clean(t1 * R, 2), why: `used ${t1} years' interest as one year's` },
        ];
  return {
    facts: { form: 'si-two-amounts', ask, given: { A1, t1, A2, t2 } },
    prompt,
    answer: ask === 'principal' ? P : R,
    fmt: ask === 'principal' ? (n) => inr(n) : (n) => pct(n),
    mistakes,
    steps,
    shortcut: `The later amount contains exactly ${yrs(gap)} more interest, so (A₂ − A₁) ÷ ${gap} is one year's interest; remove ${t1} such years from A₁.`,
    trap: `Each amount already contains interest; only the difference isolates interest for the extra years.`,
    tags: ['interest:simple', 'interest:two-amounts'],
    ...(ask === 'rate' ? { choice: { step: Number.isInteger(R) ? 1 : 2.5 } } : {}),
  };
}

/** hard — SI is a fraction of the sum and rate = time. */
export function siRateEqTime(ctx: BuildContext): D {
  const { rng } = ctx;
  const R = rng.pick([4, 5, 6, 7, 8, 9, 10, 12, 15]);
  const [p, q] = reduce(R * R, 100);
  const frac = p === q ? 'equal to the sum itself' : `${fracTex(p, q)} of the sum`;
  return {
    facts: { form: 'si-rate-eq-time', ask: 'rate', given: { fracNum: p, fracDen: q } },
    prompt: `The simple interest on a sum of money is ${frac}. If the rate of interest per annum and the time in years are numerically equal, find the rate of interest.`,
    answer: R,
    fmt: (n) => pct(n),
    mistakes: [
      { value: R * R, why: 'took R × T as the rate (forgot the square root)', trap: `${pct(R * R)} is R × T; since R = T, the rate is its square root.` },
      { value: clean((R * R) / 2, 2), why: 'halved R × T instead of taking the square root', trap: `Halving R × T assumes R + T split it; R and T are equal factors, so take the square root.` },
    ],
    steps: [
      `Let the rate be R% and the time R years`,
      `SI = P × R × R ÷ 100, and SI = ${p === q ? 'P' : `${fracTex(p, q)} × P`}`,
      p === q ? `R² = 100` : `R² = ${fracTex(p, q)} × 100 = ${R * R}`,
      `R = ${R}%, so the time is also ${yrs(R)}`,
    ],
    shortcut: `R × T = (SI ÷ P) × 100 = ${R * R}; with R = T, R = √${R * R} = ${R}.`,
    trap: `R × T = ${R * R} is not the rate — R and T are equal factors of it.`,
    tags: ['interest:simple', 'interest:rate-equals-time'],
    choice: { step: 1 },
  };
}

/** hard — interest rises by ₹D when the rate rises by Δ%. */
export function siRateIncrease(ctx: BuildContext): D {
  const { rng } = ctx;
  const d = rng.pick([1, 2, 3, 4, 5]);
  const T = rng.int(2, 6);
  const P = multipleIn(rng, 100 / gcd(100, d * T), 5000, 60000);
  const Dv = (P * d * T) / 100;
  const p = person(rng);
  const noTime = clean((Dv * 100) / d);
  return {
    facts: { form: 'si-rate-increase', ask: 'principal', given: { rise: d, T, extra: Dv } },
    prompt: rng.pick([
      `If the rate of simple interest on a certain sum of money is increased by ${d}% per annum, the interest for ${yrs(T)} increases by ${inr(Dv)}. Find the sum.`,
      `Had the rate of simple interest been ${d}% per annum higher, ${p.name} would have earned ${inr(Dv)} more as interest in ${yrs(T)}. Find the sum ${p.he} invested.`,
    ]),
    answer: P,
    fmt: (n) => inr(n),
    mistakes: [
      { value: noTime, why: 'ignored the time', trap: `${inr(noTime)} ignores the time: the extra ${d}% is earned in each of the ${T} years.` },
      ...(d > 1 ? [{ value: clean((Dv * 100) / T), why: `treated the rise as 1% instead of ${d}%` }] : []),
      { value: clean((Dv * 100) / (d * (T + 1))), why: 'counted one year too many' },
    ],
    steps: [`Extra interest = P × ${d} × ${T} ÷ 100`, `${inr(Dv)} = P × ${d * T} ÷ 100`, `P = ${inr(Dv)} × 100 ÷ ${d * T} = ${inr(P)}`],
    shortcut: `The extra ${d}% for ${T} years is ${d * T}% of the sum = ${inr(Dv)} → 1% = ${inr(Dv / (d * T))} → sum = ${inr(P)}.`,
    trap: `The extra rate applies every year, so multiply it by the time.`,
    tags: ['interest:simple', 'interest:rate-change'],
  };
}

/** hard — two loans at the same rate, total interest given. */
export function siTwoSums(ctx: BuildContext): D {
  const { rng } = ctx;
  const R = rng.pick([5, 6, 7, 8, 9, 10, 11, 12]);
  const P1 = rng.int(4, 20) * 500;
  let P2 = rng.int(4, 20) * 500;
  if (P2 === P1) P2 += 1000;
  const t1 = rng.int(2, 5);
  let t2 = rng.int(2, 5);
  if (t2 === t1) t2 = t1 === 5 ? 3 : t1 + 1;
  const weight = P1 * t1 + P2 * t2;
  const I = (weight * R) / 100;
  const [a, b, c] = people(rng, 3);
  const lumped = clean((I * 100) / ((P1 + P2) * (t1 + t2)), 2);
  return {
    facts: { form: 'si-two-sums', ask: 'rate', given: { P1, t1, P2, t2, I } },
    prompt: `${a.name} lent ${inr(P1)} to ${b.name} for ${yrs(t1)} and ${inr(P2)} to ${c.name} for ${yrs(t2)} at the same rate of simple interest. ${cap(a.he)} received ${inr(I)} in all as interest from both. Find the rate of interest per annum.`,
    answer: R,
    fmt: (n) => pct(n),
    mistakes: [
      { value: lumped, why: 'added the sums and the times separately', trap: `${pct(lumped)} lumps ${inr(P1 + P2)} for ${t1 + t2} years; each sum is lent for its own period.` },
      { value: clean((I * 100) / (P1 * t2 + P2 * t1), 2), why: 'swapped the two periods', trap: `That pairs each sum with the other loan's period.` },
      { value: clean((I * 100) / ((P1 + P2) * Math.max(t1, t2)), 2), why: 'used the longer period for both sums' },
    ],
    steps: [
      `Interest = (P₁ × T₁ + P₂ × T₂) × R ÷ 100`,
      `P₁ × T₁ + P₂ × T₂ = ${inr(P1)} × ${t1} + ${inr(P2)} × ${t2} = ${inr(weight)}`,
      `R = ${inr(I)} × 100 ÷ ${inr(weight)} = ${pct(R)}`,
    ],
    shortcut: `Treat both loans as one loan of ${inr(weight)} for 1 year: ${inr(I)} is R% of it.`,
    trap: `Each sum earns interest only for its own period.`,
    tags: ['interest:simple', 'interest:two-loans'],
    choice: { step: 1 },
  };
}

/** hard (ask interest) / extreme (ask principal) — rate changes over time. */
export function siRateChange(ctx: BuildContext, ask: 'si' | 'principal'): D {
  const { rng } = ctx;
  const rates = rng.sample([5, 6, 7, 8, 9, 10, 11, 12], 3);
  if (rng.chance(0.6)) rates.sort((x, y) => x - y);
  const [r1, r2, r3] = rates;
  const t1 = rng.int(2, 3);
  const t2 = rng.int(2, 3);
  const t3 = rng.int(1, 4);
  const T = t1 + t2 + t3;
  const S = r1 * t1 + r2 * t2 + r3 * t3;
  const P = multipleIn(rng, 100, 5000, ask === 'si' ? 40000 : 80000);
  const I = (P * S) / 100;
  const p = person(rng);
  const who = lender(rng);
  const base = `${p.name} took a loan from ${who} at simple interest. The rate was ${r1}% per annum for the first ${yrs(t1)}, ${r2}% per annum for the next ${yrs(t2)} and ${r3}% per annum for the period beyond ${yrs(t1 + t2)}.`;
  const avg = clean((P * (r1 + r2 + r3) * T) / 300);
  const steps = [
    `Rate-years: ${r1} × ${t1} + ${r2} × ${t2} + ${r3} × ${t3} = ${t1 * r1} + ${t2 * r2} + ${t3 * r3} = ${S}%`,
    ask === 'si' ? `Interest = ${S}% of ${inr(P)} = ${inr(I)}` : `${S}% of the sum = ${inr(I)}`,
    ...(ask === 'principal' ? [`Sum = ${inr(I)} × 100 ÷ ${S} = ${inr(P)}`] : []),
  ];
  if (ask === 'si') {
    return {
      facts: { form: 'si-rate-change', ask, given: { P, r1, t1, r2, t2, r3, t3 } },
      prompt: `${base.replace('took a loan from', `took a loan of ${inr(P)} from`)} How much interest did ${p.he} pay for ${yrs(T)}?`,
      answer: I,
      fmt: (n) => inr(n),
      mistakes: [
        { value: avg, why: 'averaged the three rates', trap: `${inr(avg)} uses the simple average of the rates, but the rates apply for different numbers of years.` },
        { value: (P * r1 * T) / 100, why: 'used the first rate for all years', trap: `The rate changes after ${yrs(t1)}; ${r1}% applies only to the first ${yrs(t1)}.` },
        { value: (P * (r1 * t1 + r2 * t2)) / 100, why: `ignored the years beyond ${t1 + t2}` },
        { value: (P * r3 * T) / 100, why: 'used the last rate for all years' },
      ],
      steps,
      shortcut: `Add the percentages year by year: ${S}% of the sum in all.`,
      trap: `Each rate applies only to its own years.`,
      tags: ['interest:simple', 'interest:changing-rate'],
    };
  }
  const avgP = clean((I * 300) / ((r1 + r2 + r3) * T));
  return {
    facts: { form: 'si-rate-change', ask, given: { I, r1, t1, r2, t2, r3, t3 } },
    prompt: `${base} If ${p.he} paid ${inr(I)} as interest at the end of ${yrs(T)}, how much had ${p.he} borrowed?`,
    answer: P,
    fmt: (n) => inr(n),
    mistakes: [
      { value: avgP, why: 'averaged the three rates', trap: `${inr(avgP)} uses the simple average of the rates, but they apply for different numbers of years.` },
      { value: clean((I * 100) / (r1 + r2 + r3)), why: 'added the rates once, ignoring the years' },
      { value: clean((I * 100) / (r1 * T)), why: 'used the first rate for all years' },
      { value: clean((I * 100) / (r3 * T)), why: 'used the last rate for all years' },
    ],
    steps,
    shortcut: `Total rate over ${yrs(T)} = ${S}% → sum = ${inr(I)} × 100 ÷ ${S}.`,
    trap: `Each rate applies only to its own years.`,
    tags: ['interest:simple', 'interest:changing-rate'],
  };
}

/** extreme — rate and time both change; find the sum. */
export function siRateTimeChange(ctx: BuildContext): D {
  const { rng } = ctx;
  let R = rng.int(5, 12);
  let T = rng.int(3, 6);
  let a = rng.int(1, 4);
  let b = rng.int(1, 2);
  if ((R + a) * (T - b) === R * T) a += 1;
  if (b >= T) b = 1;
  if ((R + a) * (T - b) === R * T) {
    R = 8;
    T = 5;
    a = 2;
    b = 1;
  }
  const P = multipleIn(rng, 100, 5000, 60000);
  const I = (P * R * T) / 100;
  const J = (P * (R + a) * (T - b)) / 100;
  const perYear1 = I / T;
  const perYear2 = J / (T - b);
  const diff = perYear2 - perYear1;
  const more = J > I ? 'more' : 'less';
  const noDivide = clean((diff * 100) / 1);
  return {
    facts: { form: 'si-rate-time-change', ask: 'principal', given: { T, I, rise: a, cut: b, J } },
    prompt: `The simple interest on a sum of money for ${yrs(T)} is ${inr(I)}. Had the rate of interest been ${a}% per annum higher and the time ${yrs(b)} less, the interest would have been ${inr(J)}${
      J === I ? ' (the same)' : ''
    }. Find the sum.`,
    answer: P,
    fmt: (n) => inr(n),
    mistakes: [
      ...(a > 1 ? [{ value: noDivide, why: `forgot to divide by the ${a}% rise`, trap: `${inr(noDivide)} is what 1% would give; the gap in yearly interest comes from a ${a}% rise.` }] : []),
      { value: clean(((J - I) * 100) / (a * T)), why: `took the ${inr(Math.abs(J - I))} ${more} as caused by the rate alone` },
      { value: clean((J * 100) / (a * (T - b))), why: 'used only the second interest' },
      { value: clean((I * 100) / (a * T)), why: 'used only the first interest' },
    ],
    steps: [
      `Yearly interest at the original rate = ${inr(I)} ÷ ${T} = ${inr(perYear1)} (this is R% of P)`,
      `Yearly interest at the higher rate = ${inr(J)} ÷ ${T - b} = ${inr(perYear2)} (this is (R + ${a})% of P)`,
      `So ${a}% of P = ${inr(perYear2)} − ${inr(perYear1)} = ${inr(diff)}`,
      `P = ${inr(diff)} × 100 ÷ ${a} = ${inr(P)}`,
    ],
    shortcut: `Compare interest per year: the extra ${a}% explains the whole rise in yearly interest.`,
    trap: `Compare yearly interest, not total interest — the periods are different.`,
    tags: ['interest:simple', 'interest:rate-time-change'],
  };
}

/** extreme — reinvest the amount at a new rate. */
export function siReinvest(ctx: BuildContext): D {
  const { rng } = ctx;
  const r1 = rng.pick([5, 6, 8, 10, 12]);
  const t1 = rng.int(2, 4);
  const r2 = rng.pick([6, 8, 9, 10, 12, 15].filter((x) => x !== r1));
  const t2 = rng.int(2, 4);
  const P = rng.int(1, 9) * 10000;
  const A1 = (P * (100 + r1 * t1)) / 100;
  const A2 = (A1 * (100 + r2 * t2)) / 100;
  const ask = rng.pick(['interest', 'amount'] as const);
  const p = person(rng);
  const naive = (P * (r1 * t1 + r2 * t2)) / 100;
  const lead = `${p.name} invested ${inr(P)} at ${r1}% per annum simple interest for ${yrs(t1)}. ${cap(p.he)} then reinvested the entire amount at ${r2}% per annum simple interest for ${yrs(t2)} more.`;
  const steps = [
    `First ${yrs(t1)}: interest = ${r1 * t1}% of ${inr(P)} = ${inr(A1 - P)} → amount ${inr(A1)}`,
    `Next ${yrs(t2)}: interest = ${r2 * t2}% of ${inr(A1)} = ${inr(A2 - A1)} → amount ${inr(A2)}`,
    ask === 'interest' ? `Total interest = ${inr(A2)} − ${inr(P)} = ${inr(A2 - P)}` : `Final amount = ${inr(A2)}`,
  ];
  return {
    facts: { form: 'si-reinvest', ask, given: { P, r1, t1, r2, t2 } },
    prompt: `${lead} ${ask === 'interest' ? `What total interest did ${p.he} earn?` : `What amount did ${p.he} finally receive?`}`,
    answer: ask === 'interest' ? A2 - P : A2,
    fmt: (n) => inr(n),
    mistakes:
      ask === 'interest'
        ? [
            { value: naive, why: 'calculated the second interest on the original sum', trap: `${inr(naive)} charges the second rate on ${inr(P)}; after reinvesting, the principal is ${inr(A1)}.` },
            { value: A2, why: 'gave the final amount instead of the interest' },
            { value: A2 - A1, why: 'counted only the second period' },
            { value: A1 - P, why: 'counted only the first period' },
          ]
        : [
            { value: P + naive, why: 'calculated the second interest on the original sum', trap: `${inr(P + naive)} charges the second rate on ${inr(P)}; after reinvesting, the principal is ${inr(A1)}.` },
            { value: A2 - P, why: 'gave the interest instead of the amount' },
            { value: A1, why: 'stopped after the first period' },
            { value: A1 + (A1 * r2) / 100, why: 'added only one year at the second rate' },
          ],
    steps,
    shortcut: `Chain the multipliers: ${inr(P)} × ${plain((100 + r1 * t1) / 100)} × ${plain((100 + r2 * t2) / 100)} = ${inr(A2)}.`,
    trap: `The second period's interest is on the reinvested amount.`,
    tags: ['interest:simple', 'interest:reinvest'],
    ...(ask === 'amount' ? { choice: { min: P, step: stepWithin(A2 - P) } } : {}),
  };
}
