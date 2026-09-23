/**
 * Reasoning R2 — Classification / odd one out (SPEC 8.2 R2, GEN parts only; research/archetypes.md R2).
 *
 * Letter groups (gap patterns incl. backward gaps, opposite-letter pairs, vowel positions, position sums) and
 * numbers (primes, squares, cubes, divisibility, digit sums, number pairs).
 *
 * Exactly one odd one out: every option set is checked against a catalogue of rule families
 * (classification/features.ts) and accepted only if every 4–1 split points to the intended option.
 */
import { defineGenerator } from '../types';
import { makeQuestion, single } from '../shared/question';
import { shuffleChoices } from '../shared/options';
import { targetSeconds } from '../../targets';
import type { Rng } from '../../../lib/rng';
import type { Difficulty, VisualSpec } from '../../types';
import { digitSum, gaps, isCube, isPrime, isSquare, isVowel, letterSplits, numberSplits, pairSplits, posOf } from './classification/features';

export interface ClassificationFacts {
  kind: 'letters' | 'numbers' | 'pairs';
  /** Intended rule family (analytics only — the verifier does not use it). */
  family: string;
  /** Options in display order. */
  letters?: string[];
  numbers?: number[];
  pairs?: [number, number][];
}

const META = { name: 'reasoning.classification', version: 1, subject: 'reasoning', chapter: 'classification' } as const;

const SUBTYPES = [
  { id: 'letter-groups', label: 'Letter groups', weight: 2 },
  { id: 'numbers', label: 'Numbers', weight: 1 },
] as const;

const PROMPT = 'Four of the following five are alike in a certain way and so form a group. Which one does not belong to that group?';

const L = (p: number): string => String.fromCharCode(64 + p);
const inRange = (p: number) => p >= 1 && p <= 26;
const sgn = (k: number) => (k > 0 ? `+${k}` : `−${-k}`);

interface Built {
  members: string[];
  odd: string;
  family: string;
  /** Per-option explanation, keyed by option text. */
  explain: (opt: string) => string;
  rule: string;
  shortcut: string;
  trap: string;
  tags: string[];
  kind: ClassificationFacts['kind'];
  toFact: (opts: string[]) => Partial<ClassificationFacts>;
}

/* ------------------------------------------------------------------ */
/* Letter families                                                     */
/* ------------------------------------------------------------------ */

function groupFrom(start: number, g: readonly number[]): string | null {
  const ps = [start];
  for (const x of g) ps.push(ps[ps.length - 1] + x);
  return ps.every(inRange) ? ps.map(L).join('') : null;
}

function describeGroup(grp: string): string {
  return `${[...grp].map((c) => `${c}(${posOf(c)})`).join(' ')}: ${gaps(grp).map(sgn).join(', ')}`;
}

function lettersFact(opts: string[]): Partial<ClassificationFacts> {
  return { letters: opts };
}

function gapFamily(rng: Rng, d: Difficulty): Built | null {
  const len = d === 'extreme' ? 4 : d === 'hard' ? rng.pick([3, 3, 4]) : 3;
  let g: number[];
  const k = (lo: number, hi: number) => rng.int(lo, hi) * (rng.chance(d === 'easy' ? 0 : d === 'medium' ? 0.3 : 0.4) ? -1 : 1);
  if (d === 'easy') {
    const x = rng.int(1, 3);
    g = [x, x];
  } else if (d === 'medium') {
    const x = k(1, 4);
    g = rng.chance(0.6) ? [x, x] : [x, x + Math.sign(x)];
  } else if (len === 3) {
    const a = k(1, 5);
    let b = Math.abs(k(1, 5)) * Math.sign(a);
    if (b === a) b = a + Math.sign(a);
    if (rng.chance(0.3)) b = -b; // mixed direction (e.g. +3, −1)
    g = [a, b];
  } else {
    const a = k(1, 4);
    g = rng.pick([
      [a, a, a],
      [a, a + Math.sign(a), a + 2 * Math.sign(a)],
      [a, -Math.sign(a) * rng.int(1, 3), a],
      [a, 2 * a, a],
    ]);
  }
  if (g.some((x) => x === 0)) return null;
  const idx = rng.int(0, g.length - 1);
  const g2 = [...g];
  g2[idx] = g[idx] + rng.pick([1, -1]);
  if (g2[idx] === 0) g2[idx] = g[idx] + 2 * Math.sign(g[idx]);
  const starts = rng.shuffle(Array.from({ length: 26 }, (_, i) => i + 1));
  const members: string[] = [];
  for (const s of starts) {
    if (members.length === 4) break;
    const grp = groupFrom(s, g);
    if (grp) members.push(grp);
  }
  const oddStarts = starts.filter((s) => !members.some((m) => posOf(m[0]) === s));
  let odd: string | null = null;
  for (const s of oddStarts) {
    odd = groupFrom(s, g2);
    if (odd) break;
  }
  if (members.length < 4 || !odd) return null;
  const pat = g.map(sgn).join(', ');
  return {
    members,
    odd,
    family: 'gap-pattern',
    explain: describeGroup,
    rule: `In four groups the letters move ${pat}; in '${odd}' they move ${g2.map(sgn).join(', ')}.`,
    shortcut: 'Write the alphabet positions (EJOTY: E 5, J 10, O 15, T 20, Y 25) and the gaps between neighbouring letters; the group with a different gap pattern is the odd one.',
    trap: g.some((x) => x < 0) ? 'Backward gaps count: −2 is not the same pattern as +2, so check the direction as well as the size of each gap.' : 'Check every gap, not just the first — the odd group usually differs in only one of them.',
    tags: ['classification:letters', 'classification:gap-pattern'],
    kind: 'letters',
    toFact: lettersFact,
  };
}

