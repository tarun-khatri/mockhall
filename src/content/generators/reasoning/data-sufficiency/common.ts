/**
 * Data sufficiency engine (R12). A scenario supplies true atomic clues and an exhaustive `answers(clues)`
 * enumeration: the set of answers over every world consistent with the stem and the given clues. A clue set is
 * sufficient iff that set has exactly one element (it always contains the true answer).
 *
 * The generator picks the answer category first (uniform over A–E), then searches pairs of statements
 * (each a conjunction of true atomic clues) whose sufficiency pattern produces that category.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty, Rich, VisualSpec } from '../../../types';

export const DS_OPTIONS = [
  'The data in statement I alone are sufficient to answer the question, while the data in statement II alone are not sufficient',
  'The data in statement II alone are sufficient to answer the question, while the data in statement I alone are not sufficient',
  'The data either in statement I alone or in statement II alone are sufficient to answer the question',
  'The data in both the statements I and II together are necessary to answer the question',
  'The data in both the statements I and II together are not sufficient to answer the question',
] as const;

export const DS_SHORT = ['I alone is sufficient', 'II alone is sufficient', 'either I or II alone is sufficient', 'both I and II together are needed', 'even I and II together are not sufficient'];

export type Category = 0 | 1 | 2 | 3 | 4;

export function categoryOf(suffI: boolean, suffII: boolean, suffBoth: boolean): Category {
  if (suffI && suffII) return 2;
  if (suffI) return 0;
  if (suffII) return 1;
  return suffBoth ? 3 : 4;
}

export interface Scenario<C> {
  /** True atomic clues about the hidden world. */
  atoms: C[];
  /** Answers over every world consistent with the stem and all `clues` (exhaustive enumeration). */
  answers(clues: readonly C[]): Set<string>;
  /** Reject answer sets containing sentinel answers whose treatment depends on a convention (e.g. coinciding points). */
  ok?(ans: Set<string>): boolean;
  key(c: C): string;
  /** Optional filter for a candidate statement (e.g. must mention a question person). */
  accept?(stmt: readonly C[]): boolean;
}

export interface PairResult<C> {
  I: C[];
  II: C[];
  ansI: Set<string>;
  ansII: Set<string>;
  ansBoth: Set<string>;
  base: Set<string>;
}

export function findPair<C>(rng: Rng, sc: Scenario<C>, target: Category, sizes: readonly [number, number], nCand = 40): PairResult<C> | null {
  const base = sc.answers([]);
  if (base.size < 2) return null;
  const ok = (a: Set<string>) => a.size >= 1 && (!sc.ok || sc.ok(a));
  const cands: { cl: C[]; keys: Set<string>; ans: Set<string> }[] = [];
  const seen = new Set<string>();
  for (let t = 0; t < nCand * 5 && cands.length < nCand; t++) {
    const size = rng.int(sizes[0], Math.min(sizes[1], sc.atoms.length));
    const cl = rng.sample(sc.atoms, size);
    const keys = cl.map((c) => sc.key(c));
    const k = [...keys].sort().join('|');
    if (seen.has(k)) continue;
    seen.add(k);
    if (sc.accept && !sc.accept(cl)) continue;
    // no clue may be implied by the others inside one statement (keeps statements tight)
    const ans = sc.answers(cl);
    if (!ok(ans)) continue;
    if (ans.size > 1 && ans.size >= base.size) continue; // statement says nothing about the question
    cands.push({ cl, keys: new Set(keys), ans });
  }
  const pairs: [number, number][] = [];
  for (let i = 0; i < cands.length; i++) for (let j = 0; j < cands.length; j++) if (i !== j) pairs.push([i, j]);
  for (const [i, j] of rng.shuffle(pairs)) {
    const A = cands[i];
    const B = cands[j];
    const sI = A.ans.size === 1;
    const sII = B.ans.size === 1;
    if (target === 0 && !(sI && !sII)) continue;
    if (target === 1 && !(!sI && sII)) continue;
    if (target === 2 && !(sI && sII)) continue;
    if (target >= 3 && (sI || sII)) continue;
    if ([...A.keys].some((k) => B.keys.has(k))) continue;
    const both = sc.answers([...A.cl, ...B.cl]);
    if (!ok(both)) continue;
    const sB = both.size === 1;
    if (target === 3 && !sB) continue;
    if (target === 4) {
      if (sB) continue;
      // together they should still narrow things down, as in real questions
      if (both.size >= Math.min(A.ans.size, B.ans.size)) continue;
    }
    if (categoryOf(sI, sII, sB) !== target) continue;
    return { I: A.cl, II: B.cl, ansI: A.ans, ansII: B.ans, ansBoth: both, base };
  }
  return null;
}

/** Everything the chapter wrapper needs from one subtype build. */
export interface DsDraft<F> {
  facts: F;
  context: Rich;
  question: Rich;
  I: string;
  II: string;
  /** Human description of an answer set ("Q is the tallest", "M can be the father or the mother of N"). */
  say(ans: Set<string>): string;
  shortcut: Rich;
  visual?: VisualSpec;
  tags: string[];
  res: PairResult<unknown>;
}

export function sizesFor(d: Difficulty, easy: [number, number], medium: [number, number], hard: [number, number], extreme: [number, number]): [number, number] {
  return d === 'easy' ? easy : d === 'medium' ? medium : d === 'hard' ? hard : extreme;
}

/** "P, Q and R" */
export function listAnd(xs: readonly string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** "P, Q or R" */
export function listOr(xs: readonly string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`;
}

export const NUM_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const CAP_NUM_WORD = NUM_WORD.map((w) => w[0].toUpperCase() + w.slice(1));

export function perms(n: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const used = new Array<boolean>(n).fill(false);
  const rec = () => {
    if (cur.length === n) {
      out.push(cur.slice());
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true;
      cur.push(i);
      rec();
      cur.pop();
      used[i] = false;
    }
  };
  rec();
  return out;
}
