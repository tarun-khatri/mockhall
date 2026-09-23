/**
 * Coded directions: "'P # Q' means P is 4 m to the north of Q" etc., then a chained expression
 * "A # B @ C % D" (= A # B, B @ C, C % D). Asked: direction / distance of one point from another, or (extreme)
 * which expression makes a given point lie in a given direction.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty, Rich, VisualSpec } from '../../../types';
import type { QuestionDraft } from '../../shared/question';
import { shuffleChoices, type Mistake } from '../../shared/options';
import { targetSeconds } from '../../../targets';
import { DIR8, DIR_NAME, VEC, dirOfVector, dirWord, distPlain, distTex, distanceChoices, directionChoices, sqrtStep, type Dir4, type Dir8, type DistDisplay } from './geo';

export interface CodeDef {
  sym: string;
  dir: Dir4;
  dist: number;
}
export type CodedAsk =
  | { t: 'direction' | 'distance' | 'both'; of: string; wrt: string; display: DistDisplay }
  | { t: 'which'; of: string; wrt: string; dir: Dir8 };

export interface CodedFacts {
  kind: 'coded-direction';
  codes: CodeDef[];
  /** Alternating point, symbol, point, …; empty for 'which'. */
  chain: string[];
  ask: CodedAsk;
  /** 'which' only: the candidate expressions as shown in the options. */
  options?: string[][];
}

const SYMBOLS = ['@', '#', '%', '&', '©', '★', '+', '÷', '×'];
const POINT_SETS = ['ABCDEFG', 'PQRSTUV', 'JKLMNOW', 'EFGHIJK'];

/** Positions of the points of a chain: "X s Y" means X is d m <dir> of Y. The first point is at (0, 0). */
export function chainPositions(codes: readonly CodeDef[], chain: readonly string[]): Map<string, [number, number]> {
  const pos = new Map<string, [number, number]>([[chain[0], [0, 0]]]);
  for (let i = 1; i < chain.length; i += 2) {
    const c = codes.find((x) => x.sym === chain[i])!;
    const [x, y] = pos.get(chain[i - 1])!;
    const [vx, vy] = VEC[c.dir];
    pos.set(chain[i + 1], [x - vx * c.dist, y - vy * c.dist]);
  }
  return pos;
}

/** Placeholder letters for the code definitions that do not clash with the point names. */
function placeholders(used: readonly string[]): [string, string] {
  for (const [a, b] of [
    ['P', 'Q'],
    ['X', 'Y'],
    ['M', 'N'],
  ] as [string, string][])
    if (!used.includes(a) && !used.includes(b)) return [a, b];
  return ['Y', 'Z'];
}

function codeLines(codes: readonly CodeDef[], used: readonly string[]): string {
  const [a, b] = placeholders(used);
  return codes.map((c) => `- '${a} ${c.sym} ${b}' means ${a} is ${c.dist} m to the ${dirWord(c.dir)} of ${b}.`).join('\n');
}

const clean = (sq: number, d: Difficulty) => {
  const r = Math.round(Math.sqrt(sq));
  if (r * r === sq) return true;
  if (d === 'easy' || d === 'medium') return sq % 2 === 0 && Number.isInteger(Math.sqrt(sq / 2));
  return true;
};

type Draft = Omit<QuestionDraft, 'subtype' | 'difficulty'>;

function makeCodes(rng: Rng, d: Difficulty): CodeDef[] {
  const syms = rng.sample(SYMBOLS, 4);
  const dirs = rng.shuffle(['N', 'E', 'S', 'W'] as Dir4[]);
  const pool = d === 'easy' ? [2, 3, 4, 5, 6, 8, 10] : [2, 3, 4, 5, 6, 7, 8, 9, 10, 12];
  const dists = rng.sample(pool, 4);
  return syms.map((sym, i) => ({ sym, dir: dirs[i], dist: dists[i] }));
}