function vowelFamily(rng: Rng, d: Difficulty): Built | null {
  const vowels = [1, 5, 9, 15, 21];
  if (d === 'easy' || (d === 'medium' && rng.chance(0.5))) {
    // vowel in the middle: (v − k, v, v + k)
    const k = rng.int(1, d === 'easy' ? 2 : 4);
    const members = [5, 9, 15, 21].map((v) => groupFrom(v - k, [k, k]));
    if (members.some((m) => !m)) return null;
    const cands = Array.from({ length: 26 }, (_, i) => i + 1).filter((c) => !vowels.includes(c) && inRange(c - k) && inRange(c + k));
    const c = rng.pick(cands);
    const odd = groupFrom(c - k, [k, k])!;
    return {
      members: members as string[],
      odd,
      family: 'vowel-middle',
      explain: (o) => `${o}: middle letter ${o[1]} is ${isVowel(o[1]) ? 'a vowel' : 'a consonant'}`,
      rule: `Each group has letters ${sgn(k)}, ${sgn(k)} apart; in four of them the middle letter is a vowel (E, I, O, U), but in '${odd}' it is ${odd[1]}.`,
      shortcut: 'When every group has the same gaps, look at the vowels: A, E, I, O, U.',
      trap: 'The gaps are identical in all five groups, so hunting for a different gap finds nothing — the difference is the vowel.',
      tags: ['classification:letters', 'classification:vowel-position'],
      kind: 'letters',
      toFact: lettersFact,
    };
  }
  // starts with a vowel, common gaps
  const a = rng.int(1, 4);
  const b = rng.int(1, 4);
  const g = [a, b];
  const members = rng
    .shuffle(vowels)
    .map((v) => groupFrom(v, g))
    .filter((x): x is string => !!x)
    .slice(0, 4);
  if (members.length < 4) return null;
  const cands = Array.from({ length: 26 }, (_, i) => i + 1).filter((c) => !vowels.includes(c) && groupFrom(c, g));
  const odd = groupFrom(rng.pick(cands), g)!;
  return {
    members,
    odd,
    family: 'vowel-start',
    explain: (o) => `${o}: starts with ${o[0]} (${isVowel(o[0]) ? 'a vowel' : 'a consonant'}); gaps ${gaps(o).map(sgn).join(', ')}`,
    rule: `All five groups have gaps ${sgn(a)}, ${sgn(b)}, but four begin with a vowel; '${odd}' begins with the consonant ${odd[0]}.`,
    shortcut: 'Same gaps everywhere means the rule lies elsewhere — check which groups start with a vowel.',
    trap: 'All groups share the same gaps, so the gap pattern cannot be the rule here.',
    tags: ['classification:letters', 'classification:vowel-position'],
    kind: 'letters',
    toFact: lettersFact,
  };
}

