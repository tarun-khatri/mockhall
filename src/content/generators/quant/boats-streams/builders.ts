/**
 * quant.boats-streams builders. Downstream = B + S, upstream = B − S; numbers are chosen so every time is
 * a whole number (or a simple fraction) of hours.
 */
import type { BuildContext } from '../../types';
import type { BoatFacts } from '../boats-streams';
import { fracTex, plain } from '../../../../lib/format';
import { type Draft, clean, cleanFrac, count, hours, lcmN, num, boat, river } from './kit';

type D = Draft<BoatFacts>;
type Level = 'easy' | 'medium' | 'hard' | 'extreme';

const kmh = count('km/h');
const km = count('km');

/** Random boat speed B and stream speed S with B > S + 2. */
function speeds(ctx: BuildContext, minB = 6, maxB = 30): [number, number] {
  const { rng } = ctx;
  for (;;) {
    const B = rng.int(minB, maxB);
    const S = rng.int(1, Math.min(8, B - 3));
    if (B - S >= 3) return [B, S];
  }
}

export function downUp(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const bt = boat(rng);
  const on = river(rng);
  for (let tries = 0; tries < 600; tries++) {
    if (level === 'easy' || level === 'medium') {
      const [B, S] = speeds(ctx);
      const down = level === 'easy';
      const v = down ? B + S : B - S;
      const t = rng.int(2, 8);
      const d = v * t;
      const wrong = down ? B - S : B + S;
      return {
        facts: { form: 'leg-time', ask: 'time', given: { B, S, d, dir: down ? 1 : -1 } },
        prompt: `${bt.who} whose speed in still water is ${B} km/h ${bt.verb} ${d} km ${down ? 'downstream' : 'upstream'} on ${on}. If the stream flows at ${S} km/h, how long does the trip take?`,
        answer: t,
        fmt: hours,
        mistakes: [
          { value: cleanFrac(d / wrong, 4), why: down ? 'subtracted the stream speed' : 'added the stream speed', trap: down ? `Downstream the current helps: speed = ${B} + ${S} = ${B + S} km/h.` : `Upstream the current opposes: speed = ${B} − ${S} = ${B - S} km/h, not ${B + S}.` },
          { value: cleanFrac(d / B, 4), why: 'ignored the stream' },
          { value: cleanFrac(d / S, 4), why: 'used the stream speed alone' },
        ],
        steps: [`${down ? 'Downstream' : 'Upstream'} speed = ${B} ${down ? '+' : '−'} ${S} = ${v} km/h`, `Time = ${d} ÷ ${v} = ${t} hours`],
        shortcut: `Downstream = B + S, upstream = B − S.`,
        trap: down ? `Downstream → add the stream.` : `Upstream → subtract the stream.`,
        tags: ['boats:downstream-upstream'],
        choice: { step: 1 },
      };
    }
    if (level === 'hard') {
      const [B, S] = speeds(ctx);
      const t1 = rng.int(2, 6);
      const d1 = (B + S) * t1;
      const t2 = rng.int(2, 8);
      const d2 = (B - S) * t2;
      return {
        facts: { form: 'down-then-up', ask: 'time', given: { d1, t1, S, d2 } },
        prompt: `${bt.who} covers ${d1} km downstream on ${on} in ${hours(t1)}. If the stream flows at ${S} km/h, how long will it take to cover ${d2} km upstream?`,
        answer: t2,
        fmt: hours,
        mistakes: [
          { value: cleanFrac(d2 / (B + S), 4), why: 'used the downstream speed upstream', trap: `${d1} ÷ ${t1} = ${B + S} km/h is the downstream speed; upstream is ${B + S} − 2 × ${S} = ${B - S} km/h.` },
          { value: cleanFrac(d2 / B, 4), why: 'used the still-water speed' },
          { value: B - 2 * S > 0 ? cleanFrac(d2 / (B - 2 * S), 4) : NaN, why: 'subtracted the stream twice from the still-water speed' },
        ],
        steps: [`Downstream speed = ${d1} ÷ ${t1} = ${B + S} km/h`, `Still-water speed = ${B + S} − ${S} = ${B} km/h`, `Upstream speed = ${B} − ${S} = ${B - S} km/h`, `Time = ${d2} ÷ ${B - S} = ${t2} hours`],
        shortcut: `Upstream speed = downstream speed − 2 × stream speed.`,
        trap: `Downstream and upstream speeds differ by twice the stream speed.`,
        tags: ['boats:downstream-upstream'],
        choice: { step: 1 },
      };
    }
    // extreme: same time for d1 downstream and d2 upstream → boat speed
    const [B, S] = speeds(ctx, 8, 30);
    const t = rng.int(1, 6);
    const d1 = (B + S) * t;
    const d2 = (B - S) * t;
    const noHalf = clean((S * (d1 + d2)) / (d1 - d2) / 2);
    return {
      facts: { form: 'equal-time', ask: 'B', given: { d1, d2, S } },
      prompt: `${bt.who} takes the same time to go ${d1} km downstream as to go ${d2} km upstream on ${on}. If the stream flows at ${S} km/h, what is the speed of the boat in still water?`,
      answer: B,
      fmt: kmh,
      mistakes: [
        { value: B + S, why: 'gave the downstream speed', trap: `${kmh(B + S)} is the downstream speed; remove the stream.` },
        { value: noHalf, why: 'halved the result' },
        { value: clean((S * d1) / d2), why: 'scaled the stream speed by the distance ratio' },
      ],
      steps: [`Same time → speeds are in the ratio of distances: (B + ${S}) : (B − ${S}) = ${d1} : ${d2}`, `${d2}(B + ${S}) = ${d1}(B − ${S}) → ${d1 - d2}B = ${S * (d1 + d2)}`, `B = ${B} km/h`],
      shortcut: `B : S = (${d1} + ${d2}) : (${d1} − ${d2}).`,
      trap: `Equal times make the speed ratio equal the distance ratio.`,
      tags: ['boats:downstream-upstream'],
      choice: { step: 1 },
    };
  }
  throw new Error('downUp: no numbers found');
}

