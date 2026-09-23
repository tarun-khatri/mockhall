/**
 * Independent verifier for quant.mixtures.
 *
 * Simulates the vessel physically in exact rationals: separate litres of milk and water, removals take
 * both in proportion, replacements are applied one draw at a time. Prices are checked by mixing concrete
 * kilograms. Unknown quantities are found by substituting each option (or enumerating). Exactly one option
 * must fit.
 */
import type { GenResult } from '../../generators/types';
import type { MixturesFacts } from '../../generators/quant/mixtures';

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
const HUNDRED = Q(100);

interface Vessel {
  milk: Q;
  water: Q;
}
const vesselOf = (total: Q, a: number, b: number): Vessel => ({ milk: div(mul(total, Q(a)), Q(a + b)), water: div(mul(total, Q(b)), Q(a + b)) });
function drawOff(v: Vessel, litres: Q): Vessel {
  const total = add(v.milk, v.water);
  const keep = div(sub(total, litres), total);
  return { milk: mul(v.milk, keep), water: mul(v.water, keep) };
}
const ratioOf = (v: Vessel): Q => div(v.milk, v.water);

type Parsed = { kind: 'num'; v: Q } | { kind: 'ratio'; r: Q };
function parseOption(raw: string): Parsed {
  const s = raw.trim();
  const rm = s.match(/^(\d+) : (\d+)$/);
  if (rm) return { kind: 'ratio', r: Q(BigInt(rm[1]), BigInt(rm[2])) };
  const t = s.replace(/\s*(litres?|kg|per kg)$/i, '').replace(/\s*per kg$/i, '').replace(/[₹,\s%]/g, '');
  const tex = t.match(/^\$(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$$/);
  if (tex) return { kind: 'num', v: add(Q(BigInt(tex[1] ?? '0')), Q(BigInt(tex[2]), BigInt(tex[3]))) };
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error(`unparseable option "${raw}"`);
  const [, frac = ''] = t.split('.');
  return { kind: 'num', v: Q(BigInt(t.replace('.', '')), 10n ** BigInt(frac.length)) };
}
function pick(options: readonly string[], ok: (p: Parsed) => boolean): number {
  const hits = options.map((o, i) => (ok(parseOption(o)) ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) throw new Error(`expected exactly one option to fit, found ${hits.length} in ${JSON.stringify(options)}`);
  return hits[0];
}
const byValue = (o: readonly string[], want: Q): number => pick(o, (p) => p.kind === 'num' && eq(p.v, want));
const byRatio = (o: readonly string[], want: Q): number => pick(o, (p) => p.kind === 'ratio' && eq(p.r, want));
const where = (o: readonly string[], ok: (v: Q) => boolean): number => pick(o, (p) => p.kind === 'num' && ok(p.v));
const whereRatio = (o: readonly string[], ok: (r: Q) => boolean): number => pick(o, (p) => p.kind === 'ratio' && ok(p.r));

function solve(f: MixturesFacts, options: readonly string[]): number {
  switch (f.form) {
    case 'add-water':
      return where(options, (w) => {
        const v = vesselOf(Q(f.total), f.a, f.b);
        return eq(ratioOf({ milk: v.milk, water: add(v.water, w) }), Q(f.c, f.d));
      });
    case 'remove-add':
      return where(options, (w) => {
        const v = drawOff(vesselOf(Q(f.total), f.a, f.b), Q(f.removed));
        return eq(ratioOf({ milk: v.milk, water: add(v.water, w) }), Q(f.c, f.d));
      });
    case 'initial-milk':
      return where(options, (milk) => {
        const total = div(mul(milk, Q(f.a + f.b)), Q(f.a));
        // A candidate can is physically possible only if it holds more than is drawn off.
        if (sub(total, Q(f.removed)).n <= 0n) return false;
        const v = drawOff(vesselOf(total, f.a, f.b), Q(f.removed));
        return eq(ratioOf({ milk: v.milk, water: add(v.water, Q(f.added)) }), Q(f.c, f.d));
      });
    case 'two-vessels':
      // Mix x litres of P with y litres of Q and test the resulting ratio.
      return whereRatio(options, (r) => {
        const P = vesselOf(r, f.v1[0], f.v1[1]);
        const Qv = vesselOf(Q(1), f.v2[0], f.v2[1]);
        return eq(ratioOf({ milk: add(P.milk, Qv.milk), water: add(P.water, Qv.water) }), Q(f.target[0], f.target[1]));
      });
    case 'pct-milk':
      return where(options, (milk) => eq(add(milk, div(mul(milk, Q(f.pct)), HUNDRED)), Q(f.total)));
    case 'pct-add-ratio': {
      const milk = div(mul(Q(f.total), HUNDRED), Q(100 + f.pct));
      const water = sub(Q(f.total), milk);
      return byRatio(options, div(milk, add(water, Q(f.added))));
    }
    case 'pct-target':
      return where(options, (w) => {
        const water = div(mul(Q(f.total), Q(f.pct)), HUNDRED);
        const newTotal = add(Q(f.total), w);
        return eq(div(mul(add(water, w), HUNDRED), newTotal), Q(f.target));
      });
    case 'pct-remove-add': {
      const milk0 = div(mul(Q(f.total), HUNDRED), Q(100 + f.pct));
      let v: Vessel = { milk: milk0, water: sub(Q(f.total), milk0) };
      v = drawOff(v, Q(f.removed));
      v = { milk: add(v.milk, Q(f.added)), water: v.water };
      return byValue(options, mul(div(v.water, v.milk), HUNDRED));
    }
    case 'price-ratio':
      return whereRatio(options, (r) => {
        // r kg of cheap per 1 kg of dear
        const cost = add(mul(r, Q(f.cheap)), Q(f.dear));
        return eq(div(cost, add(r, Q(1))), Q(f.mean));
      });
    case 'price-qty':
      return where(options, (d) => eq(div(add(Q(f.qty * f.cheap), mul(d, Q(f.dear))), add(Q(f.qty), d)), Q(f.mean)));
    case 'price-profit':
      return whereRatio(options, (r) => {
        const cost = div(add(mul(r, Q(f.cheap)), Q(f.dear)), add(r, Q(1)));
        return eq(add(cost, div(mul(cost, Q(f.gain)), HUNDRED)), dq(f.sell));
      });
    case 'three-variety':
      return where(options, (c) => {
        const blend = div(Q(f.p * f.pa + f.q * f.pb), Q(f.p + f.q));
        return eq(div(add(mul(Q(f.r), blend), mul(Q(f.s), c)), Q(f.r + f.s)), Q(f.final));
      });
    case 'replace-left':
    case 'replace-ratio':
    case 'replace-gain': {
      let v: Vessel = { milk: Q(f.capacity), water: Q(0) };
      for (let i = 0; i < f.times; i++) {
        v = drawOff(v, Q(f.draw));
        v = { milk: v.milk, water: add(v.water, Q(f.draw)) };
      }
      if (f.form === 'replace-left') return byValue(options, v.milk);
      if (f.form === 'replace-ratio') return byRatio(options, ratioOf(v));
      return byValue(options, mul(div(sub(Q(f.capacity), v.milk), v.milk), HUNDRED));
    }
    case 'replace-capacity':
      return where(options, (cap) => {
        let v: Vessel = { milk: cap, water: Q(0) };
        for (let i = 0; i < f.times; i++) {
          v = drawOff(v, Q(f.draw));
          v = { milk: v.milk, water: add(v.water, Q(f.draw)) };
        }
        return eq(ratioOf(v), Q(f.m, f.w));
      });
    case 'replace-mixture': {
      let v = vesselOf(Q(f.capacity), f.a, f.b);
      for (let i = 0; i < f.times; i++) {
        v = drawOff(v, Q(f.draw));
        v = { milk: v.milk, water: add(v.water, Q(f.draw)) };
      }
      return byRatio(options, ratioOf(v));
    }
    case 'water-gain':
      // m litres of milk bought at ₹1; (w + m) litres sold at ₹1.
      return byValue(options, mul(div(Q(f.w), Q(f.m)), HUNDRED));
    case 'water-ratio':
      return whereRatio(options, (r) => {
        // r litres of water per 1 litre of milk
        const costPerL = div(Q(f.cost), add(r, Q(1)));
        return eq(add(costPerL, div(mul(costPerL, Q(f.gain)), HUNDRED)), Q(f.sell));
      });
    case 'water-profit': {
      const cost = Q(f.milk * f.cost);
      const revenue = Q((f.milk + f.water) * f.sell);
      return byValue(options, mul(div(sub(revenue, cost), cost), HUNDRED));
    }
  }
}

export function verify(res: GenResult<MixturesFacts>): number[] {
  return res.item.questions.map((q) => solve(res.facts, q.options));
}
