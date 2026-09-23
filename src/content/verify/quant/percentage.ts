/**
 * Independent verifier for quant.percentage.
 *
 * Method: exact BigInt rational arithmetic. Forward questions are re-simulated step by step (year by year,
 * change by change, on a concrete base). "Find the original / total" questions are verified by substituting
 * every option back into the story and keeping the one that reproduces all the stated facts — never by the
 * generator's formula. Options are parsed back to exact values, and exactly one option must match.
 */
import type { GenResult } from '../../generators/types';
import type { PercentageFacts } from '../../generators/quant/percentage';

/* ---------------- exact rationals ---------------- */

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
/** Exact value of a decimal literal stored in facts (e.g. 5.2 → 26/5). */
function dec(x: number): Q {
  const s = String(x);
  if (/e/i.test(s)) throw new Error(`cannot read ${s} exactly`);
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
const isInt = (a: Q): boolean => a.d === 1n;
const neg = (a: Q): Q => Q(-a.n, a.d);
const absQ = (a: Q): Q => (a.n < 0n ? neg(a) : a);
const pctOf = (p: Q, v: Q): Q => div(mul(p, v), Q(100));
/** Apply a signed percentage change. */
const change = (v: Q, p: Q): Q => add(v, pctOf(p, v));
const ZERO = Q(0);
const HUNDRED = Q(100);

/* ---------------- option parsing ---------------- */

function parseOption(raw: string): Q {
  let s = raw.trim();
  if (/^no change$/i.test(s)) return ZERO;
  let sign = 1n;
  const m = s.match(/^(.*)\s+(increase|decrease)$/i);
  if (m) {
    s = m[1];
    if (m[2].toLowerCase() === 'decrease') sign = -1n;
  }
  s = s.replace(/[₹,\s]/g, '').replace(/%$/, '');
  let v: Q;
  const tex = s.match(/^\$(-)?(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$$/);
  if (tex) {
    v = add(Q(BigInt(tex[2] ?? '0')), Q(BigInt(tex[3]), BigInt(tex[4])));
    if (tex[1]) v = neg(v);
  } else if (/^-?\d+(\.\d+)?$/.test(s)) {
    // read the digits from the string itself (no float round-trip)
    const [, frac = ''] = s.split('.');
    const negS = s.startsWith('-');
    const digits = (negS ? s.slice(1) : s).replace('.', '');
    v = Q(BigInt(digits) * (negS ? -1n : 1n), 10n ** BigInt(frac.length));
  } else {
    throw new Error(`unparseable option "${raw}"`);
  }
  return sign === -1n ? neg(v) : v;
}

function indexOfValue(options: readonly string[], want: Q): number {
  const hits = options.map((o, i) => (eq(parseOption(o), want) ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) throw new Error(`expected exactly one option = ${want.n}/${want.d}, found ${hits.length} in ${JSON.stringify(options)}`);
  return hits[0];
}

function indexWhere(options: readonly string[], ok: (v: Q) => boolean): number {
  const hits = options.map((o, i) => (ok(parseOption(o)) ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) throw new Error(`expected exactly one option to satisfy the story, found ${hits.length} in ${JSON.stringify(options)}`);
  return hits[0];
}

/* ---------------- per-form solvers ---------------- */

function solve(f: PercentageFacts, options: readonly string[]): number {
  switch (f.form) {
    case 'compare': {
      // Concrete base: B = 100 units; A = B changed by ±x%.
      const x = Q(f.x[0], f.x[1]);
      const B = Q(100);
      const A = change(B, f.dir === 'more' ? x : neg(x));
      return indexOfValue(options, mul(div(absQ(sub(A, B)), A), HUNDRED));
    }
    case 'consumption': {
      const x = Q(f.x[0], f.x[1]);
      const price1 = change(Q(1), f.dir === 'rise' ? x : neg(x));
      const cons1 = div(Q(1), price1); // expenditure fixed at 1
      return indexOfValue(options, mul(absQ(sub(cons1, Q(1))), HUNDRED));
    }
    case 'price-spend': {
      const price1 = change(Q(1), Q(f.price));
      const spend1 = change(Q(1), Q(f.spend));
      const cons1 = div(spend1, price1);
      return indexOfValue(options, mul(sub(Q(1), cons1), HUNDRED));
    }
    case 'three-way': {
      const C = Q(1000);
      const B = change(C, Q(-f.b));
      const A = change(B, Q(f.a));
      return indexOfValue(options, mul(div(absQ(sub(C, A)), A), HUNDRED));
    }
    case 'salary-chain':
      // Substitute each option as B's salary and rebuild the story.
      return indexWhere(options, (B) => {
        const C = div(B, sub(Q(1), Q(f.b, 100)));
        const A = change(B, Q(f.a));
        const D = change(C, Q(f.d));
        return eq(sub(D, A), Q(f.diff));
      });
    case 'net-change': {
      let v = HUNDRED;
      for (const c of f.changes) v = change(v, Q(c));
      return indexOfValue(options, sub(v, HUNDRED));
    }
    case 'final-value': {
      let v = Q(f.start);
      for (const c of f.changes) v = change(v, Q(c));
      return indexOfValue(options, v);
    }
    case 'original-value':
      return indexWhere(options, (s) => eq(f.changes.reduce((v, c) => change(v, Q(c)), s), Q(f.final)));
    case 'unknown-change':
      return indexWhere(options, (x) => {
        const v = change(change(change(HUNDRED, Q(f.first)), neg(x)), Q(f.last));
        return eq(v, add(HUNDRED, Q(f.net)));
      });
    case 'drop-amount':
      return indexWhere(options, (s) => eq(sub(s, change(change(s, Q(f.up)), Q(-f.down))), Q(f.drop)));
    case 'growth': {
      let v = Q(f.start);
      for (const r of f.rates) v = change(v, Q(r));
      return indexOfValue(options, v);
    }
    case 'years-ago':
      return indexWhere(options, (p) => eq(f.rates.reduce((v, r) => change(v, Q(r)), p), Q(f.present)));
    case 'birth-death': {
      let p = Q(f.start);
      for (let y = 0; y < f.years; y++) {
        const births = pctOf(dec(f.birth), p);
        const deaths = pctOf(dec(f.death), p);
        p = sub(add(p, births), deaths);
      }
      return indexOfValue(options, p);
    }
    case 'find-rate':
      return indexWhere(options, (r) => eq(change(change(Q(f.start), r), r), Q(f.end)));
    case 'migration': {
      let p = change(Q(f.start), Q(f.rate));
      p = sub(p, Q(f.moved));
      p = change(p, Q(f.rate));
      return indexOfValue(options, p);
    }
    case 'election':
      return indexWhere(options, (x) => {
        // Rebuild every tally from the candidate value and check the stated margin.
        const w = Q(f.winner, 100);
        const keepValid = sub(Q(1), Q(f.invalid, 100));
        const keepCast = sub(Q(1), Q(f.notVoted, 100));
        let cast: Q;
        if (f.base === 'total') {
          cast = x;
          const W = mul(cast, w);
          const L = sub(mul(cast, keepValid), W);
          return f.ask === 'total' && eq(sub(W, L), Q(f.margin));
        }
        switch (f.ask) {
          case 'registered':
            cast = mul(x, keepCast);
            break;
          case 'total':
            cast = x;
            break;
          case 'valid':
            cast = div(x, keepValid);
            break;
          case 'winner':
            cast = div(div(x, w), keepValid);
            break;
          case 'loser':
            cast = div(div(x, sub(Q(1), w)), keepValid);
            break;
          default:
            throw new Error('election: unknown ask');
        }
        const valid = mul(cast, keepValid);
        const W = mul(valid, w);
        const L = sub(valid, W);
        return isInt(W) && isInt(L) && eq(sub(W, L), Q(f.margin));
      });
    case 'election3':
      return indexWhere(options, (c) => {
        const cShare = Q(100 - f.a - f.b, 100);
        const valid = div(c, cShare);
        const A = mul(valid, Q(f.a, 100));
        const B = mul(valid, Q(f.b, 100));
        return eq(sub(A, B), Q(f.margin));
      });
    case 'election-swing':
      return indexWhere(options, (T) => {
        const W = div(add(T, Q(f.margin)), Q(2));
        const L = sub(T, W);
        const moved = mul(W, Q(f.swing, 100));
        return isInt(W) && eq(sub(add(L, moved), sub(W, moved)), Q(f.reverse));
      });
    case 'spend-heads':
      return indexWhere(options, (inc) => {
        let left = inc;
        for (const h of f.heads) left = sub(left, pctOf(Q(h), inc));
        return eq(left, Q(f.saving));
      });
    case 'spend-chain':
      return indexWhere(options, (inc) => {
        let left = inc;
        for (const h of f.heads) left = sub(left, pctOf(Q(h), left));
        return eq(left, Q(f.saving));
      });
    case 'savings-change': {
      const inc0 = Q(1000);
      const exp0 = sub(inc0, pctOf(Q(f.s), inc0));
      const sav0 = sub(inc0, exp0);
      const sav1 = sub(change(inc0, Q(f.a)), change(exp0, Q(f.b)));
      return indexOfValue(options, mul(div(sub(sav1, sav0), sav0), HUNDRED));
    }
    case 'savings-new': {
      const inc0 = Q(f.income);
      const exp0 = sub(inc0, pctOf(Q(f.s), inc0));
      return indexOfValue(options, sub(change(inc0, Q(f.a)), change(exp0, Q(f.b))));
    }
    case 'two-earners':
      return indexWhere(options, (incA) => {
        const k = div(incA, Q(f.p));
        const incB = mul(k, Q(f.q));
        const expA = sub(incA, pctOf(Q(f.sA), incA));
        const expB = sub(incB, pctOf(Q(f.sB), incB));
        return eq(sub(expA, expB), Q(f.diff));
      });
    case 'pass-max':
      return indexWhere(options, (max) => eq(pctOf(Q(f.pass), max), Q(f.got + f.short)));
    case 'two-students': {
      // Enumerate the maximum marks; exactly one integer value satisfies both students.
      const found: bigint[] = [];
      for (let m = 1; m <= 5000; m++) {
        const M = Q(m);
        const passFromA = add(pctOf(Q(f.a), M), Q(f.short));
        const passFromB = sub(pctOf(Q(f.b), M), Q(f.extra));
        if (eq(passFromA, passFromB) && isInt(passFromA)) found.push(BigInt(m));
      }
      if (found.length !== 1) throw new Error(`two-students: ${found.length} maxima fit`);
      const M = Q(found[0]);
      const passMarks = add(pctOf(Q(f.a), M), Q(f.short));
      const want = f.ask === 'max' ? M : f.ask === 'pass-marks' ? passMarks : mul(div(passMarks, M), HUNDRED);
      return indexOfValue(options, want);
    }
    case 'aggregate': {
      const needTotal = pctOf(Q(f.pass), Q(f.papers * f.maxEach));
      const got = f.scored.reduce((s, x) => s + x, 0);
      for (let last = 0; last <= f.maxEach; last++) {
        const total = Q(got + last);
        if (total.n * needTotal.d >= needTotal.n * total.d) return indexOfValue(options, Q(last));
      }
      throw new Error('aggregate: pass impossible');
    }
    case 'fail-both':
      return indexWhere(options, (T) => {
        const fa = pctOf(Q(f.failA), T);
        const fb = pctOf(Q(f.failB), T);
        const both = pctOf(Q(f.both), T);
        const failedAny = sub(add(fa, fb), both);
        return eq(sub(T, failedAny), Q(f.passedBoth));
      });
    case 'of-chain':
      return indexWhere(options, (A) => {
        const B = div(mul(A, HUNDRED), Q(f.p1));
        const C = div(mul(B, HUNDRED), Q(f.p2));
        return eq(C, Q(f.value));
      });
    case 'equal-parts':
      return indexWhere(options, (A) => {
        const B = div(pctOf(Q(f.p), A), Q(f.q, 100));
        return eq(absQ(sub(A, B)), Q(f.diff));
      });
    case 'mixed-chain': {
      const D = Q(100);
      const C = change(D, Q(f.c));
      const B = pctOf(Q(f.b), C);
      const A = change(B, Q(f.a));
      return indexOfValue(options, mul(div(A, D), HUNDRED));
    }
    case 'composition':
      return indexWhere(options, (T) => {
        const girls = pctOf(Q(f.girls), T);
        const boys = sub(T, girls);
        const opted = add(pctOf(Q(f.girlsOpt), girls), pctOf(Q(f.boysOpt), boys));
        return eq(sub(T, opted), Q(f.notOpting));
      });
    case 'split-rest':
      // Candidate difference → group size → size of "the rest" must match.
      return indexWhere(options, (d) => {
        const T = div(mul(d, HUNDRED), Q(f.a - f.b));
        const rest = sub(sub(T, pctOf(Q(f.a), T)), pctOf(Q(f.b), T));
        return isInt(T) && eq(rest, Q(f.rest));
      });
    case 'split-nested':
      return indexWhere(options, (metro) => {
        const T = div(mul(metro, HUNDRED), Q(f.b));
        const remaining = sub(sub(T, pctOf(Q(f.a), T)), metro);
        const walk = sub(remaining, pctOf(Q(f.c), remaining));
        return eq(walk, Q(f.last));
      });
    case 'split-sets':
      return indexWhere(options, (onlyA) => {
        const T = div(mul(onlyA, HUNDRED), Q(f.a - f.both));
        const atLeastOne = sub(add(pctOf(Q(f.a), T), pctOf(Q(f.b), T)), pctOf(Q(f.both), T));
        return eq(sub(T, atLeastOne), Q(f.neither));
      });
    case 'split-levels':
      return indexWhere(options, (gradWomen) => {
        const women = div(mul(gradWomen, HUNDRED), Q(f.gradW));
        const T = div(mul(women, HUNDRED), Q(100 - f.men));
        const men = sub(T, women);
        return eq(sub(men, pctOf(Q(f.gradM), men)), Q(f.nonGradMen));
      });
  }
}

export function verify(res: GenResult<PercentageFacts>): number[] {
  return res.item.questions.map((q) => solve(res.facts, q.options));
}