export function stillWater(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const bt = boat(rng);
  const on = river(rng);
  for (let tries = 0; tries < 600; tries++) {
    const [B, S] = speeds(ctx);
    const askB = rng.chance(0.5);
    const ans = askB ? B : S;
    const other = askB ? S : B;
    const label = askB ? 'the speed of the boat in still water' : 'the speed of the stream';
    const trapBS = askB ? `${kmh(other)} is the stream speed, half the difference.` : `${kmh(other)} is the boat's speed, half the sum.`;
    if (level === 'easy') {
      const Dn = B + S;
      const Up = B - S;
      return {
        facts: { form: 'du-speeds', ask: askB ? 'B' : 'S', given: { D: Dn, U: Up } },
        prompt: `${bt.who}'s speed downstream on ${on} is ${Dn} km/h and upstream is ${Up} km/h. Find ${label}.`,
        answer: ans,
        fmt: kmh,
        mistakes: [
          { value: other, why: askB ? 'found the stream speed' : 'found the boat speed', trap: trapBS },
          { value: askB ? Dn - Up : Dn + Up, why: 'forgot to halve' },
          { value: askB ? clean((Dn + Up) / 4, 1) : clean((Dn - Up) / 4, 1), why: 'divided by 4' },
        ],
        steps: askB ? [`Boat speed = (downstream + upstream) ÷ 2`, `= (${Dn} + ${Up}) ÷ 2 = ${B} km/h`] : [`Stream speed = (downstream − upstream) ÷ 2`, `= (${Dn} − ${Up}) ÷ 2 = ${S} km/h`],
        shortcut: `B = (D + U)/2, S = (D − U)/2.`,
        trap: `Half the sum is the boat, half the difference is the stream.`,
        tags: ['boats:still-water'],
        choice: { step: 1 },
      };
    }
    if (level === 'medium') {
      const t1 = rng.int(2, 6);
      const t2 = rng.int(2, 6);
      const d1 = (B + S) * t1;
      const d2 = (B - S) * t2;
      return {
        facts: { form: 'du-trips', ask: askB ? 'B' : 'S', given: { d1, t1, d2, t2 } },
        prompt: `${bt.who} ${bt.verb} ${d1} km downstream on ${on} in ${hours(t1)} and ${d2} km upstream in ${hours(t2)}. Find ${label}.`,
        answer: ans,
        fmt: kmh,
        mistakes: [
          { value: other, why: askB ? 'found the stream speed' : 'found the boat speed', trap: trapBS },
          { value: clean((d1 + d2) / (t1 + t2), 1), why: 'divided total distance by total time' },
          { value: askB ? B + S : B - S, why: askB ? 'gave the downstream speed' : 'gave the upstream speed' },
        ],
        steps: [`Downstream = ${d1} ÷ ${t1} = ${B + S} km/h; upstream = ${d2} ÷ ${t2} = ${B - S} km/h`, askB ? `Boat = (${B + S} + ${B - S}) ÷ 2 = ${B} km/h` : `Stream = (${B + S} − ${B - S}) ÷ 2 = ${S} km/h`],
        shortcut: `Find D and U first, then (D + U)/2 or (D − U)/2.`,
        trap: `Average speed over the trips is not the still-water speed.`,
        tags: ['boats:still-water'],
        choice: { step: 1 },
      };
    }
    if (level === 'hard') {
      const Dn = B + S;
      const Up = B - S;
      const [u1, dn1, u2, dn2] = [rng.int(1, 5) * Up, rng.int(1, 5) * Dn, rng.int(1, 5) * Up, rng.int(1, 5) * Dn];
      if (u1 * dn2 === u2 * dn1) continue;
      const T1 = u1 / Up + dn1 / Dn;
      const T2 = u2 / Up + dn2 / Dn;
      return {
        facts: { form: 'two-trips', ask: askB ? 'B' : 'S', given: { u1, dn1, T1, u2, dn2, T2 } },
        prompt: `${bt.who} goes ${u1} km upstream and ${dn1} km downstream in ${hours(T1)}. It goes ${u2} km upstream and ${dn2} km downstream in ${hours(T2)}. Find ${label}.`,
        answer: ans,
        fmt: kmh,
        mistakes: [
          { value: other, why: askB ? 'found the stream speed' : 'found the boat speed', trap: trapBS },
          { value: askB ? Dn : Up, why: askB ? 'gave the downstream speed' : 'gave the upstream speed' },
          { value: clean((u1 + dn1) / T1, 1), why: 'divided the first trip’s distance by its time' },
        ],
        steps: [`Let upstream = u, downstream = v km/h: ${u1}/u + ${dn1}/v = ${num(T1)} and ${u2}/u + ${dn2}/v = ${num(T2)}`, `Solving: u = ${Up} km/h, v = ${Dn} km/h`, askB ? `Boat = (${Dn} + ${Up}) ÷ 2 = ${B} km/h` : `Stream = (${Dn} − ${Up}) ÷ 2 = ${S} km/h`],
        shortcut: `Treat 1/u and 1/v as unknowns — two linear equations.`,
        trap: `Solve for the upstream and downstream speeds before halving.`,
        tags: ['boats:still-water'],
        choice: { step: 1 },
      };
    }
    // extreme: extra time upstream → stream speed
    const L = lcmN(B + S, B - S);
    if (L > 150) continue;
    const d = L * rng.int(1, Math.max(1, Math.floor(150 / L)));
    const extra = d / (B - S) - d / (B + S);
    if (!Number.isFinite(cleanFrac(extra, 4)) || extra < 0.5 || extra > 8) continue;
    return {
      facts: { form: 'extra-time', ask: 'S', given: { B, d, extra } },
      prompt: `The speed of a boat in still water is ${B} km/h. It takes ${hours(extra)} more to go ${d} km upstream on ${on} than to go the same distance downstream. What is the speed of the stream?`,
      answer: S,
      fmt: kmh,
      mistakes: [
        { value: clean((extra * B * B) / (2 * d), 1), why: 'dropped the S² term' },
        { value: clean(d / extra / 2, 1), why: 'divided the distance by the extra time' },
        { value: B - S, why: 'gave the upstream speed', trap: `${kmh(B - S)} is the upstream speed.` },
      ],
      steps: [`${d}/(${B} − S) − ${d}/(${B} + S) = ${num(extra)}`, `${2 * d}S = ${num(extra)} × (${B * B} − S²)`, `Checking the options, S = ${S} km/h satisfies it`],
      shortcut: `Plug the options into d/(B − S) − d/(B + S).`,
      trap: `The time gap depends on both downstream and upstream speeds.`,
      tags: ['boats:still-water', 'trick:use-options'],
      choice: { step: 1 },
    };
  }
  throw new Error('stillWater: no numbers found');
}

