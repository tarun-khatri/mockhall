/**
 * Runtime puzzle generator × independent verifier (SPEC 14.2). The solver is heavy, so this suite runs a modest
 * seed count (PROP_SEEDS caps it lower); every shipped bank set is re-verified in puzzles-banks.test.ts.
 */
import { describeGenerator, PROP_SEEDS } from '../../helpers/harness';
import { generator, type PuzzlesFacts } from '../../../src/content/generators/reasoning/puzzles';
import { verify } from '../../../src/content/verify/reasoning/puzzles';
import { measure } from '../../../src/content/generators/solver/puzzles/csp';
import { solverInput } from '../../../src/content/generators/reasoning/puzzles/clues';
import { levelOf } from '../../../src/content/generators/reasoning/puzzles/difficulty';
import type { Setup } from '../../../src/content/generators/reasoning/puzzles/setup';
import type { GenResult } from '../../../src/content/generators/types';

function puzzleSanity(res: GenResult<PuzzlesFacts>): string[] {
  const p: string[] = [];
  const f = res.facts;
  const set = res.item.set;
  if (!set || set.kind !== 'puzzle') p.push('not a puzzle set');
  const want = f.sub === 'comparison' ? 3 : 5;
  if (res.item.questions.length !== want) p.push(`${res.item.questions.length} questions (want ${want})`);
  const maxClues = { easy: 10, medium: 12, hard: 15, extreme: 18 }[res.item.questions[0].difficulty];
  if (f.clues.length < 4 || f.clues.length > maxClues) p.push(`${f.clues.length} clues`);
  if (new Set(f.names).size !== f.names.length) p.push('duplicate names');
  for (const c of f.clues) {
    if (c.k === 'val' || c.k === 'rval') {
      const ok = f.labels.measure === 'weight' ? c.v >= 35 && c.v <= 110 : c.v >= 140 && c.v <= 200;
      if (!ok) p.push(`unrealistic value ${c.v}`);
    }
  }
  // measured difficulty must equal the requested level (human-model solver)
  const setup = { sub: f.sub, difficulty: set!.difficulty, layout: f.layout, names: f.names, cats: f.cats, labels: f.labels } as Setup;
  const m = measure(solverInput(setup, f.clues));
  if (m.count !== 1) p.push('generator solver: not unique');
  const lvl = levelOf(f.sub, m.stats);
  if (lvl !== set!.difficulty) p.push(`measured level ${lvl} ≠ ${set!.difficulty}`);
  for (const q of res.item.questions) if (!q.solution.visual) p.push('no visual');
  return p;
}

describeGenerator(generator, { verify, sanity: puzzleSanity, seeds: Math.min(60, PROP_SEEDS) });
