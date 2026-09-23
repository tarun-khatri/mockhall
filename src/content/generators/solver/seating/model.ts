/**
 * Seating-arrangement model shared by the seating generator, its backtracking solver and the
 * human-path simulator (difficulty measurement + worked solutions).
 *
 * Index semantics (the independent verifier uses 2-D geometry instead):
 *  - row / uncertain: seat = column, 0 = west end … east end.
 *  - parallel: seat = row * width + column; row 0 = Row 1 (the northern row), row 1 = Row 2.
 *  - circle: seat = position clockwise from the top. square: 8 seats clockwise from the top-left corner,
 *    even seats are corners, odd seats are the middles of the sides.
 *  - A person's right is +1 (east) when facing north and −1 when facing south; on a ring it is −1
 *    (anticlockwise) when facing the centre and +1 (clockwise) when facing outside. Left is the opposite.
 *
 * Frame mode (rows, human-path simulation only): a person solving a row puzzle draws a chain of people before
 * knowing where it sits in the row. Seats are then virtual columns (width W, the first person placed at V0) and
 * the absolute column is v − V0 + off, where `off` stays unknown until an end/position clue needs it.
 *
 * Entities: persons 0..P−1, then attribute values P..P+A−1 (e.g. professions). Each kind is placed on
 * distinct seats; a person and an attribute value on the same seat means "that person has that value".
 */

export type LayoutKind = 'row' | 'parallel' | 'uncertain' | 'circle' | 'square';
export type Side = 'left' | 'right';

export const NORTH = 0;
export const SOUTH = 1;
export const IN = 2;
export const OUT = 3;
export type FaceCode = 0 | 1 | 2 | 3;

export type FacingRule =
  | { kind: 'all'; face: FaceCode }
  | { kind: 'rows'; row1: FaceCode; row2: FaceCode }
  | { kind: 'square'; corner: FaceCode; middle: FaceCode }
  | { kind: 'mixed' };

export interface Layout {
  kind: LayoutKind;
  /** Seats per row (row, parallel), ring size (circle; square = 8), or the largest N searched (uncertain). */
  len: number;
  facing: FacingRule;
}

/* ------------------------------------------------------------------ */
/* References and atoms                                                */
/* ------------------------------------------------------------------ */

/** Something that points at a seat: a named entity, or "the one who sits …". */
export type Ref =
  | { t: 'e'; e: number }
  /** the one who sits k-th to the side of `of` (k = 1: immediate) */
  | { t: 'rel'; side: Side; k: number; of: Ref }
  /** ring: the one who sits exactly opposite `of`; parallel (rows facing each other): the one who faces `of` */
  | { t: 'opp'; of: Ref };

export type Atom =
  /** a sits k-th to the side of b (b's own left/right) */
  | { t: 'rel'; a: Ref; side: Side; k: number; b: Ref }
  /** exactly n persons sit between a and b (rings: on one of the two arcs; rows: same row) */
  | { t: 'gap'; a: Ref; b: Ref; n: number }
  /** immediate neighbours (neg: not) */
  | { t: 'adj'; a: Ref; b: Ref; neg: boolean }
  | { t: 'face'; a: Ref; f: FaceCode }
  | { t: 'sameFace'; a: Ref; b: Ref; same: boolean }
  /** at one of the extreme ends of its row (neg: not at either end) */
  | { t: 'end'; a: Ref; neg: boolean }
  /** k-th from the side end of the row, from the row's own facing (k = 1: at the extreme end) */
  | { t: 'endSide'; a: Ref; side: Side; k: number }
  | { t: 'middle'; a: Ref }
  /** ring: exactly opposite; parallel (facing each other): a faces b */
  | { t: 'opp'; a: Ref; b: Ref }
  /** parallel, same direction: a sits directly behind b */
  | { t: 'behind'; a: Ref; b: Ref }
  /** parallel: a and b sit at opposite extreme ends of different rows */
  | { t: 'diag'; a: Ref; b: Ref }
  /** square: at a corner (true) / at the middle of a side (false) */
  | { t: 'corner'; a: Ref; corner: boolean }
  /** parallel: sits in row r (0 = Row 1) */
  | { t: 'row'; a: Ref; row: number }
  | { t: 'sameRow'; a: Ref; b: Ref; same: boolean }
  /** as many persons between a and b as between b and c */
  | { t: 'asMany'; a: Ref; b: Ref; c: Ref }
  /** exactly n persons sit to the side of a (a's own facing) */
  | { t: 'sideCount'; a: Ref; side: Side; n: number }
  /** as many persons sit to the left of a as to the right of b */
  | { t: 'sideEq'; a: Ref; b: Ref }
  /** person a has attribute value v (an entity index); neg: does not */
  | { t: 'is'; a: Ref; v: number; neg: boolean };

