/**
 * Build backward: a hidden arrangement → a pool of TRUE clues in exam style → pick clues until the solver finds
 * exactly one arrangement → drop redundant clues (removal order depends on the target difficulty).
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty } from '../../../types';
import {
  type Clue,
  type ClueKind,
  type Layout,
  type Pred,
  type WorldView,
  MONTH_DAYS,
  colOf,
  holds,
  personsAbove,
  personsBelow,
  personsBetween,
  rowOf,
  slotCount,
  worldView,
} from '../../solver/puzzles/model';
import { chainSolves, isUnique, measure, type SolveStats, type SolverInput, type TNode } from '../../solver/puzzles/csp';
import type { Setup } from './setup';
import { levelOf, levelRank } from './difficulty';

/** direct: fixes a position/attribute; semi: narrows (parity, range, count); rel: relative; neg: negative;
 * eq: count equality ("as many … as …"); unc: quantified / uncertain counts. */
export type Fam = 'direct' | 'semi' | 'rel' | 'neg' | 'eq' | 'unc';

export interface Cand {
  clue: Clue;
  fam: Fam;
  w: number;
}

export function familyOf(c: Clue): Fam {
  switch (c.k) {
    case 'is':
      return c.p.t === 'slot' ? 'direct' : 'semi';
    case 'val':
    case 'rval':
      return 'direct';
    case 'link':
    case 'count':
      return 'semi';
    case 'not':
    case 'nlink':
    case 'nadj':
    case 'ndelta':
    case 'drow':
    case 'dcol':
      return 'neg';
    case 'eqgap':
    case 'mirror':
      return 'eq';
    case 'gapc':
    case 'countc':
    case 'empty':
      return 'unc';
    default:
      return 'rel';
  }
}

/** Random hidden arrangement: slot of every entity (persons first, then each attribute category). */
export function randomTruth(setup: Setup, rng: Rng): number[] {
  const L = setup.layout;
  const S = slotCount(L);
  const P = L.persons;
  const all = Array.from({ length: S }, (_, i) => i);
  const used = L.kind === 'month' ? rng.sample(all, P).sort((a, b) => a - b) : all;
  const personSlot = rng.shuffle(used);
  const slot = personSlot.slice();
  for (let k = 0; k < setup.cats.length; k++) {
    const holder = rng.shuffle(Array.from({ length: P }, (_, i) => i));
    for (let v = 0; v < P; v++) slot.push(personSlot[holder[v]]);
  }
  return slot;
}

export function solverInput(setup: Setup, clues: readonly Clue[]): SolverInput {
  return { layout: setup.layout, ncats: 1 + setup.cats.length, clues };
}

const FAM_WEIGHT: Record<Difficulty, Record<Fam, number>> = {
  easy: { direct: 5, semi: 1.2, rel: 4, neg: 0.25, eq: 0.4, unc: 0 },
  medium: { direct: 1.8, semi: 2.2, rel: 4, neg: 1.1, eq: 2, unc: 0.4 },
  hard: { direct: 0.35, semi: 2, rel: 3.2, neg: 2.6, eq: 2.2, unc: 1.8 },
  extreme: { direct: 0.2, semi: 1.8, rel: 3, neg: 2.6, eq: 2.2, unc: 2.4 },
};

const ATTR_SHARE: Record<Difficulty, number> = { easy: 0.15, medium: 0.3, hard: 0.45, extreme: 0.5 };
const MAX_DELTA: Record<Difficulty, number> = { easy: 1, medium: 3, hard: 4, extreme: 4 };

