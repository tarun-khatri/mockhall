/**
 * Puzzle construction (build backward):
 *  1. hidden arrangement (names, seats, facings, attributes);
 *  2. pool of true clues in exam styles (pool.ts);
 *  3. counterexample-guided selection — while the solver finds a second arrangement, add a clue (weighted by
 *     the level's style) that the second arrangement breaks;
 *  4. minimise (drop clues the solution does not need);
 *  5. measure difficulty with the human-path simulation and keep the set only if the measured level matches.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty } from '../../../types';
import { FALSE, IN, NORTH, OUT, SOUTH, TRUE, Evaluator, clueEntities, isRing, type Clue, type FaceCode, type Layout } from '../../solver/seating/model';
import { sameSolution, solve, uncertainBound, type Puzzle, type Solution } from '../../solver/seating/solve';
import { simulate, type HpsResult } from '../../solver/seating/hps';
import { LEVELS, levelFromSplits, type Family, type FacingKey, type LevelCfg, type SubtypeId, type Weights } from './config';
import { buildPool, stateOf, type Cand, type ClueItem } from './pool';
import { pickAttrs, pickNames, pickRowNames, type AttrCat } from './names';

export interface Built {
  subtype: SubtypeId;
  difficulty: Difficulty;
  /** uncertain rows: len = the proven upper bound on N */
  layout: Layout;
  facingKey: FacingKey;
  names: string[];
  attrCat?: AttrCat;
  attrValues: string[];
  /** parallel rows: the intro states who sits in which row */
  membership: boolean;
  given: Clue[];
  clues: ClueItem[];
  /** the unique arrangement (solver-normalised) */
  truth: Solution;
  hps: HpsResult;
  nRange?: [number, number];
}

export function makeLayout(subtype: SubtypeId, key: FacingKey, size: number): Layout {
  switch (subtype) {
    case 'linear-single':
      return { kind: 'row', len: size, facing: key === 'mixed' ? { kind: 'mixed' } : { kind: 'all', face: key === 'south' ? SOUTH : NORTH } };
    case 'linear-parallel':
      return { kind: 'parallel', len: size, facing: key === 'facing' ? { kind: 'rows', row1: SOUTH, row2: NORTH } : { kind: 'rows', row1: NORTH, row2: NORTH } };
    case 'linear-uncertain':
      return { kind: 'uncertain', len: size, facing: { kind: 'all', face: NORTH } };
    case 'circular-inside':
      return { kind: 'circle', len: size, facing: { kind: 'all', face: IN } };
    case 'circular-mixed':
      return { kind: 'circle', len: size, facing: { kind: 'mixed' } };
    case 'square':
      return {
        kind: 'square',
        len: 8,
        facing:
          key === 'mixed'
            ? { kind: 'mixed' }
            : key === 'all-in'
              ? { kind: 'all', face: IN }
              : key === 'cout-min'
                ? { kind: 'square', corner: OUT, middle: IN }
                : { kind: 'square', corner: IN, middle: OUT },
      };
  }
}

function randomFaces(rng: Rng, layout: Layout, seats: number, persons: number): number[] {
  const face = new Array<number>(seats).fill(0);
  const f = layout.facing;
  if (f.kind !== 'mixed') {
    for (let s = 0; s < seats; s++) {
      face[s] = f.kind === 'all' ? f.face : f.kind === 'rows' ? (s < layout.len ? f.row1 : f.row2) : s % 2 === 0 ? f.corner : f.middle;
    }
    return face;
  }
  const [a, b]: FaceCode[] = isRing(layout) ? [IN, OUT] : [NORTH, SOUTH];
  const lo = Math.ceil(persons / 3);
  const hi = Math.floor((2 * persons) / 3);
  const countA = rng.int(lo, hi);
  const order = rng.shuffle(Array.from({ length: seats }, (_, i) => i));
  order.forEach((s, i) => (face[s] = i < countA ? a : b));
  return face;
}