function oppositeFamily(rng: Rng, d: Difficulty): Built | null {
  const opp = (p: number) => 27 - p;
  if (d === 'medium' || d === 'easy') {
    const firsts = rng.sample(Array.from({ length: 13 }, (_, i) => i + 1), 5);
    const members = firsts.slice(0, 4).map((p) => L(p) + L(opp(p)));
    const p = firsts[4];
    const q = opp(p) + rng.pick([1, -1]);
    if (!inRange(q) || q === p) return null;
    const odd = L(p) + L(q);
    return {
      members,
      odd,
      family: 'opposite-pair',
      explain: (o) => `${o[0]}(${posOf(o[0])}) + ${o[1]}(${posOf(o[1])}) = ${posOf(o[0]) + posOf(o[1])}`,
      rule: `In four pairs the letters are opposites (positions add up to 27); in '${odd}' they add up to ${p + q}.`,
      shortcut: 'Opposite letters add up to 27: A–Z, B–Y, C–X, D–W, E–V, F–U, G–T, H–S, I–R, J–Q, K–P, L–O, M–N.',
      trap: `'${odd}' is only one letter away from a true opposite pair, so it passes a quick glance.`,
      tags: ['classification:letters', 'classification:opposite-letters'],
      kind: 'letters',
      toFact: lettersFact,
    };
  }
  if (d === 'hard') {
    // two opposite pairs: x, 27−x, y, 27−y
    const mk = (x: number, y: number) => L(x) + L(opp(x)) + L(y) + L(opp(y));
    const xs = rng.sample(Array.from({ length: 26 }, (_, i) => i + 1), 10);
    const members = [0, 1, 2, 3].map((i) => mk(xs[2 * i], xs[2 * i + 1]));
    const x = xs[8];
    const y = xs[9];
    const brokeFirst = rng.chance(0.5);
    const shift = rng.pick([1, -1]);
    const a = brokeFirst ? opp(x) + shift : opp(x);
    const b = brokeFirst ? opp(y) : opp(y) + shift;
    if (!inRange(a) || !inRange(b)) return null;
    const odd = L(x) + L(a) + L(y) + L(b);
    return {
      members,
      odd,
      family: 'opposite-pairs',
      explain: (o) => `${o.slice(0, 2)}: ${posOf(o[0])} + ${posOf(o[1])} = ${posOf(o[0]) + posOf(o[1])}; ${o.slice(2)}: ${posOf(o[2])} + ${posOf(o[3])} = ${posOf(o[2]) + posOf(o[3])}`,
      rule: `Each group is two pairs of letters. In four groups both pairs are opposites (positions add up to 27); in '${odd}' one pair is not.`,
      shortcut: 'Split each group into two pairs and check each pair against the opposite-letter list (sum 27).',
      trap: 'Only one of the two pairs is off by a single letter — check both pairs of every option.',
      tags: ['classification:letters', 'classification:opposite-letters'],
      kind: 'letters',
      toFact: lettersFact,
    };
  }
  // extreme: first and last opposite, middle letter = first + k
  const k = rng.pick([1, 2, -1]);
  const firsts = rng.sample(
    Array.from({ length: 26 }, (_, i) => i + 1).filter((p) => inRange(p + k) && opp(p) !== p + k),
    5,
  );
  const members = firsts.slice(0, 4).map((p) => L(p) + L(p + k) + L(opp(p)));
  const p = firsts[4];
  const breakLast = rng.chance(0.5);
  const oddMid = breakLast ? p + k : p + k + rng.pick([1, -1]);
  const oddLast = breakLast ? opp(p) + rng.pick([1, -1]) : opp(p);
  if (!inRange(oddMid) || !inRange(oddLast) || oddMid === p) return null;
  const odd = L(p) + L(oddMid) + L(oddLast);
  return {
    members,
    odd,
    family: 'opposite-compound',
    explain: (o) => `${o}: ${o[0]} + ${o[2]} = ${posOf(o[0]) + posOf(o[2])}; ${o[0]} → ${o[1]} is ${sgn(posOf(o[1]) - posOf(o[0]))}`,
    rule: `In four groups the first and last letters are opposites (sum 27) and the middle letter is ${sgn(k)} from the first; '${odd}' breaks this.`,
    shortcut: 'Test two things for each group: first + last = 27, and the step from the first letter to the second.',
    trap: 'The odd group satisfies one of the two conditions, so checking only one condition can mislead you.',
    tags: ['classification:letters', 'classification:opposite-letters'],
    kind: 'letters',
    toFact: lettersFact,
  };
}

