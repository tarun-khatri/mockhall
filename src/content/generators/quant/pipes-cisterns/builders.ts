/**
 * quant.pipes-cisterns builders. The tank is measured in units = LCM of the pipe times (efficiency method),
 * so each pipe fills (+) or empties (−) a whole number of units per minute/hour.
 */
import type { BuildContext } from '../../types';
import type { PipeFacts } from '../pipes-cisterns';
import { fracTex, indian, plain } from '../../../../lib/format';
import { type Draft, clean, cleanFrac, count, lcmN, num, tank } from './kit';

type D = Draft<PipeFacts>;
type Level = 'easy' | 'medium' | 'hard' | 'extreme';

const TIMES = [4, 5, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24, 30, 36, 40, 45, 60];

function unitWord(ctx: BuildContext): 'minutes' | 'hours' {
  return ctx.rng.chance(0.5) ? 'minutes' : 'hours';
}

const together = (...ts: number[]) => 1 / ts.reduce((s, t) => s + 1 / t, 0);
const fracOK = (v: number, den = 12) => Number.isFinite(cleanFrac(v, den));
const stepOf = (v: number) => (Number.isInteger(v) ? { step: v >= 30 ? 2 : 1 } : { step: 1, integer: false });

export function fillEmpty(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const u = unitWord(ctx);
  const fmt = count(u);
  const where = tank(rng);
  for (let tries = 0; tries < 800; tries++) {
    if (level === 'easy') {
      const [a, b] = rng.sample(TIMES, 2).sort((x, y) => x - y);
      const T = together(a, b);
      if (!Number.isInteger(T) || T < 3) continue;
      return {
        facts: { form: 'all-open', ask: 'time', given: {}, list: [a, b] },
        prompt: `Two pipes A and B can fill ${where} in ${a} ${u} and ${b} ${u} respectively. If both are opened together, how long will they take to fill the empty tank?`,
        answer: T,
        fmt,
        mistakes: [
          { value: a + b, why: 'added the times instead of the rates', trap: `${fmt(a + b)} is longer than either pipe alone — two pipes must be faster; add the rates.` },
          { value: clean((a + b) / 2, 1), why: 'averaged the two times' },
          { value: b - a, why: 'subtracted the times' },
        ],
        steps: [`Tank = LCM(${a}, ${b}) = ${lcmN(a, b)} units; A = ${lcmN(a, b) / a}, B = ${lcmN(a, b) / b} units per ${u.slice(0, -1)}`, `Together = ${lcmN(a, b) / a + lcmN(a, b) / b} units per ${u.slice(0, -1)}`, `Time = ${lcmN(a, b)} ÷ ${lcmN(a, b) / a + lcmN(a, b) / b} = ${T} ${u}`],
        shortcut: `ab/(a + b) = ${a * b} ÷ ${a + b} = ${T}.`,
        trap: `Add filling rates, not times.`,
        tags: ['pipes:fill-empty', 'trick:efficiency-lcm'],
        choice: stepOf(T),
      };
    }
    if (level === 'medium') {
      const [a, b, c] = rng.sample(TIMES, 3);
      if (c <= Math.min(a, b)) continue;
      const net = 1 / a + 1 / b - 1 / c;
      if (net <= 0) continue;
      const T = 1 / net;
      if (!fracOK(T, 6) || T > 120) continue;
      const W = lcmN(a, b, c);
      return {
        facts: { form: 'all-open', ask: 'time', given: {}, list: [a, b, -c] },
        prompt: `Pipes A and B can fill ${where} in ${a} ${u} and ${b} ${u} respectively, and pipe C can empty the full tank in ${c} ${u}. If all three pipes are opened together on the empty tank, how long will it take to fill?`,
        answer: T,
        fmt,
        mistakes: [
          { value: cleanFrac(together(a, b, c), 6), why: 'treated the emptying pipe as a filling pipe', trap: `${fmt(together(a, b, c))} adds C's rate; C empties the tank, so subtract it.` },
          { value: cleanFrac(together(a, b), 6), why: 'ignored the emptying pipe' },
          { value: cleanFrac(together(a, b) + c / 10, 6), why: 'added part of C’s time' },
        ],
        steps: [`Tank = LCM(${a}, ${b}, ${c}) = ${W} units`, `Net per ${u.slice(0, -1)} = ${W / a} + ${W / b} − ${W / c} = ${W / a + W / b - W / c} units`, `Time = ${W} ÷ ${W / a + W / b - W / c} = ${num(T)} ${u}`],
        shortcut: `Emptying pipes get a minus sign in the efficiency method.`,
        trap: `The emptying pipe works against the others.`,
        tags: ['pipes:fill-empty', 'trick:efficiency-lcm'],
        choice: stepOf(T),
      };
    }
    if (level === 'hard') {
      const [a, b] = rng.sample(TIMES, 2);
      const c = rng.pick(TIMES);
      const net = 1 / a + 1 / b - 1 / c;
      if (net <= 0 || c === a || c === b) continue;
      const T = clean(1 / net, 2);
      if (!Number.isFinite(T) || T > 120) continue;
      const W = lcmN(a, b, c);
      return {
        facts: { form: 'find-emptier', ask: 'c', given: { a, b, T } },
        prompt: `Pipes A and B can fill ${where} in ${a} ${u} and ${b} ${u} respectively. When a third pipe C, which empties the tank, is also opened, the empty tank fills in ${fmt(T)}. How long would C alone take to empty the full tank?`,
        answer: c,
        fmt,
        mistakes: [
          { value: cleanFrac(together(a, b), 4), why: 'gave the time for A and B together' },
          { value: cleanFrac(T - together(a, b), 4), why: 'subtracted the times', trap: `Subtracting times is meaningless; subtract rates: 1/C = 1/${a} + 1/${b} − 1/T.` },
          { value: cleanFrac(1 / (1 / T - 1 / a - 1 / b + 2 / c), 4), why: 'added C’s rate instead of subtracting' },
        ],
        steps: [`Tank = ${W} units: A = ${W / a}, B = ${W / b} per ${u.slice(0, -1)}`, `With C, net = ${W} ÷ ${num(T)} = ${plain(W / T)} per ${u.slice(0, -1)}`, `C empties ${W / a + W / b} − ${plain(W / T)} = ${W / c} per ${u.slice(0, -1)} → ${W} ÷ ${W / c} = ${c} ${u}`],
        shortcut: `1/C = 1/A + 1/B − 1/T.`,
        trap: `Work with rates, not times.`,
        tags: ['pipes:fill-empty', 'trick:efficiency-lcm'],
        choice: stepOf(c),
      };
    }
    // extreme: capacity in litres with a drain of y litres per minute
    const [a, b] = rng.sample([10, 12, 15, 20, 24, 30, 40, 60], 2);
    const T = rng.pick([12, 15, 18, 20, 24, 30, 36, 40, 45, 48, 60]);
    const net = 1 / a + 1 / b - 1 / T;
    if (net <= 0) continue;
    const y = rng.pick([4, 5, 6, 8, 10, 12, 15, 20, 25]);
    const C = y / net;
    if (!Number.isInteger(C) || C > 20000 || C < 100) continue;
    return {
      facts: { form: 'drain-capacity', ask: 'capacity', given: { a, b, y, T } },
      prompt: `Two pipes can fill ${where} in ${a} minutes and ${b} minutes respectively. A waste pipe removes ${y} litres per minute. With all three pipes open, the empty tank fills in ${T} minutes. What is the capacity of the tank?`,
      answer: C,
      fmt: (v) => `${indian(v)} litres`,
      mistakes: [
        { value: clean(y / (1 / a + 1 / b)), why: 'ignored the combined filling time T', trap: `Use the net rate with the drain: C/${a} + C/${b} − ${y} = C/${T}.` },
        { value: clean(y * T), why: 'multiplied the drain rate by the filling time' },
        { value: clean(y / (1 / a + 1 / b + 1 / T)), why: 'added all three rates' },
      ],
      steps: [`In one minute: C/${a} + C/${b} − ${y} = C/${T}`, `C × (${fracTex(1, a)} + ${fracTex(1, b)} − ${fracTex(1, T)}) = ${y}`, `C = ${indian(C)} litres`],
      shortcut: `The drain accounts for the gap between the pipes' combined rate and the observed rate.`,
      trap: `The drain is in litres per minute; the pipes are in tanks per minute.`,
      tags: ['pipes:fill-empty', 'pipes:capacity'],
      choice: { step: C >= 1000 ? 100 : 20 },
    };
  }
  throw new Error('fillEmpty: no numbers found');
}

