/**
 * Rule families for odd-one-out questions. A "4–1 split" is a property shared by exactly four options; the fifth
 * is the odd one. A generated question is accepted only when EVERY split in this catalogue points to the same
 * option (the intended one) — so no other rule family we know of produces a different answer.
 *
 * Symmetric properties (prime / not prime, contains a vowel / does not…) count in both directions. Relations for
 * number pairs count only when four pairs satisfy them (any single pair fits countless relations).
 */

export const posOf = (ch: string): number => ch.charCodeAt(0) - 64;
const VOWELS = 'AEIOU';
export const isVowel = (ch: string): boolean => VOWELS.includes(ch);

/** Odd index when exactly four keys agree, else null. */
export function oddByKey(keys: readonly (string | number | boolean)[]): number | null {
  const counts = new Map<string, number>();
  const ks = keys.map(String);
  for (const k of ks) counts.set(k, (counts.get(k) ?? 0) + 1);
  if (counts.size !== 2) return null;
  const entries = [...counts.entries()];
  const lone = entries.find(([, c]) => c === 1);
  const four = entries.find(([, c]) => c === 4);
  return lone && four ? ks.indexOf(lone[0]) : null;
}

/** Odd index when exactly four satisfy the relation. */
export function oddByPositive(flags: readonly boolean[]): number | null {
  if (flags.filter(Boolean).length !== 4) return null;
  return flags.indexOf(false);
}

/* ------------------------------------------------------------------ */
/* Letters                                                             */
/* ------------------------------------------------------------------ */

export function gaps(g: string): number[] {
  const out: number[] = [];
  for (let i = 1; i < g.length; i++) out.push(posOf(g[i]) - posOf(g[i - 1]));
  return out;
}

export interface NamedSplit {
  rule: string;
  odd: number;
}

export function letterSplits(groups: readonly string[]): NamedSplit[] {
  const out: NamedSplit[] = [];
  const add = (rule: string, odd: number | null) => {
    if (odd !== null) out.push({ rule, odd });
  };
  if (new Set(groups.map((g) => g.length)).size !== 1) add('length', oddByKey(groups.map((g) => g.length)));
  const len = groups[0].length;
  add('gap pattern', oddByKey(groups.map((g) => gaps(g).join(','))));
  for (let i = 0; i < len - 1; i++) add(`gap ${i + 1}`, oddByKey(groups.map((g) => gaps(g)[i] ?? 'x')));
  add('first and last letters opposite', oddByKey(groups.map((g) => posOf(g[0]) + posOf(g[g.length - 1]) === 27)));
  if (len === 4) {
    add('opposite pairs (1–2, 3–4)', oddByKey(groups.map((g) => posOf(g[0]) + posOf(g[1]) === 27 && posOf(g[2]) + posOf(g[3]) === 27)));
    add('opposite pairs (1–4, 2–3)', oddByKey(groups.map((g) => posOf(g[0]) + posOf(g[3]) === 27 && posOf(g[1]) + posOf(g[2]) === 27)));
  }
  add('vowel positions', oddByKey(groups.map((g) => [...g].map((c) => (isVowel(c) ? 'V' : 'C')).join(''))));
  add('number of vowels', oddByKey(groups.map((g) => [...g].filter(isVowel).length)));
  add('contains a vowel', oddByKey(groups.map((g) => [...g].some(isVowel))));
  add('starts with a vowel', oddByKey(groups.map((g) => isVowel(g[0]))));
  add('ends with a vowel', oddByKey(groups.map((g) => isVowel(g[g.length - 1]))));
  add('sum of positions', oddByKey(groups.map((g) => [...g].reduce((s, c) => s + posOf(c), 0))));
  add(
    'direction',
    oddByKey(
      groups.map((g) => {
        const d = gaps(g);
        return d.every((x) => x > 0) ? 'up' : d.every((x) => x < 0) ? 'down' : 'mixed';
      }),
    ),
  );
  add('half of the alphabet', oddByKey(groups.map((g) => ([...g].every((c) => posOf(c) <= 13) ? 'A-M' : [...g].every((c) => posOf(c) >= 14) ? 'N-Z' : 'both'))));
  return out;
}

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

