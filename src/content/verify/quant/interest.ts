/**
 * Independent verifier for quant.interest.
 *
 * Method: exact BigInt rational arithmetic with month-by-month simple interest and period-by-period
 * compounding simulations. Inverse questions ("find the sum / rate / time / instalment") are verified by
 * substituting every option back into the forward simulation and requiring exactly one option to reproduce
 * the stated data. Nothing here reuses generator formulas or shortcuts.
 */
import type { GenResult } from '../../generators/types';
import type { InterestFacts } from '../../generators/quant/interest';

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

/** Exact rational from a decimal number or string (no exponent forms). */
function q(x: number | string): Q {
  const s = typeof x === 'number' ? String(x) : x.trim();
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
const isInt = (a: Q) => a.d === 1n;

/* ------------------------------ option parsing ------------------------------ */

/** "₹12,34,500" → 1234500; "12.5%" → 25/2; "$2\frac{1}{2}$ years" → 5/2; "7 years" → 7. */
function parseOption(text: string): Q {
  const s = text.replace(/[₹,\s]/g, '');
  const frac = s.match(/^\$(-)?(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$/);
  if (frac) {
    const sign = frac[1] ? -1n : 1n;
    const whole = BigInt(frac[2] ?? '0');
    const a = BigInt(frac[3]);
    const b = BigInt(frac[4]);
    return mk(sign * (whole * b + a), b);
  }
  const num = s.match(/^-?\d+(\.\d+)?/);
  if (num) return q(num[0]);
  throw new Error(`cannot parse option "${text}"`);
}

function pickWhere(options: readonly string[], test: (v: Q) => boolean): number {
  const hits: number[] = [];
  options.forEach((o, i) => {
    if (test(parseOption(o))) hits.push(i);
  });
  if (hits.length !== 1) throw new Error(`expected exactly one option to fit the facts, found ${hits.length}: ${JSON.stringify(options)}`);
  return hits[0];
}

const pickValue = (options: readonly string[], v: Q) => pickWhere(options, (x) => eq(x, v));

/* ------------------------------ simulations ------------------------------ */

/** Simple interest accrued month by month. */
function siSim(P: Q, R: Q, months: number): Q {
  if (!Number.isInteger(months) || months < 0) throw new Error(`bad months ${months}`);
  const perMonth = div(mul(P, R), q(1200));
  let total = ZERO;
  for (let i = 0; i < months; i++) total = add(total, perMonth);
  return total;
}

/** Months for a (possibly rational) number of years; null when not a whole number of months. */
function monthsOf(years: Q): number | null {
  const m = mul(years, q(12));
  if (!isInt(m) || m.n < 0n) return null;
  return Number(m.n);
}

/** Amount after `periods` compounding periods, the rate per period being R/perYear %. */
function ciSim(P: Q, R: Q, perYear: number, periods: number): Q {
  const rate = div(R, q(100 * perYear));
  let amt = P;
  for (let i = 0; i < periods; i++) amt = add(amt, mul(amt, rate));
  return amt;
}

function need(g: Record<string, number>, key: string): Q {
  const v = g[key];
  if (v === undefined || !Number.isFinite(v)) throw new Error(`facts missing "${key}"`);
  return q(v);
}

function needNum(g: Record<string, number>, key: string): number {
  const v = g[key];
  if (v === undefined || !Number.isFinite(v)) throw new Error(`facts missing "${key}"`);
  return v;
}

/* ------------------------------ verifier ------------------------------ */

export function verify(res: GenResult<InterestFacts>): number[] {
  const f = res.facts;
  const g = f.given;
  const options = res.item.questions[0].options;
  return [solve(f, g, options)];
}

function solve(f: InterestFacts, g: Record<string, number>, options: readonly string[]): number {
  switch (f.form) {
    case 'si-find': {
      const P = need(g, 'P');
      const si = siSim(P, need(g, 'R'), 12 * needNum(g, 'T'));
      return pickValue(options, f.ask === 'si' ? si : add(P, si));
    }
    case 'si-months':
      return pickValue(options, siSim(need(g, 'P'), need(g, 'R'), needNum(g, 'months')));
    case 'si-principal': {
      const R = need(g, 'R');
      const m = 12 * needNum(g, 'T');
      if (g.A !== undefined) return pickWhere(options, (P) => eq(add(P, siSim(P, R, m)), need(g, 'A')));
      return pickWhere(options, (P) => eq(siSim(P, R, m), need(g, 'SI')));
    }
    case 'si-rate': {
      const P = need(g, 'P');
      const m = 12 * needNum(g, 'T');
      return pickWhere(options, (R) => eq(add(P, siSim(P, R, m)), need(g, 'A')));
    }
    case 'si-time': {
      const P = need(g, 'P');
      const R = need(g, 'R');
      const target = g.A !== undefined ? sub(need(g, 'A'), P) : need(g, 'SI');
      return pickWhere(options, (T) => {
        const m = monthsOf(T);
        return m !== null && eq(siSim(P, R, m), target);
      });
    }
    case 'si-two-amounts': {
      const A1 = need(g, 'A1');
      const A2 = need(g, 'A2');
      const m1 = 12 * needNum(g, 't1');
      const m2 = 12 * needNum(g, 't2');
      if (f.ask === 'principal') {
        return pickWhere(options, (P) => {
          // rate implied by the first amount, then the second amount must follow
          const unit = siSim(P, ONE, m1);
          if (unit.n === 0n) return false;
          const R = div(sub(A1, P), unit);
          return R.n > 0n && eq(add(P, siSim(P, R, m2)), A2);
        });
      }
      return pickWhere(options, (R) => {
        const P = div(A1, add(ONE, siSim(ONE, R, m1)));
        return eq(add(P, siSim(P, R, m2)), A2);
      });
    }
    case 'si-rate-eq-time': {
      const target = div(need(g, 'fracNum'), need(g, 'fracDen'));
      return pickWhere(options, (R) => {
        const m = monthsOf(R);
        return m !== null && eq(siSim(ONE, R, m), target);
      });
    }
    case 'si-rate-increase': {
      const m = 12 * needNum(g, 'T');
      const base = q(7);
      const up = add(base, need(g, 'rise'));
      return pickWhere(options, (P) => eq(sub(siSim(P, up, m), siSim(P, base, m)), need(g, 'extra')));
    }
    case 'si-two-sums': {
      const P1 = need(g, 'P1');
      const P2 = need(g, 'P2');
      const m1 = 12 * needNum(g, 't1');
      const m2 = 12 * needNum(g, 't2');
      return pickWhere(options, (R) => eq(add(siSim(P1, R, m1), siSim(P2, R, m2)), need(g, 'I')));
    }
    case 'si-rate-change': {
      const schedule: number[] = [];
      for (const [r, t] of [
        ['r1', 't1'],
        ['r2', 't2'],
        ['r3', 't3'],
      ] as const) {
        for (let i = 0; i < needNum(g, t); i++) schedule.push(needNum(g, r));
      }
      const interest = (P: Q) => schedule.reduce((acc, r) => add(acc, siSim(P, q(r), 12)), ZERO);
      if (f.ask === 'si') return pickValue(options, interest(need(g, 'P')));
      return pickWhere(options, (P) => eq(interest(P), need(g, 'I')));
    }
    case 'si-rate-time-change': {
      const T = needNum(g, 'T');
      const I = need(g, 'I');
      const J = need(g, 'J');
      return pickWhere(options, (P) => {
        const unit = siSim(P, ONE, 12 * T);
        if (unit.n === 0n) return false;
        const R = div(I, unit);
        return eq(siSim(P, add(R, need(g, 'rise')), 12 * (T - needNum(g, 'cut'))), J);
      });
    }
    case 'si-reinvest': {
      const P = need(g, 'P');
      const A1 = add(P, siSim(P, need(g, 'r1'), 12 * needNum(g, 't1')));
      const A2 = add(A1, siSim(A1, need(g, 'r2'), 12 * needNum(g, 't2')));
      return pickValue(options, f.ask === 'interest' ? sub(A2, P) : A2);
    }
    case 'ci-find': {
      const P = need(g, 'P');
      const A = ciSim(P, need(g, 'R'), needNum(g, 'perYear'), needNum(g, 'periods'));
      return pickValue(options, f.ask === 'ci' ? sub(A, P) : A);
    }
    case 'ci-principal': {
      const R = need(g, 'R');
      const k = needNum(g, 'perYear');
      const n = needNum(g, 'periods');
      if (g.A !== undefined) return pickWhere(options, (P) => eq(ciSim(P, R, k, n), need(g, 'A')));
      return pickWhere(options, (P) => eq(sub(ciSim(P, R, k, n), P), need(g, 'CI')));
    }
    case 'ci-different-rates': {
      const P = need(g, 'P');
      let amt = P;
      for (const r of f.list ?? []) amt = ciSim(amt, q(r), 1, 1);
      return pickValue(options, sub(amt, P));
    }
    case 'ci-from-si': {
      const R = need(g, 'R');
      const years = needNum(g, 'T');
      const P = div(need(g, 'SI'), siSim(ONE, R, 12 * years));
      return pickValue(options, sub(ciSim(P, R, 1, years), P));
    }
    case 'ci-from-amounts': {
      const A1 = need(g, 'A1');
      const A2 = need(g, 'A2');
      const t1 = needNum(g, 't1');
      const gap = needNum(g, 't2') - t1;
      if (f.ask === 'rate') return pickWhere(options, (R) => eq(ciSim(A1, R, 1, gap), A2));
      if (gap !== 1) throw new Error('ci-from-amounts expects consecutive years');
      const R = mul(sub(div(A2, A1), ONE), q(100));
      return pickWhere(options, (P) => eq(ciSim(P, R, 1, t1), A1));
    }
    case 'ci-fraction-year': {
      const P = need(g, 'P');
      const R = need(g, 'R');
      const whole = ciSim(P, R, 1, needNum(g, 'years'));
      const amt = add(whole, siSim(whole, R, 6 * needNum(g, 'halfYear')));
      return pickValue(options, sub(amt, P));
    }
    case 'ci-frequency-gap': {
      const P = need(g, 'P');
      const R = need(g, 'R');
      const months = needNum(g, 'months');
      const fast = needNum(g, 'fast');
      const slow = needNum(g, 'slow');
      const cFast = sub(ciSim(P, R, fast, (months * fast) / 12), P);
      const cSlow = sub(ciSim(P, R, slow, (months * slow) / 12), P);
      return pickValue(options, sub(cFast, cSlow));
    }
    case 'diff2': {
      const gap2 = (P: Q, R: Q) => sub(sub(ciSim(P, R, 1, 2), P), siSim(P, R, 24));
      if (f.ask === 'diff') return pickValue(options, gap2(need(g, 'P'), need(g, 'R')));
      if (f.ask === 'ci3') {
        const R = need(g, 'R');
        const P = div(need(g, 'diff'), gap2(ONE, R));
        return pickValue(options, sub(ciSim(P, R, 1, 3), P));
      }
      if (g.SI !== undefined) {
        const SI = need(g, 'SI');
        const CI = need(g, 'CI');
        if (f.ask === 'rate') {
          return pickWhere(options, (R) => {
            const P = div(SI, siSim(ONE, R, 24));
            return eq(sub(ciSim(P, R, 1, 2), P), CI);
          });
        }
        return pickWhere(options, (P) => {
          const R = div(SI, siSim(P, ONE, 24));
          return eq(sub(ciSim(P, R, 1, 2), P), CI);
        });
      }
      if (f.ask === 'principal') return pickWhere(options, (P) => eq(gap2(P, need(g, 'R')), need(g, 'diff')));
      return pickWhere(options, (R) => eq(gap2(need(g, 'P'), R), need(g, 'diff')));
    }
    case 'diff3': {
      const gapN = (P: Q, R: Q, n: number) => sub(sub(ciSim(P, R, 1, n), P), siSim(P, R, 12 * n));
      if (f.ask === 'diff') return pickValue(options, gapN(need(g, 'P'), need(g, 'R'), 3));
      if (f.ask === 'principal') return pickWhere(options, (P) => eq(gapN(P, need(g, 'R'), 3), need(g, 'diff')));
      if (f.ask === 'diff3') {
        const R = need(g, 'R');
        const P = div(need(g, 'diff2'), gapN(ONE, R, 2));
        return pickValue(options, gapN(P, R, 3));
      }
      if (f.ask === 'rate') {
        return pickWhere(options, (R) => {
          const unit2 = gapN(ONE, R, 2);
          if (unit2.n === 0n) return false;
          const P = div(need(g, 'diff2'), unit2);
          return eq(gapN(P, R, 3), need(g, 'diff3'));
        });
      }
      // si3
      const R = need(g, 'R');
      const P = div(need(g, 'diff'), gapN(ONE, R, 3));
      return pickValue(options, siSim(P, R, 36));
    }
    case 'multiple': {
      const ci = needNum(g, 'ci') === 1;
      const years1 = needNum(g, 'years1');
      if (f.ask === 'rate') {
        const target = g.fracNum !== undefined ? sub(div(need(g, 'fracNum'), need(g, 'fracDen')), ONE) : sub(need(g, 'k1'), ONE);
        return pickWhere(options, (R) => eq(siSim(ONE, R, 12 * years1), target));
      }
      if (f.ask === 'ci') {
        // rate from the SI multiple, then two years of compounding on X
        const perYear = div(sub(need(g, 'k1'), ONE), q(years1));
        const R = mul(perYear, q(100));
        const X = need(g, 'X');
        return pickValue(options, sub(ciSim(X, R, 1, 2), X));
      }
      const k1 = needNum(g, 'k1');
      const k2 = needNum(g, 'k2');
      if (!ci) {
        const perYear = div(q(k1 - 1), q(years1));
        let amt = ONE;
        let year = 0;
        const target = q(k2);
        while (amt.n * target.d < target.n * amt.d && year < 1000) {
          amt = add(amt, perYear);
          year++;
        }
        if (!eq(amt, target)) throw new Error('SI multiple not reached in whole years');
        return pickValue(options, q(year));
      }
      // CI: k1^T = k2^years1 (T in years)
      return pickWhere(options, (T) => isInt(T) && T.n > 0n && BigInt(k1) ** T.n === BigInt(k2) ** BigInt(years1));
    }
    case 'split-two': {
      const S = need(g, 'S');
      const r1 = needNum(g, 'r1');
      const r2 = needNum(g, 'r2');
      const askRate = needNum(g, 'askRate');
      const otherRate = askRate === r1 ? r2 : r1;
      const m = 12 * needNum(g, 't');
      return pickWhere(options, (part) => {
        const other = sub(S, part);
        return other.n > 0n && eq(add(siSim(part, q(askRate), m), siSim(other, q(otherRate), m)), need(g, 'I'));
      });
    }
    case 'split-equal': {
      const S = need(g, 'S');
      const first = needNum(g, 'which') === 1;
      return pickWhere(options, (part) => {
        const a = first ? part : sub(S, part);
        const b = sub(S, a);
        return a.n > 0n && b.n > 0n && eq(siSim(a, need(g, 'r1'), 12 * needNum(g, 't1')), siSim(b, need(g, 'r2'), 12 * needNum(g, 't2')));
      });
    }
    case 'split-three': {
      const S = need(g, 'S');
      const askRate = needNum(g, 'askRate');
      const rates = f.list ?? [];
      return pickWhere(options, (part) => {
        const yearly = siSim(part, q(askRate), 12);
        // every other part must earn the same yearly interest; together they must make S
        let total = ZERO;
        for (const r of rates) total = add(total, div(yearly, siSim(ONE, q(r), 12)));
        return eq(total, S);
      });
    }
    case 'split-gap': {
      const S = need(g, 'S');
      const m = 12 * needNum(g, 't');
      return pickWhere(options, (x) => eq(sub(siSim(x, need(g, 'r1'), m), siSim(sub(S, x), need(g, 'r2'), m)), need(g, 'gap')));
    }
    case 'split-ci': {
      const S = need(g, 'S');
      const R = need(g, 'R');
      const tShort = needNum(g, 'tShort');
      const tLong = needNum(g, 'tLong');
      const askShort = needNum(g, 'askShort') === 1;
      return pickWhere(options, (share) => {
        const x = askShort ? share : sub(S, share);
        const y = sub(S, x);
        return x.n > 0n && y.n > 0n && eq(ciSim(x, R, 1, tShort), ciSim(y, R, 1, tLong));
      });
    }
    case 'ci-instalment': {
      const R = need(g, 'R');
      const n = needNum(g, 'n');
      const cleared = (loan: Q, inst: Q) => {
        let bal = loan;
        for (let y = 0; y < n; y++) bal = sub(ciSim(bal, R, 1, 1), inst);
        return bal.n === 0n;
      };
      if (f.ask === 'instalment') return pickWhere(options, (inst) => cleared(need(g, 'P'), inst));
      return pickWhere(options, (loan) => cleared(loan, need(g, 'I')));
    }
    case 'si-instalment': {
      const A = need(g, 'A');
      const T = needNum(g, 'T');
      const R = need(g, 'R');
      return pickWhere(options, (x) => {
        let value = ZERO;
        for (let k = 1; k <= T; k++) value = add(value, add(x, siSim(x, R, 12 * (T - k))));
        return eq(value, A);
      });
    }
    default:
      throw new Error(`verify: unknown form ${f.form}`);
  }
}