export function leak(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const where = tank(rng);
  for (let tries = 0; tries < 800; tries++) {
    if (level === 'easy' || level === 'medium') {
      const a = rng.pick([3, 4, 5, 6, 8, 9, 10, 12, 15]);
      const b = a + rng.int(1, a);
      const L = (a * b) / (b - a);
      if (!fracOK(L, 4) || L > 120) continue;
      const u = 'hours';
      const fmt = count(u);
      const extra = b - a;
      const prompt =
        level === 'easy'
          ? `A pipe can fill ${where} in ${a} hours. Because of a leak at the bottom, it takes ${b} hours to fill. In how many hours can the leak alone empty the full tank?`
          : `A pipe can fill ${where} in ${a} hours, but because of a leak it takes ${extra} hour${extra === 1 ? '' : 's'} more to fill. In how many hours can the leak alone empty the full tank?`;
      return {
        facts: { form: 'leak', ask: 'leak', given: { a, b } },
        prompt,
        answer: L,
        fmt,
        mistakes: [
          { value: extra, why: 'took the extra time as the leak time', trap: `${fmt(extra)} is only the delay; the leak empties 1/${a} − 1/${b} of the tank per hour.` },
          { value: a + b, why: 'added the two times' },
          { value: cleanFrac(together(a, b), 4), why: 'added the rates (treated the leak as filling)' },
        ],
        steps: [`Tank = LCM(${a}, ${b}) = ${lcmN(a, b)} units`, `Pipe = ${lcmN(a, b) / a} units/h; with leak = ${lcmN(a, b) / b} units/h`, `Leak = ${lcmN(a, b) / a - lcmN(a, b) / b} units/h → ${lcmN(a, b)} ÷ ${lcmN(a, b) / a - lcmN(a, b) / b} = ${num(L)} hours`],
        shortcut: `Leak time = ab/(b − a) = ${a * b} ÷ ${b - a} = ${num(L)}.`,
        trap: `The leak is an emptying rate: 1/leak = 1/${a} − 1/${b}.`,
        tags: ['pipes:leak', 'trick:efficiency-lcm'],
        choice: stepOf(L),
      };
    }
    if (level === 'hard') {
      const Lh = rng.pick([4, 5, 6, 8, 10, 12]);
      const E = rng.pick([6, 8, 10, 12, 15, 16, 18, 20, 24]);
      if (E <= Lh) continue;
      const x = rng.pick([2, 3, 4, 5, 6, 8, 10]);
      const C = (60 * x) / (1 / Lh - 1 / E);
      if (!Number.isInteger(C) || C > 30000) continue;
      return {
        facts: { form: 'leak-capacity', ask: 'capacity', given: { L: Lh, x, E } },
        prompt: `A leak in the bottom of ${where} can empty the full tank in ${Lh} hours. An inlet pipe fills water at ${x} litres per minute. When the tank is full and the inlet is opened, the tank still empties in ${E} hours because of the leak. What is the capacity of the tank?`,
        answer: C,
        fmt: (v) => `${indian(v)} litres`,
        mistakes: [
          { value: 60 * x * E, why: 'multiplied the inlet flow by the emptying time', trap: `The inlet adds ${60 * x} litres an hour while the leak removes C/${Lh}; equate the net loss to C/${E}.` },
          { value: clean((60 * x) / (1 / Lh + 1 / E)), why: 'added the two rates' },
          { value: 60 * x * Lh, why: 'multiplied the inlet flow by the leak time' },
        ],
        steps: [`Inlet = ${x} × 60 = ${60 * x} litres/hour`, `Leak − inlet = net emptying: C/${Lh} − ${60 * x} = C/${E}`, `C × (${fracTex(1, Lh)} − ${fracTex(1, E)}) = ${60 * x} → C = ${indian(C)} litres`],
        shortcut: `C = inlet per hour × (L × E)/(E − L) = ${60 * x} × ${(Lh * E) / (E - Lh)}.`,
        trap: `Convert the inlet to litres per hour first.`,
        tags: ['pipes:leak', 'pipes:capacity'],
        choice: { step: C >= 5000 ? 500 : 100 },
      };
    }
    const [a, b] = rng.sample([6, 8, 10, 12, 15, 20, 24, 30], 2);
    const T0 = together(a, b);
    const extraMin = rng.pick([12, 15, 20, 24, 30, 36, 40, 45, 48, 60]);
    const T1 = T0 + extraMin / 60;
    const leakRate = 1 / T0 - 1 / T1;
    const L = 1 / leakRate;
    if (!fracOK(T0, 6) || !Number.isInteger(L) || L > 200) continue;
    return {
      facts: { form: 'leak-two', ask: 'leak', given: { a, b, extraMin } },
      prompt: `Two pipes can fill ${where} in ${a} hours and ${b} hours respectively. When both are opened together, a leak causes the tank to take ${extraMin} minutes longer to fill. In how many hours can the leak alone empty the full tank?`,
      answer: L,
      fmt: count('hours'),
      mistakes: [
        { value: cleanFrac(T0, 6), why: 'gave the filling time without the leak', trap: `Find both filling times, then 1/leak = 1/T₀ − 1/T₁.` },
        { value: cleanFrac(T1, 6), why: 'gave the filling time with the leak' },
        { value: clean((a * b) / Math.abs(b - a)), why: 'used ab/(b − a) on the two pipe times' },
      ],
      steps: [`Without the leak: ${a} × ${b} ÷ ${a + b} = ${num(T0)} h`, `With the leak: ${num(T0)} h + ${extraMin} min = ${num(T1)} h`, `Leak rate = ${fracTex(1, 1)}/${num(T0)} − 1/${num(T1)} → leak alone = ${L} hours`],
      shortcut: `Leak time = T₀T₁/(T₁ − T₀).`,
      trap: `Convert the extra minutes into hours.`,
      tags: ['pipes:leak'],
      choice: { step: L >= 30 ? 2 : 1 },
    };
  }
  throw new Error('leak: no numbers found');
}

