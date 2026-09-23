/**
 * Trains for quant.speed-distance: crossing a pole, a platform, another train, a moving person.
 * Train speeds are multiples of 18 km/h (or relative speeds are), so every m/s value is a whole number.
 *
 * Facts describe the motion generically for the verifier: the train (length m, speed km/h) crosses a
 * sequence of objects (length m, speed km/h signed: + same direction, − towards the train, 0 static),
 * each crossing taking `time` seconds. Exactly the asked quantity is null.
 */
import type { BuildContext } from '../../types';
import type { Rng } from '../../../../lib/rng';
import type { SpeedFacts, CrossEvent } from '../speed-distance';
import { plain } from '../../../../lib/format';
import { type Draft, clean, kmh, metres, secs, toMsStep, towns } from './kit';

type D = Draft<SpeedFacts>;
type Level = 'easy' | 'medium' | 'hard' | 'extreme';

const TRAIN_KMH = [36, 54, 72, 90, 108];

function trainName(rng: Rng): string {
  const [a, b] = towns(rng, 2);
  return rng.pick(['A train', 'A passenger train', 'A goods train', `The ${a}–${b} express`, 'A local train']);
}

function poleWord(rng: Rng): string {
  return rng.pick(['a signal pole', 'a telegraph post', 'an electric pole', 'a man standing on the platform', 'a lamp post']);
}

function cross(ask: string, train: { len: number | null; speed: number | null }, events: CrossEvent[]): SpeedFacts {
  return { form: 'cross', ask, given: {}, train, events };
}

/** t in [minT, maxT] with vs × t in [minL, maxL]. */
function timeFor(rng: Rng, vs: number, minL: number, maxL: number, minT = 5, maxT = 60): number {
  const lo = Math.max(minT, Math.ceil(minL / vs));
  const hi = Math.min(maxT, Math.floor(maxL / vs));
  if (hi < lo) throw new Error(`timeFor: no time for ${vs} m/s in [${minL}, ${maxL}]`);
  return rng.int(lo, hi);
}

const lengthStep = (L: number) => (L >= 300 ? 20 : 10);

/* ------------------------------ pole ------------------------------ */

