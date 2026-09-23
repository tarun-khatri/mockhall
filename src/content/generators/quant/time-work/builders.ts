/**
 * quant.time-work builders. Work is measured in units = LCM of the individual times (efficiency method),
 * so every efficiency is a whole number of units per day.
 */
import type { BuildContext } from '../../types';
import type { WorkFacts } from '../time-work';
import { fracTex, inr, plain } from '../../../../lib/format';
import { type Draft, clean, cleanFrac, count, days, gcdN, hours, job, lcmN, names, num } from './kit';

type D = Draft<WorkFacts>;
type Level = 'easy' | 'medium' | 'hard' | 'extreme';

const together = (...ds: number[]) => 1 / ds.reduce((s, d) => s + 1 / d, 0);

/** [a, b, together] with a whole-number together time. */
const PAIRS: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (let a = 4; a <= 60; a++)
    for (let b = a + 1; b <= 90; b++) {
      const t = (a * b) / (a + b);
      if (Number.isInteger(t) && b <= 4 * a) out.push([a, b, t]);
    }
  return out;
})();

/* ------------------------------ efficiency ------------------------------ */

export function efficiency(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const [A, B, C] = names(rng, 3);
  const work = job(rng);
  if (level === 'easy' || level === 'medium') {
    let p: number;
    let q: number;
    let phrase: string;
    if (level === 'easy') {
      p = rng.pick([2, 3]);
      q = 1;
      phrase = `${A} is ${p === 2 ? 'twice' : 'thrice'} as efficient as ${B}`;
    } else {
      const x = rng.pick([20, 25, 40, 50, 60, 100]);
      const g = gcdN(100 + x, 100);
      p = (100 + x) / g;
      q = 100 / g;
      phrase = `${A} is ${x}% more efficient than ${B}`;
    }
    const askA = rng.chance(0.5);
    const unit = askA ? p : q;
    const T = unit * rng.int(2, level === 'easy' ? 8 : 5);
    const ans = ((p + q) * T) / unit;
    const other = ((p + q) * T) / (askA ? q : p);
    const who = askA ? A : B;
    return {
      facts: { form: 'eff-ratio', ask: askA ? 'A' : 'B', given: { p, q, T } },
      prompt: `${phrase}. Working together, they can finish ${work} in ${days(T)}. In how many days can ${who} alone finish it?`,
      answer: ans,
      fmt: days,
      mistakes: [
        { value: other, why: 'gave the other worker’s time', trap: `${days(other)} is ${askA ? B : A}'s time — the more efficient worker needs fewer days.` },
        { value: clean(T * (askA ? p : q)), why: 'multiplied the joint time by the efficiency share' },
        { value: 2 * T, why: 'doubled the joint time as if both were equal' },
        { value: clean((T * (p + q)) / (p + q + (askA ? q : p))), why: 'mixed up the efficiency parts' },
      ],
      steps: [
        `Efficiency ${A} : ${B} = ${p} : ${q}`,
        `Total work = (${p} + ${q}) × ${T} = ${(p + q) * T} units`,
        `${who} alone = ${(p + q) * T} ÷ ${askA ? p : q} = ${num(ans)} days`,
      ],
      shortcut: `Efficiency method: take efficiencies ${p} and ${q} units/day; work = joint efficiency × joint time.`,
      trap: `Time is inversely proportional to efficiency.`,
      tags: ['work:efficiency', 'trick:efficiency-lcm'],
      choice: { step: 1 },
    };
  }
  if (level === 'hard') {
    for (let tries = 0; tries < 400; tries++) {
      const [x, y] = [rng.pick([20, 25, 50, 100]), rng.pick([20, 25, 50, 100])];
      const g1 = gcdN(100 + x, 100);
      const g2 = gcdN(100 + y, 100);
      const [p1, q1] = [(100 + x) / g1, 100 / g1];
      const [p2, q2] = [(100 + y) / g2, 100 / g2];
      const eA = p1 * p2;
      const eB = q1 * p2;
      const eC = q1 * q2;
      const E = eA + eB + eC;
      const T = rng.int(2, 12);
      const ans = (E * T) / eC;
      if (!Number.isInteger(ans) || ans > 150) continue;
      return {
        facts: { form: 'eff-chain', ask: 'C', given: { x, y, T } },
        prompt: `${A} is ${x}% more efficient than ${B}, and ${B} is ${y}% more efficient than ${C}. Working together, the three finish ${work} in ${days(T)}. In how many days can ${C} alone finish it?`,
        answer: ans,
        fmt: days,
        mistakes: [
          { value: clean((E * T) / eA), why: `gave ${A}'s time`, trap: `${days((E * T) / eA)} is ${A}'s time; ${C} is the least efficient, so ${C} needs the most days.` },
          { value: 3 * T, why: 'assumed all three equally efficient' },
          { value: clean((E * T) / eB), why: `gave ${B}'s time` },
        ],
        steps: [`Efficiency ${B} : ${C} = ${p2} : ${q2} and ${A} : ${B} = ${p1} : ${q1}`, `${A} : ${B} : ${C} = ${eA} : ${eB} : ${eC}`, `Work = ${E} × ${T} = ${E * T} units`, `${C} alone = ${E * T} ÷ ${eC} = ${ans} days`],
        shortcut: `Chain the ratios into one A : B : C, then work = total efficiency × time.`,
        trap: `x% more efficient means (100 + x) : 100, applied link by link.`,
        tags: ['work:efficiency', 'trick:efficiency-lcm'],
        choice: { step: 2 },
      };
    }
  }
  // extreme: A is k times as efficient and finishes d days before B → together
  for (let tries = 0; tries < 400; tries++) {
    const [kn, kd] = rng.pick([[2, 1], [3, 1], [3, 2], [4, 3], [5, 2], [5, 3]]);
    const d = rng.int(2, 30);
    const nB = (d * kn) / (kn - kd);
    const nA = (nB * kd) / kn;
    const tau = (nB * kd) / (kn + kd);
    if (!Number.isFinite(cleanFrac(tau, 10)) || !Number.isInteger(nB) || !Number.isInteger(nA) || tau < 3) continue;
    const kText = kd === 1 ? (kn === 2 ? 'twice' : 'thrice') : `${fracTex(kn, kd)} times`;
    return {
      facts: { form: 'eff-gap', ask: 'together', given: { kNum: kn, kDen: kd, d } },
      prompt: `${A} is ${kText} as efficient as ${B} and therefore takes ${days(d)} less than ${B} to finish ${work}. In how many days can they finish it working together?`,
      answer: tau,
      fmt: days,
      mistakes: [
        { value: nA, why: `gave ${A}'s time alone`, trap: `${days(nA)} is ${A} alone; together they are faster still.` },
        { value: clean((nA + nB) / 2, 1), why: 'averaged the two times' },
        { value: cleanFrac(d / 2, 10), why: 'halved the difference' },
        { value: cleanFrac((nA * nB) / (nA + nB + d), 10), why: 'added the difference to the denominator' },
      ],
      steps: [
        `Time ratio ${A} : ${B} = ${kd} : ${kn}; the difference ${kn - kd} part${kn - kd === 1 ? '' : 's'} = ${d} days`,
        `${A} = ${nA} days, ${B} = ${nB} days`,
        `Together = ${nA} × ${nB} ÷ (${nA} + ${nB}) = ${num(tau)} days`,
      ],
      shortcut: `Efficiencies ${kn} : ${kd} → work = ${kn} × ${nA} units; together = work ÷ ${kn + kd}.`,
      trap: `Times are in the inverse ratio of efficiencies.`,
      tags: ['work:efficiency', 'trick:efficiency-lcm'],
      choice: Number.isInteger(tau) ? { step: 1 } : { step: 1, integer: false },
    };
  }
  throw new Error('efficiency: no numbers found');
}

