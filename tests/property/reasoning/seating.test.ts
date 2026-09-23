/**
 * reasoning.seating — property test of the runtime generator against the independent (text-parsing,
 * geometric) verifier. Puzzles are slow to build, so the seed count is modest; override with SEATING_SEEDS.
 *   $env:SEATING_SEEDS=20; npx vitest run tests/property/reasoning/seating.test.ts --maxWorkers=1
 */
import { describeGenerator } from '../../helpers/harness';
import { generator, type SeatingFacts } from '../../../src/content/generators/reasoning/seating';
import { verify } from '../../../src/content/verify/reasoning/seating';
import { levelFromSplits } from '../../../src/content/generators/reasoning/seating/config';
import type { GenResult } from '../../../src/content/generators/types';

const SEEDS = Number(process.env.SEATING_SEEDS ?? 60);

function sanity(res: GenResult<SeatingFacts>): string[] {
  const p: string[] = [];
  const { item, facts } = res;
  const set = item.set;
  if (!set || set.kind !== 'seating') return ['not a seating set'];
  if (item.questions.length !== 5) p.push(`${item.questions.length} questions`);
  const clueLines = set.stimulus.split('\n\n')[1]?.split('\n') ?? [];
  if (clueLines.length < 3 || clueLines.length > 22) p.push(`${clueLines.length} clues`);
  if (set.stimulus.length > 3000) p.push('stimulus too long');
  if (new Set(facts.names).size !== facts.names.length) p.push('duplicate names');
  if (levelFromSplits(facts.splits) !== set.difficulty) p.push(`measured level ${levelFromSplits(facts.splits)} (splits ${facts.splits})`);
  for (const q of item.questions) {
    if (!q.solution.visual) p.push('no visual');
    if (q.solution.steps.length > 22) p.push('solution too long');
    if (q.verification.method !== 'solver-unique') p.push('verification method');
  }
  if (facts.questions.length !== item.questions.length) p.push('question specs');
  return p;
}

describeGenerator(generator, { verify, sanity, seeds: SEEDS, difficulties: ['easy', 'medium', 'hard'] });
// extreme sets take seconds each to build; fewer seeds here, the bank test re-verifies every shipped extreme set
describeGenerator(generator, { verify, sanity, seeds: Math.max(5, Math.round(SEEDS / 3)), difficulties: ['extreme'] });
