import type { Difficulty } from '../../../types';

/** Clue families: selection weights per level steer the style (direct → relative → negative/two-way). */
export type Family =
  | 'abs' // exact positions: extreme left end, k-th from an end, middle, Row 1, at a corner
  | 'rel' // k-th to the left/right of
  | 'relCount' // "only k persons sit between A and B when counted from the left of A"
  | 'gap' // only k persons sit between (two-way)
  | 'adj' // immediate neighbours (two-way)
  | 'end' // at one of the extreme ends (two-way)
  | 'neg' // not neighbours, neither … nor, not at an end, is not a …
  | 'face' // faces the centre / north
  | 'faceRel' // same/opposite direction, both neighbours face …, the one who … faces …
  | 'opp' // opposite / faces / diagonally opposite / directly behind
  | 'rowRel' // same row / different rows
  | 'asMany' // as many persons between A and B as between B and C
  | 'compound' // relative to "the one who sits …"
  | 'attr' // second attribute (profession, colour, city)
  | 'uncert'; // uncertain rows: persons to the right of, as many to the left of A as to the right of B

export type Weights = Partial<Record<Family, number>>;

export type FacingKey = 'north' | 'south' | 'mixed' | 'facing' | 'inside' | 'cin-mout' | 'cout-min' | 'all-in';

export interface LevelCfg {
  /** persons (row, circle, square), persons per row (parallel) or named persons (uncertain) */
  sizes: readonly number[];
  facings: readonly (readonly [FacingKey, number])[];
  attrs: boolean;
  /** accepted range of measured case splits */
  band: readonly [number, number];
  clueRange: readonly [number, number];
  weights: Weights;
  /** most exact-position clues allowed */
  maxAbs: number;
  /** fewest negative clues required */
  minNeg: number;
  /** parallel rows: probability that the intro lists who sits in which row */
  membership?: number;
  /** uncertain rows: extra unnamed persons (min, max) */
  extra?: readonly [number, number];
  /** keep redundant clues instead of minimising (easy sets read better with one or two direct extras) */
  keepExtra?: number;
}

export type SubtypeId = 'linear-single' | 'linear-parallel' | 'linear-uncertain' | 'circular-inside' | 'circular-mixed' | 'square';

const W_EASY: Weights = { abs: 3, rel: 6, gap: 1, adj: 1.5, end: 1, opp: 2, face: 3, faceRel: 0.5, neg: 0.3, attr: 0, uncert: 1.5, asMany: 0.5 };
const W_MED: Weights = { abs: 1, rel: 4, relCount: 1, gap: 3, adj: 2, end: 1.5, opp: 1.5, neg: 1.5, face: 1.5, faceRel: 1.2, rowRel: 1, asMany: 1.6, compound: 0.6, uncert: 2.5 };
const W_HARD: Weights = { abs: 0.4, rel: 2.5, relCount: 1.2, gap: 3, adj: 2, end: 2, opp: 1.2, neg: 3.5, face: 1, faceRel: 2, rowRel: 1.5, asMany: 1.2, compound: 1.5, uncert: 2 };
const W_EXT: Weights = { abs: 0.3, rel: 2, relCount: 1, gap: 3, adj: 2, end: 2, opp: 1, neg: 3.5, face: 1, faceRel: 2, rowRel: 1.5, asMany: 1, compound: 2, attr: 5, uncert: 2 };