/* ------------------------------ working together ------------------------------ */

export function workingTogether(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const [A, B, C] = names(rng, 3);
  const work = job(rng);
  if (level === 'easy') {
    const [a, b, t] = rng.pick(PAIRS);
    const W = lcmN(a, b);
    return {
      facts: { form: 'together', ask: 'days', given: {}, list: [a, b] },
      prompt: `${A} can finish ${work} in ${days(a)} and ${B} can finish it in ${days(b)}. In how many days can they finish it working together?`,
      answer: t,
      fmt: days,
      mistakes: [
        { value: a + b, why: 'added the times instead of the rates', trap: `Adding the days (${a + b}) would make two workers slower than one; add their daily work instead.` },
        { value: clean((a + b) / 2, 1), why: 'averaged the two times' },
        { value: b - a, why: 'subtracted the times' },
      ],
      steps: [`Total work = LCM(${a}, ${b}) = ${W} units`, `Efficiencies: ${A} = ${W / a}, ${B} = ${W / b} units/day`, `Together = ${W} ÷ ${W / a + W / b} = ${t} days`],
      shortcut: `Two people: ab/(a + b) = ${a * b} ÷ ${a + b} = ${t} days.`,
      trap: `Add work per day, not days.`,
      tags: ['work:together', 'trick:efficiency-lcm'],
      choice: { step: 1 },
    };
  }
  if (level === 'medium') {
    if (rng.chance(0.5)) {
      const [x, y, t] = rng.pick(PAIRS);
      const [a, b] = rng.chance(0.5) ? [x, y] : [y, x];
      return {
        facts: { form: 'pair-find', ask: 'B', given: { a, T: t } },
        prompt: `${A} and ${B} together can finish ${work} in ${days(t)}. ${A} alone can finish it in ${days(a)}. In how many days can ${B} alone finish it?`,
        answer: b,
        fmt: days,
        mistakes: [
          { value: a - t, why: 'subtracted the days', trap: `${days(a - t)} subtracts days; subtract the daily work (rates) instead.` },
          { value: a + t, why: 'added the days' },
          { value: 2 * t, why: 'assumed equal efficiency' },
        ],
        steps: [`Work = LCM(${a}, ${t}) = ${lcmN(a, t)} units`, `${A} + ${B} = ${lcmN(a, t) / t} units/day, ${A} = ${lcmN(a, t) / a} units/day`, `${B} = ${lcmN(a, t) / t - lcmN(a, t) / a} units/day → ${lcmN(a, t)} ÷ ${lcmN(a, t) / t - lcmN(a, t) / a} = ${b} days`],
        shortcut: `B = a × T ÷ (a − T) = ${a * t} ÷ ${a - t} = ${b}.`,
        trap: `Subtract rates, not times.`,
        tags: ['work:together', 'trick:efficiency-lcm'],
        choice: { step: 1 },
      };
    }
    for (let tries = 0; tries < 400; tries++) {
      const ds = rng.sample([6, 8, 9, 10, 12, 15, 18, 20, 24, 30, 36, 40, 45, 60], 3).sort((m, n) => m - n);
      const t = together(...ds);
      if (!Number.isFinite(cleanFrac(t, 6)) || t < 2) continue;
      const W = lcmN(...ds);
      return {
        facts: { form: 'together', ask: 'days', given: {}, list: ds },
        prompt: `${A}, ${B} and ${C} can finish ${work} in ${days(ds[0])}, ${days(ds[1])} and ${days(ds[2])} respectively. In how many days can they finish it working together?`,
        answer: t,
        fmt: days,
        mistakes: [
          { value: clean((ds[0] + ds[1] + ds[2]) / 3, 1), why: 'averaged the three times', trap: `Averaging days is meaningless; add the daily work of all three.` },
          { value: cleanFrac(together(ds[0], ds[1]), 6), why: 'left out the third worker' },
          { value: cleanFrac((ds[0] * ds[1] * ds[2]) / (ds[0] + ds[1] + ds[2]) / 10, 6), why: 'used abc/(a + b + c)' },
        ],
        steps: [`Work = LCM(${ds.join(', ')}) = ${W} units`, `Efficiencies: ${ds.map((d) => W / d).join(' + ')} = ${ds.reduce((s, d) => s + W / d, 0)} units/day`, `Together = ${W} ÷ ${ds.reduce((s, d) => s + W / d, 0)} = ${num(t)} days`],
        shortcut: `Efficiency method with LCM ${W}.`,
        trap: `Add rates, not days.`,
        tags: ['work:together', 'trick:efficiency-lcm'],
        choice: Number.isInteger(t) ? { step: 1 } : { step: 1, integer: false },
      };
    }
  }
  if (level === 'hard') {
    for (let tries = 0; tries < 600; tries++) {
      const [eA, eB, eC] = rng.sample([1, 2, 3, 4, 5, 6], 3);
      const base = lcmN(eA + eB, eB + eC, eC + eA);
      const W = base * rng.int(1, 3);
      const x = W / (eA + eB);
      const y = W / (eB + eC);
      const z = W / (eC + eA);
      if (x > 60 || y > 60 || z > 60) continue;
      const askAll = rng.chance(0.5);
      const ans = askAll ? W / (eA + eB + eC) : W / eA;
      if (!Number.isFinite(cleanFrac(ans, 6)) || ans > 120) continue;
      const allT = W / (eA + eB + eC);
      return {
        facts: { form: 'pairs', ask: askAll ? 'all' : 'A', given: { AB: x, BC: y, CA: z } },
        prompt: `${A} and ${B} together can finish ${work} in ${days(x)}, ${B} and ${C} together in ${days(y)}, and ${C} and ${A} together in ${days(z)}. In how many days can ${askAll ? 'all three finish it working together' : `${A} alone finish it`}?`,
        answer: ans,
        fmt: days,
        mistakes: askAll
          ? [
              { value: cleanFrac((2 * allT) / 1, 6), why: 'forgot to halve the sum of the pairs', trap: `Adding the three pairs counts every person twice; halve the combined rate.` },
              { value: clean((x + y + z) / 3, 1), why: 'averaged the pair times' },
              { value: cleanFrac(allT / 2, 6), why: 'halved the time instead of the rate' },
            ]
          : [
              { value: cleanFrac(W / eB, 6), why: `gave ${B}'s time` },
              { value: cleanFrac(W / eC, 6), why: `gave ${C}'s time` },
              { value: cleanFrac(2 * allT, 6), why: 'used twice the joint time' },
            ],
        steps: [
          `Work = LCM(${x}, ${y}, ${z}) → take ${W} units`,
          `(A + B) + (B + C) + (C + A) = ${eA + eB} + ${eB + eC} + ${eC + eA} = ${2 * (eA + eB + eC)} units/day`,
          `A + B + C = ${eA + eB + eC} units/day → together ${num(allT)} days`,
          ...(askAll ? [] : [`${A} = ${eA + eB + eC} − (B + C) ${eB + eC} = ${eA} units/day → ${num(W / eA)} days`]),
        ],
        shortcut: `Sum of pair rates = 2 × (A + B + C).`,
        trap: `Each person appears in two pairs.`,
        tags: ['work:together', 'trick:efficiency-lcm'],
        choice: Number.isInteger(ans) ? { step: 1 } : { step: 1, integer: false },
      };
    }
  }
  const [p, qq] = rng.pick([[4, 9], [9, 16], [4, 16], [8, 18], [9, 25], [16, 25], [2, 8], [3, 12], [5, 20], [16, 36], [4, 25], [12, 27]]);
  const T = Math.sqrt(p * qq);
  return {
    facts: { form: 'sqrt-rule', ask: 'T', given: { p, q: qq } },
    prompt: `Working together, ${A} and ${B} finish ${work} in a certain number of days. ${A} alone would take ${days(p)} more than that, and ${B} alone would take ${days(qq)} more. How many days do they take together?`,
    answer: T,
    fmt: days,
    mistakes: [
      { value: clean((p + qq) / 2, 1), why: 'averaged the extra days', trap: `The joint time is the geometric mean √(${p} × ${qq}), not the average.` },
      { value: qq - p, why: 'took the difference of the extra days' },
      { value: clean((p * qq) / (p + qq), 2), why: 'used pq/(p + q)' },
    ],
    steps: [`Let the joint time be T: 1/(T + ${p}) + 1/(T + ${qq}) = 1/T`, `This simplifies to T² = ${p} × ${qq} = ${p * qq}`, `T = ${T} days`],
    shortcut: `T = √(extra₁ × extra₂) = √${p * qq} = ${T}.`,
    trap: `Use the product rule, not the average.`,
    tags: ['work:together', 'trick:sqrt-rule'],
    choice: { step: 1 },
  };
}

