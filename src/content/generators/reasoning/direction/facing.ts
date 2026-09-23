/**
 * Final facing direction after a sequence of turns (left/right/about-turn/degrees clockwise or
 * anticlockwise), and the "rotated compass" variant ("If North-east becomes South, …").
 * Built backward: the final direction is chosen first; the last turn closes the gap.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty, Rich } from '../../../types';
import type { QuestionDraft } from '../../shared/question';
import { targetSeconds } from '../../../targets';
import { DIR8, DIR_NAME, angleOf, dirWord, directionChoices, He, his, opposite, person, rotate, type Dir8, type Person } from './geo';

export type FacingTurn = { how: 'left' | 'right' | 'back' } | { deg: number; cw: boolean; wording: 'clock' | 'side' };

export type FacingFacts =
  | { kind: 'final-facing'; variant: 'turns'; start: Dir8; turns: FacingTurn[] }
  | { kind: 'final-facing'; variant: 'rotated'; examples: [Dir8, Dir8][]; ask: Dir8 };

/** Clockwise angle of a turn. */
export function turnAngle(t: FacingTurn): number {
  if ('how' in t) return t.how === 'left' ? -90 : t.how === 'right' ? 90 : 180;
  return t.cw ? t.deg : -t.deg;
}

export function turnText(t: FacingTurn, p: Person): string {
  if ('how' in t) return t.how === 'back' ? 'takes an about-turn' : `turns to ${his(p)} ${t.how}`;
  if (t.wording === 'side') return `turns ${t.deg}° to ${his(p)} ${t.cw ? 'right' : 'left'}`;
  return `turns ${t.deg}° ${t.cw ? 'clockwise' : 'anticlockwise'}`;
}

const MAG: Record<Difficulty, number[]> = {
  easy: [90],
  medium: [45, 90, 135, 180],
  hard: [45, 90, 135, 180, 225, 270],
  extreme: [45, 90, 135, 180, 225, 270, 315],
};

function randomTurn(rng: Rng, d: Difficulty): FacingTurn {
  if (d === 'easy') return rng.chance(0.15) ? { how: 'back' } : { how: rng.pick(['left', 'right'] as const) };
  if (rng.chance(0.25)) return { how: rng.pick(['left', 'right'] as const) };
  const deg = rng.pick(MAG[d]);
  const cw = rng.chance(0.5);
  return { deg, cw, wording: deg <= 135 && rng.chance(0.35) ? 'side' : 'clock' };
}

/** Express a clockwise angle (mod 360, non-zero) as a turn allowed at this level, or null. */
function closingTurn(rng: Rng, d: Difficulty, angle: number): FacingTurn | null {
  const a = ((angle % 360) + 360) % 360;
  if (a === 0) return null;
  if (d === 'easy') {
    if (a === 90) return { how: 'right' };
    if (a === 270) return { how: 'left' };
    if (a === 180) return { how: 'back' };
    return null;
  }
  const opts: FacingTurn[] = [];
  if (MAG[d].includes(a)) opts.push({ deg: a, cw: true, wording: a <= 135 && rng.chance(0.3) ? 'side' : 'clock' });
  if (MAG[d].includes(360 - a)) opts.push({ deg: 360 - a, cw: false, wording: 360 - a <= 135 && rng.chance(0.3) ? 'side' : 'clock' });
  if (a === 90 || a === 270) opts.push({ how: a === 90 ? 'right' : 'left' });
  return opts.length ? rng.pick(opts) : null;
}

type Draft = Omit<QuestionDraft, 'subtype' | 'difficulty'>;

