/**
 * quant.speed-distance: average speed, relative speed, meeting point, late/early arrival, stoppage time.
 * All numbers are built backward so every answer is a whole number (or a simple fraction of an hour).
 */
import type { BuildContext } from '../../types';
import type { SpeedFacts } from '../speed-distance';
import { fracTex, gcd, hoursMinutes, lcm, plain } from '../../../../lib/format';
import { type Draft, clean, clockText, hrs, km, kmh, metres, mins, num, people, person, stepWithin, towns, vehicle } from './kit';

type D = Draft<SpeedFacts>;
type Level = 'easy' | 'medium' | 'hard' | 'extreme';

/* ------------------------------ average speed ------------------------------ */

const NICE = (x: number) => x % 5 === 0 || x % 6 === 0 || x % 4 === 0;

/** [a, b, h] with a < b and h = 2ab/(a + b) whole. */
const PAIRS: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (let a = 12; a <= 90; a++) {
    for (let b = a + 2; b <= 100; b++) {
      if (b > 2.5 * a || !NICE(a) || !NICE(b)) continue;
      const h = (2 * a * b) / (a + b);
      if (Number.isInteger(h)) out.push([a, b, h]);
    }
  }
  return out;
})();

/** [a, b, c, avg] for three equal distances. */
const TRIPLES: [number, number, number, number][] = (() => {
  const out: [number, number, number, number][] = [];
  const speeds = [10, 12, 15, 20, 24, 25, 30, 36, 40, 45, 48, 50, 60, 72, 75, 80, 90];
  for (let i = 0; i < speeds.length; i++)
    for (let j = i + 1; j < speeds.length; j++)
      for (let k = j + 1; k < speeds.length; k++) {
        const [a, b, c] = [speeds[i], speeds[j], speeds[k]];
        if (c > 3 * a) continue;
        const avg = (3 * a * b * c) / (a * b + b * c + c * a);
        if (Number.isInteger(avg)) out.push([a, b, c, avg]);
      }
  return out;
})();

