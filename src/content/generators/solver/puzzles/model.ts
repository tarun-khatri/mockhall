/**
 * Puzzle model shared by the puzzle generator and its constraint solver (the independent verifier in
 * src/content/verify/reasoning/puzzles.ts re-implements every semantic below on its own).
 *
 * Slots are laid out in `rows` × `cols`; slot s sits in row ⌊s / cols⌋, column s mod cols. The sequence order is
 * the slot index (row-major): row 0 is the lowest floor / bottom box / Monday / January / earliest date /
 * shortest person, and a larger slot means "above" / "after" / "taller".
 *
 * Entities: category 0 = persons (or boxes), categories 1..K = attribute values (colours, cities …). Entity id
 * e = category × P + index. Each category is placed on distinct slots; a person and an attribute value on the same
 * slot means "that person has that value". Only the 12-month layout has vacant slots (8 persons in 12 months).
 *
 * Clue semantics are the WEAKEST natural reading (e.g. "Neither X nor Y …" does not force X ≠ Y). The generator
 * only emits clues whose strongest reading holds in the hidden arrangement, so a clue set that is unique under the
 * weak reading is unique under every reading a candidate might take.
 */

export type LayoutKind = 'floor' | 'flat' | 'box' | 'day' | 'week' | 'month' | 'month2' | 'session' | 'rank';

export interface Layout {
  kind: LayoutKind;
  rows: number;
  cols: number;
  /** Number of persons (occupied slots). Less than rows × cols only for 'month' (8 persons, 12 months). */
  persons: number;
  /** Calendar month (0 = January) of each row, for 'month' and 'month2'. */
  months?: number[];
}

/** Days in each calendar month (February is never tagged 30 or 31, so leap years cannot matter). */
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export type Pred =
  | { t: 'slot'; s: number }
  | { t: 'row'; r: number }
  | { t: 'col'; c: number }
  | { t: 'even' }
  | { t: 'odd' }
  /** row number (1-based) is prime: 2, 3, 5, 7, 11 */
  | { t: 'prime' }
  /** row index > r */
  | { t: 'gt'; r: number }
  /** row index < r */
  | { t: 'lt'; r: number }
  | { t: 'd31' }
  | { t: 'd30' };

export type Cmp = 'gt' | 'lt';

export type Clue =
  /** e satisfies the position predicate */
  | { k: 'is'; e: number; p: Pred }
  /** none of es (1 or 2 entities: "Neither X nor Y …") satisfies the predicate */
  | { k: 'not'; es: number[]; p: Pred }
  /** a and b belong to the same person */
  | { k: 'link'; a: number; b: number }
  | { k: 'nlink'; a: number; b: number }
  /** slot(a) − slot(b) = d */
  | { k: 'delta'; a: number; b: number; d: number }
  /** same column, row(a) − row(b) = d (floor-flat "immediately above") */
  | { k: 'vert'; a: number; b: number; d: number }
  /** row(a) − row(b) = d, any column */
  | { k: 'rdelta'; a: number; b: number; d: number }
  /** exactly n persons (occupied slots) strictly between a and b */
  | { k: 'gap'; a: number; b: number; n: number }
  /** exactly n rows strictly between the rows of a and b */
  | { k: 'rgap'; a: number; b: number; n: number }
  /** more than / less than n persons between a and b (a, b on different slots) */
  | { k: 'gapc'; a: number; b: number; op: Cmp; n: number }
  /** slot(a) > slot(b) */
  | { k: 'order'; a: number; b: number }
  /** row(a) > row(b) */
  | { k: 'rorder'; a: number; b: number }
  /** not immediate neighbours (flats: not directly above/below in the same flat type) */
  | { k: 'nadj'; a: number; b: number }
  /** slot(a) − slot(b) ≠ d ("a is not immediately above b") */
  | { k: 'ndelta'; a: number; b: number; d: number }
  /** as many persons between a and b as between b and c */
  | { k: 'eqgap'; a: number; b: number; c: number }
  | { k: 'srow'; a: number; b: number }
  | { k: 'drow'; a: number; b: number }
  | { k: 'scol'; a: number; b: number }
  | { k: 'dcol'; a: number; b: number }
  /** same row, a in the east column (1), b in the west column (0) */
  | { k: 'east'; a: number; b: number }
  /** exactly n persons above/after (dir 1) or below/before (dir −1) e */
  | { k: 'count'; e: number; dir: 1 | -1; n: number }
  | { k: 'countc'; e: number; dir: 1 | -1; op: Cmp; n: number }
  /** as many persons below/before a as above/after b */
  | { k: 'mirror'; a: number; b: number }
  /** the calendar month right after (dir 1) / before (dir −1) e's month is vacant (or does not exist) */
  | { k: 'empty'; e: number; dir: 1 | -1 }
  /** slot(b) < slot(a) < slot(c) */
  | { k: 'btw'; a: number; b: number; c: number }
  /** comparison puzzles: the value (height/weight) of e */
  | { k: 'val'; e: number; v: number }
  /** comparison puzzles: the value of whoever occupies slot s */
  | { k: 'rval'; s: number; v: number };