/** Time to fill from `start` when pipes run in turn for one unit of time each (tank capped at full, floored at empty). */
function rotation(effs: number[], W: number, start = 0): number {
  let level = start;
  for (let t = 0; t < 100000; t++) {
    const e = effs[t % effs.length];
    if (e > 0 && level + e >= W) return t + (W - level) / e;
    level = Math.max(0, level + e);
  }
  throw new Error('rotation: never fills');
}

export function alternatePipes(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const where = tank(rng);
  for (let tries = 0; tries < 800; tries++) {
    if (level === 'easy' || level === 'medium') {
      const [a, b] = rng.sample(TIMES, 2);
      const W = lcmN(a, b);
      const effs = [W / a, W / b];
      const cyc = effs[0] + effs[1];
      const exact = W % cyc === 0;
      if ((level === 'easy') !== exact) continue;
      const T = rotation(effs, W);
      if (!fracOK(T, 12) || T > 60) continue;
      return {
        facts: { form: 'rotation', ask: 'time', given: {}, list: [a, b] },
        prompt: `Pipes A and B can fill ${where} in ${a} hours and ${b} hours respectively. They are opened alternately for one hour each, starting with A. In how many hours will the empty tank be filled?`,
        answer: T,
        fmt: count('hours'),
        mistakes: [
          { value: exact ? NaN : cleanFrac((2 * W) / cyc, 12), why: 'used the average 2-hour rate without checking the last hour', trap: `That spreads the last cycle evenly; check which pipe is running in the final hour.` },
          { value: cleanFrac(together(a, b), 12), why: 'opened both together' },
          { value: cleanFrac(2 * together(a, b), 12), why: 'doubled the joint time' },
        ],
        steps: [`Tank = LCM(${a}, ${b}) = ${W} units; A = ${effs[0]}, B = ${effs[1]} units/h`, `Every 2 hours: ${cyc} units`, `After full cycles, finish hour by hour → ${num(T)} hours`],
        shortcut: `Cycle method, then check the last hour.`,
        trap: `The last hour belongs to a specific pipe.`,
        tags: ['pipes:alternate', 'trick:efficiency-lcm'],
        choice: stepOf(T),
      };
    }
    // hard: fill/empty alternately; extreme: A, B fill and C empties in rotation
    const three = level === 'extreme';
    const ds = three ? rng.sample(TIMES, 3) : rng.sample(TIMES, 2);
    const signs = three ? [1, 1, -1] : [1, -1];
    if (three && 1 / ds[2] >= 1 / ds[0] + 1 / ds[1]) continue;
    if (!three && ds[1] <= ds[0]) continue;
    const W = lcmN(...ds);
    const effs = ds.map((d, i) => (signs[i] * W) / d);
    const cyc = effs.reduce((s, e) => s + e, 0);
    if (cyc <= 0) continue;
    const T = rotation(effs, W);
    const naive = (effs.length * W) / cyc;
    if (!fracOK(T, 12) || T > 80 || Math.abs(naive - T) < 1e-9) continue;
    const names = three ? ['A', 'B', 'C'] : ['A', 'B'];
    return {
      facts: { form: 'rotation', ask: 'time', given: {}, list: ds.map((d, i) => signs[i] * d) },
      prompt: three
        ? `Pipes A and B can fill ${where} in ${ds[0]} hours and ${ds[1]} hours, and pipe C can empty it in ${ds[2]} hours. Starting with an empty tank, the pipes are opened one at a time for one hour each in the order A, B, C, A, B, C, … . In how many hours will the tank be full?`
        : `Pipe A can fill ${where} in ${ds[0]} hours and pipe B can empty it in ${ds[1]} hours. Starting with an empty tank, A and B are opened alternately for one hour each, A first. In how many hours will the tank be full?`,
      answer: T,
      fmt: count('hours'),
      mistakes: [
        { value: cleanFrac(naive, 12), why: 'divided the tank by the net cycle rate', trap: `${num(naive)} hours assumes the tank fills only at the end of a cycle; it fills during a filling hour before the ${three ? 'emptying' : 'next emptying'} hour can undo it.` },
        { value: cleanFrac(1 / effs.reduce((s, e) => s + e / W, 0), 12), why: 'opened all the pipes together' },
        { value: cleanFrac(naive - 1, 12), why: 'subtracted one hour from the cycle estimate' },
      ],
      steps: [
        `Tank = ${W} units; ${names.map((n, i) => `${n} = ${effs[i] > 0 ? '+' : ''}${effs[i]}`).join(', ')} units/h`,
        `Net per ${effs.length}-hour cycle = ${cyc} units`,
        `Stop cycling once the next filling hour can top the tank up; finish it within that hour`,
        `Total = ${num(T)} hours`,
      ],
      shortcut: `Count cycles until the tank is within one filling hour of full, then finish in that hour.`,
      trap: `The tank can fill in the middle of a cycle.`,
      tags: ['pipes:alternate', 'trick:efficiency-lcm'],
      choice: stepOf(T),
    };
  }
  throw new Error('alternatePipes: no numbers found');
}

