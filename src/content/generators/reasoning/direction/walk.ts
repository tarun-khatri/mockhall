/**
 * Coordinate walks: a person walks a chain of legs with left/right/back turns (or named directions);
 * asked the shortest distance / direction from the start (or of the start from the end).
 * Built backward: the final displacement (a Pythagorean triple, an axis distance or a clean surd) is chosen
 * first, then a heading sequence, then leg lengths that add up to it.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty, Rich, VisualSpec } from '../../../types';
import type { QuestionDraft } from '../../shared/question';
import { shuffleChoices, type Mistake } from '../../shared/options';
import { targetSeconds } from '../../../targets';
import {
  DIR_NAME,
  VEC,
  dirOfVector,
  dirWord,
  distPlain,
  distTex,
  distanceChoices,
  directionChoices,
  he,
  He,
  his,
  person,
  PLACES_F,
  PLACES_M,
  sqrtStep,
  type Dir4,
  type Dir8,
  type DistDisplay,
  type Person,
} from './geo';

export type LegTurn = { t: 'left' } | { t: 'right' } | { t: 'back' } | { t: 'abs'; dir: Dir4 };
export interface WalkLeg {
  /** Absent on the first leg (its heading is `first`). */
  turn?: LegTurn;
  length: number;
}
export type WalkAsk = 'distance' | 'direction' | 'both' | 'start-from-end';

export interface WalkFacts {
  kind: 'walk';
  first: Dir4;
  legs: WalkLeg[];
  ask: WalkAsk;
  display: DistDisplay;
}

const LEFT: Record<Dir4, Dir4> = { N: 'W', W: 'S', S: 'E', E: 'N' };
const RIGHT: Record<Dir4, Dir4> = { N: 'E', E: 'S', S: 'W', W: 'N' };
const BACK: Record<Dir4, Dir4> = { N: 'S', S: 'N', E: 'W', W: 'E' };

export function applyTurn(h: Dir4, t: LegTurn): Dir4 {
  switch (t.t) {
    case 'left':
      return LEFT[h];
    case 'right':
      return RIGHT[h];
    case 'back':
      return BACK[h];
    case 'abs':
      return t.dir;
  }
}

/** Walk the legs; returns the points after each leg (start first). */
export function walkPoints(first: Dir4, legs: readonly WalkLeg[]): { x: number; y: number }[] {
  const pts = [{ x: 0, y: 0 }];
  let h = first;
  legs.forEach((leg, i) => {
    if (i > 0 && leg.turn) h = applyTurn(h, leg.turn);
    const [vx, vy] = VEC[h];
    const p = pts[pts.length - 1];
    pts.push({ x: p.x + vx * leg.length, y: p.y + vy * leg.length });
  });
  return pts;
}

/** Target displacements by difficulty: [|dx|, |dy|] pairs (unordered). */
function targets(d: Difficulty): [number, number][] {
  const trip = (a: number, b: number, ks: number[]) => ks.map((k) => [a * k, b * k] as [number, number]);
  switch (d) {
    case 'easy':
      return [[0, 10], [0, 15], [0, 20], [0, 25], [0, 30], ...trip(3, 4, [2, 3, 5]), [5, 5], [10, 10]];
    case 'medium':
      return [...trip(3, 4, [2, 3, 4, 5, 6]), ...trip(5, 12, [1, 2]), ...trip(8, 15, [1]), [5, 5], [10, 10], [15, 15], [20, 20], [0, 18], [0, 35]];
    case 'hard':
      return [...trip(3, 4, [3, 5, 7]), ...trip(5, 12, [1, 2]), ...trip(8, 15, [1, 2]), ...trip(7, 24, [1]), ...trip(20, 21, [1]), [10, 15], [10, 20], [6, 9], [12, 18], [15, 15], [9, 9]];
    case 'extreme':
      return [...trip(5, 12, [2, 3]), ...trip(8, 15, [2]), ...trip(7, 24, [1, 2]), ...trip(20, 21, [1]), ...trip(9, 40, [1]), [12, 20], [14, 21], [10, 25], [16, 12], [18, 18], [11, 13]];
  }
}

const LEGS: Record<Difficulty, [number, number]> = { easy: [3, 3], medium: [4, 5], hard: [5, 6], extreme: [6, 8] };
const UNIT: Record<Difficulty, number> = { easy: 5, medium: 1, hard: 1, extreme: 1 };
const LEN: Record<Difficulty, [number, number]> = { easy: [5, 30], medium: [3, 30], hard: [2, 30], extreme: [2, 40] };

