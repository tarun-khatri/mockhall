/**
 * R9 Puzzles (SPEC 8.2): floor, floor × flat, box stack, day-based, month-based, comparison (3-Q mini puzzle) and
 * scheduling. Built backward: hidden arrangement → pool of true clues → clues added until the solver finds exactly
 * one arrangement → redundant clues dropped → difficulty MEASURED by the human-model solver (dead cases, see
 * puzzles/difficulty.ts) and kept only when it equals the target. Every answer is read off the unique arrangement.
 * The app serves pre-generated banks (scripts/banks/puzzles.ts); this generator also runs at build time and in tests.
 */
import { defineGenerator, type BuildContext, type SubtypeDef } from '../types';
import { makeSet } from '../shared/question';
import { setTargetSeconds } from '../../targets';
import type { Difficulty } from '../../types';
import type { Rng } from '../../../lib/rng';
import type { Clue, Layout } from '../solver/puzzles/model';
import { measure, solve } from '../solver/puzzles/csp';
import { makeSetup, type Cat, type Labels, type Setup, type SubtypeId } from './puzzles/setup';
import { cluePool, familyOf, randomTruth, selectClues, solverInput, type Selection } from './puzzles/clues';
import { levelRank } from './puzzles/difficulty';
import { Renderer } from './puzzles/render';
import { Explainer } from './puzzles/explain';
import { buildQuestion, World, type NearWorld, type QOut, type QSpec } from './puzzles/questions';

export interface PuzzlesFacts {
  sub: SubtypeId;
  layout: Layout;
  names: string[];
  cats: Cat[];
  labels: Labels;
  /** Structured clues, in stimulus order (clue i is line i + 1). */
  clues: Clue[];
  /** Structured question specs, in item order. */
  questions: QSpec[];
  /** Measured human-model difficulty: dead cases and case splits. */
  measured: { dead: number; splits: number };
}

export const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'floor', label: 'Floor puzzle', weight: 1 },
  { id: 'floor-flat', label: 'Floor & flat', weight: 1 },
  { id: 'box', label: 'Box stack', weight: 1.4 },
  { id: 'day', label: 'Day-based', weight: 1 },
  { id: 'month', label: 'Month-based', weight: 1.3 },
  { id: 'comparison', label: 'Comparison (3 Q)', weight: 1.1 },
  { id: 'scheduling', label: 'Scheduling', weight: 0.6, difficulties: ['hard', 'extreme'] },
];

const TITLE: Record<SubtypeId, string> = {
  floor: 'Floor puzzle',
  'floor-flat': 'Floor and flat puzzle',
  box: 'Box puzzle',
  day: 'Day-based puzzle',
  month: 'Month-based puzzle',
  comparison: 'Comparison',
  scheduling: 'Scheduling puzzle',
};

const MAX_CLUES: Record<Difficulty, number> = { easy: 10, medium: 12, hard: 15, extreme: 18 };

interface Candidate {
  setup: Setup;
  truth: number[];
  values?: number[];
  sel: Selection;
}

/** Comparison: values rise with rank; value clues planned so that a "possible value" question exists. */
function comparisonValues(setup: Setup, truth: number[], rng: Rng): { values: number[]; fixed: Clue[] } {
  const N = setup.layout.persons;
  const weight = setup.labels.measure === 'weight';
  const values: number[] = [];
  let v = weight ? rng.int(40, 52) : rng.int(146, 156);
  for (let s = 0; s < N; s++) {
    values.push(v);
    v += weight ? rng.int(3, 6) : rng.int(3, 7);
  }
  const fixed: Clue[] = [];
  const d = setup.difficulty;
  if (d === 'easy') return { values, fixed };
  const personAt = new Array<number>(N);
  for (let p = 0; p < N; p++) personAt[truth[p]] = p;
  // a low anchor and a high anchor with at least one person strictly between
  const lo = rng.int(0, N - 3);
  const hi = rng.int(lo + 2, N - 1);
  const useRank = rng.chance(0.5);
  fixed.push(useRank ? { k: 'rval', s: hi, v: values[hi] } : { k: 'val', e: personAt[hi], v: values[hi] });
  fixed.push(useRank ? { k: 'val', e: personAt[lo], v: values[lo] } : { k: 'rval', s: lo, v: values[lo] });
  return { values, fixed };
}

/** Ladder flavour: hard needs a negative clue plus a count-equality/quantified one (where the layout has them). */
function flavourOk(d: Difficulty, clues: Clue[], layout: Layout): boolean {
  const fams = clues.map(familyOf);
  const hasCounts = layout.kind !== 'flat' && layout.kind !== 'session';
  const neg = fams.filter((f) => f === 'neg').length;
  const cnt = fams.filter((f) => f === 'eq' || f === 'unc').length;
  if (d === 'hard') return neg >= 1 && (!hasCounts || cnt >= 1);
  if (d === 'extreme') return neg + cnt >= 3 && (!hasCounts || cnt >= 1);
  if (d === 'medium') return clues.length >= 5;
  return true;
}