/** Which clue kinds each layout uses. */
const KINDS: Record<Layout['kind'], ClueKind[]> = {
  floor: ['is', 'not', 'link', 'nlink', 'delta', 'gap', 'gapc', 'order', 'nadj', 'ndelta', 'eqgap', 'count', 'countc', 'mirror'],
  box: ['is', 'not', 'link', 'nlink', 'delta', 'gap', 'gapc', 'order', 'nadj', 'ndelta', 'eqgap', 'count', 'countc', 'mirror'],
  day: ['is', 'not', 'link', 'nlink', 'delta', 'gap', 'gapc', 'order', 'nadj', 'ndelta', 'eqgap', 'count', 'countc', 'mirror'],
  week: ['is', 'not', 'link', 'nlink', 'delta', 'gap', 'gapc', 'order', 'nadj', 'ndelta', 'eqgap', 'count', 'countc', 'mirror'],
  month: ['is', 'not', 'link', 'nlink', 'delta', 'gap', 'gapc', 'order', 'nadj', 'count', 'countc', 'mirror', 'empty'],
  month2: ['is', 'not', 'link', 'nlink', 'delta', 'gap', 'gapc', 'order', 'srow', 'drow', 'count', 'mirror', 'nadj'],
  flat: ['is', 'not', 'link', 'nlink', 'vert', 'rdelta', 'rgap', 'rorder', 'srow', 'drow', 'scol', 'dcol', 'east', 'nadj'],
  session: ['is', 'not', 'link', 'nlink', 'delta', 'gap', 'order', 'srow', 'drow', 'count', 'nadj'],
  rank: ['is', 'not', 'order', 'btw', 'delta', 'count', 'countc', 'val', 'rval'],
};

/** Kind-specific weight multipliers. */
const KIND_FACTOR: Partial<Record<ClueKind, number>> = {
  link: 1.2,
  delta: 1.3,
  gap: 1.2,
  order: 0.7,
  eqgap: 0.8,
  mirror: 0.6,
  empty: 0.9,
  countc: 0.7,
  ndelta: 0.6,
};

interface PoolCtx {
  setup: Setup;
  L: Layout;
  S: number;
  P: number;
  E: number;
  w: WorldView;
  truth: number[];
  personAt: number[];
  rng: Rng;
  d: Difficulty;
}

function holderOf(x: PoolCtx, e: number): number {
  return x.personAt[x.truth[e]];
}

/** A random entity: a person, or (with the difficulty's share) an attribute value. */
function randEnt(x: PoolCtx, attrShare = ATTR_SHARE[x.d]): number {
  if (x.E > x.P && x.rng.chance(attrShare)) return x.rng.int(x.P, x.E - 1);
  return x.rng.int(0, x.P - 1);
}

function distinctPair(x: PoolCtx): [number, number] | null {
  for (let t = 0; t < 20; t++) {
    const a = randEnt(x);
    const b = randEnt(x);
    if (holderOf(x, a) !== holderOf(x, b)) return [a, b];
  }
  return null;
}

function rowsCount(L: Layout): number {
  return L.rows;
}

function predsFor(x: PoolCtx, e: number, positive: boolean): Pred[] {
  const { L } = x;
  const s = x.truth[e];
  const r = rowOf(L, s);
  const out: Pred[] = [];
  const twoCol = L.cols === 2;
  if (positive) {
    out.push({ t: 'slot', s });
    if (twoCol) {
      out.push({ t: 'row', r });
      if (L.kind !== 'month2' || x.rng.chance(0.6)) out.push({ t: 'col', c: colOf(L, s) });
    }
    if (L.kind === 'floor' || L.kind === 'flat' || L.kind === 'box') {
      out.push({ t: (r + 1) % 2 === 0 ? 'even' : 'odd' });
      if ([2, 3, 5, 7].includes(r + 1) && x.rng.chance(0.5)) out.push({ t: 'prime' });
    }
    if (L.kind !== 'box' && L.kind !== 'rank') {
      const R = rowsCount(L);
      if (r > 0) out.push({ t: 'gt', r: Math.max(0, r - 1 - x.rng.int(0, Math.min(2, r - 1))) });
      if (r < R - 1) out.push({ t: 'lt', r: Math.min(R - 1, r + 1 + x.rng.int(0, Math.min(2, R - 2 - r))) });
    }
    if (L.kind === 'month' || L.kind === 'month2') {
      const days = MONTH_DAYS[L.months![r]];
      if (days === 31) out.push({ t: 'd31' });
      if (days === 30) out.push({ t: 'd30' });
    }
  } else {
    // negative predicates: a slot/row/col the entity is NOT in, parity it does not have, month-length it lacks
    const S = x.S;
    const other = x.rng.int(0, S - 1);
    if (other !== s && (L.kind !== 'month' || x.w.occ[other] || x.rng.chance(0.3))) out.push({ t: 'slot', s: other });
    // extremes are the most natural negatives ("not on the topmost floor")
    if (s !== S - 1) out.push({ t: 'slot', s: S - 1 });
    if (s !== 0) out.push({ t: 'slot', s: 0 });
    if (twoCol) {
      const rr = x.rng.int(0, L.rows - 1);
      if (rr !== r) out.push({ t: 'row', r: rr });
      if (L.kind === 'flat') out.push({ t: 'col', c: 1 - colOf(L, s) });
    }
    if (L.kind === 'floor' || L.kind === 'flat' || L.kind === 'box') {
      out.push({ t: (r + 1) % 2 === 0 ? 'odd' : 'even' });
      if (![2, 3, 5, 7].includes(r + 1) && x.rng.chance(0.4)) out.push({ t: 'prime' });
    }
    if (L.kind === 'month' || L.kind === 'month2') {
      const days = MONTH_DAYS[L.months![r]];
      if (days !== 31) out.push({ t: 'd31' });
      if (days !== 30) out.push({ t: 'd30' });
    }
  }
  return out;
}