export function roundTrip(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const bt = boat(rng);
  const on = river(rng);
  for (let tries = 0; tries < 800; tries++) {
    const [B, S] = speeds(ctx);
    const L = lcmN(B + S, B - S);
    if (L > 300) continue;
    const d = L * rng.int(1, Math.max(1, Math.floor(120 / L)));
    const tDown = d / (B + S);
    const tUp = d / (B - S);
    const T = tDown + tUp;
    if (level === 'easy' || level === 'medium') {
      const askAvg = level === 'medium' && rng.chance(0.5);
      if (askAvg) {
        const avg = (B * B - S * S) / B;
        if (!Number.isFinite(cleanFrac(avg, 4))) continue;
        return {
          facts: { form: 'round', ask: 'avg', given: { B, S, d } },
          prompt: `${bt.who} with a still-water speed of ${B} km/h ${bt.verb} ${d} km downstream on ${on} and comes back. If the stream flows at ${S} km/h, what is its average speed for the whole trip?`,
          answer: avg,
          fmt: kmh,
          mistakes: [
            { value: B, why: 'assumed the stream effects cancel out', trap: `The boat spends longer going upstream, so the average is less than ${B} km/h.` },
            { value: clean((B + S + (B - S)) / 2 + S / 2, 1), why: 'added half the stream' },
            { value: cleanFrac((B * B - S * S) / (2 * B), 4), why: 'halved the result' },
          ],
          steps: [`Downstream ${B + S} km/h, upstream ${B - S} km/h`, `Average for equal distances = 2 × ${B + S} × ${B - S} ÷ ${2 * B}`, `= ${num(avg)} km/h`],
          shortcut: `Round-trip average = (B² − S²)/B.`,
          trap: `Equal distances, unequal times — not the simple mean.`,
          tags: ['boats:round-trip', 'trick:harmonic-mean'],
          choice: Number.isInteger(avg) ? { step: 1 } : { step: 1, integer: false },
        };
      }
      if (!Number.isFinite(cleanFrac(T, 4)) || T > 20) continue;
      return {
        facts: { form: 'round', ask: 'time', given: { B, S, d } },
        prompt: `${bt.who} with a still-water speed of ${B} km/h ${bt.verb} ${d} km downstream on ${on} and returns to the starting point. If the stream flows at ${S} km/h, how long does the round trip take?`,
        answer: T,
        fmt: hours,
        mistakes: [
          { value: cleanFrac((2 * d) / B, 4), why: 'ignored the stream', trap: `${hours((2 * d) / B)} assumes the stream helps and hurts equally; the slow upstream leg takes longer.` },
          { value: cleanFrac(2 * tDown, 4), why: 'doubled the downstream time' },
          { value: cleanFrac(2 * tUp, 4), why: 'doubled the upstream time' },
        ],
        steps: [`Downstream: ${d} ÷ ${B + S} = ${num(tDown)} h`, `Upstream: ${d} ÷ ${B - S} = ${num(tUp)} h`, `Total = ${num(T)} hours`],
        shortcut: `Time = d/(B + S) + d/(B − S).`,
        trap: `Each leg has its own speed.`,
        tags: ['boats:round-trip'],
        choice: Number.isInteger(T) ? { step: 1 } : { step: 1, integer: false },
      };
    }
    if (!Number.isFinite(cleanFrac(T, 4)) || T > 24) continue;
    if (level === 'hard') {
      return {
        facts: { form: 'round-find-s', ask: 'S', given: { B, d, T } },
        prompt: `A boat with a still-water speed of ${B} km/h goes ${d} km downstream on ${on} and comes back in ${hours(T)} in all. What is the speed of the stream?`,
        answer: S,
        fmt: kmh,
        mistakes: [
          { value: clean(B - (2 * d) / T, 1), why: 'subtracted the average speed from the boat speed', trap: `The average round-trip speed is (B² − S²)/B, not B − S.` },
          { value: clean((2 * d) / T, 1), why: 'gave the average speed' },
          { value: B - S, why: 'gave the upstream speed' },
        ],
        steps: [`${d}/(${B} + S) + ${d}/(${B} − S) = ${num(T)}`, `${2 * d * B} = ${num(T)}(${B * B} − S²) → S² = ${B * B} − ${plain((2 * d * B) / T)}`, `S = ${S} km/h`],
        shortcut: `S² = B² − 2dB/T.`,
        trap: `Set up the time equation for both legs.`,
        tags: ['boats:round-trip'],
        choice: { step: 1 },
      };
    }
    const k = rng.int(1, 3);
    const x = (B + S) * k;
    const y = (B - S) * k;
    return {
      facts: { form: 'round-ratio', ask: 'S', given: { x, y, d, T } },
      prompt: `A man rows to a place ${d} km away and back in ${hours(T)}. He finds that he can row ${x} km downstream in the same time as ${y} km upstream. What is the speed of the stream?`,
      answer: S,
      fmt: kmh,
      mistakes: [
        { value: B, why: 'gave the still-water speed', trap: `${kmh(B)} is his rowing speed in still water.` },
        { value: B - S, why: 'gave the upstream speed' },
        { value: clean((x - y) / 2, 1) !== S ? clean((x - y) / 2, 1) : NaN, why: 'halved the difference of the distances' },
      ],
      steps: [`Speeds are in the ratio ${x} : ${y}; let downstream = ${x}k, upstream = ${y}k`, `${d}/(${x}k) + ${d}/(${y}k) = ${num(T)} → k = ${plain((B + S) / x)}`, `Downstream = ${B + S}, upstream = ${B - S} → stream = (${B + S} − ${B - S}) ÷ 2 = ${S} km/h`],
      shortcut: `Write the speeds in the given ratio and use the total time to scale them.`,
      trap: `The distance ratio for equal times is the speed ratio.`,
      tags: ['boats:round-trip'],
      choice: { step: 1 },
    };
  }
  throw new Error('roundTrip: no numbers found');
}