export function averageSpeed(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const p = person(rng);
  const [A, B] = towns(rng, 2);
  if (level === 'easy') {
    const [a, b, h] = rng.pick(PAIRS);
    const [out, back] = rng.chance(0.5) ? [a, b] : [b, a];
    const L = lcm(a, b);
    const arith = (a + b) / 2;
    return {
      facts: { form: 'average', ask: 'avg', given: {}, legs: [{ num: 1, den: 2, speed: out }, { num: 1, den: 2, speed: back }] },
      prompt: `${p.name} drives from ${A} to ${B} at ${out} km/h and returns along the same road at ${back} km/h. What is ${p.his} average speed for the whole journey?`,
      answer: h,
      fmt: kmh,
      mistakes: [
        { value: clean(arith, 1), why: 'took the simple average of the two speeds', trap: `${kmh(arith)} is the simple average; more time is spent at the slower speed, so the true average is lower.` },
        { value: clean(Math.sqrt(a * b)), why: 'took the geometric mean' },
        { value: clean((a * b) / (a + b)), why: 'forgot the factor 2 in 2ab/(a + b)' },
      ],
      steps: [
        `Take the one-way distance as LCM(${a}, ${b}) = ${L} km`,
        `Time out = ${L} ÷ ${out} = ${L / out} h; time back = ${L} ÷ ${back} = ${L / back} h`,
        `Average speed = total distance ÷ total time = ${2 * L} ÷ ${L / out + L / back} = ${h} km/h`,
      ],
      shortcut: `Equal distances: average = 2ab/(a + b) = 2 × ${a} × ${b} ÷ ${a + b} = ${h} km/h.`,
      trap: `Average speed = total distance ÷ total time, not the average of the speeds.`,
      tags: ['speed:average-speed', 'trick:harmonic-mean'],
      choice: { step: 1 },
    };
  }
  if (level === 'medium') {
    if (rng.chance(0.5)) {
      const [a, b, c, avg] = rng.pick(TRIPLES);
      const L = lcm(lcm(a, b), c);
      const arith = (a + b + c) / 3;
      return {
        facts: { form: 'average', ask: 'avg', given: {}, legs: [a, b, c].map((s) => ({ num: 1, den: 3, speed: s })) },
        prompt: `A ${vehicle(rng)} covers three equal distances at ${a} km/h, ${b} km/h and ${c} km/h respectively. What is its average speed for the whole distance?`,
        answer: avg,
        fmt: kmh,
        mistakes: [
          { value: clean(arith, 1), why: 'took the simple average of the speeds', trap: `${kmh(arith)} averages the speeds; equal distances need total distance ÷ total time.` },
          { value: clean((2 * a * c) / (a + c)), why: 'used only the first and last speeds' },
          { value: clean((2 * b * c) / (b + c)), why: 'used only the last two speeds' },
        ],
        steps: [`Take each part as LCM(${a}, ${b}, ${c}) = ${L} km`, `Times: ${L / a} h + ${L / b} h + ${L / c} h = ${L / a + L / b + L / c} h`, `Average = ${3 * L} ÷ ${L / a + L / b + L / c} = ${avg} km/h`],
        shortcut: `Three equal distances: average = 3abc/(ab + bc + ca).`,
        trap: `The slowest stretch takes the longest time and pulls the average down.`,
        tags: ['speed:average-speed', 'trick:harmonic-mean'],
        choice: { step: 1 },
      };
    }
    for (let tries = 0; tries < 400; tries++) {
      const t1 = rng.pick([0.5, 1, 1.5, 2, 2.5, 3]);
      const t2 = rng.pick([0.5, 1, 1.5, 2, 2.5, 3]);
      const s1 = rng.int(6, 16) * 5;
      const s2 = rng.int(6, 16) * 5;
      if (s1 === s2) continue;
      const d1 = s1 * t1;
      const d2 = s2 * t2;
      const avg = (d1 + d2) / (t1 + t2);
      if (!Number.isInteger(avg) || !Number.isInteger(d1) || !Number.isInteger(d2) || d1 === d2) continue;
      const v = vehicle(rng);
      return {
        facts: { form: 'average', ask: 'avg', given: {}, legs: [{ dist: d1, speed: s1 }, { dist: d2, speed: s2 }] },
        prompt: `A ${v} travels ${d1} km at ${s1} km/h and then another ${d2} km at ${s2} km/h. What is its average speed for the whole journey?`,
        answer: avg,
        fmt: kmh,
        mistakes: [
          { value: clean((s1 + s2) / 2, 1), why: 'took the simple average of the speeds', trap: `${kmh((s1 + s2) / 2)} ignores how long each part took.` },
          { value: clean((2 * s1 * s2) / (s1 + s2)), why: 'used 2ab/(a + b), which needs equal distances' },
          { value: clean((d1 * s1 + d2 * s2) / (d1 + d2)), why: 'weighted the speeds by distance' },
        ],
        steps: [`Time for ${d1} km = ${d1} ÷ ${s1} = ${num(t1)} h`, `Time for ${d2} km = ${d2} ÷ ${s2} = ${num(t2)} h`, `Average = (${d1} + ${d2}) ÷ (${num(t1)} + ${num(t2)}) = ${d1 + d2} ÷ ${num(t1 + t2)} = ${avg} km/h`],
        shortcut: `Average speed = total distance ÷ total time.`,
        trap: `Speeds are averaged by time, not by distance.`,
        tags: ['speed:average-speed'],
        choice: { step: 1 },
      };
    }
    throw new Error('averageSpeed medium: no numbers found');
  }
  if (level === 'hard') {
    if (rng.chance(0.5)) {
      const [a, b, h] = rng.pick(PAIRS);
      const giveSlow = rng.chance(0.5);
      const given = giveSlow ? a : b;
      const ans = giveSlow ? b : a;
      const naive = 2 * h - given;
      return {
        facts: { form: 'average', ask: 'speed1', given: { target: h }, legs: [{ num: 1, den: 2, speed: given }, { num: 1, den: 2, speed: null }] },
        prompt: `${p.name} travelled from ${A} to ${B} at ${given} km/h. At what speed must ${p.he} return along the same route so that ${p.his} average speed for the round trip is ${h} km/h?`,
        answer: ans,
        fmt: kmh,
        mistakes: [
          { value: naive, why: 'assumed the average is the simple mean of the two speeds', trap: `${kmh(naive)} makes the simple average ${h}; but the average speed for equal distances is 2ab/(a + b).` },
          { value: clean((given + h) / 2), why: 'averaged the given speed and the target' },
          { value: h, why: 'gave the target average itself' },
        ],
        steps: [`For equal distances, average = 2 × ${given} × v ÷ (${given} + v) = ${h}`, `${2 * given}v = ${h}(${given} + v) → (${2 * given} − ${h})v = ${h * given}`, `v = ${h * given} ÷ ${2 * given - h} = ${ans} km/h`],
        shortcut: `Check the options in 2ab/(a + b) — only ${ans} gives ${h}.`,
        trap: `The simple mean of the two speeds is not the average speed.`,
        tags: ['speed:average-speed', 'trick:harmonic-mean'],
        choice: { step: 1 },
      };
    }
    for (let tries = 0; tries < 400; tries++) {
      const [x, y, h] = rng.pick(PAIRS);
      const [a, m] = rng.chance(0.5) ? [x, y] : [y, x];
      const d = rng.int(1, 4) * (m % 2 === 0 ? 2 : 1) + 2;
      const b = m - d;
      const c = m + d;
      if (b < 10 || b === a || c === a) continue;
      return {
        facts: { form: 'average', ask: 'avg', given: {}, legs: [{ num: 1, den: 2, speed: a }, { num: 1, den: 2, halfTimeSpeeds: [b, c] }] },
        prompt: `${p.name} covers the first half of a journey at ${a} km/h. For the second half, ${p.he} travels half of the time at ${b} km/h and the other half of the time at ${c} km/h. What is ${p.his} average speed for the whole journey?`,
        answer: h,
        fmt: kmh,
        mistakes: [
          { value: clean((a + m) / 2, 1), why: 'took the simple mean of the two halves', trap: `The two halves are equal distances, so combine ${a} and ${m} as 2ab/(a + b), not (a + b)/2.` },
          { value: clean((a + b + c) / 3, 1), why: 'averaged all three speeds' },
          { value: clean((2 * b * c) / (b + c)), why: 'treated the second half as equal distances' },
        ],
        steps: [`Second half: equal times at ${b} and ${c} → its average = (${b} + ${c}) ÷ 2 = ${m} km/h`, `Two equal halves at ${a} and ${m} km/h`, `Average = 2 × ${a} × ${m} ÷ (${a} + ${m}) = ${h} km/h`],
        shortcut: `Equal times → arithmetic mean; equal distances → 2ab/(a + b).`,
        trap: `Equal times and equal distances average differently.`,
        tags: ['speed:average-speed', 'trick:harmonic-mean'],
        choice: { step: 1 },
      };
    }
    throw new Error('averageSpeed hard: no numbers found');
  }
  // extreme
  if (rng.chance(0.5)) {
    const shares: [number, number][][] = [
      [[1, 3], [1, 3], [1, 3]],
      [[1, 2], [1, 3], [1, 6]],
      [[1, 3], [1, 4], [5, 12]],
      [[1, 4], [1, 4], [1, 2]],
      [[2, 5], [1, 5], [2, 5]],
      [[1, 2], [1, 4], [1, 4]],
    ];
    const speeds = [15, 20, 24, 25, 30, 36, 40, 45, 48, 50, 60, 72, 75, 80, 90];
    for (let tries = 0; tries < 600; tries++) {
      const sh = rng.pick(shares);
      const sp = rng.sample(speeds, 3);
      let inv = 0;
      for (let i = 0; i < 3; i++) inv += sh[i][0] / sh[i][1] / sp[i];
      const avg = 1 / inv;
      if (!Number.isInteger(Math.round(avg * 1e9) / 1e9) || avg > 90) continue;
      const av = Math.round(avg);
      const arith = (sp[0] + sp[1] + sp[2]) / 3;
      const weighted = sh.reduce((s, f, i) => s + (f[0] / f[1]) * sp[i], 0);
      const L = sh.reduce((acc, f, i) => lcm(acc, (f[1] * sp[i]) / gcd(f[0], sp[i])), 1);
      return {
        facts: { form: 'average', ask: 'avg', given: {}, legs: sh.map((f, i) => ({ num: f[0], den: f[1], speed: sp[i] })) },
        prompt: `A ${vehicle(rng)} covers ${fracTex(sh[0][0], sh[0][1])} of a journey at ${sp[0]} km/h, the next ${fracTex(sh[1][0], sh[1][1])} at ${sp[1]} km/h and the remaining distance at ${sp[2]} km/h. What is its average speed for the whole journey?`,
        answer: av,
        fmt: kmh,
        mistakes: [
          { value: clean(arith, 1), why: 'took the simple average of the speeds', trap: `${kmh(arith)} ignores how long each part took.` },
          { value: clean(weighted, 1), why: 'weighted the speeds by the distance fractions' },
          { value: clean((3 * sp[0] * sp[1] * sp[2]) / (sp[0] * sp[1] + sp[1] * sp[2] + sp[2] * sp[0])), why: 'treated the three parts as equal' },
        ],
        steps: [
          `Take the whole journey as ${L} km`,
          ...sh.map((f, i) => `Part ${i + 1}: ${plain((L * f[0]) / f[1])} km ÷ ${sp[i]} = ${num((L * f[0]) / f[1] / sp[i])} h`),
          `Average = ${L} ÷ ${num(L / av)} = ${av} km/h`,
        ],
        shortcut: `Choose a total distance divisible by every part and speed; then total ÷ total time.`,
        trap: `Average speed weights each speed by the time spent at it.`,
        tags: ['speed:average-speed'],
        choice: { step: 1 },
      };
    }
  }
  for (let tries = 0; tries < 600; tries++) {
    const t1 = rng.pick([1, 1.5, 2, 2.5, 3]);
    const t2 = rng.pick([1, 1.5, 2, 2.5, 3]);
    const s1 = rng.int(8, 16) * 5;
    const s2 = rng.int(8, 16) * 5;
    const halt = rng.pick([15, 20, 30, 40, 45, 60]);
    const d1 = s1 * t1;
    const d2 = s2 * t2;
    const T = t1 + t2 + halt / 60;
    const avg = (d1 + d2) / T;
    if (!Number.isInteger(avg) || s1 === s2) continue;
    const noHalt = (d1 + d2) / (t1 + t2);
    return {
      facts: { form: 'average', ask: 'avg', given: {}, legs: [{ dist: d1, speed: s1 }, { haltMin: halt }, { dist: d2, speed: s2 }] },
      prompt: `A bus travels ${d1} km at ${s1} km/h, halts at a dhaba for ${halt} minutes, and then covers another ${d2} km at ${s2} km/h. What is its average speed for the whole journey, including the halt?`,
      answer: avg,
      fmt: kmh,
      mistakes: [
        { value: clean(noHalt, 1), why: 'left out the halt', trap: `${kmh(noHalt)} ignores the ${halt}-minute halt; the question includes it in the total time.` },
        { value: clean((s1 + s2) / 2, 1), why: 'took the simple average of the speeds' },
        { value: clean((d1 + d2) / (t1 + t2 + halt / 100), 1), why: 'wrote the halt minutes as a decimal of an hour' },
      ],
      steps: [`Time for the first part = ${d1} ÷ ${s1} = ${num(t1)} h`, `Halt = ${halt} min = ${fracTex(halt, 60)} h`, `Time for the second part = ${d2} ÷ ${s2} = ${num(t2)} h`, `Average = ${d1 + d2} ÷ ${num(T)} = ${avg} km/h`],
      shortcut: `Include every minute of the trip, halts too, in the total time.`,
      trap: `"Including the halt" means the halt time counts.`,
      tags: ['speed:average-speed'],
      choice: { step: 1 },
    };
  }
  throw new Error('averageSpeed: no numbers found');
}