function buildTurns(rng: Rng, d: Difficulty): { facts: FacingFacts; draft: Draft } {
  const four = ['N', 'E', 'S', 'W'] as Dir8[];
  const answer: Dir8 = d === 'easy' ? rng.pick(four) : rng.pick(DIR8);
  const n = d === 'easy' ? rng.int(2, 3) : d === 'medium' ? rng.int(3, 4) : d === 'hard' ? rng.int(4, 5) : rng.int(5, 6);
  for (let attempt = 0; attempt < 300; attempt++) {
    const start: Dir8 = d === 'easy' ? rng.pick(four) : rng.pick(d === 'medium' ? four : DIR8);
    const turns: FacingTurn[] = [];
    for (let i = 0; i < n - 1; i++) turns.push(randomTurn(rng, d));
    const sum = turns.reduce((s, t) => s + turnAngle(t), 0);
    const last = closingTurn(rng, d, angleOf(answer) - angleOf(start) - sum);
    if (!last) continue;
    turns.push(last);
    const net = turns.reduce((s, t) => s + turnAngle(t), 0);
    if (rotate(start, net) !== answer) throw new Error('facing: construction mismatch');
    // mistakes
    const flipOne = (i: number) => rotate(start, net - 2 * turnAngle(turns[i]));
    const biggest = turns.reduce((bi, t, i) => (Math.abs(turnAngle(t)) > Math.abs(turnAngle(turns[bi])) ? i : bi), 0);
    const mirror = rotate(start, -net);
    const skipLast = rotate(start, net - turnAngle(turns[turns.length - 1]));
    const tempting: Dir8[] = [flipOne(biggest), mirror, skipLast, opposite(answer), flipOne(0)];
    const choices = directionChoices(rng, answer, tempting);
    const p = person(rng);
    const prompt = `${p.name} is standing facing ${dirWord(start)}. ${He(p)} ${turns.map((t) => turnText(t, p)).join(', then ')}. In which direction is ${p.g === 'm' ? 'he' : 'she'} facing now?`;
    const steps: Rich[] = [`Clockwise = +, anticlockwise = −; left = −90°, right = +90°, about-turn = 180°.`, `Start: ${DIR_NAME[start]}.`];
    let cur = start;
    for (const t of turns) {
      const a = turnAngle(t);
      cur = rotate(cur, a);
      steps.push(`${a > 0 ? '+' : '−'}${Math.abs(a)}° → ${DIR_NAME[cur]}`);
    }
    steps.push(`Final: **${DIR_NAME[answer]}**.`);
    const netNorm = ((net % 360) + 360) % 360;
    return {
      facts: { kind: 'final-facing', variant: 'turns', start, turns },
      draft: {
        prompt,
        ...choices,
        solution: {
          steps,
          shortcut: `Add the turns once: ${turns.map((t) => {
            const a = turnAngle(t);
            return `${a > 0 ? '+' : '−'}${Math.abs(a)}`;
          }).join(' ')} = ${net > 0 ? '+' : net < 0 ? '−' : ''}${Math.abs(net)}° ≡ ${netNorm}° clockwise from ${DIR_NAME[start]} → ${DIR_NAME[answer]}.`,
          trap: flipOne(biggest) !== answer ? `Taking the ${Math.abs(turnAngle(turns[biggest]))}° turn the wrong way gives ${DIR_NAME[flipOne(biggest)]}.` : `Mixing up left (anticlockwise) and right (clockwise) gives ${DIR_NAME[mirror]}.`,
        },
        tags: ['direction:final-facing', ...(turns.some((t) => 'deg' in t) ? ['direction:degree-turns'] : [])],
        targetSeconds: targetSeconds('short-reasoning', d),
      },
    };
  }
  throw new Error('final-facing: could not build');
}

function buildRotated(rng: Rng, d: Difficulty): { facts: FacingFacts; draft: Draft } {
  const r = rng.pick(d === 'hard' ? [90, 135, 225, 270] : [45, 135, 225, 315]);
  let picks = rng.sample(DIR8, 3);
  // Two examples that are equal or opposite would also fit a mirror image — keep them non-opposite.
  while (picks[1] === opposite(picks[0])) picks = rng.sample(DIR8, 3);
  const examples: [Dir8, Dir8][] = [
    [picks[0], rotate(picks[0], r)],
    [picks[1], rotate(picks[1], r)],
  ];
  const ask = picks[2];
  const answer = rotate(ask, r);
  const tempting: Dir8[] = [rotate(ask, -r), rotate(answer, 45), rotate(answer, -45), opposite(answer), ask];
  const choices = directionChoices(rng, answer, tempting);
  const prompt = `If ${DIR_NAME[examples[0][0]]} becomes ${DIR_NAME[examples[0][1]]}, ${DIR_NAME[examples[1][0]]} becomes ${DIR_NAME[examples[1][1]]}, and all the other directions change in the same manner, then what will ${DIR_NAME[ask]} become?`;
  return {
    facts: { kind: 'final-facing', variant: 'rotated', examples, ask },
    draft: {
      prompt,
      ...choices,
      solution: {
        steps: [
          `${DIR_NAME[examples[0][0]]} → ${DIR_NAME[examples[0][1]]} is a turn of ${r}° clockwise (${360 - r}° anticlockwise).`,
          `Check: ${DIR_NAME[examples[1][0]]} + ${r}° = ${DIR_NAME[examples[1][1]]} ✓`,
          `${DIR_NAME[ask]} + ${r}° = **${DIR_NAME[answer]}**.`,
        ],
        shortcut: 'Every direction is rotated by the same angle — find it from one example (count 45° steps clockwise) and apply it.',
        trap: `Rotating the other way (${r}° anticlockwise) gives ${DIR_NAME[rotate(ask, -r)]}.`,
      },
      tags: ['direction:final-facing', 'direction:rotated-compass'],
      targetSeconds: targetSeconds('short-reasoning', d),
    },
  };
}

export function buildFacing(rng: Rng, d: Difficulty): { facts: FacingFacts; draft: Draft } {
  if ((d === 'hard' && rng.chance(0.3)) || (d === 'extreme' && rng.chance(0.4))) return buildRotated(rng, d);
  return buildTurns(rng, d);
}
