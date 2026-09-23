/**
 * Exact simplification templates, built backward: the clean answer (and every clean intermediate) is chosen
 * first, then the printed numbers are derived from it.
 *
 * Ladder (SPEC Q1): E — 3 numbers, integers, "?" on the right. M — 4–5 numbers with one %, fraction or root.
 * H — 5–7 numbers, mixed fractions, "?" inside (?², √?, ?% of). X — nested brackets, ?³, factor recognition.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty } from '../../../types';
import { Q, q } from './frac';
import {
  br,
  cbrt,
  chain,
  cube,
  dec,
  divide,
  fracx,
  frac,
  n,
  num,
  of,
  pct,
  pow,
  prod,
  sq,
  sqrt,
  times,
  unk,
  type Node,
} from './expr';

export type AnswerStyle = 'int' | 'dec' | 'frac';

export interface MistakeQ {
  value: Q;
  why: string;
}

export interface Draft {
  lhs: Node;
  rhs: Node;
  /** Value of "?" when it sits inside the expression (templates choose it first). */
  x?: Q;
  style?: AnswerStyle;
  tags: string[];
  /** Template-specific mistakes (on top of the generic ones). */
  mistakes?: MistakeQ[];
  /** Template-specific fast method. */
  shortcut?: string;
  /** Steps show decimals instead of fractions. */
  decimals?: boolean;
  /** The answer is a perfect square (√? questions): all five options are neighbouring perfect squares. */
  squareOptions?: boolean;
  /** Options are five consecutive integers with the key at this index (base^? = value items). */
  consecutivePos?: number;
}

export class Retry extends Error {}

export function need(cond: boolean, why = 'template constraint'): asserts cond {
  if (!cond) throw new Retry(why);
}

const gcd = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/** Smallest base unit u such that p% of (k·u) is an integer for every integer k. */
export function pctUnit(p: Q): number {
  // p% of x = p.n · x / (100 · p.d)
  const den = 100 * p.d;
  return den / gcd(p.n, den);
}

/** A base x in [lo, hi] such that p% of x is an integer. */
export function pctBase(rng: Rng, p: Q, lo: number, hi: number): number {
  const u = pctUnit(p);
  const kLo = Math.ceil(lo / u);
  const kHi = Math.floor(hi / u);
  need(kHi >= kLo, 'no base for percent');
  return rng.int(kLo, kHi) * u;
}

const PCT_EASY = [10, 20, 25, 30, 40, 50, 60, 75, 5, 15, 35, 45, 80];
/** Includes the less friendly values seen in 2024–26 papers (2.5, 4.5, 11, 19, 48, 144, 160, 225 …). */
const PCT_MED = [...PCT_EASY, 12.5, 37.5, 62.5, 87.5, 55, 65, 70, 90, 120, 150, 24, 36, 18, 44, 2.5, 4.5, 11, 19, 48, 144, 160, 225, 125];
/** Percent values written as mixed numbers (exact thirds, sixths…). */
const PCT_MIXED: Q[] = [q(100, 3), q(50, 3), q(200, 3), q(25, 3), q(100, 9), q(100, 7)];

export function pickPct(rng: Rng, d: Difficulty): Q {
  if ((d === 'hard' || d === 'extreme') && rng.chance(0.25)) return rng.pick(PCT_MIXED);
  return Q.dec(rng.pick(d === 'easy' ? PCT_EASY : PCT_MED));
}

/** Percent node: integers/decimals plain, thirds etc. as mixed numbers (33⅓%). */
export function pctNode(p: Q): Node {
  return p.isInt() ? num(p) : p.isDecimal(2) ? num(p, 'dec') : num(p, 'mixed');
}

/** A proper fraction p/q (coprime) with q from the list. */
function properFrac(rng: Rng, dens: number[]): [number, number] {
  const den = rng.pick(dens);
  const opts: number[] = [];
  for (let a = 1; a < den; a++) if (gcd(a, den) === 1) opts.push(a);
  return [rng.pick(opts), den];
}

/** A mixed number w r/den with den from the list. */
function mixedQ(rng: Rng, wLo: number, wHi: number, dens: number[]): Q {
  const [r, den] = properFrac(rng, dens);
  return q(rng.int(wLo, wHi) * den + r, den);
}

/**
 * Right-hand side with a known value T for "?"-inside questions: a plain number (easy) or a short
 * expression such as 23 × 14 + 9, 28² − 11 or 36 × 12.
 */
export function makeRhs(rng: Rng, T: number, d: Difficulty): Node {
  need(Number.isInteger(T) && T > 0, 'rhs must be a positive integer');
  if (d === 'easy' || T < 30 || rng.chance(d === 'medium' ? 0.35 : 0.15)) return n(T);
  const forms: (() => Node | null)[] = [
    () => {
      const a = rng.int(11, 29);
      const b = Math.round(T / a);
      if (b < 2) return null;
      const f = T - a * b;
      if (f === 0) return times(n(a), n(b));
      return chain(times(n(a), n(b)), [f > 0 ? '+' : '-', n(Math.abs(f))]);
    },
    () => {
      const s = Math.round(Math.sqrt(T));
      if (s < 4 || s > 35) return null;
      const f = T - s * s;
      if (f === 0) return sq(s);
      return chain(sq(s), [f > 0 ? '+' : '-', n(Math.abs(f))]);
    },
    () => {
      // exact product with a 2-digit factor
      const divs: number[] = [];
      for (let a = 11; a <= 40; a++) if (T % a === 0 && T / a >= 3 && T / a <= 60) divs.push(a);
      if (!divs.length) return null;
      const a = rng.pick(divs);
      return times(n(a), n(T / a));
    },
  ];
  for (const f of rng.shuffle(forms)) {
    const node = f();
    if (node) return node;
  }
  return n(T);
}

const tagsFor = (sub: string, ...extra: string[]) => [`simplification:${sub}`, ...extra];

/* ------------------------------------------------------------------ */
/* BODMAS                                                              */
/* ------------------------------------------------------------------ */

