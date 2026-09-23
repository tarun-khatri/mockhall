/**
 * Point-based direction set (3 questions): 6–9 points linked by "Point X is d m to the <dir> of point Y" clues
 * (the 2024–26 prelims format). Questions: direction of one point w.r.t. another, shortest distance
 * (Pythagorean or surd, e.g. √244), "four of the five pairs are alike", route length, a newly added point.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty, Rich, VisualSpec } from '../../../types';
import type { SetQuestionDraft } from '../../shared/question';
import { numericChoices, shuffleChoices, type Mistake } from '../../shared/options';
import { DIR_NAME, VEC, dirOfVector, dirWord, distPlain, distanceChoices, directionChoices, sqrtStep, type Dir4, type Dir8, type DistDisplay } from './geo';

export interface PointClue {
  /** `a` is `dist` m to the `dir` of `b`. */
  a: string;
  b: string;
  dir: Dir4;
  dist: number;
}

export type PointQ =
  | { t: 'direction'; of: string; wrt: string }
  | { t: 'distance'; a: string; b: string; display: DistDisplay }
  | { t: 'odd-pair'; pairs: [string, string][] }
  | { t: 'route'; via: string[] }
  | { t: 'new-point'; clue: PointClue; to: string; display: DistDisplay };

export interface PointSetFacts {
  kind: 'point-set';
  clues: PointClue[];
  /** How the clues are printed: one sentence per clue, or two clues sharing a subject in one sentence. */
  sentences: number[][];
  questions: PointQ[];
}

type Pt = [number, number];
const key = (p: Pt) => `${p[0]},${p[1]}`;

const SIZE: Record<Difficulty, [number, number]> = { easy: [5, 6], medium: [6, 7], hard: [7, 8], extreme: [8, 9] };
const LETTER_SETS = ['ABCDEFGHIJ', 'PQRSTUVWXY', 'JKLMNOPQRS'];

interface Layout {
  names: string[];
  pos: Map<string, Pt>;
  parent: Map<string, string>;
  clues: PointClue[];
}

function makeLayout(rng: Rng, d: Difficulty): Layout | null {
  const n = rng.int(...SIZE[d]);
  const names = rng.shuffle(rng.pick(LETTER_SETS).split('')).slice(0, n);
  const pos = new Map<string, Pt>([[names[0], [0, 0]]]);
  const parent = new Map<string, string>();
  const clues: PointClue[] = [];
  // Easy/medium distances favour Pythagorean-friendly values; harder levels use any 2–24 m.
  const pool =
    d === 'easy' ? [3, 4, 5, 6, 8, 9, 10, 12] : d === 'medium' ? [3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 16] : Array.from({ length: 23 }, (_, i) => i + 2);
  const incoming = new Map<string, Dir4>();
  for (let i = 1; i < n; i++) {
    let placed = false;
    for (let tries = 0; tries < 40 && !placed; tries++) {
      const par = rng.chance(0.72) ? names[i - 1] : names[rng.int(0, i - 1)];
      const inc = incoming.get(par);
      const dirs = (['N', 'E', 'S', 'W'] as Dir4[]).filter((x) => !inc || VEC[x][0] !== -VEC[inc][0] || VEC[x][1] !== -VEC[inc][1]);
      const dir = rng.pick(dirs);
      const dist = rng.pick(pool);
      const [px, py] = pos.get(par)!;
      const p: Pt = [px + VEC[dir][0] * dist, py + VEC[dir][1] * dist];
      if ([...pos.values()].some((q) => key(q) === key(p))) continue;
      pos.set(names[i], p);
      parent.set(names[i], par);
      incoming.set(names[i], dir);
      // phrase the clue with either point as the subject
      if (rng.chance(0.6)) clues.push({ a: names[i], b: par, dir, dist });
      else clues.push({ a: par, b: names[i], dir: ({ N: 'S', S: 'N', E: 'W', W: 'E' } as const)[dir], dist });
      placed = true;
    }
    if (!placed) return null;
  }
  return { names, pos, parent, clues };
}

function sentenceText(clues: readonly PointClue[], group: readonly number[]): Rich {
  const c0 = clues[group[0]];
  if (group.length === 1) return `Point ${c0.a} is ${c0.dist} m to the ${dirWord(c0.dir)} of point ${c0.b}.`;
  const c1 = clues[group[1]];
  return `Point ${c0.a} is ${c0.dist} m to the ${dirWord(c0.dir)} of point ${c0.b} and ${c1.dist} m to the ${dirWord(c1.dir)} of point ${c1.b}.`;
}