/* ------------------------------ one leaves / joins ------------------------------ */

export function leaves(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const [A, B, C] = names(rng, 3);
  const work = job(rng);
  for (let tries = 0; tries < 800; tries++) {
    const ds = rng.sample([6, 8, 10, 12, 15, 16, 18, 20, 24, 30, 36, 40, 45, 60], 3);
    const [a, b, c] = ds;
    const W = lcmN(a, b, c);
    const [eA, eB, eC] = [W / a, W / b, W / c];
    if (level === 'easy' || level === 'medium') {
      const d = rng.int(2, 10);
      const done = d * (eA + eB);
      if (done >= W) continue;
      const rest = (W - done) / eB;
      const askTotal = level === 'medium' && rng.chance(0.5);
      const ans = askTotal ? d + rest : rest;
      if (!Number.isFinite(cleanFrac(ans, 6)) || ans < 2) continue;
      if (level === 'medium' && !askTotal && rng.chance(0.5)) {
        // leaves d days before completion
        const T = (W + d * eA) / (eA + eB);
        if (!Number.isFinite(cleanFrac(T, 6)) || T <= d + 1) continue;
        return {
          facts: { form: 'leave-before', ask: 'total', given: { a, b, d } },
          prompt: `${A} and ${B} can finish ${work} in ${days(a)} and ${days(b)} respectively. They start together, but ${A} leaves ${days(d)} before the work is finished. In how many days is the work finished?`,
          answer: T,
          fmt: days,
          mistakes: [
            { value: cleanFrac(together(a, b) + d, 6), why: 'added the leaving days to the joint time', trap: `${A} stops ${d} days before the end, so ${B} works all T days and ${A} only T − ${d}.` },
            { value: cleanFrac(together(a, b), 6), why: 'ignored that A leaves' },
            { value: cleanFrac((W - d * eB) / (eA + eB), 6), why: 'gave the leaving days to the wrong person' },
          ],
          steps: [`Work = LCM(${a}, ${b}) → ${W} units; ${A} = ${eA}, ${B} = ${eB} units/day`, `If ${A} had also worked the last ${d} days, the work would be ${W} + ${d} × ${eA} = ${W + d * eA} units`, `T = ${W + d * eA} ÷ ${eA + eB} = ${num(T)} days`],
          shortcut: `Pretend the leaver worked to the end: add the missing work, divide by the joint rate.`,
          trap: `${B} works the whole time; ${A} misses the last ${d} days.`,
          tags: ['work:leaves', 'trick:efficiency-lcm'],
          choice: Number.isInteger(T) ? { step: 1 } : { step: 1, integer: false },
        };
      }
      return {
        facts: { form: 'leave-after', ask: askTotal ? 'total' : 'rest', given: { a, b, d } },
        prompt: `${A} and ${B} can finish ${work} in ${days(a)} and ${days(b)} respectively. They work together for ${days(d)}, and then ${A} leaves. ${askTotal ? 'In how many days in all is the work finished?' : `In how many more days will ${B} finish the remaining work?`}`,
        answer: ans,
        fmt: days,
        mistakes: [
          { value: askTotal ? cleanFrac(rest, 6) : cleanFrac(d + rest, 6), why: askTotal ? 'gave only the remaining days' : 'gave the total days', trap: askTotal ? `${days(rest)} is only ${B}'s extra time; add the first ${d} days.` : `${days(d + rest)} includes the ${d} days they worked together.` },
          { value: cleanFrac((W - done) / eA, 6), why: `let ${A} finish instead of ${B}` },
          { value: cleanFrac(b - d, 6), why: `subtracted the days from ${B}'s time` },
        ],
        steps: [`Work = LCM(${a}, ${b}) → ${W} units; ${A} = ${eA}, ${B} = ${eB} units/day`, `In ${d} days together: ${d} × ${eA + eB} = ${done} units`, `Remaining ${W - done} units ÷ ${eB} = ${num(rest)} days${askTotal ? `; total = ${d} + ${num(rest)} = ${num(d + rest)} days` : ''}`],
        shortcut: `Efficiency method: units done together, then remaining ÷ ${B}'s rate.`,
        trap: `After ${A} leaves only ${B}'s rate counts.`,
        tags: ['work:leaves', 'trick:efficiency-lcm'],
        choice: Number.isInteger(ans) ? { step: 1 } : { step: 1, integer: false },
      };
    }
    if (level === 'hard') {
      const d1 = rng.int(2, 6);
      const d2 = rng.int(2, 6);
      const T = (W - d1 * eA + d2 * eB) / (eB + eC);
      if (!Number.isFinite(cleanFrac(T, 4)) || T <= d1 + 1 || T <= d2 + 1) continue;
      const noLeave = together(a, b, c);
      return {
        facts: { form: 'three-leave', ask: 'total', given: { a, b, c, d1, d2 } },
        prompt: `${A}, ${B} and ${C} can finish ${work} in ${days(a)}, ${days(b)} and ${days(c)} respectively. All three start together; ${A} leaves after ${days(d1)} and ${B} leaves ${days(d2)} before the work is finished. In how many days is the work finished?`,
        answer: T,
        fmt: days,
        mistakes: [
          { value: cleanFrac(noLeave, 4), why: 'ignored both departures', trap: `${days(noLeave)} assumes all three work throughout.` },
          { value: cleanFrac((W - d1 * eA - d2 * eB) / (eB + eC), 4), why: `subtracted ${B}'s missing days instead of adding them` },
          { value: cleanFrac(noLeave + d2, 4), why: 'added the leaving days to the joint time' },
        ],
        steps: [
          `Work = ${W} units; ${A} = ${eA}, ${B} = ${eB}, ${C} = ${eC} units/day`,
          `Let the total be T: ${A} works ${d1} days, ${B} works T − ${d2}, ${C} works T`,
          `${eA} × ${d1} + ${eB}(T − ${d2}) + ${eC}T = ${W} → ${eB + eC}T = ${W - d1 * eA + d2 * eB}`,
          `T = ${num(T)} days`,
        ],
        shortcut: `Write each person's working days in terms of T and add their work.`,
        trap: `"Leaves d days before completion" is counted back from the end.`,
        tags: ['work:leaves', 'trick:efficiency-lcm'],
        choice: Number.isInteger(T) ? { step: 1 } : { step: 1, integer: false },
      };
    }
    // extreme: staggered joining
    const d1 = rng.int(2, 5);
    const d2 = rng.int(2, 5);
    const T = (W + d1 * eB + (d1 + d2) * eC) / (eA + eB + eC);
    if (!Number.isFinite(cleanFrac(T, 4)) || T <= d1 + d2 + 0.5) continue;
    return {
      facts: { form: 'join-later', ask: 'total', given: { a, b, c, d1, d2 } },
      prompt: `${A}, ${B} and ${C} can finish ${work} in ${days(a)}, ${days(b)} and ${days(c)} respectively. ${A} starts alone; ${B} joins after ${days(d1)}, and ${C} joins ${days(d2)} after that. In how many days, from the start, is the work finished?`,
      answer: T,
      fmt: days,
      mistakes: [
        { value: cleanFrac(together(a, b, c), 4), why: 'assumed all three started together', trap: `${days(together(a, b, c))} ignores the late joining.` },
        { value: cleanFrac(together(a, b, c) + d1 + d2, 4), why: 'added the waiting days to the joint time' },
        { value: cleanFrac((W + d1 * eB + d2 * eC) / (eA + eB + eC), 4), why: `counted ${C}'s delay from ${B}'s start only` },
      ],
      steps: [
        `Work = ${W} units; ${A} = ${eA}, ${B} = ${eB}, ${C} = ${eC} units/day`,
        `Total T: ${A} works T, ${B} works T − ${d1}, ${C} works T − ${d1 + d2}`,
        `${eA + eB + eC}T − ${d1 * eB} − ${(d1 + d2) * eC} = ${W} → T = ${num(T)} days`,
      ],
      shortcut: `Add the "missed" work of late joiners to the total, then divide by the full team rate.`,
      trap: `${C} joins ${d1 + d2} days after the start, not ${d2}.`,
      tags: ['work:leaves', 'trick:efficiency-lcm'],
      choice: Number.isInteger(T) ? { step: 1 } : { step: 1, integer: false },
    };
  }
  throw new Error('leaves: no numbers found');
}