export function equivalent(layout: Layout, a: Solution, b: Solution, persons: number, attrs: number): boolean {
  if (!isRing(layout)) return sameSolution(a, b, persons, attrs);
  const n = layout.len;
  const shift = (b.seatOf[0] - a.seatOf[0] + n) % n;
  if (layout.kind === 'square' && shift % 2 === 1) return false;
  for (let e = 0; e < persons + attrs; e++) if ((a.seatOf[e] + shift) % n !== b.seatOf[e]) return false;
  for (let e = 0; e < persons; e++) if (a.face[a.seatOf[e]] !== b.face[b.seatOf[e]]) return false;
  return true;
}

function pickWeighted(rng: Rng, cands: readonly Cand[], weights: Weights): Cand | null {
  if (!cands.length) return null;
  return rng.weighted(cands.map((c) => [c, Math.max(weights[c.family] ?? 0, 0.03)] as const));
}

interface Check {
  complete: boolean;
  unique: boolean;
  /** uncertain rows: N not provably bounded yet */
  unbounded: boolean;
  other?: Solution;
  sol?: Solution;
  bound: number;
}

const NEG_FORMS = new Set(['nadj', 'nnadj', 'nend', 'nnend', 'nis', 'nface', 'ncorner']);

/** How much a clue family pins down on its own (minimisation drops strong redundant clues first). */
const STRENGTH: Record<Family, number> = {
  compound: 9,
  abs: 8,
  rel: 7,
  relCount: 7,
  uncert: 6,
  opp: 6,
  attr: 5,
  face: 5,
  faceRel: 4,
  asMany: 3,
  gap: 3,
  rowRel: 2,
  adj: 2,
  end: 2,
  neg: 1,
};

export function isNegative(c: ClueItem): boolean {
  return NEG_FORMS.has(c.form) || c.atoms.some((a) => ('neg' in a && a.neg) || (a.t === 'sameFace' && !a.same) || (a.t === 'sameRow' && !a.same));
}

export interface Attempt {
  built?: Built;
  reason?: string;
  /** diagnostics for rejected attempts */
  splits?: number;
  clueCount?: number;
}