export type Clue = Atom[];

export const FALSE = 0;
export const TRUE = 1;
export const UNK = 2;
export type Tri = 0 | 1 | 2;

/** Ref results: a seat index ≥ 0, NONE (no such seat) or UNKNOWN (needs more information). */
export const NONE = -1;
export const UNKNOWN = -2;

export const NEED_SEAT = 0;
export const NEED_FACE = 1;
export const NEED_N = 2;
export const NEED_OFF = 3;

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

export function isRing(l: Layout): boolean {
  return l.kind === 'circle' || l.kind === 'square';
}

export function seatCount(l: Layout, n: number): number {
  return l.kind === 'parallel' ? 2 * l.len : l.kind === 'uncertain' ? n : l.len;
}

export function mixedFaces(l: Layout): readonly FaceCode[] {
  return isRing(l) ? [IN, OUT] : [NORTH, SOUTH];
}

/** Facing fixed by the layout rule (by row for parallel rows), or −1 when it varies per person. */
export function fixedFaceOf(l: Layout, row: number, seat: number): number {
  const f = l.facing;
  switch (f.kind) {
    case 'all':
      return f.face;
    case 'rows':
      return row === 0 ? f.row1 : f.row2;
    case 'square':
      return seat % 2 === 0 ? f.corner : f.middle;
    case 'mixed':
      return -1;
  }
}

export function fixedFace(l: Layout, seat: number): number {
  return fixedFaceOf(l, l.kind === 'parallel' ? Math.floor(seat / l.len) : 0, seat);
}

/** +1 / −1 step (in seat-index space) for the given side of a person with this facing. */
export function sideSign(face: number, side: Side): number {
  const right = face === NORTH || face === OUT ? 1 : -1;
  return side === 'right' ? right : -right;
}

export function refEntities(r: Ref, out: Set<number>): void {
  if (r.t === 'e') out.add(r.e);
  else refEntities(r.of, out);
}

export function atomRefs(a: Atom): Ref[] {
  switch (a.t) {
    case 'face':
    case 'end':
    case 'endSide':
    case 'middle':
    case 'corner':
    case 'row':
    case 'sideCount':
      return [a.a];
    case 'asMany':
      return [a.a, a.b, a.c];
    case 'is':
      return [a.a, { t: 'e', e: a.v }];
    default:
      return [a.a, a.b];
  }
}

export function clueEntities(c: Clue): number[] {
  const s = new Set<number>();
  for (const a of c) for (const r of atomRefs(a)) refEntities(r, s);
  return [...s].sort((x, y) => x - y);
}

/** True when the ref is a plain entity (no "the one who …"). */
export function isPlain(r: Ref): r is { t: 'e'; e: number } {
  return r.t === 'e';
}

/* ------------------------------------------------------------------ */
/* State and 3-valued evaluation                                       */
/* ------------------------------------------------------------------ */