function candidatesOf(x: PoolCtx, kind: ClueKind): Clue[] {
  const { L, S, P, rng, truth, w } = x;
  const out: Clue[] = [];
  const tries = (kind === 'link' || kind === 'nlink' ? 30 : 18) + (x.E > 2 * P ? 10 : 0);
  const maxD = MAX_DELTA[x.d];
  for (let t = 0; t < tries; t++) {
    switch (kind) {
      case 'is': {
        const e = randEnt(x, x.d === 'easy' ? 0.3 : ATTR_SHARE[x.d]);
        const ps = predsFor(x, e, true);
        let p = rng.pick(ps);
        if (L.kind === 'rank' && p.t !== 'slot') p = { t: 'slot', s: truth[e] };
        out.push({ k: 'is', e, p });
        break;
      }
      case 'not': {
        if (rng.chance(0.5)) {
          const e = randEnt(x);
          const ps = predsFor(x, e, false);
          if (ps.length) out.push({ k: 'not', es: [e], p: rng.pick(ps) });
        } else {
          const pr = distinctPair(x);
          if (!pr) break;
          const ps = predsFor(x, pr[0], false).filter((p) => !holds(w, { k: 'is', e: pr[1], p }));
          if (ps.length) out.push({ k: 'not', es: pr, p: rng.pick(ps) });
        }
        break;
      }
      case 'link': {
        // every true link, once (enumerated on the first try)
        if (x.E === P || t > 0) break;
        const K = x.setup.cats.length;
        for (let k = 1; k <= K; k++) for (let v = 0; v < P; v++) out.push({ k: 'link', a: holderOf(x, k * P + v), b: k * P + v });
        if (K === 2) for (let v = 0; v < P; v++) for (let v2 = 0; v2 < P; v2++) if (holderOf(x, P + v) === holderOf(x, 2 * P + v2)) out.push({ k: 'link', a: P + v, b: 2 * P + v2 });
        break;
      }
      case 'nlink': {
        if (x.E === P) break;
        const ev = rng.int(P, x.E - 1);
        // person–value, or value–value across two categories
        const K = x.setup.cats.length;
        const a = K === 2 && rng.chance(0.3) ? (ev < 2 * P ? 2 * P : P) + rng.int(0, P - 1) : rng.int(0, P - 1);
        if (holderOf(x, ev) !== holderOf(x, a)) out.push({ k: 'nlink', a, b: ev });
        break;
      }
      case 'delta': {
        const pr = distinctPair(x);
        if (!pr) break;
        const d = truth[pr[0]] - truth[pr[1]];
        const lim = L.kind === 'rank' ? 4 : L.kind === 'month' ? Math.max(maxD, 2) : maxD;
        if (L.kind === 'rank' && Math.abs(d) < 2) break;
        if (Math.abs(d) <= lim && d !== 0) out.push({ k: 'delta', a: d > 0 ? pr[0] : pr[1], b: d > 0 ? pr[1] : pr[0], d: Math.abs(d) });
        break;
      }
      case 'vert': {
        const pr = distinctPair(x);
        if (!pr) break;
        const [a, b] = pr;
        if (colOf(L, truth[a]) === colOf(L, truth[b]) && Math.abs(rowOf(L, truth[a]) - rowOf(L, truth[b])) === 1) {
          const up = rowOf(L, truth[a]) > rowOf(L, truth[b]);
          out.push({ k: 'vert', a: up ? a : b, b: up ? b : a, d: 1 });
        }
        break;
      }
      case 'rdelta': {
        const pr = distinctPair(x);
        if (!pr) break;
        const d = rowOf(L, truth[pr[0]]) - rowOf(L, truth[pr[1]]);
        if (Math.abs(d) === 1) out.push({ k: 'rdelta', a: d > 0 ? pr[0] : pr[1], b: d > 0 ? pr[1] : pr[0], d: 1 });
        break;
      }
      case 'rgap': {
        const pr = distinctPair(x);
        if (!pr) break;
        const d = Math.abs(rowOf(L, truth[pr[0]]) - rowOf(L, truth[pr[1]]));
        if (d >= 1) out.push({ k: 'rgap', a: pr[0], b: pr[1], n: d - 1 });
        break;
      }
      case 'gap': {
        const pr = distinctPair(x);
        if (!pr) break;
        const n = personsBetween(w, truth[pr[0]], truth[pr[1]]);
        if (n >= 1 && n <= (x.d === 'easy' ? 3 : 5)) out.push({ k: 'gap', a: pr[0], b: pr[1], n });
        break;
      }
      case 'gapc': {
        const pr = distinctPair(x);
        if (!pr) break;
        const n = personsBetween(w, truth[pr[0]], truth[pr[1]]);
        if (rng.chance(0.55)) {
          if (n >= 1) out.push({ k: 'gapc', a: pr[0], b: pr[1], op: 'gt', n: Math.max(0, n - 1 - (rng.chance(0.3) ? 1 : 0)) });
        } else if (n <= P - 4) {
          const m = n + 1 + (rng.chance(0.3) ? 1 : 0);
          if (m >= 2) out.push({ k: 'gapc', a: pr[0], b: pr[1], op: 'lt', n: m });
        }
        break;
      }
      case 'order': {
        const pr = distinctPair(x);
        if (!pr) break;
        const [a, b] = truth[pr[0]] > truth[pr[1]] ? pr : [pr[1], pr[0]];
        out.push({ k: 'order', a, b });
        break;
      }
      case 'rorder': {
        const pr = distinctPair(x);
        if (!pr) break;
        const ra = rowOf(L, truth[pr[0]]);
        const rb = rowOf(L, truth[pr[1]]);
        if (ra !== rb) out.push({ k: 'rorder', a: ra > rb ? pr[0] : pr[1], b: ra > rb ? pr[1] : pr[0] });
        break;
      }
      case 'nadj': {
        const pr = distinctPair(x);
        if (!pr) break;
        const c: Clue = { k: 'nadj', a: pr[0], b: pr[1] };
        if (holds(w, c)) out.push(c);
        break;
      }
      case 'ndelta': {
        const pr = distinctPair(x);
        if (!pr) break;
        const d = rng.pick([1, -1]);
        const c: Clue = { k: 'ndelta', a: pr[0], b: pr[1], d };
        // most instructive when they ARE neighbours the other way round, or close
        const diff = truth[pr[0]] - truth[pr[1]];
        if (holds(w, c) && Math.abs(diff) <= 2) out.push(c);
        break;
      }
      case 'eqgap': {
        const b = randEnt(x);
        const a = randEnt(x);
        const c = randEnt(x);
        const hs = new Set([holderOf(x, a), holderOf(x, b), holderOf(x, c)]);
        if (hs.size < 3) break;
        const cl: Clue = { k: 'eqgap', a, b, c };
        if (holds(w, cl) && personsBetween(w, truth[a], truth[b]) >= 1) out.push(cl);
        break;
      }
      case 'srow':
      case 'drow':
      case 'scol':
      case 'dcol': {
        const pr = distinctPair(x);
        if (!pr) break;
        const c: Clue = { k: kind, a: pr[0], b: pr[1] };
        if (holds(w, c)) out.push(c);
        break;
      }
      case 'east': {
        const pr = distinctPair(x);
        if (!pr) break;
        const c: Clue = { k: 'east', a: pr[0], b: pr[1] };
        const c2: Clue = { k: 'east', a: pr[1], b: pr[0] };
        if (holds(w, c)) out.push(c);
        else if (holds(w, c2)) out.push(c2);
        break;
      }
      case 'count': {
        const e = randEnt(x);
        const dir = rng.pick([1, -1] as const);
        const n = dir === 1 ? personsAbove(w, truth[e]) : personsBelow(w, truth[e]);
        if (n >= 1 && n <= P - 2) out.push({ k: 'count', e, dir, n });
        break;
      }
      case 'countc': {
        const e = randEnt(x);
        const dir = rng.pick([1, -1] as const);
        const n = dir === 1 ? personsAbove(w, truth[e]) : personsBelow(w, truth[e]);
        if (rng.chance(0.5)) {
          if (n >= 2) out.push({ k: 'countc', e, dir, op: 'gt', n: n - 1 - (rng.chance(0.3) && n >= 3 ? 1 : 0) });
        } else if (n <= P - 3) {
          const m = n + 1 + (rng.chance(0.3) && n <= P - 4 ? 1 : 0);
          if (m >= 2) out.push({ k: 'countc', e, dir, op: 'lt', n: m });
        }
        break;
      }
      case 'mirror': {
        const pr = distinctPair(x);
        if (!pr) break;
        const c: Clue = { k: 'mirror', a: pr[0], b: pr[1] };
        if (holds(w, c)) out.push(c);
        else {
          // search for a partner that works
          for (let b = 0; b < P; b++) {
            const c2: Clue = { k: 'mirror', a: pr[0], b };
            if (holderOf(x, b) !== holderOf(x, pr[0]) && holds(w, c2)) {
              out.push(c2);
              break;
            }
          }
        }
        break;
      }
      case 'empty': {
        const e = randEnt(x);
        const dir = rng.pick([1, -1] as const);
        const tgt = truth[e] + dir;
        if (tgt >= 0 && tgt < S && !w.occ[tgt]) out.push({ k: 'empty', e, dir });
        break;
      }
      case 'btw': {
        const a = randEnt(x);
        const b = randEnt(x);
        const c = randEnt(x);
        if (new Set([holderOf(x, a), holderOf(x, b), holderOf(x, c)]).size < 3) break;
        const cl: Clue = { k: 'btw', a, b, c };
        if (holds(w, cl)) out.push(cl);
        break;
      }
      case 'val':
      case 'rval':
        break; // comparison values are added by the comparison builder
    }
  }
  return out;
}

