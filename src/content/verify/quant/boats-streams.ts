/**
 * Independent verifier for quant.boats-streams.
 *
 * Method: exact BigInt rationals. Each leg is simulated minute by minute (distance accumulates at the
 * leg's ground speed = boat ± stream, last minute pro-rated), and every option is substituted back into
 * the stated trips; exactly one option must reproduce all the stated data. Unknown pairs (boat and stream
 * speed) are searched on a half-km/h grid rather than solved with the generator's formulas.
 */
import type { GenResult } from '../../generators/types';
import type { BoatFacts } from '../../generators/quant/boats-streams';

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
function q(x: number): Q {
  const s = String(x);
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
const isPos = (a: Q) => a.n > 0n;

function parseOption(text: string): Q {
  const s = text.replace(/[,\s]/g, '');
  const frac = s.match(/^\$(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$/);
  if (frac) return mk(BigInt(frac[1] ?? '0') * BigInt(frac[3]) + BigInt(frac[2]), BigInt(frac[3]));
  const n = s.match(/^\d+(\.\d+)?/);
  if (!n) throw new Error(`cannot parse option "${text}"`);
  return q(Number(n[0]));
}
function pickWhere(options: readonly string[], test: (v: Q) => boolean): number {
  const hits: number[] = [];
  options.forEach((o, i) => {
    if (test(parseOption(o))) hits.push(i);
  });
  if (hits.length !== 1) throw new Error(`expected exactly one option to fit, found ${hits.length}: ${JSON.stringify(options)}`);
  return hits[0];
}
const pickValue = (options: readonly string[], v: Q) => pickWhere(options, (x) => eq(x, v));

const HOUR = mk(1n);

/** Hours to cover `dist` km at `speed` km/h, stepped an hour at a time (last hour pro-rated). */
function travel(dist: Q, speed: Q): Q {
  if (!isPos(speed)) return mk(10n ** 12n); // cannot make headway
  let done = ZERO;
  let t = ZERO;
  for (let i = 0; i < 100000; i++) {
    const next = add(done, speed);
    if (cmp(next, dist) >= 0) return add(t, div(sub(dist, done), speed));
    done = next;
    t = add(t, HOUR);
  }
  throw new Error('travel: too long');
}

/** Candidate speeds 0.5 … 80 km/h in half steps. */
const GRID: Q[] = Array.from({ length: 160 }, (_, i) => mk(BigInt(i + 1), 2n));

function need(g: Record<string, number>, k: string): Q {
  const v = g[k];
  if (v === undefined || !Number.isFinite(v)) throw new Error(`facts missing ${k}`);
  return q(v);
}

export function verify(res: GenResult<BoatFacts>): number[] {
  return [solve(res.facts, res.item.questions[0].options)];
}

function solve(f: BoatFacts, options: readonly string[]): number {
  const g = f.given;
  switch (f.form) {
    case 'leg-time': {
      const v = add(need(g, 'B'), mul(need(g, 'S'), need(g, 'dir')));
      return pickValue(options, travel(need(g, 'd'), v));
    }
    case 'down-then-up': {
      const S = need(g, 'S');
      // still-water speed: the grid speed whose downstream trip matches the stated one
      const B = GRID.find((b) => eq(travel(need(g, 'd1'), add(b, S)), need(g, 't1')));
      if (!B) throw new Error('no boat speed fits');
      return pickValue(options, travel(need(g, 'd2'), sub(B, S)));
    }
    case 'equal-time': {
      const S = need(g, 'S');
      return pickWhere(options, (B) => cmp(B, S) > 0 && eq(travel(need(g, 'd1'), add(B, S)), travel(need(g, 'd2'), sub(B, S))));
    }
    case 'du-speeds': {
      const [Dn, Up] = [need(g, 'D'), need(g, 'U')];
      if (f.ask === 'B') return pickWhere(options, (B) => GRID.some((s) => eq(add(B, s), Dn) && eq(sub(B, s), Up)));
      return pickWhere(options, (S) => GRID.some((b) => eq(add(b, S), Dn) && eq(sub(b, S), Up)));
    }
    case 'du-trips': {
      const fits = (B: Q, S: Q) => cmp(B, S) > 0 && eq(travel(need(g, 'd1'), add(B, S)), need(g, 't1')) && eq(travel(need(g, 'd2'), sub(B, S)), need(g, 't2'));
      if (f.ask === 'B') return pickWhere(options, (B) => GRID.some((s) => fits(B, s)));
      return pickWhere(options, (S) => GRID.some((b) => fits(b, S)));
    }
    case 'two-trips': {
      const fits = (B: Q, S: Q) =>
        cmp(B, S) > 0 &&
        eq(add(travel(need(g, 'u1'), sub(B, S)), travel(need(g, 'dn1'), add(B, S))), need(g, 'T1')) &&
        eq(add(travel(need(g, 'u2'), sub(B, S)), travel(need(g, 'dn2'), add(B, S))), need(g, 'T2'));
      if (f.ask === 'B') return pickWhere(options, (B) => GRID.some((s) => fits(B, s)));
      return pickWhere(options, (S) => GRID.some((b) => fits(b, S)));
    }
    case 'extra-time': {
      const [B, d] = [need(g, 'B'), need(g, 'd')];
      return pickWhere(options, (S) => cmp(S, B) < 0 && eq(sub(travel(d, sub(B, S)), travel(d, add(B, S))), need(g, 'extra')));
    }
    case 'round': {
      const [B, S, d] = [need(g, 'B'), need(g, 'S'), need(g, 'd')];
      const T = add(travel(d, add(B, S)), travel(d, sub(B, S)));
      return pickValue(options, f.ask === 'time' ? T : div(add(d, d), T));
    }
    case 'round-find-s': {
      const [B, d] = [need(g, 'B'), need(g, 'd')];
      return pickWhere(options, (S) => cmp(S, B) < 0 && eq(add(travel(d, add(B, S)), travel(d, sub(B, S))), need(g, 'T')));
    }
    case 'round-ratio': {
      const [x, y, d] = [need(g, 'x'), need(g, 'y'), need(g, 'd')];
      return pickWhere(options, (S) =>
        GRID.some((B) => cmp(B, S) > 0 && eq(travel(x, add(B, S)), travel(y, sub(B, S))) && eq(add(travel(d, add(B, S)), travel(d, sub(B, S))), need(g, 'T'))),
      );
    }
    case 'time-ratio': {
      const k = div(need(g, 'kNum'), need(g, 'kDen'));
      const one = q(1);
      const ratio = (B: Q, S: Q) => cmp(B, S) > 0 && eq(div(travel(one, sub(B, S)), travel(one, add(B, S))), k);
      if (f.ask === 'B') return pickWhere(options, (B) => ratio(B, need(g, 'S')));
      return pickWhere(options, (S) => ratio(need(g, 'B'), S));
    }
    case 'time-ratio-trip': {
      const k = div(need(g, 'kNum'), need(g, 'kDen'));
      const [d, t] = [need(g, 'd'), need(g, 't')];
      return pickWhere(options, (S) =>
        GRID.some((B) => cmp(B, S) > 0 && eq(travel(d, add(B, S)), t) && eq(div(travel(d, sub(B, S)), travel(d, add(B, S))), k)),
      );
    }
    case 'time-ratio-round': {
      const k = div(need(g, 'kNum'), need(g, 'kDen'));
      const d = need(g, 'd');
      return pickWhere(options, (B) =>
        GRID.some((S) => cmp(B, S) > 0 && eq(div(travel(d, sub(B, S)), travel(d, add(B, S))), k) && eq(add(travel(d, add(B, S)), travel(d, sub(B, S))), need(g, 'T'))),
      );
    }
    case 'total-distance': {
      const [B, S] = [need(g, 'B'), need(g, 'S')];
      return pickWhere(options, (d) => eq(add(add(travel(d, add(B, S)), travel(d, sub(B, S))), need(g, 'halt')), need(g, 'T')));
    }
    case 'midpoint': {
      const [B, S] = [need(g, 'B'), need(g, 'S')];
      return pickWhere(options, (d) => eq(add(travel(d, add(B, S)), travel(div(d, q(2)), sub(B, S))), need(g, 'T')));
    }
    case 'midpoint-trips': {
      const down = GRID.find((v) => eq(travel(need(g, 'd1'), v), need(g, 't1')));
      const up = GRID.find((v) => eq(travel(need(g, 'd2'), v), need(g, 't2')));
      if (!down || !up) throw new Error('trip speeds not found');
      return pickWhere(options, (d) => eq(add(travel(d, down), travel(div(d, q(2)), up)), need(g, 'T')));
    }
    default:
      throw new Error(`verify: unknown form ${f.form}`);
  }
}
