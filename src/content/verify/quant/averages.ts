/**
 * Independent verifier for quant.averages.
 *
 * Works only with totals (average × count) in exact rational arithmetic, never with the generator's
 * deviation shortcuts. Unknown counts are found by enumeration; "find the member" questions substitute
 * each option back and check the stated change in the average. Exactly one option must fit.
 */
import type { GenResult } from '../../generators/types';
import type { AveragesFacts } from '../../generators/quant/averages';

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
/** Exact value of a decimal literal from facts (e.g. 12.4 → 62/5). */
function dq(x: number): Q {
  const s = String(x);
  if (/e/i.test(s)) throw new Error(`cannot read ${s}`);
  const neg = s.startsWith('-');
  const [i, f = ''] = (neg ? s.slice(1) : s).split('.');
  const v = Q(BigInt(i + f), 10n ** BigInt(f.length));
  return neg ? Q(-v.n, v.d) : v;
}
const add = (a: Q, b: Q): Q => Q(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Q, b: Q): Q => Q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q): Q => Q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q): Q => Q(a.n * b.d, a.d * b.n);
const eq = (a: Q, b: Q): boolean => a.n === b.n && a.d === b.d;
const sum = (xs: Q[]): Q => xs.reduce(add, Q(0));

function parseOption(raw: string): Q {
  const s = raw.trim().replace(/\s*(kg|years?|marks)$/i, '').replace(/[₹,\s]/g, '');
  const tex = s.match(/^\$(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$$/);
  if (tex) return add(Q(BigInt(tex[1] ?? '0')), Q(BigInt(tex[2]), BigInt(tex[3])));
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`unparseable option "${raw}"`);
  const [, frac = ''] = s.split('.');
  return Q(BigInt(s.replace('.', '')), 10n ** BigInt(frac.length));
}
function pick(options: readonly string[], ok: (v: Q) => boolean): number {
  const hits = options.map((o, i) => (ok(parseOption(o)) ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) throw new Error(`expected exactly one option to fit, found ${hits.length} in ${JSON.stringify(options)}`);
  return hits[0];
}
const byValue = (options: readonly string[], want: Q): number => pick(options, (v) => eq(v, want));
function uniqueInt(cond: (k: number) => boolean, limit = 3000): number {
  const hits: number[] = [];
  for (let k = 1; k <= limit; k++) if (cond(k)) hits.push(k);
  if (hits.length !== 1) throw new Error(`expected one solution, found ${hits.length}`);
  return hits[0];
}

function solve(f: AveragesFacts, options: readonly string[]): number {
  switch (f.form) {
    case 'join-leave': {
      const oldTotal = mul(Q(f.n), dq(f.avg));
      const newCount = f.mode === 'join' ? f.n + 1 : f.n - 1;
      const newTotal = mul(Q(newCount), add(dq(f.avg), dq(f.change)));
      return byValue(options, f.mode === 'join' ? sub(newTotal, oldTotal) : sub(oldTotal, newTotal));
    }
    case 'replace':
      return pick(options, (x) => eq(div(sub(x, dq(f.out)), Q(f.n)), dq(f.change)));
    case 'replace-two':
      return pick(options, (m) => eq(div(sub(mul(m, Q(2)), Q(f.out[0] + f.out[1])), Q(f.n)), dq(f.change)));
    case 'above-average':
      // Everyone (m people after joining) gains an equal share of the newcomer's excess.
      return pick(options, (m) => m.n > 0n && eq(div(Q(f.above), m), Q(f.rise)));
    case 'misread': {
      let total = mul(Q(f.n), dq(f.avg));
      for (const [right, wrong] of f.pairs) total = add(sub(total, Q(wrong)), Q(right));
      return byValue(options, div(total, Q(f.n)));
    }
    case 'misread-count': {
      const n = uniqueInt((n) => eq(Q(f.wrong - f.right, n), dq(f.rise)));
      return byValue(options, Q(n));
    }
    case 'misread-drop': {
      const total = sub(add(sub(mul(Q(f.n), dq(f.avg)), Q(f.wrong)), Q(f.right)), Q(f.drop));
      return byValue(options, div(total, Q(f.n - 1)));
    }
    case 'runs-needed':
      return pick(options, (x) => eq(div(add(mul(Q(f.n), Q(f.avg)), x), Q(f.n + 1)), Q(f.avg + f.rise)));
    case 'innings-rise':
      return pick(options, (y) => {
        const old = sub(y, Q(f.rise));
        return eq(add(mul(Q(f.n), old), Q(f.score)), mul(Q(f.n + 1), y));
      });
    case 'high-low': {
      const both = sub(mul(Q(f.n), Q(f.avg)), mul(Q(f.n - 2), Q(f.avg2)));
      const lows: number[] = [];
      for (let lo = 0; lo <= 500; lo++) if (eq(Q(2 * lo + f.gap), both)) lows.push(lo); // a duck (0) is a valid lowest score
      if (lows.length !== 1) throw new Error(`high-low: ${lows.length} solutions`);
      const low = lows[0];
      return byValue(options, Q(low + f.gap));
    }
    case 'bowling': {
      const W = uniqueInt((W) => eq(div(add(mul(dq(f.avg), Q(W)), Q(f.r)), Q(W + f.w)), sub(dq(f.avg), dq(f.drop))));
      return byValue(options, Q(W));
    }
    case 'teacher-in':
      return pick(options, (t) => eq(div(add(mul(Q(f.n), Q(f.avg)), t), Q(f.n + 1)), add(Q(f.avg), dq(f.rise))));
    case 'teacher-out':
      return pick(options, (t) => eq(div(sub(mul(Q(f.n + 1), Q(f.avg)), t), Q(f.n)), sub(Q(f.avg), dq(f.fall))));
    case 'teacher-principal':
      return pick(options, (t) => {
        const both = add(mul(t, Q(2)), Q(f.older));
        return eq(div(add(mul(Q(f.n), Q(f.avg)), both), Q(f.n + 2)), add(Q(f.avg), dq(f.rise)));
      });
    case 'teacher-count': {
      const n = uniqueInt((n) => eq(div(add(Q(n * f.avg), Q(f.teacher)), Q(n + 1)), add(Q(f.avg), dq(f.rise))), 500);
      return byValue(options, Q(n));
    }
    case 'consecutive': {
      const avg = dq(f.avg);
      const first = sub(avg, Q((f.k - 1) * f.step, 2));
      const nums = Array.from({ length: f.k }, (_, i) => add(first, Q(i * f.step)));
      if (!eq(div(sum(nums), Q(f.k)), avg)) throw new Error('consecutive: inconsistent');
      const last = nums[f.k - 1];
      if (f.ask === 'largest') return byValue(options, last);
      if (f.ask === 'smallest') return byValue(options, first);
      if (f.ask === 'product') return byValue(options, mul(first, last));
      const next = Array.from({ length: f.k }, (_, i) => add(last, Q((i + 1) * f.step)));
      return byValue(options, div(sum(next), Q(f.k)));
    }
    case 'two-sets': {
      const firstP = sub(dq(f.avgP), Q(f.kP - 1));
      const lastP = add(firstP, Q(2 * (f.kP - 1)));
      const firstQ = add(lastP, Q(f.gap));
      const Qs = Array.from({ length: f.kQ }, (_, i) => add(firstQ, Q(2 * i)));
      return byValue(options, div(sum(Qs), Q(f.kQ)));
    }
    case 'groups': {
      const total = sum(f.counts.map((c, i) => Q(c * f.avgs[i])));
      return byValue(options, div(total, Q(f.counts.reduce((s, c) => s + c, 0))));
    }
    case 'rest-count':
      return pick(options, (N) => {
        const rest = sub(N, Q(f.n1));
        return rest.n > 0n && eq(div(add(Q(f.n1 * f.a1), mul(rest, Q(f.a2))), N), dq(f.overall));
      });
    case 'boys-girls':
      return pick(options, (g) => eq(div(add(Q(f.boys * f.boysAvg), mul(g, Q(f.girlsAvg))), add(Q(f.boys), g)), dq(f.overall)));
    case 'groups-corrected': {
      const avgs = f.avgs.map((a, i) => (i === f.which ? a + f.short : a));
      const total = sum(f.counts.map((c, i) => Q(c * avgs[i])));
      return byValue(options, div(total, Q(f.counts.reduce((s, c) => s + c, 0))));
    }
  }
}

export function verify(res: GenResult<AveragesFacts>): number[] {
  return res.item.questions.map((q) => solve(res.facts, q.options));
}
