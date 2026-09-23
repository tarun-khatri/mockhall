/**
 * Constraint solver for floor / box / day / month / scheduling / comparison puzzles.
 *
 * Variables are entity → slot, domains are bit masks (≤ 12 slots). Two strengths:
 *  - full (default): arc consistency on every binary constraint, generalised AC on ternary ones, all-different
 *    with hidden singles. Used to count solutions (uniqueness) quickly.
 *  - fc ("human"): a binary/ternary constraint only fires once all but one of its entities are placed — the way a
 *    candidate uses a relative clue only after one end is fixed. Hidden singles ("floor 3 is the only floor left
 *    for R") are kept. The search tree of this mode measures difficulty (how many cases must be opened and
 *    killed) and its trace drives the worked solution.
 */
import { type Clue, type Layout, colOf, holds, predMask, rowOf, slotCount, worldView } from './model';

export interface SolverInput {
  layout: Layout;
  /** Number of categories including persons (1–3). */
  ncats: number;
  clues: readonly Clue[];
}

/** Causes other than a clue index. */
export const CAUSE_ALLDIFF = -1; // every other slot is taken by someone of the same kind
export const CAUSE_HIDDEN = -2; // the only one of its kind that can take this slot
export const CAUSE_OCC = -3; // month occupancy (vacant months)

interface Bin {
  a: number;
  b: number;
  ab: Uint16Array;
  ba: Uint16Array;
  clue: number;
}
interface Ter {
  v: [number, number, number];
  ok: (x: number, y: number, z: number) => boolean;
  clue: number;
}
interface Glob {
  vars: number[];
  clue: number;
}
interface Vac {
  e: number;
  dir: 1 | -1;
  clue: number;
}
/** Occupancy-count clue on a layout with vacant slots, propagated with occupied/possibly-occupied bounds. */
interface Bound {
  k: 'gap' | 'gapc' | 'count' | 'countc' | 'mirror' | 'eqgap';
  vars: number[];
  n: number;
  op: 'gt' | 'lt' | 'eq';
  dir: 1 | -1;
  clue: number;
}

interface Compiled {
  input: SolverInput;
  L: Layout;
  S: number;
  P: number;
  K: number;
  E: number;
  full: boolean;
  init: Uint16Array;
  initWhy: number[];
  initFail: number | null;
  bins: Bin[];
  ters: Ter[];
  globs: Glob[];
  vacs: Vac[];
  bounds: Bound[];
}

const bit = (s: number) => 1 << s;
export function popcount(m: number): number {
  let c = 0;
  while (m) {
    m &= m - 1;
    c++;
  }
  return c;
}
export function lowIndex(m: number): number {
  return 31 - Math.clz32(m & -m);
}
const single = (m: number) => m !== 0 && (m & (m - 1)) === 0;

function table(S: number, ok: (x: number, y: number) => boolean): [Uint16Array, Uint16Array] {
  const ab = new Uint16Array(S);
  const ba = new Uint16Array(S);
  for (let x = 0; x < S; x++)
    for (let y = 0; y < S; y++)
      if (ok(x, y)) {
        ab[x] |= bit(y);
        ba[y] |= bit(x);
      }
  return [ab, ba];
}