export interface State {
  /** entity → seat, −1 = not placed */
  seatOf: Int16Array;
  /** seat → facing code, −1 = unknown */
  face: Int8Array;
  /** uncertain rows: number of seats N, −1 = unknown. Other layouts: the seat count. */
  n: number;
  /** frame mode: absolute column of virtual column V0, −1 = unknown */
  off?: number;
  /** frame mode: seat → person sitting there (−1 = nobody placed yet) */
  occ?: Int16Array;
}

export interface Frame {
  /** virtual columns per row */
  W: number;
  /** virtual column of the first person placed */
  V0: number;
}

export function frameFor(l: Layout): Frame | null {
  if (l.kind === 'row' || l.kind === 'parallel' || l.kind === 'uncertain') return { W: 2 * l.len - 1, V0: l.len - 1 };
  return null;
}

/**
 * Evaluates atoms and clues on a (possibly partial) state. When the answer depends on something unknown it
 * returns UNK and records the first missing variable in needKind/needId.
 */
export class Evaluator {
  needKind = NEED_SEAT;
  needId = -1;
  readonly W: number;
  readonly V0: number;
  readonly framed: boolean;
  constructor(
    readonly layout: Layout,
    public st: State,
    frame: Frame | null = null,
  ) {
    this.framed = !!frame;
    this.W = frame ? frame.W : layout.len;
    this.V0 = frame ? frame.V0 : 0;
  }

  rowOf(s: number): number {
    return this.layout.kind === 'parallel' ? Math.floor(s / this.W) : 0;
  }

  vcol(s: number): number {
    return this.layout.kind === 'parallel' ? s % this.W : s;
  }

  private needOff(): void {
    this.needKind = NEED_OFF;
    this.needId = 0;
  }

  private needN(): number {
    if (this.st.n >= 0) return this.st.n;
    this.needKind = NEED_N;
    this.needId = 0;
    return -1;
  }

  /** Absolute column (0 = west end), or −1 (need recorded) when the frame offset is unknown. */
  acol(s: number): number {
    const v = this.vcol(s);
    if (!this.framed) return v;
    const off = this.st.off ?? -1;
    if (off < 0) {
      this.needOff();
      return -1;
    }
    return v - this.V0 + off;
  }

