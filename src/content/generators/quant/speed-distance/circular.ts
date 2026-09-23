/**
 * quant.speed-distance: circular track (extreme only).
 * Speeds are whole m/s and the track length is a multiple of every lap/meeting period, so every answer
 * is a whole number of seconds (or minutes for lap-time questions).
 */
import type { BuildContext } from '../../types';
import type { SpeedFacts } from '../speed-distance';
import { gcd, lcm } from '../../../../lib/format';
import { type Draft, clean, mins, people, secs } from './kit';

type D = Draft<SpeedFacts>;

export function circular(ctx: BuildContext): D {
  const { rng } = ctx;
  const form = rng.pick(['first-meet', 'first-meet', 'start-meet', 'points'] as const);
  const [p, q, r] = people(rng, 3);
  if (form === 'first-meet') {
    for (let tries = 0; tries < 400; tries++) {
      const cyclists = rng.chance(0.4);
      const [b, a] = cyclists ? rng.sample([5, 10, 15, 20], 2).sort((x, y) => x - y) : rng.sample([2, 3, 4, 5, 6, 7, 8], 2).sort((x, y) => x - y);
      const same = rng.chance(0.5);
      const rel = same ? a - b : a + b;
      const t = rng.int(3, 60) * 10;
      const L = rel * t;
      if (L < 200 || L > 3000 || L % 50 !== 0) continue;
      const speedText = cyclists ? `${(a * 18) / 5} km/h and ${(b * 18) / 5} km/h` : `${a} m/s and ${b} m/s`;
      const who = cyclists ? 'cycle' : 'run';
      const other = same ? a + b : a - b;
      const wrong = clean(L / other);
      return {
        facts: { form: 'circle', ask: 'firstMeet', given: { L, a, b, same: same ? 1 : 0 } },
        prompt: `${p.name} and ${q.name} start together from the same point on a circular track of length ${L} m and ${who} ${same ? 'in the same direction' : 'in opposite directions'} at ${speedText} respectively. After how many seconds will they meet for the first time?`,
        answer: t,
        fmt: secs,
        mistakes: [
          {
            value: wrong,
            why: same ? 'added the speeds' : 'subtracted the speeds',
            trap: same
              ? `${secs(wrong)} adds the speeds; in the same direction the faster one must gain one full lap at ${a} − ${b} = ${rel} m/s.`
              : `${secs(wrong)} subtracts the speeds; in opposite directions they together cover one lap at ${a} + ${b} = ${rel} m/s.`,
          },
          { value: clean(L / b), why: "gave the slower runner's lap time" },
          { value: clean(L / a), why: "gave the faster runner's lap time" },
          { value: 2 * t, why: 'waited for two laps of relative motion' },
        ],
        steps: [
          ...(cyclists ? [`Speeds: ${(a * 18) / 5} km/h = ${a} m/s, ${(b * 18) / 5} km/h = ${b} m/s`] : []),
          same ? `Same direction: they meet when the faster gains one full lap (${L} m)` : `Opposite directions: they meet when together they cover one lap (${L} m)`,
          `Relative speed = ${a} ${same ? '−' : '+'} ${b} = ${rel} m/s`,
          `Time = ${L} ÷ ${rel} = ${t} seconds`,
        ],
        shortcut: `First meeting anywhere = track length ÷ relative speed.`,
        trap: same ? `Same direction → subtract the speeds.` : `Opposite directions → add the speeds.`,
        tags: ['speed:circular-track', 'trick:relative-speed'],
        choice: { step: 10 },
      };
    }
  }
  if (form === 'start-meet') {
    for (let tries = 0; tries < 400; tries++) {
      const three = rng.chance(0.5);
      const laps = rng.sample([3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 18, 20], three ? 3 : 2).sort((x, y) => x - y);
      const L = laps.reduce((acc, x) => lcm(acc, x), 1);
      if (L > 180 || L < 12 || laps.some((x) => x === L)) continue;
      const prod = laps.reduce((acc, x) => acc * x, 1);
      const names = three ? `${p.name}, ${q.name} and ${r.name}` : `${p.name} and ${q.name}`;
      const lapText = three ? `${laps[0]}, ${laps[1]} and ${laps[2]} minutes` : `${laps[0]} and ${laps[1]} minutes`;
      const g = laps.reduce((acc, x) => gcd(acc, x), 0);
      return {
        facts: { form: 'circle', ask: 'startMeet', given: {}, list: laps },
        prompt: `${names} start together from the same point on a circular running track and complete one round in ${lapText} respectively. After how many minutes will they all be together at the starting point again for the first time?`,
        answer: L,
        fmt: mins,
        mistakes: [
          { value: prod, why: 'multiplied the lap times', trap: `${mins(prod)} is a common multiple, but not the least one.` },
          { value: laps.reduce((a2, b2) => a2 + b2, 0), why: 'added the lap times' },
          { value: g === 1 ? NaN : L / g, why: 'divided the LCM by the HCF' },
          { value: 2 * L, why: 'took the second meeting' },
        ],
        steps: [`They are together at the start whenever the time is a multiple of every lap time`, `LCM(${laps.join(', ')}) = ${L}`, `First time together at the start = ${L} minutes`],
        shortcut: `Meeting at the starting point = LCM of the lap times.`,
        trap: `Look for the least common multiple, not any common multiple.`,
        tags: ['speed:circular-track', 'trick:lcm'],
        choice: { step: L >= 60 ? 6 : 2 },
      };
    }
  }
  // distinct meeting points
  const opts: [number, number, boolean][] = [
    [7, 2, true], [8, 3, true], [9, 4, true], [6, 1, true], [7, 1, true], [9, 2, true], [8, 1, true],
    [3, 2, false], [4, 1, false], [4, 3, false], [5, 2, false], [5, 3, false], [5, 4, false], [7, 2, false], [7, 3, false],
  ];
  for (let tries = 0; tries < 400; tries++) {
    const [P, Q, same] = rng.pick(opts);
    const unit = rng.pick([1, 1, 2]);
    const a = P * unit;
    const b = Q * unit;
    const rel = same ? a - b : a + b;
    const base = lcm(lcm(a, b), rel);
    const L = base * rng.int(1, 60);
    if (L < 200 || L > 2400 || L % 10 !== 0) continue;
    const ans = same ? P - Q : P + Q;
    return {
      facts: { form: 'circle', ask: 'points', given: { L, a, b, same: same ? 1 : 0 } },
      prompt: `${p.name} and ${q.name} start together from the same point on a circular track of length ${L} m and run ${same ? 'in the same direction' : 'in opposite directions'} at ${a} m/s and ${b} m/s respectively. They keep running. At how many distinct points on the track will they meet?`,
      answer: ans,
      fmt: (n) => String(n),
      mistakes: [
        { value: same ? P + Q : Math.abs(P - Q), why: same ? 'added the ratio terms (opposite-direction rule)' : 'subtracted the ratio terms (same-direction rule)', trap: same ? `Same direction → difference of the ratio terms ${P} − ${Q}.` : `Opposite directions → sum of the ratio terms ${P} + ${Q}.` },
        { value: P, why: 'took the larger ratio term' },
        { value: P * Q, why: 'multiplied the ratio terms' },
      ],
      steps: [`Speed ratio = ${a} : ${b} = ${P} : ${Q} (lowest terms)`, same ? `Same direction: distinct meeting points = ${P} − ${Q} = ${ans}` : `Opposite directions: distinct meeting points = ${P} + ${Q} = ${ans}`],
      shortcut: `Reduce the speed ratio to p : q; points = |p − q| (same direction) or p + q (opposite).`,
      trap: `Reduce the ratio to lowest terms first.`,
      tags: ['speed:circular-track'],
      choice: { step: 1 },
    };
  }
  throw new Error('circular: no numbers found');
}