export function trainPole(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const name = trainName(rng);
  const pole = poleWord(rng);
  if (level === 'easy' || level === 'medium') {
    const v = rng.pick(TRAIN_KMH);
    const vs = (v * 5) / 18;
    const t = timeFor(rng, vs, 100, 450, 6, 30);
    const L = vs * t;
    const ask = level === 'easy' ? 'length' : rng.pick(['speed', 'time'] as const);
    if (ask === 'length') {
      return {
        facts: cross('trainLen', { len: null, speed: v }, [{ len: 0, speed: 0, time: t }]),
        prompt: `${name} running at ${v} km/h crosses ${pole} in ${t} seconds. What is the length of the train?`,
        answer: L,
        fmt: metres,
        mistakes: [
          { value: v * t, why: 'multiplied km/h by seconds without converting', trap: `${metres(v * t)} uses ${v} km/h with seconds; convert to m/s first (× 5/18).` },
          { value: clean((v * t) / 3), why: 'divided by 3 instead of 3.6' },
        ],
        steps: [toMsStep(v), `Crossing a pole, the train covers only its own length`, `Length = ${plain(vs)} × ${t} = ${plain(L)} m`],
        shortcut: `Length = speed (m/s) × time: ${plain(vs)} × ${t} = ${plain(L)} m.`,
        trap: `Convert km/h to m/s before multiplying by seconds.`,
        tags: ['speed:train-pole', 'trick:5-by-18'],
        choice: { step: lengthStep(L) },
      };
    }
    if (ask === 'speed') {
      return {
        facts: cross('trainSpeed', { len: L, speed: null }, [{ len: 0, speed: 0, time: t }]),
        prompt: `${name} ${plain(L)} m long crosses ${pole} in ${t} seconds. Find the speed of the train in km/h.`,
        answer: v,
        fmt: kmh,
        mistakes: [
          { value: vs, why: 'reported m/s as km/h', trap: `${kmh(vs)} is the speed in m/s; multiply by 18/5 for km/h.` },
          { value: clean((vs * 18) / 5 + 18), why: 'added one extra conversion step' },
        ],
        steps: [`Speed = ${plain(L)} ÷ ${t} = ${plain(vs)} m/s`, `In km/h: ${plain(vs)} × $\\frac{18}{5}$ = ${v} km/h`],
        shortcut: `m/s → km/h: multiply by 3.6.`,
        trap: `L ÷ t gives m/s, not km/h.`,
        tags: ['speed:train-pole', 'trick:5-by-18'],
        choice: { step: 6 },
      };
    }
    return {
      facts: cross('time0', { len: L, speed: v }, [{ len: 0, speed: 0, time: null }]),
      prompt: `How long will ${name.charAt(0).toLowerCase() + name.slice(1)} ${plain(L)} m long, running at ${v} km/h, take to cross ${pole}?`,
      answer: t,
      fmt: secs,
      mistakes: [
        { value: clean(L / v, 2), why: 'divided metres by km/h' },
        { value: clean((L + 100) / vs), why: 'added a platform that is not there' },
      ],
      steps: [toMsStep(v), `Distance = length of the train = ${plain(L)} m`, `Time = ${plain(L)} ÷ ${plain(vs)} = ${t} seconds`],
      shortcut: `Time = length ÷ speed in m/s.`,
      trap: `Use m/s with metres and seconds.`,
      tags: ['speed:train-pole', 'trick:5-by-18'],
      choice: { step: t >= 10 ? 2 : 1 },
    };
  }
  if (level === 'hard') {
    const v = rng.pick([54, 72, 90, 108]);
    const vs = (v * 5) / 18;
    const t1 = timeFor(rng, vs, 120, 400, 6, 25);
    const L = vs * t1;
    const k = timeFor(rng, vs, 150, 600, 6, 40);
    const P = vs * k;
    const t2 = t1 + k;
    const ask = rng.pick(['length', 'speed'] as const);
    const steps = [
      `Extra time taken for the platform = ${t2} − ${t1} = ${k} seconds`,
      `In those ${k} seconds the train covers exactly the platform: speed = ${plain(P)} ÷ ${k} = ${plain(vs)} m/s`,
      ask === 'length' ? `Length = ${plain(vs)} × ${t1} = ${plain(L)} m` : `Speed = ${plain(vs)} × $\\frac{18}{5}$ = ${v} km/h`,
    ];
    const prompt = `${name} crosses ${pole} in ${t1} seconds and a platform ${plain(P)} m long in ${t2} seconds. ${
      ask === 'length' ? 'What is the length of the train?' : 'What is the speed of the train in km/h?'
    }`;
    if (ask === 'length') {
      const platformAlone = clean((P * t1) / t2);
      return {
        facts: cross('trainLen', { len: null, speed: null }, [
          { len: 0, speed: 0, time: t1 },
          { len: P, speed: 0, time: t2 },
        ]),
        prompt,
        answer: L,
        fmt: metres,
        mistakes: [
          { value: L + P, why: 'gave the distance covered while crossing the platform', trap: `${metres(L + P)} is train + platform; the train alone is covered in ${t1} seconds.` },
          { value: platformAlone, why: 'took the speed as platform length ÷ platform time' },
          { value: P, why: 'gave the platform length' },
        ],
        steps,
        shortcut: `The pole-to-platform time difference is spent covering only the platform.`,
        trap: `While crossing the platform the train covers its own length plus the platform.`,
        tags: ['speed:train-platform', 'speed:train-pole'],
        choice: { step: lengthStep(L) },
      };
    }
    const plat = clean(((P / t2) * 18) / 5);
    return {
      facts: cross('trainSpeed', { len: null, speed: null }, [
        { len: 0, speed: 0, time: t1 },
        { len: P, speed: 0, time: t2 },
      ]),
      prompt,
      answer: v,
      fmt: kmh,
      mistakes: [
        { value: plat, why: 'ignored the train length on the platform', trap: `${kmh(plat)} divides only the platform by the full ${t2} seconds; the train also covers its own length then.` },
        { value: vs, why: 'left the speed in m/s' },
        { value: clean(((P / t1) * 18) / 5), why: 'divided the platform by the pole time' },
      ],
      steps,
      shortcut: `Speed = platform ÷ (time difference), then × 18/5.`,
      trap: `The extra ${k} seconds are spent on the platform alone.`,
      tags: ['speed:train-platform', 'speed:train-pole', 'trick:5-by-18'],
      choice: { step: 6 },
    };
  }
  // extreme: speed change
  for (let tries = 0; tries < 200; tries++) {
    const vs = rng.pick([10, 15, 20, 25]);
    const xs = rng.pick([5, 10, 15]);
    const t2 = rng.int(6, 20);
    const t1 = ((vs + xs) * t2) / vs;
    if (!Number.isInteger(t1)) continue;
    const L = vs * t1;
    if (L < 120 || L > 500) continue;
    const v = (vs * 18) / 5;
    const x = (xs * 18) / 5;
    const ask = rng.pick(['length', 'speed'] as const);
    const prompt = `${name} crosses ${pole} in ${t1} seconds. If its speed were ${x} km/h more, it would take only ${t2} seconds to cross it. ${
      ask === 'length' ? 'What is the length of the train?' : 'What is the original speed of the train in km/h?'
    }`;
    const steps = [
      `${x} km/h = ${xs} m/s; the length is the same both times`,
      `v × ${t1} = (v + ${xs}) × ${t2}`,
      `v × ${t1 - t2} = ${xs * t2} → v = ${vs} m/s = ${v} km/h`,
      ...(ask === 'length' ? [`Length = ${vs} × ${t1} = ${L} m`] : []),
    ];
    const facts = cross(ask === 'length' ? 'trainLen' : 'trainSpeed', { len: null, speed: null }, [
      { len: 0, speed: 0, time: t1 },
      { len: 0, speed: 0, time: t2, boost: x },
    ]);
    if (ask === 'length') {
      return {
        facts,
        prompt,
        answer: L,
        fmt: metres,
        mistakes: [
          { value: xs * t2, why: 'used only the extra speed', trap: `${metres(xs * t2)} uses only the ${x} km/h increase; the new speed is v + ${xs} m/s.` },
          { value: (vs + xs) * t1, why: 'applied the higher speed to the longer time' },
          { value: clean(x * t2), why: 'did not convert km/h to m/s' },
        ],
        steps,
        shortcut: `Speed × time is constant (the length): v : (v + ${xs}) = ${t2} : ${t1}.`,
        trap: `Convert the ${x} km/h increase to m/s before using seconds.`,
        tags: ['speed:train-pole', 'trick:inverse-proportion'],
        choice: { step: lengthStep(L) },
      };
    }
    return {
      facts,
      prompt,
      answer: v,
      fmt: kmh,
      mistakes: [
        { value: v + x, why: 'gave the increased speed', trap: `${kmh(v + x)} is the new speed; the question asks for the original speed.` },
        { value: vs, why: 'left the speed in m/s' },
        { value: clean((x * t1) / (t1 - t2)), why: 'used the longer time in the numerator' },
      ],
      steps,
      shortcut: `v : (v + ${x}) = ${t2} : ${t1}, so ${x} km/h ↔ ${t1 - t2} parts and v ↔ ${t2} parts.`,
      trap: `Time and speed are inversely proportional for the same length.`,
      tags: ['speed:train-pole', 'trick:inverse-proportion'],
      choice: { step: 6 },
    };
  }
  throw new Error('trainPole extreme: no numbers found');
}