function sumFamily(rng: Rng): Built | null {
  const S = rng.int(30, 45);
  const members: string[] = [];
  const pick3 = (sum: number): string | null => {
    for (let t = 0; t < 60; t++) {
      const a = rng.int(1, 20);
      const b = rng.int(a + 1, 24);
      const c = sum - a - b;
      if (c > b && c <= 26) return L(a) + L(b) + L(c);
    }
    return null;
  };
  for (let t = 0; t < 40 && members.length < 4; t++) {
    const g = pick3(S);
    if (g && !members.includes(g)) members.push(g);
  }
  const odd = pick3(S + rng.pick([1, -1, 2, -2]));
  if (members.length < 4 || !odd) return null;
  return {
    members,
    odd,
    family: 'position-sum',
    explain: (o) => `${[...o].map((c) => `${c}(${posOf(c)})`).join(' + ')} = ${[...o].reduce((s, c) => s + posOf(c), 0)}`,
    rule: `The letter positions of four groups add up to ${S}; those of '${odd}' do not.`,
    shortcut: 'When gaps show no pattern, add the alphabet positions of each group.',
    trap: 'The gaps look irregular in every option, so a gap rule cannot decide it — the sum of positions does.',
    tags: ['classification:letters', 'classification:position-sum'],
    kind: 'letters',
    toFact: lettersFact,
  };
}

function letterFamily(rng: Rng, d: Difficulty): Built | null {
  const pick = rng.weighted<'gap' | 'vowel' | 'opp' | 'sum'>(
    {
      easy: [['gap', 6], ['vowel', 4]] as const,
      medium: [['gap', 5], ['opp', 2.5], ['vowel', 2.5]] as const,
      hard: [['gap', 5], ['opp', 3], ['vowel', 2]] as const,
      extreme: [['gap', 4], ['opp', 3], ['sum', 3]] as const,
    }[d],
  );
  if (pick === 'gap') return gapFamily(rng, d);
  if (pick === 'vowel') return vowelFamily(rng, d);
  if (pick === 'opp') return oppositeFamily(rng, d);
  return sumFamily(rng);
}

/* ------------------------------------------------------------------ */
/* Number families                                                     */
/* ------------------------------------------------------------------ */

