/**
 * Same-base exponent questions (2ᵃ × 4ᵇ ÷ 8ᶜ = 2^?). The unknown is an exponent, so the worked steps are written
 * here (rewrite every base as a power of the prime, then add/subtract powers) instead of the generic reducer.
 * Answers are kept in 5…20 so the key can sit at any option position.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty } from '../../../types';
import { q } from './frac';
import { br, chain, frac, n, pow, prod, sqrt, times, unk, type Node } from './expr';
import { need, type Draft, type MistakeQ } from './templates';

export interface ExpDraft extends Draft {
  steps: string[];
}

/** Largest total exponent per prime base that keeps every intermediate value a safe integer. */
const MAX_EXP: Record<number, number> = { 2: 45, 3: 30, 5: 20, 7: 16 };

const TAGS = ['simplification:exponents', 'trick:same-base'];

function m(value: number, why: string): MistakeQ {
  return { value: q(value), why };
}

const pp = (b: number, e: number | string) => `${b}^{${e}}`;

/**
 * "base^? = value" (the 2024–26 style): the answer is small (1–9) and the options are five consecutive integers.
 * The key's position is chosen uniformly first, then the answer is built to fit it.
 */
function baseToValue(rng: Rng, d: Difficulty): ExpDraft {
  const pos = rng.int(0, 4);
  const MAX_ANS: Record<number, number> = { 2: 13, 3: 8, 4: 6, 5: 6, 6: 5, 7: 5, 8: 4, 9: 4, 11: 4, 12: 3, 13: 3, 15: 3 };
  const base = rng.pick(Object.keys(MAX_ANS).map(Number));
  const lo = pos + 1;
  const hi = Math.min(MAX_ANS[base], pos + 5);
  need(lo <= hi, 'base too large for this option position');
  const ans = rng.int(lo, hi);
  const V = base ** ans;
  const powTex = `${base}^{${ans}}`;
  const tags = [...TAGS, 'simplification:power-unknown'];
  const shortcut = `Know the powers of ${base}: ${[1, 2, 3, 4, 5].filter((k) => base ** k <= 99999).map((k) => `$${base}^{${k}} = ${base ** k}$`).join(', ')}.`;
  const form = d === 'easy' ? rng.int(0, 2) : rng.int(1, 4);
  switch (form) {
    case 0:
      return {
        lhs: pow(n(base), unk()),
        rhs: n(V),
        x: q(ans),
        tags,
        consecutivePos: pos,
        steps: [`$${V} = ${powTex}$`, `So, ? = ${ans}`],
        shortcut,
      };
    case 1: {
      const c = rng.int(3, 25);
      need(V * c <= 99999);
      return {
        lhs: times(pow(n(base), unk()), n(c)),
        rhs: n(V * c),
        x: q(ans),
        tags,
        consecutivePos: pos,
        steps: [`$${base}^{?} = ${V * c} \\div ${c} = ${V}$`, `$${V} = ${powTex}$`, `So, ? = ${ans}`],
        shortcut,
      };
    }
    case 2: {
      const c = rng.int(11, 199);
      return {
        lhs: chain(pow(n(base), unk()), ['+', n(c)]),
        rhs: n(V + c),
        x: q(ans),
        tags,
        consecutivePos: pos,
        steps: [`$${base}^{?} = ${V + c} - ${c} = ${V}$`, `$${V} = ${powTex}$`, `So, ? = ${ans}`],
        shortcut,
      };
    }
    case 3: {
      const k = rng.int(1, 3);
      const W = base ** (ans + k);
      need(W <= 99999);
      return {
        lhs: times(pow(n(base), unk()), pow(n(base), k)),
        rhs: n(W),
        x: q(ans),
        tags,
        consecutivePos: pos,
        steps: [`$${W} = ${base}^{${ans + k}}$`, `Same base: $? + ${k} = ${ans + k}$`, `So, ? = ${ans}`],
        shortcut,
      };
    }
    default: {
      const c = rng.int(2, 9);
      const s = V * c;
      const a = rng.int(11, 99);
      need(s - a > 5 && s <= 99999);
      return {
        lhs: chain(times(n(c), pow(n(base), unk())), ['-', n(a)]),
        rhs: n(s - a),
        x: q(ans),
        tags,
        consecutivePos: pos,
        steps: [`$${c} \\times ${base}^{?} = ${s - a} + ${a} = ${s}$`, `$${base}^{?} = ${s} \\div ${c} = ${V} = ${powTex}$`, `So, ? = ${ans}`],
        shortcut,
      };
    }
  }
}

