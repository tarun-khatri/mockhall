/**
 * Build backward: from a hidden arrangement, list every true clue worth asking, in real exam styles.
 * Each candidate carries a rendering form and a family (used for difficulty-dependent selection weights).
 */
import type { Rng } from '../../../../lib/rng';
import {
  Evaluator,
  TRUE,
  isRing,
  offsetFrom,
  sideSign,
  type Atom,
  type Clue,
  type FaceCode,
  type Layout,
  type Ref,
  type Side,
  type State,
} from '../../solver/seating/model';
import type { Solution } from '../../solver/seating/solve';
import type { Family } from './config';

export type Form =
  | 'rel'
  | 'relCount'
  | 'gap'
  | 'adj'
  | 'adj2'
  | 'nadj'
  | 'nnadj'
  | 'face'
  | 'nface'
  | 'relFace'
  | 'sameFace'
  | 'nbrFace'
  | 'nbrOpp'
  | 'refFace'
  | 'end'
  | 'nend'
  | 'nnend'
  | 'endSide'
  | 'middle'
  | 'opp'
  | 'oppCorner'
  | 'oppMiddle'
  | 'behind'
  | 'front'
  | 'diag'
  | 'corner'
  | 'side'
  | 'ncorner'
  | 'row'
  | 'sameRow'
  | 'asMany'
  | 'sideCount'
  | 'sideEq'
  | 'is'
  | 'nis';

export interface ClueItem {
  form: Form;
  atoms: Clue;
}

export interface Cand extends ClueItem {
  family: Family;
  key: string;
}

export interface PoolCtx {
  layout: Layout;
  persons: number;
  attrs: number;
  truth: Solution;
  rng: Rng;
  /** parallel rows: is row membership stated in the intro? */
  membership: boolean;
}

export const E = (e: number): Ref => ({ t: 'e', e });

export function stateOf(sol: Solution): State {
  return { seatOf: Int16Array.from(sol.seatOf), face: Int8Array.from(sol.face), n: sol.n };
}

/** Geometry helpers on a complete arrangement (index semantics). */
export class Truth {
  readonly ev: Evaluator;
  readonly occP: number[];
  constructor(
    readonly layout: Layout,
    readonly sol: Solution,
    readonly persons: number,
  ) {
    this.ev = new Evaluator(layout, stateOf(sol));
    const S = sol.face.length;
    this.occP = new Array<number>(S).fill(-1);
    for (let e = 0; e < persons; e++) this.occP[sol.seatOf[e]] = e;
  }
  seat(e: number): number {
    return this.sol.seatOf[e];
  }
  face(s: number): number {
    return this.sol.face[s];
  }
  get seats(): number {
    return this.sol.face.length;
  }
  row(s: number): number {
    return this.layout.kind === 'parallel' ? Math.floor(s / this.layout.len) : 0;
  }
  col(s: number): number {
    return this.layout.kind === 'parallel' ? s % this.layout.len : s;
  }
  rowLen(): number {
    return this.layout.kind === 'uncertain' ? this.sol.n : this.layout.len;
  }
  /** seat k steps to the side of seat s (for its occupant's facing), or −1 */
  step(s: number, side: Side, k: number): number {
    return this.ev.walk(s, sideSign(this.face(s), side), k);
  }
  /** a relative to b: {side, k} using b's facing; null if not comparable (other row) or exactly opposite on a ring */
  relOf(sb: number, sa: number): { side: Side; k: number } | null {
    const L = this.layout;
    if (sa === sb) return null;
    if (isRing(L)) {
      const r = offsetFrom(L, sb, this.face(sb), sa);
      if (2 * r < L.len) return { side: 'right', k: r };
      if (2 * r > L.len) return { side: 'left', k: L.len - r };
      return null;
    }
    if (this.row(sa) !== this.row(sb)) return null;
    const d = offsetFrom(L, sb, this.face(sb), sa);
    return d > 0 ? { side: 'right', k: d } : { side: 'left', k: -d };
  }
  /** persons strictly between (smaller arc on rings; same row only), −1 if not applicable */
  gapOf(sa: number, sb: number): number {
    const L = this.layout;
    if (isRing(L)) {
      const d = Math.abs(sa - sb);
      const m = Math.min(d, L.len - d);
      return 2 * m === L.len ? -1 : m - 1;
    }
    if (this.row(sa) !== this.row(sb)) return -1;
    return Math.abs(this.col(sa) - this.col(sb)) - 1;
  }
  adjacent(sa: number, sb: number): boolean {
    return this.gapOf(sa, sb) === 0;
  }
  isTrue(c: Clue): boolean {
    return this.ev.clue(c) === TRUE;
  }
}