export function closedAfter(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const where = tank(rng);
  for (let tries = 0; tries < 800; tries++) {
    const [a, b, c] = rng.sample(TIMES, 3);
    const W = lcmN(a, b, c);
    const [eA, eB, eC] = [W / a, W / b, W / c];
    const t = rng.int(2, 10);
    if (level === 'easy') {
      const done = t * (eA + eB);
      if (done >= W) continue;
      const rest = (W - done) / eB;
      if (!fracOK(rest, 6)) continue;
      return {
        facts: { form: 'close-after', ask: 'rest', given: { a, b, t } },
        prompt: `Pipes A and B can fill ${where} in ${a} minutes and ${b} minutes respectively. Both are opened together, and A is closed after ${t} minutes. How many more minutes will B take to fill the tank?`,
        answer: rest,
        fmt: count('minutes'),
        mistakes: [
          { value: cleanFrac(rest + t, 6), why: 'gave the total time', trap: `${num(rest + t)} minutes includes the first ${t} minutes.` },
          { value: cleanFrac(b - t, 6), why: `subtracted from B's time` },
          { value: cleanFrac((W - done) / eA, 6), why: 'let A finish instead of B' },
        ],
        steps: [`Tank = LCM(${a}, ${b}) → ${lcmN(a, b)} units; A = ${lcmN(a, b) / a}, B = ${lcmN(a, b) / b} per minute`, `In ${t} min together: ${t} × ${lcmN(a, b) / a + lcmN(a, b) / b} = ${(t * lcmN(a, b)) / a + (t * lcmN(a, b)) / b} units`, `Rest ÷ B's rate = ${num(rest)} minutes`],
        shortcut: `Fraction left = 1 − t(1/a + 1/b); time = that × b.`,
        trap: `After A closes only B's rate counts.`,
        tags: ['pipes:closed-after', 'trick:efficiency-lcm'],
        choice: stepOf(rest),
      };
    }
    if (level === 'medium') {
      const T = (W + t * eB) / (eA + eB);
      if (!fracOK(T, 6) || T <= t + 1) continue;
      return {
        facts: { form: 'close-before', ask: 'total', given: { a, b, t } },
        prompt: `Pipes A and B can fill ${where} in ${a} minutes and ${b} minutes respectively. Both are opened together, but B is turned off ${t} minutes before the tank is full. In how many minutes is the tank filled?`,
        answer: T,
        fmt: count('minutes'),
        mistakes: [
          { value: cleanFrac(together(a, b) + t, 6), why: 'added the minutes to the joint time', trap: `B misses the last ${t} minutes; its missing work has to be made up by A.` },
          { value: cleanFrac(together(a, b), 6), why: 'ignored that B is turned off' },
          { value: cleanFrac((W - t * eB) / (eA + eB), 6), why: 'subtracted B’s missing work instead of adding it' },
        ],
        steps: [`Tank = ${W} units; A = ${eA}, B = ${eB} per minute`, `If B had run to the end it would add ${t} × ${eB} = ${t * eB} units`, `T = (${W} + ${t * eB}) ÷ ${eA + eB} = ${num(T)} minutes`],
        shortcut: `Add the "missing" work, divide by the joint rate.`,
        trap: `"Before the tank is full" counts back from the end.`,
        tags: ['pipes:closed-after', 'trick:efficiency-lcm'],
        choice: stepOf(T),
      };
    }
    if (level === 'hard') {
      // A, B fill, C empties; C closed after t minutes
      const net = eA + eB - eC;
      if (net <= 0) continue;
      const after = W - t * net;
      if (after <= 0) continue;
      const T = t + after / (eA + eB);
      if (!fracOK(T, 6)) continue;
      return {
        facts: { form: 'drain-closed', ask: 'total', given: { a, b, c, t } },
        prompt: `Pipes A and B can fill ${where} in ${a} minutes and ${b} minutes, and pipe C can empty it in ${c} minutes. All three are opened on the empty tank, and C is closed after ${t} minutes. In how many minutes, in all, is the tank filled?`,
        answer: T,
        fmt: count('minutes'),
        mistakes: [
          { value: cleanFrac(W / net, 6), why: 'kept C open throughout', trap: `C runs only for the first ${t} minutes.` },
          { value: cleanFrac(together(a, b), 6), why: 'ignored C altogether' },
          { value: cleanFrac(after / (eA + eB), 6), why: 'left out the first minutes' },
        ],
        steps: [`Tank = ${W} units; A = ${eA}, B = ${eB}, C = −${eC} per minute`, `First ${t} min: ${t} × ${net} = ${t * net} units`, `Remaining ${after} ÷ ${eA + eB} = ${num(after / (eA + eB))} min → total ${num(T)} min`],
        shortcut: `Phase by phase: net rate while C is open, then A + B.`,
        trap: `Count the first ${t} minutes too.`,
        tags: ['pipes:closed-after', 'trick:efficiency-lcm'],
        choice: stepOf(T),
      };
    }
    // extreme: staggered opening — A, then B after t1, then drain C after t1 + t2
    const t1 = rng.int(2, 6);
    const t2 = rng.int(2, 6);
    const net = eA + eB - eC;
    if (net <= 0) continue;
    const p1 = t1 * eA;
    const p2 = t2 * (eA + eB);
    if (p1 + p2 >= W) continue;
    const T = t1 + t2 + (W - p1 - p2) / net;
    if (!fracOK(T, 6) || T > 150) continue;
    return {
      facts: { form: 'staggered', ask: 'total', given: { a, b, c, t1, t2 } },
      prompt: `Pipes A and B can fill ${where} in ${a} minutes and ${b} minutes, and pipe C can empty it in ${c} minutes. A is opened on the empty tank; B is opened ${t1} minutes later, and C ${t2} minutes after that. In how many minutes from the start is the tank full?`,
      answer: T,
      fmt: count('minutes'),
      mistakes: [
        { value: cleanFrac(W / net, 6), why: 'assumed all three were opened together', trap: `The pipes open one after another; handle each phase separately.` },
        { value: cleanFrac(t1 + t2 + W / net, 6), why: 'added the delays to the all-open time' },
        { value: cleanFrac(t1 + t2 + (W - p1 - p2) / (eA + eB + eC), 6), why: 'treated C as a filling pipe' },
      ],
      steps: [`Tank = ${W} units; A = ${eA}, B = ${eB}, C = −${eC} per minute`, `First ${t1} min (A): ${p1} units; next ${t2} min (A + B): ${p2} units`, `Remaining ${W - p1 - p2} ÷ ${net} = ${num((W - p1 - p2) / net)} min → total ${num(T)} min`],
      shortcut: `Phase by phase with the efficiency method.`,
      trap: `C is an emptying pipe.`,
      tags: ['pipes:closed-after', 'trick:efficiency-lcm'],
      choice: stepOf(T),
    };
  }
  throw new Error('closedAfter: no numbers found');
}

