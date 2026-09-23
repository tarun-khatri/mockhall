/**
 * R11 — Distance & direction. SPEC 8.2.
 *
 * Subtypes:
 *  - walk             turning walks: shortest distance / direction from the start
 *  - final-facing     facing direction after turns; rotated-compass variant
 *  - shadow           sunrise / sunset shadow logic
 *  - coded-direction  "A # B means A is 5 m north of B" chains
 *  - point-set        3-question set on 6–9 points (the 2024–26 prelims format)
 */
import type { GenMeta, SubtypeDef } from '../types';
import { defineGenerator } from '../types';
import { makeQuestion, makeSet, single } from '../shared/question';
import { targetSeconds } from '../../targets';
import { buildWalk, type WalkFacts } from './direction/walk';
import { buildFacing, type FacingFacts } from './direction/facing';
import { buildShadow, type ShadowFacts } from './direction/shadow';
import { buildCoded, type CodedFacts } from './direction/coded';
import { buildPointSet, type PointSetFacts } from './direction/points';

export type { WalkFacts, WalkLeg, LegTurn, WalkAsk } from './direction/walk';
export type { FacingFacts, FacingTurn } from './direction/facing';
export type { ShadowFacts, ShadowRel } from './direction/shadow';
export type { CodedFacts, CodeDef, CodedAsk } from './direction/coded';
export type { PointSetFacts, PointClue, PointQ } from './direction/points';
export type { Dir4, Dir8, DistDisplay } from './direction/geo';

export type DirectionFacts = WalkFacts | FacingFacts | ShadowFacts | CodedFacts | PointSetFacts;

const META: GenMeta = { name: 'reasoning.direction', version: 1, subject: 'reasoning', chapter: 'direction' };

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'walk', label: 'Walks and turns', weight: 2 },
  { id: 'final-facing', label: 'Final facing direction', weight: 1 },
  { id: 'shadow', label: 'Sun and shadow', weight: 0.5 },
  { id: 'coded-direction', label: 'Coded directions', weight: 0.5 },
  { id: 'point-set', label: 'Point-based set', weight: 3 },
];

export const generator = defineGenerator<DirectionFacts>(META, SUBTYPES, ({ meta, seed, difficulty, subtype, rng }) => {
  switch (subtype.id) {
    case 'walk': {
      const b = buildWalk(rng, difficulty);
      return { item: single(makeQuestion(meta, seed, { subtype: subtype.id, difficulty, ...b.draft })), facts: b.facts };
    }
    case 'final-facing': {
      const b = buildFacing(rng, difficulty);
      return { item: single(makeQuestion(meta, seed, { subtype: subtype.id, difficulty, ...b.draft })), facts: b.facts };
    }
    case 'shadow': {
      const b = buildShadow(rng, difficulty);
      return { item: single(makeQuestion(meta, seed, { subtype: subtype.id, difficulty, ...b.draft })), facts: b.facts };
    }
    case 'coded-direction': {
      const b = buildCoded(rng, difficulty);
      return { item: single(makeQuestion(meta, seed, { subtype: subtype.id, difficulty, ...b.draft })), facts: b.facts };
    }
    case 'point-set': {
      const b = buildPointSet(rng, difficulty);
      const item = makeSet(meta, seed, {
        kind: 'puzzle',
        subtype: subtype.id,
        difficulty,
        title: 'Direction and distance',
        stimulus: b.stimulus,
        targetSeconds: b.questions.length * targetSeconds('short-reasoning', difficulty),
        questions: b.questions,
      });
      return { item, facts: b.facts };
    }
    default:
      throw new Error(`${meta.name}: unhandled subtype ${subtype.id}`);
  }
});
