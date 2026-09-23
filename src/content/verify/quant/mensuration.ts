/**
 * Independent verifier for quant.mensuration.
 *
 * Method: exact BigInt rational geometry with π = 22/7. Areas are rebuilt by decomposition (paths by
 * counting unit rows of the grid, trapezium/rhombus as triangles, rooms as separate wall rectangles),
 * triangles are checked with Heron's identity 16A² = (a+b+c)(−a+b+c)(a−b+c)(a+b−c), missing sides are
 * found by searching for Pythagorean completions, and inverse questions substitute each option back.
 */
import type { GenResult } from '../../generators/types';
import type { MensFacts } from '../../generators/quant/mensuration';

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
const mul = (...xs: Q[]) => xs.reduce((a, b) => mk(a.n * b.n, a.d * b.d), ONE);
const div = (a: Q, b: Q) => mk(a.n * b.d, a.d * b.n);
const eq = (a: Q, b: Q) => a.n === b.n && a.d === b.d;
const sq = (a: Q) => mul(a, a);
const PI = mk(22n, 7n);
const HALF = mk(1n, 2n);

/** Exact rational square root if it exists (numerator and denominator perfect squares), else null. */
function sqrtQ(a: Q): Q | null {
  const r = (x: bigint) => {
    if (x < 0n) return null;
    let lo = 0n;
    let hi = x + 1n;
    while (hi - lo > 1n) {
      const mid = (lo + hi) / 2n;
      if (mid * mid <= x) lo = mid;
      else hi = mid;
    }
    return lo * lo === x ? lo : null;
  };
  const n = r(a.n);
  const d = r(a.d);
  return n === null || d === null ? null : mk(n, d);
}

