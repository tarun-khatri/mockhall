import type { Difficulty } from './types';

/** SPEC.md 7.3 — target seconds per question (single kinds) or per whole set (set kinds). */
export type TargetKind =
  | 'simplification'
  | 'arithmetic'
  | 'number-series'
  | 'quadratic'
  | 'di-set'
  | 'caselet-set'
  | 'puzzle-set'
  | 'short-reasoning'
  | 'critical-reasoning'
  | 'english-single'
  | 'parajumble-set'
  | 'rc-set'
  | 'cloze-set';

export const TARGETS: Record<TargetKind, Record<Difficulty, number>> = {
  simplification: { easy: 20, medium: 30, hard: 45, extreme: 60 },
  arithmetic: { easy: 35, medium: 50, hard: 75, extreme: 110 },
  'number-series': { easy: 25, medium: 35, hard: 50, extreme: 70 },
  quadratic: { easy: 25, medium: 35, hard: 45, extreme: 60 },
  'di-set': { easy: 200, medium: 270, hard: 360, extreme: 450 },
  'caselet-set': { easy: 120, medium: 160, hard: 220, extreme: 280 },
  'puzzle-set': { easy: 180, medium: 270, hard: 380, extreme: 500 },
  'short-reasoning': { easy: 20, medium: 30, hard: 45, extreme: 65 },
  'critical-reasoning': { easy: 35, medium: 50, hard: 70, extreme: 90 },
  'english-single': { easy: 20, medium: 30, hard: 40, extreme: 55 },
  'parajumble-set': { easy: 150, medium: 200, hard: 260, extreme: 320 },
  'rc-set': { easy: 300, medium: 390, hard: 480, extreme: 600 },
  'cloze-set': { easy: 150, medium: 210, hard: 270, extreme: 330 },
};

/** Nominal question count the set targets were written for. RC is per passage regardless of count. */
const NOMINAL_SET_SIZE: Partial<Record<TargetKind, number>> = {
  'di-set': 5,
  'caselet-set': 3,
  'puzzle-set': 5,
  'parajumble-set': 5,
  'cloze-set': 6,
};

export function targetSeconds(kind: TargetKind, difficulty: Difficulty): number {
  return TARGETS[kind][difficulty];
}

/** Whole-set target, scaled when the set has a different number of questions than nominal. */
export function setTargetSeconds(kind: TargetKind, difficulty: Difficulty, questionCount: number): number {
  const base = TARGETS[kind][difficulty];
  const nominal = NOMINAL_SET_SIZE[kind];
  if (!nominal) return base;
  return Math.round((base * questionCount) / nominal);
}