export function exponents(rng: Rng, d: Difficulty): ExpDraft {
  if ((d === 'easy' && rng.chance(0.6)) || (d === 'medium' && rng.chance(0.5))) return baseToValue(rng, d);
  if (d === 'easy') {
    const base = rng.pick([2, 3, 5, 7]);
    const hi = Math.min(18, MAX_EXP[base] - 2);
    switch (rng.int(0, 2)) {
      case 0: {
        const ans = rng.int(5, hi);
        const a = rng.int(2, ans - 2);
        const b = ans - a;
        return {
          lhs: times(pow(n(base), a), pow(n(base), b)),
          rhs: pow(n(base), unk()),
          x: q(ans),
          tags: TAGS,
          steps: [`Same base, so add the powers: $${pp(base, a)} \\times ${pp(base, b)} = ${pp(base, `${a} + ${b}`)} = ${pp(base, ans)}$`, `So, ? = ${ans}`],
          shortcut: '$a^m \\times a^n = a^{m+n}$ — never multiply the powers.',
          mistakes: [m(a * b, `you multiply the powers (${a} × ${b}) instead of adding them`), m(ans + 1, 'you slip by 1 while adding the powers'), m(ans - 1, 'you slip by 1 while adding the powers')],
        };
      }
      case 1: {
        const ans = rng.int(5, Math.min(15, hi));
        const b = rng.int(2, 9);
        const a = ans + b;
        need(a <= MAX_EXP[base]);
        return {
          lhs: prod([pow(n(base), a)], pow(n(base), b)),
          rhs: pow(n(base), unk()),
          x: q(ans),
          tags: TAGS,
          steps: [`Same base, so subtract the powers: $${pp(base, a)} \\div ${pp(base, b)} = ${pp(base, `${a} - ${b}`)} = ${pp(base, ans)}$`, `So, ? = ${ans}`],
          shortcut: '$a^m \\div a^n = a^{m-n}$.',
          mistakes: [m(a + b, 'you add the powers instead of subtracting them'), ...(a % b === 0 ? [m(a / b, 'you divide the powers instead of subtracting them')] : []), m(ans + 1, 'you slip by 1 while adding the powers')],
        };
      }
      default: {
        const ans = rng.int(5, Math.min(15, hi));
        const k = rng.int(2, 8);
        const tot = ans + k;
        need(tot <= MAX_EXP[base] && tot >= 4);
        const a = rng.int(2, tot - 2);
        const b = tot - a;
        return {
          lhs: prod([pow(n(base), a), pow(n(base), b)], pow(n(base), k)),
          rhs: pow(n(base), unk()),
          x: q(ans),
          tags: TAGS,
          steps: [`Add the powers for ×, subtract for ÷: $${a} + ${b} - ${k} = ${ans}$`, `So the left side is $${pp(base, ans)}$ and ? = ${ans}`],
          shortcut: 'Work only with the powers: + for ×, − for ÷.',
          mistakes: [m(a + b + k, `you add the power ${k} instead of subtracting it`), m(ans + 1, 'you slip by 1 while adding the powers'), m(ans - 1, 'you slip by 1 while adding the powers')],
        };
      }
    }
  }
  if (d === 'medium') {
    switch (rng.int(0, 2)) {
      case 0: {
        const b = rng.int(2, 6);
        const c = rng.int(1, 4);
        const ans = rng.int(5, 16);
        const a = ans - 2 * b + 3 * c;
        need(a >= 2 && a + 2 * b <= MAX_EXP[2]);
        return {
          lhs: prod([pow(n(2), a), pow(n(4), b)], pow(n(8), c)),
          rhs: pow(n(2), unk()),
          x: q(ans),
          tags: TAGS,
          steps: [
            `$4^{${b}} = (2^{2})^{${b}} = 2^{${2 * b}}$`,
            `$8^{${c}} = (2^{3})^{${c}} = 2^{${3 * c}}$`,
            `$2^{${a}} \\times 2^{${2 * b}} \\div 2^{${3 * c}} = 2^{${a} + ${2 * b} - ${3 * c}} = 2^{${ans}}$`,
            `So, ? = ${ans}`,
          ],
          shortcut: 'Convert 4 → 2², 8 → 2³ and just add/subtract the powers.',
          mistakes: [m(a + b - c, 'you add the powers of 4 and 8 without converting them to base 2'), m(a + 2 * b + 3 * c, 'you add the power of 8 instead of subtracting it'), m(ans + 1, 'you slip by 1 while adding the powers')],
        };
      }
      case 1: {
        const a = rng.int(2, 6);
        const b = rng.int(1, 5);
        const ans = 2 * a + 3 * b;
        need(ans >= 7 && ans <= MAX_EXP[3]);
        return {
          lhs: times(pow(n(9), a), pow(n(27), b)),
          rhs: pow(n(3), unk()),
          x: q(ans),
          tags: TAGS,
          steps: [`$9^{${a}} = (3^{2})^{${a}} = 3^{${2 * a}}$`, `$27^{${b}} = (3^{3})^{${b}} = 3^{${3 * b}}$`, `$3^{${2 * a}} \\times 3^{${3 * b}} = 3^{${ans}}$`, `So, ? = ${ans}`],
          shortcut: '9 = 3² and 27 = 3³: power of a power multiplies, then add.',
          mistakes: [m(a + b, 'you add the powers without converting 9 and 27 to base 3'), m(2 * a * 3 * b, 'you multiply the converted powers instead of adding them'), m(ans - 1, 'you slip by 1 while adding the powers')],
        };
      }
      default: {
        const a = rng.int(1, 4);
        const b = rng.int(1, 3);
        const top = 2 * a + 3 * b;
        need(top >= 7 && top <= MAX_EXP[5]);
        const c = rng.int(1, top - 5);
        const ans = top - c;
        return {
          lhs: prod([pow(n(25), a), pow(n(125), b)], pow(n(5), c)),
          rhs: pow(n(5), unk()),
          x: q(ans),
          tags: TAGS,
          steps: [`$25^{${a}} = 5^{${2 * a}}$ and $125^{${b}} = 5^{${3 * b}}$`, `$5^{${2 * a}} \\times 5^{${3 * b}} \\div 5^{${c}} = 5^{${2 * a} + ${3 * b} - ${c}} = 5^{${ans}}$`, `So, ? = ${ans}`],
          shortcut: '25 = 5², 125 = 5³; add for ×, subtract for ÷.',
          mistakes: [m(top + c, `you add the ${c} instead of subtracting it`), m(a + b - c, 'you skip converting 25 and 125 to powers of 5'), m(ans + 1, 'you slip by 1 while adding the powers')],
        };
      }
    }
  }
  if (d === 'hard') {
    switch (rng.int(0, 3)) {
      case 0: {
        const ans = rng.int(5, 12);
        const a = rng.int(1, 3);
        const c = rng.int(1, 3);
        const s = ans + 2 * a + c;
        need(s % 3 === 0);
        const b = s / 3;
        need(3 * b <= MAX_EXP[5] && ans + 2 * a <= MAX_EXP[5]);
        return {
          lhs: times(pow(n(5), unk()), pow(n(25), a)),
          rhs: prod([pow(n(125), b)], pow(n(5), c)),
          x: q(ans),
          tags: TAGS,
          steps: [
            `Write every term as a power of 5: $25^{${a}} = 5^{${2 * a}}$, $125^{${b}} = 5^{${3 * b}}$`,
            `Left side $= 5^{? + ${2 * a}}$, right side $= 5^{${3 * b} - ${c}} = 5^{${3 * b - c}}$`,
            `Equate the powers: $? + ${2 * a} = ${3 * b - c}$`,
            `$? = ${3 * b - c} - ${2 * a} = ${ans}$`,
          ],
          shortcut: 'Same base on both sides → compare the powers directly.',
          mistakes: [m(3 * b - c + 2 * a, `you add ${2 * a} instead of subtracting it`), m(3 * b + c - 2 * a, `you add the ${c} on the right instead of subtracting it`), m(ans + 1, 'you slip by 1 while adding the powers')],
        };
      }
      case 1: {
        const ans = rng.int(5, 12);
        const a = rng.int(1, 4);
        const b = rng.int(1, 4);
        const c = 2 * ans + 4 * a - 3 * b;
        need(c >= 2 && 2 * ans + 4 * a <= MAX_EXP[2]);
        return {
          lhs: prod([pow(n(4), unk()), pow(n(16), a)], pow(n(8), b)),
          rhs: pow(n(2), c),
          x: q(ans),
          tags: TAGS,
          steps: [
            `Base 2 everywhere: $4^{?} = 2^{2 \\times ?}$, $16^{${a}} = 2^{${4 * a}}$, $8^{${b}} = 2^{${3 * b}}$`,
            `Powers: $2 \\times ? + ${4 * a} - ${3 * b} = ${c}$`,
            `$2 \\times ? = ${c} - ${4 * a} + ${3 * b} = ${2 * ans}$`,
            `So, ? = ${ans}`,
          ],
          shortcut: 'Remember that $4^{?}$ contributes $2 \\times ?$ to the power of 2.',
          mistakes: [m(2 * ans, 'you forget to halve at the end (4^? = 2^{2×?})'), m(ans + 1, 'you slip by 1 while adding the powers'), m(ans - 1, 'you slip by 1 while adding the powers')],
        };
      }
      case 2: {
        const base = rng.pick([2, 3, 5]);
        const a = rng.int(2, 3);
        const b = rng.int(2, 4);
        const ans = rng.int(5, 10);
        const k = a * b + ans;
        need(k <= MAX_EXP[base]);
        return {
          lhs: times(pow(br(pow(n(base), a)), b), pow(n(base), unk())),
          rhs: pow(n(base), k),
          x: q(ans),
          tags: [...TAGS, 'trick:power-of-power'],
          steps: [`Power of a power multiplies: $(${pp(base, a)})^{${b}} = ${pp(base, a * b)}$`, `$${a * b} + ? = ${k}$`, `$? = ${k} - ${a * b} = ${ans}$`],
          shortcut: '$(a^m)^n = a^{mn}$, then compare powers.',
          mistakes: [m(k - a - b, `you add the powers ${a} and ${b} instead of multiplying them`), m(ans + 1, 'you slip by 1 while adding the powers')],
        };
      }
      default: {
        const a = rng.int(1, 3);
        const b = rng.int(1, 4);
        const ans = 3 * b + 2 * a;
        need(ans >= 5 && ans <= MAX_EXP[3]);
        return {
          lhs: prod([pow(n(3), unk())], pow(n(9), a)),
          rhs: pow(n(27), b),
          x: q(ans),
          tags: TAGS,
          steps: [`$9^{${a}} = 3^{${2 * a}}$ and $27^{${b}} = 3^{${3 * b}}$`, `$? - ${2 * a} = ${3 * b}$`, `$? = ${3 * b} + ${2 * a} = ${ans}$`],
          shortcut: 'Rewrite 9 and 27 as powers of 3 and compare.',
          mistakes: [m(3 * b - 2 * a, `you subtract ${2 * a} instead of adding it`), m(b + a, 'you compare the powers without converting to base 3'), m(ans + 1, 'you slip by 1 while adding the powers')],
        };
      }
    }
  }
  // extreme
  switch (rng.int(0, 2)) {
    case 0: {
      const TABLE: Record<number, [number, number, number, number][]> = {
        // [number, exp numerator, exp denominator, resulting power of the prime]
        2: [[4, 3, 2, 3], [8, 2, 3, 2], [8, 4, 3, 4], [16, 3, 4, 3], [16, 5, 4, 5], [32, 3, 5, 3], [32, 4, 5, 4], [64, 2, 3, 4], [64, 5, 6, 5], [64, 1, 2, 3], [256, 3, 4, 6], [256, 5, 8, 5], [512, 2, 3, 6], [1024, 3, 5, 6], [1024, 7, 10, 7]],
        3: [[9, 3, 2, 3], [27, 2, 3, 2], [27, 4, 3, 4], [81, 3, 4, 3], [81, 5, 4, 5], [243, 3, 5, 3], [243, 4, 5, 4], [729, 2, 3, 4], [729, 5, 6, 5]],
        5: [[25, 3, 2, 3], [125, 2, 3, 2], [125, 4, 3, 4], [625, 3, 4, 3], [625, 5, 4, 5]],
      };
      const base = rng.pick([2, 2, 3, 5]);
      const [t1, t2, t3] = rng.sample(TABLE[base], 3);
      const useDiv = rng.chance(0.5);
      const ans = t1[3] + t2[3] - (useDiv ? t3[3] : 0);
      need(ans >= 5 && ans <= 16);
      const node = (t: [number, number, number, number]): Node => pow(n(t[0]), frac(t[1], t[2]));
      const lhs = prod([node(t1), node(t2)], useDiv ? node(t3) : undefined);
      const primePow = (t: [number, number, number, number]) => {
        const k = Math.round(Math.log(t[0]) / Math.log(base));
        return `$${t[0]}^{\\frac{${t[1]}}{${t[2]}}} = (${pp(base, k)})^{\\frac{${t[1]}}{${t[2]}}} = ${pp(base, t[3])}$`;
      };
      return {
        lhs,
        rhs: pow(n(base), unk()),
        x: q(ans),
        tags: [...TAGS, 'trick:fractional-power'],
        steps: [primePow(t1), primePow(t2), ...(useDiv ? [primePow(t3)] : []), `Powers: $${t1[3]} + ${t2[3]}${useDiv ? ` - ${t3[3]}` : ''} = ${ans}$`, `So, ? = ${ans}`],
        shortcut: `Write each number as a power of ${base}, multiply by the fractional power, then add/subtract.`,
        mistakes: [m(t1[3] + t2[3] + (useDiv ? t3[3] : 0) + (useDiv ? 0 : 1), useDiv ? 'you add the divisor’s power instead of subtracting it' : 'you slip by 1 while adding the powers'), m(ans + 2, 'you slip while converting one fractional power'), m(ans - 1, 'you slip by 1 while adding the powers')],
      };
    }
    case 1: {
      const base = rng.pick([2, 3, 5]);
      const ans = rng.int(5, base === 5 ? 8 : 10);
      const mm = rng.int(1, 6);
      need((mm + 2 * ans) % 3 === 0);
      const nn = (mm + 2 * ans) / 3;
      need(3 * nn <= MAX_EXP[base]);
      return {
        lhs: times(pow(sqrt(base), 2 * mm), pow(n(base * base), unk())),
        rhs: pow(n(base ** 3), nn),
        x: q(ans),
        tags: [...TAGS, 'trick:fractional-power'],
        steps: [
          `$(\\sqrt{${base}})^{${2 * mm}} = ${pp(base, mm)}$`,
          `$${base * base}^{?} = ${pp(base, '2 \\times ?')}$ and $${base ** 3}^{${nn}} = ${pp(base, 3 * nn)}$`,
          `Compare powers: $${mm} + 2 \\times ? = ${3 * nn}$`,
          `$2 \\times ? = ${3 * nn - mm}$, so ? = ${ans}`,
        ],
        shortcut: `$\\sqrt{${base}} = ${base}^{\\frac{1}{2}}$ — halve its power first.`,
        mistakes: [
          m(3 * nn - mm, 'you forget to halve at the end'),
          Number.isInteger((3 * nn - 4 * mm) / 2) && 3 * nn - 4 * mm > 0
            ? m((3 * nn - 4 * mm) / 2, 'you double the power of the square root instead of halving it')
            : m(ans + 1, 'you slip by 1 while adding the powers'),
          m(ans - 1, 'you slip by 1 while adding the powers'),
        ],
      };
    }
    default: {
      const pair = rng.pick([
        [2, 3],
        [3, 4],
        [2, 5],
      ] as const);
      const [p, r] = pair;
      const ans = rng.int(5, 12);
      const a = rng.int(Math.ceil((ans + 1) / 2), 8);
      const b = 2 * a - ans;
      need(b >= 1);
      return {
        lhs: times(pow(frac(p, r), unk()), pow(frac(r * r, p * p), a)),
        rhs: pow(frac(r, p), b),
        x: q(ans),
        tags: [...TAGS, 'trick:reciprocal-base'],
        steps: [
          `$\\left(\\frac{${p}}{${r}}\\right)^{?} = \\left(\\frac{${r}}{${p}}\\right)^{-?}$ and $\\left(\\frac{${r * r}}{${p * p}}\\right)^{${a}} = \\left(\\frac{${r}}{${p}}\\right)^{${2 * a}}$`,
          `Compare powers of $\\frac{${r}}{${p}}$: $-? + ${2 * a} = ${b}$`,
          `$? = ${2 * a} - ${b} = ${ans}$`,
        ],
        shortcut: 'Flip the fraction and change the sign of its power so every term has the same base.',
        mistakes: [m(2 * a + b, 'you forget that flipping the base changes the sign of the power'), m(a - b > 0 ? a - b : ans + 2, a - b > 0 ? `you take $(\\frac{${r * r}}{${p * p}})^{${a}}$ as power ${a} instead of ${2 * a}` : 'you slip by 2 in the powers'), m(ans + 1, 'you slip by 1 while adding the powers')],
      };
    }
  }
}
