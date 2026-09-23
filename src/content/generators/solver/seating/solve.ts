/**
 * Backtracking constraint solver for seating arrangements (generator side).
 *
 * Entity-major search: entities are placed one at a time in a static order that follows the clue graph
 * (most-constrained first, then whoever is linked to already placed entities), a person's facing is chosen
 * right after the person is seated, and every clue is re-evaluated with 3-valued logic after each step so
 * partial arrangements that already break a clue are pruned. Rings are normalised by fixing the first entity
 * (circle: seat 0; square: seat 0 or 1, i.e. a corner or a middle).
 *
 * Uncertain rows: N is searched from the number of named persons up to a sound upper bound derived from the
 * clues (see uncertainBound). A puzzle is unique when exactly one (N, arrangement) pair satisfies every clue.
 */
import {
  Evaluator,
  FALSE,
  TRUE,
  clueEntities,
  emptyState,
  isPlain,
  isRing,
  mixedFaces,
  seatCount,
  type Atom,
  type Clue,
  type Layout,
} from './model';

export interface Puzzle {
  layout: Layout;
  persons: number;
  attrs: number;
  /** Facts stated in the introduction (e.g. who sits in which row). */
  given: Clue[];
  clues: Clue[];
  /** Uncertain rows: inclusive N range to search. */
  nRange?: [number, number];
}

export interface Solution {
  /** entity → seat */
  seatOf: number[];
  /** seat → facing code */
  face: number[];
  /** number of seats (uncertain: the solved N) */
  n: number;
}

export interface SolveResult {
  solutions: Solution[];
  /** false when the node budget ran out (treat as "not proven unique"). */
  complete: boolean;
  nodes: number;
}

export function entityOrder(p: Puzzle, all: Clue[]): number[] {
  const E = p.persons + p.attrs;
  const mentions = new Array<number>(E).fill(0);
  const unary = new Array<number>(E).fill(0);
  const links: Set<number>[] = Array.from({ length: E }, () => new Set<number>());
  for (const c of all) {
    const ents = clueEntities(c);
    for (const e of ents) {
      mentions[e]++;
      if (ents.length === 1) unary[e]++;
      for (const f of ents) if (f !== e) links[e].add(f);
    }
  }
  const order: number[] = [];
  const used = new Array<boolean>(E).fill(false);
  const score = (e: number) => unary[e] * 4 + mentions[e];
  while (order.length < E) {
    let best = -1;
    let bestKey = -Infinity;
    for (let e = 0; e < E; e++) {
      if (used[e]) continue;
      let conn = 0;
      for (const f of links[e]) if (used[f]) conn++;
      const key = conn * 1000 + score(e) * 10 - e * 0.001;
      if (key > bestKey) {
        bestKey = key;
        best = e;
      }
    }
    used[best] = true;
    order.push(best);
  }
  return order;
}

function searchN(p: Puzzle, all: Clue[], n: number, limit: number, budget: number, res: SolveResult): void {
  const L = p.layout;
  const S = seatCount(L, n);
  const E = p.persons + p.attrs;
  const st = emptyState(L, E, n);
  const ev = new Evaluator(L, st);
  const occP = new Int16Array(S).fill(-1);
  const occA = new Int16Array(S).fill(-1);
  const ring = isRing(L);
  const faces = mixedFaces(L);
  const mixed = L.facing.kind === 'mixed';
  // clues touching each entity (for cheap look-ahead)
  const byEntity: Clue[][] = Array.from({ length: E }, () => []);
  for (const c of all) for (const e of clueEntities(c)) byEntity[e].push(c);
  const okAll = (): boolean => {
    for (const c of all) if (ev.clue(c) === FALSE) return false;
    return true;
  };
  const okFor = (e: number): boolean => {
    for (const c of byEntity[e]) if (ev.clue(c) === FALSE) return false;
    return true;
  };
  const stop = () => res.solutions.length >= limit || !res.complete;
  let placed = 0;
  // candidate (seat, facing) options, packed as seat * 4 + face (face 3 bits; −1 → 7 = keep as is)
  const cand = new Int32Array(S * 2);
  const rec = (): void => {
    if (stop()) return;
    if (++res.nodes > budget) {
      res.complete = false;
      return;
    }
    if (placed === E) {
      for (const c of all) if (ev.clue(c) !== TRUE) return;
      res.solutions.push({ seatOf: Array.from(st.seatOf), face: Array.from(st.face.subarray(0, S)), n: L.kind === 'uncertain' ? n : S });
      return;
    }
    // most constrained entity first: fewest (seat, facing) options that break no clue about it
    let best = -1;
    let bestOpts: number[] = [];
    const maxSeat = ring && placed === 0 ? (L.kind === 'circle' ? 1 : 2) : S;
    for (let e = 0; e < E; e++) {
      if (st.seatOf[e] >= 0) continue;
      const person = e < p.persons;
      const occ = person ? occP : occA;
      let k = 0;
      for (let s = 0; s < maxSeat; s++) {
        if (occ[s] >= 0) continue;
        occ[s] = e;
        st.seatOf[e] = s;
        if (person && mixed && st.face[s] < 0) {
          for (const f of faces) {
            st.face[s] = f;
            if (okFor(e)) cand[k++] = s * 8 + f;
          }
          st.face[s] = -1;
        } else if (okFor(e)) cand[k++] = s * 8 + 7;
        occ[s] = -1;
        st.seatOf[e] = -1;
        if (best >= 0 && k >= bestOpts.length) break;
      }
      if (k === 0) return;
      if (best < 0 || k < bestOpts.length) {
        best = e;
        bestOpts = Array.from(cand.subarray(0, k));
        if (k === 1) break;
      }
    }
    const e = best;
    const occ = e < p.persons ? occP : occA;
    placed++;
    for (const opt of bestOpts) {
      const s = opt >> 3;
      const f = opt & 7;
      occ[s] = e;
      st.seatOf[e] = s;
      if (f !== 7) st.face[s] = f;
      if (okAll()) rec();
      if (f !== 7) st.face[s] = -1;
      occ[s] = -1;
      st.seatOf[e] = -1;
      if (stop()) break;
    }
    placed--;
  };
  rec();
}