function headings(rng: Rng, d: Difficulty, n: number): { first: Dir4; turns: LegTurn[]; hs: Dir4[] } {
  const first = rng.pick(['N', 'E', 'S', 'W'] as const);
  const turns: LegTurn[] = [];
  const hs: Dir4[] = [first];
  for (let i = 1; i < n; i++) {
    const cur = hs[i - 1];
    let t: LegTurn;
    const r = rng.next();
    if ((d === 'hard' || d === 'extreme') && r < 0.12 && i < n - 1) t = { t: 'back' };
    else if (d !== 'easy' && r < 0.3) t = { t: 'abs', dir: rng.pick(cur === 'N' || cur === 'S' ? (['E', 'W'] as const) : (['N', 'S'] as const)) };
    else t = { t: rng.chance(0.5) ? 'left' : 'right' };
    turns.push(t);
    hs.push(applyTurn(cur, t));
  }
  return { first, turns, hs };
}

/** Lengths for legs on one axis summing (with signs) to `target`; null when impossible. */
function splitAxis(rng: Rng, signs: number[], target: number, d: Difficulty): number[] | null {
  const [lo, hi] = LEN[d];
  const u = UNIT[d];
  if (!signs.length) return target === 0 ? [] : null;
  for (let tries = 0; tries < 200; tries++) {
    const lens: number[] = [];
    let sum = 0;
    for (let i = 0; i < signs.length - 1; i++) {
      const l = rng.int(Math.ceil(lo / u), Math.floor(hi / u)) * u;
      lens.push(l);
      sum += signs[i] * l;
    }
    const last = signs[signs.length - 1] * (target - sum);
    if (last >= lo && last <= hi && last % u === 0) return [...lens, last];
  }
  return null;
}

export function buildWalk(rng: Rng, d: Difficulty): { facts: WalkFacts; draft: Omit<QuestionDraft, 'subtype' | 'difficulty'> } {
  for (let attempt = 0; attempt < 400; attempt++) {
    const [p, q] = rng.pick(targets(d));
    const swap = rng.chance(0.5);
    const dx = (swap ? q : p) * (rng.chance(0.5) ? 1 : -1);
    const dy = (swap ? p : q) * (rng.chance(0.5) ? 1 : -1);
    const n = rng.int(...LEGS[d]);
    const { first, turns, hs } = headings(rng, d, n);
    const xSigns = hs.map((h) => (h === 'E' ? 1 : h === 'W' ? -1 : 0));
    const ySigns = hs.map((h) => (h === 'N' ? 1 : h === 'S' ? -1 : 0));
    const xs = splitAxis(
      rng,
      xSigns.filter((s) => s),
      dx,
      d,
    );
    const ys = splitAxis(
      rng,
      ySigns.filter((s) => s),
      dy,
      d,
    );
    if (!xs || !ys) continue;
    let xi = 0;
    let yi = 0;
    const legs: WalkLeg[] = hs.map((h, i) => ({ ...(i ? { turn: turns[i - 1] } : {}), length: h === 'E' || h === 'W' ? xs[xi++] : ys[yi++] }));
    const pts = walkPoints(first, legs);
    const end = pts[pts.length - 1];
    if (end.x !== dx || end.y !== dy) throw new Error('walk: construction mismatch');
    // no leg may end exactly at the start, and points should not repeat
    if (pts.slice(1).some((pt) => pt.x === 0 && pt.y === 0)) continue;
    if (new Set(pts.map((pt) => `${pt.x},${pt.y}`)).size !== pts.length) continue;
    const ask: WalkAsk =
      dx === 0 || dy === 0
        ? rng.pick(['distance', 'direction', 'both'] as const)
        : d === 'easy'
          ? rng.pick(['distance', 'direction'] as const)
          : d === 'extreme'
            ? rng.pick(['both', 'start-from-end', 'distance'] as const)
            : rng.pick(['distance', 'direction', 'both', 'start-from-end'] as const);
    if ((ask === 'direction' || ask === 'start-from-end') && (dx === 0 || dy === 0) && d !== 'easy' && rng.chance(0.5)) continue;
    const display: DistDisplay = d === 'extreme' && rng.chance(0.4) ? 'raw' : 'simple';
    const who = person(rng);
    return { facts: { kind: 'walk', first, legs, ask, display }, draft: render(rng, d, who, first, legs, pts, ask, display) };
  }
  throw new Error('walk: could not build');
}