/* ------------------------------ relative speed ------------------------------ */

export function relativeSpeed(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  if (level === 'easy') {
    for (let tries = 0; tries < 400; tries++) {
      const [a, b] = rng.sample([10, 12, 15, 16, 18, 20, 24, 25, 30, 36, 40, 45, 50, 60], 2).sort((x, y) => x - y);
      const tMin = rng.pick([20, 24, 30, 36, 40, 45, 48, 50, 60, 72, 75, 80, 90, 120]);
      const D = ((a + b) * tMin) / 60;
      if (!Number.isInteger(D) || D < 5) continue;
      const [A, B] = towns(rng, 2);
      const [p, q] = people(rng, 2);
      const who = b <= 20 ? 'cycling' : 'riding motorcycles';
      const wrong = clean((D / (b - a)) * 60);
      return {
        facts: { form: 'towards', ask: 'minutes', given: { D, a, b } },
        prompt: `${p.name} and ${q.name} start at the same time from ${A} and ${B}, ${plain(D)} km apart, ${who} towards each other at ${a} km/h and ${b} km/h respectively. After how many minutes will they meet?`,
        answer: tMin,
        fmt: mins,
        mistakes: [
          { value: wrong, why: 'subtracted the speeds', trap: `Subtracting the speeds is for the same direction; moving towards each other they close the gap at ${a} + ${b} = ${a + b} km/h.` },
          { value: clean((D / b) * 60), why: 'used only the faster speed' },
          { value: clean((D / a) * 60), why: 'used only the slower speed' },
        ],
        steps: [`Towards each other → relative speed = ${a} + ${b} = ${a + b} km/h`, `Time = ${plain(D)} ÷ ${a + b} h = ${fracTex(tMin, 60)} h = ${tMin} minutes`],
        shortcut: `Gap ÷ (sum of speeds).`,
        trap: `Moving towards each other → add the speeds.`,
        tags: ['speed:relative-speed', 'speed:opposite-direction'],
        choice: { step: tMin >= 40 ? 5 : 2 },
      };
    }
    throw new Error('relativeSpeed easy: no numbers found');
  }
  if (level === 'medium') {
    for (let tries = 0; tries < 400; tries++) {
      const a = rng.pick([30, 36, 40, 45, 48, 50, 60]);
      const dv = rng.pick([5, 6, 8, 9, 10, 12, 15, 20]);
      const b = a + dv;
      const m = rng.pick([15, 20, 30, 40, 45, 60]);
      const catchMin = (a * m) / dv;
      if (!Number.isInteger(catchMin) || catchMin > 360 || catchMin < 20) continue;
      const dist = (b * catchMin) / 60;
      if (!Number.isInteger(dist)) continue;
      const [p, q] = people(rng, 2);
      const askTime = rng.chance(0.5);
      const lead = `${p.name} leaves a toll plaza on a highway at ${a} km/h. ${m} minutes later, ${q.name} leaves the same toll plaza in the same direction at ${b} km/h.`;
      const gap = (a * m) / 60;
      const wrongAdd = clean((gap / (a + b)) * 60);
      if (askTime) {
        return {
          facts: { form: 'chase', ask: 'catchMin', given: { a, b, delayMin: m } },
          prompt: `${lead} How many minutes after starting will ${q.name} catch up with ${p.name}?`,
          answer: catchMin,
          fmt: mins,
          mistakes: [
            { value: wrongAdd, why: 'added the speeds', trap: `${mins(wrongAdd)} adds the speeds; ${q.name} gains only ${b} − ${a} = ${dv} km/h on ${p.name}.` },
            { value: catchMin + m, why: `counted from ${p.name}'s start` },
            { value: clean((gap / b) * 60), why: `ignored ${p.name}'s motion` },
          ],
          steps: [`Head start = ${a} × ${fracTex(m, 60)} = ${plain(gap)} km`, `Gain per hour = ${b} − ${a} = ${dv} km/h`, `Time = ${plain(gap)} ÷ ${dv} h = ${catchMin} minutes`],
          shortcut: `Catch-up time = head start ÷ (difference of speeds).`,
          trap: `Same direction → subtract the speeds.`,
          tags: ['speed:relative-speed', 'speed:same-direction'],
          choice: { step: stepWithin(catchMin) >= 5 ? 5 : 1 },
        };
      }
      return {
        facts: { form: 'chase', ask: 'catchDist', given: { a, b, delayMin: m } },
        prompt: `${lead} How far from the toll plaza will ${q.name} catch up with ${p.name}?`,
        answer: dist,
        fmt: km,
        mistakes: [
          { value: clean((a * catchMin) / 60), why: `used ${p.name}'s speed for the catch-up time only`, trap: `In that time ${p.name} also had a ${plain(gap)} km head start; the meeting point is ${q.name}'s full distance.` },
          { value: clean(gap), why: 'gave the head start' },
          { value: clean(((gap / (a + b)) * b)), why: 'added the speeds' },
        ],
        steps: [`Head start = ${a} × ${fracTex(m, 60)} = ${plain(gap)} km`, `Catch-up time = ${plain(gap)} ÷ (${b} − ${a}) = ${fracTex(catchMin, 60)} h`, `Distance = ${b} × ${fracTex(catchMin, 60)} = ${dist} km`],
        shortcut: `Find the catch-up time with the speed difference, then use the faster speed.`,
        trap: `Same direction → subtract the speeds.`,
        tags: ['speed:relative-speed', 'speed:same-direction'],
        choice: { step: stepWithin(dist) >= 5 ? 5 : 1 },
      };
    }
    throw new Error('relativeSpeed medium: no numbers found');
  }
  if (level === 'hard') {
    for (let tries = 0; tries < 400; tries++) {
      const a = rng.pick([6, 7, 8, 9, 10]);
      const b = a + rng.pick([1, 2, 3, 4]);
      const gapM = rng.pick([100, 120, 150, 180, 200, 250, 300]);
      const rel = ((b - a) * 5) / 18;
      const tSec = gapM / rel;
      const thief = (a * 5 * tSec) / 18;
      if (!Number.isInteger(tSec) || !Number.isInteger(thief)) continue;
      const [p] = people(rng, 1);
      const wrong = clean((((a * 5) / 18) * gapM) / (((a + b) * 5) / 18));
      return {
        facts: { form: 'metres-chase', ask: 'thiefDist', given: { gapM, a, b } },
        prompt: `A thief is spotted by a policeman ${gapM} m away. The thief starts running at ${a} km/h and ${p.name}, the policeman, chases him at ${b} km/h at the same moment. How far will the thief have run before he is caught?`,
        answer: thief,
        fmt: metres,
        mistakes: [
          { value: thief + gapM, why: "gave the policeman's distance", trap: `${metres(thief + gapM)} is how far the policeman runs; the thief runs ${gapM} m less.` },
          { value: wrong, why: 'added the speeds' },
          { value: clean(thief / 2), why: 'halved the distance' },
        ],
        steps: [`Relative speed = ${b} − ${a} = ${b - a} km/h = ${plain(rel)} m/s`, `Time to close ${gapM} m = ${gapM} ÷ ${plain(rel)} = ${tSec} s`, `Thief's distance = ${a} × $\\frac{5}{18}$ × ${tSec} = ${thief} m`],
        shortcut: `Distances in the same time are in the ratio of speeds: thief : police = ${a} : ${b}, and the difference ${b - a} parts = ${gapM} m.`,
        trap: `The policeman runs the thief's distance plus the ${gapM} m gap.`,
        tags: ['speed:relative-speed', 'speed:same-direction', 'trick:ratio'],
        choice: { step: stepWithin(thief) },
      };
    }
    throw new Error('relativeSpeed hard: no numbers found');
  }
  // extreme: the faster one reaches the end, turns and meets the slower one
  for (let tries = 0; tries < 400; tries++) {
    const a = rng.pick([8, 10, 12, 15, 20, 24, 30]);
    const b = a + rng.pick([2, 3, 4, 5, 6, 10]);
    const D = rng.int(4, 40) * 3;
    const t = (2 * D) / (a + b);
    const fromB = D - a * t;
    if (!Number.isInteger(fromB) || fromB <= 0 || !Number.isFinite(clean(t * 60))) continue;
    const [A, B] = towns(rng, 2);
    const [p, q] = people(rng, 2);
    return {
      facts: { form: 'return-meet', ask: 'fromB', given: { D, a, b } },
      prompt: `${p.name} and ${q.name} start cycling together from ${A} towards ${B}, ${D} km away, at ${a} km/h and ${b} km/h respectively. ${q.name} reaches ${B}, turns back immediately and meets ${p.name} on the way. How far from ${B} do they meet?`,
      answer: fromB,
      fmt: km,
      mistakes: [
        { value: a * t, why: `gave the distance from ${A}`, trap: `${km(a * t)} is how far ${p.name} is from ${A}; the question asks the distance from ${B}.` },
        { value: clean(D - (a * D) / (a + b)), why: 'used a single trip (D) instead of 2D' },
        { value: clean(((b - a) * D) / (a + b) / 2), why: 'halved the gap' },
      ],
      steps: [`Together they cover 2 × ${D} = ${2 * D} km by the time they meet`, `Time = ${2 * D} ÷ (${a} + ${b}) = ${num(t)} h`, `${p.name} has covered ${a} × ${num(t)} = ${plain(a * t)} km`, `Distance from ${B} = ${D} − ${plain(a * t)} = ${fromB} km`],
      shortcut: `Meeting after a turnaround: combined distance = 2D, so the gap from ${B} = (b − a) × D ÷ (a + b) = ${fromB} km.`,
      trap: `By the time they meet, the two together have covered twice the distance.`,
      tags: ['speed:relative-speed', 'speed:meeting'],
      choice: { step: 1 },
    };
  }
  throw new Error('relativeSpeed: no numbers found');
}

