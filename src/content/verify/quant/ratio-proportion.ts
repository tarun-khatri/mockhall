/**
 * Independent verifier for quant.ratio-proportion.
 *
 * Unknown multipliers are found by brute-force enumeration (k = 1, 2, 3, …) against every stated condition;
 * "find the share / income / count" questions substitute each option back into the story; ratio chains are
 * rebuilt with exact rationals from A = 1. Exactly one option must fit.
 */
import type { GenResult } from '../../generators/types';
import type { RatioFacts } from '../../generators/quant/ratio-proportion';

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
const add = (a: Q, b: Q): Q => Q(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Q, b: Q): Q => Q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q): Q => Q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q): Q => Q(a.n * b.d, a.d * b.n);
const eq = (a: Q, b: Q): boolean => a.n === b.n && a.d === b.d;
const isInt = (a: Q): boolean => a.d === 1n;
const isqrt = (v: Q): Q | null => {
  for (const part of [v.n, v.d]) if (part < 0n) return null;
  const r = (x: bigint): bigint | null => {
    let lo = 0n;
    let hi = x + 1n;
    while (lo < hi) {
      const mid = (lo + hi) / 2n;
      if (mid * mid < x) lo = mid + 1n;
      else hi = mid;
    }
    return lo * lo === x ? lo : null;
  };
  const a = r(v.n);
  const b = r(v.d);
  return a === null || b === null ? null : Q(a, b);
};

type Parsed = { kind: 'num'; v: Q } | { kind: 'ratio'; parts: bigint[] };

