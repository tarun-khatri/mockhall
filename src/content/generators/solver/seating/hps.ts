/**
 * Human-path simulation: solves a seating puzzle the way a coached aspirant does, and measures how many
 * cases they must carry. This is the difficulty measurement (SPEC 7.6: "record the solver's branching") and
 * the source of the worked solution ("Clues 3 and 5 fix two seats — start there", "Case 2 is rejected by …").
 *
 * Rules of the simulated solver:
 *  1. Any clue that can be checked in every open case is applied as a filter (it can only remove cases).
 *  2. Otherwise apply the clue that leaves the fewest cases in total (definite placements first, then the
 *     smallest split). A clue that would open more than `cap` possibilities in one case is postponed —
 *     people do not branch on "A is not next to B" while B is unplaced.
 *  3. When no clue helps, fill the most constrained open slot (e.g. "the only seat left goes to H").
 * Rings start by fixing the first person placed (rotation does not matter). Rows use a floating frame: the
 * first person starts a chain whose position in the row is decided only when an end/position clue needs it.
 *
 * Metrics: `splits` = total extra cases opened (a case splitting into m adds m − 1); `peak` = most cases open
 * at once. Level bands (generator): easy 0 splits, medium 1, hard 2–3, extreme ≥ 4.
 */
import {
  Evaluator,
  FALSE,
  NEED_FACE,
  NEED_N,
  NEED_OFF,
  NEED_SEAT,
  TRUE,
  UNK,
  fixedFaceOf,
  frameFor,
  isRing,
  mixedFaces,
  type Clue,
  type State,
} from './model';
import type { Puzzle, Solution } from './solve';

export interface HpsCase extends State {
  id: number;
  parent: number;
  off: number;
  occ: Int16Array;
  occP: Int16Array;
  occA: Int16Array;
  placed: number;
}

export interface HpsEvent {
  kind: 'clue' | 'filter' | 'fill';
  /** index into puzzle.clues (−1 for fill) */
  clue: number;
  /** open case id → resulting case ids (empty: eliminated; same id: unchanged or updated in place) */
  results: { from: number; to: number[] }[];
  /** fill only: what was filled */
  fill?: { kind: 'seat' | 'face' | 'n' | 'off'; id: number };
  alive: number;
}

export interface HpsResult {
  ok: boolean;
  events: HpsEvent[];
  cases: Map<number, HpsCase>;
  peak: number;
  splits: number;
  final?: HpsCase;
  /** the final case in absolute seats */
  solution?: Solution;
  /** evaluator configured like the simulation (frame mode on rows) — for explaining the cases */
  evaluator: Evaluator;
}

export interface HpsOptions {
  cap?: number;
  maxAlive?: number;
}

