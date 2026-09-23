/**
 * Independent verifier for quant.profit-loss.
 *
 * Exact BigInt rationals. Forward questions are simulated with concrete money (CP = ₹100, or per-gram /
 * per-item costs for false weights and free offers); reverse questions ("find the CP / MP / mark-up") are
 * checked by substituting every option back into the story. Exactly one option must fit.
 */
import type { GenResult } from '../../generators/types';
import type { ProfitLossFacts } from '../../generators/quant/profit-loss';

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
/** Exact value of a decimal literal stored in facts (e.g. 12.5 → 25/2). */
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
const neg = (a: Q): Q => Q(-a.n, a.d);
const pctOf = (p: Q, v: Q): Q => div(mul(p, v), Q(100));
/** v changed by p% (p signed). */
const chg = (v: Q, p: Q): Q => add(v, pctOf(p, v));
const P = (x: number): Q => dec(x);
const Fq = (f: readonly [number, number]): Q => Q(f[0], f[1]);
const HUNDRED = Q(100);
const asPct = (part: Q, base: Q): Q => mul(div(part, base), HUNDRED);

function parseOption(raw: string): Q {
  let s = raw.trim();
  if (/^no profit, no loss$/i.test(s)) return Q(0);
  let sign = 1n;
  let m = s.match(/^(profit|loss) of (.*)$/i);
  if (m) {
    if (m[1].toLowerCase() === 'loss') sign = -1n;
    s = m[2];
  } else {
    m = s.match(/^(.*)\s+(profit|loss)$/i);
    if (m) {
      if (m[2].toLowerCase() === 'loss') sign = -1n;
      s = m[1];
    }
  }
  s = s.replace(/[₹,\s]/g, '').replace(/%$/, '');
  let v: Q;
  const tex = s.match(/^\$(-)?(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$$/);
  if (tex) {
    v = add(Q(BigInt(tex[2] ?? '0')), Q(BigInt(tex[3]), BigInt(tex[4])));
    if (tex[1]) v = neg(v);
  } else if (/^-?\d+(\.\d+)?$/.test(s)) {
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
  if (hits.length !== 1) throw new Error(`expected exactly one option to fit, found ${hits.length} in ${JSON.stringify(options)}`);
  return hits[0];
}

function solve(f: ProfitLossFacts, options: readonly string[]): number {
  switch (f.form) {
    case 'sp-from-cp':
      return indexOfValue(options, chg(Q(f.cp), P(f.pct)));
    case 'cp-from-sp':
      return indexWhere(options, (cp) => eq(chg(cp, P(f.pct)), Q(f.sp)));
    case 'resell': {
      // Find the CP by substitution-free algebra on concrete money, then re-price.
      const cp = div(Q(f.sp1), chg(Q(1), P(f.pct1)));
      return indexOfValue(options, chg(cp, P(f.pct2)));
    }
    case 'count-equal': {
      // One article costs ₹1: the money for cpCount articles buys the spCount sold.
      const cost = Q(f.spCount);
      const revenue = Q(f.cpCount);
      return indexOfValue(options, asPct(sub(revenue, cost), cost));
    }
    case 'more-for':
      return indexWhere(options, (cp) => eq(add(chg(cp, P(f.pct1)), Q(f.extra)), chg(cp, P(f.pct2))));
    case 'equal-pl':
      // The CP is the value whose profit at sp1 equals its loss at sp2: scan to find it exactly.
      return indexWhere(options, (sp) => {
        const cp = div(sp, chg(Q(1), P(f.target)));
        return eq(sub(Q(f.sp1), cp), sub(cp, Q(f.sp2)));
      });
    case 'cheaper-buy':
      return indexWhere(options, (cp) => {
        const sp = chg(cp, P(f.p));
        const cp2 = chg(cp, P(-f.a));
        return eq(sub(sp, Q(f.less)), chg(cp2, P(f.q)));
      });
    case 'discount-sp':
      return indexOfValue(options, sub(Q(f.mp), pctOf(P(f.d), Q(f.mp))));
    case 'discount-mp':
      return indexWhere(options, (mp) => eq(sub(mp, pctOf(P(f.d), mp)), Q(f.sp)));
    case 'discount-pct':
      return indexOfValue(options, asPct(sub(Q(f.mp), Q(f.sp)), Q(f.mp)));
    case 'gst': {
      const afterDisc = sub(Q(f.mp), pctOf(P(f.d), Q(f.mp)));
      return indexOfValue(options, add(afterDisc, pctOf(P(f.gst), afterDisc)));
    }
    case 'gst-mp':
      return indexWhere(options, (mp) => {
        const afterDisc = sub(mp, pctOf(P(f.d), mp));
        return eq(add(afterDisc, pctOf(P(f.gst), afterDisc)), Q(f.paid));
      });
    case 'two-discount-profit': {
      const cp = HUNDRED;
      const sp1 = chg(cp, P(f.p1));
      const mp = div(sp1, sub(Q(1), Q(f.d1, 100)));
      const sp2 = sub(mp, pctOf(P(f.d2), mp));
      return indexOfValue(options, asPct(sub(sp2, cp), cp));
    }
    case 'markup-profit': {
      const cp = HUNDRED;
      const mp = add(cp, pctOf(Fq(f.m), cp));
      const sp = sub(mp, pctOf(P(f.d), mp));
      return indexOfValue(options, asPct(sub(sp, cp), cp));
    }
    case 'markup-amount': {
      const cp = Q(f.cp);
      const mp = chg(cp, P(f.m));
      const sp = sub(mp, pctOf(P(f.d), mp));
      return indexOfValue(options, f.ask === 'sp' ? sp : sub(sp, cp));
    }
    case 'ratio-mp': {
      const cp = sub(Q(f.sp), Q(f.profit));
      return indexOfValue(options, div(mul(cp, Q(f.b)), Q(f.a)));
    }
    case 'find-markup':
      return indexWhere(options, (m) => {
        const mp = chg(HUNDRED, m);
        return eq(sub(mp, pctOf(P(f.d), mp)), chg(HUNDRED, P(f.p)));
      });
    case 'find-discount':
      return indexWhere(options, (d) => {
        const mp = chg(HUNDRED, P(f.m));
        return eq(sub(mp, pctOf(d, mp)), chg(HUNDRED, P(f.p)));
      });
    case 'second-article': {
      // CP of article 1 from its ₹ profit: profit per ₹100 of CP, scaled.
      const mp100 = chg(HUNDRED, P(f.m));
      const sp100 = sub(mp100, pctOf(P(f.d), mp100));
      const cp1 = mul(div(Q(f.profit), sub(sp100, HUNDRED)), HUNDRED);
      const cp2 = chg(cp1, P(f.k));
      return indexOfValue(options, chg(cp2, P(-f.l)));
    }
    case 'equiv-discount': {
      let price = HUNDRED;
      for (const d of f.ds) price = sub(price, pctOf(P(d), price));
      return indexOfValue(options, sub(HUNDRED, price));
    }
    case 'succ-sp': {
      let price = Q(f.mp);
      for (const d of f.ds) price = sub(price, pctOf(P(d), price));
      return indexOfValue(options, price);
    }
    case 'succ-mp':
      return indexWhere(options, (mp) => eq(f.ds.reduce((pr, d) => sub(pr, pctOf(P(d), pr)), mp), Q(f.sp)));
    case 'discount-gap':
      return indexWhere(options, (mp) => {
        const single = sub(mp, pctOf(P(f.single), mp));
        const succ = f.ds.reduce((pr, d) => sub(pr, pctOf(P(d), pr)), mp);
        return eq(sub(succ, single), Q(f.gap));
      });
    case 'succ-markup':
      return indexWhere(options, (m) => {
        const sp = f.ds.reduce((pr, d) => sub(pr, pctOf(P(d), pr)), chg(HUNDRED, m));
        return eq(sp, chg(HUNDRED, P(f.p)));
      });
    case 'sp-basis': {
      const sp = HUNDRED;
      const profit = pctOf(Fq(f.p), sp);
      return indexOfValue(options, asPct(profit, sub(sp, profit)));
    }
    case 'sp-basis-loss': {
      const sp = HUNDRED;
      const loss = pctOf(P(f.l), sp);
      return indexOfValue(options, asPct(loss, add(sp, loss)));
    }
    case 'sp-basis-cp':
      return indexOfValue(options, sub(Q(f.sp), pctOf(P(f.p), Q(f.sp))));
    case 'sp-basis-shift': {
      const sp = HUNDRED;
      const cp = sub(sp, pctOf(P(f.p), sp));
      const cp2 = chg(cp, P(f.rise));
      return indexOfValue(options, asPct(sub(sp, cp2), cp2));
    }
    case 'sp-basis-diff':
      return indexWhere(options, (sp) => {
        const profitSp = pctOf(P(f.p), sp);
        const cp = sub(sp, profitSp);
        return eq(sub(profitSp, pctOf(P(f.p), cp)), Q(f.diff));
      });
    case 'false-weight': {
      // Cost ₹1 per gram. He hands over `grams` but is paid for 1,000 g at the marked-and-discounted price.
      const cost = Q(f.grams);
      const pricePerKg = sub(chg(Q(1000), P(f.markup)), pctOf(P(f.discount), chg(Q(1000), P(f.markup))));
      return indexOfValue(options, asPct(sub(pricePerKg, cost), cost));
    }
    case 'short-measure': {
      const charged = chg(HUNDRED, P(f.markup)); // price for 100 units at ₹1 cost each
      const given = sub(HUNDRED, P(f.less));
      return indexOfValue(options, asPct(sub(charged, given), given));
    }
    case 'cheat-both': {
      // Pays ₹100 for 100 + buy units (₹1 nominal each); sells in lots of (100 − sell) units for ₹100.
      const units = add(HUNDRED, P(f.buy));
      const lot = sub(HUNDRED, P(f.sell));
      const revenue = mul(div(units, lot), HUNDRED);
      return indexOfValue(options, asPct(sub(revenue, HUNDRED), HUNDRED));
    }
    case 'free-discount':
      return indexOfValue(options, asPct(Q(f.free), Q(f.buy + f.free)));
    case 'free-profit': {
      const items = f.buy + f.free;
      const cost = Q(100 * items);
      const mp = chg(HUNDRED, P(f.markup));
      const price = sub(mp, pctOf(P(f.discount), mp));
      const revenue = mul(price, Q(f.buy));
      return indexOfValue(options, asPct(sub(revenue, cost), cost));
    }
    case 'free-markup':
      return indexWhere(options, (m) => {
        const revenue = mul(chg(HUNDRED, m), Q(f.buy));
        const cost = Q(100 * (f.buy + f.free));
        return eq(revenue, chg(cost, P(f.p)));
      });
    case 'same-sp-amount': {
      const sp = Q(f.sp);
      const c1 = div(sp, chg(Q(1), P(f.p)));
      const c2 = div(sp, chg(Q(1), P(-f.l)));
      return indexOfValue(options, sub(mul(sp, Q(2)), add(c1, c2)));
    }
    case 'same-sp-pct': {
      const sp = Q(1);
      const c1 = div(sp, chg(Q(1), Fq(f.p)));
      const c2 = div(sp, chg(Q(1), neg(Fq(f.l))));
      const cost = add(c1, c2);
      return indexOfValue(options, asPct(sub(Q(2), cost), cost));
    }
    case 'same-sp-find':
      return indexWhere(options, (sp) => {
        const c1 = div(sp, chg(Q(1), P(f.p)));
        const c2 = div(sp, chg(Q(1), P(-f.l)));
        return eq(sub(add(c1, c2), mul(sp, Q(2))), Q(f.loss));
      });
    case 'two-items':
      return indexOfValue(options, add(pctOf(P(f.p1), Q(f.c1)), pctOf(P(f.p2), Q(f.c2))));
    case 'cp-gap':
      return indexWhere(options, (c1) => {
        const c2 = sub(c1, Q(f.gap));
        return eq(add(chg(c1, P(f.x)), chg(c2, P(-f.x))), Q(f.total));
      });
    case 'rest-pct':
      return indexWhere(options, (r) => {
        const pcts = [...f.pcts.map(P), r];
        const revenue = f.qty.reduce((s, q, i) => add(s, chg(Q(q), pcts[i])), Q(0));
        const cost = Q(f.qty.reduce((s, q) => s + q, 0));
        return eq(revenue, chg(cost, P(f.target)));
      });
    case 'equal-cp-loss':
      return indexWhere(options, (sp) => {
        const cp = div(sp, chg(Q(1), P(f.target)));
        const revenue = add(chg(cp, P(f.a)), chg(cp, P(-f.b)));
        return eq(sub(mul(cp, Q(2)), revenue), Q(f.loss));
      });
    case 'chain-cp':
      return indexWhere(options, (cost) => eq(f.pcts.reduce((v, p) => chg(v, P(p)), cost), Q(f.final)));
    case 'chain-retailer': {
      const rCost = f.pcts.reduce((v, p) => chg(v, P(p)), Q(f.cost));
      const mp = chg(rCost, P(f.markup));
      const sp = sub(mp, pctOf(P(f.discount), mp));
      return indexOfValue(options, sub(sp, rCost));
    }
    case 'loan-trade': {
      let interest = Q(0);
      for (let y = 0; y < f.years; y++) interest = add(interest, pctOf(P(f.rate), Q(f.principal)));
      const mp = chg(Q(f.principal), P(f.markup));
      const revenue = sub(mp, pctOf(P(f.discount), mp));
      return indexOfValue(options, sub(sub(revenue, Q(f.principal)), interest));
    }
    case 'partner-trade': {
      const cost = Q(f.caps[0] + f.caps[1]);
      const mp = chg(cost, P(f.markup));
      const profit = sub(sub(mp, pctOf(P(f.discount), mp)), cost);
      const w = f.caps.map((c, i) => Q(c * f.months[i]));
      return indexOfValue(options, div(mul(profit, w[f.ask]), add(w[0], w[1])));
    }
  }
}

export function verify(res: GenResult<ProfitLossFacts>): number[] {
  return res.item.questions.map((q) => solve(res.facts, q.options));
}