/** Tree path between two points (through the clue links). */
function treePath(layout: Layout, from: string, to: string): string[] {
  const up = (x: string) => {
    const out = [x];
    while (layout.parent.has(out[out.length - 1])) out.push(layout.parent.get(out[out.length - 1])!);
    return out;
  };
  const a = up(from);
  const b = up(to);
  const common = a.find((x) => b.includes(x))!;
  return [...a.slice(0, a.indexOf(common) + 1), ...b.slice(0, b.indexOf(common)).reverse()];
}

function pathVisual(layout: Layout, from: string, to: string, sq: number, display: DistDisplay): VisualSpec {
  const path = treePath(layout, from, to);
  const [ox, oy] = layout.pos.get(from)!;
  return {
    type: 'path',
    points: path.map((l) => {
      const [x, y] = layout.pos.get(l)!;
      return { x: x - ox, y: y - oy, label: l };
    }),
    unit: 'm',
    shortest: { from, to, label: distPlain(sq, display) },
  };
}

function coordSteps(layout: Layout, pts: readonly string[], origin: string): Rich[] {
  const [ox, oy] = layout.pos.get(origin)!;
  return [`Take point ${origin} as (0, 0), east = +x, north = +y.`, pts.filter((p) => p !== origin).map((p) => {
    const [x, y] = layout.pos.get(p)!;
    return `${p} = (${x - ox}, ${y - oy})`;
  }).join(', ')];
}

interface Built {
  q: PointQ;
  draft: SetQuestionDraft;
}

function nice(sq: number, d: Difficulty): boolean {
  const r = Math.round(Math.sqrt(sq));
  if (r * r === sq) return true;
  return d === 'hard' || d === 'extreme';
}

function buildDirectionQ(rng: Rng, layout: Layout, used: Set<string>, d: Difficulty): Built | null {
  const pairs: [string, string][] = [];
  for (const a of layout.names) for (const b of layout.names) if (a !== b && layout.parent.get(a) !== b && layout.parent.get(b) !== a) pairs.push([a, b]);
  const target = rng.pick(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as Dir8[]);
  const scored = rng.shuffle(pairs).filter(([a, b]) => !used.has(`dir${a}${b}`));
  const pick = scored.find(([a, b]) => {
    const [ax, ay] = layout.pos.get(a)!;
    const [bx, by] = layout.pos.get(b)!;
    return dirOfVector(ax - bx, ay - by) === target && treePath(layout, a, b).length >= (d === 'easy' ? 3 : 4);
  }) ?? scored.find(([a, b]) => treePath(layout, a, b).length >= 3);
  if (!pick) return null;
  const [of, wrt] = pick;
  used.add(`dir${of}${wrt}`);
  const [ax, ay] = layout.pos.get(of)!;
  const [bx, by] = layout.pos.get(wrt)!;
  const dx = ax - bx;
  const dy = ay - by;
  const dir = dirOfVector(dx, dy);
  const tempting: Dir8[] = [dirOfVector(-dx, -dy), dirOfVector(dx || 1, 0), dirOfVector(0, dy || 1), dirOfVector(-dx || 1, dy)];
  const choices = directionChoices(rng, dir, tempting);
  const path = treePath(layout, of, wrt);
  const sq = dx * dx + dy * dy;
  return {
    q: { t: 'direction', of, wrt },
    draft: {
      prompt: `In which direction is point ${of} with respect to point ${wrt}?`,
      ...choices,
      solution: {
        steps: [...coordSteps(layout, path, wrt), `${of} is ${dy ? `${Math.abs(dy)} m ${dy > 0 ? 'north' : 'south'}` : ''}${dx && dy ? ' and ' : ''}${dx ? `${Math.abs(dx)} m ${dx > 0 ? 'east' : 'west'}` : ''} of ${wrt} → **${DIR_NAME[dir]}**.`],
        shortcut: 'Only the signs matter for direction: net north/south and net east/west of the reference point.',
        trap: dx && dy ? `Both offsets are non-zero, so it is ${DIR_NAME[dir]} — not ${DIR_NAME[dirOfVector(Math.abs(dx) > Math.abs(dy) ? dx : 0, Math.abs(dx) > Math.abs(dy) ? 0 : dy)]}.` : `The question asks ${of} with respect to ${wrt}; ${DIR_NAME[dirOfVector(-dx, -dy)]} is the reverse.`,
        visual: pathVisual(layout, wrt, of, sq, 'simple'),
      },
      tags: ['direction:point-set', 'direction:direction'],
    },
  };
}