function parseOption(text: string): Q {
  const t = text.trim();
  if (t === 'no change') return ZERO;
  const pct = t.match(/^(\d+(?:\.\d+)?)% (increase|decrease)$/);
  if (pct) {
    const v = q(Number(pct[1]));
    return pct[2] === 'decrease' ? mk(-v.n, v.d) : v;
  }
  const s = t.replace(/[₹,\s]/g, '');
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

/** Other leg of a right triangle (exact) or throws. */
function otherLeg(hyp: Q, leg: Q): Q {
  const r = sqrtQ(sub(sq(hyp), sq(leg)));
  if (!r) throw new Error('no rational leg');
  return r;
}

const heron16 = (a: Q, b: Q, c: Q) => mul(add(add(a, b), c), sub(add(b, c), a), sub(add(a, c), b), sub(add(a, b), c));

/** Area of a band layout counted row by row on a unit grid (integer dimensions). */
function rowsArea(rows: number, cellsInRow: (row: number) => number): Q {
  let total = 0;
  for (let r = 0; r < rows; r++) total += cellsInRow(r);
  return q(total);
}

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

export function verify(res: GenResult<MensFacts>): number[] {
  return [solve(res.facts, res.item.questions[0].options)];
}

function solve(f: MensFacts, options: readonly string[]): number {
  const g = f.given;
  switch (f.form) {
    case 'rect': {
      const [l, b] = [need(g, 'l'), need(g, 'b')];
      return pickValue(options, f.ask === 'area' ? mul(l, b) : add(add(l, b), add(l, b)));
    }
    case 'rect-ratio':
    case 'fence-cost': {
      const P = f.form === 'rect-ratio' ? need(g, 'P') : div(need(g, 'cost'), need(g, 'rate'));
      const [p, qq] = [need(g, 'p'), need(g, 'q')];
      // walk round the boundary: 2 lengths + 2 breadths = P with l : b = p : q
      const unit = div(P, add(add(p, qq), add(p, qq)));
      return pickValue(options, mul(p, unit, qq, unit));
    }
    case 'rect-diag': {
      const side = need(g, 'side');
      return pickValue(options, mul(side, otherLeg(need(g, 'd'), side)));
    }
    case 'circle': {
      const r = need(g, 'r');
      return pickValue(options, f.ask === 'area' ? mul(PI, r, r) : mul(q(2), PI, r));
    }
    case 'semicircle': {
      const r = need(g, 'r');
      return pickValue(options, add(mul(PI, r), add(r, r)));
    }
    case 'circle-from-c': {
      const r = div(need(g, 'C'), mul(q(2), PI));
      return pickValue(options, mul(PI, r, r));
    }
    case 'wheel':
      return pickValue(options, div(mul(need(g, 'distM'), q(100)), mul(PI, need(g, 'dCm'))));
    case 'c-minus-d':
      return pickWhere(options, (A) => {
        const r = sqrtQ(div(A, PI));
        return !!r && eq(sub(mul(q(2), PI, r), mul(q(2), r)), need(g, 'x'));
      });
    case 'tri-bh':
      return pickValue(options, mul(HALF, need(g, 'b'), need(g, 'h')));
    case 'right-tri': {
      const [leg, hyp] = [need(g, 'leg'), need(g, 'hyp')];
      const other = otherLeg(hyp, leg);
      return pickWhere(options, (A) => eq(mul(q(16), A, A), heron16(leg, other, hyp)));
    }
    case 'tri-sides':
      return pickWhere(options, (A) => eq(mul(q(16), A, A), heron16(need(g, 'a'), need(g, 'b'), need(g, 'c'))));
    case 'trapezium': {
      const h = need(g, 'h');
      return pickValue(options, add(mul(HALF, need(g, 'a'), h), mul(HALF, need(g, 'b'), h)));
    }
    case 'trapezium-side': {
      const h = need(g, 'h');
      return pickWhere(options, (b) => eq(add(mul(HALF, need(g, 'a'), h), mul(HALF, b, h)), need(g, 'area')));
    }
    case 'rhombus-diag': {
      const [x, y] = [mul(HALF, need(g, 'd1')), mul(HALF, need(g, 'd2'))];
      if (f.ask === 'area') return pickValue(options, mul(q(4), HALF, x, y));
      const side = sqrtQ(add(sq(x), sq(y)));
      if (!side) throw new Error('irrational side');
      return pickValue(options, mul(q(4), side));
    }
    case 'rhombus-side': {
      const x = mul(HALF, need(g, 'd1'));
      const y = otherLeg(need(g, 's'), x);
      return pickValue(options, mul(q(4), HALF, x, y));
    }
    case 'ring': {
      const r = need(g, 'r');
      const R = add(r, need(g, 'w'));
      return pickValue(options, mul(sub(mul(PI, R, R), mul(PI, r, r)), need(g, 'rate')));
    }
    case 'rect-path': {
      const [l, b, w] = [num(g, 'l'), num(g, 'b'), num(g, 'w')];
      const area =
        num(g, 'inside') === 1
          ? rowsArea(b, (row) => (row < w || row >= b - w ? l : 2 * w))
          : rowsArea(b + 2 * w, (row) => (row < w || row >= b + w ? l + 2 * w : 2 * w));
      return pickValue(options, f.ask === 'cost' ? mul(area, need(g, 'rate')) : area);
    }
    case 'cross-roads': {
      const [l, b, w] = [num(g, 'l'), num(g, 'b'), num(g, 'w')];
      const top = Math.floor((b - w) / 2);
      const area = rowsArea(b, (row) => (row >= top && row < top + w ? l : w));
      return pickValue(options, f.ask === 'cost' ? mul(area, need(g, 'rate')) : area);
    }
    case 'scale': {
      const base = q(100);
      const fx = add(ONE, div(need(g, 'x'), base));
      const fy = add(ONE, div(need(g, 'y'), base));
      const oldV = num(g, 'dims') === 3 ? mul(base, base, base) : mul(base, base);
      const newV = num(g, 'dims') === 3 ? mul(base, fx, base, fx, base, fx) : mul(base, fx, base, fy);
      return pickValue(options, mul(div(sub(newV, oldV), oldV), q(100)));
    }
    case 'keep-area': {
      const fx = add(ONE, div(need(g, 'x'), q(100)));
      return pickWhere(options, (c) => eq(mul(fx, add(ONE, div(c, q(100)))), ONE));
    }
    case 'cuboid': {
      const [l, b, h] = [need(g, 'l'), need(g, 'b'), need(g, 'h')];
      if (f.ask === 'volume') return pickValue(options, mul(l, b, h));
      const faces = [mul(l, b), mul(l, b), mul(b, h), mul(b, h), mul(h, l), mul(h, l)];
      return pickValue(options, faces.reduce(add, ZERO));
    }
    case 'cube': {
      const a = need(g, 'a');
      return pickValue(options, Array.from({ length: 6 }, () => mul(a, a)).reduce(add, ZERO));
    }
    case 'cuboid-diag': {
      const s = add(add(sq(need(g, 'l')), sq(need(g, 'b'))), sq(need(g, 'h')));
      return pickWhere(options, (d) => eq(sq(d), s));
    }
    case 'cut-cubes': {
      const a = num(g, 'a');
      return pickValue(options, q(Math.floor(num(g, 'L') / a) * Math.floor(num(g, 'B') / a) * Math.floor(num(g, 'H') / a)));
    }
    case 'faces': {
      const prod = mul(need(g, 'p'), need(g, 'q'), need(g, 'r'));
      return pickWhere(options, (V) => eq(sq(V), prod));
    }
    case 'cylinder': {
      const [r, h] = [need(g, 'r'), need(g, 'h')];
      const base = mul(PI, r, r);
      const curved = mul(q(2), PI, r, h);
      if (f.ask === 'volume') return pickValue(options, mul(base, h));
      return pickValue(options, f.ask === 'csa' ? curved : add(curved, add(base, base)));
    }
    case 'cone':
      return pickValue(options, mul(mk(1n, 3n), PI, need(g, 'r'), need(g, 'r'), need(g, 'h')));
    case 'cone-hl': {
      const [r, h] = [need(g, 'r'), need(g, 'h')];
      const l = sqrtQ(add(sq(r), sq(h)));
      if (!l) throw new Error('irrational slant');
      const curved = mul(PI, r, l);
      return pickValue(options, f.ask === 'csa' ? curved : add(curved, mul(PI, r, r)));
    }
    case 'hollow': {
      const [R, r, h] = [need(g, 'R'), need(g, 'r'), need(g, 'h')];
      return pickValue(options, sub(mul(PI, R, R, h), mul(PI, r, r, h)));
    }
    case 'sphere': {
      const r = need(g, 'r');
      return pickValue(options, f.ask === 'surface' ? mul(q(4), PI, r, r) : mul(mk(4n, 3n), PI, r, r, r));
    }
    case 'hemisphere': {
      const r = need(g, 'r');
      const curved = mul(q(2), PI, r, r);
      if (f.ask === 'csa') return pickValue(options, curved);
      if (f.ask === 'tsa') return pickValue(options, add(curved, mul(PI, r, r)));
      return pickValue(options, mul(mk(2n, 3n), PI, r, r, r));
    }
    case 'sphere-from-s': {
      const r = sqrtQ(div(need(g, 'S'), mul(q(4), PI)));
      if (!r) throw new Error('irrational radius');
      return pickValue(options, mul(mk(4n, 3n), PI, r, r, r));
    }
    case 'cube-to-cubes': {
      const [a, b] = [need(g, 'a'), need(g, 'b')];
      return pickValue(options, div(mul(a, a, a), mul(b, b, b)));
    }
    case 'sphere-to-spheres': {
      const vol = (r: Q) => mul(mk(4n, 3n), PI, r, r, r);
      return pickValue(options, div(vol(need(g, 'R')), vol(need(g, 'r'))));
    }
    case 'sphere-to-wire': {
      const R = need(g, 'R');
      const r = need(g, 'r');
      const lengthCm = div(mul(mk(4n, 3n), PI, R, R, R), mul(PI, r, r));
      return pickValue(options, div(lengthCm, q(100)));
    }
    case 'cubes-to-cube': {
      const total = ['a', 'b', 'c'].map((k) => need(g, k)).reduce((s, x) => add(s, mul(x, x, x)), ZERO);
      return pickWhere(options, (e) => eq(mul(e, e, e), total));
    }
    case 'tank-rise': {
      const m3 = div(need(g, 'litres'), q(1000));
      return pickValue(options, mul(div(m3, mul(need(g, 'L'), need(g, 'B'))), q(100)));
    }
    case 'spheres-rise': {
      const r = need(g, 'r');
      const R = need(g, 'R');
      const displaced = mul(need(g, 'n'), mk(4n, 3n), PI, r, r, r);
      return pickValue(options, div(displaced, mul(PI, R, R)));
    }
    case 'embankment': {
      const r = need(g, 'r');
      const R = add(r, need(g, 'w'));
      const earth = mul(PI, r, r, need(g, 'depth'));
      return pickValue(options, div(earth, sub(mul(PI, R, R), mul(PI, r, r))));
    }
    case 'pit-spread': {
      const pit = mul(need(g, 'l'), need(g, 'b'));
      const earth = mul(pit, need(g, 'd'));
      const rest = sub(mul(need(g, 'L'), need(g, 'B')), pit);
      return pickValue(options, mul(div(earth, rest), q(100)));
    }
    case 'room': {
      const [l, b, h] = [need(g, 'l'), need(g, 'b'), need(g, 'h')];
      const walls = [mul(l, h), mul(l, h), mul(b, h), mul(b, h)].reduce(add, ZERO);
      const area = sub(add(walls, num(g, 'ceiling') === 1 ? mul(l, b) : ZERO), need(g, 'openings'));
      return pickValue(options, mul(area, need(g, 'rate')));
    }
    case 'pillars':
      return pickValue(options, mul(need(g, 'n'), q(2), PI, need(g, 'r'), need(g, 'h'), need(g, 'rate')));
    case 'room-height': {
      const [l, b] = [need(g, 'l'), need(g, 'b')];
      return pickWhere(options, (h) => eq(mul([mul(l, h), mul(l, h), mul(b, h), mul(b, h)].reduce(add, ZERO), need(g, 'rate')), need(g, 'cost')));
    }
    default:
      throw new Error(`verify: unknown form ${f.form}`);
  }
}