/* ------------------------------ platform ------------------------------ */

export function trainPlatform(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const name = trainName(rng);
  const what = rng.pick(['platform', 'bridge', 'tunnel'] as const);
  if (level === 'easy' || level === 'medium') {
    const v = rng.pick(TRAIN_KMH);
    const vs = (v * 5) / 18;
    const t = timeFor(rng, vs, 250, 800, 10, 60);
    const total = vs * t;
    const L = Math.round((total * (0.3 + 0.4 * rng.next())) / 10) * 10;
    const P = total - L;
    if (level === 'easy') {
      return {
        facts: cross('time0', { len: L, speed: v }, [{ len: P, speed: 0, time: null }]),
        prompt: `${name} ${L} m long is running at ${v} km/h. How many seconds will it take to cross a ${what} ${plain(P)} m long?`,
        answer: t,
        fmt: secs,
        mistakes: [
          { value: clean(P / vs), why: "ignored the train's own length", trap: `${secs(P / vs)} covers only the ${what}; the train must also clear its own ${L} m.` },
          { value: clean(L / vs), why: `ignored the ${what}` },
          { value: clean(Math.abs(P - L) / vs), why: 'subtracted the lengths' },
        ],
        steps: [toMsStep(v), `Distance = train + ${what} = ${L} + ${plain(P)} = ${plain(total)} m`, `Time = ${plain(total)} ÷ ${plain(vs)} = ${t} seconds`],
        shortcut: `Crossing a ${what}: distance = train length + ${what} length.`,
        trap: `The train has fully crossed only when its last coach leaves the ${what}.`,
        tags: ['speed:train-platform', 'trick:5-by-18'],
        choice: { step: t >= 20 ? 2 : 1 },
      };
    }
    const askPlatform = rng.chance(0.5);
    const covered = total;
    if (askPlatform) {
      return {
        facts: cross('objLen0', { len: L, speed: v }, [{ len: null, speed: 0, time: t }]),
        prompt: `${name} ${L} m long, running at ${v} km/h, crosses a ${what} in ${t} seconds. What is the length of the ${what}?`,
        answer: P,
        fmt: metres,
        mistakes: [
          { value: covered, why: "forgot to subtract the train's length", trap: `${metres(covered)} is train + ${what}; subtract the train's ${L} m.` },
          { value: covered + L, why: 'added the train length instead of subtracting' },
          { value: clean(v * t - L), why: 'did not convert km/h to m/s' },
        ],
        steps: [toMsStep(v), `Distance in ${t} s = ${plain(vs)} × ${t} = ${plain(covered)} m`, `${what.charAt(0).toUpperCase() + what.slice(1)} = ${plain(covered)} − ${L} = ${plain(P)} m`],
        shortcut: `Distance covered = train + ${what}; subtract the train.`,
        trap: `The distance covered includes the train's own length.`,
        tags: ['speed:train-platform', 'trick:5-by-18'],
        choice: { step: lengthStep(P) },
      };
    }
    return {
      facts: cross('trainLen', { len: null, speed: v }, [{ len: P, speed: 0, time: t }]),
      prompt: `${name} running at ${v} km/h crosses a ${what} ${plain(P)} m long in ${t} seconds. What is the length of the train?`,
      answer: L,
      fmt: metres,
      mistakes: [
        { value: covered, why: `forgot to subtract the ${what}`, trap: `${metres(covered)} is train + ${what}; subtract the ${plain(P)} m ${what}.` },
        { value: covered + P, why: `added the ${what} instead of subtracting` },
        { value: clean(v * t - P), why: 'did not convert km/h to m/s' },
      ],
      steps: [toMsStep(v), `Distance in ${t} s = ${plain(vs)} × ${t} = ${plain(covered)} m`, `Train = ${plain(covered)} − ${plain(P)} = ${L} m`],
      shortcut: `Distance covered = train + ${what}; subtract the ${what}.`,
      trap: `The distance covered includes the ${what}.`,
      tags: ['speed:train-platform', 'trick:5-by-18'],
      choice: { step: lengthStep(L) },
    };
  }
  if (level === 'hard') {
    if (rng.chance(0.5)) {
      // two platforms
      for (let tries = 0; tries < 200; tries++) {
        const v = rng.pick([54, 72, 90, 108]);
        const vs = (v * 5) / 18;
        const L = rng.int(10, 40) * 10;
        const t1 = rng.int(12, 40);
        const t2 = t1 + rng.int(4, 20);
        const P1 = vs * t1 - L;
        const P2 = vs * t2 - L;
        if (P1 < 100 || P2 > 900) continue;
        const ask = rng.pick(['length', 'speed'] as const);
        const steps = [
          `The longer ${what} is ${plain(P2 - P1)} m longer and takes ${t2 - t1} s more → speed = ${plain(P2 - P1)} ÷ ${t2 - t1} = ${plain(vs)} m/s`,
          `In ${t1} s the train covers ${plain(vs * t1)} m = train + ${plain(P1)} m`,
          ask === 'length' ? `Train = ${plain(vs * t1)} − ${plain(P1)} = ${L} m` : `Speed = ${plain(vs)} × $\\frac{18}{5}$ = ${v} km/h`,
        ];
        const facts = cross(ask === 'length' ? 'trainLen' : 'trainSpeed', { len: null, speed: null }, [
          { len: P1, speed: 0, time: t1 },
          { len: P2, speed: 0, time: t2 },
        ]);
        const prompt = `${name} crosses a ${what} ${plain(P1)} m long in ${t1} seconds and another ${what} ${plain(P2)} m long in ${t2} seconds. ${
          ask === 'length' ? 'What is the length of the train?' : 'What is the speed of the train in km/h?'
        }`;
        if (ask === 'length') {
          return {
            facts,
            prompt,
            answer: L,
            fmt: metres,
            mistakes: [
              { value: vs * t1, why: `forgot to subtract the ${what}`, trap: `${metres(vs * t1)} is train + first ${what}.` },
              { value: P2 - P1, why: `gave the difference of the ${what}s` },
              { value: clean(vs * t2 - P1), why: 'mixed up the two crossings' },
            ],
            steps,
            shortcut: `Difference of lengths ÷ difference of times = speed.`,
            trap: `Each crossing covers the train plus that ${what}.`,
            tags: ['speed:train-platform'],
            choice: { step: lengthStep(L) },
          };
        }
        return {
          facts,
          prompt,
          answer: v,
          fmt: kmh,
          mistakes: [
            { value: clean(((P1 / t1) * 18) / 5), why: 'ignored the train length', trap: `Dividing the ${what} length by the time ignores the train's own length.` },
            { value: vs, why: 'left the speed in m/s' },
            { value: clean((((P1 + P2) / (t1 + t2)) * 18) / 5), why: 'averaged the two crossings' },
          ],
          steps,
          shortcut: `Speed = (${plain(P2)} − ${plain(P1)}) ÷ (${t2} − ${t1}) m/s.`,
          trap: `Only the difference cancels out the unknown train length.`,
          tags: ['speed:train-platform', 'trick:5-by-18'],
          choice: { step: 6 },
        };
      }
    }
    // platform k times the train
    const k = rng.pick([2, 3, 1.5]);
    for (let tries = 0; tries < 200; tries++) {
      const v = rng.pick([54, 72, 90, 108]);
      const vs = (v * 5) / 18;
      const t = rng.int(15, 60);
      const L = (vs * t) / (1 + k);
      const P = k * L;
      if (!Number.isInteger(L / 5) || !Number.isInteger(P) || L < 100 || L > 400) continue;
      const kText = k === 1.5 ? 'one and a half times' : k === 2 ? 'twice' : 'three times';
      return {
        facts: cross('objLen0', { len: null, speed: v }, [{ len: null, lenFactor: k, speed: 0, time: t }]),
        prompt: `${name} running at ${v} km/h crosses a platform ${kText} its own length in ${t} seconds. What is the length of the platform?`,
        answer: P,
        fmt: metres,
        mistakes: [
          { value: L, why: 'gave the train length', trap: `${metres(L)} is the train; the platform is ${kText} that.` },
          { value: vs * t, why: 'gave the whole distance covered' },
          { value: clean((vs * t * k) / (2 + k)), why: 'split the distance in the wrong ratio' },
          { value: clean((vs * t) / 2), why: 'split the distance equally' },
        ],
        steps: [toMsStep(v), `Distance = ${plain(vs)} × ${t} = ${plain(vs * t)} m = train + platform = ${plain(1 + k)} × train`, `Train = ${plain(L)} m, platform = ${plain(k)} × ${plain(L)} = ${plain(P)} m`],
        shortcut: `Train : platform = 1 : ${plain(k)}, so the platform is ${plain(k)}/${plain(1 + k)} of the distance covered.`,
        trap: `The distance covered is train + platform together.`,
        tags: ['speed:train-platform'],
        choice: { step: lengthStep(P) },
      };
    }
    throw new Error('trainPlatform hard: no numbers found');
  }
  // extreme: speed increases, two different platforms
  for (let tries = 0; tries < 400; tries++) {
    const vs = rng.pick([10, 15, 20]);
    const xs = rng.pick([5, 10]);
    const L = rng.int(12, 36) * 10;
    const t1 = rng.int(15, 40);
    const t2 = rng.int(10, 30);
    const P1 = vs * t1 - L;
    const P2 = (vs + xs) * t2 - L;
    if (P1 < 100 || P2 < 100 || P1 > 700 || P2 > 900 || P1 === P2 || t1 === t2) continue;
    const v = (vs * 18) / 5;
    const x = (xs * 18) / 5;
    const ask = rng.pick(['length', 'speed'] as const);
    const facts = cross(ask === 'length' ? 'trainLen' : 'trainSpeed', { len: null, speed: null }, [
      { len: P1, speed: 0, time: t1 },
      { len: P2, speed: 0, time: t2, boost: x },
    ]);
    const prompt = `${name} crosses a ${plain(P1)} m long platform in ${t1} seconds. When its speed is increased by ${x} km/h, it crosses a ${plain(P2)} m long platform in ${t2} seconds. ${
      ask === 'length' ? 'What is the length of the train?' : 'What was its original speed in km/h?'
    }`;
    const steps = [
      `Let the train be L m and its speed v m/s; ${x} km/h = ${xs} m/s`,
      `L + ${plain(P1)} = ${t1}v and L + ${plain(P2)} = ${t2}(v + ${xs})`,
      `Subtract: ${plain(P2 - P1)} = ${t2 - t1}v + ${xs * t2} → v = ${vs} m/s = ${v} km/h`,
      `L = ${t1} × ${vs} − ${plain(P1)} = ${L} m`,
    ];
    if (ask === 'length') {
      return {
        facts,
        prompt,
        answer: L,
        fmt: metres,
        mistakes: [
          { value: vs * t1, why: 'forgot to subtract the platform', trap: `${metres(vs * t1)} is train + first platform.` },
          { value: (vs + xs) * t2, why: 'forgot to subtract the second platform' },
          { value: clean(Math.abs(L - xs * t2)), why: 'dropped the speed increase in one equation' },
        ],
        steps,
        shortcut: `Write both crossings as length + platform = speed × time and subtract to remove L.`,
        trap: `The second crossing is at the increased speed.`,
        tags: ['speed:train-platform', 'trick:5-by-18'],
        choice: { step: lengthStep(L) },
      };
    }
    return {
      facts,
      prompt,
      answer: v,
      fmt: kmh,
      mistakes: [
        { value: v + x, why: 'gave the increased speed', trap: `${kmh(v + x)} is the speed after the increase.` },
        { value: vs, why: 'left the speed in m/s' },
        { value: clean((((P2 - P1) / (t2 - t1 || 1)) * 18) / 5), why: 'ignored the speed change' },
      ],
      steps,
      shortcut: `Two linear equations in L and v; subtract to eliminate L.`,
      trap: `The two crossings are at different speeds.`,
      tags: ['speed:train-platform', 'trick:5-by-18'],
      choice: { step: 6 },
    };
  }
  throw new Error('trainPlatform extreme: no numbers found');
}