function range(lo: number, hi: number): number[] {
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

function factorText(n: number): string {
  for (let p = 2; p * p <= n; p++) if (n % p === 0) return `${n} = ${p} × ${n / p}`;
  return `${n} is prime`;
}

function numbersFact(opts: string[]): Partial<ClassificationFacts> {
  return { numbers: opts.map(Number) };
}

function numberFamily(rng: Rng, d: Difficulty): Built | null {
  const fam = rng.weighted<'prime' | 'square' | 'cube' | 'div' | 'dsum' | 'pairs'>(
    {
      easy: [['prime', 3.5], ['square', 3.5], ['div', 3]] as const,
      medium: [['prime', 2], ['square', 2], ['cube', 2], ['div', 2], ['dsum', 2]] as const,
      hard: [['prime', 2], ['square', 2], ['cube', 1.5], ['div', 2], ['dsum', 1.5], ['pairs', 1]] as const,
      extreme: [['prime', 2], ['cube', 1.5], ['div', 2], ['dsum', 1.5], ['pairs', 3]] as const,
    }[d],
  );
  const num = (members: number[], odd: number, family: string, explain: (n: number) => string, rule: string, shortcut: string, trap: string): Built => ({
    members: members.map(String),
    odd: String(odd),
    family,
    explain: (o) => explain(Number(o)),
    rule,
    shortcut,
    trap,
    tags: ['classification:numbers', `classification:${family}`],
    kind: 'numbers',
    toFact: numbersFact,
  });
  if (fam === 'prime') {
    const [lo, hi] = { easy: [11, 97], medium: [23, 199], hard: [101, 499], extreme: [211, 997] }[d];
    const primes = range(lo, hi).filter(isPrime);
    // composites that look prime: odd, not multiples of 3 or 5
    const fakes = range(lo, hi).filter((n) => !isPrime(n) && n % 2 && n % 3 && n % 5);
    if (!fakes.length) return null;
    const members = rng.sample(primes, 4);
    const odd = rng.pick(fakes);
    return num(
      members,
      odd,
      'prime',
      (n) => (isPrime(n) ? `${n} is prime` : factorText(n)),
      `Four of the numbers are prime; ${factorText(odd)}.`,
      'To test for a prime, divide only by primes up to the square root (7, 11, 13, 17, 19 …); numbers like 91, 119, 143 and 187 look prime but are not.',
      `${odd} is odd and not divisible by 3 or 5, so it passes a quick check — but ${factorText(odd)}.`,
    );
  }
  if (fam === 'square') {
    const [lo, hi] = { easy: [4, 14], medium: [10, 25], hard: [15, 40], extreme: [30, 60] }[d];
    const roots = rng.sample(range(lo, hi), 5);
    const members = roots.slice(0, 4).map((r) => r * r);
    const r = roots[4];
    const odd = r * r + rng.pick([1, 2, 3, 4, 5, -1, -2, -3, -4, -5].filter((x) => r * r + x > 0));
    if (isSquare(odd)) return null;
    const near = Math.round(Math.sqrt(odd));
    return num(
      members,
      odd,
      'square',
      (n) => (isSquare(n) ? `${n} = ${Math.round(Math.sqrt(n))}²` : `${n} is not a perfect square (${near}² = ${near * near})`),
      `Four numbers are perfect squares; ${odd} is not (${near}² = ${near * near}).`,
      'Know squares up to 30² (and 40² for harder sets); a square never ends in 2, 3, 7 or 8.',
      `${odd} sits right next to ${near * near} = ${near}², which makes it look like a square.`,
    );
  }
  if (fam === 'cube') {
    const [lo, hi] = { easy: [2, 9], medium: [2, 9], hard: [4, 12], extreme: [5, 15] }[d];
    const roots = rng.sample(range(lo, hi), 5);
    const members = roots.slice(0, 4).map((r) => r ** 3);
    const r = roots[4];
    const odd = r ** 3 + rng.pick([1, -1, 2, -2, 3]);
    if (isCube(odd)) return null;
    return num(
      members,
      odd,
      'cube',
      (n) => (isCube(n) ? `${n} = ${Math.round(Math.cbrt(n))}³` : `${n} is not a perfect cube (${r}³ = ${r ** 3})`),
      `Four numbers are perfect cubes; ${odd} is not (${r}³ = ${r ** 3}).`,
      'Know cubes up to 15³ = 3375; the last digit of a cube identifies the last digit of its root (e.g. …3 ↔ 7, …7 ↔ 3).',
      `${odd} is only ${Math.abs(odd - r ** 3)} away from ${r ** 3} = ${r}³.`,
    );
  }
  if (fam === 'div') {
    const dv = rng.pick({ easy: [7, 8, 9], medium: [7, 11, 12], hard: [11, 13, 17], extreme: [13, 17, 19] }[d]);
    const [lo, hi] = { easy: [20, 99], medium: [30, 199], hard: [100, 499], extreme: [200, 999] }[d];
    const mults = range(lo, hi).filter((n) => n % dv === 0);
    const members = rng.sample(mults, 4);
    const base = rng.pick(mults);
    const odd = base + rng.pick([1, 2, 3, -1, -2, -3]);
    if (odd % dv === 0 || odd < lo) return null;
    return num(
      members,
      odd,
      `divisible-${dv}`,
      (n) => (n % dv === 0 ? `${n} = ${dv} × ${n / dv}` : `${n} = ${dv} × ${Math.floor(n / dv)} + ${n % dv}`),
      `Four numbers are multiples of ${dv}; ${odd} leaves remainder ${odd % dv}.`,
      `Divide each option by ${dv}; the one with a remainder is the odd one.`,
      `${odd} is close to the multiple ${base} = ${dv} × ${base / dv}, so it is easy to accept without dividing.`,
    );
  }
  if (fam === 'dsum') {
    const [lo, hi] = { easy: [100, 999], medium: [100, 999], hard: [100, 999], extreme: [1000, 9999] }[d];
    const s = d === 'extreme' ? rng.int(14, 24) : rng.int(8, 18);
    const pool = range(lo, hi).filter((n) => digitSum(n) === s);
    const members = rng.sample(pool, 4);
    const t = s + rng.pick([1, -1, 2, -2]);
    const oddPool = range(lo, hi).filter((n) => digitSum(n) === t);
    const odd = rng.pick(oddPool);
    return num(
      members,
      odd,
      'digit-sum',
      (n) => `${String(n).split('').join(' + ')} = ${digitSum(n)}`,
      `The digits of four numbers add up to ${s}; the digits of ${odd} add up to ${t}.`,
      'When the numbers share no obvious factor, add their digits.',
      'The numbers look unrelated at first; checking primes or squares wastes time here — add the digits.',
    );
  }
  // pairs
  const rel = rng.pick([
    { name: 'a² + 1', f: (a: number) => a * a + 1 },
    { name: 'a² − 1', f: (a: number) => a * a - 1 },
    { name: 'a² + 2', f: (a: number) => a * a + 2 },
    { name: 'a³ + 1', f: (a: number) => a ** 3 + 1 },
    { name: 'a³ − 1', f: (a: number) => a ** 3 - 1 },
    { name: 'a(a + 1)', f: (a: number) => a * (a + 1) },
  ]);
  const cube = rel.name.includes('³');
  const as = rng.sample(range(cube ? 2 : 3, cube ? 9 : 15), 5);
  const pairs = as.map((a) => [a, rel.f(a)] as [number, number]);
  const oddPair: [number, number] = [pairs[4][0], pairs[4][1] + rng.pick([1, -1, 2, -2])];
  const txt = ([a, b]: [number, number]) => `${a} : ${b}`;
  const members = pairs.slice(0, 4).map(txt);
  const say = (a: number) => rel.name.replace(/a/g, String(a));
  return {
    members,
    odd: txt(oddPair),
    family: 'number-pair',
    explain: (o) => {
      const [a, b] = o.split(' : ').map(Number);
      return `${o}: ${say(a)} = ${rel.f(a)}${rel.f(a) === b ? ' ✓' : ` ≠ ${b}`}`;
    },
    rule: `In four pairs the second number is ${rel.name.replace(/a/g, 'n')} where n is the first number; ${txt(oddPair)} does not fit (${say(oddPair[0])} = ${rel.f(oddPair[0])}).`,
    shortcut: 'Find the relation from the two simplest pairs (square, cube, ± 1), then test it on the rest.',
    trap: `${txt(oddPair)} misses the relation by only ${Math.abs(oddPair[1] - rel.f(oddPair[0]))}, so a rough check passes it.`,
    tags: ['classification:numbers', 'classification:number-pair'],
    kind: 'pairs',
    toFact: (opts) => ({ pairs: opts.map((o) => o.split(' : ').map(Number) as [number, number]) }),
  };
}

/* ------------------------------------------------------------------ */
/* Generator                                                           */
/* ------------------------------------------------------------------ */

function splitsFor(kind: ClassificationFacts['kind'], opts: string[]) {
  if (kind === 'letters') return letterSplits(opts);
  if (kind === 'numbers') return numberSplits(opts.map(Number));
  return pairSplits(opts.map((o) => o.split(' : ').map(Number) as [number, number]));
}

export const generator = defineGenerator<ClassificationFacts>(META, SUBTYPES, ({ meta, seed, difficulty, subtype, rng }) => {
  for (let attempt = 0; attempt < 400; attempt++) {
    const b = subtype.id === 'letter-groups' ? letterFamily(rng, difficulty) : numberFamily(rng, difficulty);
    if (!b) continue;
    if (new Set([...b.members, b.odd]).size !== 5) continue;
    if (b.kind === 'letters' && [...b.members, b.odd].some((g) => new Set(g).size !== g.length)) continue;
    const choices = shuffleChoices(rng, b.odd, b.members);
    const splits = splitsFor(b.kind, choices.options);
    // every rule family we know must point to the same option — the intended one
    if (!splits.length || splits.some((s) => s.odd !== choices.answerIndex)) continue;
    const steps = [...choices.options.map((o) => b.explain(o) + '.'), b.rule];
    const visual: VisualSpec = {
      type: 'grid',
      columns: ['Option', 'Check'],
      rows: choices.options.map((o, i) => [`(${'ABCDE'[i]}) ${o}`, b.explain(o) + (i === choices.answerIndex ? '  ← odd one' : '')]),
      caption: 'Each option checked against the common rule.',
    };
    const q = makeQuestion(meta, seed, {
      subtype: subtype.id,
      difficulty,
      prompt: PROMPT,
      options: choices.options,
      answerIndex: choices.answerIndex,
      solution: { steps, shortcut: b.shortcut, trap: b.trap, visual },
      tags: b.tags,
      targetSeconds: targetSeconds('short-reasoning', difficulty),
    });
    return { item: single(q), facts: { kind: b.kind, family: b.family, ...b.toFact(choices.options) } as ClassificationFacts };
  }
  throw new Error(`classification: could not build ${subtype.id}/${difficulty}`);
});