/* ------------------------------ alternate days ------------------------------ */

/** Days to finish when workers (efficiencies) take turns in `order`, each for one day. */
function rotation(W: number, effs: number[]): number {
  let done = 0;
  let day = 0;
  for (;;) {
    const e = effs[day % effs.length];
    if (done + e >= W) return day + (W - done) / e;
    done += e;
    day++;
  }
}

export function alternate(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const [A, B, C] = names(rng, 3);
  const work = job(rng);
  for (let tries = 0; tries < 800; tries++) {
    if (level === 'easy' || level === 'medium' || level === 'hard') {
      const k = level === 'hard' ? 3 : 2;
      const ds = rng.sample([6, 8, 9, 10, 12, 15, 16, 18, 20, 24, 30, 36, 40], k);
      const W = lcmN(...ds);
      const effs = ds.map((d) => W / d);
      const cycle = effs.reduce((s, e) => s + e, 0);
      const exact = W % cycle === 0;
      if (level === 'easy' && !exact) continue;
      if (level !== 'easy' && exact) continue;
      const T = rotation(W, effs);
      if (!Number.isFinite(cleanFrac(T, 12)) || T > 60) continue;
      const nm = [A, B, C].slice(0, k);
      const naive = (k * W) / cycle;
      return {
        facts: { form: 'rotation', ask: 'days', given: {}, list: ds },
        prompt:
          k === 2
            ? `${A} can finish ${work} in ${days(ds[0])} and ${B} in ${days(ds[1])}. They work on alternate days, ${A} starting on the first day. In how many days will the work be finished?`
            : `${A}, ${B} and ${C} can finish ${work} in ${days(ds[0])}, ${days(ds[1])} and ${days(ds[2])} respectively. They work one at a time on successive days in the order ${A}, ${B}, ${C}, ${A}, … . In how many days will the work be finished?`,
        answer: T,
        fmt: days,
        mistakes: [
          { value: exact ? NaN : cleanFrac(naive, 12), why: 'divided the work by the cycle rate without checking the last day', trap: `${days(naive)} treats the last cycle as smooth; check who works on the final day and how much remains.` },
          { value: cleanFrac(together(...ds), 12), why: 'let them work together every day' },
          { value: cleanFrac(Math.ceil(T), 12) === T ? NaN : Math.ceil(T), why: 'rounded up to a whole day' },
          { value: cleanFrac(2 * together(...ds), 12), why: 'doubled the joint time' },
        ],
        steps: [
          `Work = LCM(${ds.join(', ')}) = ${W} units; efficiencies ${nm.map((n, i) => `${n} = ${effs[i]}`).join(', ')}`,
          `One ${k}-day cycle does ${cycle} units`,
          `${Math.floor(W / cycle)} full cycles = ${k * Math.floor(W / cycle)} days → ${Math.floor(W / cycle) * cycle} units, ${W - Math.floor(W / cycle) * cycle} left`,
          `Finish the rest day by day in order → total ${num(T)} days`,
        ],
        shortcut: `Cycle method: full cycles first, then finish the remainder in the given order.`,
        trap: `The last cycle may end part-way through a day — and it matters who works that day.`,
        tags: ['work:alternate-days', 'trick:efficiency-lcm'],
        choice: Number.isInteger(T) ? { step: 1 } : { step: 1, integer: false },
      };
    }
    // extreme: A works every day, B helps on every second day (days 2, 4, …)
    const [a, b] = rng.sample([8, 9, 10, 12, 15, 16, 18, 20, 24, 30, 36, 40], 2);
    const W = lcmN(a, b);
    const [eA, eB] = [W / a, W / b];
    const T = rotation(W, [eA, eA + eB]);
    if (!Number.isFinite(cleanFrac(T, 12)) || T > 40) continue;
    return {
      facts: { form: 'helper-alt', ask: 'days', given: { a, b } },
      prompt: `${A} can finish ${work} in ${days(a)} and ${B} in ${days(b)}. ${A} works every day, and ${B} joins ${A} on every second day (the 2nd, 4th, 6th … days). In how many days will the work be finished?`,
      answer: T,
      fmt: days,
      mistakes: [
        { value: cleanFrac(together(a, b), 12), why: 'let both work every day', trap: `${days(together(a, b))} has ${B} working daily; ${B} works only on even days.` },
        { value: cleanFrac((2 * W) / (2 * eA + eB), 12), why: 'used the average 2-day rate without checking the last day' },
        { value: cleanFrac(rotation(W, [eA + eB, eA]), 12), why: `let ${B} start on day 1` },
      ],
      steps: [`Work = LCM(${a}, ${b}) = ${W} units; ${A} = ${eA}, ${B} = ${eB} units/day`, `Every 2 days: ${eA} + ${eA + eB} = ${2 * eA + eB} units`, `Full 2-day blocks, then finish day by day → ${num(T)} days`],
      shortcut: `Work in 2-day blocks and check the final day separately.`,
      trap: `${B} helps only on even-numbered days.`,
      tags: ['work:alternate-days', 'trick:efficiency-lcm'],
      choice: Number.isInteger(T) ? { step: 1 } : { step: 1, integer: false },
    };
  }
  throw new Error('alternate: no numbers found');
}