function tryCandidate(sub: SubtypeId, d: Difficulty, rng: Rng): Candidate | null {
  const setup = makeSetup(sub, d, rng);
  const truth = randomTruth(setup, rng);
  let values: number[] | undefined;
  let fixed: Clue[] = [];
  if (sub === 'comparison') ({ values, fixed } = comparisonValues(setup, truth, rng));
  const pool = cluePool(setup, truth, rng);
  const sel = selectClues(setup, pool, rng, MAX_CLUES[d] + (sub === 'comparison' ? -2 : 0), fixed);
  if (!sel) return null;
  return { setup, truth, values, sel };
}

/** Arrangements that satisfy every clue but one: the answers a candidate gets by overlooking that clue. */
function nearWorlds(setup: Setup, clues: Clue[], truth: number[]): NearWorld[] {
  const out: NearWorld[] = [];
  const key = truth.join(',');
  clues.forEach((_, i) => {
    const rest = clues.filter((__, j) => j !== i);
    const res = solve(solverInput(setup, rest), { limit: 3, nodeCap: 4000 });
    for (const s of res.solutions) if (s.join(',') !== key && out.length < 24) out.push({ w: new World(setup.layout, s), clue: i });
  });
  return out;
}

/** Is the question answered verbatim by a clue? (Real papers do not ask what a clue states.) */
function trivial(spec: QSpec, clues: Clue[], P: number): boolean {
  return clues.some((c) => {
    switch (spec.q) {
      case 'who-at':
        return c.k === 'is' && c.p.t === 'slot' && c.p.s === spec.s && c.e < P;
      case 'pos-of':
        return c.k === 'is' && c.p.t === 'slot' && c.e === spec.e;
      case 'attr-of':
        return c.k === 'link' && ((c.a === spec.p && Math.floor(c.b / P) === spec.k) || (c.b === spec.p && Math.floor(c.a / P) === spec.k));
      case 'count-between':
        return (c.k === 'gap' || c.k === 'delta') && ((c.a === spec.a && c.b === spec.b) || (c.a === spec.b && c.b === spec.a));
      case 'who-rel':
        return c.k === 'delta' && c.d === 1 && (c.a === spec.e || c.b === spec.e);
      case 'count-dir':
        return c.k === 'count' && c.e === spec.e;
      default:
        return false;
    }
  });
}

function pickQuestions(ctx: { r: Renderer; x: Explainer; clues: Clue[]; truth: World; near: NearWorld[]; rng: Rng; values?: number[] }): QOut[] {
  const { r, truth, rng, clues } = ctx;
  const L = r.L;
  const P = truth.P;
  const E = truth.slot.length;
  const rp = () => rng.int(0, P - 1);
  const re = () => rng.int(0, E - 1);
  const gens: Record<string, () => QSpec> = {
    'who-at': () => ({ q: 'who-at', s: truth.slot[rp()] }),
    'who-rel': () => ({ q: 'who-rel', e: re(), d: rng.pick([1, -1] as const) }),
    'who-vert': () => ({ q: 'who-vert', e: re(), d: rng.pick([1, -1] as const) }),
    'who-side': () => ({ q: 'who-side', e: re(), east: rng.chance(0.5) }),
    'pos-of': () => ({ q: 'pos-of', e: rng.chance(0.7) ? rp() : re() }),
    'count-between': () => ({ q: 'count-between', a: re(), b: re() }),
    'count-dir': () => ({ q: 'count-dir', e: re(), dir: rng.pick([1, -1] as const) }),
    'attr-of': () => ({ q: 'attr-of', p: rp(), k: rng.int(1, Math.max(1, r.setup.cats.length)) }),
    odd: () => ({ q: 'odd' }),
    'true-stmt': () => ({ q: 'true-stmt' }),
    combo: () => ({ q: 'combo' }),
    alpha: () => ({ q: 'alpha' }),
    'possible-value': () => ({ q: 'possible-value', e: rp() }),
  };
  let plan: string[][];
  if (L.kind === 'rank') plan = [['who-at'], ['count-dir', 'possible-value'], ['possible-value', 'true-stmt', 'alpha', 'count-dir']];
  else {
    const neighbour = L.kind === 'flat' ? ['who-vert', 'who-side'] : L.kind === 'month' ? ['who-at'] : ['who-rel', 'who-at'];
    const counting = L.kind === 'flat' ? ['pos-of', 'who-at'] : ['count-between', 'count-dir'];
    const fifth = ['pos-of', 'alpha', 'count-dir', 'who-at', ...(r.setup.cats.length ? ['attr-of', 'attr-of'] : [])];
    plan = [rng.shuffle(neighbour), rng.shuffle(counting), ['odd', 'true-stmt'], r.setup.cats.length && rng.chance(0.5) ? ['combo', 'true-stmt'] : ['true-stmt', 'combo', 'pos-of'], rng.shuffle(fifth)];
  }
  const out: QOut[] = [];
  const kinds = new Set<string>();
  for (const slot of plan) {
    let done = false;
    for (const kind of slot) {
      if (done) break;
      if (kinds.has(kind) && kind !== 'who-at' && kind !== 'count-dir') continue;
      for (let t = 0; t < 12 && !done; t++) {
        const spec = gens[kind]();
        if (trivial(spec, clues, P)) continue;
        const q = buildQuestion(ctx, spec);
        if (!q || out.some((o) => o.prompt === q.prompt)) continue;
        out.push(q);
        kinds.add(kind);
        done = true;
      }
    }
  }
  return out;
}