export function buildCoded(rng: Rng, d: Difficulty): { facts: CodedFacts; draft: Draft } {
  if (d === 'extreme' && rng.chance(0.5)) return buildWhich(rng, d);
  const links = d === 'easy' ? 3 : d === 'medium' ? 4 : d === 'hard' ? 5 : 6;
  const t: 'direction' | 'distance' | 'both' = d === 'easy' ? rng.pick(['direction', 'distance'] as const) : rng.pick(['direction', 'distance', 'both'] as const);
  const target = rng.pick(DIR8);
  for (let attempt = 0; attempt < 600; attempt++) {
    const codes = makeCodes(rng, d);
    const letters = rng.shuffle(rng.pick(POINT_SETS).split('')).slice(0, links + 1);
    const chain: string[] = [letters[0]];
    for (let i = 0; i < links; i++) chain.push(rng.pick(codes).sym, letters[i + 1]);
    const pos = chainPositions(codes, chain);
    const pts = [...pos.values()];
    if (new Set(pts.map((p) => p.join(','))).size !== pts.length) continue;
    // ask about the last point w.r.t. the first (or an intermediate pair on harder levels)
    let of = letters[links];
    let wrt = letters[0];
    if ((d === 'hard' || d === 'extreme') && rng.chance(0.4)) {
      const i = rng.int(0, links - 2);
      wrt = letters[i];
      of = letters[rng.int(i + 2, links)];
    }
    const [ox, oy] = pos.get(of)!;
    const [wx, wy] = pos.get(wrt)!;
    const dx = ox - wx;
    const dy = oy - wy;
    if (dx === 0 && dy === 0) continue;
    const dir = dirOfVector(dx, dy);
    if (t !== 'distance' && dir !== target) continue;
    const sq = dx * dx + dy * dy;
    if (t !== 'direction' && !clean(sq, d)) continue;
    if (t === 'distance' && (dx === 0 || dy === 0) && rng.chance(0.6)) continue;
    const display: DistDisplay = d === 'extreme' && rng.chance(0.5) ? 'raw' : 'simple';
    const ask: CodedAsk = { t, of, wrt, display };

    // mistakes: reading "X s Y" the wrong way round flips every link; forgetting one link
    const flipped = { dx: -dx, dy: -dy };
    const i0 = chain.indexOf(wrt);
    const i1 = chain.indexOf(of);
    const [lo, hi] = i0 < i1 ? [i0, i1] : [i1, i0];
    const lastLink = codes.find((c) => c.sym === chain[hi - 1])!;
    const [lvx, lvy] = VEC[lastLink.dir];
    // dropping the last link between the two points
    const sign = i1 > i0 ? 1 : -1;
    const drop = { dx: dx + sign * lvx * lastLink.dist, dy: dy + sign * lvy * lastLink.dist };
    const tempting: Dir8[] = [dirOfVector(flipped.dx, flipped.dy), ...(drop.dx || drop.dy ? [dirOfVector(drop.dx, drop.dy)] : []), dirOfVector(dx || 1, 0), dirOfVector(0, dy || 1)];
    const distMistakes: Mistake[] = [
      { value: (Math.abs(dx) + Math.abs(dy)) ** 2, why: 'added the two net legs' },
      { value: drop.dx * drop.dx + drop.dy * drop.dy, why: 'missed one link of the chain' },
    ];
    let pathLen = 0;
    for (let i = lo + 1; i < hi; i += 2) pathLen += codes.find((c) => c.sym === chain[i])!.dist;
    distMistakes.push({ value: pathLen * pathLen, why: 'added every link (path length)' });
    let choices;
    if (t === 'direction') choices = directionChoices(rng, dir, tempting);
    else if (t === 'distance') choices = distanceChoices(rng, sq, distMistakes, display);
    else {
      const dT = distTex(sq, display);
      const alts = distMistakes.map((m) => m.value).filter((v) => v !== sq && v > 0);
      const cands = new Set<string>();
      const fd = tempting.filter((x) => x !== dir);
      if (fd[0]) cands.add(`${dT}, ${DIR_NAME[fd[0]]}`);
      for (const v of alts) cands.add(`${distTex(v, display)}, ${DIR_NAME[dir]}`);
      if (alts[0] && fd[0]) cands.add(`${distTex(alts[0], display)}, ${DIR_NAME[fd[0]]}`);
      for (const x of DIR8) if (x !== dir) cands.add(`${dT}, ${DIR_NAME[x]}`);
      const list = [...cands].filter((c) => c !== `${dT}, ${DIR_NAME[dir]}`).slice(0, 4);
      choices = shuffleChoices(rng, `${dT}, ${DIR_NAME[dir]}`, list);
    }
    const expr = chain.join(' ');
    const q =
      t === 'direction'
        ? `In which direction is point ${of} with respect to point ${wrt}?`
        : t === 'distance'
          ? `What is the shortest distance between point ${of} and point ${wrt}?`
          : `How far and in which direction is point ${of} from point ${wrt}?`;
    const steps: Rich[] = [`Break the expression into pairs: ${Array.from({ length: links }, (_, i) => chain.slice(2 * i, 2 * i + 3).join(' ')).join(', ')}.`];
    for (let i = 1; i < chain.length; i += 2) {
      const c = codes.find((x) => x.sym === chain[i])!;
      const p = pos.get(chain[i + 1])!;
      steps.push(`${chain[i - 1]} ${c.sym} ${chain[i + 1]}: ${chain[i - 1]} is ${c.dist} m ${dirWord(c.dir)} of ${chain[i + 1]} → ${chain[i + 1]} at (${p[0]}, ${p[1]})`);
    }
    steps.push(`${of} − ${wrt} = (${dx}, ${dy}).`);
    if (t !== 'direction') steps.push(sqrtStep(dx, dy, display));
    if (t !== 'distance') steps.push(`Direction of ${of} from ${wrt}: **${DIR_NAME[dir]}**.`);
    const visual: VisualSpec = {
      type: 'path',
      points: letters.slice(0, links + 1).map((l) => {
        const [x, y] = pos.get(l)!;
        return { x, y, label: l };
      }),
      unit: 'm',
      shortest: { from: wrt, to: of, label: distPlain(sq, display) },
    };
    return {
      facts: { kind: 'coded-direction', codes, chain, ask },
      draft: {
        prompt: `In a certain code language:\n${codeLines(codes, letters)}\n\nIf '${expr}' is true, ${q[0].toLowerCase() + q.slice(1)}`,
        ...choices,
        solution: {
          steps,
          shortcut: 'Place the first point at the origin and walk the chain; "P s Q" puts Q on the opposite side of P.',
          trap: `Reading "P ${codes[0].sym} Q" as Q being ${dirWord(codes[0].dir)} of P flips every link and gives the opposite direction.`,
          visual,
        },
        tags: ['direction:coded', `direction:${t}`],
        targetSeconds: targetSeconds('short-reasoning', d),
      },
    };
  }
  throw new Error('coded-direction: could not build');
}

