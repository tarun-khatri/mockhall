/**
 * R8 Seating arrangement — set generator (5 questions per set), built backward:
 * hidden arrangement → pool of true exam-style clues → counterexample-guided selection until the constraint
 * solver finds exactly one arrangement → minimise → measure difficulty by simulating a human solve (case
 * splits) and keep only sets whose measured level matches. Questions are read from the unique arrangement.
 *
 * The runtime generator is used by the bank script (scripts/banks/seating.ts); the app serves the banks.
 */
import { defineGenerator, type SubtypeDef } from '../types';
import { makeSet } from '../shared/question';
import { setTargetSeconds } from '../../targets';
import type { Clue, FacingRule, LayoutKind } from '../solver/seating/model';
import { buildPuzzle, type Built } from './seating/build';
import type { FacingKey, SubtypeId } from './seating/config';
import { LEVELS } from './seating/config';
import type { AttrCat } from './seating/names';
import type { ClueItem } from './seating/pool';
import { Truth } from './seating/pool';
import { clueText, introText, stimulusText } from './seating/render';
import { derivation, visualOf, ctxOf } from './seating/explain';
import { buildQuestions, type QSpec } from './seating/questions';
import type { Difficulty } from '../../types';

export interface SeatingFacts {
  subtype: SubtypeId;
  layout: { kind: LayoutKind; len: number; facing: FacingRule };
  facingKey: FacingKey;
  names: string[];
  attrCat?: AttrCat;
  attrValues: string[];
  /** parallel rows: row members listed in the intro */
  membership: boolean;
  given: Clue[];
  /** structured clues, in the order printed */
  clues: ClueItem[];
  /** uncertain rows: N range the solver proved (lower bound = named persons, upper = derived bound) */
  nRange?: [number, number];
  questions: QSpec[];
  /** measured human-path case splits (difficulty evidence) */
  splits: number;
}

const diffs = (id: SubtypeId): Difficulty[] => (['easy', 'medium', 'hard', 'extreme'] as Difficulty[]).filter((d) => LEVELS[id][d]);

export const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'linear-single', label: 'Linear (single row)', weight: 1.4, difficulties: diffs('linear-single') },
  { id: 'linear-parallel', label: 'Parallel rows', weight: 1.2, difficulties: diffs('linear-parallel') },
  { id: 'linear-uncertain', label: 'Row with unknown count', weight: 2, difficulties: diffs('linear-uncertain') },
  { id: 'circular-inside', label: 'Circular (facing centre)', weight: 1.3, difficulties: diffs('circular-inside') },
  { id: 'circular-mixed', label: 'Circular (mixed facing)', weight: 0.6, difficulties: diffs('circular-mixed') },
  { id: 'square', label: 'Square table', weight: 1.8, difficulties: diffs('square') },
];

const TITLES: Record<SubtypeId, string> = {
  'linear-single': 'Linear seating',
  'linear-parallel': 'Parallel rows',
  'linear-uncertain': 'Row with an unknown number of persons',
  'circular-inside': 'Circular seating',
  'circular-mixed': 'Circular seating (mixed facing)',
  square: 'Square table',
};

export const generator = defineGenerator<SeatingFacts>(
  { name: 'reasoning.seating', version: 1, subject: 'reasoning', chapter: 'seating' },
  SUBTYPES,
  ({ meta, seed, difficulty, subtype, rng }) => {
    const id = subtype.id as SubtypeId;
    for (let round = 0; round < 20; round++) {
      const b: Built = buildPuzzle(rng.fork(`p${round}`), id, difficulty);
      const ctx = ctxOf(b);
      const T = new Truth(b.layout.kind === 'uncertain' ? { ...b.layout, len: b.truth.n } : b.layout, b.truth, b.names.length);
      const qs = buildQuestions({
        b,
        rng: rng.fork(`q${round}`),
        T,
        L: T.layout,
        ctx,
        difficulty,
        clueTexts: new Set(b.clues.map((c) => clueText(ctx, c))),
      });
      if (qs.length < 5) continue;
      const steps = derivation(b);
      const visual = visualOf(b, b.truth);
      const intro = introText(b);
      const item = makeSet(
        meta,
        seed,
        {
          kind: 'seating',
          subtype: id,
          difficulty,
          title: TITLES[id],
          stimulus: stimulusText(intro, ctx, b.clues),
          targetSeconds: setTargetSeconds('puzzle-set', difficulty, qs.length),
          questions: qs.map((q) => ({
            prompt: q.prompt,
            options: q.options,
            answerIndex: q.answerIndex,
            solution: { steps: [...steps, ...q.steps], ...(q.shortcut ? { shortcut: q.shortcut } : {}), ...(q.trap ? { trap: q.trap } : {}), visual },
            tags: [`seating:${id}`, ...q.tags],
          })),
        },
        { method: 'solver-unique' },
      );
      return {
        item,
        facts: {
          subtype: id,
          layout: { kind: b.layout.kind, len: b.layout.len, facing: b.layout.facing },
          facingKey: b.facingKey,
          names: b.names,
          ...(b.attrCat ? { attrCat: b.attrCat } : {}),
          attrValues: b.attrValues,
          membership: b.membership,
          given: b.given,
          clues: b.clues,
          ...(b.nRange ? { nRange: b.nRange } : {}),
          questions: qs.map((q) => q.spec),
          splits: b.hps.splits,
        },
      };
    }
    throw new Error(`reasoning.seating: no complete question set for ${id}/${difficulty}`);
  },
);