export function timeRatio(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  for (let tries = 0; tries < 800; tries++) {
    const [kn, kd] = level === 'easy' || level === 'medium' ? rng.pick([[2, 1], [3, 1], [3, 2], [5, 3], [4, 3], [5, 2]]) : rng.pick([[3, 2], [5, 3], [4, 3], [5, 2], [7, 5], [7, 3]]);
    const kText = kd === 1 ? (kn === 2 ? 'twice' : 'thrice') : `${fracTex(kn, kd)} times`;
    // B : S = (k + 1) : (k − 1) with k = kn/kd → (kn + kd) : (kn − kd)
    const bp = kn + kd;
    const sp = kn - kd;
    const unit = rng.int(1, 6);
    const B = bp * unit;
    const S = sp * unit;
    if (B > 40 || S < 1) continue;
    if (level === 'easy') {
      return {
        facts: { form: 'time-ratio', ask: 'B', given: { kNum: kn, kDen: kd, S } },
        prompt: `A man takes ${kText} as long to row a distance upstream as to row the same distance downstream. If the stream flows at ${S} km/h, what is his speed in still water?`,
        answer: B,
        fmt: kmh,
        mistakes: [
          { value: clean((S * kn) / kd), why: 'multiplied the stream speed by the time ratio', trap: `Speed ratio downstream : upstream = ${kn} : ${kd}, so B : S = (${kn} + ${kd}) : (${kn} − ${kd}).` },
          { value: clean((S * (kn + kd)) / kd), why: 'used (k + 1) : 1' },
          { value: B + S, why: 'gave the downstream speed' },
        ],
        steps: [`Time up : down = ${kn} : ${kd} → speed down : up = ${kn} : ${kd}`, `B : S = (${kn} + ${kd}) : (${kn} − ${kd}) = ${bp} : ${sp}`, `B = ${S} × ${bp}/${sp} = ${B} km/h`],
        shortcut: `B : S = (k + 1) : (k − 1) for a time ratio k.`,
        trap: `Invert the time ratio to get the speed ratio.`,
        tags: ['boats:time-ratio'],
        choice: { step: 1 },
      };
    }
    if (level === 'medium') {
      return {
        facts: { form: 'time-ratio', ask: 'S', given: { kNum: kn, kDen: kd, B } },
        prompt: `A boat takes ${kText} as long to go upstream as to cover the same distance downstream. If its speed in still water is ${B} km/h, find the speed of the stream.`,
        answer: S,
        fmt: kmh,
        mistakes: [
          { value: clean((B * kd) / kn), why: 'divided by the time ratio', trap: `B : S = (${kn} + ${kd}) : (${kn} − ${kd}), not ${kn} : ${kd}.` },
          { value: clean((B * (kn - kd)) / kn), why: 'used (k − 1) : k' },
          { value: B - S, why: 'gave the upstream speed' },
        ],
        steps: [`Speed down : up = ${kn} : ${kd}`, `B : S = ${bp} : ${sp}`, `S = ${B} × ${sp}/${bp} = ${S} km/h`],
        shortcut: `S = B × (k − 1)/(k + 1).`,
        trap: `Work with down/up speeds, then halve sum and difference.`,
        tags: ['boats:time-ratio'],
        choice: { step: 1 },
      };
    }
    if (level === 'hard') {
      const t = rng.int(2, 6);
      const d = (B + S) * t;
      return {
        facts: { form: 'time-ratio-trip', ask: 'S', given: { kNum: kn, kDen: kd, d, t } },
        prompt: `A boat takes ${kText} as long to go upstream as to cover the same distance downstream. It covers ${d} km downstream in ${hours(t)}. What is the speed of the stream?`,
        answer: S,
        fmt: kmh,
        mistakes: [
          { value: B, why: 'gave the boat speed', trap: `${kmh(B)} is the still-water speed.` },
          { value: clean((B + S) - ((B + S) * kd) / kn), why: 'took the full difference of the speeds' },
          { value: B - S, why: 'gave the upstream speed' },
        ],
        steps: [`Downstream = ${d} ÷ ${t} = ${B + S} km/h`, `Upstream = ${B + S} × ${kd}/${kn} = ${B - S} km/h`, `Stream = (${B + S} − ${B - S}) ÷ 2 = ${S} km/h`],
        shortcut: `Upstream speed = downstream ÷ k; stream = half the difference.`,
        trap: `Halve the difference of the two speeds.`,
        tags: ['boats:time-ratio'],
        choice: { step: 1 },
      };
    }
    // extreme: time ratio + round-trip time → distance
    const L = lcmN(B + S, B - S);
    const d = L * rng.int(1, 3);
    const T = d / (B + S) + d / (B - S);
    if (T > 30 || d > 200) continue;
    return {
      facts: { form: 'time-ratio-round', ask: 'B', given: { kNum: kn, kDen: kd, d, T } },
      prompt: `A boat takes ${kText} as long to go upstream as to cover the same distance downstream. It goes ${d} km downstream and returns in ${hours(T)} in all. What is its speed in still water?`,
      answer: B,
      fmt: kmh,
      mistakes: [
        { value: clean((2 * d) / T, 1), why: 'took the average speed as the still-water speed', trap: `Total distance ÷ total time is the average speed, which is less than the still-water speed.` },
        { value: B + S, why: 'gave the downstream speed' },
        { value: S, why: 'gave the stream speed' },
      ],
      steps: [`Speeds down : up = ${kn} : ${kd}; times down : up = ${kd} : ${kn}`, `Downstream time = ${num(T)} × ${kd}/${kn + kd} = ${num(d / (B + S))} h → downstream = ${B + S} km/h`, `Upstream = ${B - S} km/h → B = (${B + S} + ${B - S}) ÷ 2 = ${B} km/h`],
      shortcut: `Split the total time in the ratio ${kd} : ${kn}.`,
      trap: `The round trip splits time, not distance, unequally.`,
      tags: ['boats:time-ratio'],
      choice: { step: 1 },
    };
  }
  throw new Error('timeRatio: no numbers found');
}