function clueKey(c: Clue): string {
  return JSON.stringify(c);
}

export function cluePool(setup: Setup, truth: number[], rng: Rng, extra: Clue[] = []): Cand[] {
  const L = setup.layout;
  const P = L.persons;
  const w = worldView(L, truth);
  const personAt = new Array<number>(slotCount(L)).fill(-1);
  for (let p = 0; p < P; p++) personAt[truth[p]] = p;
  const x: PoolCtx = { setup, L, S: slotCount(L), P, E: truth.length, w, truth, personAt, rng, d: setup.difficulty };
  const seen = new Set<string>();
  const pool: Cand[] = [];
  const add = (c: Clue) => {
    const key = clueKey(c);
    if (seen.has(key)) return;
    if (!holds(w, c)) throw new Error(`puzzles: generated a false clue ${key}`);
    seen.add(key);
    const fam = familyOf(c);
    const wgt = FAM_WEIGHT[setup.difficulty][fam] * (KIND_FACTOR[c.k] ?? 1);
    if (wgt > 0) pool.push({ clue: c, fam, w: wgt });
  };
  for (const kind of KINDS[L.kind]) for (const c of candidatesOf(x, kind)) add(c);
  for (const c of extra) add(c);
  return pool;
}

/** Weighted random order (Efraimidis–Spirakis keys). */
function weightedOrder<T extends { w: number }>(rng: Rng, items: readonly T[]): T[] {
  return items
    .map((it) => ({ it, key: Math.pow(Math.max(rng.next(), 1e-12), 1 / it.w) }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.it);
}

const REMOVE_ORDER: Record<Difficulty, Fam[]> = {
  easy: ['unc', 'eq', 'neg', 'semi', 'rel', 'direct'],
  medium: ['unc', 'neg', 'direct', 'semi', 'rel', 'eq'],
  hard: ['direct', 'semi', 'rel', 'neg', 'eq', 'unc'],
  extreme: ['direct', 'semi', 'rel', 'neg', 'eq', 'unc'],
};

export interface Selection {
  clues: Clue[];
  level: Difficulty;
  stats: SolveStats;
  tree: TNode;
}

/**
 * Add clues from the pool (weighted order) until the arrangement is unique (easy: until forward chaining alone
 * solves it), then drop every clue that is not needed — removing the families that do not suit the target first,
 * and never letting the measured level rise above the target. Returns the measured level; callers keep the set
 * only when it equals the target.
 */

/** Most clues of one style in a set (before the strong top-up). */
const KIND_CAP: Record<string, number> = { gap: 3, delta: 3, 'is:slot': 3, 'is:set': 3, link: 12, nlink: 3, 'not:slot': 2, 'not:set': 2, srow: 2, vert: 3, count: 2, order: 2 };

export function selectClues(setup: Setup, pool: readonly Cand[], rng: Rng, maxClues: number, fixed: Clue[] = []): Selection | null {
  const target = setup.difficulty;
  const order = weightedOrder(rng, pool);
  const sel: Cand[] = fixed.map((clue) => ({ clue, fam: familyOf(clue), w: 1 }));
  const input = (cs: Cand[]) => solverInput(setup, cs.map((c) => c.clue));
  const ok = (cs: Cand[]) => (target === 'easy' ? chainSolves(input(cs)) : isUnique(input(cs)));
  let done = false;
  const used = new Map<string, number>();
  for (const c of order) {
    // variety: real sets mix clue styles
    const kind = c.clue.k === 'is' || c.clue.k === 'not' ? `${c.clue.k}:${c.clue.p.t === 'slot' ? 'slot' : 'set'}` : c.clue.k;
    const capN = KIND_CAP[kind] ?? 2;
    if ((used.get(kind) ?? 0) >= capN) continue;
    used.set(kind, (used.get(kind) ?? 0) + 1);
    sel.push(c);
    if (sel.length >= 4 && ok(sel)) {
      done = true;
      break;
    }
    if (sel.length > maxClues + 16) break;
  }
  if (!done) {
    // top up with strong clues (attribute links, exact positions); minimisation strips what is not needed
    const strong = rng.shuffle(pool.filter((c) => !sel.includes(c) && (c.clue.k === 'link' || (c.clue.k === 'is' && c.clue.p.t === 'slot'))));
    for (const c of strong) {
      sel.push(c);
      if (ok(sel)) {
        done = true;
        break;
      }
    }
  }
  if (!done) return null;
  const rank = REMOVE_ORDER[target];
  const removal = rng
    .shuffle(sel.slice())
    .filter((c) => !fixed.includes(c.clue))
    .sort((a, b) => rank.indexOf(a.fam) - rank.indexOf(b.fam));
  let cur = sel.slice();
  for (const c of removal) {
    const trial = cur.filter((x) => x !== c);
    if (!ok(trial)) continue;
    if (target !== 'easy' && target !== 'extreme') {
      const m = measure(input(trial));
      if (levelRank(levelOf(setup.sub, m.stats)) > levelRank(target)) continue;
    }
    cur = trial;
  }
  if (cur.length > maxClues) return null;
  const m = measure(input(cur));
  if (m.count !== 1 || !m.tree) return null;
  return { clues: cur.map((c) => c.clue), level: levelOf(setup.sub, m.stats), stats: m.stats, tree: m.tree };
}