const TRIPLES: [number, number, number][] = [
  [3, 4, 5],
  [5, 12, 13],
  [8, 15, 17],
  [7, 24, 25],
  [20, 21, 29],
  [9, 40, 41],
];

/** "use the 3-4-5 triple (×5)" / "equal legs give a√2" / plain Pythagoras. */
export function pythagorasHint(ax: number, ay: number): string {
  const [a, b] = ax <= ay ? [ax, ay] : [ay, ax];
  if (a === b) return `equal legs of ${a} m give ${a}√2 m directly`;
  for (const [p, q, r] of TRIPLES) {
    if (a * q === b * p) {
      const k = a / p;
      return k === 1 ? `recognise the ${p}-${q}-${r} triple` : `recognise the ${p}-${q}-${r} triple (× ${k}) → ${r * k} m`;
    }
  }
  return 'apply Pythagoras on the two net legs';
}

const CONNECT = ['Then', 'After that,', 'From there,', 'Next,'];

function legSentence(p: Person, leg: WalkLeg, i: number, total: number, rng: Rng): string {
  const lead = i === total - 1 ? 'Finally,' : rng.pick(CONNECT);
  const t = leg.turn!;
  const subj = lead === 'Then' ? `${lead} ${he(p)}` : `${lead} ${he(p)}`;
  if (t.t === 'abs') return `${subj} turns towards the ${dirWord(t.dir)} and walks ${leg.length} m.`;
  if (t.t === 'back') return `${subj} turns back and walks ${leg.length} m.`;
  return rng.chance(0.5) ? `${subj} turns ${t.t} and walks ${leg.length} m.` : `${subj} takes a ${t.t} turn and walks ${leg.length} m.`;
}