function bodmas(rng: Rng, d: Difficulty): Draft {
  const T = (...extra: string[]) => tagsFor('bodmas', ...extra);
  if (d === 'easy') {
    switch (rng.int(0, 7)) {
      case 0: {
        const a = rng.int(12, 59);
        const b = rng.int(3, 19);
        const c = rng.int(101, 999);
        return { lhs: chain(times(n(a), n(b)), ['+', n(c)]), rhs: unk(), tags: T() };
      }
      case 1: {
        const a = rng.int(13, 79);
        const b = rng.int(6, 25);
        const c = rng.int(101, Math.min(999, a * b - 50));
        need(a * b - c >= 20);
        return { lhs: chain(times(n(a), n(b)), ['-', n(c)]), rhs: unk(), tags: T() };
      }
      case 2: {
        const b = rng.pick([11, 12, 13, 14, 15, 16, 18, 21, 24, 25, 26, 32, 34, 36, 45]);
        const qv = rng.int(12, 99);
        const c = rng.int(101, 999);
        return {
          lhs: chain(divide(n(b * qv), n(b)), ['+', n(c)]),
          rhs: unk(),
          tags: T(),
          mistakes: [{ value: q(qv + 1 + c), why: `you slip in the division and take ${b * qv} ÷ ${b} as ${qv + 1}` }],
        };
      }
      case 3: {
        const a = rng.int(101, 999);
        const b = rng.int(101, 999);
        const c = rng.int(101, a + b - 50);
        return {
          lhs: chain(n(a), ['+', n(b)], ['-', n(c)]),
          rhs: unk(),
          tags: T(),
          mistakes: [{ value: q(a - b + c), why: `you subtract ${b} and add ${c} (signs swapped)` }],
        };
      }
      case 4: {
        const a = rng.int(101, 999);
        const b = rng.int(11, 29);
        const c = rng.int(3, 9);
        return {
          lhs: chain(n(a), ['+', times(n(b), n(c))]),
          rhs: unk(),
          tags: T('trap:bodmas-order'),
          mistakes: [{ value: q((a + b) * c), why: `you add ${a} and ${b} first and then multiply by ${c} (multiplication must come before addition)` }],
        };
      }
      case 5: {
        const c = rng.int(3, 15);
        const k = rng.int(2, 12);
        const b = rng.int(11, 99);
        need(c * k !== b);
        return { lhs: prod([n(c * k), n(b)], n(c)), rhs: unk(), tags: T(), shortcut: `Cancel first: $${c * k} \\div ${c} = ${k}$, so the value is $${k} \\times ${b} = ${k * b}$.` };
      }
      case 6: {
        const a = rng.int(11, 99);
        const b = rng.int(11, 99);
        const c = rng.int(3, 12);
        return {
          lhs: times(br(chain(n(a), ['+', n(b)])), n(c)),
          rhs: unk(),
          tags: T(),
          mistakes: [{ value: q(a + b * c), why: `you ignore the bracket and multiply only ${b} by ${c}` }],
        };
      }
      default: {
        const c = rng.pick([11, 12, 13, 15, 16, 17, 18, 19, 21, 23, 24, 25]);
        const qv = rng.int(12, 60);
        const a = rng.int(qv + 50, 999);
        return {
          lhs: chain(n(a), ['-', divide(n(c * qv), n(c))]),
          rhs: unk(),
          tags: T('trap:bodmas-order'),
          mistakes: Number.isInteger((a - c * qv) / c) && a > c * qv ? [{ value: q((a - c * qv) / c), why: `you subtract before dividing` }] : [],
        };
      }
    }
  }
  if (d === 'medium') {
    const DIVS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 23, 24, 25, 26, 28, 32, 34, 36, 45];
    switch (rng.int(0, 6)) {
      case 0: {
        const a = rng.int(12, 59);
        const b = rng.int(4, 19);
        const dd = rng.pick(DIVS);
        const cq = rng.int(12, 60);
        const e = rng.int(101, 999);
        need(a * b - cq > 10);
        return {
          lhs: chain(times(n(a), n(b)), ['-', divide(n(dd * cq), n(dd))], ['+', n(e)]),
          rhs: unk(),
          tags: T(),
          mistakes: [{ value: q(a * b + cq + e), why: `you add ${dd * cq} ÷ ${dd} instead of subtracting it` }],
        };
      }
      case 1: {
        const a = rng.int(11, 99);
        const b = rng.int(11, 99);
        const c = rng.int(3, 12);
        const dd = rng.int(101, Math.min(999, (a + b) * c - 50));
        need((a + b) * c - dd > 20);
        return {
          lhs: chain(times(br(chain(n(a), ['+', n(b)])), n(c)), ['-', n(dd)]),
          rhs: unk(),
          tags: T(),
          mistakes: [{ value: q(a + b * c - dd), why: `you drop the bracket and multiply only ${b} by ${c}` }].filter((m) => m.value.n > 0),
        };
      }
      case 2: {
        const a = rng.int(11, 49);
        const b = rng.int(3, 19);
        const c = rng.int(11, 49);
        const dd = rng.int(3, 19);
        const e = rng.int(101, 999);
        need(a * b + c * dd - e > 10);
        return { lhs: chain(times(n(a), n(b)), ['+', times(n(c), n(dd))], ['-', n(e)]), rhs: unk(), tags: T() };
      }
      case 3: {
        const dd = rng.int(3, 15);
        const ans = rng.int(12, 99);
        const a = rng.int(11, 49);
        const b = Math.ceil((dd * ans + 11) / a) + rng.int(0, 3);
        const c = a * b - dd * ans;
        need(c > 0 && c < 1000);
        return { lhs: divide(br(chain(times(n(a), n(b)), ['-', n(c)])), n(dd)), rhs: unk(), tags: T() };
      }
      case 4: {
        const s = rng.int(11, 45);
        const a = rng.int(3, 12);
        const b = rng.int(11, 199);
        const c = rng.int(11, Math.min(300, s * a + b - 10));
        return {
          lhs: chain(times(sqrt(s * s), n(a)), ['+', n(b)], ['-', n(c)]),
          rhs: unk(),
          tags: T('simplification:roots'),
          mistakes: [
            { value: q((s + 1) * a + b - c), why: `you take $\\sqrt{${s * s}}$ as ${s + 1}` },
            { value: q((s - 1) * a + b - c), why: `you take $\\sqrt{${s * s}}$ as ${s - 1}` },
          ],
        };
      }
      case 5: {
        const b = rng.pick(DIVS);
        const qv = rng.int(21, 150);
        const c = rng.int(1001, 4999);
        const e = rng.int(101, 999);
        need(qv + c - e > 50);
        return {
          lhs: chain(divide(n(b * qv), n(b)), ['+', n(c)], ['-', n(e)]),
          rhs: unk(),
          tags: T(),
          mistakes: [{ value: q(qv + c + e), why: `you add ${e} instead of subtracting it` }],
        };
      }
      default: {
        const b = rng.pick(DIVS);
        const qv = rng.int(12, 99);
        const c = rng.int(11, 49);
        const dd = rng.int(3, 15);
        const e = rng.int(101, Math.min(999, qv + c * dd - 10));
        need(qv + c * dd - e > 10);
        return { lhs: chain(divide(n(b * qv), n(b)), ['+', times(n(c), n(dd))], ['-', n(e)]), rhs: unk(), tags: T() };
      }
    }
  }
  if (d === 'hard') {
    switch (rng.int(0, 5)) {
      case 5: {
        // "?" inside the right-hand side: a × b − c = d − ? + e
        const a = rng.int(11, 49);
        const b = rng.int(3, 19);
        const c = rng.int(11, 199);
        const L = a * b - c;
        need(L > 20);
        const x = rng.int(11, 199);
        const dd = rng.int(11, L + x - 11);
        const e = L + x - dd;
        need(e >= 11 && e !== dd);
        return {
          lhs: chain(times(n(a), n(b)), ['-', n(c)]),
          rhs: chain(n(dd), ['-', unk()], ['+', n(e)]),
          x: q(x),
          tags: T('simplification:missing-inside'),
          mistakes: [{ value: q(L - dd + e), why: `you write ? = ${L} − ${dd} + ${e}, getting the sign of ${dd} wrong` }].filter((m) => m.value.n > 0 && m.value.n !== x),
        };
      }
      case 0: {
        const x = rng.int(12, 60);
        const a = rng.int(3, 15);
        const b = rng.int(11, 30);
        const c = rng.int(3, 9);
        const L = x * a - b * c;
        need(L >= 40);
        return {
          lhs: chain(times(unk(), n(a)), ['-', times(n(b), n(c))]),
          rhs: makeRhs(rng, L, d),
          x: q(x),
          tags: T('simplification:missing-inside'),
          mistakes: Number.isInteger((L - b * c) / a) ? [{ value: q((L - b * c) / a), why: `you move ${b * c} across without changing its sign` }] : [],
        };
      }
      case 1: {
        const x = rng.int(11, 60);
        const a = rng.int(5, 40);
        const b = rng.int(3, 9);
        const c = rng.int(11, 99);
        const L = (x + a) * b - c;
        need(L > 20);
        return {
          lhs: chain(times(br(chain(unk(), ['+', n(a)])), n(b)), ['-', n(c)]),
          rhs: makeRhs(rng, L, d),
          x: q(x),
          tags: T('simplification:missing-inside'),
          mistakes: Number.isInteger((L + c) / b + a) ? [{ value: q((L + c) / b + a), why: `you add ${a} instead of subtracting it at the last step` }] : [],
        };
      }
      case 2: {
        const a = rng.int(3, 12);
        const y = rng.int(5, 30);
        const b = rng.int(11, 25);
        const c = rng.int(3, 9);
        const L = y + b * c;
        return {
          lhs: chain(divide(unk(), n(a)), ['+', times(n(b), n(c))]),
          rhs: makeRhs(rng, L, d),
          x: q(a * y),
          tags: T('simplification:missing-inside'),
          mistakes: [{ value: q(y), why: `you stop at ? ÷ ${a} = ${y} and forget to multiply by ${a}` }],
        };
      }
      case 3: {
        const e = rng.int(3, 9);
        const s = rng.int(4, 20);
        const c = rng.int(10, e * s - 10);
        const a = rng.int(11, 29);
        const b = rng.int(3, 9);
        const f = rng.int(11, 25);
        const g = rng.int(3, 9);
        need(a * b - s > 5);
        return {
          lhs: chain(times(n(a), n(b)), ['-', divide(br(chain(n(c), ['+', n(e * s - c)])), n(e))], ['+', times(n(f), n(g))]),
          rhs: unk(),
          tags: T(),
        };
      }
      default: {
        const dd = rng.int(3, 12);
        const S = rng.int(20, 60);
        const a = rng.int(11, 29);
        const b = Math.floor((dd * S - 1) / a);
        const c = dd * S - a * b;
        need(b >= 2 && c >= 1);
        const e = rng.int(2, 5);
        const f = rng.int(2, Math.max(2, Math.floor((S - 5) / e)));
        need(S - e * f > 0);
        return {
          lhs: chain(divide(br(chain(times(n(a), n(b)), ['+', n(c)])), n(dd)), ['-', times(n(e), n(f))]),
          rhs: unk(),
          tags: T(),
        };
      }
    }
  }
  // extreme
  switch (rng.int(0, 4)) {
    case 0: {
      const k = rng.int(2, 9);
      const e = rng.int(3, 20);
      const m = rng.int(2, 12);
      const nn = rng.int(2, 12);
      const ans = rng.int(5, 40);
      need(m !== k && nn !== m);
      const inner = br(chain(n(e + k), ['-', n(e)]));
      const lvl2 = br(divide(n(m * k), inner), 2);
      const lvl1 = br(divide(n(nn * m), lvl2), 1);
      return {
        lhs: divide(n(ans * nn), lvl1),
        rhs: unk(),
        tags: T('simplification:nested-brackets'),
        shortcut: 'Open the brackets from the inside out: ( ) first, then { }, then [ ].',
      };
    }
    case 1: {
      const s = rng.int(5, 15);
      const dd = rng.int(2, s - 2);
      const cq = rng.int(3, 20);
      const a = rng.int(11, 29);
      const b = rng.int(3, 9);
      const f = rng.int(2, 9);
      need(a * b - cq > 5);
      const inner = br(divide(n(s * cq), br(chain(n(dd), ['+', n(s - dd)]))), 2);
      return {
        lhs: times(br(chain(br(times(n(a), n(b))), ['-', inner]), 1), n(f)),
        rhs: unk(),
        tags: T('simplification:nested-brackets'),
      };
    }
    case 2: {
      const a = rng.int(13, 99);
      const t = rng.pick([10, 20, 50, 100]);
      const b = rng.int(11, 89);
      const c = rng.int(11, 89);
      const dd = b + c - t;
      need(dd >= 11 && dd <= 99 && dd !== b && dd !== c && b !== c);
      return {
        lhs: chain(times(n(a), n(b)), ['+', times(n(a), n(c))], ['-', times(n(a), n(dd))]),
        rhs: unk(),
        tags: T('trick:common-factor'),
        shortcut: `Take ${a} common: $${a} \\times (${b} + ${c} - ${dd}) = ${a} \\times ${t} = ${a * t}$. No long multiplication needed.`,
        mistakes: [{ value: q(a * (b + c + dd)), why: `you add all three brackets' numbers (${b} + ${c} + ${dd}) instead of subtracting ${dd}` }],
      };
    }
    case 3: {
      const k = rng.int(2, 9);
      const bb = rng.int(3, 20);
      const y = rng.int(5, 30);
      const c = rng.int(5, 40);
      const dd = rng.int(3, 9);
      const Tv = (y + c) * dd;
      return {
        lhs: times(br(chain(divide(unk(), br(chain(n(bb + k), ['-', n(bb)]))), ['+', n(c)]), 1), n(dd)),
        rhs: makeRhs(rng, Tv, d),
        x: q(y * k),
        tags: T('simplification:nested-brackets', 'simplification:missing-inside'),
        mistakes: [{ value: q(y), why: `you forget to multiply back by (${bb + k} − ${bb}) = ${k}` }],
      };
    }
    default: {
      const g = rng.int(2, 6);
      const h = rng.int(2, 8);
      const e = rng.int(h + 2, h + 15);
      const D = e - h;
      const ans = rng.int(5, 40);
      const N = D * ans;
      const c = rng.int(3, 9);
      const S = Math.ceil((N + 5) / c) + rng.int(0, 5);
      const dd = S * c - N;
      need(dd > 0 && S >= 12);
      const a = rng.int(5, S - 5);
      const top = br(chain(times(br(chain(n(a), ['+', n(S - a)])), n(c)), ['-', n(dd)]), 2);
      const bottom = br(chain(n(e), ['-', br(divide(n(g * h), n(g)))]), 1);
      return { lhs: divide(top, bottom), rhs: unk(), tags: T('simplification:nested-brackets') };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Fractions                                                           */
/* ------------------------------------------------------------------ */

const DENS_E = [2, 3, 4, 5, 6, 8];
const DENS_M = [2, 3, 4, 5, 6, 8, 9, 10, 12];

function fractions(rng: Rng, d: Difficulty): Draft {
  const T = (...extra: string[]) => tagsFor('fractions', ...extra);
  if (d === 'easy') {
    switch (rng.int(0, 2)) {
      case 0: {
        const [p, qd] = properFrac(rng, [3, 4, 5, 6, 7, 8, 9]);
        const k = rng.int(Math.ceil(40 / qd), Math.floor(600 / qd));
        const c = rng.int(11, 99);
        return {
          lhs: chain(of(frac(p, qd), n(qd * k)), ['+', n(c)]),
          rhs: unk(),
          tags: T(),
          shortcut: `Divide first, then multiply: $${qd * k} \\div ${qd} = ${k}$, and $${k} \\times ${p} = ${p * k}$.`,
        };
      }
      case 1: {
        const [a, b] = properFrac(rng, DENS_E);
        const [c, dd] = properFrac(rng, DENS_E);
        const [e, f] = properFrac(rng, DENS_E);
        const v = q(a, b).add(q(c, dd)).sub(q(e, f));
        const distinct = new Set([`${a}/${b}`, `${c}/${dd}`, `${e}/${f}`]).size === 3;
        need(distinct && v.sign > 0 && !v.isInt() && v.d <= 24 && v.n >= 5 && new Set([b, dd, f]).size >= 2);
        const wrong = a + c - e > 0 && b + dd - f > 0 ? [{ value: q(a + c - e, b + dd - f), why: 'you add and subtract the numerators and the denominators separately' }] : [];
        return {
          lhs: chain(frac(a, b), ['+', frac(c, dd)], ['-', frac(e, f)]),
          rhs: unk(),
          style: 'frac',
          tags: T('trick:lcm'),
          mistakes: [...wrong, { value: q(a, b).add(q(c, dd)).add(q(e, f)), why: `you add $\\frac{${e}}{${f}}$ instead of subtracting it` }],
          shortcut: `Take the LCM of ${b}, ${dd} and ${f} as the common denominator and combine the numerators in one line.`,
        };
      }
      default: {
        const [p, qd] = properFrac(rng, [3, 4, 5, 6, 8]);
        const k = rng.int(Math.ceil(90 / qd), Math.floor(720 / qd));
        const c = rng.int(11, Math.max(12, p * k - 20));
        need(p * k - c >= 20);
        return { lhs: chain(times(frac(p, qd), n(qd * k)), ['-', n(c)]), rhs: unk(), tags: T() };
      }
    }
  }
  if (d === 'medium') {
    switch (rng.int(0, 4)) {
      case 0: {
        const m1 = mixedQ(rng, 2, 6, DENS_M);
        const m2 = mixedQ(rng, 1, 5, DENS_M);
        const m3 = mixedQ(rng, 1, 4, DENS_M);
        const v = m1.add(m2).sub(m3);
        need(v.sign > 0 && !v.isInt() && v.d <= 72 && m1.d !== m2.d);
        const w = (x: Q) => Math.floor(x.n / x.d);
        const fr = (x: Q) => x.sub(q(w(x)));
        const wholeSlip = q(w(m1) + w(m2) - w(m3)).add(fr(m1).add(fr(m2)).add(fr(m3)));
        return {
          lhs: chain(num(m1, 'mixed'), ['+', num(m2, 'mixed')], ['-', num(m3, 'mixed')]),
          rhs: unk(),
          style: 'frac',
          tags: T('simplification:mixed-fractions'),
          shortcut: `Add the whole parts and the fraction parts separately: $${w(m1)} + ${w(m2)} - ${w(m3)} = ${w(m1) + w(m2) - w(m3)}$, then combine the fractions over their LCM.`,
          mistakes: [{ value: wholeSlip, why: `you subtract the whole part ${w(m3)} but add its fraction part` }],
        };
      }
      case 1: {
        const [p, qd] = properFrac(rng, [3, 4, 5, 7, 8, 9]);
        const [r, s] = properFrac(rng, [2, 3, 5, 6, 7, 11]);
        const k1 = rng.int(Math.ceil(60 / qd), Math.floor(700 / qd));
        const k2 = rng.int(Math.ceil(60 / s), Math.floor(700 / s));
        const c = rng.int(11, 99);
        need(p * k1 + r * k2 - c > 10);
        return {
          lhs: chain(of(frac(p, qd), n(qd * k1)), ['+', of(frac(r, s), n(s * k2))], ['-', n(c)]),
          rhs: unk(),
          tags: T(),
          mistakes: [{ value: q(p * k1 + r * k2 + c), why: `you add ${c} instead of subtracting it` }],
        };
      }
      case 2: {
        const m = mixedQ(rng, 1, 5, [2, 3, 4, 5, 6, 7, 8]);
        const a = m.d * rng.int(2, 8);
        const [p, qd] = properFrac(rng, [3, 4, 5, 6, 8]);
        const k = rng.int(Math.ceil(40 / qd), Math.floor(400 / qd));
        const w = Math.floor(m.n / m.d);
        return {
          lhs: chain(times(num(m, 'mixed'), n(a)), ['+', of(frac(p, qd), n(qd * k))]),
          rhs: unk(),
          tags: T('simplification:mixed-fractions'),
          mistakes: [{ value: q(w * a + (m.n - w * m.d) + p * k), why: `you multiply only the whole part ${w} by ${a} and just add the fraction's numerator` }],
        };
      }
      case 3: {
        const [p, qd] = properFrac(rng, [3, 4, 5, 6, 8, 9]);
        const c = rng.int(3, 9);
        const k = c * rng.int(3, 20);
        const dd = rng.int(11, 99);
        need(qd * k <= 900);
        return { lhs: chain(divide(of(frac(p, qd), n(qd * k)), n(c)), ['+', n(dd)]), rhs: unk(), tags: T() };
      }
      default: {
        // fraction-of chain: a/b of c/d of e/f of N (every intermediate a whole number)
        const [p1, q1] = properFrac(rng, [2, 3, 4, 5, 7]);
        const [p2, q2] = properFrac(rng, [3, 4, 5, 6, 7, 9]);
        const [p3, q3] = properFrac(rng, [2, 3, 5, 8, 11]);
        const base = q1 * q2 * q3;
        need(base <= 1500);
        const k = rng.int(1, Math.max(1, Math.floor(4000 / base)));
        const N = base * k;
        const skip = (p1 * p2 * N) / (q1 * q2);
        return {
          lhs: of(frac(p1, q1), of(frac(p2, q2), of(frac(p3, q3), n(N)))),
          rhs: unk(),
          tags: T('simplification:fraction-chain'),
          shortcut: `Multiply the fractions first and cancel with ${N}: $\\frac{${p1} \\times ${p2} \\times ${p3}}{${q1} \\times ${q2} \\times ${q3}} \\times ${N} = ${p1 * p2 * p3 * k}$.`,
          mistakes: Number.isInteger(skip) ? [{ value: q(skip), why: `you skip the last fraction $\\frac{${p3}}{${q3}}$` }] : [],
        };
      }
    }
  }
  if (d === 'hard') {
    switch (rng.int(0, 3)) {
      case 0: {
        const m1 = mixedQ(rng, 3, 7, DENS_M);
        const m2 = mixedQ(rng, 2, 6, DENS_M);
        const x = mixedQ(rng, 1, 4, [2, 3, 4, 5, 6]);
        const R = m1.add(m2).sub(x);
        need(R.sign > 0 && !R.isInt() && R.d <= 36 && R.cmp(q(1)) > 0);
        return {
          lhs: chain(num(m1, 'mixed'), ['+', num(m2, 'mixed')], ['-', unk()]),
          rhs: num(R, 'mixed'),
          x,
          style: 'frac',
          tags: T('simplification:mixed-fractions', 'simplification:missing-inside'),
          mistakes: [{ value: m1.add(m2).add(R), why: `you add the right-hand side instead of subtracting it` }],
        };
      }
      case 1: {
        const [p, qd] = properFrac(rng, [3, 4, 5, 6, 8]);
        const [r, s] = properFrac(rng, [2, 3, 4, 5, 6, 7, 9]);
        const m = rng.int(Math.ceil(60 / s), Math.floor(600 / s));
        const R = r * m;
        const k = rng.int(Math.max(2, Math.ceil(R / (3 * p))), Math.floor((R - 5) / p));
        const a = R - p * k;
        need(a > 0 && qd * k >= 20 && qd * k <= 900);
        return {
          lhs: chain(of(frac(p, qd), unk()), ['+', n(a)]),
          rhs: of(frac(r, s), n(s * m)),
          x: q(qd * k),
          tags: T('simplification:missing-inside'),
          mistakes: [{ value: q(p * k), why: `you stop at $\\frac{${p}}{${qd}}$ of ? = ${p * k} and forget to multiply by $\\frac{${qd}}{${p}}$` }],
        };
      }
      case 2: {
        const m1 = mixedQ(rng, 1, 4, [2, 3, 4, 5, 6]);
        const m2 = mixedQ(rng, 1, 4, [2, 3, 4, 5, 6]);
        const a = m1.d * rng.int(2, 6);
        const b = m2.d * rng.int(2, 6);
        const [p, qd] = properFrac(rng, [3, 4, 5, 8]);
        const k = rng.int(Math.ceil(20 / qd), Math.floor(300 / qd));
        const v = m1.mul(q(a)).add(m2.mul(q(b))).sub(q(p * k));
        need(v.sign > 0 && v.isInt());
        return {
          lhs: chain(times(num(m1, 'mixed'), n(a)), ['+', times(num(m2, 'mixed'), n(b))], ['-', of(frac(p, qd), n(qd * k))]),
          rhs: unk(),
          tags: T('simplification:mixed-fractions'),
        };
      }
      default: {
        const m = mixedQ(rng, 1, 4, [2, 3, 4, 5, 6, 8]);
        const x = m.d * rng.int(2, 12);
        const a = rng.int(5, 60);
        const L = m.mul(q(x)).n - a;
        need(L > 10);
        return {
          lhs: chain(times(unk(), num(m, 'mixed')), ['-', n(a)]),
          rhs: makeRhs(rng, L, d),
          x: q(x),
          tags: T('simplification:mixed-fractions', 'simplification:missing-inside'),
        };
      }
    }
  }
  // extreme
  switch (rng.int(0, 2)) {
    case 0: {
      const m2 = mixedQ(rng, 1, 4, [2, 3, 4, 5, 8]);
      const rho = rng.pick([q(2), q(3), q(4), q(5, 2), q(3, 2), q(8, 3)]);
      const m1 = m2.mul(rho);
      need(!m1.isInt() && m1.d <= 12 && m1.cmp(q(1)) > 0);
      const m3 = mixedQ(rng, 1, 5, [2, 3, 4, 5, 6]);
      const P = rho.mul(m3);
      const x = mixedQ(rng, 1, 3, [2, 3, 4, 5, 6]);
      const R = P.sub(x);
      need(R.sign > 0 && !R.isInt() && R.d <= 36);
      return {
        lhs: chain(times(br(divide(num(m1, 'mixed'), num(m2, 'mixed'))), num(m3, 'mixed')), ['-', unk()]),
        rhs: num(R, 'mixed'),
        x,
        style: 'frac',
        tags: T('simplification:mixed-fractions', 'simplification:missing-inside'),
      };
    }
    case 1: {
      const A = rng.pick([q(2), q(3), q(4), q(5), q(6), q(3, 2), q(5, 2), q(4, 3), q(7, 2)]);
      const [e, f] = properFrac(rng, [2, 3, 4, 6]);
      const [g, h] = properFrac(rng, [4, 5, 6, 8, 12]);
      const D = q(e, f).sub(q(g, h));
      need(D.sign > 0);
      const N = A.mul(D);
      const [a, b] = properFrac(rng, [4, 6, 8, 12, 5, 10]);
      const rest = N.sub(q(a, b));
      need(rest.sign > 0 && rest.d <= 24 && rest.n < rest.d && rest.n > 0);
      return {
        lhs: fracx(chain(frac(a, b), ['+', num(rest, 'frac')]), chain(frac(e, f), ['-', frac(g, h)])),
        rhs: unk(),
        style: 'frac',
        tags: T('simplification:complex-fraction'),
        shortcut: 'Simplify the numerator and the denominator separately, then divide (multiply by the reciprocal).',
      };
    }
    default: {
      const [p, qd] = properFrac(rng, [2, 3, 4, 5]);
      const [r, s] = properFrac(rng, [3, 4, 5, 7]);
      const unit = (qd * s) / gcd(p * r, qd * s);
      const k = rng.int(Math.max(1, Math.ceil(40 / unit)), Math.max(1, Math.floor(1200 / unit)));
      const x = unit * k;
      const L = q(p * r * x, qd * s);
      need(L.isInt() && L.n >= 12 && x <= 1500);
      return {
        lhs: of(frac(p, qd), of(frac(r, s), unk())),
        rhs: makeRhs(rng, L.n, d),
        x: q(x),
        tags: T('simplification:missing-inside'),
        mistakes: [{ value: L, why: `you give the value of the fraction-of chain instead of undoing both fractions` }].filter((m0) => m0.value.n * 3 > x),
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Decimals                                                            */
/* ------------------------------------------------------------------ */

const DEC_FACTORS = [0.5, 1.5, 2.5, 0.25, 0.75, 1.25, 2.4, 3.5, 4.5, 1.2, 0.8, 0.6, 0.4, 1.6, 3.2, 7.5, 12.5];

/** a × c where a is a short decimal and the product is a whole number or has one decimal place. */
function decProduct(rng: Rng, lo: number, hi: number): [number, number, Q] {
  for (let t = 0; t < 40; t++) {
    const a = rng.pick(DEC_FACTORS);
    const c = rng.int(lo, hi);
    const v = Q.dec(a).mul(q(c));
    if (v.isDecimal(1)) return [a, c, v];
  }
  throw new Retry('decProduct');
}

function decimals(rng: Rng, d: Difficulty): Draft {
  const T = (...extra: string[]) => tagsFor('decimals', ...extra);
  const base = { decimals: true, style: 'dec' as AnswerStyle };
  if (d === 'easy') {
    switch (rng.int(0, 2)) {
      case 0: {
        const [a, c, v] = decProduct(rng, 6, 60);
        const e = rng.chance(0.5) ? rng.int(11, 99) : rng.int(110, 990) / 10;
        need(v.toNumber() > 5);
        return { ...base, lhs: chain(times(dec(a), n(c)), ['+', dec(e)]), rhs: unk(), tags: T() };
      }
      case 1: {
        const dv = rng.pick([0.2, 0.4, 0.5, 0.25, 0.3, 0.6, 1.2, 1.5, 0.8]);
        const qv = rng.int(4, 30);
        const top = Q.dec(dv).mul(q(qv));
        const e = rng.int(11, 99);
        const places = String(dv).split('.')[1]?.length ?? 0;
        const f = q(10 ** places);
        return {
          ...base,
          lhs: chain(divide(num(top, top.isInt() ? 'int' : 'dec'), dec(dv)), ['+', n(e)]),
          rhs: unk(),
          tags: T(),
          shortcut: `Shift the decimal point ${places} place${places > 1 ? 's' : ''} in both numbers: $${top.toNumber()} \\div ${dv} = ${top.mul(f).toNumber()} \\div ${Q.dec(dv).mul(f).toNumber()} = ${qv}$.`,
          mistakes: [{ value: q(qv * 10 + e), why: 'you shift the decimal point in only one of the two numbers' }],
        };
      }
      default: {
        const [a, c, v] = decProduct(rng, 4, 20);
        const e = rng.int(110, 990) / 10;
        need(v.toNumber() > 3);
        return {
          ...base,
          lhs: chain(dec(e), ['+', times(dec(a), n(c))]),
          rhs: unk(),
          tags: T('trap:bodmas-order'),
          mistakes: [{ value: Q.dec(e).add(Q.dec(a)).mul(q(c)), why: 'you add before multiplying' }],
        };
      }
    }
  }
  if (d === 'medium') {
    switch (rng.int(0, 2)) {
      case 0: {
        const [a, c] = decProduct(rng, 8, 60);
        const [b, e] = decProduct(rng, 8, 60);
        const f = rng.int(11, 199) / 10;
        const v = Q.dec(a).mul(q(c)).add(Q.dec(b).mul(q(e))).sub(Q.dec(f));
        need(v.sign > 0 && v.toNumber() > 10);
        return {
          ...base,
          lhs: chain(times(dec(a), n(c)), ['+', times(dec(b), n(e))], ['-', dec(f)]),
          rhs: unk(),
          tags: T(),
          mistakes: [{ value: v.add(Q.dec(2 * f)), why: `you add ${f} instead of subtracting it` }],
        };
      }
      case 1: {
        const a = rng.pick([4.2, 3.6, 2.4, 1.8, 5.5, 6.4, 2.8]);
        const b = rng.pick([1.5, 2.5, 0.5, 1.2, 0.4]);
        const dv = rng.pick([0.12, 0.15, 0.25, 0.04, 0.06, 0.08]);
        const qv = rng.int(3, 12);
        const top = Q.dec(dv).mul(q(qv));
        return {
          ...base,
          lhs: chain(br(times(dec(a), dec(b))), ['+', divide(num(top, 'dec'), dec(dv))]),
          rhs: unk(),
          tags: T(),
        };
      }
      default: {
        const [a, c] = decProduct(rng, 10, 80);
        const b = rng.pick([0.5, 1.5, 0.2, 0.4, 2.5]);
        const e = rng.int(4, 30);
        const g = rng.int(11, 99);
        const v = Q.dec(a).mul(q(c)).sub(Q.dec(b).mul(q(e))).add(q(g));
        need(v.sign > 0 && Q.dec(a).mul(q(c)).cmp(Q.dec(b).mul(q(e))) > 0);
        return { ...base, lhs: chain(times(dec(a), n(c)), ['-', times(dec(b), n(e))], ['+', n(g)]), rhs: unk(), tags: T() };
      }
    }
  }
  if (d === 'hard') {
    switch (rng.int(0, 2)) {
      case 0: {
        const p = rng.pick([0.25, 0.5, 0.2, 0.4, 0.75, 1.5, 0.8, 1.25]);
        const x = rng.int(4, 60) * (p === 0.75 || p === 1.25 ? 4 : p === 0.8 || p === 0.4 || p === 0.2 ? 5 : 2);
        const [a, c, v] = decProduct(rng, 10, 60);
        const T0 = Q.dec(p).mul(q(x)).add(v);
        need(T0.isInt() || T0.isDecimal(1));
        return {
          ...base,
          lhs: chain(times(unk(), dec(p)), ['+', times(dec(a), n(c))]),
          rhs: num(T0, T0.isInt() ? 'int' : 'dec'),
          x: q(x),
          style: 'int',
          tags: T('simplification:missing-inside'),
          mistakes: [{ value: T0.sub(v).mul(Q.dec(p)), why: `you multiply by ${p} instead of dividing by it` }],
        };
      }
      case 1: {
        const a = rng.pick([2.5, 1.5, 4.5, 0.5, 3.5, 12.5]);
        const b = rng.pick([1.6, 2.4, 0.8, 1.2, 3.2, 0.4]);
        const y = rng.int(4, 40);
        const x = Q.dec(a).add(q(y));
        const Tv = Q.dec(b).mul(q(y));
        need(Tv.isDecimal(1));
        const c = rng.int(3, 9);
        const ee = Tv.sub(q(c));
        need(ee.sign > 0);
        return {
          ...base,
          lhs: times(br(chain(unk(), ['-', dec(a)])), dec(b)),
          rhs: chain(num(ee, ee.isInt() ? 'int' : 'dec'), ['+', n(c)]),
          x,
          tags: T('simplification:missing-inside'),
          mistakes: [{ value: q(y).sub(Q.dec(a)), why: `you subtract ${a} instead of adding it back` }],
        };
      }
      default: {
        const [a, b] = decProduct(rng, 10, 40);
        const dv = rng.pick([0.5, 0.25, 0.2, 0.4, 1.5]);
        const qv = rng.int(6, 30);
        const top = Q.dec(dv).mul(q(qv));
        const [e, f] = decProduct(rng, 4, 20);
        const g = rng.int(11, 99) / 10;
        const v = Q.dec(a).mul(q(b)).add(q(qv)).sub(Q.dec(e).mul(q(f))).add(Q.dec(g));
        need(v.sign > 0 && Q.dec(a).mul(q(b)).add(q(qv)).cmp(Q.dec(e).mul(q(f))) > 0);
        return {
          ...base,
          lhs: chain(times(dec(a), n(b)), ['+', divide(num(top, top.isInt() ? 'int' : 'dec'), dec(dv))], ['-', times(dec(e), n(f))], ['+', dec(g)]),
          rhs: unk(),
          tags: T(),
        };
      }
    }
  }
  // extreme: factor recognition with decimals
  const pairs: [number, number][] = [
    [0.8, 0.2], [0.7, 0.3], [0.9, 0.4], [1.2, 0.8], [1.5, 0.5], [2.5, 1.5], [0.6, 0.4], [3.5, 1.5], [4.5, 1.5], [1.3, 0.7], [0.75, 0.25], [2.4, 0.6],
  ];
  switch (rng.int(0, 3)) {
    case 0: {
      const [a, b] = rng.pick(pairs);
      return {
        ...base,
        lhs: fracx(chain(cube(dec(a)), ['-', cube(dec(b))]), chain(sq(dec(a)), ['+', times(dec(a), dec(b))], ['+', sq(dec(b))])),
        rhs: unk(),
        tags: T('trick:algebraic-identity'),
        shortcut: `Use $a^3 - b^3 = (a - b)(a^2 + ab + b^2)$: the whole fraction is just $a - b = ${a} - ${b}$.`,
        mistakes: [{ value: Q.dec(a).add(Q.dec(b)), why: 'you use a + b instead of a − b' }],
      };
    }
    case 1: {
      const [a, b] = rng.pick(pairs.filter(([x, y]) => Q.dec(x).add(Q.dec(y)).isInt()));
      return {
        ...base,
        lhs: chain(sq(dec(a)), ['+', times(n(2), dec(a), dec(b))], ['+', sq(dec(b))]),
        rhs: unk(),
        tags: T('trick:algebraic-identity'),
        shortcut: `This is $(a + b)^2$ with $a = ${a}$, $b = ${b}$: $(${a} + ${b})^2 = ${Q.dec(a).add(Q.dec(b)).toNumber()}^2$.`,
        mistakes: [{ value: Q.dec(a).sub(Q.dec(b)).pow(2), why: 'you use (a − b)² instead of (a + b)²' }],
      };
    }
    case 2: {
      const [a, b] = rng.pick(pairs);
      return {
        ...base,
        lhs: fracx(chain(sq(dec(a)), ['-', sq(dec(b))]), chain(dec(a), ['-', dec(b)])),
        rhs: unk(),
        tags: T('trick:algebraic-identity'),
        shortcut: `$a^2 - b^2 = (a + b)(a - b)$, so the fraction is $a + b = ${a} + ${b}$.`,
        mistakes: [{ value: Q.dec(a).sub(Q.dec(b)), why: 'you cancel to a − b instead of a + b' }],
      };
    }
    default: {
      const a = rng.pick([1.5, 2.5, 0.5, 1.2, 0.4, 0.8]);
      const x = rng.int(4, 40) * (a === 1.2 ? 5 : a === 0.4 || a === 0.8 ? 5 : 2);
      const ax = Q.dec(a).mul(q(x));
      need(ax.isInt());
      const c = rng.pick([0.5, 0.25, 1.5, 2.5, 0.2]);
      const k = rng.int(4, 30);
      const b = ax.sub(Q.dec(c).mul(q(k)));
      need(b.sign > 0 && b.isDecimal(2));
      const dd = rng.int(5, 40);
      return {
        ...base,
        lhs: chain(divide(br(chain(br(times(unk(), dec(a))), ['-', num(b, b.isInt() ? 'int' : 'dec')]), 1), dec(c)), ['+', n(dd)]),
        rhs: n(k + dd),
        x: q(x),
        style: 'int',
        tags: T('simplification:missing-inside', 'simplification:nested-brackets'),
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Percent of                                                          */
/* ------------------------------------------------------------------ */

function percentOf(rng: Rng, d: Difficulty): Draft {
  const T = (...extra: string[]) => tagsFor('percentage', 'trick:percent-fraction', ...extra);
  if (d === 'easy') {
    const p = pickPct(rng, d);
    const X = pctBase(rng, p, 80, 1200);
    const P = p.mul(q(X)).div(q(100)).n;
    switch (rng.int(0, 2)) {
      case 0: {
        const c = rng.int(11, 99);
        return { lhs: chain(pct(pctNode(p), n(X)), ['+', n(c)]), rhs: unk(), tags: T() };
      }
      case 1: {
        const p2 = pickPct(rng, d);
        const Y = pctBase(rng, p2, 80, 900);
        return { lhs: chain(pct(pctNode(p), n(X)), ['+', pct(pctNode(p2), n(Y))]), rhs: unk(), tags: T() };
      }
      default: {
        const c = rng.int(5, Math.max(6, P - 5));
        need(P - c > 3);
        return { lhs: chain(pct(pctNode(p), n(X)), ['-', n(c)]), rhs: unk(), tags: T() };
      }
    }
  }
  if (d === 'medium') {
    const p = pickPct(rng, d);
    const X = pctBase(rng, p, 120, 4000);
    const P = p.mul(q(X)).div(q(100)).n;
    switch (rng.int(0, 3)) {
      case 0: {
        const p2 = pickPct(rng, d);
        const Y = pctBase(rng, p2, 80, 3000);
        const P2 = p2.mul(q(Y)).div(q(100)).n;
        const a = rng.int(3, 12);
        const b = rng.int(3, 15);
        need(P + P2 - a * b > 5);
        return {
          lhs: chain(pct(pctNode(p), n(X)), ['+', pct(pctNode(p2), n(Y))], ['-', times(n(a), n(b))]),
          rhs: unk(),
          tags: T(),
          mistakes: [{ value: q(P + P2 + a * b), why: `you add ${a} × ${b} instead of subtracting it` }],
        };
      }
      case 1: {
        const s = rng.int(11, 35);
        const c = rng.int(5, Math.max(6, s + P - 5));
        need(s + P - c > 3);
        return {
          lhs: chain(sqrt(s * s), ['+', pct(pctNode(p), n(X))], ['-', n(c)]),
          rhs: unk(),
          tags: T('simplification:roots'),
          mistakes: [{ value: q(s + 1 + P - c), why: `you take $\\sqrt{${s * s}}$ as ${s + 1}` }],
        };
      }
      case 2: {
        const p2 = pickPct(rng, d);
        const Y = pctBase(rng, p2, 80, 900);
        const P2 = p2.mul(q(Y)).div(q(100)).n;
        const a = rng.int(11, 29);
        const b = rng.int(3, 9);
        need(P + a * b - P2 > 5);
        return { lhs: chain(pct(pctNode(p), n(X)), ['+', times(n(a), n(b))], ['-', pct(pctNode(p2), n(Y))]), rhs: unk(), tags: T() };
      }
      default: {
        const a = rng.int(2, 9);
        need(P % a === 0 && P / a >= 3);
        const b = rng.int(11, 99);
        return { lhs: chain(divide(pct(pctNode(p), n(X)), n(a)), ['+', n(b)]), rhs: unk(), tags: T() };
      }
    }
  }
  if (d === 'hard') {
    switch (rng.int(0, 2)) {
      case 0: {
        const x = rng.pick([12, 15, 16, 18, 22, 24, 25, 28, 32, 35, 36, 40, 42, 45, 48, 55, 64, 65, 72, 75, 84]);
        const X = pctBase(rng, q(x), 150, 1500);
        const P = (x * X) / 100;
        const p2 = pickPct(rng, d);
        const Y = pctBase(rng, p2, 100, 1200);
        const P2 = p2.mul(q(Y)).div(q(100)).n;
        return {
          lhs: chain(pct(unk(), n(X)), ['+', pct(pctNode(p2), n(Y))]),
          rhs: makeRhs(rng, P + P2, d),
          x: q(x),
          tags: T('simplification:missing-inside'),
          mistakes: Number.isInteger(((P + 2 * P2) * 100) / X) ? [{ value: q(((P + 2 * P2) * 100) / X), why: `you add ${P2} to the right-hand side instead of subtracting it` }] : [],
        };
      }
      case 1: {
        const p = pickPct(rng, d);
        const u = pctUnit(p);
        const k = rng.int(Math.max(1, Math.ceil(100 / u)), Math.max(1, Math.floor(1500 / u)));
        const x = u * k;
        const P = p.mul(q(x)).div(q(100)).n;
        const p2 = pickPct(rng, 'medium');
        const Y = pctBase(rng, p2, 80, 800);
        const P2 = p2.mul(q(Y)).div(q(100)).n;
        need(P - P2 > 15);
        return {
          lhs: chain(pct(pctNode(p), unk()), ['-', pct(pctNode(p2), n(Y))]),
          rhs: makeRhs(rng, P - P2, d),
          x: q(x),
          tags: T('simplification:missing-inside'),
        };
      }
      default: {
        const ps = [pickPct(rng, d), pickPct(rng, 'medium'), pickPct(rng, 'medium')];
        const Xs = ps.map((p, i) => pctBase(rng, p, i === 0 ? 200 : 80, 1400));
        const Ps = ps.map((p, i) => p.mul(q(Xs[i])).div(q(100)).n);
        const a = rng.int(11, 29);
        const b = rng.int(3, 9);
        need(Ps[0] + Ps[1] - Ps[2] > 5);
        return {
          lhs: chain(pct(pctNode(ps[0]), n(Xs[0])), ['+', pct(pctNode(ps[1]), n(Xs[1]))], ['-', pct(pctNode(ps[2]), n(Xs[2]))], ['+', times(n(a), n(b))]),
          rhs: unk(),
          tags: T(),
          mistakes: [{ value: q(Ps[0] + Ps[1] + Ps[2] + a * b), why: `you add the third percentage instead of subtracting it` }],
        };
      }
    }
  }
  // extreme
  switch (rng.int(0, 2)) {
    case 0: {
      const p = Q.dec(rng.pick([20, 25, 40, 50, 60, 75, 30, 80]));
      const p2 = Q.dec(rng.pick([10, 20, 25, 40, 45, 50, 60, 12.5, 37.5]));
      const f = p.mul(p2).div(q(10000));
      const u = f.d;
      const k = rng.int(Math.max(1, Math.ceil(200 / u)), Math.max(1, Math.floor(4000 / u)));
      const x = u * k;
      const L = f.mul(q(x));
      need(L.isInt() && L.n >= 12);
      return {
        lhs: pct(pctNode(p), pct(pctNode(p2), unk())),
        rhs: makeRhs(rng, L.n, d),
        x: q(x),
        tags: T('simplification:missing-inside', 'percent:percent-of-percent'),
        shortcut: `${p.toNumber()}% of ${p2.toNumber()}% is a single fraction: $${qFracTex(p.div(q(100)))} \\times ${qFracTex(p2.div(q(100)))} = ${qFracTex(f)}$, so ? $= ${L.n} \\div ${qFracTex(f)}$.`,
      };
    }
    case 1: {
      const p = pickPct(rng, 'medium');
      const D = pctBase(rng, p, 100, 900);
      const Y = rng.int(20, 400);
      const P = p.mul(q(D)).div(q(100)).n;
      const divs: number[] = [];
      for (let a = 2; a <= 12; a++) if (P % a === 0) divs.push(a);
      need(divs.length > 0);
      const a = rng.pick(divs);
      const b = rng.int(3, 15);
      const c = rng.int(3, 9);
      const slip = p.mul(q(D + Y)).div(q(100 * a)).add(q(b * c));
      return {
        lhs: chain(divide(br(pct(pctNode(p), br(chain(n(D + Y), ['-', n(Y)]))), 1), n(a)), ['+', times(n(b), n(c))]),
        rhs: unk(),
        tags: T('simplification:nested-brackets'),
        mistakes: slip.isInt() ? [{ value: slip, why: `you take the percentage of ${D + Y} and forget to subtract ${Y} inside the bracket first` }] : [],
      };
    }
    default: {
      const ps = rng.sample(PCT_MIXED.slice(0, 4), 2);
      const p3 = Q.dec(rng.pick([12.5, 37.5, 62.5, 87.5]));
      const Xs = [pctBase(rng, ps[0], 90, 1200), pctBase(rng, ps[1], 90, 1200), pctBase(rng, p3, 80, 800)];
      const Ps = [ps[0], ps[1], p3].map((p, i) => p.mul(q(Xs[i])).div(q(100)).n);
      need(Ps[0] + Ps[1] - Ps[2] > 5);
      return {
        lhs: chain(pct(pctNode(ps[0]), n(Xs[0])), ['+', pct(pctNode(ps[1]), n(Xs[1]))], ['-', pct(pctNode(p3), n(Xs[2]))]),
        rhs: unk(),
        tags: T(),
      };
    }
  }
}

export function qFracTex(v: Q): string {
  return v.isInt() ? String(v.n) : `\\frac{${v.n}}{${v.d}}`;
}

/* ------------------------------------------------------------------ */
/* Powers and roots                                                    */
/* ------------------------------------------------------------------ */

const TRIPLES: [number, number, number][] = [
  [3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [12, 35, 37], [9, 40, 41], [6, 8, 10], [9, 12, 15], [12, 16, 20], [15, 20, 25], [10, 24, 26], [16, 30, 34], [18, 24, 30], [21, 28, 35],
];

function powersRoots(rng: Rng, d: Difficulty): Draft {
  const T = (...extra: string[]) => tagsFor('powers-roots', 'trick:squares-cubes', ...extra);
  if (d === 'easy') {
    switch (rng.int(0, 3)) {
      case 0: {
        const a = rng.int(11, 25);
        const b = rng.int(11, 25);
        const c = rng.int(11, 99);
        need(a !== b);
        return {
          lhs: chain(sq(a), ['+', sq(b)], ['-', n(c)]),
          rhs: unk(),
          tags: T(),
          mistakes: [{ value: q(2 * a + 2 * b - c), why: `you double the numbers instead of squaring them` }].filter((m) => m.value.n > 0),
        };
      }
      case 1: {
        const s = rng.int(11, 30);
        const b = rng.int(11, 25);
        const c = rng.int(5, 60);
        return { lhs: chain(sqrt(s * s), ['+', sq(b)], ['-', n(c)]), rhs: unk(), tags: T() };
      }
      case 2: {
        const a = rng.int(6, 12);
        const b = rng.int(11, 25);
        need(a ** 3 > b * b + 10);
        return { lhs: chain(cube(a), ['-', sq(b)]), rhs: unk(), tags: T() };
      }
      default: {
        const a = rng.int(15, 30);
        const s = rng.int(4, 15);
        const c = rng.int(3, 9);
        need(a * a - s * c > 10);
        return { lhs: chain(sq(a), ['-', times(sqrt(s * s), n(c))]), rhs: unk(), tags: T() };
      }
    }
  }
  if (d === 'medium') {
    switch (rng.int(0, 2)) {
      case 0: {
        const s = rng.int(11, 45);
        const a = rng.int(3, 9);
        const b = rng.int(11, 35);
        const t = rng.int(3, 12);
        return {
          lhs: chain(times(sqrt(s * s), n(a)), ['+', sq(b)], ['-', cbrt(t ** 3)]),
          rhs: unk(),
          tags: T(),
          mistakes: [{ value: q(s * a + b * b - (t + 1)), why: `you take $\\sqrt[3]{${t ** 3}}$ as ${t + 1}` }],
        };
      }
      case 1: {
        const a = rng.int(11, 45);
        const b = rng.int(11, 35);
        const s = rng.int(6, 25);
        const c = rng.int(3, 9);
        need(a * a + b * b - s * c > 10);
        return { lhs: chain(sq(a), ['+', sq(b)], ['-', times(sqrt(s * s), n(c))]), rhs: unk(), tags: T() };
      }
      default: {
        const a = rng.int(4, 12);
        const divs = [2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 18, 20, 25, 27].filter((b) => a ** 3 % b === 0 && b !== a);
        need(divs.length > 0);
        const b = rng.pick(divs);
        const s = rng.int(11, 45);
        return { lhs: chain(divide(cube(a), n(b)), ['+', sqrt(s * s)]), rhs: unk(), tags: T() };
      }
    }
  }
  if (d === 'hard') {
    switch (rng.int(0, 3)) {
      case 0: {
        const x = rng.int(11, 45);
        const a = rng.int(11, 40);
        return {
          lhs: chain(sq(unk()), ['+', sq(a)]),
          rhs: makeRhs(rng, x * x + a * a, d),
          x: q(x),
          tags: T('simplification:missing-inside'),
          mistakes: [{ value: q(x + 1), why: `you misremember the square root (${(x + 1) ** 2} is ${x + 1}²)` }, { value: q(x - 1), why: `you misremember the square root (${(x - 1) ** 2} is ${x - 1}²)` }],
        };
      }
      case 1: {
        const y = rng.int(9, 35);
        const a = rng.int(3, 12);
        const b = rng.int(11, 35);
        return {
          lhs: chain(times(sqrt(unk()), n(a)), ['+', sq(b)]),
          rhs: makeRhs(rng, y * a + b * b, d),
          x: q(y * y),
          tags: T('simplification:missing-inside'),
          squareOptions: true,
        };
      }
      case 2: {
        const y = rng.int(3, 15);
        const a = rng.int(11, 40);
        return {
          lhs: chain(cbrt(unk()), ['+', sq(a)]),
          rhs: makeRhs(rng, y + a * a, d),
          x: q(y ** 3),
          tags: T('simplification:missing-inside'),
          mistakes: [{ value: q((y + 1) ** 3), why: `you cube ${y + 1} instead of ${y}` }, { value: q((y - 1) ** 3), why: `you cube ${y - 1} instead of ${y}` }].filter((m) => m.value.n > 0),
        };
      }
      default: {
        const s = rng.int(11, 45);
        const b = rng.int(11, 40);
        const t = rng.int(3, 12);
        const dd = rng.int(3, 9);
        const e = rng.int(11, 99);
        const v = s + b * b - t * dd + e;
        need(v > 10);
        return { lhs: chain(sqrt(s * s), ['+', sq(b)], ['-', times(cbrt(t ** 3), n(dd))], ['+', n(e)]), rhs: unk(), tags: T() };
      }
    }
  }
  // extreme
  switch (rng.int(0, 5)) {
    case 0: {
      const x = rng.int(5, 15);
      const a = rng.int(3, 15);
      return {
        lhs: chain(cube(unk()), ['+', cube(a)]),
        rhs: makeRhs(rng, x ** 3 + a ** 3, d),
        x: q(x),
        tags: T('simplification:missing-inside'),
        mistakes: [{ value: q(x + 1), why: `you misremember the cube root (${(x + 1) ** 3} is ${x + 1}³)` }, { value: q(x - 1), why: `you misremember the cube root (${(x - 1) ** 3} is ${x - 1}³)` }],
      };
    }
    case 1: {
      const a = rng.int(21, 99);
      const b = rng.int(11, a - 5);
      const byPlus = rng.chance(0.5);
      return {
        lhs: fracx(chain(sq(a), ['-', sq(b)]), byPlus ? chain(n(a), ['+', n(b)]) : chain(n(a), ['-', n(b)])),
        rhs: unk(),
        tags: T('trick:algebraic-identity'),
        shortcut: `$a^2 - b^2 = (a + b)(a - b)$, so the fraction is simply $${byPlus ? `${a} - ${b}` : `${a} + ${b}`}$. Never square ${a} here.`,
        mistakes: [{ value: q(byPlus ? a + b : a - b), why: `you cancel the wrong factor` }],
      };
    }
    case 2: {
      const a = rng.int(11, 60);
      const b = rng.int(3, a - 3);
      return {
        lhs: chain(pow(br(chain(n(a), ['+', n(b)])), 2), ['-', pow(br(chain(n(a), ['-', n(b)])), 2)]),
        rhs: unk(),
        tags: T('trick:algebraic-identity'),
        shortcut: `$(a + b)^2 - (a - b)^2 = 4ab = 4 \\times ${a} \\times ${b}$.`,
        mistakes: [{ value: q(2 * a * b), why: 'you remember the identity as 2ab instead of 4ab' }],
      };
    }
    case 3: {
      const [a, b, h] = rng.pick(TRIPLES);
      const c = rng.int(3, 12);
      return {
        lhs: times(sqrt(chain(sq(a), ['+', sq(b)])), n(c)),
        rhs: unk(),
        tags: T('trick:pythagorean-triple'),
        shortcut: `(${a}, ${b}, ${h}) is a Pythagorean triple, so $\\sqrt{${a}^{2} + ${b}^{2}} = ${h}$.`,
        mistakes: [{ value: q((a + b) * c), why: `you take $\\sqrt{a^2 + b^2}$ as $a + b$` }],
      };
    }
    case 4: {
      const a = rng.int(5, 20);
      const b = rng.int(3, 12);
      const c = rng.int(2, 6);
      const x = (b * c) ** 2 - a * a;
      need(x > 20);
      return {
        lhs: sqrt(chain(unk(), ['+', sq(a)])),
        rhs: times(n(b), n(c)),
        x: q(x),
        tags: T('simplification:missing-inside'),
        mistakes: [{ value: q((b * c) ** 2 + a * a), why: `you add ${a}² instead of subtracting it` }],
      };
    }
    default: {
      const a = rng.int(21, 79);
      const b = rng.int(11, a - 6);
      return {
        lhs: chain(sq(a), ['-', times(n(2), n(a), n(b))], ['+', sq(b)]),
        rhs: unk(),
        tags: T('trick:algebraic-identity'),
        shortcut: `This is $(a - b)^2$: $(${a} - ${b})^2 = ${a - b}^2 = ${(a - b) ** 2}$.`,
        mistakes: [{ value: q((a + b) ** 2), why: 'you use (a + b)² instead of (a − b)²' }].filter((m) => m.value.n < 8 * (a - b) ** 2),
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Missing value inside                                                */
/* ------------------------------------------------------------------ */

function missingInside(rng: Rng, d: Difficulty): Draft {
  const T = (...extra: string[]) => tagsFor('missing-inside', ...extra);
  if (d === 'easy') {
    switch (rng.int(0, 3)) {
      case 0: {
        const b = rng.int(11, 29);
        const c = rng.int(3, 9);
        const a = rng.int(11, b * c - 11);
        return {
          lhs: chain(unk(), ['+', n(a)]),
          rhs: times(n(b), n(c)),
          x: q(b * c - a),
          tags: T(),
          mistakes: [{ value: q(b * c + a), why: `you add ${a} instead of subtracting it when moving it across` }],
        };
      }
      case 1: {
        const b = rng.int(11, 29);
        const c = rng.int(3, 9);
        const a = rng.int(11, 99);
        return {
          lhs: chain(unk(), ['-', n(a)]),
          rhs: times(n(b), n(c)),
          x: q(b * c + a),
          tags: T(),
          mistakes: [{ value: q(b * c - a), why: `you subtract ${a} instead of adding it when moving it across` }].filter((m) => m.value.n > 0),
        };
      }
      case 2: {
        const a = rng.int(3, 9);
        const x = rng.int(11, 50);
        const b = rng.int(10, a * x - 10);
        return { lhs: times(unk(), n(a)), rhs: chain(n(b), ['+', n(a * x - b)]), x: q(x), tags: T() };
      }
      default: {
        const a = rng.int(3, 12);
        const s = rng.int(10, 60);
        const b = rng.int(5, s - 5);
        return {
          lhs: divide(unk(), n(a)),
          rhs: chain(n(b), ['+', n(s - b)]),
          x: q(a * s),
          tags: T(),
          mistakes: [{ value: q(s), why: `you forget to multiply by ${a}` }].filter((m) => m.value.n * 4 >= a * s),
        };
      }
    }
  }
  if (d === 'medium') {
    switch (rng.int(0, 6)) {
      case 5: {
        // (a + b) ÷ ? = c
        const x = rng.int(6, 36);
        const c = rng.int(8, 60);
        const a = rng.int(10, x * c - 10);
        return {
          lhs: divide(br(chain(n(a), ['+', n(x * c - a)])), unk()),
          rhs: n(c),
          x: q(x),
          tags: T(),
          mistakes: Number.isInteger((a - (x * c - a)) / c) && a > x * c - a ? [{ value: q((a - (x * c - a)) / c), why: 'you subtract inside the bracket instead of adding' }] : [],
        };
      }
      case 6: {
        // k × ? = p% of q
        const x = rng.int(11, 99);
        const k = rng.int(3, 15);
        const P = k * x;
        const opts = rng.shuffle([10, 20, 25, 40, 50, 60, 75, 80, 12.5, 30, 15, 45, 35]).filter((p) => {
          const Qv = (P * 100) / p;
          return Number.isInteger(Qv) && Qv >= 100 && Qv <= 9999;
        });
        need(opts.length > 0);
        const p = Q.dec(opts[0]);
        const base = (P * 100) / opts[0];
        return {
          lhs: times(n(k), unk()),
          rhs: pct(pctNode(p), n(base)),
          x: q(x),
          tags: T('trick:percent-fraction'),
          mistakes: [{ value: q(P), why: `you stop at ${opts[0]}% of ${base} = ${P} and forget to divide by ${k}` }].filter((m0) => m0.value.n < 2.5 * x),
        };
      }
      case 0: {
        const x = rng.pick([12, 15, 16, 20, 24, 25, 30, 35, 36, 40, 45, 48, 60, 64, 75]);
        const X = pctBase(rng, q(x), 150, 1500);
        const Tv = (x * X) / 100;
        need(Tv >= 25);
        const b = rng.int(3, 12);
        const c = Math.floor((Tv - 5) / b) - rng.int(0, 3);
        const a = Tv - b * c;
        need(c >= 2 && a > 0 && a !== b && a !== c);
        return {
          lhs: pct(unk(), n(X)),
          rhs: chain(n(a), ['+', times(n(b), n(c))]),
          x: q(x),
          tags: T('trick:percent-fraction'),
          mistakes: Number.isInteger((((a + b) * c) * 100) / X) ? [{ value: q((((a + b) * c) * 100) / X), why: `you add ${a} and ${b} before multiplying` }] : [],
        };
      }
      case 1: {
        const y = rng.int(9, 35);
        const a = rng.int(5, 40);
        return {
          lhs: chain(sqrt(unk()), ['+', n(a)]),
          rhs: makeRhs(rng, y + a, 'hard'),
          x: q(y * y),
          tags: T('trick:squares-cubes'),
          squareOptions: true,
        };
      }
      case 2: {
        const x = rng.int(6, 25);
        const y = rng.int(5, 30);
        const b = rng.int(11, 60);
        return {
          lhs: chain(divide(n(x * y), unk()), ['+', n(b)]),
          rhs: n(y + b),
          x: q(x),
          tags: T(),
        };
      }
      case 3: {
        const [p, qd] = properFrac(rng, [3, 4, 5, 6, 7, 8]);
        const k = rng.int(Math.ceil(30 / qd), Math.floor(600 / qd));
        return {
          lhs: of(frac(p, qd), unk()),
          rhs: makeRhs(rng, p * k, 'hard'),
          x: q(qd * k),
          tags: T(),
          mistakes: [{ value: q(p * k), why: `you give $\\frac{${p}}{${qd}}$ of ? instead of ? itself` }].filter((m) => m.value.n * 4 > qd * k),
        };
      }
      default: {
        const x = rng.int(11, 40);
        const a = rng.int(3, 9);
        const p = pickPct(rng, 'easy');
        const X = pctBase(rng, p, 60, 600);
        const P = p.mul(q(X)).div(q(100)).n;
        need(x * a - P > 5);
        return {
          lhs: chain(times(unk(), n(a)), ['-', pct(pctNode(p), n(X))]),
          rhs: n(x * a - P),
          x: q(x),
          tags: T('trick:percent-fraction'),
          mistakes: Number.isInteger((x * a - 2 * P) / a) && x * a - 2 * P > 0 ? [{ value: q((x * a - 2 * P) / a), why: `you subtract ${P} instead of adding it when moving it across` }] : [],
        };
      }
    }
  }
  if (d === 'hard') {
    switch (rng.int(0, 3)) {
      case 0: {
        const x = rng.int(11, 45);
        const a = rng.int(3, 15);
        const b = rng.int(3, 12);
        const Tv = x * x - a * b;
        need(Tv > 10);
        const c = Math.floor(Math.cbrt(Tv));
        const e = Tv - c ** 3;
        need(c >= 2);
        return {
          lhs: chain(sq(unk()), ['-', times(n(a), n(b))]),
          rhs: e === 0 ? cube(c) : chain(cube(c), ['+', n(e)]),
          x: q(x),
          tags: T('trick:squares-cubes'),
          mistakes: [{ value: q(x + 1), why: `you misremember the square root (${(x + 1) ** 2} is ${x + 1}²)` }, { value: q(x - 1), why: `you misremember the square root (${(x - 1) ** 2} is ${x - 1}²)` }],
        };
      }
      case 1: {
        const x = rng.int(11, 60);
        const a = rng.int(5, 40);
        const b = rng.int(3, 9);
        return {
          lhs: times(br(chain(unk(), ['+', n(a)])), n(b)),
          rhs: makeRhs(rng, (x + a) * b, d),
          x: q(x),
          tags: T(),
          mistakes: [{ value: q(x + 2 * a), why: `you add ${a} instead of subtracting it at the end` }],
        };
      }
      case 2: {
        const x = rng.int(4, 24);
        const r = rng.int(2, 9);
        const b = rng.int(11, 30);
        const c = rng.int(5, 60);
        return {
          lhs: chain(prod([n(x * r), n(b)], unk()), ['+', n(c)]),
          rhs: makeRhs(rng, r * b + c, d),
          x: q(x),
          tags: T(),
        };
      }
      default: {
        const x = rng.pick([12, 15, 16, 18, 20, 24, 25, 32, 35, 36, 40, 45, 48, 64, 75]);
        const X = pctBase(rng, q(x), 150, 1500);
        const p2 = pickPct(rng, d);
        const Y = pctBase(rng, p2, 100, 1000);
        const P2 = p2.mul(q(Y)).div(q(100)).n;
        return {
          lhs: chain(pct(unk(), n(X)), ['+', pct(pctNode(p2), n(Y))]),
          rhs: makeRhs(rng, (x * X) / 100 + P2, d),
          x: q(x),
          tags: T('trick:percent-fraction'),
        };
      }
    }
  }
  // extreme
  switch (rng.int(0, 3)) {
    case 0: {
      const x = rng.int(5, 15);
      const a = rng.int(2, x - 1);
      return {
        lhs: chain(cube(unk()), ['-', cube(a)]),
        rhs: makeRhs(rng, x ** 3 - a ** 3, d),
        x: q(x),
        tags: T('trick:squares-cubes'),
        mistakes: [{ value: q(x + 1), why: `you misremember the cube root (${(x + 1) ** 3} is ${x + 1}³)` }, { value: q(x - 1), why: `you misremember the cube root (${(x - 1) ** 3} is ${x - 1}³)` }],
      };
    }
    case 1: {
      const y = rng.int(3, 15);
      const a = rng.int(3, 12);
      const b = rng.int(11, 30);
      return {
        lhs: chain(times(cbrt(unk()), n(a)), ['+', sq(b)]),
        rhs: makeRhs(rng, y * a + b * b, d),
        x: q(y ** 3),
        tags: T('trick:squares-cubes'),
        mistakes: [{ value: q((y + 1) ** 3), why: `you cube ${y + 1} instead of ${y}` }, { value: q((y - 1) ** 3), why: `you cube ${y - 1} instead of ${y}` }].filter((m) => m.value.n > 0),
      };
    }
    case 2: {
      const x = rng.int(5, 40);
      const a = rng.int(3, 9);
      const c = rng.int(3, 9);
      const k = rng.int(3, Math.max(3, Math.floor((x * a - 1) / c)));
      const b = x * a - c * k;
      need(b > 0);
      const dd = rng.int(5, 40);
      return {
        lhs: chain(divide(br(chain(br(times(unk(), n(a))), ['-', n(b)]), 1), n(c)), ['+', n(dd)]),
        rhs: n(k + dd),
        x: q(x),
        tags: T('simplification:nested-brackets'),
      };
    }
    default: {
      const a = rng.int(5, 20);
      const b = rng.int(3, 12);
      const c = rng.int(2, 6);
      const x = (b * c) ** 2 - a * a;
      need(x > 20);
      return {
        lhs: sqrt(chain(unk(), ['+', sq(a)])),
        rhs: times(n(b), n(c)),
        x: q(x),
        tags: T('trick:squares-cubes'),
        mistakes: [{ value: q((b * c) ** 2 + a * a), why: `you add ${a}² instead of subtracting it` }],
      };
    }
  }
}

export const EXACT_BUILDERS: Record<string, (rng: Rng, d: Difficulty) => Draft> = {
  bodmas,
  fractions,
  decimals,
  'percent-of': percentOf,
  'powers-roots': powersRoots,
  'missing-inside': missingInside,
};