function distMistakes(layout: Layout, a: string, b: string, dx: number, dy: number): Mistake[] {
  const path = treePath(layout, a, b);
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    const [x1, y1] = layout.pos.get(path[i - 1])!;
    const [x2, y2] = layout.pos.get(path[i])!;
    len += Math.abs(x1 - x2) + Math.abs(y1 - y2);
  }
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return [
    { value: (ax + ay) ** 2, why: 'added the two legs instead of using Pythagoras' },
    { value: len * len, why: 'took the route length' },
    { value: (ax + 1) ** 2 + ay ** 2, why: 'one leg off by 1 m' },
    { value: ax ** 2 + (ay + 1) ** 2, why: 'one leg off by 1 m' },
    { value: ax ** 2 + ay ** 2 + 1, why: 'adjacent surd' },
    { value: Math.abs(ax * ax - ay * ay), why: 'subtracted the squares' },
  ].filter((m) => m.value > 0);
}

function buildDistanceQ(rng: Rng, layout: Layout, used: Set<string>, d: Difficulty): Built | null {
  const cands: [string, string, number][] = [];
  for (let i = 0; i < layout.names.length; i++)
    for (let j = i + 1; j < layout.names.length; j++) {
      const a = layout.names[i];
      const b = layout.names[j];
      if (used.has(`dist${a}${b}`)) continue;
      const [ax, ay] = layout.pos.get(a)!;
      const [bx, by] = layout.pos.get(b)!;
      const dx = ax - bx;
      const dy = ay - by;
      if (!dx || !dy) continue;
      const sq = dx * dx + dy * dy;
      if (!nice(sq, d) || treePath(layout, a, b).length < 3) continue;
      cands.push([a, b, sq]);
    }
  if (!cands.length) return null;
  const [a, b, sq] = rng.pick(cands);
  used.add(`dist${a}${b}`);
  const display: DistDisplay = d === 'hard' || d === 'extreme' ? (rng.chance(0.7) ? 'raw' : 'simple') : 'simple';
  const [ax, ay] = layout.pos.get(a)!;
  const [bx, by] = layout.pos.get(b)!;
  const dx = ax - bx;
  const dy = ay - by;
  const choices = distanceChoices(rng, sq, distMistakes(layout, a, b, dx, dy), display);
  const path = treePath(layout, a, b);
  return {
    q: { t: 'distance', a, b, display },
    draft: {
      prompt: `What is the shortest distance between point ${a} and point ${b}?`,
      ...choices,
      solution: {
        steps: [...coordSteps(layout, path, b), `Horizontal gap = ${Math.abs(dx)} m, vertical gap = ${Math.abs(dy)} m.`, sqrtStep(dx, dy, display)],
        shortcut: 'Shortest distance = √(horizontal gap² + vertical gap²); check the 3-4-5, 5-12-13, 8-15-17 families first.',
        trap: `Adding the gaps (${Math.abs(dx) + Math.abs(dy)} m) or walking the route gives a longer distance — the shortest is the straight line.`,
        visual: pathVisual(layout, b, a, sq, display),
      },
      tags: ['direction:point-set', 'direction:distance', 'trick:pythagoras'],
    },
  };
}