function render(
  rng: Rng,
  d: Difficulty,
  p: Person,
  first: Dir4,
  legs: WalkLeg[],
  pts: { x: number; y: number }[],
  ask: WalkAsk,
  display: DistDisplay,
): Omit<QuestionDraft, 'subtype' | 'difficulty'> {
  const place = rng.pick(p.g === 'm' ? PLACES_M : PLACES_F);
  const sentences = [`${p.name} starts from ${place} and walks ${legs[0].length} m towards the ${dirWord(first)}.`];
  for (let i = 1; i < legs.length; i++) sentences.push(legSentence(p, legs[i], i, legs.length, rng));
  const end = pts[pts.length - 1];
  const dx = end.x;
  const dy = end.y;
  const sq = dx * dx + dy * dy;
  const dir = dirOfVector(dx, dy);
  const back = dirOfVector(-dx, -dy);
  const total = legs.reduce((s, l) => s + l.length, 0);
  const questionText: Record<WalkAsk, string> = {
    distance: `What is the shortest distance between ${his(p)} starting point and ${his(p)} final position?`,
    direction: `In which direction is ${he(p)} now with respect to ${his(p)} starting point?`,
    both: `How far and in which direction is ${he(p)} now from ${his(p)} starting point?`,
    'start-from-end': `In which direction is ${his(p)} starting point with respect to ${his(p)} present position?`,
  };
  const prompt = `${sentences.join(' ')} ${questionText[ask]}`;

  // Mistakes: path length, adding the legs, a sign slip on one leg
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const slip = (() => {
    // reverse the direction of one leg (the classic sign slip)
    const i = rng.int(1, legs.length - 1);
    const a = pts[i];
    const b = pts[i + 1];
    const sx = dx - 2 * (b.x - a.x);
    const sy = dy - 2 * (b.y - a.y);
    return { sx, sy };
  })();
  const distMistakes: Mistake[] = [
    { value: total * total, why: 'added all the legs (path length, not displacement)' },
    { value: (ax + ay) * (ax + ay), why: 'added the two net legs instead of using Pythagoras' },
    { value: slip.sx * slip.sx + slip.sy * slip.sy, why: 'took one leg in the wrong direction' },
    ...(ax && ay ? [{ value: Math.max(ax, ay) ** 2, why: 'used only the longer net leg' }, { value: Math.abs(ax - ay) ** 2 + Math.min(ax, ay) ** 2, why: 'subtracted the legs' }] : []),
  ].filter((m) => m.value !== sq && m.value > 0);

  const tempting: Dir8[] = [back, ...(slip.sx || slip.sy ? [dirOfVector(slip.sx, slip.sy)] : []), dirOfVector(-dx || dx, dy), dirOfVector(dx, -dy || dy)];
  let choices;
  if (ask === 'distance') choices = distanceChoices(rng, sq, distMistakes, display);
  else if (ask === 'direction') choices = directionChoices(rng, dir, tempting);
  else if (ask === 'start-from-end') choices = directionChoices(rng, back, [dir, ...tempting.slice(1)]);
  else {
    const dText = distTex(sq, display);
    const wrongD = distMistakes.map((m) => m.value).filter((v, i, a) => a.indexOf(v) === i);
    const wrongDir = [back, ...tempting.slice(1)].filter((x) => x !== dir);
    const pair = (s: number, x: Dir8) => `${distTex(s, display)}, ${DIR_NAME[x]}`;
    const opts = new Set<string>();
    const cands = [
      `${dText}, ${DIR_NAME[wrongDir[0]]}`,
      ...(wrongD[0] ? [pair(wrongD[0], dir)] : []),
      ...(wrongD[1] ? [pair(wrongD[1], dir)] : []),
      ...(wrongD[0] && wrongDir[0] ? [pair(wrongD[0], wrongDir[0])] : []),
      ...(wrongDir[1] ? [`${dText}, ${DIR_NAME[wrongDir[1]]}`] : []),
      ...(wrongD[2] ? [pair(wrongD[2], dir)] : []),
    ];
    for (const c of cands) if (c !== `${dText}, ${DIR_NAME[dir]}` && opts.size < 4) opts.add(c);
    const fillDirs = (['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as Dir8[]).filter((x) => x !== dir);
    for (const x of fillDirs) if (opts.size < 4) opts.add(`${dText}, ${DIR_NAME[x]}`);
    choices = shuffleChoices(rng, `${dText}, ${DIR_NAME[dir]}`, [...opts]);
  }

  // Solution
  const steps: Rich[] = ['Take the start as (0, 0), east as +x and north as +y.'];
  let h: Dir4 = first;
  legs.forEach((leg, i) => {
    if (i > 0 && leg.turn) h = applyTurn(h, leg.turn);
    const a = pts[i + 1];
    steps.push(`${leg.length} m ${dirWord(h)} → (${a.x}, ${a.y})`);
  });
  const ns = dy === 0 ? '' : `${Math.abs(dy)} m ${dy > 0 ? 'north' : 'south'}`;
  const ew = dx === 0 ? '' : `${Math.abs(dx)} m ${dx > 0 ? 'east' : 'west'}`;
  steps.push(`Net displacement: ${[ns, ew].filter(Boolean).join(' and ')} of the start.`);
  if (ask === 'distance' || ask === 'both') steps.push(sqrtStep(dx, dy, display));
  if (ask === 'direction' || ask === 'both') steps.push(`Direction from the start: **${DIR_NAME[dir]}**.`);
  if (ask === 'start-from-end') steps.push(`${He(p)} is ${dirWord(dir)} of the start, so the start is **${DIR_NAME[back]}** of ${his(p)} present position.`);
  const trap: Rich =
    ask === 'distance'
      ? `${total} m is the total path walked, not the shortest distance.`
      : ask === 'start-from-end'
        ? `${DIR_NAME[dir]} is where ${he(p)} is from the start — the question asks the reverse.`
        : ax && ay
          ? `With both a north–south and an east–west offset, the answer is an in-between direction (${DIR_NAME[dir]}), not ${DIR_NAME[dirOfVector(ax >= ay ? dx : 0, ax >= ay ? 0 : dy)]}.`
          : `${He(p)} ends on the same line as the start — the direction is a main direction, not a corner one.`;
  const visual: VisualSpec = {
    type: 'path',
    points: pts.map((pt, i) => ({ ...pt, ...(i === 0 ? { label: 'Start' } : i === pts.length - 1 ? { label: 'End' } : {}) })),
    unit: 'm',
    shortest: { from: 'Start', to: 'End', label: distPlain(sq, display) },
    caption: `Net: ${[ns, ew].filter(Boolean).join(', ')}`,
  };
  return {
    prompt,
    ...choices,
    solution: {
      steps,
      shortcut: ax && ay ? `Add the north–south legs and the east–west legs separately, then ${pythagorasHint(ax, ay)}.` : 'Add the north–south legs and the east–west legs separately — one of them cancels to zero.',
      trap,
      visual,
    },
    tags: ['direction:walk', `direction:${ask}`, ...(ax && ay ? ['trick:pythagoras'] : [])],
    targetSeconds: targetSeconds('short-reasoning', d),
  };
}