export function isPrime(n: number): boolean {
  if (n < 2 || !Number.isInteger(n)) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

export const isSquare = (n: number): boolean => n >= 0 && Math.round(Math.sqrt(n)) ** 2 === n;
export const isCube = (n: number): boolean => n >= 0 && Math.round(Math.cbrt(n)) ** 3 === n;
export const digitSum = (n: number): number => String(Math.abs(n)).split('').reduce((s, d) => s + Number(d), 0);

export const DIVISORS = [3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 17, 19];

export function numberSplits(nums: readonly number[]): NamedSplit[] {
  const out: NamedSplit[] = [];
  const add = (rule: string, odd: number | null) => {
    if (odd !== null) out.push({ rule, odd });
  };
  add('prime', oddByKey(nums.map(isPrime)));
  add('perfect square', oddByKey(nums.map(isSquare)));
  add('perfect cube', oddByKey(nums.map(isCube)));
  add('even', oddByKey(nums.map((n) => n % 2 === 0)));
  for (const d of DIVISORS) add(`divisible by ${d}`, oddByKey(nums.map((n) => n % d === 0)));
  add('palindrome', oddByKey(nums.map((n) => String(n) === String(n).split('').reverse().join(''))));
  add('number of digits', oddByKey(nums.map((n) => String(n).length)));
  add('digit sum', oddByKey(nums.map(digitSum)));
  add('digital root', oddByKey(nums.map((n) => ((n - 1) % 9) + 1)));
  add('last digit', oddByKey(nums.map((n) => n % 10)));
  add('first digit', oddByKey(nums.map((n) => String(n)[0])));
  return out;
}

/** Relations b = f(a) checked for pairs (positive-only). */
export function pairRelations(): { name: string; f: (a: number) => number }[] {
  const out: { name: string; f: (a: number) => number }[] = [];
  for (let c = -5; c <= 5; c++) out.push({ name: `a² ${c < 0 ? '−' : '+'} ${Math.abs(c)}`, f: (a) => a * a + c });
  for (let c = -5; c <= 5; c++) out.push({ name: `a³ ${c < 0 ? '−' : '+'} ${Math.abs(c)}`, f: (a) => a * a * a + c });
  for (let k = 1; k <= 9; k++) for (let c = -9; c <= 9; c++) out.push({ name: `${k}a ${c < 0 ? '−' : '+'} ${Math.abs(c)}`, f: (a) => k * a + c });
  for (let c = -3; c <= 3; c++) out.push({ name: `a(a ${c < 0 ? '−' : '+'} ${Math.abs(c)})`, f: (a) => a * (a + c) });
  return out;
}

export function pairSplits(pairs: readonly [number, number][]): NamedSplit[] {
  const out: NamedSplit[] = [];
  const add = (rule: string, odd: number | null) => {
    if (odd !== null) out.push({ rule, odd });
  };
  for (const r of pairRelations()) add(`second = ${r.name}`, oddByPositive(pairs.map(([a, b]) => r.f(a) === b)));
  add('second number prime', oddByKey(pairs.map(([, b]) => isPrime(b))));
  add('second number square', oddByKey(pairs.map(([, b]) => isSquare(b))));
  add('second number even', oddByKey(pairs.map(([, b]) => b % 2 === 0)));
  add('first number even', oddByKey(pairs.map(([a]) => a % 2 === 0)));
  add('first number prime', oddByKey(pairs.map(([a]) => isPrime(a))));
  add('difference', oddByKey(pairs.map(([a, b]) => b - a)));
  add('second divisible by first', oddByKey(pairs.map(([a, b]) => b % a === 0)));
  return out;
}