/* ------------------------------ meeting point ------------------------------ */

export function meetingPoint(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const [A, B] = towns(rng, 2);
  if (level === 'easy') {
    const [a, b] = rng.sample([30, 36, 40, 45, 48, 50, 54, 60, 72, 75, 80], 2);
    const t = rng.pick([2.5, 3, 3.5, 4, 4.5, 5]);
    const D = (a + b) * t;
    const askTime = rng.chance(0.4);
    const lead = `Two trains start at the same time from stations ${A} and ${B}, ${plain(D)} km apart, and travel towards each other at ${a} km/h and ${b} km/h respectively.`;
    if (askTime) {
      return {
        facts: { form: 'meet', ask: 'time', given: { D, a, b, delayMin: 0 } },
        prompt: `${lead} After how many hours will they meet?`,
        answer: t,
        fmt: hrs,
        mistakes: [
          { value: clean(D / Math.abs(a - b), 2), why: 'subtracted the speeds', trap: `Towards each other the gap closes at ${a} + ${b} km/h, not ${Math.abs(a - b)} km/h.` },
          { value: clean(D / (2 * Math.max(a, b)), 2), why: 'used only the faster train' },
        ],
        steps: [`Relative speed = ${a} + ${b} = ${a + b} km/h`, `Time = ${plain(D)} ÷ ${a + b} = ${num(t)} hours`],
        shortcut: `Gap ÷ sum of speeds.`,
        trap: `Towards each other → add the speeds.`,
        tags: ['speed:meeting', 'speed:opposite-direction'],
        choice: { step: 0.5 },
      };
    }
    return {
      facts: { form: 'meet', ask: 'fromA', given: { D, a, b, delayMin: 0 } },
      prompt: `${lead} At what distance from ${A} will they meet?`,
      answer: a * t,
      fmt: km,
      mistakes: [
        { value: b * t, why: `gave the distance from ${B}`, trap: `${km(b * t)} is the distance covered by the train from ${B}.` },
        { value: clean(D / 2), why: 'assumed they meet midway' },
      ],
      steps: [`They meet after ${plain(D)} ÷ (${a} + ${b}) = ${num(t)} h`, `Distance from ${A} = ${a} × ${num(t)} = ${plain(a * t)} km`],
      shortcut: `The meeting point divides the distance in the ratio of speeds ${a} : ${b}.`,
      trap: `Each train covers a share proportional to its own speed.`,
      tags: ['speed:meeting', 'trick:ratio'],
      choice: { step: 5 },
    };
  }
  if (level === 'medium') {
    for (let tries = 0; tries < 600; tries++) {
      const a = rng.pick([30, 36, 40, 45, 48, 50, 60, 72]);
      const b = rng.pick([30, 36, 40, 45, 48, 50, 60, 72, 75, 80]);
      const delay = rng.pick([30, 60, 90, 120]);
      const tau = rng.pick([60, 90, 120, 150, 180, 210, 240]);
      const D = (a * (delay + tau)) / 60 + (b * tau) / 60;
      const fromA = (a * (delay + tau)) / 60;
      if (!Number.isInteger(D) || !Number.isInteger(fromA) || !Number.isInteger((a * delay) / 60) || a === b) continue;
      const start = rng.pick([6, 7, 8, 9]) * 60 + rng.pick([0, 0, 30]);
      const meet = start + delay + tau;
      const askClock = rng.chance(0.5);
      const lead = `A train leaves station ${A} at ${clockText(start)} for station ${B} at ${a} km/h. Another train leaves ${B} for ${A} at ${clockText(start + delay)} at ${b} km/h. The stations are ${plain(D)} km apart.`;
      const together = start + (D / (a + b)) * 60;
      if (askClock) {
        return {
          facts: { form: 'meet', ask: 'clock', given: { D, a, b, delayMin: delay, startClock: start } },
          prompt: `${lead} At what time will the two trains meet?`,
          answer: meet,
          fmt: clockText,
          mistakes: [
            { value: clean(together), why: 'ignored the later start', trap: `${clockText(together)} treats both trains as starting at ${clockText(start)}; the second starts ${delay} minutes later.` },
            { value: clean(start + delay + (D / (a + b)) * 60), why: "forgot the first train's head start" },
            { value: clean(start + tau), why: 'forgot to add the delay' },
          ],
          steps: [
            `By ${clockText(start + delay)} the first train has covered ${a} × ${fracTex(delay, 60)} = ${plain((a * delay) / 60)} km`,
            `Remaining gap = ${plain(D)} − ${plain((a * delay) / 60)} = ${plain(D - (a * delay) / 60)} km`,
            `Time to meet = ${plain(D - (a * delay) / 60)} ÷ (${a} + ${b}) = ${hoursMinutes(tau)}`,
            `Meeting time = ${clockText(start + delay)} + ${hoursMinutes(tau)} = ${clockText(meet)}`,
          ],
          shortcut: `Remove the head-start distance first, then divide by the sum of speeds.`,
          trap: `Only after the second train starts do they close the gap at the combined speed.`,
          tags: ['speed:meeting', 'speed:opposite-direction'],
          choice: { step: 15 },
        };
      }
      return {
        facts: { form: 'meet', ask: 'fromA', given: { D, a, b, delayMin: delay, startClock: start } },
        prompt: `${lead} At what distance from ${A} will they meet?`,
        answer: fromA,
        fmt: km,
        mistakes: [
          { value: clean(D - fromA), why: `gave the distance from ${B}`, trap: `${km(D - fromA)} is measured from ${B}.` },
          { value: clean((a * tau) / 60), why: "forgot the first train's head start" },
          { value: clean((D * a) / (a + b)), why: 'ignored the later start' },
        ],
        steps: [
          `Head start of the first train = ${a} × ${fracTex(delay, 60)} = ${plain((a * delay) / 60)} km`,
          `Remaining gap = ${plain(D - (a * delay) / 60)} km, closed at ${a + b} km/h in ${hoursMinutes(tau)}`,
          `Distance from ${A} = ${plain((a * delay) / 60)} + ${a} × ${fracTex(tau, 60)} = ${plain(fromA)} km`,
        ],
        shortcut: `Head start + share of the remaining gap in the ratio ${a} : ${b}.`,
        trap: `The first train also moves during the delay.`,
        tags: ['speed:meeting'],
        choice: { step: 5 },
      };
    }
    throw new Error('meetingPoint medium: no numbers found');
  }
  if (level === 'hard') {
    if (rng.chance(0.5)) {
      const [b, a] = rng.sample([30, 36, 40, 45, 48, 50, 54, 60, 72], 2).sort((x, y) => x - y);
      const t = rng.pick([1, 1.5, 2, 2.5, 3, 4]);
      const extra = (a - b) * t;
      const D = (a + b) * t;
      if (Number.isInteger(extra) && Number.isInteger(D)) {
        return {
          facts: { form: 'meet-extra', ask: 'D', given: { a, b, extra } },
          prompt: `Two trains start at the same time from stations ${A} and ${B} and travel towards each other at ${a} km/h and ${b} km/h respectively. When they meet, the faster train has travelled ${plain(extra)} km more than the other. What is the distance between ${A} and ${B}?`,
          answer: D,
          fmt: km,
          mistakes: [
            { value: 2 * extra, why: 'doubled the extra distance', trap: `The extra ${plain(extra)} km is the difference of the distances, not half the total.` },
            { value: clean(a * t), why: 'gave only the faster train’s distance' },
            { value: clean(extra * (a + b) / a), why: 'divided by the faster speed instead of the speed difference' },
          ],
          steps: [`The faster train gains ${a} − ${b} = ${a - b} km every hour`, `Time to gain ${plain(extra)} km = ${plain(extra)} ÷ ${a - b} = ${num(t)} h`, `Distance = (${a} + ${b}) × ${num(t)} = ${plain(D)} km`],
          shortcut: `Distances are in the ratio ${a} : ${b}; the difference ${a - b} parts = ${plain(extra)} km, the total ${a + b} parts.`,
          trap: `Use the speed difference to find the time first.`,
          tags: ['speed:meeting', 'trick:ratio'],
          choice: { step: 10 },
        };
      }
    }
    const opts = [
      [4, 9, 3, 2],
      [9, 4, 2, 3],
      [9, 16, 4, 3],
      [16, 9, 3, 4],
      [16, 25, 5, 4],
      [25, 16, 4, 5],
      [1, 4, 2, 1],
      [4, 1, 1, 2],
    ];
    const [t1, t2, ra, rb] = rng.pick(opts);
    const unit = rng.pick([10, 12, 15, 18, 20]);
    const a = ra * unit;
    const b = rb * unit;
    const wrong = clean((a * t1) / t2);
    return {
      facts: { form: 'after-meet', ask: 'b', given: { a, t1, t2 } },
      prompt: `Two trains start at the same time from ${A} and ${B} towards each other. After they meet, they take ${hrs(t1)} and ${hrs(t2)} respectively to reach ${B} and ${A}. If the train from ${A} runs at ${a} km/h, what is the speed of the other train?`,
      answer: b,
      fmt: kmh,
      mistakes: [
        { value: wrong, why: 'used the ratio of times without the square root', trap: `Speeds are in the ratio √(t₂) : √(t₁), not t₂ : t₁.` },
        { value: clean((a * ra) / rb), why: 'inverted the ratio' },
        { value: a, why: 'assumed equal speeds' },
      ],
      steps: [`After meeting, each covers what the other covered before meeting`, `Speed ratio: a : b = √(t₂) : √(t₁) = √${t2} : √${t1} = ${ra} : ${rb}`, `b = ${a} × ${rb}/${ra} = ${b} km/h`],
      shortcut: `a/b = √(t₂/t₁).`,
      trap: `The square root is essential.`,
      tags: ['speed:meeting', 'trick:square-root-rule'],
      choice: { step: 6 },
    };
  }
  // extreme: second meeting after turning back at the ends
  for (let tries = 0; tries < 600; tries++) {
    const a = rng.pick([4, 5, 6, 8, 10, 12]);
    const b = a + rng.int(1, a - 1);
    if (b >= 2 * a) continue;
    const s = a + b;
    const D = rng.int(2, 12) * (s / gcd(a, s));
    const x = (a * D) / s;
    const second = 2 * D - 3 * x;
    if (!Number.isInteger(x) || second <= 0 || D > 120) continue;
    const [p, q] = people(rng, 2);
    return {
      facts: { form: 'second-meet', ask: 'fromA', given: { D, a, b } },
      prompt: `${p.name} and ${q.name} start at the same time from the two ends ${A} and ${B} of a road ${D} km long and walk towards each other at ${a} km/h and ${b} km/h respectively. On reaching the opposite end, each turns back immediately. At what distance from ${A} will they meet for the second time?`,
      answer: second,
      fmt: km,
      mistakes: [
        { value: x, why: 'gave the first meeting point', trap: `${km(x)} is where they meet the first time.` },
        { value: clean(3 * x), why: 'did not account for the turn at the far end' },
        { value: D - x, why: 'measured the first meeting from the other end' },
        { value: clean(D - second), why: `measured from ${B}` },
      ],
      steps: [
        `First meeting: together they cover ${D} km; ${p.name} covers ${a}/${s} of it = ${x} km`,
        `Second meeting: together they cover 3 × ${D} = ${3 * D} km, so ${p.name} covers 3 × ${x} = ${3 * x} km`,
        `${p.name} reaches ${B} after ${D} km and walks back ${3 * x} − ${D} = ${3 * x - D} km`,
        `Distance from ${A} = ${D} − ${3 * x - D} = ${second} km`,
      ],
      shortcut: `By the n-th meeting (head-on), the combined distance is (2n − 1) × D.`,
      trap: `Between meetings they cover 2D together, not D.`,
      tags: ['speed:meeting'],
      choice: { step: 1 },
    };
  }
  throw new Error('meetingPoint: no numbers found');
}