export type ClueKind = Clue['k'];

export function slotCount(L: Layout): number {
  return L.rows * L.cols;
}
export function rowOf(L: Layout, s: number): number {
  return Math.floor(s / L.cols);
}
export function colOf(L: Layout, s: number): number {
  return s % L.cols;
}

export function monthOfRow(L: Layout, r: number): number {
  return L.months ? L.months[r] : r;
}

/** Bit mask of the slots that satisfy a predicate. */
export function predMask(L: Layout, p: Pred): number {
  const S = slotCount(L);
  let m = 0;
  for (let s = 0; s < S; s++) {
    const r = rowOf(L, s);
    const c = colOf(L, s);
    let ok = false;
    switch (p.t) {
      case 'slot':
        ok = s === p.s;
        break;
      case 'row':
        ok = r === p.r;
        break;
      case 'col':
        ok = c === p.c;
        break;
      case 'even':
        ok = (r + 1) % 2 === 0;
        break;
      case 'odd':
        ok = (r + 1) % 2 === 1;
        break;
      case 'prime':
        ok = [2, 3, 5, 7, 11].includes(r + 1);
        break;
      case 'gt':
        ok = r > p.r;
        break;
      case 'lt':
        ok = r < p.r;
        break;
      case 'd31':
        ok = MONTH_DAYS[monthOfRow(L, r)] === 31;
        break;
      case 'd30':
        ok = MONTH_DAYS[monthOfRow(L, r)] === 30;
        break;
    }
    if (ok) m |= 1 << s;
  }
  return m;
}

/** Entities referenced by a clue (value clue on a slot references none). */
export function clueEntities(c: Clue): number[] {
  switch (c.k) {
    case 'is':
    case 'count':
    case 'countc':
    case 'empty':
    case 'val':
      return [c.e];
    case 'not':
      return c.es.slice();
    case 'eqgap':
    case 'btw':
      return [c.a, c.b, c.c];
    case 'rval':
      return [];
    default:
      return [c.a, c.b];
  }
}

/** Occupancy-aware counts on a complete world (slots per entity, persons first). */
export interface WorldView {
  L: Layout;
  /** slot of every entity */
  slot: number[];
  /** occupied[s] */
  occ: boolean[];
}

export function worldView(L: Layout, slot: number[]): WorldView {
  const occ = new Array<boolean>(slotCount(L)).fill(false);
  for (let p = 0; p < L.persons; p++) occ[slot[p]] = true;
  return { L, slot, occ };
}

export function personsBetween(w: WorldView, x: number, y: number): number {
  const lo = Math.min(x, y);
  const hi = Math.max(x, y);
  let n = 0;
  for (let s = lo + 1; s < hi; s++) if (w.occ[s]) n++;
  return n;
}
export function personsAbove(w: WorldView, x: number): number {
  let n = 0;
  for (let s = x + 1; s < w.occ.length; s++) if (w.occ[s]) n++;
  return n;
}
export function personsBelow(w: WorldView, x: number): number {
  let n = 0;
  for (let s = 0; s < x; s++) if (w.occ[s]) n++;
  return n;
}

