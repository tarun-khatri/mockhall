/**
 * Runtime data for the misspelt-words chapter (HYB): the curated correct-word list, the dictionary-vetted
 * misspellings (built offline by scripts/banks/spelling-variants.ts — the runtime never needs a dictionary)
 * and the authored sentence frames.
 */
import type { Difficulty } from '../../../types';
import easyWords from './words-easy.json';
import mediumWords from './words-medium.json';
import hardWords from './words-hard.json';
import extremeWords from './words-extreme.json';
import variantsFile from './variants.json';
import framesFile from './frames.json';

/** Misspelling rule families (see scripts/banks/spelling-variants.ts). */
export type Family = 'dbl' | 'ie' | 'ance' | 'able' | 'sil' | 'vow' | 'sede' | 'e' | 'cs' | 'ord';

export interface WordEntry {
  /** Correct British/Indian spelling, lowercase. */
  w: string;
  /** Rule families that apply to this word. */
  f: Family[];
  /** Memory hook. */
  h: string;
  /** Word difficulty tier. */
  d: Difficulty;
}

export interface Variant {
  form: string;
  fam: Family;
}

export interface Frame {
  id: string;
  /** Sentence with exactly four `{word}` slots. */
  text: string;
  /** Slot words in sentence order. */
  words: string[];
}

type RawWord = { w: string; f: string[]; h: string };

const tiered: [Difficulty, RawWord[]][] = [
  ['easy', easyWords as RawWord[]],
  ['medium', mediumWords as RawWord[]],
  ['hard', hardWords as RawWord[]],
  ['extreme', extremeWords as RawWord[]],
];

const RAW_VARIANTS = (variantsFile as unknown as { variants: Record<string, [string, string][]> }).variants;

/** Every curated word that has at least two vetted misspellings (all of them, after the build script). */
export const WORDS: WordEntry[] = tiered.flatMap(([d, list]) =>
  list.filter((e) => (RAW_VARIANTS[e.w]?.length ?? 0) >= 2).map((e) => ({ w: e.w, f: e.f as Family[], h: e.h, d })),
);

export const WORD: ReadonlyMap<string, WordEntry> = new Map(WORDS.map((e) => [e.w, e]));

export const VARIANTS: ReadonlyMap<string, Variant[]> = new Map(
  Object.entries(RAW_VARIANTS).map(([w, list]) => [w, list.map(([form, fam]) => ({ form, fam: fam as Family }))]),
);

export const WORDS_BY_TIER: Record<Difficulty, WordEntry[]> = {
  easy: WORDS.filter((e) => e.d === 'easy'),
  medium: WORDS.filter((e) => e.d === 'medium'),
  hard: WORDS.filter((e) => e.d === 'hard'),
  extreme: WORDS.filter((e) => e.d === 'extreme'),
};

export const SLOT = /\{([a-z]+)\}/g;

export const FRAMES: Frame[] = (framesFile as { id: string; t: string }[]).map((f) => ({
  id: f.id,
  text: f.t,
  words: [...f.t.matchAll(SLOT)].map((m) => m[1]),
}));

export const TIER_RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2, extreme: 3 };