function build(ctx: BuildContext) {
  const sub = ctx.subtype.id as SubtypeId;
  const d = ctx.difficulty;
  let best: Candidate | null = null;
  let chosen: Candidate | null = null;
  const nQ = sub === 'comparison' ? 3 : 5;
  for (let i = 0; i < 400 && !chosen; i++) {
    const rng = ctx.rng.fork(`a${i}`);
    const cand = tryCandidate(sub, d, rng);
    if (!cand) continue;
    const ok = cand.sel.level === d && flavourOk(d, cand.sel.clues, cand.setup.layout);
    if (!best || Math.abs(levelRank(cand.sel.level) - levelRank(d)) < Math.abs(levelRank(best.sel.level) - levelRank(d))) best = cand;
    if (!ok) continue;
    const built = assemble(ctx, cand, rng.fork('q'), nQ);
    if (built) return built;
  }
  // Fallback (never expected): nearest measured level found.
  for (let i = 0; best && i < 5; i++) {
    const built = assemble(ctx, best, ctx.rng.fork(`fb${i}`), nQ);
    if (built) return built;
  }
  throw new Error(`reasoning.puzzles: could not build ${sub}/${d} for seed ${ctx.seed}`);
}

function assemble(ctx: BuildContext, cand: Candidate, rng: Rng, nQ: number) {
  const { setup, truth, values, sel } = cand;
  const clues = rng.shuffle(sel.clues);
  const r = new Renderer(setup);
  const trace = solve(solverInput(setup, clues), { limit: 2 });
  if (trace.count !== 1) return null;
  // human-model trace with the final clue order (numbering)
  const m = selectTrace(setup, clues);
  const x = new Explainer(r, clues);
  const world = new World(setup.layout, truth);
  const near = nearWorlds(setup, clues, truth);
  const qs = pickQuestions({ r, x, clues, truth: world, near, rng, values });
  if (qs.length < nQ) return null;
  const lines = clues.map((c) => r.clueText(c, rng));
  const steps = [...x.steps(m), x.finalLine(truth)];
  const direct = x.directClues(m);
  const setShortcut = direct.length
    ? `Start with clue${direct.length > 1 ? 's' : ''} ${direct.map((i) => i + 1).join(', ')} — ${direct.length > 1 ? 'they fix' : 'it fixes'} a position outright — then work outwards through the clues that mention whoever is already placed.`
    : 'No clue fixes a position outright: start with the clue that leaves the fewest cases, write each case down and let the remaining clues kill the wrong ones.';
  const visual = r.visual(truth, values);
  const d = ctx.difficulty;
  const item = makeSet(
    ctx.meta,
    ctx.seed,
    {
      kind: 'puzzle',
      subtype: setup.sub,
      difficulty: d,
      title: TITLE[setup.sub],
      stimulus: r.stimulus(lines),
      targetSeconds: setTargetSeconds('puzzle-set', d, nQ),
      questions: qs.slice(0, nQ).map((q) => ({
        prompt: q.prompt,
        options: q.options,
        answerIndex: q.answerIndex,
        solution: { steps: [...steps, ...q.steps], shortcut: q.shortcut ?? setShortcut, ...(q.trap ? { trap: q.trap } : {}), visual },
        tags: [...q.tags, `puzzle:level-${d}`],
      })),
    },
    { method: 'solver-unique' },
  );
  const facts: PuzzlesFacts = {
    sub: setup.sub,
    layout: setup.layout,
    names: setup.names,
    cats: setup.cats,
    labels: setup.labels,
    clues,
    questions: qs.slice(0, nQ).map((q) => q.spec),
    measured: { dead: sel.stats.dead, splits: sel.stats.splits },
  };
  return { item, facts };
}

function selectTrace(setup: Setup, clues: Clue[]) {
  const m = measure(solverInput(setup, clues));
  return m.tree!;
}

export const generator = defineGenerator<PuzzlesFacts>({ name: 'reasoning.puzzles', version: 1, subject: 'reasoning', chapter: 'puzzles' }, SUBTYPES, build);