function buildOddPair(rng: Rng, layout: Layout): Built | null {
  const byDir = new Map<Dir8, [string, string][]>();
  for (const a of layout.names)
    for (const b of layout.names) {
      if (a === b) continue;
      const [ax, ay] = layout.pos.get(a)!;
      const [bx, by] = layout.pos.get(b)!;
      const dd = dirOfVector(ax - bx, ay - by);
      if (!byDir.has(dd)) byDir.set(dd, []);
      byDir.get(dd)!.push([a, b]);
    }
  const groups = rng.shuffle([...byDir.entries()].filter(([, v]) => v.length >= 4));
  if (!groups.length) return null;
  const [dir, list] = groups[0];
  const four = rng.sample(list, 4);
  // odd pair: a neighbouring direction (the classic near miss)
  const near = [...byDir.entries()].filter(([k]) => k !== dir && (k.includes(dir) || dir.includes(k)));
  const oddPool = (near.length ? near : [...byDir.entries()].filter(([k]) => k !== dir)).flatMap(([, v]) => v);
  if (!oddPool.length) return null;
  const odd = rng.pick(oddPool);
  const txt = (p: [string, string]) => `${p[0]}, ${p[1]}`;
  if (new Set([...four, odd].map(txt)).size !== 5) return null;
  const choices = shuffleChoices(rng, txt(odd), four.map(txt));
  const pairs = choices.options.map((o) => o.split(', ') as [string, string]);
  const [ox, oy] = layout.pos.get(odd[0])!;
  const [px, py] = layout.pos.get(odd[1])!;
  return {
    q: { t: 'odd-pair', pairs },
    draft: {
      prompt: 'Four of the following five pairs are alike in a certain way based on the direction of the first point with respect to the second point, and so form a group. Which pair does not belong to that group?',
      ...choices,
      solution: {
        steps: [
          ...pairs.map((p) => {
            const [x1, y1] = layout.pos.get(p[0])!;
            const [x2, y2] = layout.pos.get(p[1])!;
            return `${p[0]} w.r.t. ${p[1]}: ${DIR_NAME[dirOfVector(x1 - x2, y1 - y2)]}`;
          }),
          `Four pairs are ${DIR_NAME[dir]}; **${txt(odd)}** is ${DIR_NAME[dirOfVector(ox - px, oy - py)]}.`,
        ],
        shortcut: 'Fix coordinates once; then each pair needs only the signs of Δx and Δy.',
        trap: `${txt(odd)} is close — one of its offsets is zero or reversed, so its direction is ${DIR_NAME[dirOfVector(ox - px, oy - py)]}, not ${DIR_NAME[dir]}.`,
      },
      tags: ['direction:point-set', 'direction:odd-pair'],
    },
  };
}

function buildRoute(rng: Rng, layout: Layout): Built | null {
  const endA = rng.pick(layout.names);
  const far = layout.names.filter((x) => x !== endA && treePath(layout, endA, x).length >= 4);
  if (!far.length) return null;
  const endB = rng.pick(far);
  const via = treePath(layout, endA, endB);
  let total = 0;
  const legs: number[] = [];
  for (let i = 1; i < via.length; i++) {
    const [x1, y1] = layout.pos.get(via[i - 1])!;
    const [x2, y2] = layout.pos.get(via[i])!;
    const l = Math.abs(x1 - x2) + Math.abs(y1 - y2);
    legs.push(l);
    total += l;
  }
  const [ax, ay] = layout.pos.get(endA)!;
  const [bx, by] = layout.pos.get(endB)!;
  const straight = Math.abs(ax - bx) + Math.abs(ay - by);
  const mistakes: Mistake[] = [
    { value: total - legs[legs.length - 1], why: 'missed the last leg' },
    { value: total - legs[0], why: 'missed the first leg' },
    { value: straight, why: 'added only the net gaps' },
    { value: total + legs[1], why: 'counted a leg twice' },
  ];
  const choices = numericChoices(rng, total, { format: (v) => `${v} m`, mistakes });
  return {
    q: { t: 'route', via },
    draft: {
      prompt: `A person starts from point ${endA} and walks to point ${endB} along the given lines, passing through points ${via.slice(1, -1).join(', ')}. What is the total distance walked?`,
      ...choices,
      solution: {
        steps: [...legs.map((l, i) => `${via[i]} → ${via[i + 1]}: ${l} m`), `Total = ${legs.join(' + ')} = **${total} m**.`],
        shortcut: 'Read each leg straight from its clue and add — no coordinates needed.',
        trap: `The straight-line (net) gaps add to only ${straight} m; the walk follows every leg.`,
        visual: pathVisual(layout, endA, endB, (ax - bx) ** 2 + (ay - by) ** 2, 'simple'),
      },
      tags: ['direction:point-set', 'direction:route-length'],
    },
  };
}

