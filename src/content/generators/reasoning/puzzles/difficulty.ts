/**
 * Measured difficulty (SPEC 7.6: "difficulty is measured, not guessed").
 *
 * The human-model solver (solver/puzzles/csp.ts `measure`) chains forward from the clues exactly as a candidate
 * does and, when stuck, opens cases on the entity whose options leave the fewest cases alive. We count the dead
 * cases — cases that are opened and later killed by some clue:
 *
 *   easy     0 dead cases (every placement follows by chaining; no case split)
 *   medium   1–3 dead cases (one small case split — typical clerk prelims)
 *   hard     4–10 dead cases (2–3 case splits)
 *   extreme  11+ dead cases (4+ case splits)
 *
 * Comparison mini-puzzles (5–7 persons) use 0 / 1–2 / 3–6 / 7+.
 */
import type { Difficulty } from '../../../types';
import type { SolveStats } from '../../solver/puzzles/csp';
import type { SubtypeId } from './setup';

export const LEVELS: readonly Difficulty[] = ['easy', 'medium', 'hard', 'extreme'];

export function levelRank(d: Difficulty): number {
  return LEVELS.indexOf(d);
}

export function levelOf(sub: SubtypeId, stats: SolveStats): Difficulty {
  if (stats.aborted) return 'extreme';
  const [m, h] = sub === 'comparison' ? [2, 6] : [3, 10];
  if (stats.dead === 0 && stats.splits === 0) return 'easy';
  if (stats.dead <= m) return 'medium';
  if (stats.dead <= h) return 'hard';
  return 'extreme';
}