/** One construction attempt. */
export function attempt(rng: Rng, subtype: SubtypeId, difficulty: Difficulty): Attempt {
  const cfg: LevelCfg | undefined = LEVELS[subtype][difficulty];
  if (!cfg) throw new Error(`seating: ${subtype} has no ${difficulty} level`);
  const facingKey = rng.weighted(cfg.facings.map(([k, w]) => [k, w] as const));
  const size = rng.pick(cfg.sizes);
  const layout = makeLayout(subtype, facingKey, size);
  const uncertain = layout.kind === 'uncertain';
  const parallel = layout.kind === 'parallel';

  // names
  let names: string[];
  let membership = false;
  if (parallel) {
    const [r1, r2] = pickRowNames(rng, size);
    names = [...r1, ...r2];
    membership = rng.chance(cfg.membership ?? 0);
  } else names = pickNames(rng, size);
  const P = names.length;
  const A = cfg.attrs ? P : 0;
  const attr = A ? pickAttrs(rng, A, names) : undefined;

  // hidden arrangement
  const N = uncertain ? P + rng.int(cfg.extra![0], cfg.extra![1]) : 0;
  const seats = uncertain ? N : parallel ? 2 * size : size;
  const seatOf = new Array<number>(P + A).fill(-1);
  if (parallel && membership) {
    const r1 = rng.shuffle(Array.from({ length: size }, (_, i) => i));
    const r2 = rng.shuffle(Array.from({ length: size }, (_, i) => size + i));
    for (let i = 0; i < size; i++) {
      seatOf[i] = r1[i];
      seatOf[size + i] = r2[i];
    }
  } else if (uncertain) {
    const pos = rng.sample(Array.from({ length: N }, (_, i) => i), P);
    pos.forEach((s, i) => (seatOf[i] = s));
  } else {
    rng.shuffle(Array.from({ length: seats }, (_, i) => i)).forEach((s, i) => (seatOf[i] = s));
  }
  if (A) rng.shuffle(Array.from({ length: seats }, (_, i) => i)).forEach((s, i) => (seatOf[P + i] = s));
  const truth0: Solution = { seatOf, face: randomFaces(rng, layout, seats, P), n: uncertain ? N : seats };

  const given: Clue[] = membership ? names.map((_, i) => [{ t: 'row', a: { t: 'e', e: i }, row: i < size ? 0 : 1 }]) : [];
  const poolLayout: Layout = uncertain ? { ...layout, len: N } : layout;
  const pool = buildPool({ layout: poolLayout, persons: P, attrs: A, truth: truth0, rng, membership });

  const puzzleFor = (clues: Clue[], hi: number): Puzzle => ({
    layout: uncertain ? { ...layout, len: hi } : layout,
    persons: P,
    attrs: A,
    given,
    clues,
    ...(uncertain ? { nRange: [P, hi] as [number, number] } : {}),
  });
  const budget = cfg.attrs ? 600_000 : 250_000;
  const check = (chosen: readonly Cand[]): Check => {
    const clues = chosen.map((c) => c.atoms);
    let bound = Infinity;
    let hi = 0;
    if (uncertain) {
      bound = uncertainBound(P, clues);
      hi = Number.isFinite(bound) ? Math.min(bound, N + 25) : N + 8;
      if (Number.isFinite(bound) && bound > N + 25) bound = Infinity; // too loose to search: keep adding clues
    }
    const res = solve(puzzleFor(clues, hi), 2, budget);
    if (!res.complete) return { complete: false, unique: false, unbounded: false, bound };
    const others = res.solutions.filter((s) => !equivalent(layout, s, truth0, P, A));
    const found = res.solutions.find((s) => equivalent(layout, s, truth0, P, A));
    if (!res.solutions.length || (res.solutions.length === 1 && !found)) throw new Error('seating: hidden arrangement violates its own clues');
    return {
      complete: true,
      unique: res.solutions.length === 1,
      unbounded: uncertain && !Number.isFinite(bound),
      other: others[0],
      sol: found,
      bound,
    };
  };
  const evalOn = (sol: Solution, c: Cand) => new Evaluator(uncertain ? { ...layout, len: sol.n } : layout, stateOf(sol)).clue(c.atoms);

  let chosen: Cand[] = [];
  const absCount = () => chosen.filter((c) => c.family === 'abs').length;
  const choose = (cands: Cand[]): Cand | null => {
    const allowed = cands.filter((c) => c.family !== 'abs' || absCount() < cfg.maxAbs);
    return pickWeighted(rng, allowed.length ? allowed : cands, cfg.weights);
  };
  const first = choose(pool);
  if (!first) return { reason: 'empty pool' };
  chosen.push(first);
  let chk = check(chosen);
  for (let iter = 0; iter < 90; iter++) {
    if (!chk.complete) return { reason: 'budget' };
    if (chk.unique && !chk.unbounded) break;
    let cands: Cand[];
    if (chk.other) {
      const other = chk.other;
      cands = pool.filter((c) => !chosen.includes(c) && evalOn(other, c) === FALSE);
    } else cands = pool.filter((c) => !chosen.includes(c) && (c.family === 'uncert' || c.family === 'abs' || c.form === 'end' || c.form === 'endSide'));
    const c = choose(cands);
    if (!c) return { reason: 'no distinguishing clue' };
    chosen.push(c);
    chk = check(chosen);
  }
  if (!chk.complete || !chk.unique || chk.unbounded) return { reason: 'not unique' };

  // minimise: try dropping the strongest clues first so the set keeps more of the everyday (weaker) clues
  const removed: Cand[] = [];
  const order = rng.shuffle(chosen.slice());
  if (difficulty !== 'easy') order.sort((x, y) => STRENGTH[y.family] - STRENGTH[x.family]);
  for (const c of order) {
    const without = chosen.filter((x) => x !== c);
    const w = check(without);
    if (w.complete && w.unique && !w.unbounded) {
      chosen = without;
      removed.push(c);
    }
  }
  // easy sets keep one extra direct clue so the start is obvious
  for (let k = 0; k < (cfg.keepExtra ?? 0); k++) {
    const extra = removed.filter((c) => c.family === 'rel' || c.family === 'abs' || c.family === 'face' || c.family === 'opp');
    if (extra.length && rng.chance(0.6)) chosen.push(rng.pick(extra));
  }
  const fin = check(chosen);
  if (!fin.complete || !fin.unique || fin.unbounded || !fin.sol) return { reason: 'final not unique' };

  // style checks
  if (chosen.length < cfg.clueRange[0] || chosen.length > cfg.clueRange[1]) return { reason: `clue count ${chosen.length}` };
  const negs = chosen.filter((c) => isNegative(c)).length;
  if (negs < cfg.minNeg) return { reason: 'too few negative clues' };
  const mentioned = new Set<number>();
  for (const c of chosen) for (const e of clueEntities(c.atoms)) mentioned.add(e);
  const silentPersons = names.filter((_, i) => !mentioned.has(i)).length;
  const silentAttrs = A ? Array.from({ length: A }, (_, i) => P + i).filter((e) => !mentioned.has(e)).length : 0;
  // one person may be placed by elimination (parallel rows with listed members: one per row)
  if (silentPersons > (parallel && membership ? 2 : 1) || silentAttrs > 1) return { reason: 'someone never mentioned' };

  const clues = rng.shuffle(chosen).map((c) => ({ form: c.form, atoms: c.atoms }));
  const hi = uncertain ? fin.bound : 0;
  const puzzle = puzzleFor(
    clues.map((c) => c.atoms),
    hi,
  );
  const hps = simulate(puzzle);
  if (!hps.ok || !hps.solution) return { reason: 'human path failed' };
  const hSol: Solution = hps.solution;
  if (!equivalent(layout, hSol, fin.sol, P, A)) throw new Error('seating: human path disagrees with the solver');
  const splits = hps.splits;
  if (splits < cfg.band[0] || splits > cfg.band[1] || levelFromSplits(splits) !== difficulty) return { reason: `splits ${splits}`, splits, clueCount: clues.length };

  // canonical truth = the human path's final arrangement (rings: first placed person on top)
  const truth = hSol;
  const ev = new Evaluator(uncertain ? { ...layout, len: truth.n } : layout, stateOf(truth));
  for (const c of clues) if (ev.clue(c.atoms) !== TRUE) throw new Error('seating: canonical arrangement breaks a clue');
  return {
    built: {
      subtype,
      difficulty,
      layout: uncertain ? { ...layout, len: hi } : layout,
      facingKey,
      names,
      ...(attr ? { attrCat: attr.cat } : {}),
      attrValues: attr?.values ?? [],
      membership,
      given,
      clues,
      truth,
      hps,
      ...(uncertain ? { nRange: [P, hi] as [number, number] } : {}),
    },
  };
}

export interface BuildStats {
  attempts: number;
  reasons: Record<string, number>;
}

/** Keep constructing until a set of the requested level comes out (deterministic in the rng). */
export function buildPuzzle(rng: Rng, subtype: SubtypeId, difficulty: Difficulty, maxAttempts = 400, stats?: BuildStats): Built {
  for (let i = 0; i < maxAttempts; i++) {
    const r = attempt(rng.fork(`a${i}`), subtype, difficulty);
    if (stats) {
      stats.attempts++;
      if (r.reason) stats.reasons[r.reason.split(' ')[0]] = (stats.reasons[r.reason.split(' ')[0]] ?? 0) + 1;
    }
    if (r.built) return r.built;
  }
  throw new Error(`seating: could not build ${subtype}/${difficulty} in ${maxAttempts} attempts`);
}