function buildNewPoint(rng: Rng, layout: Layout, d: Difficulty): Built | null {
  const free = 'ZYXWVUTSRQ'.split('').find((l) => !layout.names.includes(l))!;
  for (let tries = 0; tries < 40; tries++) {
    const base = rng.pick(layout.names);
    const to = rng.pick(layout.names.filter((x) => x !== base));
    const dir = rng.pick(['N', 'E', 'S', 'W'] as Dir4[]);
    const dist = rng.int(2, 20);
    const [bx, by] = layout.pos.get(base)!;
    const p: Pt = [bx + VEC[dir][0] * dist, by + VEC[dir][1] * dist];
    if ([...layout.pos.values()].some((q) => key(q) === key(p))) continue;
    const [tx, ty] = layout.pos.get(to)!;
    const dx = p[0] - tx;
    const dy = p[1] - ty;
    if (!dx || !dy) continue;
    const sq = dx * dx + dy * dy;
    if (!nice(sq, d)) continue;
    const display: DistDisplay = d === 'extreme' ? 'raw' : 'simple';
    const clue: PointClue = { a: free, b: base, dir, dist };
    const choices = distanceChoices(rng, sq, distMistakes(layout, base, to, dx, dy), display);
    const path = treePath(layout, base, to);
    return {
      q: { t: 'new-point', clue, to, display },
      draft: {
        prompt: `If point ${free} is ${dist} m to the ${dirWord(dir)} of point ${base}, what is the shortest distance between point ${free} and point ${to}?`,
        ...choices,
        solution: {
          steps: [...coordSteps(layout, path, to), `${free} = ${base} + ${dist} m ${dirWord(dir)} = (${p[0] - tx}, ${p[1] - ty})`, sqrtStep(dx, dy, display)],
          shortcut: 'Shift the known point by the new clue, then use Pythagoras on the two gaps.',
          trap: `Measure from ${free}, not from ${base} — the extra ${dist} m changes one of the gaps.`,
        },
        tags: ['direction:point-set', 'direction:new-point', 'trick:pythagoras'],
      },
    };
  }
  return null;
}

type Slot = 'direction' | 'distance' | 'odd' | 'route' | 'new';

function plan(rng: Rng, d: Difficulty): Slot[] {
  switch (d) {
    case 'easy':
      return ['direction', 'distance', 'direction'];
    case 'medium':
      return ['direction', 'distance', rng.pick<Slot>(['route', 'odd'])];
    case 'hard':
      return ['direction', 'distance', 'odd'];
    case 'extreme':
      return ['distance', 'odd', 'new'];
  }
}

export function buildPointSet(rng: Rng, d: Difficulty): { facts: PointSetFacts; stimulus: Rich; questions: SetQuestionDraft[] } {
  const slots = plan(rng, d);
  for (let attempt = 0; attempt < 200; attempt++) {
    const layout = makeLayout(rng, d);
    if (!layout) continue;
    const used = new Set<string>();
    const built: Built[] = [];
    for (const s of slots) {
      const b =
        s === 'direction'
          ? buildDirectionQ(rng, layout, used, d)
          : s === 'distance'
            ? buildDistanceQ(rng, layout, used, d)
            : s === 'odd'
              ? buildOddPair(rng, layout)
              : s === 'route'
                ? buildRoute(rng, layout)
                : buildNewPoint(rng, layout, d);
      if (!b) break;
      built.push(b);
    }
    if (built.length !== slots.length) continue;
    if (new Set(built.map((b) => b.draft.prompt)).size !== built.length) continue;
    // sentences: occasionally merge two consecutive clues with the same subject
    const order = d === 'hard' || d === 'extreme' ? rng.shuffle(layout.clues.map((_, i) => i)) : layout.clues.map((_, i) => i);
    const sentences: number[][] = [];
    for (let i = 0; i < order.length; i++) {
      const c = layout.clues[order[i]];
      const nx = order[i + 1] !== undefined ? layout.clues[order[i + 1]] : undefined;
      if (nx && nx.a === c.a && d !== 'easy' && rng.chance(0.7)) {
        sentences.push([order[i], order[i + 1]]);
        i++;
      } else sentences.push([order[i]]);
    }
    const stimulus = `Study the following information carefully and answer the questions given below.\n\n${sentences.map((g) => sentenceText(layout.clues, g)).join('\n')}`;
    return {
      facts: { kind: 'point-set', clues: layout.clues, sentences, questions: built.map((b) => b.q) },
      stimulus,
      questions: built.map((b) => b.draft),
    };
  }
  throw new Error('point-set: could not build');
}