export function partlyFull(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const where = tank(rng);
  const FR: [number, number][] = [[1, 3], [2, 5], [1, 4], [3, 8], [2, 3], [3, 4], [1, 5], [3, 5], [1, 2]];
  for (let tries = 0; tries < 800; tries++) {
    const [p, qd] = rng.pick(FR);
    const f = p / qd;
    const u = rng.chance(0.5) ? 'minutes' : 'hours';
    const fmt = count(u);
    if (level === 'easy') {
      const a = rng.pick(TIMES);
      const T = (1 - f) * a;
      if (!fracOK(T, 4) || T < 2) continue;
      return {
        facts: { form: 'partial', ask: 'time', given: { startNum: p, startDen: qd, targetNum: 1, targetDen: 1 }, list: [a] },
        prompt: `${where.charAt(0).toUpperCase() + where.slice(1)} is ${fracTex(p, qd)} full. A pipe can fill the whole tank in ${a} ${u}. How long will it take to fill the tank completely?`,
        answer: T,
        fmt,
        mistakes: [
          { value: cleanFrac(f * a, 4), why: 'used the full fraction instead of the empty part', trap: `${fmt(f * a)} is the time for the ${fracTex(p, qd)} already there; only ${fracTex(qd - p, qd)} remains.` },
          { value: a, why: 'ignored the water already in the tank' },
          { value: cleanFrac(a / (1 - f), 4), why: 'divided instead of multiplied' },
        ],
        steps: [`Empty part = 1 − ${fracTex(p, qd)} = ${fracTex(qd - p, qd)}`, `Time = ${fracTex(qd - p, qd)} × ${a} = ${num(T)} ${u}`],
        shortcut: `Time = (empty fraction) × full-tank time.`,
        trap: `Fill only what is empty.`,
        tags: ['pipes:partly-full'],
        choice: stepOf(T),
      };
    }
    const [a, b] = rng.sample(TIMES, 2);
    if (level === 'medium') {
      // fill pipe a, drain b (b > a) → time to fill
      if (b <= a) continue;
      const net = 1 / a - 1 / b;
      const T = (1 - f) / net;
      if (!fracOK(T, 4) || T > 150 || T < 2) continue;
      return {
        facts: { form: 'partial', ask: 'time', given: { startNum: p, startDen: qd, targetNum: 1, targetDen: 1 }, list: [a, -b] },
        prompt: `${where.charAt(0).toUpperCase() + where.slice(1)} is ${fracTex(p, qd)} full. Pipe A can fill the tank in ${a} ${u} and pipe B can empty it in ${b} ${u}. If both are opened together, how long will it take to fill the tank completely?`,
        answer: T,
        fmt,
        mistakes: [
          { value: cleanFrac(1 / net, 4), why: 'filled the whole tank from empty', trap: `${fmt(1 / net)} fills an empty tank; only ${fracTex(qd - p, qd)} is needed.` },
          { value: cleanFrac((1 - f) * a, 4), why: 'ignored the emptying pipe' },
          { value: cleanFrac((1 - f) / (1 / a + 1 / b), 4), why: 'treated B as a filling pipe' },
        ],
        steps: [`Net filling per ${u.slice(0, -1)} = ${fracTex(1, a)} − ${fracTex(1, b)} = ${fracTex(b - a, a * b)}`, `Needed = ${fracTex(qd - p, qd)} of the tank`, `Time = ${fracTex(qd - p, qd)} ÷ ${fracTex(b - a, a * b)} = ${num(T)} ${u}`],
        shortcut: `Needed fraction ÷ net rate.`,
        trap: `Start from the water already present.`,
        tags: ['pipes:partly-full', 'pipes:fill-empty'],
        choice: stepOf(T),
      };
    }
    if (level === 'hard') {
      // drain faster than fill: time to empty the partly full tank (or to reach half)
      if (b >= a) continue;
      const net = 1 / b - 1 / a;
      const toHalf = f > 0.5 && rng.chance(0.5);
      const target = toHalf ? 0.5 : 0;
      const T = (f - target) / net;
      if (!fracOK(T, 4) || T > 150 || T < 2) continue;
      return {
        facts: { form: 'partial', ask: 'time', given: { startNum: p, startDen: qd, targetNum: toHalf ? 1 : 0, targetDen: toHalf ? 2 : 1 }, list: [a, -b] },
        prompt: `${where.charAt(0).toUpperCase() + where.slice(1)} is ${fracTex(p, qd)} full. Pipe A can fill the tank in ${a} ${u} and pipe B can empty it in ${b} ${u}. If both are opened together, how long will it take for the tank to become ${toHalf ? 'half full' : 'empty'}?`,
        answer: T,
        fmt,
        mistakes: [
          { value: cleanFrac(f * b, 4), why: 'ignored the filling pipe', trap: `A keeps adding water, so the net emptying rate is only 1/${b} − 1/${a}.` },
          { value: cleanFrac(1 / net, 4), why: 'emptied a full tank' },
          { value: cleanFrac((f - target) / (1 / a + 1 / b), 4), why: 'added the two rates' },
        ],
        steps: [`Net emptying per ${u.slice(0, -1)} = ${fracTex(1, b)} − ${fracTex(1, a)} = ${fracTex(a - b, a * b)}`, `Water to remove = ${fracTex(p, qd)}${toHalf ? ` − ${fracTex(1, 2)}` : ''} = ${num(f - target)} of the tank`, `Time = ${num(T)} ${u}`],
        shortcut: `Fraction to remove ÷ net emptying rate.`,
        trap: `The filling pipe slows the emptying.`,
        tags: ['pipes:partly-full', 'pipes:fill-empty'],
        choice: stepOf(T),
      };
    }
    // extreme: partly full; A fills, B drains; B closed after t → total time to fill
    if (b <= a) continue;
    const W = lcmN(a, b) * qd;
    const start = W * f;
    const t = rng.int(2, 8);
    const eA = W / a;
    const eB = W / b;
    const afterT = start + t * (eA - eB);
    if (afterT >= W || afterT < 0) continue;
    const T = t + (W - afterT) / eA;
    if (!fracOK(T, 6) || T > 150) continue;
    return {
      facts: { form: 'partial-close', ask: 'time', given: { startNum: p, startDen: qd, a, b, t } },
      prompt: `${where.charAt(0).toUpperCase() + where.slice(1)} is ${fracTex(p, qd)} full. Pipe A can fill the tank in ${a} ${u} and pipe B can empty it in ${b} ${u}. Both are opened together, and B is closed after ${t} ${u}. How long, from the start, will it take to fill the tank?`,
      answer: T,
      fmt,
      mistakes: [
        { value: cleanFrac((1 - f) * a, 6), why: 'ignored pipe B', trap: `B removes water during the first ${t} ${u}.` },
        { value: cleanFrac(t + (1 - f) * a, 6), why: 'added the minutes without accounting for B’s effect' },
        { value: cleanFrac((1 - f) / (1 / a - 1 / b), 6), why: 'kept B open throughout' },
      ],
      steps: [`Take the tank as ${W} units: already ${start}; A = +${eA}, B = −${eB} per ${u.slice(0, -1)}`, `First ${t} ${u}: ${start} + ${t} × ${eA - eB} = ${afterT} units`, `A alone fills the remaining ${W - afterT} in ${num((W - afterT) / eA)} → total ${num(T)} ${u}`],
      shortcut: `Track the level phase by phase.`,
      trap: `Start from the water already in the tank.`,
      tags: ['pipes:partly-full', 'pipes:closed-after'],
      choice: stepOf(T),
    };
  }
  throw new Error('partlyFull: no numbers found');
}
