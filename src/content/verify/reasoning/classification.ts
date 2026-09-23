/**
 * Independent verifier for reasoning.classification.
 *
 * Recomputes, from the options alone, every property in its own catalogue (letter gaps, opposite letters,
 * vowels, position sums, direction, alphabet half; primes, squares, cubes, divisibility, digit sums, digits;
 * relations inside number pairs). A property that four options share and the fifth lacks names an odd one.
 * The answer is valid only if at least one such property exists and ALL of them name the same option.
 */
import type { GenResult } from '../../generators/types';
import type { ClassificationFacts } from '../../generators/reasoning/classification';

const NOT_UNIQUE = '#no-unique-odd-one#';

/** Index of the single value that differs from the other four identical values, else -1. */
function loner(values: readonly string[]): number {
  for (let i = 0; i < values.length; i++) {
    const rest = values.filter((_, j) => j !== i);
    if (rest.every((v) => v === rest[0]) && values[i] !== rest[0]) return i;
  }
  return -1;
}

/** Index of the only option failing a relation that the other four satisfy, else -1. */
function onlyFailure(flags: readonly boolean[]): number {
  const fails = flags.map((f, i) => (f ? -1 : i)).filter((i) => i >= 0);
  return fails.length === 1 ? fails[0] : -1;
}

/* letters */
const code = (c: string) => c.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
const VOWEL = /[AEIOU]/;

function letterOdds(groups: string[]): number[] {
  const features: ((g: string) => string)[] = [
    (g) => String(g.length),
    (g) =>
      g
        .split('')
        .slice(1)
        .map((c, i) => code(c) - code(g[i]))
        .join('/'),
    (g) => String(code(g[0]) + code(g[g.length - 1]) === 27),
    (g) => (g.length === 4 ? String(code(g[0]) + code(g[1]) === 27 && code(g[2]) + code(g[3]) === 27) : '-'),
    (g) => (g.length === 4 ? String(code(g[0]) + code(g[3]) === 27 && code(g[1]) + code(g[2]) === 27) : '-'),
    (g) => g.replace(/[AEIOU]/g, 'v').replace(/[^v]/g, 'c'),
    (g) => String((g.match(/[AEIOU]/g) ?? []).length),
    (g) => String(VOWEL.test(g)),
    (g) => String(VOWEL.test(g[0])),
    (g) => String(VOWEL.test(g[g.length - 1])),
    (g) => String(g.split('').reduce((s, c) => s + code(c), 0)),
    (g) => {
      const d = g.split('').slice(1).map((c, i) => code(c) - code(g[i]));
      return d.every((x) => x > 0) ? 'asc' : d.every((x) => x < 0) ? 'desc' : 'mix';
    },
    (g) => (g.split('').every((c) => code(c) <= 13) ? 'first-half' : g.split('').every((c) => code(c) > 13) ? 'second-half' : 'both'),
  ];
  const maxLen = Math.max(...groups.map((g) => g.length));
  for (let i = 0; i < maxLen - 1; i++) features.push((g) => (i + 1 < g.length ? String(code(g[i + 1]) - code(g[i])) : 'none'));
  return features.map((f) => loner(groups.map(f))).filter((i) => i >= 0);
}

/* numbers */
function primeTest(n: number): boolean {
  if (n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let d = 3; d <= Math.floor(Math.sqrt(n)); d += 2) if (n % d === 0) return false;
  return true;
}
function powTest(n: number, k: number): boolean {
  for (let r = 0; r ** k <= n; r++) if (r ** k === n) return true;
  return false;
}
const digits = (n: number) => String(n).split('').map(Number);

function numberOdds(nums: number[]): number[] {
  const features: ((n: number) => string)[] = [
    (n) => String(primeTest(n)),
    (n) => String(powTest(n, 2)),
    (n) => String(powTest(n, 3)),
    (n) => String(n % 2),
    (n) => String(String(n) === String(n).split('').reverse().join('')),
    (n) => String(String(n).length),
    (n) => String(digits(n).reduce((a, b) => a + b, 0)),
    (n) => String(1 + ((n - 1) % 9)),
    (n) => String(n % 10),
    (n) => String(n).charAt(0),
  ];
  for (const d of [3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 17, 19]) features.push((n) => String(n % d === 0));
  return features.map((f) => loner(nums.map(f))).filter((i) => i >= 0);
}

function pairOdds(pairs: [number, number][]): number[] {
  const out: number[] = [];
  const rel = (f: (a: number) => number) => {
    const i = onlyFailure(pairs.map(([a, b]) => f(a) === b));
    if (i >= 0) out.push(i);
  };
  for (let c = -5; c <= 5; c++) {
    rel((a) => a ** 2 + c);
    rel((a) => a ** 3 + c);
  }
  for (let k = 1; k <= 9; k++) for (let c = -9; c <= 9; c++) rel((a) => k * a + c);
  for (let c = -3; c <= 3; c++) rel((a) => a * (a + c));
  const features: ((p: [number, number]) => string)[] = [
    ([, b]) => String(primeTest(b)),
    ([, b]) => String(powTest(b, 2)),
    ([, b]) => String(b % 2),
    ([a]) => String(a % 2),
    ([a]) => String(primeTest(a)),
    ([a, b]) => String(b - a),
    ([a, b]) => String(b % a === 0),
  ];
  for (const f of features) {
    const i = loner(pairs.map(f));
    if (i >= 0) out.push(i);
  }
  return out;
}

export function verify(res: GenResult<ClassificationFacts>): (number | string)[] {
  const f = res.facts;
  const opts = res.item.questions[0].options;
  let odds: number[];
  if (f.kind === 'letters') odds = letterOdds(f.letters ?? []);
  else if (f.kind === 'numbers') odds = numberOdds(f.numbers ?? []);
  else odds = pairOdds(f.pairs ?? []);
  const unique = [...new Set(odds)];
  if (unique.length !== 1) return [NOT_UNIQUE];
  return [opts[unique[0]]];
}