function compile(input: SolverInput): Compiled {
  const L = input.layout;
  const S = slotCount(L);
  const P = L.persons;
  const K = input.ncats;
  const E = K * P;
  const full = S === P;
  const vac = S - P;
  const all = (1 << S) - 1;
  const init = new Uint16Array(E).fill(all);
  const initWhy = new Array<number>(E).fill(0);
  let initFail: number | null = null;
  const bins: Bin[] = [];
  const ters: Ter[] = [];
  const globs: Glob[] = [];
  const vacs: Vac[] = [];
  const bounds: Bound[] = [];
  const row = (s: number) => rowOf(L, s);
  const col = (s: number) => colOf(L, s);

  const unary = (e: number, mask: number, clue: number) => {
    const n = init[e] & mask;
    if (n !== init[e]) initWhy[e] |= clue < 31 ? 1 << clue : 0;
    init[e] = n;
    if (!n && initFail === null) initFail = clue;
  };
  const binary = (a: number, b: number, ok: (x: number, y: number) => boolean, clue: number) => {
    const [ab, ba] = table(S, ok);
    bins.push({ a, b, ab, ba, clue });
  };
  const range = (lo: number, hi: number) => {
    let m = 0;
    for (let s = Math.max(0, lo); s <= Math.min(S - 1, hi); s++) m |= bit(s);
    return m;
  };

  const known: { e?: number; s?: number; v: number; clue: number }[] = [];

  input.clues.forEach((c, i) => {
    if (!full) {
      if (c.k === 'gap') bounds.push({ k: 'gap', vars: [c.a, c.b], n: c.n, op: 'eq', dir: 1, clue: i });
      if (c.k === 'gapc') bounds.push({ k: 'gapc', vars: [c.a, c.b], n: c.n, op: c.op, dir: 1, clue: i });
      if (c.k === 'count') bounds.push({ k: 'count', vars: [c.e], n: c.n, op: 'eq', dir: c.dir, clue: i });
      if (c.k === 'countc') bounds.push({ k: 'countc', vars: [c.e], n: c.n, op: c.op, dir: c.dir, clue: i });
      if (c.k === 'mirror') bounds.push({ k: 'mirror', vars: [c.a, c.b], n: 0, op: 'eq', dir: 1, clue: i });
      if (c.k === 'eqgap') bounds.push({ k: 'eqgap', vars: [c.a, c.b, c.c], n: 0, op: 'eq', dir: 1, clue: i });
    }
    switch (c.k) {
      case 'is':
        unary(c.e, predMask(L, c.p), i);
        break;
      case 'not': {
        const m = predMask(L, c.p);
        for (const e of c.es) unary(e, all & ~m, i);
        break;
      }
      case 'link':
        binary(c.a, c.b, (x, y) => x === y, i);
        break;
      case 'nlink':
        binary(c.a, c.b, (x, y) => x !== y, i);
        break;
      case 'delta':
        binary(c.a, c.b, (x, y) => x - y === c.d, i);
        break;
      case 'vert':
        binary(c.a, c.b, (x, y) => col(x) === col(y) && row(x) - row(y) === c.d, i);
        break;
      case 'rdelta':
        binary(c.a, c.b, (x, y) => row(x) - row(y) === c.d, i);
        break;
      case 'rgap':
        binary(c.a, c.b, (x, y) => Math.abs(row(x) - row(y)) - 1 === c.n, i);
        break;
      case 'gap':
        if (full) binary(c.a, c.b, (x, y) => x !== y && Math.abs(x - y) - 1 === c.n, i);
        else {
          binary(c.a, c.b, (x, y) => x !== y && Math.abs(x - y) - 1 >= c.n && Math.abs(x - y) - 1 <= c.n + vac, i);
          globs.push({ vars: [c.a, c.b], clue: i });
        }
        break;
      case 'gapc':
        if (full) binary(c.a, c.b, (x, y) => x !== y && (c.op === 'gt' ? Math.abs(x - y) - 1 > c.n : Math.abs(x - y) - 1 < c.n), i);
        else {
          binary(c.a, c.b, (x, y) => x !== y && (c.op === 'gt' ? Math.abs(x - y) - 1 >= c.n + 1 : Math.abs(x - y) - 1 <= c.n - 1 + vac), i);
          globs.push({ vars: [c.a, c.b], clue: i });
        }
        break;
      case 'order':
        binary(c.a, c.b, (x, y) => x > y, i);
        break;
      case 'rorder':
        binary(c.a, c.b, (x, y) => row(x) > row(y), i);
        break;
      case 'nadj':
        if (L.kind === 'flat') binary(c.a, c.b, (x, y) => !(col(x) === col(y) && Math.abs(row(x) - row(y)) === 1), i);
        else binary(c.a, c.b, (x, y) => Math.abs(x - y) !== 1, i);
        break;
      case 'ndelta':
        binary(c.a, c.b, (x, y) => x - y !== c.d, i);
        break;
      case 'srow':
        binary(c.a, c.b, (x, y) => row(x) === row(y), i);
        break;
      case 'drow':
        binary(c.a, c.b, (x, y) => row(x) !== row(y), i);
        break;
      case 'scol':
        binary(c.a, c.b, (x, y) => col(x) === col(y), i);
        break;
      case 'dcol':
        binary(c.a, c.b, (x, y) => col(x) !== col(y), i);
        break;
      case 'east':
        binary(c.a, c.b, (x, y) => row(x) === row(y) && col(x) === 1 && col(y) === 0, i);
        break;
      case 'eqgap':
        if (full) ters.push({ v: [c.a, c.b, c.c], ok: (x, y, z) => x !== y && y !== z && Math.abs(x - y) === Math.abs(y - z), clue: i });
        else {
          ters.push({ v: [c.a, c.b, c.c], ok: (x, y, z) => x !== y && y !== z, clue: i });
          globs.push({ vars: [c.a, c.b, c.c], clue: i });
        }
        break;
      case 'btw':
        ters.push({ v: [c.a, c.b, c.c], ok: (x, y, z) => y < x && x < z, clue: i });
        break;
      case 'count':
        if (full) unary(c.e, c.dir === 1 ? bit(S - 1 - c.n) : bit(c.n), i);
        else {
          unary(c.e, c.dir === 1 ? range(S - 1 - c.n - vac, S - 1 - c.n) : range(c.n, c.n + vac), i);
          globs.push({ vars: [c.e], clue: i });
        }
        break;
      case 'countc': {
        // persons above x (full): S−1−x ; below: x
        if (full) {
          let m = 0;
          for (let x = 0; x < S; x++) {
            const v = c.dir === 1 ? S - 1 - x : x;
            if (c.op === 'gt' ? v > c.n : v < c.n) m |= bit(x);
          }
          unary(c.e, m, i);
        } else {
          let m = 0;
          for (let x = 0; x < S; x++) {
            const slots = c.dir === 1 ? S - 1 - x : x; // slots on that side
            const ok = c.op === 'gt' ? slots >= c.n + 1 : slots - vac <= c.n - 1;
            if (ok) m |= bit(x);
          }
          unary(c.e, m, i);
          globs.push({ vars: [c.e], clue: i });
        }
        break;
      }
      case 'mirror':
        if (full) binary(c.a, c.b, (x, y) => x === S - 1 - y, i);
        else globs.push({ vars: [c.a, c.b], clue: i });
        break;
      case 'empty':
        vacs.push({ e: c.e, dir: c.dir, clue: i });
        globs.push({ vars: [c.e], clue: i });
        break;
      case 'val':
        known.push({ e: c.e, v: c.v, clue: i });
        break;
      case 'rval':
        known.push({ s: c.s, v: c.v, clue: i });
        break;
    }
  });

  // Value clues → order constraints between every pair of known values.
  for (let i = 0; i < known.length; i++) {
    for (let j = i + 1; j < known.length; j++) {
      const A = known[i];
      const B = known[j];
      const clue = Math.max(A.clue, B.clue);
      if (A.e !== undefined && B.e !== undefined) {
        const ea = A.e;
        const eb = B.e;
        if (A.v === B.v) binary(ea, eb, (x, y) => x === y, clue);
        else binary(ea, eb, (x, y) => (A.v > B.v ? x > y : x < y), clue);
      } else if (A.s !== undefined && B.s !== undefined) {
        const okPair = A.s === B.s ? A.v === B.v : A.s < B.s === A.v < B.v;
        if (!okPair && initFail === null) initFail = clue;
      } else {
        const e = (A.e ?? B.e)!;
        const ve = A.e !== undefined ? A.v : B.v;
        const s = (A.s ?? B.s)!;
        const vs = A.s !== undefined ? A.v : B.v;
        let m = 0;
        for (let x = 0; x < S; x++) if (ve > vs ? x > s : ve < vs ? x < s : x === s) m |= bit(x);
        unary(e, m, clue);
      }
    }
  }
  return { input, L, S, P, K, E, full, init, initWhy, initFail, bins, ters, globs, vacs, bounds };
}