/* ------------------------------ two trains ------------------------------ */

function splitSpeeds(rng: Rng, total: number): [number, number] {
  const opts: [number, number][] = [];
  for (let a = 30; a <= total - 30; a += 6) {
    const b = total - a;
    if (a > b && b >= 30) opts.push([a, b]);
  }
  return rng.pick(opts);
}

export function trainTrains(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  if (level === 'easy' || level === 'medium') {
    const opposite = level === 'easy';
    let v1: number;
    let v2: number;
    let rel: number;
    if (opposite) {
      rel = rng.pick([72, 90, 108, 126, 144]);
      [v1, v2] = splitSpeeds(rng, rel);
    } else {
      rel = rng.pick([18, 36, 54]);
      v1 = rng.int(Math.ceil((rel + 36) / 6), 20) * 6;
      v2 = v1 - rel;
    }
    const rs = (rel * 5) / 18;
    const t = timeFor(rng, rs, 220, 700, 6, 90);
    const S = rs * t;
    const L1 = Math.round((S * (0.35 + 0.3 * rng.next())) / 10) * 10;
    const L2 = S - L1;
    const other = opposite ? v1 - v2 : v1 + v2;
    const wrongRel = clean(S / ((other * 5) / 18));
    return {
      facts: cross('time0', { len: L1, speed: v1 }, [{ len: L2, speed: opposite ? -v2 : v2, time: null }]),
      prompt: opposite
        ? `Two trains ${L1} m and ${plain(L2)} m long are running on parallel tracks in opposite directions at ${v1} km/h and ${v2} km/h respectively. In how many seconds will they cross each other completely?`
        : `Two trains ${L1} m and ${plain(L2)} m long are running on parallel tracks in the same direction at ${v1} km/h and ${v2} km/h respectively. How many seconds will the faster train take to pass the slower one completely?`,
      answer: t,
      fmt: secs,
      mistakes: [
        {
          value: wrongRel,
          why: opposite ? 'subtracted the speeds' : 'added the speeds for the same direction',
          trap: opposite
            ? `${secs(wrongRel)} subtracts the speeds; trains moving towards each other close the gap at ${v1} + ${v2} km/h.`
            : `${secs(wrongRel)} adds the speeds; in the same direction the faster train gains only ${v1} − ${v2} = ${rel} km/h.`,
        },
        { value: clean(L1 / rs), why: "used only one train's length" },
        { value: clean(S / ((v1 * 5) / 18)), why: "ignored the other train's speed" },
      ],
      steps: [
        `${opposite ? 'Opposite' : 'Same'} directions → relative speed = ${v1} ${opposite ? '+' : '−'} ${v2} = ${rel} km/h = ${plain(rs)} m/s`,
        `Distance = sum of lengths = ${L1} + ${plain(L2)} = ${plain(S)} m`,
        `Time = ${plain(S)} ÷ ${plain(rs)} = ${t} seconds`,
      ],
      shortcut: `Crossing another train: distance = L₁ + L₂, speed = relative speed (${opposite ? 'add' : 'subtract'}).`,
      trap: opposite ? `Towards each other → add the speeds.` : `Same direction → subtract the speeds.`,
      tags: ['speed:train-train', opposite ? 'speed:opposite-direction' : 'speed:same-direction', 'trick:relative-speed'],
      choice: { step: t >= 20 ? 2 : 1 },
    };
  }
  if (level === 'hard') {
    const opposite = rng.chance(0.5);
    let v1: number;
    let v2: number;
    let rel: number;
    if (opposite) {
      rel = rng.pick([90, 108, 126, 144]);
      [v1, v2] = splitSpeeds(rng, rel);
    } else {
      rel = rng.pick([18, 36, 54]);
      v1 = rng.int(Math.ceil((rel + 36) / 6), 20) * 6;
      v2 = v1 - rel;
    }
    const rs = (rel * 5) / 18;
    const t = timeFor(rng, rs, 250, 700, 8, 90);
    const S = rs * t;
    const L1 = Math.round((S * (0.35 + 0.3 * rng.next())) / 10) * 10;
    const L2 = S - L1;
    const dirText = opposite ? 'in the opposite direction' : 'in the same direction';
    if (rng.chance(0.5)) {
      const other = opposite ? v1 - v2 : v1 + v2;
      const wrong = clean((other * 5 * t) / 18 - L1);
      return {
        facts: cross('objLen0', { len: L1, speed: v1 }, [{ len: null, speed: opposite ? -v2 : v2, time: t }]),
        prompt: `A train ${L1} m long running at ${v1} km/h ${opposite ? 'crosses' : 'overtakes'} another train running at ${v2} km/h ${dirText} in ${t} seconds. What is the length of the other train?`,
        answer: L2,
        fmt: metres,
        mistakes: [
          { value: S, why: "forgot to subtract the first train's length", trap: `${metres(S)} is the total of both lengths; subtract ${L1} m.` },
          { value: wrong, why: opposite ? 'subtracted the speeds' : 'added the speeds', trap: opposite ? `Opposite directions: add the speeds.` : `Same direction: subtract the speeds.` },
          { value: clean((v1 * 5 * t) / 18 - L1), why: "ignored the other train's speed" },
        ],
        steps: [`Relative speed = ${v1} ${opposite ? '+' : '−'} ${v2} = ${rel} km/h = ${plain(rs)} m/s`, `Distance in ${t} s = ${plain(rs)} × ${t} = ${plain(S)} m = L₁ + L₂`, `L₂ = ${plain(S)} − ${L1} = ${plain(L2)} m`],
        shortcut: `L₁ + L₂ = relative speed × time.`,
        trap: `Use the relative speed and both lengths.`,
        tags: ['speed:train-train', 'trick:relative-speed'],
        choice: { step: lengthStep(L2) },
      };
    }
    // find the other train's speed (the second train is the slower one when same direction)
    const wrongDir = opposite ? v1 - rel : v1 + rel;
    return {
      facts: cross('objSpeed0', { len: L1, speed: v1 }, [{ len: L2, speed: null, time: t, speedSign: opposite ? -1 : 1 }]),
      prompt: `A train ${L1} m long running at ${v1} km/h ${opposite ? 'crosses' : 'overtakes'} another train ${plain(L2)} m long, running ${dirText}, in ${t} seconds. What is the speed of the other train in km/h?`,
      answer: v2,
      fmt: kmh,
      mistakes: [
        { value: rel, why: 'gave the relative speed', trap: opposite ? `${kmh(rel)} is the relative speed; subtract ${v1} km/h from it.` : `${kmh(rel)} is the relative speed; subtract it from ${v1} km/h.` },
        { value: wrongDir > 0 ? wrongDir : NaN, why: opposite ? 'treated it as the same direction' : 'treated it as opposite directions' },
        { value: rs, why: 'left the relative speed in m/s' },
      ],
      steps: [
        `Relative speed = (${L1} + ${plain(L2)}) ÷ ${t} = ${plain(rs)} m/s = ${rel} km/h`,
        opposite ? `Opposite directions: ${v1} + v = ${rel} → v = ${v2} km/h` : `Same direction: ${v1} − v = ${rel} → v = ${v2} km/h`,
      ],
      shortcut: `Find the relative speed from the lengths and time first.`,
      trap: `Relative speed is a sum (opposite) or a difference (same direction).`,
      tags: ['speed:train-train', 'trick:relative-speed'],
      choice: { step: 6 },
    };
  }
  // extreme: crossing times in both directions → speeds
  for (let tries = 0; tries < 400; tries++) {
    const p = rng.int(6, 14);
    const q = rng.int(1, p - 2);
    const v1 = 9 * (p + q);
    const v2 = 9 * (p - q);
    if (v2 < 30 || v1 > 150) continue;
    const l = (5 * p * q) / gcdNum(p, q);
    const S = l * rng.int(1, 8);
    if (S < 200 || S > 700) continue;
    const t1 = S / (5 * p);
    const t2 = S / (5 * q);
    if (t2 > 150) continue;
    const L1 = Math.round((S * (0.35 + 0.3 * rng.next())) / 10) * 10;
    const L2 = S - L1;
    if (L2 < 80) continue;
    const askFast = rng.chance(0.5);
    const facts: SpeedFacts = {
      form: 'cross-both',
      ask: askFast ? 'faster' : 'slower',
      given: { L1, L2, tOpp: t1, tSame: t2 },
    };
    return {
      facts,
      prompt: `Two trains ${L1} m and ${plain(L2)} m long cross each other completely in ${t1} seconds when running in opposite directions, and the faster one takes ${t2} seconds to pass the slower one when running in the same direction. What is the speed of the ${askFast ? 'faster' : 'slower'} train in km/h?`,
      answer: askFast ? v1 : v2,
      fmt: kmh,
      mistakes: [
        { value: v1 + v2, why: 'gave the sum of the speeds', trap: `${kmh(v1 + v2)} is the sum of the speeds (from the opposite-direction crossing).` },
        { value: askFast ? v2 : v1, why: 'gave the other train' },
        { value: v1 - v2, why: 'gave the difference of the speeds' },
        { value: clean((S / t1 + S / t2) / 2), why: 'left the answer in m/s' },
      ],
      steps: [
        `Distance each time = ${L1} + ${plain(L2)} = ${S} m`,
        `Opposite: sum of speeds = ${S} ÷ ${t1} = ${plain(S / t1)} m/s = ${v1 + v2} km/h`,
        `Same direction: difference = ${S} ÷ ${t2} = ${plain(S / t2)} m/s = ${v1 - v2} km/h`,
        `Faster = (${v1 + v2} + ${v1 - v2}) ÷ 2 = ${v1} km/h; slower = ${v2} km/h`,
      ],
      shortcut: `Sum and difference of speeds → faster = (sum + difference)/2, slower = (sum − difference)/2.`,
      trap: `The opposite-direction time gives the sum of the speeds, not either speed.`,
      tags: ['speed:train-train', 'trick:relative-speed'],
      choice: { step: 9 },
    };
  }
  throw new Error('trainTrains extreme: no numbers found');
}