  /** Min and max virtual columns over placed entities (frame mode). */
  span(): [number, number] {
    let lo = Infinity;
    let hi = -Infinity;
    const so = this.st.seatOf;
    for (let e = 0; e < so.length; e++) {
      const s = so[e];
      if (s < 0) continue;
      const v = this.vcol(s);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return [lo, hi];
  }

  /**
   * Seat k steps from s. `strict`: the seat must certainly exist (it is used as a person's seat). Non-strict
   * targets are only compared with an entity's seat, whose own placement keeps it inside the row.
   */
  walk(s: number, sign: number, k: number, strict = true): number {
    const L = this.layout;
    if (L.kind === 'circle' || L.kind === 'square') {
      const n = L.len;
      return (((s + sign * k) % n) + n) % n;
    }
    const v = this.vcol(s) + sign * k;
    if (v < 0 || v >= this.W) return NONE;
    const t = L.kind === 'parallel' ? this.rowOf(s) * this.W + v : v;
    if (!this.framed) {
      const lim = L.kind === 'uncertain' ? (this.st.n >= 0 ? this.st.n : L.len) : L.len;
      return v < lim ? t : NONE;
    }
    if (this.st.occ && this.st.occ[t] >= 0) return t;
    const off = this.st.off ?? -1;
    if (off >= 0) {
      const a = v - this.V0 + off;
      if (a < 0) return NONE;
      if (L.kind !== 'uncertain') return a < L.len ? t : NONE;
      if (this.st.n >= 0) return a < this.st.n ? t : NONE;
      if (a >= L.len) return NONE;
      const [, hi] = this.span();
      if (v <= hi || !strict) return t;
      this.needKind = NEED_N;
      this.needId = 0;
      return UNKNOWN;
    }
    const [lo, hi] = this.span();
    if (v >= lo && v <= hi) return t;
    const ext = Math.max(hi, v) - Math.min(lo, v);
    if (ext > L.len - 1) return NONE;
    if (!strict) return t;
    this.needOff();
    return UNKNOWN;
  }

  faceAt(s: number): number {
    const f = this.st.face[s];
    if (f >= 0) return f;
    this.needKind = NEED_FACE;
    this.needId = s;
    return -1;
  }

  ref(r: Ref): number {
    switch (r.t) {
      case 'e': {
        const s = this.st.seatOf[r.e];
        if (s < 0) {
          this.needKind = NEED_SEAT;
          this.needId = r.e;
          return UNKNOWN;
        }
        return s;
      }
      case 'rel': {
        const s = this.ref(r.of);
        if (s < 0) return s;
        const f = this.faceAt(s);
        if (f < 0) return UNKNOWN;
        return this.walk(s, sideSign(f, r.side), r.k, true);
      }
      case 'opp': {
        const s = this.ref(r.of);
        if (s < 0) return s;
        return this.opposite(s);
      }
    }
  }

  opposite(s: number): number {
    const L = this.layout;
    if (L.kind === 'circle' || L.kind === 'square') return L.len % 2 === 0 ? (s + L.len / 2) % L.len : NONE;
    if (L.kind === 'parallel') return this.rowOf(s) === 0 ? s + this.W : s - this.W;
    return NONE;
  }

  /** Persons (seats) on the given side of seat s for a person facing f (rows); −1 = need recorded. */
  private sideSeats(s: number, f: number, side: Side): number {
    const c = this.acol(s);
    if (c < 0) return -1;
    if (sideSign(f, side) < 0) return c;
    let n = this.layout.len;
    if (this.layout.kind === 'uncertain') {
      n = this.needN();
      if (n < 0) return -1;
    }
    return n - 1 - c;
  }

  atom(a: Atom): Tri {
    const L = this.layout;
    switch (a.t) {
      case 'rel': {
        const sb = this.ref(a.b);
        if (sb === UNKNOWN) return UNK;
        if (sb === NONE) return FALSE;
        const fb = this.faceAt(sb);
        if (fb < 0) return UNK;
        const target = this.walk(sb, sideSign(fb, a.side), a.k, false);
        if (target === NONE) return FALSE;
        if (target === UNKNOWN) return UNK;
        const sa = this.ref(a.a);
        if (sa === UNKNOWN) return UNK;
        if (sa === NONE) return FALSE;
        return sa === target ? TRUE : FALSE;
      }
      case 'gap':
      case 'adj': {
        const sa = this.ref(a.a);
        if (sa === UNKNOWN) return UNK;
        const sb = this.ref(a.b);
        if (sb === UNKNOWN) return UNK;
        if (sa === NONE || sb === NONE || sa === sb) return FALSE;
        const want = a.t === 'gap' ? a.n : 0;
        let ok: boolean;
        if (isRing(L)) {
          const d = (sa - sb + L.len) % L.len;
          ok = d === want + 1 || d === L.len - want - 1;
        } else {
          ok = this.rowOf(sa) === this.rowOf(sb) && Math.abs(this.vcol(sa) - this.vcol(sb)) === want + 1;
        }
        if (a.t === 'adj' && a.neg) ok = !ok;
        return ok ? TRUE : FALSE;
      }
      case 'face': {
        const sa = this.ref(a.a);
        if (sa === UNKNOWN) return UNK;
        if (sa === NONE) return FALSE;
        const f = this.faceAt(sa);
        if (f < 0) return UNK;
        return f === a.f ? TRUE : FALSE;
      }
      case 'sameFace': {
        const sa = this.ref(a.a);
        if (sa === UNKNOWN) return UNK;
        const sb = this.ref(a.b);
        if (sb === UNKNOWN) return UNK;
        if (sa === NONE || sb === NONE || sa === sb) return FALSE;
        const fa = this.faceAt(sa);
        if (fa < 0) return UNK;
        const fb = this.faceAt(sb);
        if (fb < 0) return UNK;
        return (fa === fb) === a.same ? TRUE : FALSE;
      }
      case 'end': {
        const sa = this.ref(a.a);
        if (sa === UNKNOWN) return UNK;
        if (sa === NONE) return FALSE;
        const c = this.acol(sa);
        if (c < 0) return UNK;
        let at: boolean;
        if (c === 0) at = true;
        else if (L.kind === 'uncertain') {
          const n = this.needN();
          if (n < 0) return UNK;
          at = c === n - 1;
        } else at = c === L.len - 1;
        return at !== a.neg ? TRUE : FALSE;
      }
      case 'endSide': {
        const sa = this.ref(a.a);
        if (sa === UNKNOWN) return UNK;
        if (sa === NONE) return FALSE;
        const f = this.faceAt(sa);
        if (f < 0) return UNK;
        // k-th from the side end ⇔ exactly k − 1 persons to that side
        const cnt = this.sideSeats(sa, f, a.side);
        if (cnt < 0) return UNK;
        return cnt === a.k - 1 ? TRUE : FALSE;
      }
      case 'middle': {
        const sa = this.ref(a.a);
        if (sa === UNKNOWN) return UNK;
        if (sa === NONE) return FALSE;
        const c = this.acol(sa);
        if (c < 0) return UNK;
        let n = L.len;
        if (L.kind === 'uncertain') {
          n = this.needN();
          if (n < 0) return UNK;
        }
        return n % 2 === 1 && 2 * c + 1 === n ? TRUE : FALSE;
      }
      case 'opp': {
        const sa = this.ref(a.a);
        if (sa === UNKNOWN) return UNK;
        const sb = this.ref(a.b);
        if (sb === UNKNOWN) return UNK;
        if (sa === NONE || sb === NONE) return FALSE;
        return this.opposite(sb) === sa ? TRUE : FALSE;
      }
      case 'behind': {
        const sa = this.ref(a.a);
        if (sa === UNKNOWN) return UNK;
        const sb = this.ref(a.b);
        if (sb === UNKNOWN) return UNK;
        if (sa === NONE || sb === NONE || this.vcol(sa) !== this.vcol(sb) || this.rowOf(sa) === this.rowOf(sb)) return FALSE;
        const fb = this.faceAt(sb);
        if (fb < 0) return UNK;
        // behind b = on the side opposite to b's facing: b faces north → a is in the southern row (row 1)
        const wantRow = fb === NORTH ? 1 : 0;
        return this.rowOf(sa) === wantRow ? TRUE : FALSE;
      }
      case 'diag': {
        const sa = this.ref(a.a);
        if (sa === UNKNOWN) return UNK;
        const sb = this.ref(a.b);
        if (sb === UNKNOWN) return UNK;
        if (sa === NONE || sb === NONE || this.rowOf(sa) === this.rowOf(sb)) return FALSE;
        if (this.vcol(sa) === this.vcol(sb)) return FALSE;
        const ca = this.acol(sa);
        if (ca < 0) return UNK;
        const cb = this.acol(sb);
        if (cb < 0) return UNK;
        return (ca === 0 || ca === L.len - 1) && ca + cb === L.len - 1 ? TRUE : FALSE;
      }
      case 'corner': {
        const sa = this.ref(a.a);
        if (sa === UNKNOWN) return UNK;
        if (sa === NONE) return FALSE;
        return (sa % 2 === 0) === a.corner ? TRUE : FALSE;
      }
      case 'row': {
        const sa = this.ref(a.a);
        if (sa === UNKNOWN) return UNK;
        if (sa === NONE) return FALSE;
        return this.rowOf(sa) === a.row ? TRUE : FALSE;
      }
      case 'sameRow': {
        const sa = this.ref(a.a);
        if (sa === UNKNOWN) return UNK;
        const sb = this.ref(a.b);
        if (sb === UNKNOWN) return UNK;
        if (sa === NONE || sb === NONE || sa === sb) return FALSE;
        return (this.rowOf(sa) === this.rowOf(sb)) === a.same ? TRUE : FALSE;
      }
      case 'asMany': {
        const sa = this.ref(a.a);
        if (sa === UNKNOWN) return UNK;
        const sb = this.ref(a.b);
        if (sb === UNKNOWN) return UNK;
        const sc = this.ref(a.c);
        if (sc === UNKNOWN) return UNK;
        if (sa === NONE || sb === NONE || sc === NONE || sa === sb || sb === sc || sa === sc) return FALSE;
        if (this.rowOf(sa) !== this.rowOf(sb) || this.rowOf(sb) !== this.rowOf(sc)) return FALSE;
        return Math.abs(this.vcol(sa) - this.vcol(sb)) === Math.abs(this.vcol(sb) - this.vcol(sc)) ? TRUE : FALSE;
      }
      case 'sideCount': {
        const sa = this.ref(a.a);
        if (sa === UNKNOWN) return UNK;
        if (sa === NONE) return FALSE;
        const f = this.faceAt(sa);
        if (f < 0) return UNK;
        const cnt = this.sideSeats(sa, f, a.side);
        if (cnt < 0) return UNK;
        return cnt === a.n ? TRUE : FALSE;
      }
      case 'sideEq': {
        const sa = this.ref(a.a);
        if (sa === UNKNOWN) return UNK;
        const sb = this.ref(a.b);
        if (sb === UNKNOWN) return UNK;
        if (sa === NONE || sb === NONE) return FALSE;
        const fa = this.faceAt(sa);
        if (fa < 0) return UNK;
        const fb = this.faceAt(sb);
        if (fb < 0) return UNK;
        const l = this.sideSeats(sa, fa, 'left');
        if (l < 0) return UNK;
        const r = this.sideSeats(sb, fb, 'right');
        if (r < 0) return UNK;
        return l === r ? TRUE : FALSE;
      }
      case 'is': {
        const sa = this.ref(a.a);
        if (sa === UNKNOWN) return UNK;
        const sv = this.st.seatOf[a.v];
        if (sv < 0) {
          this.needKind = NEED_SEAT;
          this.needId = a.v;
          return UNK;
        }
        if (sa === NONE) return FALSE;
        return (sa === sv) !== a.neg ? TRUE : FALSE;
      }
    }
  }

  /** Conjunction of atoms: FALSE if any is false, else UNK (need = first unknown atom's need), else TRUE. */
  clue(c: Clue): Tri {
    let unknown = false;
    let nk = 0;
    let ni = -1;
    for (const a of c) {
      const r = this.atom(a);
      if (r === FALSE) return FALSE;
      if (r === UNK && !unknown) {
        unknown = true;
        nk = this.needKind;
        ni = this.needId;
      }
    }
    if (unknown) {
      this.needKind = nk;
      this.needId = ni;
      return UNK;
    }
    return TRUE;
  }
}

/** Fresh empty (absolute) state for a layout, fixed facings pre-filled. */
export function emptyState(layout: Layout, entities: number, n: number): State {
  const S = seatCount(layout, layout.kind === 'uncertain' ? layout.len : n);
  const face = new Int8Array(S).fill(-1);
  for (let s = 0; s < S; s++) face[s] = fixedFace(layout, s);
  return { seatOf: new Int16Array(entities).fill(-1), face, n: layout.kind === 'uncertain' ? n : S };
}

/** Right-direction offset of seat `to` from seat `from` for a person facing `face` (rings: 1..n−1; rows: signed). */
export function offsetFrom(layout: Layout, from: number, face: number, to: number): number {
  const sign = sideSign(face, 'right');
  if (isRing(layout)) return ((((to - from) * sign) % layout.len) + layout.len) % layout.len;
  const len = layout.len;
  const cf = layout.kind === 'parallel' ? from % len : from;
  const ct = layout.kind === 'parallel' ? to % len : to;
  return (ct - cf) * sign;
}