/* ------------------------------ late / early ------------------------------ */

const mn = (n: number) => `${n} minute${n === 1 ? '' : 's'}`;

/** [s1, v, s2, D]: late at s1, early at s2, on time at v; all minute counts whole and late ≠ early. */
const ON_TIME: [number, number, number, number][] = (() => {
  const SP = [4, 5, 6, 8, 10, 12, 15, 18, 20, 24, 25, 30, 36, 40, 45, 48, 50, 60, 72, 75, 80];
  const out: [number, number, number, number][] = [];
  for (const s1 of SP)
    for (const v of SP)
      for (const s2 of SP) {
        if (!(s1 < v && v < s2) || s2 > 2 * s1) continue;
        for (let D = 1; D <= 240; D++) {
          const late = (60 * D) / s1 - (60 * D) / v;
          const early = (60 * D) / v - (60 * D) / s2;
          if (!Number.isInteger(late) || !Number.isInteger(early) || late === early || late + early < 6 || late + early > 120) continue;
          if (!Number.isInteger((60 * D) / s1)) continue;
          out.push([s1, v, s2, D]);
          break;
        }
      }
  return out;
})();

export function lateEarly(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const p = person(rng);
  const place = rng.pick(['the office', 'school', 'the railway station', 'the bank branch', 'the exam centre']);
  if (level === 'easy') {
    const slower = rng.chance(0.65);
    const fr = slower ? rng.pick([[3, 4], [4, 5], [2, 3], [5, 6], [6, 7]]) : rng.pick([[5, 4], [6, 5], [4, 3], [3, 2]]);
    const [n, d] = fr;
    const unit = rng.pick([5, 6, 8, 10, 12, 15]);
    const usual = n * unit;
    const newT = (usual * d) / n;
    const diff = Math.abs(newT - usual);
    return {
      facts: { form: 'fraction-speed', ask: 'usualMin', given: { num: n, den: d, diffMin: diff, late: slower ? 1 : 0 } },
      prompt: `${slower ? 'Walking' : 'Cycling'} at ${fracTex(n, d)} of ${p.his} usual speed, ${p.name} reaches ${place} ${diff} minutes ${slower ? 'late' : 'early'}. What is ${p.his} usual time to reach ${place}?`,
      answer: usual,
      fmt: mins,
      mistakes: [
        { value: newT, why: 'gave the new time instead of the usual time', trap: `${mins(newT)} is the time at the changed speed; the usual time is ${mins(usual)}.` },
        { value: clean((diff * n) / d), why: 'multiplied by the speed fraction' },
        { value: clean(diff * d), why: 'used the wrong part of the ratio' },
      ],
      steps: [`Speed becomes ${fracTex(n, d)} → time becomes ${fracTex(d, n)} of the usual time`, `Extra ${slower ? '' : '(saved) '}time = ${fracTex(Math.abs(d - n), n)} of the usual time = ${diff} min`, `Usual time = ${diff} × ${fracTex(n, Math.abs(d - n))} = ${usual} minutes`],
      shortcut: `Speed ratio ${n} : ${d} → time ratio ${d} : ${n}; the ${Math.abs(d - n)}-part gap = ${diff} min.`,
      trap: `Time changes in the inverse ratio of speed.`,
      tags: ['speed:late-early', 'trick:inverse-proportion'],
      choice: { step: 5 },
    };
  }
  if (level === 'extreme') {
    for (let tries = 0; tries < 50; tries++) {
      const [s1, v, s2, D] = rng.pick(ON_TIME);
      const late = (60 * D) / s1 - (60 * D) / v;
      const early = (60 * D) / v - (60 * D) / s2;
      const gapMin = late + early;
      const T = (60 * D) / v;
      const hm = (2 * s1 * s2) / (s1 + s2);
      return {
        facts: { form: 'late-early', ask: 'speed', given: { s1, late, s2, early } },
        prompt: `If ${p.name} travels at ${s1} km/h, ${p.he} reaches ${place} ${mn(late)} late; at ${s2} km/h ${p.he} reaches ${mn(early)} early. At what speed should ${p.he} travel to reach exactly on time?`,
        answer: v,
        fmt: kmh,
        mistakes: [
          { value: clean((s1 + s2) / 2, 1), why: 'took the simple average of the speeds', trap: `${kmh((s1 + s2) / 2)} is just the mean of the speeds; find the distance and the exact time first.` },
          { value: clean(hm), why: 'took 2ab/(a + b), which needs equal late and early times', trap: `2ab/(a + b) works only when late and early minutes are equal; here they are ${late} and ${early}.` },
          { value: clean((D * 60) / (T - early)), why: 'aimed for the early arrival time' },
        ],
        steps: [
          `Gap between arrivals = ${late} + ${early} = ${gapMin} min → D/${s1} − D/${s2} = ${fracTex(gapMin, 60)} h → D = ${D} km`,
          `Time at ${s1} km/h = ${hoursMinutes((D / s1) * 60)}; exact time = that − ${late} min = ${hoursMinutes(T)}`,
          `Speed = ${D} ÷ ${fracTex(T, 60)} = ${v} km/h`,
        ],
        shortcut: `Distance from the late/early gap, then distance ÷ exact time.`,
        trap: `The on-time speed is not the average of the two speeds unless late = early.`,
        tags: ['speed:late-early'],
        choice: { step: 1 },
      };
    }
  }
  for (let tries = 0; tries < 800; tries++) {
    const s1 = rng.pick([3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 30, 36, 40, 45, 48, 50, 60]);
    const s2 = rng.pick([4, 5, 6, 8, 10, 12, 15, 18, 20, 24, 30, 36, 40, 45, 48, 50, 60, 72]);
    if (s2 <= s1 || s2 > 2 * s1) continue;
    const base = (s1 * s2) / gcd(s1, s2);
    const D = base * rng.int(1, 6);
    if (D > 200 || D < 3) continue;
    const gapMin = (D / s1 - D / s2) * 60;
    if (!Number.isInteger(gapMin) || gapMin < 6 || gapMin > 90) continue;
    if (level === 'medium' || level === 'extreme') {
      const late = rng.int(1, gapMin - 1);
      const early = gapMin - late;
      if (level === 'medium') {
        const wrongGap = Math.abs(late - early);
        const wrongD = wrongGap > 0 ? clean((wrongGap / 60) / (1 / s1 - 1 / s2)) : NaN;
        return {
          facts: { form: 'late-early', ask: 'D', given: { s1, late, s2, early } },
          prompt: `If ${p.name} travels at ${s1} km/h, ${p.he} reaches ${place} ${mn(late)} late. If ${p.he} travels at ${s2} km/h, ${p.he} reaches ${mn(early)} early. What is the distance to ${place}?`,
          answer: D,
          fmt: km,
          mistakes: [
            { value: wrongD, why: 'subtracted the late and early minutes', trap: `Late and early are on opposite sides of the right time, so the gap between the two arrivals is ${late} + ${early} = ${gapMin} minutes.` },
            { value: clean(((gapMin / 60) * (s1 + s2)) / 2), why: 'multiplied the gap by the average speed' },
            { value: clean((gapMin / 60) * s2), why: 'multiplied the gap by the faster speed' },
          ],
          steps: [`Difference in times = ${late} + ${early} = ${gapMin} min = ${fracTex(gapMin, 60)} h`, `D/${s1} − D/${s2} = ${fracTex(gapMin, 60)}`, `D × ${fracTex(s2 - s1, s1 * s2)} = ${fracTex(gapMin, 60)} → D = ${D} km`],
          shortcut: `D = (s₁ × s₂ ÷ (s₂ − s₁)) × time gap = (${s1 * s2} ÷ ${s2 - s1}) × ${fracTex(gapMin, 60)} = ${D} km.`,
          trap: `Late + early gives the full gap between the two arrival times.`,
          tags: ['speed:late-early'],
          choice: { step: stepWithin(D) >= 2 ? stepWithin(D) : 1 },
        };
      }
      // extreme: speed to be exactly on time
      const T = (D / s1) * 60 - late;
      const v = (D * 60) / T;
      if (!Number.isInteger(v) || late === early) continue;
      const hm = (2 * s1 * s2) / (s1 + s2);
      return {
        facts: { form: 'late-early', ask: 'speed', given: { s1, late, s2, early } },
        prompt: `If ${p.name} travels at ${s1} km/h, ${p.he} reaches ${place} ${mn(late)} late; at ${s2} km/h ${p.he} reaches ${mn(early)} early. At what speed should ${p.he} travel to reach exactly on time?`,
        answer: v,
        fmt: kmh,
        mistakes: [
          { value: clean((s1 + s2) / 2, 1), why: 'took the simple average of the speeds', trap: `${kmh((s1 + s2) / 2)} would be right only by coincidence; find the distance and the exact time first.` },
          { value: clean(hm), why: 'took 2ab/(a + b), which needs equal late and early times' },
          { value: clean((D * 60) / (T + early)), why: 'aimed for the early arrival time' },
        ],
        steps: [
          `Gap between arrivals = ${late} + ${early} = ${gapMin} min → D/${s1} − D/${s2} = ${fracTex(gapMin, 60)} h → D = ${D} km`,
          `Time at ${s1} km/h = ${hoursMinutes((D / s1) * 60)}; exact time = that − ${late} min = ${hoursMinutes(T)}`,
          `Speed = ${D} ÷ ${fracTex(T, 60)} = ${v} km/h`,
        ],
        shortcut: `Distance from the late/early gap, then distance ÷ exact time.`,
        trap: `The on-time speed is not the average of the two speeds unless late = early.`,
        tags: ['speed:late-early'],
        choice: { step: 1 },
      };
    }
    // hard: both late
    const late2 = rng.int(1, 30);
    const late1 = late2 + gapMin;
    if (rng.chance(0.5)) {
      const wrongD = clean(((late1 + late2) / 60) / (1 / s1 - 1 / s2));
      return {
        facts: { form: 'both-late', ask: 'D', given: { s1, late1, s2, late2 } },
        prompt: `Travelling at ${s1} km/h, ${p.name} reaches ${place} ${mn(late1)} late. Travelling at ${s2} km/h, ${p.he} is still ${mn(late2)} late. What is the distance to ${place}?`,
        answer: D,
        fmt: km,
        mistakes: [
          { value: wrongD, why: 'added the two late times', trap: `Both arrivals are late, so the gap between them is ${late1} − ${late2} = ${gapMin} minutes, not the sum.` },
          { value: clean((gapMin / 60) * s1), why: 'multiplied the gap by one speed' },
        ],
        steps: [`Difference in times = ${late1} − ${late2} = ${gapMin} min`, `D/${s1} − D/${s2} = ${fracTex(gapMin, 60)} h`, `D = ${D} km`],
        shortcut: `D = s₁s₂/(s₂ − s₁) × time gap.`,
        trap: `Two late arrivals → subtract the late times.`,
        tags: ['speed:late-early'],
        choice: { step: stepWithin(D) >= 2 ? stepWithin(D) : 1 },
      };
    }
    const sched = (D / s1) * 60 - late1;
    if (sched <= 0) continue;
    return {
      facts: { form: 'both-late', ask: 'schedMin', given: { s1, late1, s2, late2 } },
      prompt: `Travelling at ${s1} km/h, ${p.name} reaches ${place} ${mn(late1)} late. Travelling at ${s2} km/h, ${p.he} is ${mn(late2)} late. How many minutes does ${p.he} have to reach ${place} on time?`,
      answer: sched,
      fmt: mins,
      mistakes: [
        { value: (D / s1) * 60, why: 'gave the travel time at the slower speed', trap: `${mins((D / s1) * 60)} is the time taken at ${s1} km/h, which is ${late1} minutes more than allowed.` },
        { value: (D / s2) * 60, why: 'gave the travel time at the faster speed' },
        { value: clean((D / s1) * 60 - late2), why: 'subtracted the wrong late time' },
      ],
      steps: [`Gap = ${late1} − ${late2} = ${gapMin} min → D = ${D} km`, `Time at ${s1} km/h = ${D} ÷ ${s1} h = ${(D / s1) * 60} min`, `Allowed time = ${(D / s1) * 60} − ${late1} = ${sched} min`],
      shortcut: `Find D from the gap, then subtract the lateness.`,
      trap: `Subtract the lateness that belongs to the same speed.`,
      tags: ['speed:late-early'],
      choice: { step: 5 },
    };
  }
  throw new Error('lateEarly: no numbers found');
}

