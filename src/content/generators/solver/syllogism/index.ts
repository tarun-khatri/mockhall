/**
 * Syllogism engine (SPEC 7.6): region enumeration.
 *
 * For n sets there are 2^n − 1 Venn regions (non-empty subsets of the sets). A "world" says which regions are
 * inhabited; we enumerate every subset of regions (n = 4 → 2^15 = 32,768 worlds) and keep those where every set
 * is non-empty (exam convention: each term exists) and every statement holds.
 *
 *  - definite conclusion  ⇔ true in every consistent world
 *  - possibility          ⇔ true in at least one consistent world (and NOT already definite — conventions
 *                           disagree on "possibility of a certainty", so generators never ask it: follows() → null)
 *  - "Only a few A are B" ⇔ some A are B AND some A are not B
 *
 * World bit (r − 1) is set when region r is inhabited; region r is the bitmask of the sets it lies in.
 */

export type Quant = 'all' | 'some' | 'no' | 'some-not' | 'only-a-few';

export interface Prop {
  q: Quant;
  /** Set indices. */
  a: number;
  b: number;
}

export interface Concl extends Prop {
  possibility?: boolean;
}

export const MAX_SETS = 4;

interface Masks {
  /** in[s] = world-bits of regions containing set s. */
  inSet: number[];
  regionCount: number;
}

const MASKS: Masks[] = [];
function masks(n: number): Masks {
  if (MASKS[n]) return MASKS[n];
  const regionCount = (1 << n) - 1;
  const inSet: number[] = [];
  for (let s = 0; s < n; s++) {
    let m = 0;
    for (let r = 1; r <= regionCount; r++) if (r & (1 << s)) m |= 1 << (r - 1);
    inSet.push(m);
  }
  MASKS[n] = { inSet, regionCount };
  return MASKS[n];
}

export function holdsIn(n: number, world: number, p: Prop): boolean {
  const { inSet } = masks(n);
  const both = inSet[p.a] & inSet[p.b];
  const aOnly = inSet[p.a] & ~inSet[p.b];
  switch (p.q) {
    case 'all':
      return (world & aOnly) === 0;
    case 'no':
      return (world & both) === 0;
    case 'some':
      return (world & both) !== 0;
    case 'some-not':
      return (world & aOnly) !== 0;
    case 'only-a-few':
      return (world & both) !== 0 && (world & aOnly) !== 0;
  }
}

export function samePropMeaning(x: Prop, y: Prop): boolean {
  if (x.q !== y.q) return false;
  if (x.a === y.a && x.b === y.b) return true;
  return (x.q === 'some' || x.q === 'no') && x.a === y.b && x.b === y.a;
}

/** The two classic complementary pairs: (Some A are B / No A is B) and (All A are B / Some A are not B). */
export function isComplementaryPair(c1: Concl, c2: Concl): boolean {
  if (c1.possibility || c2.possibility) return false;
  const pair = (x: Concl, y: Concl) => {
    if (x.q === 'some' && y.q === 'no') return (x.a === y.a && x.b === y.b) || (x.a === y.b && x.b === y.a);
    if (x.q === 'all' && y.q === 'some-not') return x.a === y.a && x.b === y.b;
    return false;
  };
  return pair(c1, c2) || pair(c2, c1);
}

export class SyllogismEngine {
  readonly n: number;
  /** Consistent worlds. */
  readonly worlds: number[];

  constructor(n: number, statements: readonly Prop[]) {
    if (n < 2 || n > MAX_SETS) throw new Error(`syllogism: unsupported set count ${n}`);
    this.n = n;
    const { inSet, regionCount } = masks(n);
    const total = 1 << regionCount;
    const worlds: number[] = [];
    outer: for (let w = 1; w < total; w++) {
      for (let s = 0; s < n; s++) if ((w & inSet[s]) === 0) continue outer;
      for (const p of statements) if (!holdsIn(n, w, p)) continue outer;
      worlds.push(w);
    }
    this.worlds = worlds;
  }

  get consistent(): boolean {
    return this.worlds.length > 0;
  }

  definite(p: Prop): boolean {
    return this.consistent && this.worlds.every((w) => holdsIn(this.n, w, p));
  }

  possible(p: Prop): boolean {
    return this.worlds.some((w) => holdsIn(this.n, w, p));
  }

  /** true / false, or null when the question would be ambiguous (possibility of something already definite). */
  follows(c: Concl): boolean | null {
    if (!this.consistent) return null;
    if (c.possibility) {
      if (this.definite(c)) return null;
      return this.possible(c);
    }
    return this.definite(c);
  }

  /**
   * 0 only I, 1 only II, 2 either, 3 neither, 4 both; −1 = ambiguous (never generate).
   * Either–or only for a classic complementary pair on the same terms where neither follows alone.
   */
  pairVerdict(c1: Concl, c2: Concl): number {
    const f1 = this.follows(c1);
    const f2 = this.follows(c2);
    if (f1 === null || f2 === null) return -1;
    if (f1 && f2) return 4;
    if (f1) return 0;
    if (f2) return 1;
    if (c1.possibility || c2.possibility) return 3;
    const exhaustive = this.worlds.every((w) => holdsIn(this.n, w, c1) || holdsIn(this.n, w, c2));
    if (isComplementaryPair(c1, c2)) return exhaustive ? 2 : -1;
    return exhaustive ? -1 : 3;
  }

  /** Least-overlap world satisfying the extra predicate (for diagrams). */
  bestWorld(pred: (w: number) => boolean = () => true): number | null {
    let best: number | null = null;
    let bestCost = Infinity;
    for (const w of this.worlds) {
      if (!pred(w)) continue;
      const c = worldCost(w, this.n);
      if (c < bestCost) {
        bestCost = c;
        best = w;
      }
    }
    return best;
  }
}

function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

/** Overlap penalty: shared regions are expensive (superlinear in the number of sets), lone regions are cheap. */
export function worldCost(world: number, n: number): number {
  let cost = 0;
  const regionCount = (1 << n) - 1;
  for (let r = 1; r <= regionCount; r++) {
    if (!(world & (1 << (r - 1)))) continue;
    const k = popcount(r);
    cost += k === 1 ? -1 : 10 * (k - 1) * (k - 1);
  }
  return cost;
}

/** Inhabited regions of a world as lists of set indices. */
export function worldRegions(world: number, n: number): number[][] {
  const out: number[][] = [];
  const regionCount = (1 << n) - 1;
  for (let r = 1; r <= regionCount; r++) {
    if (!(world & (1 << (r - 1)))) continue;
    const sets: number[] = [];
    for (let s = 0; s < n; s++) if (r & (1 << s)) sets.push(s);
    out.push(sets);
  }
  return out;
}