function parseOption(raw: string): Parsed {
  const s = raw.trim();
  if (/^\d+( : \d+)+$/.test(s)) return { kind: 'ratio', parts: s.split(' : ').map((x) => BigInt(x)) };
  const t = s.replace(/[₹,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) throw new Error(`unparseable option "${raw}"`);
  const [, frac = ''] = t.split('.');
  return { kind: 'num', v: Q(BigInt(t.replace('.', '')), 10n ** BigInt(frac.length)) };
}
const num = (o: string): Q => {
  const p = parseOption(o);
  if (p.kind !== 'num') throw new Error(`expected a number, got "${o}"`);
  return p.v;
};

function reduceBig(parts: bigint[]): bigint[] {
  const g = parts.reduce((acc, x) => bgcd(acc, x), 0n) || 1n;
  return parts.map((x) => x / g);
}
/** Integer ratio from rationals. */
function toRatio(vals: Q[]): bigint[] {
  const L = vals.reduce((acc, v) => (acc * v.d) / bgcd(acc, v.d), 1n);
  return reduceBig(vals.map((v) => (v.n * L) / v.d));
}

function pick(options: readonly string[], ok: (o: string) => boolean): number {
  const hits = options.map((o, i) => (ok(o) ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) throw new Error(`expected exactly one option to fit, found ${hits.length} in ${JSON.stringify(options)}`);
  return hits[0];
}
const byValue = (options: readonly string[], want: Q): number => pick(options, (o) => eq(num(o), want));
const byRatio = (options: readonly string[], want: bigint[]): number =>
  pick(options, (o) => {
    const p = parseOption(o);
    return p.kind === 'ratio' && p.parts.length === want.length && reduceBig(p.parts).every((x, i) => x === want[i]);
  });
const where = (options: readonly string[], ok: (v: Q) => boolean): number => pick(options, (o) => ok(num(o)));

/** Smallest positive integer k ≤ limit with cond(k); throws if none or more than one. */
function uniqueK(cond: (k: number) => boolean, limit = 2000): number {
  const hits: number[] = [];
  for (let k = 1; k <= limit; k++) if (cond(k)) hits.push(k);
  if (hits.length !== 1) throw new Error(`expected one multiplier, found ${hits.length}`);
  return hits[0];
}
const sameRatio = (x: number, y: number, p: number, q: number): boolean => x * q === y * p;

function solve(f: RatioFacts, options: readonly string[]): number {
  switch (f.form) {
    case 'split':
      return where(options, (s) => {
        const unit = div(s, Q(f.parts[f.ask]));
        return eq(mul(unit, Q(f.parts.reduce((a, b) => a + b, 0))), Q(f.total));
      });
    case 'split-equal-multiples':
      return where(options, (s) => {
        const product = mul(s, Q(f.mults[f.ask]));
        const total = f.mults.reduce((acc, m) => add(acc, div(product, Q(m))), Q(0));
        return eq(total, Q(f.total));
      });
    case 'split-offset':
      return where(options, (s) => {
        const unit = div(sub(s, Q(f.less[f.ask])), Q(f.parts[f.ask]));
        const total = f.parts.reduce((acc, p, i) => add(acc, add(mul(unit, Q(p)), Q(f.less[i]))), Q(0));
        return eq(total, Q(f.total));
      });
    case 'split-fraction':
      return where(options, (T) => {
        // A = fa (T − A) and B = fb (T − B).
        const fa = Q(f.fa[0], f.fa[1]);
        const fb = Q(f.fb[0], f.fb[1]);
        const A = div(mul(fa, T), add(Q(1), fa));
        const B = div(mul(fb, T), add(Q(1), fb));
        const C = sub(sub(T, A), B);
        return eq(sub(C, B), Q(f.diff));
      });
    case 'add-each': {
      const k = uniqueK((k) => sameRatio(f.a * k + f.add, f.b * k + f.add, f.p, f.q));
      return byValue(options, Q(Math.max(f.a, f.b) * k));
    }
    case 'transfer': {
      const k = uniqueK((k) => f.a * k - f.t > 0 && sameRatio(f.a * k - f.t, f.b * k + f.t, f.p, f.q));
      return byValue(options, Q(f.a * k));
    }
    case 'class-change': {
      const k = uniqueK((k) => f.a * k - f.out > 0 && sameRatio(f.a * k - f.out, f.b * k + f.join, f.p, f.q));
      return byValue(options, Q((f.a + f.b) * k));
    }
    case 'two-shifts': {
      const k = uniqueK((k) => f.a * k - f.sub > 0 && sameRatio(f.a * k - f.sub, f.b * k - f.sub, f.c, f.d));
      const y = uniqueK((y) => sameRatio(f.a * k + y, f.b * k + y, f.e, f.f), 5000);
      return byValue(options, Q(y));
    }
    case 'coin-count':
      return where(options, (c) => {
        const k = div(c, Q(f.counts[f.ask]));
        const paise = f.denoms.reduce((acc, d, i) => add(acc, mul(mul(k, Q(f.counts[i])), Q(d))), Q(0));
        return isInt(k) && eq(paise, Q(f.value * 100));
      });
    case 'coin-value':
      return where(options, (c) => {
        const rupees = div(mul(c, Q(f.denoms[f.ask])), Q(100));
        const k = div(rupees, Q(f.values[f.ask]));
        return eq(mul(k, Q(f.values.reduce((a, b) => a + b, 0))), Q(f.value));
      });
    case 'coin-chain':
      return where(options, (c) => {
        const n0 = div(c, Q(f.r1 * f.r2));
        const counts = [n0, mul(n0, Q(f.r1)), c];
        const paise = counts.reduce((acc, n, i) => add(acc, mul(n, Q(f.denoms[i]))), Q(0));
        return isInt(n0) && eq(paise, Q(f.value * 100));
      });
    case 'coin-diff': {
      const k = uniqueK((k) => (f.counts[0] * k * f.denoms[0] - f.counts[2] * k * f.denoms[2]) === f.diff * 100);
      const paise = f.counts.reduce((s, c, i) => s + c * k * f.denoms[i], 0);
      return byValue(options, Q(paise, 100));
    }
    case 'inc-exp':
      return where(options, (x) => {
        let k: Q;
        let m: Q;
        if (f.ask === 'incA') {
          k = div(x, Q(f.a));
          m = div(sub(mul(Q(f.a), k), Q(f.sA)), Q(f.c));
        } else if (f.ask === 'incB') {
          k = div(x, Q(f.b));
          m = div(sub(mul(Q(f.b), k), Q(f.sB)), Q(f.d));
        } else {
          m = div(x, Q(f.d));
          k = div(add(Q(f.sB), mul(Q(f.d), m)), Q(f.b));
        }
        return eq(sub(mul(Q(f.a), k), mul(Q(f.c), m)), Q(f.sA)) && eq(sub(mul(Q(f.b), k), mul(Q(f.d), m)), Q(f.sB));
      });
    case 'inc-pct':
      return where(options, (incB) => {
        const incA = div(mul(incB, Q(100 + f.x)), Q(100));
        const expA = sub(incA, Q(f.s));
        const expB = sub(incB, Q(f.s));
        return expB.n > 0n && eq(mul(expA, Q(f.d)), mul(expB, Q(f.c)));
      });
    case 'inc-save-pct':
      return where(options, (incA) => {
        const expA = div(mul(incA, Q(100 - f.pct)), Q(100));
        const expB = div(mul(expA, Q(f.d)), Q(f.c));
        const incB = div(mul(incA, Q(f.b)), Q(f.a));
        return eq(sub(incB, expB), Q(f.sB));
      });
    case 'proportional': {
      const [a, b, c] = f.nums.map((x) => Q(x));
      if (f.kind === 'fourth') return where(options, (x) => eq(mul(a, x), mul(b, c)));
      if (f.kind === 'third') return where(options, (x) => eq(mul(a, x), mul(b, b)));
      return where(options, (x) => x.n > 0n && eq(mul(x, x), mul(a, b)));
    }
    case 'prop-sum': {
      const third = div(mul(Q(f.third[1]), Q(f.third[1])), Q(f.third[0]));
      const mean = isqrt(mul(Q(f.mean[0]), Q(f.mean[1])));
      if (!mean) throw new Error('mean proportional not rational');
      return byValue(options, add(third, mean));
    }
    case 'prop-add': {
      const [a, b, c, d] = f.nums;
      const x = uniqueK((x) => (a + x) * (d + x) === (b + x) * (c + x), 5000);
      return byValue(options, Q(x));
    }
    case 'chain': {
      const vals: Q[] = [Q(1)];
      for (const [x, y] of f.pairs) vals.push(div(mul(vals[vals.length - 1], Q(y)), Q(x)));
      const want = f.ask === 'all' ? vals : [vals[0], vals[vals.length - 1]];
      return byRatio(options, toRatio(want));
    }
    case 'equal-products': {
      const [m0, m1, m2, m3] = f.m;
      const A = Q(1);
      const B = div(mul(A, Q(m0)), Q(m1));
      const C = div(mul(B, Q(m2)), Q(m3));
      return byRatio(options, toRatio([A, B, C]));
    }
    case 'compounded': {
      const dup = div(Q(f.dup[0] * f.dup[0]), Q(f.dup[1] * f.dup[1]));
      const root = isqrt(Q(f.subdup[0], f.subdup[1]));
      if (!root) throw new Error('sub-duplicate not rational');
      const inv = Q(f.inv[1], f.inv[0]);
      const r = mul(mul(dup, root), inv);
      return byRatio(options, reduceBig([r.n, r.d]));
    }
    case 'vary': {
      const { power, x1, y1, x2 } = f;
      let y2: Q;
      if (power === 1) y2 = div(mul(Q(y1), Q(x2)), Q(x1));
      else if (power === -1) y2 = div(mul(Q(y1), Q(x1)), Q(x2));
      else if (power === 2) y2 = div(mul(Q(y1), Q(x2 * x2)), Q(x1 * x1));
      else {
        const r = isqrt(Q(x2, x1));
        if (!r) throw new Error('root not rational');
        y2 = mul(Q(y1), r);
      }
      return byValue(options, y2);
    }
    case 'joint': {
      const x2 = div(mul(mul(Q(f.x1), Q(f.y2 * f.y2)), Q(f.z1)), Q(f.y1 * f.y1 * f.z2));
      return byValue(options, x2);
    }
    case 'fixed-variable':
      return where(options, (c3) => {
        // The three (boarders, cost) points must lie on one straight line.
        const s12 = div(Q(f.c2 - f.c1), Q(f.n2 - f.n1));
        const s23 = div(sub(c3, Q(f.c2)), Q(f.n3 - f.n2));
        return eq(s12, s23);
      });
  }
}

export function verify(res: GenResult<RatioFacts>): number[] {
  return res.item.questions.map((q) => solve(res.facts, q.options));
}