export function totalDistance(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const bt = boat(rng);
  const on = river(rng);
  for (let tries = 0; tries < 800; tries++) {
    const [B, S] = speeds(ctx);
    const L = lcmN(B + S, B - S);
    if (L > 200) continue;
    const d = L * rng.int(1, Math.max(1, Math.floor(150 / L)));
    const tDown = d / (B + S);
    const tUp = d / (B - S);
    if (level === 'easy' || level === 'medium') {
      const halt = level === 'medium' ? rng.pick([0.5, 1, 1.5, 2]) : 0;
      const T = tDown + tUp + halt;
      if (T > 24) continue;
      const noHalt = cleanFrac((T * (B * B - S * S)) / (2 * B), 4);
      return {
        facts: { form: 'total-distance', ask: 'd', given: { B, S, T, halt } },
        prompt: `${bt.who} with a still-water speed of ${B} km/h goes downstream on ${on} to a village and comes back${halt ? `, stopping there for ${hours(halt)}` : ''}. The whole trip takes ${hours(T)}. If the stream flows at ${S} km/h, how far is the village?`,
        answer: d,
        fmt: km,
        mistakes: [
          { value: cleanFrac((T * B) / 2, 4), why: 'ignored the stream', trap: `The upstream leg is slower, so the distance is less than ${B} × ${num(T)} ÷ 2.` },
          ...(halt ? [{ value: noHalt, why: 'forgot to remove the halt', trap: `The ${num(halt)} hour halt is not travelling time.` }] : []),
          { value: cleanFrac((T - halt) * (B + S), 4), why: 'used the downstream speed for the whole time' },
        ],
        steps: [
          ...(halt ? [`Travelling time = ${num(T)} − ${num(halt)} = ${num(T - halt)} h`] : []),
          `d/${B + S} + d/${B - S} = ${num(T - halt)}`,
          `d × ${fracTex(2 * B, (B + S) * (B - S))} = ${num(T - halt)} → d = ${d} km`,
        ],
        shortcut: `d = T(B² − S²)/(2B).`,
        trap: `Distance is the same both ways; times differ.`,
        tags: ['boats:total-time'],
        choice: { step: stepFor(d) },
      };
    }
    if (d % 2 !== 0) continue;
    const T = tDown + d / 2 / (B - S);
    if (!Number.isFinite(cleanFrac(T, 4)) || T > 24) continue;
    if (level === 'hard') {
      return {
        facts: { form: 'midpoint', ask: 'd', given: { B, S, T } },
        prompt: `A boat goes downstream from P to Q and immediately comes back upstream to R, the midpoint of PQ. The whole journey takes ${hours(T)}. If the boat's speed in still water is ${B} km/h and the stream flows at ${S} km/h, find the distance PQ.`,
        answer: d,
        fmt: km,
        mistakes: [
          { value: cleanFrac((T * (B * B - S * S)) / (2 * B), 4), why: 'treated it as a full round trip', trap: `The boat returns only half-way, to R.` },
          { value: d / 2, why: 'gave QR instead of PQ' },
          { value: cleanFrac(T * (B + S) / 1.5, 4), why: 'used the downstream speed for both legs' },
        ],
        steps: [`Let PQ = d: d/${B + S} + (d/2)/${B - S} = ${num(T)}`, `d(${fracTex(1, B + S)} + ${fracTex(1, 2 * (B - S))}) = ${num(T)}`, `d = ${d} km`],
        shortcut: `Check the options in d/(B + S) + d/(2(B − S)).`,
        trap: `The return leg is only half of PQ.`,
        tags: ['boats:total-time', 'trick:use-options'],
        choice: { step: stepFor(d) },
      };
    }
    // extreme: speeds given through trips
    const t1 = rng.int(2, 4);
    const t2 = rng.int(2, 4);
    return {
      facts: { form: 'midpoint-trips', ask: 'd', given: { d1: (B + S) * t1, t1, d2: (B - S) * t2, t2, T } },
      prompt: `A boat covers ${(B + S) * t1} km downstream in ${hours(t1)} and ${(B - S) * t2} km upstream in ${hours(t2)}. It goes downstream from P to Q and immediately returns upstream to R, the midpoint of PQ, taking ${hours(T)} in all. Find PQ.`,
      answer: d,
      fmt: km,
      mistakes: [
        { value: cleanFrac((T * (B * B - S * S)) / (2 * B), 4), why: 'treated it as a full round trip', trap: `The return leg stops at the midpoint R.` },
        { value: d / 2, why: 'gave PR instead of PQ' },
        { value: cleanFrac((T * ((B + S) * t1 + (B - S) * t2)) / (t1 + t2), 4), why: 'used the average of the two trips' },
      ],
      steps: [`Downstream = ${B + S} km/h, upstream = ${B - S} km/h`, `d/${B + S} + d/${2 * (B - S)} = ${num(T)}`, `d = ${d} km`],
      shortcut: `Find D and U from the trips, then plug the options in.`,
      trap: `R is the midpoint, so the upstream leg is d/2.`,
      tags: ['boats:total-time', 'trick:use-options'],
      choice: { step: stepFor(d) },
    };
  }
  throw new Error('totalDistance: no numbers found');
}

function stepFor(d: number): number {
  return d >= 60 ? 5 : d >= 20 ? 2 : 1;
}
