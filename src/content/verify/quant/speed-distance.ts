/**
 * Independent verifier for quant.speed-distance.
 *
 * Method: exact BigInt rationals and motion simulation — bodies are tracked as moving intervals and a
 * crossing is found by stepping time (1 s or 1 min ticks) and interpolating inside the final tick;
 * turnarounds use an event-driven simulation; circular tracks are stepped second by second with modular
 * positions. Inverse questions substitute every option back into the simulation and require exactly one
 * option to reproduce the stated data. No generator formula (relative-speed sums, 2ab/(a+b), …) is reused.
 */
import type { GenResult } from '../../generators/types';
import type { SpeedFacts, CrossEvent, Leg } from '../../generators/quant/speed-distance';

/* ------------------------------ exact rationals ------------------------------ */

interface Q {
  n: bigint;
  d: bigint;
}
function bgcd(a: bigint, b: bigint): bigint {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b) [a, b] = [b, a % b];
  return a;
}
function mk(n: bigint, d: bigint = 1n): Q {
  if (d === 0n) throw new Error('zero denominator');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = bgcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
function q(x: number | string): Q {
  const s = typeof x === 'number' ? String(x) : x.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`not a plain decimal: ${s}`);
  const neg = s.startsWith('-');
  const [i, f = ''] = (neg ? s.slice(1) : s).split('.');
  return mk(BigInt(i + f) * (neg ? -1n : 1n), 10n ** BigInt(f.length));
}
const ZERO = mk(0n);
const add = (a: Q, b: Q) => mk(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Q, b: Q) => mk(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q) => mk(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => mk(a.n * b.d, a.d * b.n);
const eq = (a: Q, b: Q) => a.n === b.n && a.d === b.d;
const cmp = (a: Q, b: Q) => {
  const x = a.n * b.d - b.n * a.d;
  return x < 0n ? -1 : x > 0n ? 1 : 0;
};
const neg = (a: Q) => mk(-a.n, a.d);
const isPos = (a: Q) => a.n > 0n;

/* ------------------------------ options ------------------------------ */

type Mode = 'num' | 'clock' | 'hm';

function parseOption(text: string, mode: Mode): Q {
  const t = text.trim();
  if (mode === 'clock') {
    const m = t.match(/^(\d{1,2}):(\d{2})\s*(a\.m\.|p\.m\.)$/);
    if (!m) throw new Error(`bad clock option ${text}`);
    let h = Number(m[1]) % 12;
    if (m[3] === 'p.m.') h += 12;
    return q(h * 60 + Number(m[2]));
  }
  if (mode === 'hm') {
    const h = t.match(/(\d+)\s*hours?/);
    const m = t.match(/(\d+)\s*minutes?/);
    if (!h && !m) throw new Error(`bad duration option ${text}`);
    return q(Number(h?.[1] ?? 0) * 60 + Number(m?.[1] ?? 0));
  }
  const s = t.replace(/[₹,\s]/g, '');
  const frac = s.match(/^\$(-)?(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$/);
  if (frac) {
    const sign = frac[1] ? -1n : 1n;
    return mk(sign * (BigInt(frac[2] ?? '0') * BigInt(frac[4]) + BigInt(frac[3])), BigInt(frac[4]));
  }
  const n = s.match(/^-?\d+(\.\d+)?/);
  if (!n) throw new Error(`cannot parse option "${text}"`);
  return q(n[0]);
}

function pickWhere(options: readonly string[], mode: Mode, test: (v: Q) => boolean): number {
  const hits: number[] = [];
  options.forEach((o, i) => {
    if (test(parseOption(o, mode))) hits.push(i);
  });
  if (hits.length !== 1) throw new Error(`expected exactly one option to fit, found ${hits.length}: ${JSON.stringify(options)}`);
  return hits[0];
}
const pickValue = (options: readonly string[], v: Q, mode: Mode = 'num') => pickWhere(options, mode, (x) => eq(x, v));

/* ------------------------------ simulation primitives ------------------------------ */

const KMH_TO_MS = mk(1000n, 3600n);
const kmhToMs = (v: Q) => mul(v, KMH_TO_MS);

/**
 * First time t ≥ 0 at which f(t) ≥ 0 for an increasing linear f, found by stepping `tick` and
 * interpolating inside the final tick. f(t) = f0 + slope·t.
 */
function firstReach(f0: Q, slope: Q, tick: Q, maxTicks = 200000): Q {
  if (cmp(f0, ZERO) >= 0) return ZERO;
  if (!isPos(slope)) throw new Error('never reached');
  let t = ZERO;
  let ft = f0;
  for (let i = 0; i < maxTicks; i++) {
    const t2 = add(t, tick);
    const f2 = add(f0, mul(slope, t2));
    if (cmp(f2, ZERO) >= 0) {
      // linear inside the tick: t + (−ft)/(f2 − ft) × tick
      return add(t, mul(div(neg(ft), sub(f2, ft)), tick));
    }
    t = t2;
    ft = f2;
  }
  throw new Error('simulation did not finish');
}

/**
 * Train A (length LA, speed vA m/s, moving +) starts with its front touching the near end of object B
 * (length LB, velocity vB m/s). Returns the time until A's rear clears B's far end.
 */
function crossTime(LA: Q, vA: Q, LB: Q, vB: Q): Q {
  // rear of A: −LA + vA·t ; far end of B: LB + vB·t
  const f0 = sub(neg(LA), LB);
  const slope = sub(vA, vB);
  return firstReach(f0, slope, mk(1n));
}

/* ------------------------------ verifier ------------------------------ */

export function verify(res: GenResult<SpeedFacts>): number[] {
  return [solve(res.facts, res.item.questions[0].options)];
}

function need(g: Record<string, number>, k: string): Q {
  const v = g[k];
  if (v === undefined || !Number.isFinite(v)) throw new Error(`facts missing ${k}`);
  return q(v);
}

function solve(f: SpeedFacts, options: readonly string[]): number {
  const g = f.given;
  switch (f.form) {
    case 'cross':
      return solveCross(f, options);
    case 'cross-both': {
      const S = add(need(g, 'L1'), need(g, 'L2'));
      const sumMs = div(S, need(g, 'tOpp'));
      return pickWhere(options, 'num', (cand) => {
        const vCand = kmhToMs(cand);
        const other = sub(sumMs, vCand);
        if (!isPos(other)) return false;
        const [fast, slow] = f.ask === 'faster' ? [vCand, other] : [other, vCand];
        if (cmp(fast, slow) <= 0) return false;
        // opposite crossing reproduces tOpp, same-direction overtaking reproduces tSame
        return eq(crossTime(need(g, 'L1'), fast, need(g, 'L2'), neg(slow)), need(g, 'tOpp')) && eq(crossTime(need(g, 'L1'), fast, need(g, 'L2'), slow), need(g, 'tSame'));
      });
    }
    case 'average':
      return solveAverage(f, options);
    case 'towards': {
      // minutes until the two riders meet (ticks of one minute)
      const D = need(g, 'D');
      const perMin = div(add(need(g, 'a'), need(g, 'b')), q(60));
      return pickValue(options, firstReach(neg(D), perMin, mk(1n)));
    }
    case 'chase': {
      const a = div(need(g, 'a'), q(60));
      const b = div(need(g, 'b'), q(60));
      const delay = need(g, 'delayMin');
      // after the second starts (time s in minutes): gap(s) = a(delay + s) − b·s
      const head = mul(a, delay);
      const s = firstReach(neg(head), sub(b, a), mk(1n));
      if (f.ask === 'catchMin') return pickValue(options, s);
      return pickValue(options, mul(b, s));
    }
    case 'metres-chase': {
      const a = kmhToMs(need(g, 'a'));
      const b = kmhToMs(need(g, 'b'));
      const t = firstReach(neg(need(g, 'gapM')), sub(b, a), mk(1n));
      return pickValue(options, mul(a, t));
    }
    case 'return-meet': {
      const pos = shuttle(need(g, 'D'), need(g, 'a'), need(g, 'b'), 'same-start', 1);
      return pickValue(options, sub(need(g, 'D'), pos));
    }
    case 'second-meet': {
      const pos = shuttle(need(g, 'D'), need(g, 'a'), need(g, 'b'), 'ends', 2);
      return pickValue(options, pos);
    }
    case 'meet': {
      const D = need(g, 'D');
      const a = div(need(g, 'a'), q(60));
      const b = div(need(g, 'b'), q(60));
      const delay = need(g, 'delayMin');
      // minutes after the first train starts; the second joins after `delay`
      const tMeet = cmp(mul(a, delay), D) >= 0 ? div(D, a) : add(delay, firstReach(sub(mul(a, delay), D), add(a, b), mk(1n)));
      if (f.ask === 'time') return pickValue(options, div(tMeet, q(60)));
      if (f.ask === 'fromA') return pickValue(options, mul(a, tMeet));
      return pickValue(options, add(need(g, 'startClock'), tMeet), 'clock');
    }
    case 'meet-extra': {
      const a = need(g, 'a');
      const b = need(g, 'b');
      return pickWhere(options, 'num', (D) => {
        const t = firstReach(neg(D), add(a, b), mk(1n, 60n));
        return eq(sub(mul(a, t), mul(b, t)), need(g, 'extra'));
      });
    }
    case 'after-meet': {
      const a = need(g, 'a');
      const t1 = need(g, 't1');
      const t2 = need(g, 't2');
      return pickWhere(options, 'num', (b) => {
        // choose D so that A needs t1 hours after meeting, then check B's time
        const D = div(mul(mul(add(a, b), a), t1), b);
        const tm = firstReach(neg(D), add(a, b), mk(1n, 60n));
        const restA = div(sub(D, mul(a, tm)), a);
        const restB = div(sub(D, mul(b, tm)), b);
        return eq(restA, t1) && eq(restB, t2);
      });
    }
    case 'fraction-speed': {
      const r = div(need(g, 'den'), need(g, 'num'));
      const diff = need(g, 'diffMin');
      const late = g.late === 1;
      return pickWhere(options, 'num', (T) => {
        const newT = mul(T, r);
        return eq(late ? sub(newT, T) : sub(T, newT), diff);
      });
    }
    case 'late-early': {
      const s1 = need(g, 's1');
      const s2 = need(g, 's2');
      const late = need(g, 'late');
      const early = need(g, 'early');
      const gapH = div(add(late, early), q(60));
      const tripGap = (D: Q) => sub(div(D, s1), div(D, s2));
      if (f.ask === 'D') return pickWhere(options, 'num', (D) => eq(tripGap(D), gapH));
      // on-time speed: find D by scanning whole km, then the exact time
      const D = scanDistance((x) => cmp(tripGap(x), gapH));
      const T = sub(div(D, s1), div(late, q(60)));
      return pickWhere(options, 'num', (v) => isPos(v) && eq(div(D, v), T));
    }
    case 'both-late': {
      const s1 = need(g, 's1');
      const s2 = need(g, 's2');
      const l1 = need(g, 'late1');
      const l2 = need(g, 'late2');
      if (f.ask === 'D') return pickWhere(options, 'num', (D) => eq(mul(sub(div(D, s1), div(D, s2)), q(60)), sub(l1, l2)));
      return pickWhere(options, 'num', (T) => {
        const D = div(mul(s1, add(T, l1)), q(60));
        return eq(sub(mul(div(D, s2), q(60)), T), l2);
      });
    }
    case 'stoppage': {
      // distance covered in one hour when the vehicle stands still for m of the 60 minutes
      const inHour = (s: Q, m: Q) => mul(s, div(sub(q(60), m), q(60)));
      if (f.ask === 'perHour') return pickWhere(options, 'num', (m) => eq(inHour(need(g, 's1'), m), need(g, 's2')));
      if (f.ask === 's2') return pickValue(options, inHour(need(g, 's1'), need(g, 'perHour')));
      return pickWhere(options, 'num', (s1) => eq(inHour(s1, need(g, 'perHour')), need(g, 's2')));
    }
    case 'stoppage-journey': {
      const s2 = div(need(g, 'D'), need(g, 'T'));
      return pickWhere(options, 'num', (m) => eq(mul(need(g, 's1'), div(sub(q(60), m), q(60))), s2));
    }
    case 'stop-every': {
      const s = need(g, 's');
      const d = need(g, 'd');
      const m = need(g, 'm');
      const D = need(g, 'D');
      let covered = ZERO;
      let minutes = ZERO;
      while (cmp(covered, D) < 0) {
        covered = add(covered, d);
        minutes = add(minutes, mul(div(d, s), q(60)));
        if (cmp(covered, D) < 0) minutes = add(minutes, m); // stop only if more road remains
      }
      if (!eq(covered, D)) throw new Error('stop-every: D not a multiple of d');
      if (f.ask === 'totalMin') return pickValue(options, minutes, 'hm');
      return pickValue(options, div(D, div(minutes, q(60))));
    }
    case 'circle':
      return solveCircle(f, options);
    default:
      throw new Error(`verify: unknown form ${f.form}`);
  }
}

/** Smallest whole km (up to 5000) where sign(fn) changes to ≥ 0, then exact via bisection on rationals. */
function scanDistance(fn: (D: Q) => number): Q {
  for (let k = 1; k <= 5000; k++) {
    const c = fn(q(k));
    if (c === 0) return q(k);
    if (c > 0) {
      // linear fn: interpolate between k−1 and k
      const lo = q(k - 1);
      const hi = q(k);
      let a = lo;
      let b = hi;
      for (let i = 0; i < 200; i++) {
        const mid = div(add(a, b), q(2));
        const cm = fn(mid);
        if (cm === 0) return mid;
        if (cm > 0) b = mid;
        else a = mid;
      }
      throw new Error('scanDistance: no exact root');
    }
  }
  throw new Error('scanDistance: out of range');
}

/**
 * Event-driven shuttle on a segment [0, D]. 'same-start': both start at 0 moving +, speeds a < b.
 * 'ends': A starts at 0 moving +, B at D moving −. Each turns back at the ends. Returns A's position
 * at the n-th meeting (t > 0).
 */
function shuttle(D: Q, a: Q, b: Q, start: 'same-start' | 'ends', n: number): Q {
  let pA = ZERO;
  let pB = start === 'same-start' ? ZERO : D;
  let dA = 1;
  let dB = start === 'same-start' ? 1 : -1;
  let meetings = 0;
  for (let step = 0; step < 1000; step++) {
    const vA = dA > 0 ? a : neg(a);
    const vB = dB > 0 ? b : neg(b);
    const wallA = dA > 0 ? div(sub(D, pA), a) : div(pA, a);
    const wallB = dB > 0 ? div(sub(D, pB), b) : div(pB, b);
    const gap = sub(pB, pA);
    const closing = sub(vA, vB); // gap shrinks at this rate when positive and gap > 0 (or negative/negative)
    let tMeet: Q | null = null;
    if (gap.n !== 0n && closing.n !== 0n) {
      const t = div(gap, closing);
      if (isPos(t)) tMeet = t;
    }
    const tWall = cmp(wallA, wallB) <= 0 ? wallA : wallB;
    if (tMeet && cmp(tMeet, tWall) <= 0) {
      pA = add(pA, mul(vA, tMeet));
      pB = add(pB, mul(vB, tMeet));
      meetings++;
      if (meetings === n) return pA;
      // move infinitesimally apart: continue from the meeting with the same directions
      const nextWallA = dA > 0 ? div(sub(D, pA), a) : div(pA, a);
      const nextWallB = dB > 0 ? div(sub(D, pB), b) : div(pB, b);
      const tw = cmp(nextWallA, nextWallB) <= 0 ? nextWallA : nextWallB;
      pA = add(pA, mul(vA, tw));
      pB = add(pB, mul(vB, tw));
      if (eq(pA, ZERO) || eq(pA, D)) dA = -dA;
      if (eq(pB, ZERO) || eq(pB, D)) dB = -dB;
      continue;
    }
    pA = add(pA, mul(vA, tWall));
    pB = add(pB, mul(vB, tWall));
    if (eq(pA, ZERO) || eq(pA, D)) dA = -dA;
    if (eq(pB, ZERO) || eq(pB, D)) dB = -dB;
  }
  throw new Error('shuttle: no meeting');
}

function solveCross(f: SpeedFacts, options: readonly string[]): number {
  const train = f.train;
  const events = f.events;
  if (!train || !events?.length) throw new Error('cross facts incomplete');

  const evaluate = (cand: Q | null): boolean | Q => {
    let L: Q | null = train.len === null ? null : q(train.len);
    let V: Q | null = train.speed === null ? null : q(train.speed); // km/h
    const evs = events.map((e) => ({ ...e }));
    const lens: (Q | null)[] = evs.map((e) => (e.len === null ? null : q(e.len)));
    const speeds: (Q | null)[] = evs.map((e) => (e.speed === null ? null : q(e.speed)));
    const times: (Q | null)[] = evs.map((e) => (e.time === null ? null : q(e.time)));
    const ask = f.ask;
    if (cand) {
      if (ask === 'trainLen') L = cand;
      else if (ask === 'trainSpeed') V = cand;
      else if (ask.startsWith('objLen')) {
        const i = Number(ask.slice(6));
        const factor = evs[i].lenFactor;
        if (factor !== undefined) L = div(cand, q(factor));
        else lens[i] = cand;
      }
      else if (ask.startsWith('objSpeed')) {
        const i = Number(ask.slice(8));
        speeds[i] = mul(cand, q(evs[i].speedSign ?? 1));
      }
    }
    const objLen = (i: number): Q | null => {
      const e: CrossEvent = evs[i];
      if (e.lenFactor !== undefined) return L === null ? null : mul(q(e.lenFactor), L);
      return lens[i];
    };
    // derive a missing train length or speed from the first fully specified crossing
    if (L === null || V === null) {
      const i = evs.findIndex((e, k) => times[k] !== null && objLen(k) !== null && speeds[k] !== null && !e.boost);
      if (i < 0) throw new Error('cannot derive the second unknown');
      const t = times[i]!;
      const vB = kmhToMs(speeds[i]!);
      if (L === null && V !== null) L = sub(mul(t, sub(kmhToMs(V), vB)), objLen(i)!);
      else if (V === null && L !== null) V = mul(add(div(add(L, objLen(i)!), t), vB), q(3.6));
      else throw new Error('two unknowns left');
    }
    if (!isPos(L) || !isPos(V)) return false;
    let asked: Q | null = null;
    for (let i = 0; i < evs.length; i++) {
      const LB = objLen(i);
      const sB = speeds[i];
      if (LB === null || sB === null) throw new Error('object unknown after substitution');
      const vA = kmhToMs(add(V, q(evs[i].boost ?? 0)));
      const vB = kmhToMs(sB);
      if (cmp(vA, vB) <= 0) return false;
      const t = crossTime(L, vA, LB, vB);
      if (times[i] === null) asked = t;
      else if (!eq(t, times[i]!)) return false;
    }
    return asked ?? true;
  };

  if (f.ask.startsWith('time')) {
    const t = evaluate(null);
    if (typeof t === 'boolean') throw new Error('no time computed');
    return pickValue(options, t);
  }
  return pickWhere(options, 'num', (cand) => evaluate(cand) === true);
}

function legTimes(legs: Leg[], total: Q): { dist: Q; time: Q } {
  let dist = ZERO;
  let time = ZERO;
  for (const l of legs) {
    if (l.haltMin !== undefined) {
      time = add(time, div(q(l.haltMin), q(60)));
      continue;
    }
    const d = l.dist !== undefined ? q(l.dist) : mul(total, div(q(l.num!), q(l.den!)));
    dist = add(dist, d);
    if (l.halfTimeSpeeds) {
      // equal halves of time τ: d = s1·τ/2 + s2·τ/2  → step τ in small ticks is unnecessary; solve by scanning
      const [s1, s2] = l.halfTimeSpeeds.map((x) => q(x));
      const perHourHalf = div(add(s1, s2), q(2)); // distance per hour when time is split equally
      time = add(time, firstReach(neg(d), perHourHalf, mk(1n, 60n)));
    } else {
      if (l.speed === null || l.speed === undefined) throw new Error('leg speed missing');
      time = add(time, firstReach(neg(d), q(l.speed), mk(1n, 60n)));
    }
  }
  return { dist, time };
}

function solveAverage(f: SpeedFacts, options: readonly string[]): number {
  const legs = f.legs;
  if (!legs?.length) throw new Error('average: no legs');
  const total = q(3600);
  if (f.ask === 'avg') {
    const { dist, time } = legTimes(legs, total);
    return pickValue(options, div(dist, time));
  }
  const target = need(f.given, 'target');
  return pickWhere(options, 'num', (v) => {
    if (!isPos(v)) return false;
    const filled = legs.map((l) => (l.speed === null ? { ...l, speed: Number(v.n) / Number(v.d) } : l));
    if (v.d !== 1n) return false;
    const { dist, time } = legTimes(filled, total);
    return eq(div(dist, time), target);
  });
}

function solveCircle(f: SpeedFacts, options: readonly string[]): number {
  const g = f.given;
  if (f.ask === 'startMeet') {
    const laps = f.list ?? [];
    for (let t = 1; t <= 100000; t++) if (laps.every((x) => t % x === 0)) return pickValue(options, q(t));
    throw new Error('no start meeting');
  }
  const L = g.L;
  const a = g.a;
  const b = g.b;
  const same = g.same === 1;
  const posA = (t: number) => (a * t) % L;
  const posB = (t: number) => (((same ? b * t : -b * t) % L) + L) % L;
  if (f.ask === 'firstMeet') {
    for (let t = 1; t <= 1000000; t++) if (posA(t) === posB(t)) return pickValue(options, q(t));
    throw new Error('never meet');
  }
  // distinct meeting points over one full cycle (until both are back at the start together)
  const points = new Set<number>();
  for (let t = 1; t <= 10000000; t++) {
    if (posA(t) === posB(t)) points.add(posA(t));
    if (posA(t) === 0 && posB(t) === 0) break;
  }
  return pickValue(options, q(points.size));
}