/* ------------------------------ M1D1H1/W1 = M2D2H2/W2 ------------------------------ */

export function mdh(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const task = rng.pick([
    { what: 'lay a road', unit: 'km', w: [2, 3, 4, 5, 6, 8] },
    { what: 'build a boundary wall', unit: 'm', w: [120, 150, 180, 200, 240, 300] },
    { what: 'harvest a crop field', unit: 'hectares', w: [10, 12, 15, 18, 20, 24] },
  ]);
  for (let tries = 0; tries < 800; tries++) {
    const M1 = rng.int(4, 30);
    const D1 = rng.int(6, 40);
    if (level === 'easy') {
      const M2 = rng.int(4, 40);
      const D2 = (M1 * D1) / M2;
      if (!Number.isInteger(D2) || M2 === M1 || D2 < 3 || D2 > 90) continue;
      return {
        facts: { form: 'mdh', ask: 'D2', given: { M1, D1, H1: 1, W1: 1, M2, H2: 1, W2: 1 } },
        prompt: `${M1} workers can finish a piece of work in ${days(D1)}. In how many days can ${M2} workers finish the same work?`,
        answer: D2,
        fmt: days,
        mistakes: [
          { value: clean((D1 * M2) / M1), why: 'used direct proportion', trap: `More workers need fewer days: days vary inversely with workers.` },
          { value: clean(D1 + M1 - M2), why: 'shifted days by the change in workers' },
        ],
        steps: [`Total work = ${M1} × ${D1} = ${M1 * D1} worker-days`, `Days = ${M1 * D1} ÷ ${M2} = ${D2}`],
        shortcut: `M₁D₁ = M₂D₂.`,
        trap: `Workers and days are inversely proportional.`,
        tags: ['work:mdh'],
        choice: { step: 1 },
      };
    }
    const H1 = rng.int(4, 10);
    const H2 = rng.int(4, 10);
    if (level === 'medium') {
      const M2 = rng.int(4, 40);
      const D2 = (M1 * D1 * H1) / (M2 * H2);
      if (!Number.isInteger(D2) || D2 < 3 || D2 > 90 || H1 === H2) continue;
      return {
        facts: { form: 'mdh', ask: 'D2', given: { M1, D1, H1, W1: 1, M2, H2, W2: 1 } },
        prompt: `${M1} men working ${hours(H1)} a day can finish a piece of work in ${days(D1)}. In how many days will ${M2} men working ${hours(H2)} a day finish the same work?`,
        answer: D2,
        fmt: days,
        mistakes: [
          { value: clean((M1 * D1) / M2), why: 'ignored the hours per day', trap: `The working day changes from ${H1} to ${H2} hours, so the man-hours per day change too.` },
          { value: clean((M1 * D1 * H2) / (M2 * H1)), why: 'inverted the hours ratio' },
          { value: clean((D1 * M2 * H2) / (M1 * H1)), why: 'used direct proportion' },
        ],
        steps: [`Total work = ${M1} × ${D1} × ${H1} = ${M1 * D1 * H1} man-hours`, `Per day now: ${M2} × ${H2} = ${M2 * H2} man-hours`, `Days = ${M1 * D1 * H1} ÷ ${M2 * H2} = ${D2}`],
        shortcut: `M₁D₁H₁ = M₂D₂H₂.`,
        trap: `Include hours per day in the man-hours.`,
        tags: ['work:mdh'],
        choice: { step: 1 },
      };
    }
    if (level === 'hard') {
      const [W1, W2] = rng.sample(task.w, 2);
      const D2 = rng.int(5, 40);
      const M2 = (M1 * D1 * H1 * W2) / (W1 * D2 * H2);
      if (!Number.isInteger(M2) || M2 < 2 || M2 > 200) continue;
      return {
        facts: { form: 'mdh', ask: 'M2', given: { M1, D1, H1, W1, D2, H2, W2 } },
        prompt: `${M1} workers, working ${hours(H1)} a day, can ${task.what} of ${plain(W1)} ${task.unit} in ${days(D1)}. How many workers are needed to ${task.what} of ${plain(W2)} ${task.unit} in ${days(D2)}, working ${hours(H2)} a day?`,
        answer: M2,
        fmt: count('workers'),
        mistakes: [
          { value: clean((M1 * D1 * H1) / (D2 * H2)), why: 'ignored the change in the amount of work', trap: `The work changes from ${plain(W1)} to ${plain(W2)} ${task.unit}; more work needs proportionally more workers.` },
          { value: clean((M1 * D1 * H1 * W1) / (W2 * D2 * H2)), why: 'inverted the work ratio' },
          { value: clean((M1 * D1 * W2) / (W1 * D2)), why: 'ignored the hours per day' },
        ],
        steps: [`M₁D₁H₁/W₁ = M₂D₂H₂/W₂`, `${M1} × ${D1} × ${H1} ÷ ${plain(W1)} = M₂ × ${D2} × ${H2} ÷ ${plain(W2)}`, `M₂ = ${M1 * D1 * H1} × ${plain(W2)} ÷ (${plain(W1)} × ${D2 * H2}) = ${M2}`],
        shortcut: `Workers ∝ work, and ∝ 1/(days × hours).`,
        trap: `Work goes in the denominator on both sides.`,
        tags: ['work:mdh'],
        choice: { step: M2 >= 20 ? 2 : 1 },
      };
    }
    // extreme: some workers leave (or join) part-way
    const d = rng.int(2, D1 - 2);
    const leave = rng.chance(0.5);
    const x = rng.int(2, Math.max(2, Math.floor(M1 / 2)));
    const M2 = leave ? M1 - x : M1 + x;
    const rest = (M1 * (D1 - d)) / M2;
    if (!Number.isInteger(rest) || M2 < 2 || rest < 2) continue;
    return {
      facts: { form: 'mid-change', ask: 'rest', given: { M1, D1, d, change: leave ? -x : x } },
      prompt: `${M1} workers were engaged to finish a job in ${days(D1)}. After ${days(d)}, ${x} workers ${leave ? 'left' : 'joined them'}. In how many more days will the remaining work be finished?`,
      answer: rest,
      fmt: days,
      mistakes: [
        { value: D1 - d, why: 'ignored the change in the workforce', trap: `${days(D1 - d)} is the original plan; with ${M2} workers instead of ${M1} the remaining time changes.` },
        { value: clean((M1 * D1) / M2), why: 'recomputed the whole job with the new team' },
        { value: clean(((D1 - d) * M2) / M1), why: 'used direct proportion' },
      ],
      steps: [`Total = ${M1} × ${D1} = ${M1 * D1} worker-days; done = ${M1} × ${d} = ${M1 * d}`, `Left = ${M1 * (D1 - d)} worker-days`, `With ${M2} workers: ${M1 * (D1 - d)} ÷ ${M2} = ${rest} days`],
      shortcut: `Remaining worker-days ÷ new team size.`,
      trap: `Only the remaining work is shared by the new team.`,
      tags: ['work:mdh'],
      choice: { step: 1 },
    };
  }
  throw new Error('mdh: no numbers found');
}