/** Find up to `limit` arrangements satisfying the given facts and clues. */
export function solve(p: Puzzle, limit = 2, budget = 400_000): SolveResult {
  const res: SolveResult = { solutions: [], complete: true, nodes: 0 };
  const all = [...p.given, ...p.clues];
  if (p.layout.kind === 'uncertain') {
    const [lo, hi] = p.nRange ?? [p.persons, p.layout.len];
    for (let n = lo; n <= hi && res.solutions.length < limit && res.complete; n++) searchN(p, all, n, limit, budget, res);
  } else searchN(p, all, 0, limit, budget, res);
  return res;
}

export function sameSolution(a: Solution, b: Solution, persons: number, attrs: number): boolean {
  if (a.n !== b.n) return false;
  for (let e = 0; e < persons + attrs; e++) if (a.seatOf[e] !== b.seatOf[e]) return false;
  for (let e = 0; e < persons; e++) if (a.face[a.seatOf[e]] !== b.face[b.seatOf[e]]) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Uncertain rows: a sound upper bound on N                            */
/* ------------------------------------------------------------------ */

/**
 * Upper bound on the number of seats N implied by the clues (Infinity when N is not bounded).
 * Positions P_x ≥ 0; bounded-distance atoms between named persons give |P_x − P_y| ≤ w (all-pairs shortest
 * paths); left-end atoms fix P_x; right-end atoms tie N to a position. Everything else is ignored, which can
 * only loosen the bound, so the bound is sound.
 */
export function uncertainBound(persons: number, clues: Clue[]): number {
  const P = persons;
  const INF = 1e9;
  const D: number[][] = Array.from({ length: P }, (_, i) => Array.from({ length: P }, (_, j) => (i === j ? 0 : INF)));
  const edge = (x: number, y: number, w: number) => {
    if (x >= P || y >= P) return;
    if (w < D[x][y]) {
      D[x][y] = w;
      D[y][x] = w;
    }
  };
  const left: number[] = new Array<number>(P).fill(INF);
  const asMany: [number, number, number][] = [];
  const rightTies: ((ub: number[]) => number)[] = [];
  const atoms: Atom[] = clues.flat();
  for (const a of atoms) {
    switch (a.t) {
      case 'rel':
        if (isPlain(a.a) && isPlain(a.b)) edge(a.a.e, a.b.e, a.k);
        break;
      case 'gap':
        if (isPlain(a.a) && isPlain(a.b)) edge(a.a.e, a.b.e, a.n + 1);
        break;
      case 'adj':
        if (!a.neg && isPlain(a.a) && isPlain(a.b)) edge(a.a.e, a.b.e, 1);
        break;
      case 'asMany':
        if (isPlain(a.a) && isPlain(a.b) && isPlain(a.c)) asMany.push([a.a.e, a.b.e, a.c.e]);
        break;
      case 'endSide':
        if (isPlain(a.a) && a.a.e < P) {
          const x = a.a.e;
          const k = a.k;
          // all persons face north in uncertain rows: left end = west
          if (a.side === 'left') left[x] = Math.min(left[x], k - 1);
          else rightTies.push((ub) => ub[x] + k);
        }
        break;
      case 'sideCount':
        if (isPlain(a.a) && a.a.e < P) {
          const x = a.a.e;
          const n = a.n;
          if (a.side === 'left') left[x] = Math.min(left[x], n);
          else rightTies.push((ub) => ub[x] + n + 1);
        }
        break;
      case 'sideEq':
        if (isPlain(a.a) && isPlain(a.b)) {
          const x = a.a.e;
          const y = a.b.e;
          rightTies.push((ub) => ub[x] + ub[y] + 1);
        }
        break;
      case 'middle':
        if (isPlain(a.a)) {
          const x = a.a.e;
          rightTies.push((ub) => 2 * ub[x] + 1);
        }
        break;
      default:
        break;
    }
  }
  // all-pairs shortest paths, with the "as many" equalities folded in until nothing changes
  for (let round = 0; round < 6; round++) {
    for (let k = 0; k < P; k++)
      for (let i = 0; i < P; i++)
        for (let j = 0; j < P; j++) if (D[i][k] + D[k][j] < D[i][j]) D[i][j] = D[i][k] + D[k][j];
    let changed = false;
    for (const [a, b, c] of asMany) {
      if (D[a][b] < D[b][c]) {
        D[b][c] = D[c][b] = D[a][b];
        changed = true;
      } else if (D[b][c] < D[a][b]) {
        D[a][b] = D[b][a] = D[b][c];
        changed = true;
      }
    }
    if (!changed) break;
  }
  const ub = new Array<number>(P).fill(INF);
  for (let x = 0; x < P; x++) for (let y = 0; y < P; y++) if (left[y] < INF && D[y][x] < INF) ub[x] = Math.min(ub[x], left[y] + D[y][x]);
  let best = INF;
  for (const tie of rightTies) {
    const v = tie(ub);
    if (v < best) best = v;
  }
  return best >= INF / 2 ? Infinity : best;
}