function gcdNum(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/* ------------------------------ moving person ------------------------------ */

export function trainMan(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const name = trainName(rng);
  if (level !== 'extreme') {
    const same = level === 'easy' ? true : level === 'medium' ? false : rng.chance(0.5);
    const w = rng.pick(same ? [3, 4, 5, 6, 9, 12] : [3, 4, 5, 6, 8, 9]);
    const rel = rng.pick(same ? [36, 54, 72] : [54, 72, 90]);
    const v = same ? rel + w : rel - w;
    const rs = (rel * 5) / 18;
    const t = timeFor(rng, rs, 100, 400, 6, 40);
    const L = rs * t;
    const who = w >= 12 ? 'a cyclist riding' : 'a man walking';
    const dir = same ? 'in the same direction as the train' : 'in the direction opposite to the train';
    if (level === 'easy' || (level === 'medium' && rng.chance(0.5))) {
      const wrong = same ? v + w : v - w;
      const wrongT = clean((L * 18) / (5 * wrong));
      return {
        facts: cross('time0', { len: L, speed: v }, [{ len: 0, speed: same ? w : -w, time: null }]),
        prompt: `${name} ${plain(L)} m long is running at ${v} km/h. In how many seconds will it pass ${who} at ${w} km/h ${dir}?`,
        answer: t,
        fmt: secs,
        mistakes: [
          { value: wrongT, why: same ? 'added the speeds' : 'subtracted the speeds', trap: same ? `${secs(wrongT)} adds the speeds, but the man moves the same way as the train.` : `${secs(wrongT)} subtracts the speeds, but they move towards each other.` },
          { value: clean((L * 18) / (5 * v)), why: "ignored the man's speed" },
        ],
        steps: [`Relative speed = ${v} ${same ? '−' : '+'} ${w} = ${rel} km/h = ${plain(rs)} m/s`, `Distance = length of the train = ${plain(L)} m`, `Time = ${plain(L)} ÷ ${plain(rs)} = ${t} seconds`],
        shortcut: `Passing a person: distance = train length; speed = relative speed.`,
        trap: same ? `Same direction → subtract the speeds.` : `Opposite directions → add the speeds.`,
        tags: ['speed:train-man', 'trick:relative-speed'],
        choice: { step: t >= 20 ? 2 : 1 },
      };
    }
    if (level === 'medium') {
      const wrong = same ? v + w : v - w;
      const wrongL = clean(((wrong * 5) / 18) * t);
      return {
        facts: cross('trainLen', { len: null, speed: v }, [{ len: 0, speed: same ? w : -w, time: t }]),
        prompt: `${name} running at ${v} km/h passes ${who} at ${w} km/h ${dir} in ${t} seconds. What is the length of the train?`,
        answer: L,
        fmt: metres,
        mistakes: [
          { value: wrongL, why: same ? 'added the speeds' : 'subtracted the speeds', trap: `Relative speed is ${v} ${same ? '−' : '+'} ${w} = ${rel} km/h here.` },
          { value: clean(((v * 5) / 18) * t), why: "ignored the man's speed" },
          { value: rel * t, why: 'did not convert to m/s' },
        ],
        steps: [`Relative speed = ${v} ${same ? '−' : '+'} ${w} = ${rel} km/h = ${plain(rs)} m/s`, `Length = ${plain(rs)} × ${t} = ${plain(L)} m`],
        shortcut: `Length = relative speed (m/s) × time.`,
        trap: `Use the relative speed.`,
        tags: ['speed:train-man', 'trick:relative-speed'],
        choice: { step: lengthStep(L) },
      };
    }
    // hard: find the man's speed
    return {
      facts: cross('objSpeed0', { len: L, speed: v }, [{ len: 0, speed: null, time: t, speedSign: same ? 1 : -1 }]),
      prompt: `${name} ${plain(L)} m long, running at ${v} km/h, passes a man ${same ? 'walking in the same direction' : 'walking towards it'} in ${t} seconds. What is the speed of the man in km/h?`,
      answer: w,
      fmt: kmh,
      mistakes: [
        { value: rel, why: 'gave the relative speed', trap: `${kmh(rel)} is the relative speed; the man's speed is ${same ? `${v} − ${rel}` : `${rel} − ${v}`}.` },
        { value: v - rs > 0 ? clean(v - rs) : NaN, why: 'subtracted m/s from km/h' },
        { value: clean(rs), why: 'left the relative speed in m/s' },
      ],
      steps: [`Relative speed = ${plain(L)} ÷ ${t} = ${plain(rs)} m/s = ${rel} km/h`, same ? `Same direction: ${v} − (man) = ${rel} → man = ${w} km/h` : `Opposite: ${v} + (man) = ${rel} → man = ${w} km/h`],
      shortcut: `Relative speed from length ÷ time, then remove the train's speed.`,
      trap: `Convert the relative speed to km/h before comparing with ${v} km/h.`,
      tags: ['speed:train-man', 'trick:relative-speed'],
      choice: { step: 1 },
    };
  }
  // extreme: two people in the same direction
  for (let tries = 0; tries < 500; tries++) {
    const a = rng.pick([2, 3, 4]);
    const rel1 = 18 * a;
    const w1 = rng.pick([3, 4, 5, 6]);
    const dw = rng.pick([2, 3, 4, 6, 9]);
    const w2 = w1 + dw;
    const v = rel1 + w1;
    const rel2 = rel1 - dw;
    const t1 = rng.int(6, 24);
    const L = 5 * a * t1;
    const t2 = (18 * L) / (5 * rel2);
    if (!Number.isInteger(t2) || L < 100 || L > 400) continue;
    const askLen = rng.chance(0.5);
    const facts = cross(askLen ? 'trainLen' : 'trainSpeed', { len: null, speed: null }, [
      { len: 0, speed: w1, time: t1 },
      { len: 0, speed: w2, time: t2 },
    ]);
    const prompt = `${name} passes two men walking in the same direction as the train, at ${w1} km/h and ${w2} km/h, in ${t1} seconds and ${t2} seconds respectively. ${
      askLen ? 'What is the length of the train?' : 'What is the speed of the train in km/h?'
    }`;
    const steps = [
      `Let the train's speed be v km/h. Length = (v − ${w1}) × $\\frac{5}{18}$ × ${t1} = (v − ${w2}) × $\\frac{5}{18}$ × ${t2}`,
      `${t1}(v − ${w1}) = ${t2}(v − ${w2}) → ${t2 - t1}v = ${t2 * w2 - t1 * w1} → v = ${v} km/h`,
      `Length = (${v} − ${w1}) × $\\frac{5}{18}$ × ${t1} = ${plain((rel1 * 5) / 18)} × ${t1} = ${L} m`,
    ];
    if (askLen) {
      return {
        facts,
        prompt,
        answer: L,
        fmt: metres,
        mistakes: [
          { value: clean(((v * 5) / 18) * t1), why: "ignored the men's speeds", trap: `The train passes each man at the relative speed, not at its own speed.` },
          { value: clean((((v + w1) * 5) / 18) * t1), why: 'added the speeds' },
          { value: rel1 * t1, why: 'did not convert to m/s' },
        ],
        steps,
        shortcut: `Equate the two expressions for the length; the train speed comes out first.`,
        trap: `Same direction → subtract each man's speed.`,
        tags: ['speed:train-man', 'trick:relative-speed'],
        choice: { step: lengthStep(L) },
      };
    }
    return {
      facts,
      prompt,
      answer: v,
      fmt: kmh,
      mistakes: [
        { value: rel1, why: 'gave the relative speed', trap: `${kmh(rel1)} is the speed relative to the first man; add his ${w1} km/h.` },
        { value: clean((t2 * w2 + t1 * w1) / (t2 - t1)), why: 'added the men’s terms' },
        { value: v + w1, why: 'added the man’s speed twice' },
      ],
      steps,
      shortcut: `t₁(v − w₁) = t₂(v − w₂): solve for v.`,
      trap: `Each crossing uses the relative speed with that man.`,
      tags: ['speed:train-man', 'trick:relative-speed'],
      choice: { step: 3 },
    };
  }
  throw new Error('trainMan extreme: no numbers found');
}