export function simulate(p: Puzzle, opts: HpsOptions = {}): HpsResult {
  const cap = opts.cap ?? 12;
  const maxAlive = opts.maxAlive ?? 48;
  const L = p.layout;
  const P = p.persons;
  const E = p.persons + p.attrs;
  const uncertain = L.kind === 'uncertain';
  const frame = frameFor(L);
  const framed = !!frame;
  const rows = L.kind === 'parallel' ? 2 : 1;
  const W = frame ? frame.W : L.len;
  const V0 = frame ? frame.V0 : 0;
  const S = framed ? rows * W : L.len;
  const [nLo, nHi] = p.nRange ?? [P, L.len];
  const ring = isRing(L);
  const faces = mixedFaces(L);
  const mixed = L.facing.kind === 'mixed';
  const clues = p.clues;
  const given = p.given;
  /** columns available to the chain: fixed rows L; uncertain rows up to the searched maximum */
  const rowCap = L.len;

  let nextId = 0;
  const cases = new Map<number, HpsCase>();
  const face0 = new Int8Array(S).fill(-1);
  for (let s = 0; s < S; s++) face0[s] = fixedFaceOf(L, framed && rows === 2 ? Math.floor(s / W) : 0, s);
  const occP0 = new Int16Array(S).fill(-1);
  const root: HpsCase = {
    id: nextId++,
    parent: -1,
    seatOf: new Int16Array(E).fill(-1),
    face: face0,
    n: uncertain ? -1 : S,
    off: -1,
    occ: occP0,
    occP: occP0,
    occA: new Int16Array(S).fill(-1),
    placed: 0,
  };
  cases.set(root.id, root);
  const ev = new Evaluator(L, root, frame);

  const clone = (c: HpsCase): HpsCase => {
    const occP = c.occP.slice();
    return {
      id: -1,
      parent: c.id,
      seatOf: c.seatOf.slice(),
      face: c.face.slice(),
      n: c.n,
      off: c.off,
      occ: occP,
      occP,
      occA: c.occA.slice(),
      placed: c.placed,
    };
  };

  const evalOn = (c: HpsCase, clue: Clue) => {
    ev.st = c;
    return ev.clue(clue);
  };
  const givenOk = (c: HpsCase): boolean => {
    for (const g of given) if (evalOn(c, g) === FALSE) return false;
    return true;
  };
  const noneFalse = (c: HpsCase): boolean => {
    if (!givenOk(c)) return false;
    for (const cl of clues) if (evalOn(c, cl) === FALSE) return false;
    return true;
  };
  const span = (c: HpsCase): [number, number] => {
    ev.st = c;
    return ev.span();
  };
  /** the row length the chain must fit into (uncertain: N once known) */
  const limitOf = (c: HpsCase) => (uncertain && c.n >= 0 ? c.n : rowCap);
  /** frame mode: the placed chain still fits in the row */
  const frameOk = (c: HpsCase): boolean => {
    if (!framed || c.placed === 0) return true;
    const [lo, hi] = span(c);
    const M = limitOf(c);
    if (hi - lo > M - 1) return false;
    if (c.off >= 0) return lo - V0 + c.off >= 0 && hi - V0 + c.off <= M - 1;
    return true;
  };
  const offRange = (c: HpsCase): [number, number] => {
    const [lo, hi] = span(c);
    return [Math.max(0, V0 - lo), limitOf(c) - 1 - hi + V0];
  };
  const firstSeats = (): number[] => {
    if (ring) return L.kind === 'circle' ? [0] : [0, 1];
    return rows === 2 ? [V0, W + V0] : [V0];
  };
  const seatDomain = (c: HpsCase): number[] => {
    if (c.placed === 0) return firstSeats();
    const out: number[] = [];
    for (let s = 0; s < S; s++) out.push(s);
    return out;
  };

  /** All minimal extensions of c that satisfy `clue`. Returns false on overflow. */
  const extend = (c: HpsCase, clue: Clue, out: HpsCase[], limit: number): boolean => {
    const r = evalOn(c, clue);
    if (r === FALSE) return true;
    if (r === TRUE) {
      if (!givenOk(c)) return true;
      if (out.length >= limit) return false;
      out.push(clone(c));
      return true;
    }
    const kind = ev.needKind;
    const id = ev.needId;
    if (kind === NEED_SEAT) {
      const person = id < P;
      const occ = person ? c.occP : c.occA;
      for (const s of seatDomain(c)) {
        if (occ[s] >= 0) continue;
        occ[s] = id;
        c.seatOf[id] = s;
        c.placed++;
        let ok = true;
        if (frameOk(c) && givenOk(c)) ok = extend(c, clue, out, limit);
        occ[s] = -1;
        c.seatOf[id] = -1;
        c.placed--;
        if (!ok) return false;
      }
      return true;
    }
    if (kind === NEED_FACE) {
      for (const f of faces) {
        c.face[id] = f;
        const ok = extend(c, clue, out, limit);
        c.face[id] = -1;
        if (!ok) return false;
      }
      return true;
    }
    if (kind === NEED_OFF) {
      const [a, b] = offRange(c);
      for (let off = a; off <= b; off++) {
        c.off = off;
        const ok = extend(c, clue, out, limit);
        c.off = -1;
        if (!ok) return false;
      }
      return true;
    }
    if (kind === NEED_N) {
      const [lo, hi] = span(c);
      const minN = c.off >= 0 ? hi - V0 + c.off + 1 : hi - lo + 1;
      for (let n = Math.max(nLo, minN); n <= nHi; n++) {
        c.n = n;
        let ok = true;
        if (frameOk(c)) ok = extend(c, clue, out, limit);
        c.n = -1;
        if (!ok) return false;
      }
      return true;
    }
    return true;
  };

  const complete = (c: HpsCase): boolean => {
    if (c.placed < E) return false;
    if (framed && c.off < 0) return false;
    if (uncertain && c.n < 0) return false;
    if (mixed) for (let e = 0; e < P; e++) if (c.face[c.seatOf[e]] < 0) return false;
    return true;
  };

  const register = (c: HpsCase): HpsCase => {
    c.id = nextId++;
    cases.set(c.id, c);
    return c;
  };

  const events: HpsEvent[] = [];
  let alive: HpsCase[] = [root];
  let peak = 1;
  let splits = 0;
  const remaining: number[] = clues.map((_, i) => i);

  const fail = (): HpsResult => ({ ok: false, events, cases, peak, splits, evaluator: ev });

  for (let guard = 0; guard < 400; guard++) {
    // 1. filters
    let progress = true;
    while (progress) {
      progress = false;
      for (let idx = 0; idx < remaining.length; idx++) {
        const ci = remaining[idx];
        let definite = true;
        for (const c of alive) {
          if (evalOn(c, clues[ci]) === UNK) {
            definite = false;
            break;
          }
        }
        if (!definite) continue;
        const results = alive.map((c) => ({ from: c.id, to: evalOn(c, clues[ci]) === TRUE ? [c.id] : [] }));
        const survivors = alive.filter((c) => evalOn(c, clues[ci]) === TRUE);
        remaining.splice(idx, 1);
        idx--;
        if (survivors.length !== alive.length) events.push({ kind: 'filter', clue: ci, results, alive: survivors.length });
        alive = survivors;
        progress = true;
        if (!alive.length) return fail();
      }
    }
    if (alive.every(complete)) break;

    // 2. best clue
    let best = -1;
    let bestTotal = Infinity;
    let bestOut: HpsCase[][] = [];
    for (const ci of remaining) {
      let total = 0;
      const outs: HpsCase[][] = [];
      let usable = true;
      for (const c of alive) {
        const out: HpsCase[] = [];
        if (!extend(c, clues[ci], out, cap)) {
          usable = false;
          break;
        }
        total += out.length;
        outs.push(out);
        if (total >= bestTotal) {
          usable = false;
          break;
        }
      }
      if (!usable) continue;
      best = ci;
      bestTotal = total;
      bestOut = outs;
    }
    if (best >= 0 && bestTotal <= maxAlive) {
      const results: { from: number; to: number[] }[] = [];
      const next: HpsCase[] = [];
      alive.forEach((c, i) => {
        const out = bestOut[i];
        if (out.length === 1) {
          const upd = out[0];
          upd.id = c.id;
          upd.parent = c.parent;
          cases.set(c.id, upd);
          next.push(upd);
          results.push({ from: c.id, to: [c.id] });
        } else {
          if (out.length > 1) splits += out.length - 1;
          const ids = out.map((o) => register(o).id);
          next.push(...out);
          results.push({ from: c.id, to: ids });
        }
      });
      remaining.splice(remaining.indexOf(best), 1);
      alive = next;
      events.push({ kind: 'clue', clue: best, results, alive: alive.length });
      peak = Math.max(peak, alive.length);
      if (!alive.length) return fail();
      continue;
    }

    // 3. fill the most constrained open slot, case by case
    const results: { from: number; to: number[] }[] = [];
    const next: HpsCase[] = [];
    let fillInfo: HpsEvent['fill'];
    for (const c of alive) {
      if (complete(c)) {
        next.push(c);
        results.push({ from: c.id, to: [c.id] });
        continue;
      }
      const pick: { opts: HpsCase[] | null; kind: 'seat' | 'face' | 'n' | 'off'; id: number } = { opts: null, kind: 'seat', id: -1 };
      const consider = (o: HpsCase[], kind: 'seat' | 'face' | 'n' | 'off', id: number) => {
        if (pick.opts === null || o.length < pick.opts.length) {
          pick.opts = o;
          pick.kind = kind;
          pick.id = id;
        }
      };
      for (let e = 0; e < E; e++) {
        if (c.seatOf[e] >= 0) continue;
        const occ = e < P ? c.occP : c.occA;
        const o: HpsCase[] = [];
        for (const s of seatDomain(c)) {
          if (occ[s] >= 0) continue;
          occ[s] = e;
          c.seatOf[e] = s;
          c.placed++;
          if (frameOk(c) && noneFalse(c)) o.push(clone(c));
          occ[s] = -1;
          c.seatOf[e] = -1;
          c.placed--;
        }
        consider(o, 'seat', e);
      }
      if (mixed) {
        for (let e = 0; e < P; e++) {
          const s = c.seatOf[e];
          if (s < 0 || c.face[s] >= 0) continue;
          const o: HpsCase[] = [];
          for (const f of faces) {
            c.face[s] = f;
            if (noneFalse(c)) o.push(clone(c));
            c.face[s] = -1;
          }
          consider(o, 'face', s);
        }
      }
      if (framed && c.off < 0 && c.placed > 0) {
        const o: HpsCase[] = [];
        const [a, b] = offRange(c);
        for (let off = a; off <= b; off++) {
          c.off = off;
          if (frameOk(c) && noneFalse(c)) o.push(clone(c));
          c.off = -1;
        }
        consider(o, 'off', 0);
      }
      if (uncertain && c.n < 0 && c.off >= 0) {
        const o: HpsCase[] = [];
        const [, hi] = span(c);
        for (let n = Math.max(nLo, hi - V0 + c.off + 1); n <= nHi; n++) {
          c.n = n;
          if (frameOk(c) && noneFalse(c)) o.push(clone(c));
          c.n = -1;
        }
        consider(o, 'n', 0);
      }
      const chosen: HpsCase[] = pick.opts ?? [];
      fillInfo = { kind: pick.kind, id: pick.id };
      if (chosen.length === 1) {
        const upd = chosen[0];
        upd.id = c.id;
        upd.parent = c.parent;
        cases.set(c.id, upd);
        next.push(upd);
        results.push({ from: c.id, to: [c.id] });
      } else {
        if (chosen.length > 1) splits += chosen.length - 1;
        const ids = chosen.map((o) => register(o).id);
        next.push(...chosen);
        results.push({ from: c.id, to: ids });
      }
    }
    alive = next;
    events.push({ kind: 'fill', clue: -1, results, fill: fillInfo, alive: alive.length });
    peak = Math.max(peak, alive.length);
    if (!alive.length || alive.length > maxAlive) return fail();
  }

  if (alive.length !== 1 || !complete(alive[0])) return fail();
  const fin = alive[0];
  return { ok: true, events, cases, peak, splits, final: fin, solution: toAbsolute(p, fin, frame ? { W, V0 } : null), evaluator: ev };
}

/** Convert a complete case to absolute seats. */
export function toAbsolute(p: Puzzle, c: HpsCase, frame: { W: number; V0: number } | null): Solution {
  const L = p.layout;
  const E = p.persons + p.attrs;
  if (!frame) return { seatOf: Array.from(c.seatOf), face: Array.from(c.face), n: c.face.length };
  const n = L.kind === 'uncertain' ? c.n : L.kind === 'parallel' ? 2 * L.len : L.len;
  const rowLen = L.kind === 'parallel' ? L.len : n;
  const abs = (s: number) => {
    const r = L.kind === 'parallel' ? Math.floor(s / frame.W) : 0;
    const v = L.kind === 'parallel' ? s % frame.W : s;
    return r * rowLen + (v - frame.V0 + c.off);
  };
  const seatOf = Array.from({ length: E }, (_, e) => abs(c.seatOf[e]));
  const face = Array.from({ length: n }, (_, s) => fixedFaceOf(L, L.kind === 'parallel' ? Math.floor(s / rowLen) : 0, s));
  for (let e = 0; e < p.persons; e++) {
    const f = c.face[c.seatOf[e]];
    if (f >= 0) face[seatOf[e]] = f;
  }
  return { seatOf, face, n };
}