/* ------------------------------ wages ------------------------------ */

export function wages(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const [A, B, C] = names(rng, 3);
  const work = job(rng);
  for (let tries = 0; tries < 800; tries++) {
    if (level === 'easy') {
      const [a, b] = rng.sample([6, 8, 9, 10, 12, 15, 16, 18, 20, 24, 30], 2);
      const W = lcmN(a, b);
      const [eA, eB] = [W / a, W / b];
      const pay = (eA + eB) * rng.int(2, 40) * 50;
      const share = (pay * eA) / (eA + eB);
      const byDays = (pay * a) / (a + b);
      return {
        facts: { form: 'wage-pair', ask: 'A', given: { a, b, pay } },
        prompt: `${A} can finish ${work} in ${days(a)} and ${B} in ${days(b)}. They take up the job together for ${inr(pay)} and finish it. What is ${A}'s share?`,
        answer: share,
        fmt: (v) => inr(v),
        mistakes: [
          { value: clean(byDays), why: 'split the wage in the ratio of days', trap: `${inr(byDays)} splits in the ratio of days ${a} : ${b}; wages follow work done, i.e. efficiencies ${eA} : ${eB}.` },
          { value: pay - share, why: `gave ${B}'s share` },
          { value: clean(pay / 2), why: 'split equally' },
        ],
        steps: [`Work = LCM(${a}, ${b}) = ${W} units; ${A} = ${eA}, ${B} = ${eB} units/day`, `Working together, work done is in the ratio ${eA} : ${eB}`, `${A}'s share = ${inr(pay)} × ${eA}/${eA + eB} = ${inr(share)}`],
        shortcut: `Wages ∝ work done ∝ efficiency (inverse of days).`,
        trap: `The faster worker earns more.`,
        tags: ['work:wages', 'trick:efficiency-lcm'],
      };
    }
    const [a, b] = rng.sample([8, 10, 12, 15, 16, 18, 20, 24, 30, 36, 40], 2);
    if (level === 'medium' || level === 'hard') {
      const T = rng.int(2, Math.min(a, b) - 1);
      const W = lcmN(a, b, T);
      const cUnits = W - T * (W / a + W / b);
      if (cUnits <= 0) continue;
      const pay = W * rng.int(1, 20) * 10;
      const cShare = (pay * cUnits) / W;
      if (!Number.isInteger(cShare) || pay > 200000) continue;
      if (level === 'hard' && rng.chance(0.5)) {
        const c = rng.pick([8, 10, 12, 15, 16, 18, 20, 24, 30, 36, 40].filter((x) => x !== a && x !== b));
        const W3 = lcmN(a, b, c);
        const e = [W3 / a, W3 / b, W3 / c];
        const E = e[0] + e[1] + e[2];
        const pay3 = E * rng.int(2, 40) * 50;
        const i = rng.int(0, 2);
        const share3 = (pay3 * e[i]) / E;
        const who = [A, B, C][i];
        const dd = [a, b, c];
        const byDays = (pay3 * dd[i]) / (a + b + c);
        return {
          facts: { form: 'wage-three', ask: String(i), given: { a, b, c, pay: pay3 } },
          prompt: `${A}, ${B} and ${C} can finish ${work} in ${days(a)}, ${days(b)} and ${days(c)} respectively. They work together, finish the job and receive ${inr(pay3)}. What is ${who}'s share?`,
          answer: share3,
          fmt: (v) => inr(v),
          mistakes: [
            { value: clean(byDays), why: 'split in the ratio of days', trap: `${inr(byDays)} gives more money to the slower worker; split by efficiency (inverse of days).` },
            { value: clean(pay3 / 3), why: 'split equally' },
            { value: clean((pay3 * e[(i + 1) % 3]) / E), why: 'gave another worker’s share' },
          ],
          steps: [`Work = LCM(${a}, ${b}, ${c}) = ${W3} units; efficiencies ${e.join(' : ')}`, `Working together, work (and pay) is shared ${e.join(' : ')}`, `${who}'s share = ${inr(pay3)} × ${e[i]}/${E} = ${inr(share3)}`],
          shortcut: `Wages ∝ efficiency when all work for the same time.`,
          trap: `Fewer days means a bigger share.`,
          tags: ['work:wages', 'trick:efficiency-lcm'],
        };
      }
      return {
        facts: { form: 'wage-helper', ask: 'cShare', given: { a, b, T, pay } },
        prompt: `${A} and ${B} can finish ${work} in ${days(a)} and ${days(b)} respectively. They take the job for ${inr(pay)} and, with the help of ${C}, finish it in ${days(T)}. How much should ${C} get?`,
        answer: cShare,
        fmt: (v) => inr(v),
        mistakes: [
          { value: clean(pay / 3), why: 'split equally among three', trap: `Wages follow work done; ${C} did only ${cUnits} of ${W} units.` },
          { value: clean((pay * T * (W / a)) / W), why: `gave ${A}'s share` },
          { value: clean((pay * T * (W / b)) / W), why: `gave ${B}'s share` },
        ],
        steps: [`Work = LCM(${a}, ${b}, ${T}) = ${W} units`, `${A} does ${T} × ${W / a} = ${(T * W) / a}, ${B} does ${T} × ${W / b} = ${(T * W) / b} units`, `${C} does ${W} − ${T * (W / a + W / b)} = ${cUnits} units → share = ${inr(pay)} × ${cUnits}/${W} = ${inr(cShare)}`],
        shortcut: `C's share = (1 − T/a − T/b) × total wage.`,
        trap: `Pay is by work done, not by days present.`,
        tags: ['work:wages', 'trick:efficiency-lcm'],
      };
    }
    // extreme: A works d days alone, then A and B finish together
    const W = lcmN(a, b);
    const [eA, eB] = [W / a, W / b];
    const d = rng.int(2, Math.max(2, a - 2));
    const left = W - d * eA;
    if (left <= 0) continue;
    const t = left / (eA + eB);
    const aUnits = (d + t) * eA;
    const pay = W * rng.int(1, 20) * 50;
    const share = (pay * aUnits) / W;
    if (!Number.isInteger(share) || !Number.isFinite(cleanFrac(t, 12))) continue;
    return {
      facts: { form: 'wage-late', ask: 'A', given: { a, b, d, pay } },
      prompt: `${A} can finish ${work} in ${days(a)} and ${B} in ${days(b)}. ${A} works alone for ${days(d)}, after which ${B} joins and they finish the rest together. If the total payment is ${inr(pay)}, what is ${A}'s share?`,
      answer: share,
      fmt: (v) => inr(v),
      mistakes: [
        { value: clean((pay * eA) / (eA + eB)), why: 'split by efficiency as if both worked throughout', trap: `${A} also worked ${d} days alone, so ${A}'s share is more than the efficiency ratio suggests.` },
        { value: clean((pay * a) / (a + b)), why: 'split in the ratio of days' },
        { value: clean((pay * d * eA) / W), why: `paid ${A} only for the solo days` },
      ],
      steps: [`Work = ${W} units; ${A} = ${eA}, ${B} = ${eB} units/day`, `${A} alone for ${d} days: ${d * eA} units; left ${left} units`, `Together: ${left} ÷ ${eA + eB} = ${num(t)} days`, `${A}'s work = ${plain(aUnits)} units → share = ${inr(pay)} × ${plain(aUnits)}/${W} = ${inr(share)}`],
      shortcut: `Wages ∝ units of work each person did.`,
      trap: `Count ${A}'s solo days too.`,
      tags: ['work:wages', 'trick:efficiency-lcm'],
    };
  }
  throw new Error('wages: no numbers found');
}