export const LEVELS: Record<SubtypeId, Partial<Record<Difficulty, LevelCfg>>> = {
  'linear-single': {
    easy: { sizes: [5, 6], facings: [['north', 3], ['south', 1]], attrs: false, band: [0, 0], clueRange: [4, 9], weights: W_EASY, maxAbs: 3, minNeg: 0, keepExtra: 1 },
    medium: { sizes: [7, 8, 8], facings: [['north', 4], ['south', 1], ['mixed', 2]], attrs: false, band: [1, 1], clueRange: [6, 11], weights: W_MED, maxAbs: 2, minNeg: 0 },
    hard: { sizes: [9, 10], facings: [['north', 2], ['south', 1], ['mixed', 3]], attrs: false, band: [2, 3], clueRange: [8, 14], weights: W_HARD, maxAbs: 1, minNeg: 1 },
    extreme: { sizes: [10, 11, 12], facings: [['north', 2], ['south', 1], ['mixed', 2]], attrs: true, band: [4, 14], clueRange: [10, 20], weights: W_EXT, maxAbs: 1, minNeg: 2 },
  },
  'linear-parallel': {
    easy: { sizes: [4], facings: [['facing', 1]], attrs: false, band: [0, 0], clueRange: [4, 9], weights: W_EASY, maxAbs: 3, minNeg: 0, membership: 1, keepExtra: 1 },
    medium: { sizes: [5], facings: [['facing', 4], ['north', 1]], attrs: false, band: [1, 1], clueRange: [6, 12], weights: W_MED, maxAbs: 2, minNeg: 0, membership: 1 },
    hard: { sizes: [5], facings: [['facing', 3], ['north', 1]], attrs: false, band: [2, 3], clueRange: [8, 15], weights: W_HARD, maxAbs: 1, minNeg: 1, membership: 0.4 },
    extreme: { sizes: [5, 6], facings: [['facing', 3], ['north', 1]], attrs: true, band: [4, 14], clueRange: [10, 20], weights: W_EXT, maxAbs: 1, minNeg: 2, membership: 0.3 },
  },
  'linear-uncertain': {
    easy: { sizes: [5], facings: [['north', 1]], attrs: false, band: [0, 0], clueRange: [4, 9], weights: W_EASY, maxAbs: 3, minNeg: 0, extra: [3, 7], keepExtra: 1 },
    medium: { sizes: [6, 7], facings: [['north', 1]], attrs: false, band: [1, 1], clueRange: [6, 12], weights: W_MED, maxAbs: 2, minNeg: 0, extra: [4, 11] },
    hard: { sizes: [6, 7], facings: [['north', 1]], attrs: false, band: [2, 3], clueRange: [7, 13], weights: W_HARD, maxAbs: 2, minNeg: 0, extra: [4, 11] },
    extreme: { sizes: [8, 9], facings: [['north', 1]], attrs: false, band: [4, 14], clueRange: [9, 17], weights: W_EXT, maxAbs: 2, minNeg: 1, extra: [6, 15] },
  },
  'circular-inside': {
    easy: { sizes: [6], facings: [['inside', 1]], attrs: false, band: [0, 0], clueRange: [4, 8], weights: W_EASY, maxAbs: 0, minNeg: 0, keepExtra: 1 },
    medium: { sizes: [8], facings: [['inside', 1]], attrs: false, band: [1, 1], clueRange: [6, 11], weights: W_MED, maxAbs: 0, minNeg: 0 },
    hard: { sizes: [8, 10], facings: [['inside', 1]], attrs: false, band: [2, 3], clueRange: [8, 14], weights: W_HARD, maxAbs: 0, minNeg: 1 },
    extreme: { sizes: [10, 12], facings: [['inside', 1]], attrs: true, band: [4, 14], clueRange: [10, 20], weights: W_EXT, maxAbs: 0, minNeg: 2 },
  },
  'circular-mixed': {
    easy: { sizes: [6], facings: [['mixed', 1]], attrs: false, band: [0, 0], clueRange: [5, 10], weights: W_EASY, maxAbs: 0, minNeg: 0, keepExtra: 1 },
    medium: { sizes: [8], facings: [['mixed', 1]], attrs: false, band: [1, 1], clueRange: [7, 13], weights: W_MED, maxAbs: 0, minNeg: 0 },
    hard: { sizes: [8, 10], facings: [['mixed', 1]], attrs: false, band: [2, 3], clueRange: [9, 15], weights: W_HARD, maxAbs: 0, minNeg: 1 },
    extreme: { sizes: [10], facings: [['mixed', 1]], attrs: true, band: [4, 14], clueRange: [11, 20], weights: W_EXT, maxAbs: 0, minNeg: 2 },
  },
  square: {
    easy: { sizes: [8], facings: [['cin-mout', 3], ['all-in', 1]], attrs: false, band: [0, 0], clueRange: [5, 9], weights: W_EASY, maxAbs: 3, minNeg: 0, keepExtra: 1 },
    medium: { sizes: [8], facings: [['cin-mout', 3], ['cout-min', 1], ['all-in', 1]], attrs: false, band: [1, 1], clueRange: [6, 11], weights: W_MED, maxAbs: 2, minNeg: 0 },
    hard: { sizes: [8], facings: [['cin-mout', 2], ['cout-min', 1], ['mixed', 2]], attrs: false, band: [2, 3], clueRange: [8, 14], weights: W_HARD, maxAbs: 1, minNeg: 1 },
    extreme: { sizes: [8], facings: [['mixed', 2], ['cin-mout', 1]], attrs: true, band: [4, 14], clueRange: [10, 20], weights: W_EXT, maxAbs: 1, minNeg: 2 },
  },
};

/** Measured level from case splits (SPEC R8 ladder: E none, M one, H 2–3, X 4+). */
export function levelFromSplits(splits: number): Difficulty {
  if (splits <= 0) return 'easy';
  if (splits === 1) return 'medium';
  if (splits <= 3) return 'hard';
  return 'extreme';
}
