/**
 * Number-series pattern families (≥ 30). Each builds the TRUE series of length n plus one worked line per term
 * and a one-line description of the rule. Ranges follow research/archetypes.md: growing series start at 5–25 and
 * end at 3–5 digits; shrinking series start at 4–5 digits.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty } from '../../../types';
import { plain } from '../../../../lib/format';

export interface Made {
  terms: number[];
  /** One line per derived term, e.g. "12 × 2 + 1 = 25". */
  lines: string[];
  /** The rule in one sentence (used as the shortcut). */
  rule: string;
}

export interface Family {
  id: string;
  levels: Difficulty[];
  /** Interleaved series need 7–8 terms. */
  twin?: boolean;
  make(rng: Rng, n: number, d: Difficulty): Made | null;
}

export const f = (x: number) => plain(x, 2);
const P = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43];
const FACT = [1, 1, 2, 6, 24, 120, 720, 5040];

/** t_{i+1} = step(i, t_i); op(i) describes the step, e.g. "× 2 + 1". */
function recur(t0: number, n: number, step: (i: number, t: number) => number, op: (i: number, t: number) => string): { terms: number[]; lines: string[] } {
  const terms = [t0];
  const lines: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    const nx = step(i, terms[i]);
    lines.push(`${f(terms[i])} ${op(i, terms[i])} = ${f(nx)}`);
    terms.push(nx);
  }
  return { terms, lines };
}

const sg = (x: number) => (x >= 0 ? `+ ${f(x)}` : `− ${f(-x)}`);
const ok = (terms: number[], max = 99999) => terms.every((t) => t > 0 && t <= max && Number.isInteger(t * 2));

function mk(r: { terms: number[]; lines: string[] }, rule: string, max = 99999): Made | null {
  return ok(r.terms, max) ? { ...r, rule } : null;
}

const E: Difficulty[] = ['easy'];
const EM: Difficulty[] = ['easy', 'medium'];
const M: Difficulty[] = ['medium'];
const MH: Difficulty[] = ['medium', 'hard'];
const H: Difficulty[] = ['hard'];
const HX: Difficulty[] = ['hard', 'extreme'];
const X: Difficulty[] = ['extreme'];