/** Slots strictly between x and y. */
function betweenMask(x: number, y: number): number {
  const lo = Math.min(x, y);
  const hi = Math.max(x, y);
  let m = 0;
  for (let s = lo + 1; s < hi; s++) m |= bit(s);
  return m;
}
function sideMask(S: number, x: number, dir: 1 | -1): number {
  let m = 0;
  if (dir === 1) for (let s = x + 1; s < S; s++) m |= bit(s);
  else for (let s = 0; s < x; s++) m |= bit(s);
  return m;
}

/**
 * Vacant-slot layouts: with lb = definitely occupied and ub = possibly occupied slots in a region, a count clue
 * needs its count inside [lb, ub]. Candidate slots of each entity survive only if some choice of the other
 * entities keeps every such interval feasible (bounds consistency; in fc mode only once all but one entity is
 * placed). When every entity is placed and n = lb, the rest of the region must be vacant; when n = ub, every
 * possible slot in it must be occupied. Returns false on contradiction; fills `vacate` / `forced`.
 */
function boundsPass(
  x: Ctx,
  dom: Uint16Array,
  occLB: number,
  occUB: number,
  out: { vacate: number; forced: number; fail: number; changed: boolean },
): boolean {
  const C = x.C;
  const range = (region: number): [number, number] => [popcount(occLB & region), popcount(occUB & region)];
  const fits = (region: number, op: 'gt' | 'lt' | 'eq', n: number): boolean => {
    const [lb, ub] = range(region);
    const lo = op === 'gt' ? n + 1 : op === 'eq' ? n : 0;
    const hi = op === 'lt' ? n - 1 : op === 'eq' ? n : 99;
    return !(hi < lb || lo > ub);
  };
  const overlap = (r1: number, r2: number): boolean => {
    const [l1, u1] = range(r1);
    const [l2, u2] = range(r2);
    return !(u1 < l2 || u2 < l1);
  };
  for (const b of C.bounds) {
    const vars = b.vars;
    const unfixed = vars.filter((e) => !single(dom[e])).length;
    if (x.fc ? unfixed > 1 : unfixed > 2) continue;
    // predicate on concrete slots
    let ok: (s: number[]) => boolean;
    switch (b.k) {
      case 'gap':
      case 'gapc':
        ok = (s) => s[0] !== s[1] && fits(betweenMask(s[0], s[1]), b.op, b.n);
        break;
      case 'count':
      case 'countc':
        ok = (s) => fits(sideMask(C.S, s[0], b.dir), b.op, b.n);
        break;
      case 'mirror':
        ok = (s) => overlap(sideMask(C.S, s[0], -1), sideMask(C.S, s[1], 1));
        break;
      case 'eqgap':
        ok = (s) => s[0] !== s[1] && s[1] !== s[2] && overlap(betweenMask(s[0], s[1]), betweenMask(s[1], s[2]));
        break;
    }
    // generalised arc consistency over the (≤ 3) entities
    const supp = vars.map(() => 0);
    const cur = vars.map(() => 0);
    const walk = (i: number): void => {
      if (i === vars.length) {
        if (ok(cur)) cur.forEach((s, j) => (supp[j] |= bit(s)));
        return;
      }
      for (let m = dom[vars[i]]; m; m &= m - 1) {
        cur[i] = lowIndex(m);
        walk(i + 1);
      }
    };
    walk(0);
    for (let j = 0; j < vars.length; j++) {
      if (!supp[j]) {
        out.fail = b.clue;
        return false;
      }
      if (narrow(x, dom, vars[j], dom[vars[j]] & supp[j], b.clue)) out.changed = true;
    }
    if (unfixed === 0 && (b.k === 'gap' || b.k === 'gapc' || b.k === 'count' || b.k === 'countc')) {
      const s = vars.map((e) => lowIndex(dom[e]));
      const region = b.k === 'gap' || b.k === 'gapc' ? betweenMask(s[0], s[1]) : sideMask(C.S, s[0], b.dir);
      const [lb, ub] = range(region);
      const lo = b.op === 'gt' ? b.n + 1 : b.op === 'eq' ? b.n : 0;
      const hi = b.op === 'lt' ? b.n - 1 : b.op === 'eq' ? b.n : 99;
      if (hi === lb) out.vacate |= region & ~occLB;
      if (lo === ub) out.forced |= region & occUB;
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Propagation                                                         */
/* ------------------------------------------------------------------ */

export interface PlaceEvent {
  e: number;
  s: number;
  /** clue index, or CAUSE_* */
  cause: number;
  /** clue indices (bit mask) that narrowed this entity so far */
  why: number;
}

interface Ctx {
  C: Compiled;
  fc: boolean;
  why: number[] | null;
  events: PlaceEvent[] | null;
  failCause: number;
  failEntity: number;
}

function narrow(x: Ctx, dom: Uint16Array, e: number, n: number, cause: number): boolean {
  const before = dom[e];
  if (n === before) return false;
  dom[e] = n;
  if (x.why && cause >= 0 && cause < 31) x.why[e] |= 1 << cause;
  if (x.events && n && single(n) && !single(before)) x.events.push({ e, s: lowIndex(n), cause, why: x.why ? x.why[e] : 0 });
  return true;
}

function fail(x: Ctx, cause: number, e: number): false {
  x.failCause = cause;
  x.failEntity = e;
  return false;
}

function propagate(x: Ctx, dom: Uint16Array): boolean {
  const { C, fc } = x;
  const { P, K, S } = C;
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of C.bins) {
      const da = dom[b.a];
      const db = dom[b.b];
      if (fc && !single(da) && !single(db)) continue;
      let na = 0;
      for (let m = da; m; m &= m - 1) {
        const s = lowIndex(m);
        if (b.ab[s] & db) na |= bit(s);
      }
      if (!na) return fail(x, b.clue, b.a);
      if (narrow(x, dom, b.a, na, b.clue)) changed = true;
      let nb = 0;
      for (let m = db; m; m &= m - 1) {
        const s = lowIndex(m);
        if (b.ba[s] & na) nb |= bit(s);
      }
      if (!nb) return fail(x, b.clue, b.b);
      if (narrow(x, dom, b.b, nb, b.clue)) changed = true;
    }
    for (const t of C.ters) {
      const [a, b, c] = t.v;
      const fixed = (single(dom[a]) ? 1 : 0) + (single(dom[b]) ? 1 : 0) + (single(dom[c]) ? 1 : 0);
      if (fc && fixed < 2) continue;
      let na = 0;
      let nb = 0;
      let nc = 0;
      for (let ma = dom[a]; ma; ma &= ma - 1) {
        const sa = lowIndex(ma);
        for (let mb = dom[b]; mb; mb &= mb - 1) {
          const sb = lowIndex(mb);
          for (let mc = dom[c]; mc; mc &= mc - 1) {
            const sc = lowIndex(mc);
            if (t.ok(sa, sb, sc)) {
              na |= bit(sa);
              nb |= bit(sb);
              nc |= bit(sc);
            }
          }
        }
      }
      if (!na || !nb || !nc) return fail(x, t.clue, !na ? a : !nb ? b : c);
      if (narrow(x, dom, a, na, t.clue)) changed = true;
      if (narrow(x, dom, b, nb, t.clue)) changed = true;
      if (narrow(x, dom, c, nc, t.clue)) changed = true;
    }
    for (const v of C.vacs) {
      if (!single(dom[v.e])) continue;
      const s = lowIndex(dom[v.e]) + v.dir;
      if (s < 0 || s >= S) continue;
      for (let p = 0; p < P; p++) {
        const n = dom[p] & ~bit(s);
        if (!n) return fail(x, v.clue, p);
        if (narrow(x, dom, p, n, v.clue)) changed = true;
      }
    }
    // all-different inside each category
    for (let k = 0; k < K; k++) {
      const base = k * P;
      for (let i = 0; i < P; i++) {
        const di = dom[base + i];
        if (!single(di)) continue;
        for (let j = 0; j < P; j++) {
          if (j === i || !(dom[base + j] & di)) continue;
          const n = dom[base + j] & ~di;
          if (!n) return fail(x, CAUSE_ALLDIFF, base + j);
          if (narrow(x, dom, base + j, n, CAUSE_ALLDIFF)) changed = true;
        }
      }
    }
    // occupancy + hidden singles
    let personsUnion = 0;
    let fixedOcc = 0;
    for (let p = 0; p < P; p++) {
      personsUnion |= dom[p];
      if (single(dom[p])) fixedOcc |= dom[p];
    }
    let must: number;
    if (C.full) must = (1 << S) - 1;
    else {
      if (popcount(personsUnion) < P) return fail(x, CAUSE_OCC, 0);
      must = popcount(personsUnion) === P ? personsUnion : fixedOcc;
      if (C.bounds.length) {
        const out = { vacate: 0, forced: 0, fail: -1, changed: false };
        if (!boundsPass(x, dom, fixedOcc, personsUnion, out)) return fail(x, out.fail, 0);
        if (out.changed) changed = true;
        if (out.vacate) {
          for (let p = 0; p < P; p++) {
            if (single(dom[p])) continue;
            const n = dom[p] & ~out.vacate;
            if (!n) return fail(x, CAUSE_OCC, p);
            if (narrow(x, dom, p, n, CAUSE_OCC)) changed = true;
          }
        }
        must |= out.forced;
      }
      for (let e = P; e < C.E; e++) {
        const n = dom[e] & personsUnion;
        if (!n) return fail(x, CAUSE_OCC, e);
        if (narrow(x, dom, e, n, CAUSE_OCC)) changed = true;
        if (single(dom[e])) must |= dom[e];
      }
    }
    for (let k = 0; k < K; k++) {
      const base = k * P;
      for (let m = must; m; m &= m - 1) {
        const s = lowIndex(m);
        let cnt = 0;
        let who = -1;
        for (let i = 0; i < P; i++)
          if (dom[base + i] & bit(s)) {
            cnt++;
            who = base + i;
          }
        if (cnt === 0) return fail(x, CAUSE_HIDDEN, base);
        if (cnt === 1 && dom[who] !== bit(s)) {
          narrow(x, dom, who, bit(s), CAUSE_HIDDEN);
          changed = true;
        }
      }
    }
    // global (occupancy-dependent) clues once every person is placed
    if (C.globs.length) {
      let allPersons = true;
      for (let p = 0; p < P; p++) if (!single(dom[p])) allPersons = false;
      if (allPersons) {
        const slots = Array.from(dom, (m) => (single(m) ? lowIndex(m) : -1));
        const w = worldView(C.L, slots);
        for (const g of C.globs) {
          if (!g.vars.every((e) => slots[e] >= 0)) continue;
          if (!holds(w, C.input.clues[g.clue])) return fail(x, g.clue, g.vars[0]);
        }
      }
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export interface TNode {
  /** Branch assignment that created this node (absent at the root). */
  assign?: { e: number; s: number };
  /** Placements made by propagation at this node, in order. */
  events: PlaceEvent[];
  /** Contradiction: the clue (or CAUSE_*) that failed and the entity left without a slot. */
  dead?: { cause: number; e: number };
  solved?: boolean;
  /** Entity branched on, the clues that had narrowed it, and the child per option. */
  split?: { e: number; why: number; kids: TNode[] };
}

export interface SolveStats {
  nodes: number;
  leaves: number;
  dead: number;
  solutions: number;
  splits: number;
  maxDepth: number;
  /** Entities fixed by the first pass (root propagation). */
  firstPass: number;
  aborted: boolean;
}

export interface SolveOut {
  count: number;
  solutions: number[][];
  stats: SolveStats;
  tree?: TNode;
}

export interface SolveOpts {
  /** Stop after this many solutions (default 2). */
  limit?: number;
  /** Human-like forward checking + full search tree (default false). */
  fc?: boolean;
  trace?: boolean;
  nodeCap?: number;
}

/** MRV; on layouts with vacant slots every person is placed before any attribute (occupancy first). */
function pickVar(C: Compiled, dom: Uint16Array): number {
  let best = -1;
  let bestSize = 99;
  const end = C.full ? C.E : (() => {
    for (let p = 0; p < C.P; p++) if (!single(dom[p])) return C.P;
    return C.E;
  })();
  for (let e = 0; e < end; e++) {
    const n = popcount(dom[e]);
    if (n > 1 && n < bestSize) {
      best = e;
      bestSize = n;
    }
  }
  return best;
}

export function solve(input: SolverInput, opts: SolveOpts = {}): SolveOut {
  const C = compile(input);
  const fc = !!opts.fc;
  const limit = opts.limit ?? 2;
  const cap = opts.nodeCap ?? 200000;
  const stats: SolveStats = { nodes: 0, leaves: 0, dead: 0, solutions: 0, splits: 0, maxDepth: 0, firstPass: 0, aborted: false };
  const solutions: number[][] = [];
  const trace = !!opts.trace;

  if (C.initFail !== null) {
    stats.leaves = stats.dead = 1;
    const tree: TNode = { events: [], dead: { cause: C.initFail, e: 0 } };
    return { count: 0, solutions, stats, tree: trace ? tree : undefined };
  }

  const why = trace ? C.initWhy.slice() : null;
  let stop = false;

  const run = (dom: Uint16Array, whyIn: number[] | null, node: TNode | null, depth: number): void => {
    if (stop) return;
    stats.nodes++;
    if (stats.nodes > cap) {
      stats.aborted = true;
      stop = true;
      return;
    }
    if (depth > stats.maxDepth) stats.maxDepth = depth;
    const x: Ctx = { C, fc, why: whyIn, events: node ? node.events : null, failCause: 0, failEntity: 0 };
    const ok = propagate(x, dom);
    if (depth === 0) {
      let f = 0;
      for (let e = 0; e < C.E; e++) if (single(dom[e])) f++;
      stats.firstPass = f;
    }
    if (!ok) {
      stats.leaves++;
      stats.dead++;
      if (node) node.dead = { cause: x.failCause, e: x.failEntity };
      return;
    }
    const e = pickVar(C, dom);
    if (e < 0) {
      stats.leaves++;
      stats.solutions++;
      solutions.push(Array.from(dom, (m) => lowIndex(m)));
      if (node) node.solved = true;
      if (solutions.length >= limit) stop = true;
      return;
    }
    stats.splits++;
    const kids: TNode[] = [];
    if (node) node.split = { e, why: whyIn ? whyIn[e] : 0, kids };
    for (let m = dom[e]; m; m &= m - 1) {
      if (stop) return;
      const s = lowIndex(m);
      const child = dom.slice();
      child[e] = bit(s);
      const kid: TNode | null = node ? { assign: { e, s }, events: [] } : null;
      if (kid) kids.push(kid);
      run(child, whyIn ? whyIn.slice() : null, kid, depth + 1);
    }
  };

  const tree: TNode | null = trace ? { events: [] } : null;
  run(C.init.slice(), why, tree, 0);
  return { count: solutions.length, solutions, stats, tree: tree ?? undefined };
}

export const prof = { uniqueMs: 0, uniqueCalls: 0, uniqueNodes: 0, measureMs: 0, measureCalls: 0, measureNodes: 0 };

/** Exactly one arrangement satisfies the clues? */
export function isUnique(input: SolverInput): boolean {
  const t = performance.now();
  const r = solve(input, { limit: 2, nodeCap: 30000 });
  prof.uniqueMs += performance.now() - t;
  prof.uniqueCalls++;
  prof.uniqueNodes += r.stats.nodes;
  // an aborted search proves nothing: treat as not unique (safe side)
  return r.count === 1 && !r.stats.aborted;
}

/** Does forward chaining alone (no case split) place everyone? */
export function chainSolves(input: SolverInput): boolean {
  const C = compile(input);
  if (C.initFail !== null) return false;
  const dom = C.init.slice();
  const x: Ctx = { C, fc: true, why: null, events: null, failCause: 0, failEntity: 0 };
  if (!propagate(x, dom)) return false;
  for (let e = 0; e < C.E; e++) if (!single(dom[e])) return false;
  return true;
}

/**
 * Human-model measurement. Forward chaining as in `fc` mode; when stuck, the candidate splits on the entity whose
 * options leave the FEWEST cases alive after forward chaining (one-step lookahead, the way one picks the clue to
 * split on), ties → fewer options → persons first. Every case opened and later killed counts as a dead case.
 * A case in which some entity has no surviving option at all is killed on the spot (one dead case).
 */
export function measure(input: SolverInput, nodeCap = 600): SolveOut {
  const C = compile(input);
  const stats: SolveStats = { nodes: 0, leaves: 0, dead: 0, solutions: 0, splits: 0, maxDepth: 0, firstPass: 0, aborted: false };
  const solutions: number[][] = [];
  if (C.initFail !== null) {
    stats.leaves = stats.dead = 1;
    return { count: 0, solutions, stats, tree: { events: [], dead: { cause: C.initFail, e: 0 } } };
  }
  const quick = (dom: Uint16Array): boolean => {
    const x: Ctx = { C, fc: true, why: null, events: null, failCause: 0, failEntity: 0 };
    return propagate(x, dom);
  };
  const run = (dom: Uint16Array, why: number[], node: TNode, depth: number): void => {
    stats.nodes++;
    if (stats.nodes > nodeCap) {
      stats.aborted = true;
      return;
    }
    if (depth > stats.maxDepth) stats.maxDepth = depth;
    const x: Ctx = { C, fc: true, why, events: node.events, failCause: 0, failEntity: 0 };
    const ok = propagate(x, dom);
    if (depth === 0) {
      let f = 0;
      for (let e = 0; e < C.E; e++) if (single(dom[e])) f++;
      stats.firstPass = f;
    }
    if (!ok) {
      stats.leaves++;
      stats.dead++;
      node.dead = { cause: x.failCause, e: x.failEntity };
      return;
    }
    let minSize = 99;
    for (let e = 0; e < C.E; e++) {
      const n = popcount(dom[e]);
      if (n > 1 && n < minSize) minSize = n;
    }
    if (minSize === 99) {
      stats.leaves++;
      stats.solutions++;
      solutions.push(Array.from(dom, (m) => lowIndex(m)));
      node.solved = true;
      return;
    }
    // lookahead over the most constrained entities
    let best = -1;
    let bestScore = Infinity;
    let deadEntity = -1;
    let considered = 0;
    for (let size = minSize; size <= Math.min(minSize + 2, C.S) && considered < 8; size++) {
      for (let e = 0; e < C.E && considered < 8; e++) {
        if (popcount(dom[e]) !== size) continue;
        considered++;
        let alive = 0;
        for (let m = dom[e]; m; m &= m - 1) {
          const child = dom.slice();
          child[e] = bit(lowIndex(m));
          if (quick(child)) alive++;
        }
        if (alive === 0) {
          deadEntity = e;
          break;
        }
        const score = alive * 32 + size;
        if (score < bestScore) {
          bestScore = score;
          best = e;
        }
      }
      if (deadEntity >= 0) break;
    }
    if (deadEntity >= 0) {
      // every option of this entity fails: the case is dead
      stats.leaves++;
      stats.dead++;
      node.dead = { cause: CAUSE_ALLDIFF, e: deadEntity };
      return;
    }
    stats.splits++;
    const kids: TNode[] = [];
    node.split = { e: best, why: why[best], kids };
    for (let m = dom[best]; m; m &= m - 1) {
      const s = lowIndex(m);
      const child = dom.slice();
      child[best] = bit(s);
      const kid: TNode = { assign: { e: best, s }, events: [] };
      kids.push(kid);
      run(child, why.slice(), kid, depth + 1);
      if (stats.aborted) return;
    }
  };
  const tree: TNode = { events: [] };
  // direct placements (unary clues) are the first events of the first pass
  for (let e = 0; e < C.E; e++) {
    if (single(C.init[e]) && C.initWhy[e]) tree.events.push({ e, s: lowIndex(C.init[e]), cause: lowIndex(C.initWhy[e]), why: C.initWhy[e] });
  }
  const t0 = performance.now();
  run(C.init.slice(), C.initWhy.slice(), tree, 0);
  prof.measureMs += performance.now() - t0;
  prof.measureCalls++;
  prof.measureNodes += stats.nodes;
  return { count: solutions.length, solutions, stats, tree };
}