/** Extreme: which expression shows that `of` is <dir> of `wrt`? */
function buildWhich(rng: Rng, d: Difficulty): { facts: CodedFacts; draft: Draft } {
  for (let attempt = 0; attempt < 400; attempt++) {
    const codes = makeCodes(rng, d);
    const letters = rng.shuffle(rng.pick(POINT_SETS).split('')).slice(0, 4);
    const [first, m1, m2, last] = letters;
    const exprs: string[][] = [];
    const dirs: Dir8[] = [];
    for (let k = 0; k < 40 && exprs.length < 12; k++) {
      const e = [first, rng.pick(codes).sym, m1, rng.pick(codes).sym, m2, rng.pick(codes).sym, last];
      if (exprs.some((x) => x.join('') === e.join(''))) continue;
      const pos = chainPositions(codes, e);
      const [lx, ly] = pos.get(last)!;
      if (lx === 0 && ly === 0) continue;
      exprs.push(e);
      dirs.push(dirOfVector(lx, ly));
    }
    const targetDir = rng.pick(DIR8);
    const good = exprs.filter((_, i) => dirs[i] === targetDir);
    const bad = exprs.filter((_, i) => dirs[i] !== targetDir);
    if (good.length < 1 || bad.length < 4) continue;
    const correct = good[0];
    const wrong = rng.sample(bad, 4);
    const texts = [correct, ...wrong].map((e) => e.join(' '));
    if (new Set(texts).size !== 5) continue;
    const choices = shuffleChoices(rng, texts[0], texts.slice(1));
    const options = choices.options.map((o) => o.split(' '));
    const pos = chainPositions(codes, correct);
    const [lx, ly] = pos.get(last)!;
    return {
      facts: { kind: 'coded-direction', codes, chain: [], ask: { t: 'which', of: last, wrt: first, dir: targetDir }, options },
      draft: {
        prompt: `In a certain code language:\n${codeLines(codes, letters)}\n\nWhich of the following expressions shows that point ${last} is to the ${dirWord(targetDir)} of point ${first}?`,
        ...choices,
        solution: {
          steps: [
            `Evaluate each option with ${first} at (0, 0):`,
            ...choices.options.map((o) => {
              const e = o.split(' ');
              const p = chainPositions(codes, e).get(last)!;
              const dd = dirOfVector(p[0], p[1]);
              return `${o} → ${last} at (${p[0]}, ${p[1]}), ${DIR_NAME[dd]} of ${first}${dd === targetDir ? ' ✓' : ''}`;
            }),
            `Answer: **${texts[0]}** (${last} at (${lx}, ${ly})).`,
          ],
          shortcut: `${DIR_NAME[targetDir]} needs ${targetDir.includes('N') ? 'a net north' : targetDir.includes('S') ? 'a net south' : 'no net north–south'} and ${targetDir.includes('E') ? 'a net east' : targetDir.includes('W') ? 'a net west' : 'no net east–west'} shift — check the signs before adding distances.`,
          trap: 'Each link says where the LEFT point is relative to the RIGHT point, so moving along the chain goes the opposite way.',
        },
        tags: ['direction:coded', 'direction:which-expression'],
        targetSeconds: targetSeconds('short-reasoning', d),
      },
    };
  }
  throw new Error('coded-direction: could not build a "which" item');
}
