/**
 * Independent verifier for quant.partnership.
 *
 * Simulates the business month by month: each month, every partner "earns a ticket" worth the capital
 * they have in the business that month; profit is split in proportion to the tickets. Unknown months are
 * found by enumerating 1–12; unknown capitals by substituting each option. Exact BigInt rationals.
 */
import type { GenResult } from '../../generators/types';
import type { PartnershipFacts, Seg } from '../../generators/quant/partnership';

interface Q {
  n: bigint;
  d: bigint;
}
const bgcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};
function Q(n: bigint | number, d: bigint | number = 1n): Q {
  let N = BigInt(n);
  let D = BigInt(d);
  if (D === 0n) throw new Error('zero denominator');
  if (D < 0n) {
    N = -N;
    D = -D;
  }
  const g = bgcd(N, D) || 1n;
  return { n: N / g, d: D / g };
}
function dq(x: number): Q {
  const s = String(x);
  const [i, f = ''] = s.split('.');
  return Q(BigInt(i + f), 10n ** BigInt(f.length));
}
const add = (a: Q, b: Q): Q => Q(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Q, b: Q): Q => Q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q): Q => Q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q): Q => Q(a.n * b.d, a.d * b.n);
const eq = (a: Q, b: Q): boolean => a.n === b.n && a.d === b.d;

/** Month-by-month tickets: capital held during each month 1..period. */
function tickets(schedule: Seg[], period: number): number {
  let t = 0;
  for (let month = 0; month < period; month++) {
    for (const [from, to, capital] of schedule) if (month >= from && month < to) t += capital;
  }
  return t;
}
function split(profit: Q, t: number[]): Q[] {
  const total = t.reduce((s, x) => s + x, 0);
  return t.map((x) => div(mul(profit, Q(x)), Q(total)));
}

type Parsed = { kind: 'num'; v: Q } | { kind: 'ratio'; parts: bigint[] };
function parseOption(raw: string): Parsed {
  const s = raw.trim();
  if (/^\d+ : \d+$/.test(s)) return { kind: 'ratio', parts: s.split(' : ').map((x) => BigInt(x)) };
  const t = s.replace(/\s*months?$/, '').replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error(`unparseable option "${raw}"`);
  const [, frac = ''] = t.split('.');
  return { kind: 'num', v: Q(BigInt(t.replace('.', '')), 10n ** BigInt(frac.length)) };
}
function pick(options: readonly string[], ok: (p: Parsed) => boolean): number {
  const hits = options.map((o, i) => (ok(parseOption(o)) ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) throw new Error(`expected exactly one option to fit, found ${hits.length} in ${JSON.stringify(options)}`);
  return hits[0];
}
const byValue = (options: readonly string[], want: Q): number => pick(options, (p) => p.kind === 'num' && eq(p.v, want));
const where = (options: readonly string[], ok: (v: Q) => boolean): number => pick(options, (p) => p.kind === 'num' && ok(p.v));
const byRatio = (options: readonly string[], a: bigint, b: bigint): number =>
  pick(options, (p) => p.kind === 'ratio' && p.parts[0] * b === p.parts[1] * a);

function solve(f: PartnershipFacts, options: readonly string[]): number {
  switch (f.form) {
    case 'shares': {
      const shares = split(Q(f.profit), f.schedules.map((s) => tickets(s, f.period)));
      return byValue(options, f.vs === undefined ? shares[f.ask] : sub(shares[f.ask], shares[f.vs]));
    }
    case 'ratio-shares': {
      // Scale the ratios to concrete capitals/months, then simulate.
      const schedules: Seg[][] = f.caps.map((c, i) => [[0, f.times[i], c]]);
      const shares = split(Q(f.profit), schedules.map((s) => tickets(s, Math.max(...f.times))));
      const gap = f.vs === undefined ? shares[f.ask] : sub(shares[f.ask], shares[f.vs]);
      return byValue(options, gap.n < 0n ? Q(-gap.n, gap.d) : gap);
    }
    case 'find-join': {
      const ms: number[] = [];
      for (let m = 1; m <= 11; m++) {
        const tA = tickets([[0, 12, f.capA]], 12);
        const tB = tickets([[m, 12, f.capB]], 12);
        if (tA * f.pB === tB * f.pA) ms.push(m);
      }
      if (ms.length !== 1) throw new Error(`find-join: ${ms.length} solutions`);
      return byValue(options, Q(ms[0]));
    }
    case 'find-leave': {
      const ms: number[] = [];
      for (let m = 1; m <= 12; m++) {
        const t = f.caps.map((c, i) => tickets([[0, i === f.leaver ? m : 12, c]], 12));
        if (eq(split(Q(f.profit), t)[f.leaver], Q(f.share))) ms.push(m);
      }
      if (ms.length !== 1) throw new Error(`find-leave: ${ms.length} solutions`);
      return byValue(options, Q(ms[0]));
    }
    case 'working': {
      const fee = div(mul(Q(f.profit), dq(f.pct)), Q(100));
      const shares = split(sub(Q(f.profit), fee), f.schedules.map((s) => tickets(s, 12)));
      return byValue(options, f.ask === 'working-total' ? add(fee, shares[0]) : shares[1]);
    }
    case 'working-gap':
      return where(options, (P) => {
        const fee = div(mul(P, dq(f.pct)), Q(100));
        const [a, b] = split(sub(P, fee), [f.capA, f.capB]);
        return eq(sub(add(fee, a), b), Q(f.gap));
      });
    case 'find-capital':
      return where(options, (capB) => {
        if (capB.d !== 1n) return false;
        const t = [tickets([[12 - f.monthsA, 12, f.capA]], 12), tickets([[12 - f.monthsB, 12, Number(capB.n)]], 12)];
        return eq(split(Q(f.profit), t)[1], Q(f.shareB));
      });
    case 'ratio-from-profit': {
      // unknown_i = profit_i / known_i
      const a = div(Q(f.profit[0]), Q(f.other[0]));
      const b = div(Q(f.profit[1]), Q(f.other[1]));
      const r = div(a, b);
      return byRatio(options, r.n, r.d);
    }
  }
}

export function verify(res: GenResult<PartnershipFacts>): number[] {
  return res.item.questions.map((q) => solve(res.facts, q.options));
}