const key = (form: Form, atoms: Clue) => form + JSON.stringify(atoms);

export function buildPool(ctx: PoolCtx): Cand[] {
  const { layout: L, persons: P, attrs: A, rng } = ctx;
  const T = new Truth(L, ctx.truth, P);
  const out: Cand[] = [];
  const seen = new Set<string>();
  const add = (form: Form, atoms: Clue, family: Family) => {
    const k = key(form, atoms);
    if (seen.has(k)) return;
    if (!T.isTrue(atoms)) throw new Error(`seating pool: false clue ${k}`);
    seen.add(k);
    out.push({ form, atoms, family, key: k });
  };
  const ring = isRing(L);
  const rowsKind = !ring;
  const uncertain = L.kind === 'uncertain';
  const mixed = L.facing.kind === 'mixed';
  const maxK = uncertain ? 9 : ring ? (L.len <= 6 ? 2 : L.len <= 8 ? 3 : 4) : L.len <= 6 ? 3 : 4;
  const maxGap = uncertain ? 8 : ring ? L.len / 2 - 2 : 3;
  const persons = Array.from({ length: P }, (_, i) => i);
  const attrs = Array.from({ length: A }, (_, i) => P + i);
  const uniformRow = rowsKind && !mixed;

  // relative position: k-th to the left/right
  for (const b of persons)
    for (const a of persons) {
      if (a === b) continue;
      const r = T.relOf(T.seat(b), T.seat(a));
      if (!r || r.k > maxK) continue;
      add('rel', [{ t: 'rel', a: E(a), side: r.side, k: r.k, b: E(b) }], 'rel');
      if (r.k >= 2 && r.k - 1 <= Math.max(maxGap, 1)) add('relCount', [{ t: 'rel', a: E(a), side: r.side, k: r.k, b: E(b) }], 'relCount');
      if (mixed && r.k <= 3) add('relFace', [{ t: 'rel', a: E(a), side: r.side, k: r.k, b: E(b) }, { t: 'face', a: E(b), f: T.face(T.seat(b)) as FaceCode }], 'faceRel');
    }

  // two-way: gap / neighbours / not neighbours
  for (let i = 0; i < P; i++)
    for (let j = i + 1; j < P; j++) {
      const [a, b] = rng.chance(0.5) ? [i, j] : [j, i];
      const g = T.gapOf(T.seat(a), T.seat(b));
      if (g >= 1 && g <= maxGap) add('gap', [{ t: 'gap', a: E(a), b: E(b), n: g }], 'gap');
      if (g === 0) add(rng.chance(0.5) ? 'adj' : 'adj2', [{ t: 'adj', a: E(a), b: E(b), neg: false }], 'adj');
      else add('nadj', [{ t: 'adj', a: E(a), b: E(b), neg: true }], 'neg');
    }
  // neither A nor B is an immediate neighbour of C
  for (const c of persons) {
    const far = persons.filter((x) => x !== c && !T.adjacent(T.seat(x), T.seat(c)));
    for (let t = 0; t < 3 && far.length >= 2; t++) {
      const [a, b] = rng.sample(far, 2);
      add('nnadj', [{ t: 'adj', a: E(a), b: E(c), neg: true }, { t: 'adj', a: E(b), b: E(c), neg: true }], 'neg');
    }
  }

  // facing (mixed layouts)
  if (mixed) {
    for (const a of persons) {
      const f = T.face(T.seat(a)) as FaceCode;
      add('face', [{ t: 'face', a: E(a), f }], 'face');
      add('nface', [{ t: 'face', a: E(a), f }], 'face');
    }
    for (let i = 0; i < P; i++)
      for (let j = i + 1; j < P; j++) {
        if (!rng.chance(0.5)) continue;
        const same = T.face(T.seat(i)) === T.face(T.seat(j));
        add('sameFace', [{ t: 'sameFace', a: E(i), b: E(j), same }], 'faceRel');
      }
    for (const a of persons) {
      const s = T.seat(a);
      const r1 = T.step(s, 'right', 1);
      const l1 = T.step(s, 'left', 1);
      if (r1 >= 0 && l1 >= 0) {
        const fr = T.face(r1);
        const fl = T.face(l1);
        if (fr === fl)
          add('nbrFace', [{ t: 'face', a: { t: 'rel', side: 'right', k: 1, of: E(a) }, f: fr as FaceCode }, { t: 'face', a: { t: 'rel', side: 'left', k: 1, of: E(a) }, f: fl as FaceCode }], 'faceRel');
        else add('nbrOpp', [{ t: 'sameFace', a: { t: 'rel', side: 'right', k: 1, of: E(a) }, b: { t: 'rel', side: 'left', k: 1, of: E(a) }, same: false }], 'faceRel');
      }
      for (const side of ['left', 'right'] as Side[])
        for (const k of [1, 2]) {
          const t = T.step(s, side, k);
          if (t >= 0 && T.occP[t] >= 0) add('refFace', [{ t: 'face', a: { t: 'rel', side, k, of: E(a) }, f: T.face(t) as FaceCode }], 'faceRel');
        }
    }
  }

  // rows: ends, exact positions, middle
  if (rowsKind) {
    const endsOf = (a: number) => {
      const c = T.col(T.seat(a));
      return c === 0 || c === T.rowLen() - 1;
    };
    for (const a of persons) {
      if (endsOf(a)) add('end', [{ t: 'end', a: E(a), neg: false }], 'end');
      else add('nend', [{ t: 'end', a: E(a), neg: true }], 'neg');
    }
    const inner = persons.filter((a) => !endsOf(a));
    for (let t = 0; t < 4 && inner.length >= 2; t++) {
      const [a, b] = rng.sample(inner, 2);
      add('nnend', [{ t: 'end', a: E(a), neg: true }, { t: 'end', a: E(b), neg: true }], 'neg');
    }
    if (uniformRow) {
      for (const a of persons) {
        const s = T.seat(a);
        const f = T.face(s);
        const leftCount = sideSign(f, 'left') > 0 ? T.rowLen() - 1 - T.col(s) : T.col(s);
        const rightCount = T.rowLen() - 1 - leftCount;
        const lim = uncertain ? 6 : 3;
        if (leftCount < lim) add('endSide', [{ t: 'endSide', a: E(a), side: 'left', k: leftCount + 1 }], 'abs');
        if (rightCount < lim) add('endSide', [{ t: 'endSide', a: E(a), side: 'right', k: rightCount + 1 }], 'abs');
        if (uncertain) {
          if (leftCount >= 1) add('sideCount', [{ t: 'sideCount', a: E(a), side: 'left', n: leftCount }], 'abs');
          if (rightCount >= 1) add('sideCount', [{ t: 'sideCount', a: E(a), side: 'right', n: rightCount }], 'uncert');
        }
      }
      if (T.rowLen() % 2 === 1)
        for (const a of persons) if (2 * T.col(T.seat(a)) + 1 === T.rowLen()) add('middle', [{ t: 'middle', a: E(a) }], uncertain ? 'uncert' : 'abs');
      if (L.kind !== 'parallel') {
        // as many persons to the left of A as to the right of B (each from their own facing)
        const count = (e: number, side: Side) => {
          const s = T.seat(e);
          return sideSign(T.face(s), side) > 0 ? T.rowLen() - 1 - T.col(s) : T.col(s);
        };
        for (const a of persons)
          for (const b of persons) {
            if (a === b) continue;
            const la = count(a, 'left');
            if (la === count(b, 'right') && la >= 1) add('sideEq', [{ t: 'sideEq', a: E(a), b: E(b) }], uncertain ? 'uncert' : 'asMany');
          }
      }
    }
    // as many persons between A and B as between B and C
    for (const b of persons)
      for (const a of persons)
        for (const c of persons) {
          if (a === b || b === c || a >= c) continue;
          const [sa, sb, sc] = [T.seat(a), T.seat(b), T.seat(c)];
          if (T.row(sa) !== T.row(sb) || T.row(sb) !== T.row(sc)) continue;
          const d1 = T.col(sa) - T.col(sb);
          const d2 = T.col(sb) - T.col(sc);
          if (d1 === d2 && Math.abs(d1) >= 2) {
            const [x, z] = rng.chance(0.5) ? [a, c] : [c, a];
            add('asMany', [{ t: 'asMany', a: E(x), b: E(b), c: E(z) }], 'asMany');
          }
        }
  }

  // opposite / faces / behind / diagonal
  if (L.kind === 'circle' && L.len % 2 === 0) {
    for (const a of persons)
      for (const b of persons) if (a < b && (T.seat(a) - T.seat(b) + L.len) % L.len === L.len / 2) add('opp', [{ t: 'opp', a: E(a), b: E(b) }], 'opp');
  }
  if (L.kind === 'square') {
    for (const a of persons)
      for (const b of persons) {
        if (a === b || (T.seat(a) - T.seat(b) + 8) % 8 !== 4) continue;
        const corner = T.seat(a) % 2 === 0;
        add(corner ? 'oppCorner' : 'oppMiddle', [{ t: 'opp', a: E(a), b: E(b) }, { t: 'corner', a: E(a), corner }], 'opp');
      }
    for (const a of persons) {
      const corner = T.seat(a) % 2 === 0;
      add(corner ? 'corner' : 'side', [{ t: 'corner', a: E(a), corner }], 'abs');
      if (!corner) add('ncorner', [{ t: 'corner', a: E(a), corner: false }], 'abs');
    }
  }
  if (L.kind === 'parallel') {
    const facingEach = L.facing.kind === 'rows' && L.facing.row1 !== L.facing.row2;
    for (const a of persons)
      for (const b of persons) {
        if (a === b) continue;
        const [sa, sb] = [T.seat(a), T.seat(b)];
        if (T.col(sa) === T.col(sb) && T.row(sa) !== T.row(sb)) {
          if (facingEach) {
            if (a < b) add('opp', [{ t: 'opp', a: E(a), b: E(b) }], 'opp');
          } else {
            const at: Atom = { t: 'behind', a: E(a), b: E(b) };
            if (T.isTrue([at])) {
              add('behind', [at], 'opp');
              add('front', [{ t: 'behind', a: E(a), b: E(b) }], 'opp');
            }
          }
        }
        if (a < b && T.row(sa) !== T.row(sb)) {
          const ca = T.col(sa);
          if ((ca === 0 || ca === L.len - 1) && ca + T.col(sb) === L.len - 1) add('diag', [{ t: 'diag', a: E(a), b: E(b) }], 'opp');
        }
      }
    if (!ctx.membership) {
      for (const a of persons) add('row', [{ t: 'row', a: E(a), row: T.row(T.seat(a)) }], 'abs');
      for (let i = 0; i < P; i++)
        for (let j = i + 1; j < P; j++) {
          if (!rng.chance(0.4)) continue;
          add('sameRow', [{ t: 'sameRow', a: E(i), b: E(j), same: T.row(T.seat(i)) === T.row(T.seat(j)) }], 'rowRel');
        }
    }
  }

  // compound: relative to "the one who sits …"
  const refs: { ref: Ref; seat: number }[] = [];
  for (const b of persons) {
    const s = T.seat(b);
    for (const side of ['left', 'right'] as Side[])
      for (const k of [1, 2]) {
        const t = T.step(s, side, k);
        if (t >= 0 && T.occP[t] >= 0) refs.push({ ref: { t: 'rel', side, k, of: E(b) }, seat: t });
      }
    if ((L.kind === 'circle' && L.len % 2 === 0) || (L.kind === 'parallel' && L.facing.kind === 'rows' && L.facing.row1 !== L.facing.row2)) {
      const t = T.ev.opposite(s);
      if (t >= 0 && T.occP[t] >= 0) refs.push({ ref: { t: 'opp', of: E(b) }, seat: t });
    }
  }
  for (const { ref, seat } of rng.sample(refs, Math.min(refs.length, 40))) {
    const target = T.occP[seat];
    for (const a of rng.sample(persons, Math.min(P, 4))) {
      if (a === target) continue;
      // the ref must not simply name a person already in the sentence
      const anchorE = ref.t !== 'e' && ref.of.t === 'e' ? ref.of.e : -1;
      if (anchorE === a) continue;
      const r = T.relOf(seat, T.seat(a));
      if (!r || r.k > (ref.t === 'opp' ? 3 : 2)) continue;
      add('rel', [{ t: 'rel', a: E(a), side: r.side, k: r.k, b: ref }], 'compound');
    }
  }

  // second attribute
  if (A > 0) {
    for (const v of attrs) {
      const holder = T.occP[T.seat(v)];
      add('is', [{ t: 'is', a: E(holder), v, neg: false }], 'attr');
      for (const x of rng.sample(persons.filter((p) => p !== holder), Math.min(3, P - 1))) add('nis', [{ t: 'is', a: E(x), v, neg: true }], 'neg');
    }
    const ents = [...persons, ...attrs];
    for (const v of attrs) {
      for (const b of rng.sample(ents.filter((x) => x !== v), Math.min(8, ents.length - 1))) {
        const sb = T.seat(b);
        const sv = T.seat(v);
        if (sb === sv) continue;
        // attribute value as the subject, or as the reference
        const r1 = T.relOf(sb, sv);
        if (r1 && r1.k <= Math.min(maxK, 3)) add('rel', [{ t: 'rel', a: E(v), side: r1.side, k: r1.k, b: E(b) }], 'attr');
        const r2 = T.relOf(sv, sb);
        if (r2 && r2.k <= Math.min(maxK, 3)) add('rel', [{ t: 'rel', a: E(b), side: r2.side, k: r2.k, b: E(v) }], 'attr');
        const g = T.gapOf(sv, sb);
        if (g >= 1 && g <= maxGap) add('gap', [{ t: 'gap', a: E(v), b: E(b), n: g }], 'attr');
        if (g === 0) add('adj', [{ t: 'adj', a: E(v), b: E(b), neg: false }], 'attr');
        else if (b < P && rng.chance(0.3)) add('nadj', [{ t: 'adj', a: E(v), b: E(b), neg: true }], 'neg');
        if (ring && L.len % 2 === 0 && (sv - sb + L.len) % L.len === L.len / 2) {
          if (L.kind === 'circle') add('opp', [{ t: 'opp', a: E(v), b: E(b) }], 'attr');
          else add(sv % 2 === 0 ? 'oppCorner' : 'oppMiddle', [{ t: 'opp', a: E(v), b: E(b) }, { t: 'corner', a: E(v), corner: sv % 2 === 0 }], 'attr');
        }
        if (mixed && b < P) add('sameFace', [{ t: 'sameFace', a: E(v), b: E(b), same: T.face(sv) === T.face(sb) }], 'attr');
      }
      if (mixed) add('face', [{ t: 'face', a: E(v), f: T.face(T.seat(v)) as FaceCode }], 'attr');
      if (L.kind === 'square') add(T.seat(v) % 2 === 0 ? 'corner' : 'side', [{ t: 'corner', a: E(v), corner: T.seat(v) % 2 === 0 }], 'attr');
      if (rowsKind) {
        const c = T.col(T.seat(v));
        if (c === 0 || c === T.rowLen() - 1) add('end', [{ t: 'end', a: E(v), neg: false }], 'attr');
      }
      if (L.kind === 'parallel' && !ctx.membership) add('row', [{ t: 'row', a: E(v), row: T.row(T.seat(v)) }], 'attr');
    }
  }
  return out;
}