function cmp(v: number, op: Cmp, n: number): boolean {
  return op === 'gt' ? v > n : v < n;
}

/** Exact clue semantics on a complete world (used by the generator for truth checks and statements). */
export function holds(w: WorldView, c: Clue): boolean {
  const { L } = w;
  const S = slotCount(L);
  const sl = (e: number) => w.slot[e];
  const row = (e: number) => rowOf(L, sl(e));
  const col = (e: number) => colOf(L, sl(e));
  switch (c.k) {
    case 'is':
      return ((predMask(L, c.p) >> sl(c.e)) & 1) === 1;
    case 'not':
      return c.es.every((e) => ((predMask(L, c.p) >> sl(e)) & 1) === 0);
    case 'link':
      return sl(c.a) === sl(c.b);
    case 'nlink':
      return sl(c.a) !== sl(c.b);
    case 'delta':
      return sl(c.a) - sl(c.b) === c.d;
    case 'vert':
      return col(c.a) === col(c.b) && row(c.a) - row(c.b) === c.d;
    case 'rdelta':
      return row(c.a) - row(c.b) === c.d;
    case 'gap':
      return sl(c.a) !== sl(c.b) && personsBetween(w, sl(c.a), sl(c.b)) === c.n;
    case 'rgap':
      return Math.abs(row(c.a) - row(c.b)) - 1 === c.n;
    case 'gapc':
      return sl(c.a) !== sl(c.b) && cmp(personsBetween(w, sl(c.a), sl(c.b)), c.op, c.n);
    case 'order':
      return sl(c.a) > sl(c.b);
    case 'rorder':
      return row(c.a) > row(c.b);
    case 'nadj':
      if (L.kind === 'flat') return !(col(c.a) === col(c.b) && Math.abs(row(c.a) - row(c.b)) === 1);
      return Math.abs(sl(c.a) - sl(c.b)) !== 1;
    case 'ndelta':
      return sl(c.a) - sl(c.b) !== c.d;
    case 'eqgap':
      return (
        sl(c.a) !== sl(c.b) &&
        sl(c.b) !== sl(c.c) &&
        personsBetween(w, sl(c.a), sl(c.b)) === personsBetween(w, sl(c.b), sl(c.c))
      );
    case 'srow':
      return row(c.a) === row(c.b);
    case 'drow':
      return row(c.a) !== row(c.b);
    case 'scol':
      return col(c.a) === col(c.b);
    case 'dcol':
      return col(c.a) !== col(c.b);
    case 'east':
      return row(c.a) === row(c.b) && col(c.a) === 1 && col(c.b) === 0;
    case 'count':
      return (c.dir === 1 ? personsAbove(w, sl(c.e)) : personsBelow(w, sl(c.e))) === c.n;
    case 'countc':
      return cmp(c.dir === 1 ? personsAbove(w, sl(c.e)) : personsBelow(w, sl(c.e)), c.op, c.n);
    case 'mirror':
      return personsBelow(w, sl(c.a)) === personsAbove(w, sl(c.b));
    case 'empty': {
      const t = sl(c.e) + c.dir;
      return t < 0 || t >= S || !w.occ[t];
    }
    case 'btw':
      return sl(c.b) < sl(c.a) && sl(c.a) < sl(c.c);
    case 'val':
    case 'rval':
      return true; // value clues are checked as a set (valuesConsistent)
  }
}

/** Known values (value clues) must strictly increase with the slot. */
export function valuesConsistent(w: WorldView, clues: readonly Clue[]): boolean {
  const known: [number, number][] = [];
  for (const c of clues) {
    if (c.k === 'val') known.push([w.slot[c.e], c.v]);
    else if (c.k === 'rval') known.push([c.s, c.v]);
  }
  for (let i = 0; i < known.length; i++) {
    for (let j = 0; j < known.length; j++) {
      const [si, vi] = known[i];
      const [sj, vj] = known[j];
      if (si === sj && vi !== vj) return false;
      if (si < sj && !(vi < vj)) return false;
    }
  }
  return true;
}

export function allHold(w: WorldView, clues: readonly Clue[]): boolean {
  return clues.every((c) => holds(w, c)) && valuesConsistent(w, clues);
}
