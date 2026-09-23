/**
 * Independent verifier for quant.pipes-cisterns.
 *
 * Method: exact BigInt rationals and a tick-by-tick tank simulation (one tick = one minute/hour of the
 * question's unit). Each tick the open pipes change the water level; the level is floored at empty, and
 * the finishing tick is pro-rated. Inverse questions substitute every option back into the simulation.
 */
import type { GenResult } from '../../generators/types';
import type { PipeFacts } from '../../generators/quant/pipes-cisterns';

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
const ONE = mk(1n);
const add = (a: Q, b: Q) => mk(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Q, b: Q) => mk(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q) => mk(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => mk(a.n * b.d, a.d * b.n);
const eq = (a: Q, b: Q) => a.n === b.n && a.d === b.d;
const cmp = (a: Q, b: Q) => {
  const x = a.n * b.d - b.n * a.d;
  return x < 0n ? -1 : x > 0n ? 1 : 0;
};
const inv = (a: Q) => div(ONE, a);
const isPos = (a: Q) => a.n > 0n;
const minQ = (a: Q, b: Q) => (cmp(a, b) <= 0 ? a : b);
const maxQ = (a: Q, b: Q) => (cmp(a, b) >= 0 ? a : b);

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

/**
 * Tick-by-tick tank. `rate(n)` = change in level during tick n (fraction of the tank, or litres).
 * Returns the moment the level first reaches `target` (from below when rising, from above when falling).
 */
function simulate(rate: (n: number) => Q, start: Q, target: Q, maxTicks = 200000): Q {
  let level = start;
  const rising = cmp(target, start) > 0;
  for (let n = 0; n < maxTicks; n++) {
    const r = rate(n);
    const next = add(level, r);
    if (rising ? cmp(next, target) >= 0 && isPos(r) : cmp(next, target) <= 0 && r.n < 0n) return add(q(n), div(sub(target, level), r));
    level = maxQ(next, ZERO);
  }
  throw new Error('tank never reaches the target');
}

/** Fraction of the tank per tick for a signed pipe time (negative = emptying). */
const pipe = (t: number) => (t > 0 ? inv(q(t)) : mul(q(-1), inv(q(-t))));
const sum = (xs: Q[]) => xs.reduce((s, x) => add(s, x), ZERO);

function need(g: Record<string, number>, k: string): Q {
  const v = g[k];
  if (v === undefined || !Number.isFinite(v)) throw new Error(`facts missing ${k}`);
  return q(v);
}
const num = (g: Record<string, number>, k: string) => {
  const v = g[k];
  if (v === undefined) throw new Error(`facts missing ${k}`);
  return v;
};

export function verify(res: GenResult<PipeFacts>): number[] {
  return [solve(res.facts, res.item.questions[0].options)];
}

function solve(f: PipeFacts, options: readonly string[]): number {
  const g = f.given;
  switch (f.form) {
    case 'all-open': {
      const r = sum((f.list ?? []).map(pipe));
      return pickValue(options, simulate(() => r, ZERO, ONE));
    }
    case 'find-emptier': {
      const base = add(pipe(num(g, 'a')), pipe(num(g, 'b')));
      return pickWhere(options, (c) => {
        const r = sub(base, inv(c));
        return isPos(r) && eq(simulate(() => r, ZERO, ONE), need(g, 'T'));
      });
    }
    case 'drain-capacity': {
      return pickWhere(options, (C) => {
        const r = sub(add(div(C, need(g, 'a')), div(C, need(g, 'b'))), need(g, 'y'));
        return isPos(r) && eq(simulate(() => r, ZERO, C), need(g, 'T'));
      });
    }
    case 'leak': {
      return pickWhere(options, (L) => {
        const r = sub(pipe(num(g, 'a')), inv(L));
        return isPos(r) && eq(simulate(() => r, ZERO, ONE), need(g, 'b'));
      });
    }
    case 'leak-capacity': {
      const inflow = mul(need(g, 'x'), q(60));
      return pickWhere(options, (C) => {
        const r = sub(inflow, div(C, need(g, 'L')));
        return r.n < 0n && eq(simulate(() => r, C, ZERO), need(g, 'E'));
      });
    }
    case 'leak-two': {
      const pipes = add(pipe(num(g, 'a')), pipe(num(g, 'b')));
      const plain = simulate(() => pipes, ZERO, ONE);
      const target = add(plain, div(need(g, 'extraMin'), q(60)));
      return pickWhere(options, (L) => {
        const r = sub(pipes, inv(L));
        return isPos(r) && eq(simulate(() => r, ZERO, ONE), target);
      });
    }
    case 'rotation': {
      const rates = (f.list ?? []).map(pipe);
      return pickValue(options, simulate((n) => rates[n % rates.length], ZERO, ONE));
    }
    case 'close-after': {
      const [ra, rb] = [pipe(num(g, 'a')), pipe(num(g, 'b'))];
      const t = num(g, 't');
      const total = simulate((n) => (n < t ? add(ra, rb) : rb), ZERO, ONE);
      return pickValue(options, sub(total, q(t)));
    }
    case 'close-before': {
      const [ra, rb, t] = [pipe(num(g, 'a')), pipe(num(g, 'b')), need(g, 't')];
      return pickWhere(options, (T) => {
        const bTime = maxQ(sub(T, t), ZERO);
        return eq(add(mul(T, ra), mul(minQ(bTime, T), rb)), ONE);
      });
    }
    case 'drain-closed': {
      const [ra, rb, rc] = [pipe(num(g, 'a')), pipe(num(g, 'b')), pipe(-num(g, 'c'))];
      const t = num(g, 't');
      return pickValue(options, simulate((n) => (n < t ? add(add(ra, rb), rc) : add(ra, rb)), ZERO, ONE));
    }
    case 'staggered': {
      const [ra, rb, rc] = [pipe(num(g, 'a')), pipe(num(g, 'b')), pipe(-num(g, 'c'))];
      const t1 = num(g, 't1');
      const t12 = t1 + num(g, 't2');
      return pickValue(options, simulate((n) => add(ra, add(n >= t1 ? rb : ZERO, n >= t12 ? rc : ZERO)), ZERO, ONE));
    }
    case 'partial': {
      const r = sum((f.list ?? []).map(pipe));
      const start = div(need(g, 'startNum'), need(g, 'startDen'));
      const target = div(need(g, 'targetNum'), need(g, 'targetDen'));
      return pickValue(options, simulate(() => r, start, target));
    }
    case 'partial-close': {
      const [ra, rb] = [pipe(num(g, 'a')), pipe(-num(g, 'b'))];
      const t = num(g, 't');
      const start = div(need(g, 'startNum'), need(g, 'startDen'));
      return pickValue(options, simulate((n) => (n < t ? add(ra, rb) : ra), start, ONE));
    }
    default:
      throw new Error(`verify: unknown form ${f.form}`);
  }
}