/* ------------------------------ men, women, children ------------------------------ */

export function mwc(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  for (let tries = 0; tries < 800; tries++) {
    if (level === 'hard') {
      const k1 = rng.int(2, 6);
      const k2 = rng.int(k1 + 1, 10);
      const Dd = rng.int(6, 40);
      const m = rng.int(1, 6);
      const w = rng.int(1, 8);
      const T = (Dd * k1 * k2) / (m * k2 + w * k1);
      if (!Number.isFinite(cleanFrac(T, 4)) || T < 2 || T === Dd) continue;
      return {
        facts: { form: 'mw-equiv', ask: 'days', given: { k1, k2, D: Dd, m, w } },
        prompt: `${k1} men or ${k2} women can finish a piece of work in ${days(Dd)}. In how many days can ${m} ${m === 1 ? 'man' : 'men'} and ${w} ${w === 1 ? 'woman' : 'women'} together finish it?`,
        answer: T,
        fmt: days,
        mistakes: [
          { value: cleanFrac((Dd * (k1 + k2)) / (m + w), 4), why: 'added men and women as if equal', trap: `A man and a woman do different amounts of work; convert to one kind first (${k1} men = ${k2} women).` },
          { value: cleanFrac((Dd * k1) / m, 4), why: 'ignored the women' },
          { value: cleanFrac((Dd * k1 * k2) / (m * k1 + w * k2), 4), why: 'swapped the conversion' },
        ],
        steps: [`${k1} men = ${k2} women → 1 man = ${fracTex(k2, k1)} women`, `${m} men + ${w} women = ${num((m * k2) / k1 + w)} women`, `Days = ${Dd} × ${k2} ÷ ${num((m * k2) / k1 + w)} = ${num(T)}`],
        shortcut: `Convert everyone into women (or men), then use M₁D₁ = M₂D₂.`,
        trap: `Men and women are not interchangeable one for one.`,
        tags: ['work:men-women-children'],
        choice: Number.isInteger(T) ? { step: 1 } : { step: 1, integer: false },
      };
    }
    // extreme: two teams → a third team (men, women); effs integers
    const em = rng.int(2, 6);
    const ew = rng.int(1, em - 1);
    const [a1, b1, a2, b2] = [rng.int(1, 8), rng.int(1, 10), rng.int(1, 8), rng.int(1, 10)];
    if (a1 * b2 === a2 * b1) continue;
    const e1 = a1 * em + b1 * ew;
    const e2 = a2 * em + b2 * ew;
    const W = lcmN(e1, e2) * rng.int(1, 3);
    const D1 = W / e1;
    const D2 = W / e2;
    if (D1 > 60 || D2 > 60 || D1 < 3 || D2 < 3) continue;
    const askMan = rng.chance(0.5);
    const ans = W / (askMan ? em : ew);
    if (!Number.isInteger(ans) || ans > 200) continue;
    return {
      facts: { form: 'mw-teams', ask: askMan ? 'man' : 'woman', given: { a1, b1, D1, a2, b2, D2 } },
      prompt: `${a1} men and ${b1} women can finish a piece of work in ${days(D1)}, while ${a2} men and ${b2} women can finish it in ${days(D2)}. In how many days can one ${askMan ? 'man' : 'woman'} alone finish the work?`,
      answer: ans,
      fmt: days,
      mistakes: [
        { value: W / (askMan ? ew : em), why: `gave the time for one ${askMan ? 'woman' : 'man'}`, trap: `${days(W / (askMan ? ew : em))} is one ${askMan ? 'woman' : 'man'}'s time.` },
        { value: clean(D1 * (a1 + b1)), why: 'treated men and women as equal' },
        { value: clean(D2 * (a2 + b2)), why: 'treated men and women as equal (second team)' },
      ].filter((m) => m.value <= 300),
      steps: [
        `Let a man do m and a woman w units/day: ${D1}(${a1}m + ${b1}w) = ${D2}(${a2}m + ${b2}w)`,
        `This gives m : w = ${em} : ${ew}`,
        `Work = ${D1} × (${a1} × ${em} + ${b1} × ${ew}) = ${W} units`,
        `One ${askMan ? 'man' : 'woman'}: ${W} ÷ ${askMan ? em : ew} = ${ans} days`,
      ],
      shortcut: `Equate the two teams' work to get the man : woman efficiency ratio.`,
      trap: `A man and a woman have different efficiencies.`,
      tags: ['work:men-women-children'],
      choice: { step: ans >= 40 ? 5 : 1 },
    };
  }
  throw new Error('mwc: no numbers found');
}
