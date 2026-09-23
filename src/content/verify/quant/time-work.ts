/**
 * Independent verifier for quant.time-work.
 *
 * Method: exact BigInt rationals; work is accumulated day by day (each day's active workers add their
 * daily fraction of the job, the last day is pro-rated), and inverse questions substitute every option
 * back into that simulation. No LCM-unit shortcuts from the generator are reused.
 */
import type { GenResult } from '../../generators/types';
import type { WorkFacts } from '../../generators/quant/time-work';

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
const minQ = (a: Q, b: Q) => (cmp(a, b) <= 0 ? a : b);
const maxQ = (a: Q, b: Q) => (cmp(a, b) >= 0 ? a : b);
const inv = (a: Q) => div(ONE, a);
const isPos = (a: Q) => a.n > 0n;

function parseOption(text: string): Q {
  const s = text.replace(/[₹,\s]/g, '');
  const frac = s.match(/^\$(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$/);
  if (frac) return mk(BigInt(frac[1] ?? '0') * BigInt(frac[3]) + BigInt(frac[2]), BigInt(frac[3]));
  const n = s.match(/^\d+(\.\d+)?/);
  if (!n) throw new Error(`cannot parse option "${text}"`);
  const [i, f = ''] = n[0].split('.');
  return mk(BigInt(i + f), 10n ** BigInt(f.length));
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

/* ------------------------------ simulation ------------------------------ */

/** Steps day by day; `rate(n)` is the fraction of the job done on day n (0-based). Returns finishing time. */
function runDays(rate: (n: number) => Q, target: Q = ONE): Q {
  let done = ZERO;
  for (let n = 0; n < 100000; n++) {
    const r = rate(n);
    if (isPos(r) && cmp(add(done, r), target) >= 0) return add(q(n), div(sub(target, done), r));
    done = add(done, r);
  }
  throw new Error('job never finishes');
}

/** Work done by time T when each worker is active on [start, end) with the given daily fraction. */
function workBy(T: Q, shifts: { start: Q; end: Q; rate: Q }[]): Q {
  let w = ZERO;
  for (const s of shifts) {
    const len = sub(minQ(s.end, T), maxQ(s.start, ZERO));
    if (isPos(len)) w = add(w, mul(len, s.rate));
  }
  return w;
}

const together = (...ds: Q[]) => runDays(() => ds.reduce((s, d) => add(s, inv(d)), ZERO));

function need(g: Record<string, number>, k: string): Q {
  const v = g[k];
  if (v === undefined || !Number.isFinite(v)) throw new Error(`facts missing ${k}`);
  return q(v);
}

export function verify(res: GenResult<WorkFacts>): number[] {
  return [solve(res.facts, res.item.questions[0].options)];
}

function solve(f: WorkFacts, options: readonly string[]): number {
  const g = f.given;
  switch (f.form) {
    case 'eff-ratio': {
      const [effAsk, effOther] = f.ask === 'A' ? [need(g, 'p'), need(g, 'q')] : [need(g, 'q'), need(g, 'p')];
      return pickWhere(options, (X) => eq(together(X, div(mul(X, effAsk), effOther)), need(g, 'T')));
    }
    case 'eff-chain': {
      return pickWhere(options, (Cd) => {
        const Bd = div(mul(Cd, q(100)), add(q(100), need(g, 'y')));
        const Ad = div(mul(Bd, q(100)), add(q(100), need(g, 'x')));
        return eq(together(Ad, Bd, Cd), need(g, 'T'));
      });
    }
    case 'eff-gap': {
      const k = div(need(g, 'kNum'), need(g, 'kDen'));
      return pickWhere(options, (tau) => {
        // joint daily work 1/τ shared k : 1 between A and B
        const rB = div(inv(tau), add(k, ONE));
        const rA = mul(rB, k);
        return eq(sub(inv(rB), inv(rA)), need(g, 'd'));
      });
    }
    case 'together':
      return pickValue(options, together(...(f.list ?? []).map(q)));
    case 'pair-find':
      return pickWhere(options, (b) => eq(together(need(g, 'a'), b), need(g, 'T')));
    case 'pairs': {
      const [ab, bc, ca] = [inv(need(g, 'AB')), inv(need(g, 'BC')), inv(need(g, 'CA'))];
      if (f.ask === 'all') {
        return pickWhere(options, (tau) => {
          const total = inv(tau);
          const rA = sub(total, bc);
          const rB = sub(total, ca);
          const rC = sub(total, ab);
          return isPos(rA) && isPos(rB) && isPos(rC) && eq(add(rA, rB), ab);
        });
      }
      return pickWhere(options, (Ad) => {
        const rA = inv(Ad);
        const rB = sub(ab, rA);
        const rC = sub(ca, rA);
        return isPos(rB) && isPos(rC) && eq(add(rB, rC), bc);
      });
    }
    case 'sqrt-rule':
      return pickWhere(options, (T) => eq(add(inv(add(T, need(g, 'p'))), inv(add(T, need(g, 'q')))), inv(T)));
    case 'leave-after': {
      const [ra, rb] = [inv(need(g, 'a')), inv(need(g, 'b'))];
      const d = Number(g.d);
      const total = runDays((n) => (n < d ? add(ra, rb) : rb));
      return pickValue(options, f.ask === 'total' ? total : sub(total, q(d)));
    }
    case 'leave-before': {
      const [ra, rb, d] = [inv(need(g, 'a')), inv(need(g, 'b')), need(g, 'd')];
      return pickWhere(options, (T) =>
        eq(
          workBy(T, [
            { start: ZERO, end: sub(T, d), rate: ra },
            { start: ZERO, end: T, rate: rb },
          ]),
          ONE,
        ),
      );
    }
    case 'three-leave': {
      const [ra, rb, rc] = [inv(need(g, 'a')), inv(need(g, 'b')), inv(need(g, 'c'))];
      return pickWhere(options, (T) =>
        eq(
          workBy(T, [
            { start: ZERO, end: need(g, 'd1'), rate: ra },
            { start: ZERO, end: sub(T, need(g, 'd2')), rate: rb },
            { start: ZERO, end: T, rate: rc },
          ]),
          ONE,
        ),
      );
    }
    case 'join-later': {
      const [ra, rb, rc] = [inv(need(g, 'a')), inv(need(g, 'b')), inv(need(g, 'c'))];
      const d1 = Number(g.d1);
      const d12 = d1 + Number(g.d2);
      return pickValue(options, runDays((n) => add(ra, add(n >= d1 ? rb : ZERO, n >= d12 ? rc : ZERO))));
    }
    case 'rotation': {
      const rates = (f.list ?? []).map((d) => inv(q(d)));
      return pickValue(options, runDays((n) => rates[n % rates.length]));
    }
    case 'helper-alt': {
      const [ra, rb] = [inv(need(g, 'a')), inv(need(g, 'b'))];
      return pickValue(options, runDays((n) => ((n + 1) % 2 === 0 ? add(ra, rb) : ra)));
    }
    case 'mdh': {
      const perUnit = div(mul(mul(need(g, 'M1'), need(g, 'D1')), need(g, 'H1')), need(g, 'W1'));
      const required = mul(perUnit, need(g, 'W2'));
      if (f.ask === 'D2') {
        const daily = mul(need(g, 'M2'), need(g, 'H2'));
        return pickValue(options, runDays(() => daily, required));
      }
      return pickWhere(options, (M2) => eq(mul(mul(M2, need(g, 'D2')), need(g, 'H2')), required));
    }
    case 'mid-change': {
      const M1 = need(g, 'M1');
      const d = Number(g.d);
      const M2 = add(M1, need(g, 'change'));
      const total = mul(M1, need(g, 'D1'));
      const finish = runDays((n) => (n < d ? M1 : M2), total);
      return pickValue(options, sub(finish, q(d)));
    }
    case 'wage-pair': {
      const [a, b] = [need(g, 'a'), need(g, 'b')];
      const t = together(a, b);
      return pickValue(options, mul(need(g, 'pay'), div(t, a)));
    }
    case 'wage-three': {
      const ds = [need(g, 'a'), need(g, 'b'), need(g, 'c')];
      const t = together(...ds);
      return pickValue(options, mul(need(g, 'pay'), div(t, ds[Number(f.ask)])));
    }
    case 'wage-helper': {
      const T = need(g, 'T');
      const cWork = sub(ONE, add(div(T, need(g, 'a')), div(T, need(g, 'b'))));
      return pickValue(options, mul(need(g, 'pay'), cWork));
    }
    case 'wage-late': {
      const [ra, rb] = [inv(need(g, 'a')), inv(need(g, 'b'))];
      const d = Number(g.d);
      const total = runDays((n) => (n < d ? ra : add(ra, rb)));
      return pickValue(options, mul(need(g, 'pay'), mul(total, ra)));
    }
    case 'mw-equiv': {
      const D = need(g, 'D');
      const man = inv(mul(need(g, 'k1'), D));
      const woman = inv(mul(need(g, 'k2'), D));
      const team = add(mul(need(g, 'm'), man), mul(need(g, 'w'), woman));
      return pickValue(options, runDays(() => team));
    }
    case 'mw-teams': {
      const [a1, b1, D1, a2, b2, D2] = ['a1', 'b1', 'D1', 'a2', 'b2', 'D2'].map((k) => need(g, k));
      return pickWhere(options, (X) => {
        let rm: Q;
        let rw: Q;
        if (f.ask === 'man') {
          rm = inv(X);
          rw = div(sub(inv(D1), mul(a1, rm)), b1);
        } else {
          rw = inv(X);
          rm = div(sub(inv(D1), mul(b1, rw)), a1);
        }
        if (!isPos(rm) || !isPos(rw)) return false;
        return eq(runDays(() => add(mul(a2, rm), mul(b2, rw))), D2);
      });
    }
    default:
      throw new Error(`verify: unknown form ${f.form}`);
  }
}
