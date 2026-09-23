/**
 * R7 — Order & ranking. SPEC 8.2.
 *
 * Subtypes:
 *  - position-both-ends  position from the other end, persons between, relative / middle position, rank lists
 *  - total-persons       total in a row (incl. overlap and the "order not given" trap)
 *  - interchange         two persons interchange places
 *  - comparison-single   height / weight / marks ordering asked as one question
 */
import type { GenMeta, SubtypeDef } from '../types';
import { defineGenerator } from '../types';
import { makeQuestion, single } from '../shared/question';
import { buildInterchange, buildPositionBothEnds, buildTotal, type RowFacts } from './order-ranking/row';
import { buildCompare, type CompareFacts } from './order-ranking/compare';

export type { RowFacts, RowStmt, RowAsk, End } from './order-ranking/row';
export type { CompareFacts, CmpClue, CmpAsk, Attr } from './order-ranking/compare';

export type OrderRankingFacts = RowFacts | CompareFacts;

const META: GenMeta = { name: 'reasoning.order-ranking', version: 1, subject: 'reasoning', chapter: 'order-ranking' };

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'position-both-ends', label: 'Position from both ends', weight: 1.5 },
  { id: 'total-persons', label: 'Total persons in a row', weight: 1 },
  { id: 'interchange', label: 'Interchanging positions', weight: 1 },
  { id: 'comparison-single', label: 'Comparison (height/weight/marks)', weight: 2 },
];

export const generator = defineGenerator<OrderRankingFacts>(META, SUBTYPES, ({ meta, seed, difficulty, subtype, rng }) => {
  const b =
    subtype.id === 'position-both-ends'
      ? buildPositionBothEnds(rng, difficulty)
      : subtype.id === 'total-persons'
        ? buildTotal(rng, difficulty)
        : subtype.id === 'interchange'
          ? buildInterchange(rng, difficulty)
          : buildCompare(rng, difficulty);
  return { item: single(makeQuestion(meta, seed, { subtype: subtype.id, difficulty, ...b.draft })), facts: b.facts };
});
