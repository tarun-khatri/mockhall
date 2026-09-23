/**
 * Sun and shadow: after sunrise the sun is in the east, so shadows fall towards the west; before sunset the
 * sun is in the west and shadows fall towards the east. Asked: the direction someone is facing (or the other
 * person in a face-to-face pair), optionally after further turns.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty, Rich } from '../../../types';
import type { QuestionDraft } from '../../shared/question';
import { targetSeconds } from '../../../targets';
import { DIR_NAME, angleOf, dirWord, directionChoices, he, He, his, him, opposite, rotate, twoPeople, person, type Dir8 } from './geo';
import { turnAngle, turnText, type FacingTurn } from './facing';

export type ShadowRel = 'front' | 'right' | 'behind' | 'left';
export interface ShadowFacts {
  kind: 'shadow';
  time: 'morning' | 'evening';
  /** own: the person's own shadow; pole: facing a pole, the pole's shadow; pair: two people face to face. */
  form: 'own' | 'pole' | 'pair';
  rel: ShadowRel;
  /** Turns made afterwards (hard/extreme). */
  turns: FacingTurn[];
  /** facing: the person's facing (after the turns); other: the other person of the pair. */
  ask: 'facing' | 'other';
}

const REL_ANGLE: Record<ShadowRel, number> = { front: 0, right: 90, behind: 180, left: 270 };
const REL_OF_ANGLE: Record<number, ShadowRel> = { 0: 'front', 90: 'right', 180: 'behind', 270: 'left' };

export const shadowDir = (time: 'morning' | 'evening'): Dir8 => (time === 'morning' ? 'W' : 'E');

function relText(rel: ShadowRel, possessive: string, objective: string): string {
  switch (rel) {
    case 'front':
      return `exactly in front of ${objective}`;
    case 'behind':
      return `exactly behind ${objective}`;
    default:
      return `exactly to ${possessive} ${rel}`;
  }
}

type Draft = Omit<QuestionDraft, 'subtype' | 'difficulty'>;

export function buildShadow(rng: Rng, d: Difficulty): { facts: ShadowFacts; draft: Draft } {
  const time = rng.pick(['morning', 'evening'] as const);
  const sd = shadowDir(time);
  const form: ShadowFacts['form'] = d === 'easy' ? rng.pick(['own', 'pole'] as const) : rng.pick(['own', 'pole', 'pair'] as const);
  // facing of the (first) person, chosen first
  const cardinals: Dir8[] = form === 'pole' ? ['N', 'S'] : ['N', 'E', 'S', 'W'];
  const facing = rng.pick(cardinals);
  const rel = REL_OF_ANGLE[(((angleOf(sd) - angleOf(facing)) % 360) + 360) % 360];
  const turns: FacingTurn[] = [];
  if (d === 'hard' || d === 'extreme') {
    const n = d === 'hard' ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const deg = rng.pick(d === 'hard' ? [90, 45, 135] : [45, 90, 135, 180, 225]);
      turns.push(deg === 90 && rng.chance(0.5) ? { how: rng.pick(['left', 'right'] as const) } : { deg, cw: rng.chance(0.5), wording: 'clock' });
    }
  }
  const ask: ShadowFacts['ask'] = form === 'pair' && !turns.length ? 'other' : 'facing';
  const net = turns.reduce((s, t) => s + turnAngle(t), 0);
  const answer = ask === 'other' ? opposite(facing) : rotate(facing, net);

  // Mistakes: wrong sun side, left/right (or front/behind) swapped, answering for the wrong person, the shadow's own direction.
  const solveFacing = (shadow: Dir8, r: ShadowRel) => rotate(shadow, -REL_ANGLE[r]);
  const SWAP: Record<ShadowRel, ShadowRel> = { left: 'right', right: 'left', front: 'behind', behind: 'front' };
  const wrongSunF = solveFacing(opposite(sd), rel);
  const swappedF = solveFacing(sd, SWAP[rel]);
  const wrongSun = rotate(wrongSunF, net);
  const tempting: Dir8[] =
    ask === 'other'
      ? [facing, opposite(wrongSunF), opposite(swappedF), sd]
      : [wrongSun, rotate(swappedF, net), opposite(answer), sd, ...(turns.length ? [facing, rotate(facing, -net)] : [])];
  const choices = directionChoices(rng, answer, tempting);

  const [a, b] = twoPeople(rng);
  const p = form === 'pair' ? a : person(rng);
  const when = time === 'morning' ? 'One morning, a little after sunrise,' : 'One evening, a little before sunset,';
  let setup: string;
  if (form === 'own') setup = `${when} ${p.name} was standing in an open ground. ${his(p)[0].toUpperCase() + his(p).slice(1)} shadow fell ${relText(rel, his(p), him(p))}.`;
  else if (form === 'pole') setup = `${when} ${p.name} was standing facing a pole. The shadow of the pole fell ${relText(rel, his(p), him(p))}.`;
  else setup = `${when} ${a.name} and ${b.name} were talking to each other, face to face. ${a.name}'s shadow fell ${relText(rel, his(a), him(a))}.`;
  const turnPart = turns.length ? ` ${He(p)} then ${turns.map((t) => turnText(t, p)).join(', and then ')}.` : '';
  const question =
    ask === 'other'
      ? `In which direction was ${b.name} facing?`
      : turns.length
        ? `In which direction is ${p.name} facing now?`
        : `In which direction was ${p.name} facing?`;
  const steps: Rich[] = [
    time === 'morning' ? 'In the morning the sun is in the east, so shadows fall towards the west.' : 'In the evening the sun is in the west, so shadows fall towards the east.',
    `The shadow (${dirWord(sd)}) is ${rel === 'front' ? 'in front' : rel === 'behind' ? 'behind' : 'to the ' + rel} of ${form === 'pair' ? a.name : p.name}, so ${form === 'pair' ? a.name : he(p)} faces **${DIR_NAME[facing]}**.`,
  ];
  if (ask === 'other') steps.push(`${b.name} faces ${a.name}, i.e. the opposite way: **${DIR_NAME[answer]}**.`);
  let cur = facing;
  for (const t of turns) {
    cur = rotate(cur, turnAngle(t));
    steps.push(`${turnText(t, p)[0].toUpperCase() + turnText(t, p).slice(1)} → ${DIR_NAME[cur]}.`);
  }
  if (turns.length) steps.push(`Final: **${DIR_NAME[answer]}**.`);
  return {
    facts: { kind: 'shadow', time, form, rel, turns, ask },
    draft: {
      prompt: `${setup}${turnPart} ${question}`,
      ...choices,
      solution: {
        steps,
        shortcut: `Fix the shadow first (${time}: ${dirWord(sd)}), then turn the person so the shadow is on the stated side.`,
        trap:
          ask === 'other'
            ? `${DIR_NAME[facing]} is ${a.name}'s direction; ${b.name} faces the opposite way.`
            : `Taking the ${time} sun on the wrong side (shadow towards the ${dirWord(opposite(sd))}) gives ${DIR_NAME[ask === 'facing' ? wrongSun : opposite(wrongSunF)]}.`,
      },
      tags: ['direction:shadow', `direction:shadow-${time}`],
      targetSeconds: targetSeconds('short-reasoning', d),
    },
  };
}