export const FAMILIES: Family[] = [
  {
    id: 'add-const',
    levels: E,
    make: (rng, n) => {
      const d = rng.int(3, 25);
      return mk(recur(rng.int(5, 80), n, (_i, t) => t + d, () => `+ ${d}`), `Add ${d} every time.`);
    },
  },
  {
    id: 'sub-const',
    levels: E,
    make: (rng, n) => {
      const d = rng.int(4, 35);
      return mk(recur(rng.int(200, 600), n, (_i, t) => t - d, () => `− ${d}`), `Subtract ${d} every time.`);
    },
  },
  {
    id: 'mul-const',
    levels: E,
    make: (rng, n) => {
      const k = rng.pick([2, 3]);
      return mk(recur(rng.int(2, 15), n, (_i, t) => t * k, () => `× ${k}`), `Multiply by ${k} every time.`, 20000);
    },
  },
  {
    id: 'div-const',
    levels: EM,
    make: (rng, n) => {
      const k = rng.pick([2, 3, 4]);
      const last = rng.int(3, 25);
      return mk(recur(last * k ** (n - 1), n, (_i, t) => t / k, () => `÷ ${k}`), `Divide by ${k} every time.`);
    },
  },
  {
    id: 'squares',
    levels: E,
    make: (rng, n) => {
      const s = rng.int(2, 20);
      const terms = Array.from({ length: n }, (_, i) => (s + i) ** 2);
      return mk({ terms, lines: terms.slice(1).map((t, i) => `${s + i + 1}² = ${t}`) }, `Squares of consecutive numbers: ${s}², ${s + 1}², ${s + 2}², …`);
    },
  },
  {
    id: 'cubes',
    levels: E,
    make: (rng, n) => {
      const s = rng.int(1, 8);
      const terms = Array.from({ length: n }, (_, i) => (s + i) ** 3);
      return mk({ terms, lines: terms.slice(1).map((t, i) => `${s + i + 1}³ = ${t}`) }, `Cubes of consecutive numbers: ${s}³, ${s + 1}³, …`);
    },
  },
  {
    id: 'n2-pm',
    levels: EM,
    make: (rng, n) => {
      const s = rng.int(3, 15);
      const c = rng.pick([-2, -1, 1, 2, 3]);
      const terms = Array.from({ length: n }, (_, i) => (s + i) ** 2 + c);
      return mk({ terms, lines: terms.slice(1).map((t, i) => `${s + i + 1}² ${sg(c)} = ${t}`) }, `Each term is a square ${c > 0 ? 'plus' : 'minus'} ${Math.abs(c)}: n² ${sg(c)}.`);
    },
  },
  {
    id: 'diff-ap',
    levels: M,
    make: (rng, n) => {
      const d0 = rng.int(2, 15);
      const e = rng.int(2, 9);
      return mk(recur(rng.int(5, 60), n, (i, t) => t + d0 + i * e, (i) => `+ ${d0 + i * e}`), `The differences ${d0}, ${d0 + e}, ${d0 + 2 * e}, … increase by ${e}.`);
    },
  },
  {
    id: 'diff-ap-dec',
    levels: M,
    make: (rng, n) => {
      const d0 = rng.int(3, 20);
      const e = rng.int(2, 9);
      return mk(recur(rng.int(400, 900), n, (i, t) => t - (d0 + i * e), (i) => `− ${d0 + i * e}`), `Subtract ${d0}, ${d0 + e}, ${d0 + 2 * e}, … (the amount subtracted grows by ${e}).`);
    },
  },
  {
    id: 'diff-squares',
    levels: MH,
    make: (rng, n, d) => {
      const s = rng.int(1, 6);
      const g = d === 'hard' && rng.chance(0.5) ? -1 : 1;
      const t0 = g > 0 ? rng.int(5, 80) : rng.int(800, 1500);
      return mk(recur(t0, n, (i, t) => t + g * (i + s) ** 2, (i) => `${g > 0 ? '+' : '−'} ${i + s}²`), `${g > 0 ? 'Add' : 'Subtract'} the squares ${s}², ${s + 1}², ${s + 2}², … in turn.`);
    },
  },
  {
    id: 'diff-cubes',
    levels: MH,
    make: (rng, n) => {
      const s = rng.int(1, 4);
      return mk(recur(rng.int(2, 60), n, (i, t) => t + (i + s) ** 3, (i) => `+ ${i + s}³`), `Add the cubes ${s}³, ${s + 1}³, ${s + 2}³, … in turn.`);
    },
  },
  {
    id: 'mul-add',
    levels: M,
    make: (rng, n) => {
      const k = rng.pick([2, 3]);
      const c = rng.int(1, 9) * rng.pick([1, -1]);
      return mk(recur(rng.int(2, 12), n, (_i, t) => t * k + c, () => `× ${k} ${sg(c)}`), `Multiply by ${k} and then ${c > 0 ? 'add' : 'subtract'} ${Math.abs(c)}.`, 50000);
    },
  },
  {
    id: 'mul-inc',
    levels: M,
    make: (rng, n) => {
      const a = rng.pick([1, 2]);
      return mk(recur(rng.int(2, 12), n, (i, t) => t * (a + i), (i) => `× ${a + i}`), `Multiply by ${a}, ${a + 1}, ${a + 2}, … in turn.`);
    },
  },
  {
    id: 'diff-gp',
    levels: M,
    make: (rng, n) => {
      const d0 = rng.int(1, 6);
      const r = rng.pick([2, 3]);
      return mk(recur(rng.int(3, 50), n, (i, t) => t + d0 * r ** i, (i) => `+ ${d0 * r ** i}`), `The differences ${d0}, ${d0 * r}, ${d0 * r * r}, … are multiplied by ${r} each time.`);
    },
  },
  {
    id: 'diff-primes',
    levels: MH,
    make: (rng, n) => {
      const s = rng.int(0, 4);
      return mk(recur(rng.int(5, 60), n, (i, t) => t + P[i + s], (i) => `+ ${P[i + s]}`), `Add consecutive prime numbers ${P[s]}, ${P[s + 1]}, ${P[s + 2]}, … in turn.`);
    },
  },
  {
    id: 'cubes-pm',
    levels: M,
    make: (rng, n) => {
      const s = rng.int(2, 9);
      const c = rng.pick([-2, -1, 1, 2]);
      const terms = Array.from({ length: n }, (_, i) => (s + i) ** 3 + c);
      return mk({ terms, lines: terms.slice(1).map((t, i) => `${s + i + 1}³ ${sg(c)} = ${t}`) }, `Each term is a cube ${c > 0 ? 'plus' : 'minus'} ${Math.abs(c)}: n³ ${sg(c)}.`);
    },
  },
  {
    id: 'mul-inc-same',
    levels: MH,
    make: (rng, n) => {
      const a = rng.pick([1, 2]);
      const g = rng.pick([1, -1]);
      return mk(
        recur(rng.int(g > 0 ? 2 : 3, 9), n, (i, t) => (a + i) * (t + g), (i) => `× ${a + i} ${g > 0 ? '+' : '−'} ${a + i}`),
        `× ${a} ${g > 0 ? '+' : '−'} ${a}, × ${a + 1} ${g > 0 ? '+' : '−'} ${a + 1}, × ${a + 2} ${g > 0 ? '+' : '−'} ${a + 2}, … (multiplier and ${g > 0 ? 'addend' : 'subtrahend'} rise together).`,
      );
    },
  },
  {
    id: 'mul-add-inc',
    levels: H,
    make: (rng, n) => {
      const k = rng.pick([2, 3]);
      const c0 = rng.int(1, 4);
      const e = rng.int(1, 2);
      return mk(recur(rng.int(2, 10), n, (i, t) => t * k + c0 + e * i, (i) => `× ${k} + ${c0 + e * i}`), `× ${k} + ${c0}, × ${k} + ${c0 + e}, × ${k} + ${c0 + 2 * e}, …`, 50000);
    },
  },
  {
    id: 'half-step',
    levels: HX,
    make: (rng, n) => {
      const t0 = 32 * rng.int(1, 6);
      return mk(recur(t0, n, (i, t) => t * (0.5 + 0.5 * i), (i) => `× ${f(0.5 + 0.5 * i)}`), 'Multiply by 0.5, 1, 1.5, 2, 2.5, … in turn.');
    },
  },
  {
    id: 'second-diff-ap',
    levels: HX,
    make: (rng, n) => {
      const d0 = rng.int(1, 10);
      const e0 = rng.int(2, 6);
      const g = rng.int(1, 4);
      const diffs: number[] = [];
      for (let i = 0; i < n - 1; i++) diffs.push(d0 + e0 * i + (g * i * (i - 1)) / 2);
      const r = recur(rng.int(5, 40), n, (i, t) => t + diffs[i], (i) => `+ ${diffs[i]}`);
      return mk(r, `Differences ${diffs.slice(0, 4).join(', ')}, …; their own differences ${e0}, ${e0 + g}, ${e0 + 2 * g}, … rise by ${g} (second-level differences in AP).`);
    },
  },
  {
    id: 'twin-ap',
    levels: HX,
    twin: true,
    make: (rng, n) => {
      const a = rng.int(2, 40);
      const b = rng.int(2, 40);
      const da = rng.int(2, 12);
      const db = rng.int(2, 12);
      if (da === db) return null;
      const terms = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? a + da * (i / 2) : b + db * ((i - 1) / 2)));
      const lines = [`Terms in odd places: ${terms.filter((_, i) => i % 2 === 0).join(', ')} (+${da} each time)`, `Terms in even places: ${terms.filter((_, i) => i % 2 === 1).join(', ')} (+${db} each time)`];
      return ok(terms) ? { terms, lines, rule: 'Two series are interleaved: split the terms in odd and even places.' } : null;
    },
  },
  {
    id: 'alt-ops',
    levels: H,
    make: (rng, n) => {
      const a = rng.pick([2, 3]);
      const b = rng.int(1, 9) * rng.pick([1, -1]);
      return mk(recur(rng.int(2, 12), n, (i, t) => (i % 2 === 0 ? t * a : t + b), (i) => (i % 2 === 0 ? `× ${a}` : sg(b))), `Alternately × ${a} and ${b > 0 ? '+' : '−'} ${Math.abs(b)}.`, 50000);
    },
  },
  {
    id: 'fibonacci',
    levels: HX,
    make: (rng, n) => {
      const t0 = rng.int(1, 12);
      const t1 = rng.int(t0, 15);
      const c = rng.pick([0, 0, 1, 2, -1]);
      const terms = [t0, t1];
      const lines: string[] = [];
      for (let i = 2; i < n; i++) {
        terms.push(terms[i - 1] + terms[i - 2] + c);
        lines.push(`${terms[i - 2]} + ${terms[i - 1]}${c ? ` ${sg(c)}` : ''} = ${terms[i]}`);
      }
      return ok(terms) && terms[2] > terms[1] ? { terms, lines, rule: c ? `Each term = sum of the previous two ${sg(c)}.` : 'Each term is the sum of the previous two.' } : null;
    },
  },
  {
    id: 'mul-1.5',
    levels: H,
    make: (rng, n) => mk(recur(2 ** (n - 1) * rng.int(1, 3), n, (_i, t) => t * 1.5, () => '× 1.5'), 'Multiply by 1.5 every time.'),
  },
  {
    id: 'div-inc',
    levels: HX,
    make: (rng, n) => {
      const up = rng.chance(0.5);
      const divs = Array.from({ length: n - 1 }, (_, i) => (up ? 2 + i : 1 + n - 1 - i + 1));
      let t = rng.int(2, 12);
      const back = [t];
      for (let i = n - 2; i >= 0; i--) {
        t *= divs[i];
        back.unshift(t);
      }
      return mk(recur(back[0], n, (i, x) => x / divs[i], (i) => `÷ ${divs[i]}`), `Divide by ${divs.slice(0, 3).join(', ')}, … in turn.`);
    },
  },
  {
    id: 'diff-sq-pm',
    levels: H,
    make: (rng, n) => {
      const s = rng.int(2, 6);
      const e = rng.pick([1, -1]);
      return mk(recur(rng.int(3, 50), n, (i, t) => t + (i + s) ** 2 + e, (i) => `+ (${i + s}² ${sg(e)})`), `Add n² ${sg(e)}: ${(s) ** 2 + e}, ${(s + 1) ** 2 + e}, ${(s + 2) ** 2 + e}, …`);
    },
  },
  {
    id: 'mul-add-sq',
    levels: HX,
    make: (rng, n, d) => {
      const s = rng.int(1, 4);
      const g = d === 'extreme' && rng.chance(0.5) ? -1 : 1;
      return mk(recur(rng.int(g > 0 ? 2 : 20, g > 0 ? 10 : 40), n, (i, t) => 2 * t + g * (i + s) ** 2, (i) => `× 2 ${g > 0 ? '+' : '−'} ${i + s}²`), `× 2 ${g > 0 ? '+' : '−'} ${s}², × 2 ${g > 0 ? '+' : '−'} ${s + 1}², … in turn.`, 50000);
    },
  },
  {
    id: 'diff-factorial',
    levels: H,
    make: (rng, n) => {
      const s = rng.int(1, 2);
      return mk(recur(rng.int(2, 30), n, (i, t) => t + FACT[i + s], (i) => `+ ${i + s}! (${FACT[i + s]})`), `Add factorials ${s}!, ${s + 1}!, ${s + 2}!, … in turn.`);
    },
  },
  {
    id: 'alt-sign-ap',
    levels: HX,
    make: (rng, n) => {
      const a = rng.int(5, 15);
      const b = rng.int(2, 6);
      const first = rng.pick([1, -1]);
      const step = (i: number) => first * (-1) ** i * (a + b * i);
      return mk(recur(rng.int(60, 200), n, (i, t) => t + step(i), (i) => sg(step(i))), `The changes alternate in sign and grow by ${b}: ${sg(step(0))}, ${sg(step(1))}, ${sg(step(2))}, …`);
    },
  },
  {
    id: 'third-level-gp',
    levels: X,
    make: (rng, n) => {
      const d0 = rng.int(2, 12);
      const e = rng.int(1, 5);
      const r = rng.pick([2, 3]);
      const diffs: number[] = [d0];
      for (let i = 1; i < n - 1; i++) diffs.push(diffs[i - 1] + e * r ** (i - 1));
      return mk(recur(rng.int(3, 40), n, (i, t) => t + diffs[i], (i) => `+ ${diffs[i]}`), `Differences ${diffs.slice(0, 4).join(', ')}, …; their differences ${e}, ${e * r}, ${e * r * r}, … are × ${r} (a three-level pattern).`);
    },
  },
  {
    id: 'mul-dec-inc',
    levels: X,
    make: (rng, n) => mk(recur(2 ** (n - 1) * rng.int(1, 2), n, (i, t) => t * (1.5 + i), (i) => `× ${f(1.5 + i)}`), 'Multiply by 1.5, 2.5, 3.5, … in turn.', 99999),
  },
  {
    id: 'tribonacci',
    levels: X,
    make: (rng, n) => {
      const terms = [rng.int(1, 6), rng.int(1, 8), rng.int(2, 10)];
      const lines: string[] = [];
      for (let i = 3; i < n; i++) {
        terms.push(terms[i - 1] + terms[i - 2] + terms[i - 3]);
        lines.push(`${terms[i - 3]} + ${terms[i - 2]} + ${terms[i - 1]} = ${terms[i]}`);
      }
      return ok(terms) ? { terms, lines, rule: 'Each term is the sum of the previous three.' } : null;
    },
  },
  {
    id: 'mul-inc-add-sq',
    levels: X,
    make: (rng, n) => {
      const a = rng.pick([1, 2]);
      return mk(recur(rng.int(1, 6), n, (i, t) => (a + i) * t + (a + i) ** 2, (i) => `× ${a + i} + ${a + i}²`), `× ${a} + ${a}², × ${a + 1} + ${a + 1}², × ${a + 2} + ${a + 2}², …`);
    },
  },
  {
    id: 'half-plus',
    levels: X,
    make: (rng, n) => {
      const c = rng.int(2, 12);
      return mk(recur(64 * rng.int(4, 12), n, (_i, t) => t / 2 + c, () => `÷ 2 + ${c}`), `Halve and add ${c} every time.`);
    },
  },
  {
    id: 'twin-ap-gp',
    levels: X,
    twin: true,
    make: (rng, n) => {
      const a = rng.int(2, 8);
      const r = rng.pick([2, 3]);
      const b = rng.int(10, 60);
      const db = rng.int(3, 15) * rng.pick([1, -1]);
      const terms = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? a * r ** (i / 2) : b + db * ((i - 1) / 2)));
      const lines = [`Terms in odd places: ${terms.filter((_, i) => i % 2 === 0).join(', ')} (× ${r} each time)`, `Terms in even places: ${terms.filter((_, i) => i % 2 === 1).join(', ')} (${sg(db)} each time)`];
      return ok(terms) ? { terms, lines, rule: 'Two series are interleaved: one multiplies, the other adds a constant.' } : null;
    },
  },
  {
    id: 'diff-times-inc',
    levels: X,
    make: (rng, n) => {
      const d0 = rng.int(1, 5);
      const s = rng.pick([1, 2]);
      const diffs = [d0];
      for (let i = 1; i < n - 1; i++) diffs.push(diffs[i - 1] * (s + i - 1));
      return mk(recur(rng.int(3, 30), n, (i, t) => t + diffs[i], (i) => `+ ${diffs[i]}`), `Differences ${diffs.slice(0, 4).join(', ')}, … are multiplied by ${s}, ${s + 1}, ${s + 2}, … in turn.`);
    },
  },
];

export function familiesFor(d: Difficulty): Family[] {
  return FAMILIES.filter((fam) => fam.levels.includes(d));
}

