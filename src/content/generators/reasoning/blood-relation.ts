/**
 * R10 — Blood relation. SPEC 8.2.
 *
 * Subtypes:
 *  - direct         statement chains ("A is the brother of B. B is the daughter of C …")
 *  - coded          "A + B means A is the father of B" expressions
 *  - pointing       "Pointing to a photograph, Ravi said …" (incl. "only son" traps)
 *  - family-puzzle  3 questions on a 3-generation family of up to 8 members (the 2024–26 prelims format)
 * "Cannot be determined" (always option E where offered) is correct only when the asked person's gender is
 * genuinely not fixed by the statements.
 */
import type { GenMeta, SubtypeDef } from '../types';
import { defineGenerator } from '../types';
import { makeQuestion, makeSet, single } from '../shared/question';
import { targetSeconds } from '../../targets';
import { buildCoded, buildDirect, buildPointing, buildPuzzle, type CodedFacts, type DirectFacts, type PointingFacts, type PuzzleFacts } from './blood-relation/build';

export type { CodedFacts, DirectFacts, PointingFacts, PuzzleFacts, PuzzleQ, PStep } from './blood-relation/build';
export type { Stmt, Rel, G } from './blood-relation/family';

export type BloodRelationFacts = DirectFacts | CodedFacts | PointingFacts | PuzzleFacts;

const META: GenMeta = { name: 'reasoning.blood-relation', version: 1, subject: 'reasoning', chapter: 'blood-relation' };

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'direct', label: 'Statement chains', weight: 2 },
  { id: 'coded', label: 'Coded relations', weight: 1 },
  { id: 'pointing', label: 'Pointing to a photograph', weight: 1.5 },
  { id: 'family-puzzle', label: 'Family puzzle set', weight: 3 },
];

export const generator = defineGenerator<BloodRelationFacts>(META, SUBTYPES, ({ meta, seed, difficulty, subtype, rng }) => {
  switch (subtype.id) {
    case 'direct': {
      const b = buildDirect(rng, difficulty);
      return { item: single(makeQuestion(meta, seed, { subtype: subtype.id, difficulty, ...b.draft })), facts: b.facts };
    }
    case 'coded': {
      const b = buildCoded(rng, difficulty);
      return { item: single(makeQuestion(meta, seed, { subtype: subtype.id, difficulty, ...b.draft })), facts: b.facts };
    }
    case 'pointing': {
      const b = buildPointing(rng, difficulty);
      return { item: single(makeQuestion(meta, seed, { subtype: subtype.id, difficulty, ...b.draft })), facts: b.facts };
    }
    case 'family-puzzle': {
      const b = buildPuzzle(rng, difficulty);
      const item = makeSet(meta, seed, {
        kind: 'puzzle',
        subtype: subtype.id,
        difficulty,
        title: 'Family puzzle',
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