/* ------------------------------ stoppage ------------------------------ */

const STOP_PAIRS: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (const s1 of [40, 45, 48, 50, 54, 60, 64, 72, 75, 80, 90, 96, 100, 120]) {
    for (const m of [5, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24]) {
      const s2 = (s1 * (60 - m)) / 60;
      if (Number.isInteger(s2)) out.push([s1, s2, m]);
    }
  }
  return out;
})();

export function stoppage(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const v = rng.pick(['bus', 'train', 'passenger train']);
  if (level === 'easy' || level === 'medium') {
    const [s1, s2, m] = rng.pick(STOP_PAIRS);
    if (level === 'easy' || rng.chance(0.4)) {
      return {
        facts: { form: 'stoppage', ask: 'perHour', given: { s1, s2 } },
        prompt: `Excluding stoppages, the speed of a ${v} is ${s1} km/h, and including stoppages it is ${s2} km/h. For how many minutes does the ${v} stop per hour?`,
        answer: m,
        fmt: mins,
        mistakes: [
          { value: s1 - s2 === m ? NaN : s1 - s2, why: 'took the speed difference as minutes', trap: `${s1} − ${s2} = ${s1 - s2} is a distance lost per hour, not minutes; convert it at ${s1} km/h.` },
          { value: clean(((s1 - s2) / s2) * 60), why: 'divided by the slower speed' },
        ],
        steps: [`Distance lost per hour due to stops = ${s1} − ${s2} = ${s1 - s2} km`, `Time to cover ${s1 - s2} km at ${s1} km/h = ${fracTex(s1 - s2, s1)} h`, `= ${m} minutes per hour`],
        shortcut: `Stoppage per hour = (difference ÷ faster speed) × 60 = ${m} min.`,
        trap: `Divide by the speed without stoppages.`,
        tags: ['speed:stoppage'],
        choice: { step: 1 },
      };
    }
    if (rng.chance(0.5)) {
      return {
        facts: { form: 'stoppage', ask: 's2', given: { s1, perHour: m } },
        prompt: `A ${v} runs at ${s1} km/h when moving, but it stops for ${m} minutes every hour. What is its average speed including stoppages?`,
        answer: s2,
        fmt: kmh,
        mistakes: [
          { value: s1 - m, why: 'subtracted the minutes from the speed', trap: `${kmh(s1 - m)} subtracts minutes from km/h; the ${v} moves only ${60 - m} minutes of each hour.` },
          { value: clean((s1 * m) / 60), why: 'used the stopped time instead of the moving time' },
          { value: clean((s1 * 60) / (60 + m)), why: 'added the stoppage to the hour' },
        ],
        steps: [`Moving time per hour = 60 − ${m} = ${60 - m} minutes`, `Distance per hour = ${s1} × ${fracTex(60 - m, 60)} = ${s2} km`, `Average speed including stoppages = ${s2} km/h`],
        shortcut: `Speed with stoppages = s × (60 − m)/60.`,
        trap: `Only the moving minutes produce distance.`,
        tags: ['speed:stoppage'],
        choice: { step: 1 },
      };
    }
    return {
      facts: { form: 'stoppage', ask: 's1', given: { s2, perHour: m } },
      prompt: `Including stoppages, a ${v} averages ${s2} km/h. If it stops for ${m} minutes every hour, what is its speed when it is moving?`,
      answer: s1,
      fmt: kmh,
      mistakes: [
        { value: s2 + m, why: 'added the minutes to the speed', trap: `${kmh(s2 + m)} mixes minutes with km/h; the ${s2} km are covered in only ${60 - m} minutes.` },
        { value: clean((s2 * (60 + m)) / 60), why: 'scaled up by (60 + m)/60' },
        { value: clean((s2 * 60) / m), why: 'divided by the stopped minutes' },
      ],
      steps: [`${s2} km are covered in ${60 - m} moving minutes`, `Speed = ${s2} ÷ ${fracTex(60 - m, 60)} = ${s1} km/h`],
      shortcut: `Moving speed = s_with × 60/(60 − m).`,
      trap: `Divide by the moving time, not the whole hour.`,
      tags: ['speed:stoppage'],
      choice: { step: 1 },
    };
  }
  if (level === 'hard') {
    for (let tries = 0; tries < 400; tries++) {
      const [s1, s2, m] = rng.pick(STOP_PAIRS);
      const T = rng.pick([2, 3, 4, 5, 6]);
      const D = s2 * T;
      if (D > 600) continue;
      return {
        facts: { form: 'stoppage-journey', ask: 'perHour', given: { D, T, s1 } },
        prompt: `A ${v} covers a distance of ${D} km in ${hrs(T)}, including stoppages. Without stoppages its speed is ${s1} km/h. For how many minutes does it stop per hour on an average?`,
        answer: m,
        fmt: mins,
        mistakes: [
          { value: 60 - m, why: 'gave the moving minutes per hour', trap: `${mins(60 - m)} is the moving time in each hour; the stoppage is the rest.` },
          { value: clean((T * 60 - (D / s1) * 60)), why: 'gave the total stoppage time for the journey' },
          { value: s1 - s2, why: 'took the speed difference as minutes' },
        ],
        steps: [`Speed including stoppages = ${D} ÷ ${T} = ${s2} km/h`, `Distance lost per hour = ${s1} − ${s2} = ${s1 - s2} km`, `Stoppage per hour = ${s1 - s2} ÷ ${s1} × 60 = ${m} minutes`],
        shortcut: `First find the average speed including stoppages.`,
        trap: `The question asks per hour, not for the whole journey.`,
        tags: ['speed:stoppage'],
        choice: { step: 1 },
      };
    }
    throw new Error('stoppage hard: no numbers found');
  }
  // extreme: stops after every d km
  for (let tries = 0; tries < 400; tries++) {
    const s = rng.pick([40, 45, 48, 50, 60, 72, 75, 80, 90]);
    const d = rng.pick([15, 20, 24, 25, 30, 36, 40, 45, 50, 60]);
    const segs = rng.int(4, 9);
    const D = d * segs;
    const m = rng.pick([5, 6, 8, 10, 12, 15]);
    const travel = (D / s) * 60;
    if (!Number.isInteger(travel)) continue;
    const total = travel + (segs - 1) * m;
    const askAvg = rng.chance(0.4);
    if (askAvg) {
      const avg = (D * 60) / total;
      if (!Number.isInteger(avg)) continue;
      return {
        facts: { form: 'stop-every', ask: 'avg', given: { s, d, m, D } },
        prompt: `A ${v} runs at ${s} km/h and stops for ${m} minutes after every ${d} km. What is its average speed over a journey of ${D} km, including the stops?`,
        answer: avg,
        fmt: kmh,
        mistakes: [
          { value: clean((D * 60) / (travel + segs * m), 1), why: 'counted a stop at the destination', trap: `There are ${segs - 1} stops, not ${segs}: no stop is needed after the last ${d} km.` },
          { value: s, why: 'ignored the stops' },
          { value: clean((s * d) / (d + (s * m) / 60), 1), why: 'used one stop per stretch as a repeating cycle' },
        ],
        steps: [`Running time = ${D} ÷ ${s} h = ${travel} min`, `Stops: ${D} ÷ ${d} = ${segs} stretches → ${segs - 1} stops × ${m} = ${(segs - 1) * m} min`, `Total = ${total} min; average = ${D} ÷ ${fracTex(total, 60)} = ${avg} km/h`],
        shortcut: `n stretches need only n − 1 stops.`,
        trap: `No stop after the final stretch.`,
        tags: ['speed:stoppage'],
        choice: { step: 1 },
      };
    }
    return {
      facts: { form: 'stop-every', ask: 'totalMin', given: { s, d, m, D } },
      prompt: `A ${v} runs at ${s} km/h and stops for ${m} minutes after every ${d} km. How long will it take to cover ${D} km?`,
      answer: total,
      fmt: (x) => hoursMinutes(x),
      mistakes: [
        { value: travel + segs * m, why: 'counted a stop at the destination', trap: `${hoursMinutes(travel + segs * m)} counts ${segs} stops; after the last ${d} km no stop is needed, so there are only ${segs - 1}.` },
        { value: travel, why: 'ignored the stops' },
        { value: travel + (segs - 2) * m, why: 'counted one stop too few' },
      ],
      steps: [`Running time = ${D} ÷ ${s} h = ${hoursMinutes(travel)}`, `${D} ÷ ${d} = ${segs} stretches → ${segs - 1} stops`, `Stoppage = ${segs - 1} × ${m} = ${(segs - 1) * m} min`, `Total = ${hoursMinutes(total)}`],
      shortcut: `Total = D/s + (D/d − 1) × stop time.`,
      trap: `No stop is made at the destination.`,
      tags: ['speed:stoppage'],
      choice: { step: m },
    };
  }
  throw new Error('stoppage: no numbers found');
}
