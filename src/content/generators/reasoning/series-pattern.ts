/**
 * R3 — Arrangement & pattern (alphanumeric / number / letter / word series). SPEC 8.2.
 *
 * Subtypes:
 *  - alphanumeric-set  5 questions on one arrangement of letters, digits and symbols
 *  - number-set        3 questions on five three-digit numbers
 *  - word-rearrange    letters of a word arranged alphabetically
 *  - letter-pairs      pairs with as many letters between them as in the alphabet
 *  - meaningful-word   words from given letters / letter positions (curated anagram families)
 */
import type { GenMeta, SubtypeDef } from '../types';
import { defineGenerator } from '../types';
import { makeQuestion, makeSet, single } from '../shared/question';
import { targetSeconds } from '../../targets';
import { buildAlnumSet, type AlnumSetFacts } from './series-pattern/alnum';
import { buildNumberSet, type NumberSetFacts } from './series-pattern/numbers';
import { buildLetterPairs, buildWordRearrange, type LetterPairsFacts, type WordRearrangeFacts } from './series-pattern/words';
import { buildMeaningful, type MeaningfulFacts } from './series-pattern/meaningful';

export type { AlnumSetFacts, AlnumQ, ElClass, Cond, Removal, Segment, EndRef, Side } from './series-pattern/alnum';
export type { NumberSetFacts, NumQ, NumStep, NumCond, RankRef, Pos } from './series-pattern/numbers';
export type { WordRearrangeFacts, RearrangeVariant, LetterPairsFacts, PairMode } from './series-pattern/words';
export type { MeaningfulFacts, MeaningfulForm } from './series-pattern/meaningful';

export type SeriesPatternFacts = AlnumSetFacts | NumberSetFacts | WordRearrangeFacts | LetterPairsFacts | MeaningfulFacts;

const META: GenMeta = { name: 'reasoning.series-pattern', version: 1, subject: 'reasoning', chapter: 'series-pattern' };

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'alphanumeric-set', label: 'Alphanumeric arrangement set', weight: 3 },
  { id: 'number-set', label: 'Three-digit number set', weight: 2 },
  { id: 'word-rearrange', label: 'Letters rearranged', weight: 1 },
  { id: 'letter-pairs', label: 'Letter pairs', weight: 1.5 },
  { id: 'meaningful-word', label: 'Meaningful words', weight: 1.5 },
];

export const generator = defineGenerator<SeriesPatternFacts>(META, SUBTYPES, ({ meta, seed, difficulty, subtype, rng }) => {
  const per = targetSeconds('short-reasoning', difficulty);
  switch (subtype.id) {
    case 'alphanumeric-set': {
      const b = buildAlnumSet(rng, difficulty);
      const item = makeSet(meta, seed, {
        kind: 'series',
        subtype: subtype.id,
        difficulty,
        title: 'Alphanumeric series',
        stimulus: b.stimulus,
        targetSeconds: b.questions.length * per,
        questions: b.questions,
      });
      return { item, facts: b.facts };
    }
    case 'number-set': {
      const b = buildNumberSet(rng, difficulty);
      const item = makeSet(meta, seed, {
        kind: 'series',
        subtype: subtype.id,
        difficulty,
        title: 'Number-based series',
        stimulus: b.stimulus,
        targetSeconds: b.questions.length * per,
        questions: b.questions,
      });
      return { item, facts: b.facts };
    }
    case 'word-rearrange': {
      const b = buildWordRearrange(rng, difficulty);
      return { item: single(makeQuestion(meta, seed, { subtype: subtype.id, difficulty, ...b.draft })), facts: b.facts };
    }
    case 'letter-pairs': {
      const b = buildLetterPairs(rng, difficulty);
      return { item: single(makeQuestion(meta, seed, { subtype: subtype.id, difficulty, ...b.draft })), facts: b.facts };
    }
    case 'meaningful-word': {
      const b = buildMeaningful(rng, difficulty);
      return { item: single(makeQuestion(meta, seed, { subtype: subtype.id, difficulty, ...b.draft })), facts: b.facts };
    }
    default:
      throw new Error(`${meta.name}: unhandled subtype ${subtype.id}`);
  }
});
