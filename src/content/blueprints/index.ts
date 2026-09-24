/**
 * Mock blueprints as data (SPEC 9.2). Adding a pattern is config, not code.
 * Subtype lists name what each generator/bank exposes; unknown subtypes are ignored at assembly time.
 */
import type { ChapterId, Difficulty, ExamId, Subject } from '../types';

export interface SlotSource {
  chapter: ChapterId;
  subtypes?: string[];
}

export interface BlueprintSlot {
  label: string;
  /** Questions this slot contributes. */
  count: number;
  /** Draw one set and take `count` questions from it. */
  set?: boolean;
  /** Candidate sources; one is chosen per item. */
  sources: SlotSource[];
  /** Slots sharing a group never repeat the same chapter + subtype (e.g. "no two puzzles of the same type"). */
  group?: string;
  /** Singles: cycle through sources without repeating a chapter until all have appeared. */
  rotate?: boolean;
}

export interface SectionBlueprint {
  id: string;
  subject: Subject;
  variant: string;
  label: string;
  total: number;
  slots: BlueprintSlot[];
  /** Used to top up if a set comes back shorter than its slot. */
  fallback: SlotSource[];
}

const BIG_PUZZLES: SlotSource = { chapter: 'puzzles', subtypes: ['floor', 'floor-flat', 'box', 'day', 'month', 'scheduling'] };
const BIG_SEATING: SlotSource = {
  chapter: 'seating',
  subtypes: ['linear-single', 'linear-parallel', 'linear-uncertain', 'circular-inside', 'circular-mixed', 'square'],
};

export const ARITHMETIC: SlotSource[] = (
  [
    'percentage',
    'profit-loss',
    'interest',
    'speed-distance',
    'boats-streams',
    'time-work',
    'ratio-proportion',
    'ages',
    'averages',
    'partnership',
    'mixtures',
    'mensuration',
    'pipes-cisterns',
  ] as ChapterId[]
).map((chapter) => ({ chapter }));

export const BLUEPRINTS: SectionBlueprint[] = [
  {
    id: 'reasoning-a',
    subject: 'reasoning',
    variant: 'A',
    label: 'SBI style',
    total: 35,
    slots: [
      { label: 'Seating arrangement', count: 5, set: true, sources: [BIG_SEATING], group: 'big' },
      { label: 'Puzzle', count: 5, set: true, sources: [BIG_PUZZLES], group: 'big' },
      { label: 'Puzzle / seating', count: 5, set: true, sources: [BIG_PUZZLES, BIG_SEATING], group: 'big' },
      { label: 'Comparison puzzle', count: 3, set: true, sources: [{ chapter: 'puzzles', subtypes: ['comparison'] }] },
      { label: 'Inequality', count: 3, sources: [{ chapter: 'inequality' }] },
      { label: 'Syllogism', count: 3, sources: [{ chapter: 'syllogism' }] },
      { label: 'Alphanumeric series', count: 5, set: true, sources: [{ chapter: 'series-pattern', subtypes: ['alphanumeric-set'] }] },
      { label: 'Direction', count: 2, sources: [{ chapter: 'direction', subtypes: ['walk', 'final-facing', 'shadow', 'coded-direction'] }] },
      { label: 'Blood relation', count: 2, sources: [{ chapter: 'blood-relation', subtypes: ['direct', 'coded', 'pointing'] }] },
      {
        label: 'Miscellaneous',
        count: 2,
        rotate: true,
        sources: [
          { chapter: 'series-pattern', subtypes: ['word-rearrange', 'letter-pairs', 'meaningful-word'] },
          { chapter: 'classification' },
          { chapter: 'order-ranking' },
        ],
      },
    ],
    fallback: [{ chapter: 'inequality' }, { chapter: 'syllogism' }],
  },
  {
    id: 'reasoning-b',
    subject: 'reasoning',
    variant: 'B',
    label: 'IBPS 2025 style',
    total: 35,
    slots: [
      { label: 'Seating arrangement', count: 5, set: true, sources: [BIG_SEATING], group: 'big' },
      { label: 'Puzzle', count: 5, set: true, sources: [BIG_PUZZLES], group: 'big' },
      { label: 'Puzzle / seating', count: 5, set: true, sources: [BIG_PUZZLES, BIG_SEATING], group: 'big' },
      { label: 'Coding–decoding', count: 5, set: true, sources: [{ chapter: 'coding-decoding', subtypes: ['sentence-coding'] }] },
      { label: 'Syllogism', count: 3, sources: [{ chapter: 'syllogism' }] },
      { label: 'Direction', count: 3, sources: [{ chapter: 'direction', subtypes: ['walk', 'final-facing', 'shadow', 'coded-direction'] }] },
      { label: 'Blood relation', count: 2, sources: [{ chapter: 'blood-relation', subtypes: ['direct', 'coded', 'pointing'] }] },
      { label: 'Inequality', count: 3, sources: [{ chapter: 'inequality' }] },
      { label: 'Series', count: 4, set: true, sources: [{ chapter: 'series-pattern', subtypes: ['alphanumeric-set'] }] },
    ],
    fallback: [{ chapter: 'inequality' }, { chapter: 'syllogism' }],
  },
  {
    id: 'quant-a',
    subject: 'quant',
    variant: 'A',
    label: 'Simplification + DI + caselet',
    total: 35,
    slots: [
      { label: 'Simplification & approximation', count: 12, sources: [{ chapter: 'simplification' }] },
      { label: 'Data interpretation', count: 5, set: true, group: 'di', sources: [{ chapter: 'data-interpretation', subtypes: ['table', 'bar', 'grouped-bar', 'line', 'multi-line', 'pie'] }] },
      { label: 'Data interpretation', count: 5, set: true, group: 'di', sources: [{ chapter: 'data-interpretation', subtypes: ['table', 'bar', 'grouped-bar', 'line', 'multi-line', 'pie'] }] },
      { label: 'Caselet', count: 3, set: true, sources: [{ chapter: 'data-interpretation', subtypes: ['caselet'] }] },
      { label: 'Arithmetic', count: 10, rotate: true, sources: ARITHMETIC },
    ],
    fallback: [{ chapter: 'simplification' }],
  },
  {
    id: 'quant-b',
    subject: 'quant',
    variant: 'B',
    label: 'Simplification + series + DI',
    total: 35,
    slots: [
      { label: 'Simplification & approximation', count: 10, sources: [{ chapter: 'simplification' }] },
      { label: 'Number series', count: 5, sources: [{ chapter: 'number-series' }] },
      { label: 'Data interpretation', count: 5, set: true, group: 'di', sources: [{ chapter: 'data-interpretation', subtypes: ['table', 'bar', 'grouped-bar', 'line', 'multi-line', 'pie'] }] },
      { label: 'Data interpretation', count: 5, set: true, group: 'di', sources: [{ chapter: 'data-interpretation', subtypes: ['table', 'bar', 'grouped-bar', 'line', 'multi-line', 'pie'] }] },
      { label: 'Arithmetic', count: 10, rotate: true, sources: ARITHMETIC },
    ],
    fallback: [{ chapter: 'simplification' }],
  },
  {
    id: 'quant-c',
    subject: 'quant',
    variant: 'C',
    label: '2024 style',
    total: 35,
    slots: [
      { label: 'Simplification & approximation', count: 15, sources: [{ chapter: 'simplification' }] },
      { label: 'Data interpretation', count: 5, set: true, sources: [{ chapter: 'data-interpretation', subtypes: ['table', 'bar', 'grouped-bar', 'line', 'multi-line', 'pie'] }] },
      { label: 'Number series', count: 5, sources: [{ chapter: 'number-series' }] },
      { label: 'Arithmetic', count: 10, rotate: true, sources: ARITHMETIC },
    ],
    fallback: [{ chapter: 'simplification' }],
  },
  {
    id: 'english-a',
    subject: 'english',
    variant: 'A',
    label: 'SBI style',
    total: 30,
    slots: [
      { label: 'Reading comprehension', count: 9, set: true, sources: [{ chapter: 'reading-comprehension' }] },
      { label: 'Error spotting', count: 5, sources: [{ chapter: 'error-spotting' }] },
      { label: 'Para jumbles', count: 5, set: true, sources: [{ chapter: 'para-jumbles' }] },
      { label: 'Fillers', count: 3, sources: [{ chapter: 'fillers' }] },
      { label: 'Misspelt words', count: 4, sources: [{ chapter: 'spelling' }] },
      { label: 'Phrase replacement', count: 3, sources: [{ chapter: 'phrase-replacement' }] },
      { label: 'Word usage / match the column', count: 1, sources: [{ chapter: 'word-usage' }, { chapter: 'match-column' }, { chapter: 'fillers' }] },
    ],
    fallback: [{ chapter: 'fillers' }, { chapter: 'error-spotting' }],
  },
  {
    id: 'english-b',
    subject: 'english',
    variant: 'B',
    label: 'IBPS style',
    total: 30,
    slots: [
      { label: 'Reading comprehension', count: 10, set: true, sources: [{ chapter: 'reading-comprehension' }] },
      { label: 'Error spotting', count: 5, sources: [{ chapter: 'error-spotting' }] },
      { label: 'Word swap', count: 5, sources: [{ chapter: 'word-swap' }] },
      { label: 'Para jumbles', count: 5, set: true, sources: [{ chapter: 'para-jumbles' }] },
      { label: 'Match the column', count: 2, sources: [{ chapter: 'match-column' }] },
      { label: 'Word usage', count: 1, sources: [{ chapter: 'word-usage' }] },
      { label: 'Fillers', count: 2, sources: [{ chapter: 'fillers' }] },
    ],
    fallback: [{ chapter: 'fillers' }, { chapter: 'error-spotting' }],
  },
];

/* ------------------------------------------------------------------ */
/* Mains (research/mains.md). Unavailable chapters top up from fallback */
/* ------------------------------------------------------------------ */

const CR: SlotSource[] = (['statement-conclusion', 'statement-assumption', 'statement-argument', 'course-of-action', 'cause-effect'] as ChapterId[]).map((chapter) => ({ chapter }));
const BIG_ANY = [BIG_PUZZLES, BIG_SEATING];
const DI_CHARTS: SlotSource = { chapter: 'data-interpretation', subtypes: ['table', 'bar', 'grouped-bar', 'line', 'multi-line', 'pie', 'missing-table', 'arithmetic-di'] };
const puzzleSets = (n: number): BlueprintSlot[] => Array.from({ length: n }, () => ({ label: 'Puzzle / seating', count: 5, set: true, sources: BIG_ANY, group: 'big' }));
const diSets = (n: number): BlueprintSlot[] => Array.from({ length: n }, () => ({ label: 'Data interpretation', count: 5, set: true, sources: [DI_CHARTS], group: 'di' }));

BLUEPRINTS.push(
  {
    id: 'reasoning-ibps-mains',
    subject: 'reasoning',
    variant: 'IBPS-M',
    label: 'IBPS Clerk mains',
    total: 40,
    slots: [
      ...puzzleSets(4),
      { label: 'Input–output', count: 3, set: true, sources: [{ chapter: 'input-output' }] },
      { label: 'Coded blood relation', count: 3, sources: [{ chapter: 'blood-relation', subtypes: ['coded', 'pointing'] }] },
      { label: 'Data sufficiency', count: 3, sources: [{ chapter: 'data-sufficiency' }] },
      { label: 'Coding–decoding', count: 3, sources: [{ chapter: 'coding-decoding', subtypes: ['letter-shift', 'reverse', 'opposite-letter', 'positional', 'letters-in-place'] }] },
      { label: 'Critical reasoning', count: 6, rotate: true, sources: CR },
      { label: 'Miscellaneous', count: 2, rotate: true, sources: [{ chapter: 'syllogism' }, { chapter: 'inequality' }] },
    ],
    fallback: [{ chapter: 'syllogism' }, { chapter: 'inequality' }],
  },
  {
    id: 'reasoning-sbi-mains',
    subject: 'reasoning',
    variant: 'SBI-M',
    label: 'SBI Clerk mains',
    total: 50,
    slots: [
      ...puzzleSets(4),
      { label: 'Input–output', count: 5, set: true, sources: [{ chapter: 'input-output' }] },
      { label: 'Coding–decoding', count: 5, set: true, sources: [{ chapter: 'coding-decoding', subtypes: ['sentence-coding'] }] },
      { label: 'Coded blood relation', count: 4, sources: [{ chapter: 'blood-relation', subtypes: ['coded', 'pointing'] }] },
      { label: 'Syllogism / inequality', count: 3, rotate: true, sources: [{ chapter: 'syllogism' }, { chapter: 'inequality', subtypes: ['coded', 'combined'] }] },
      { label: 'Data sufficiency', count: 4, sources: [{ chapter: 'data-sufficiency' }] },
      { label: 'Critical reasoning', count: 7, rotate: true, sources: CR },
      { label: 'Miscellaneous', count: 2, rotate: true, sources: [{ chapter: 'direction' }, { chapter: 'order-ranking' }] },
    ],
    fallback: [{ chapter: 'syllogism' }, { chapter: 'inequality' }],
  },
  {
    id: 'quant-ibps-mains',
    subject: 'quant',
    variant: 'IBPS-M',
    label: 'IBPS Clerk mains',
    total: 40,
    slots: [
      ...diSets(2),
      { label: 'Caselet', count: 5, set: true, sources: [{ chapter: 'data-interpretation', subtypes: ['caselet', 'arithmetic-di'] }] },
      { label: 'Arithmetic', count: 15, rotate: true, sources: ARITHMETIC },
      { label: 'Quadratic equations', count: 4, sources: [{ chapter: 'quadratic' }] },
      { label: 'Number series', count: 4, sources: [{ chapter: 'number-series' }] },
      { label: 'Approximation', count: 2, sources: [{ chapter: 'simplification', subtypes: ['approximation'] }] },
    ],
    fallback: [{ chapter: 'simplification' }],
  },
  {
    id: 'quant-sbi-mains',
    subject: 'quant',
    variant: 'SBI-M',
    label: 'SBI Clerk mains',
    total: 50,
    slots: [
      ...diSets(3),
      { label: 'Caselet', count: 5, set: true, sources: [{ chapter: 'data-interpretation', subtypes: ['caselet', 'arithmetic-di'] }] },
      { label: 'Arithmetic', count: 17, rotate: true, sources: ARITHMETIC },
      { label: 'Quadratic equations', count: 4, sources: [{ chapter: 'quadratic' }] },
      { label: 'Number series', count: 5, sources: [{ chapter: 'number-series' }] },
      { label: 'Approximation', count: 4, sources: [{ chapter: 'simplification', subtypes: ['approximation'] }] },
    ],
    fallback: [{ chapter: 'simplification' }],
  },
  {
    id: 'english-ibps-mains',
    subject: 'english',
    variant: 'IBPS-M',
    label: 'IBPS Clerk mains',
    total: 40,
    slots: [
      { label: 'Reading comprehension', count: 7, set: true, sources: [{ chapter: 'reading-comprehension' }], group: 'rc' },
      { label: 'Reading comprehension', count: 7, set: true, sources: [{ chapter: 'reading-comprehension' }], group: 'rc' },
      { label: 'Cloze test', count: 6, set: true, sources: [{ chapter: 'cloze' }] },
      { label: 'Para jumbles', count: 5, set: true, sources: [{ chapter: 'para-jumbles' }] },
      { label: 'Error spotting', count: 5, sources: [{ chapter: 'error-spotting' }] },
      { label: 'Word swap', count: 4, sources: [{ chapter: 'word-swap' }] },
      { label: 'Connectors', count: 3, sources: [{ chapter: 'connectors' }] },
      { label: 'Match the column', count: 3, sources: [{ chapter: 'match-column' }] },
    ],
    fallback: [{ chapter: 'fillers' }, { chapter: 'error-spotting' }, { chapter: 'phrase-replacement' }],
  },
  {
    id: 'english-sbi-mains',
    subject: 'english',
    variant: 'SBI-M',
    label: 'SBI Clerk mains',
    total: 40,
    slots: [
      { label: 'Reading comprehension', count: 8, set: true, sources: [{ chapter: 'reading-comprehension' }], group: 'rc' },
      { label: 'Reading comprehension', count: 7, set: true, sources: [{ chapter: 'reading-comprehension' }], group: 'rc' },
      { label: 'Para jumbles', count: 5, set: true, sources: [{ chapter: 'para-jumbles' }] },
      { label: 'Word swap / replacement', count: 5, rotate: true, sources: [{ chapter: 'word-swap' }, { chapter: 'phrase-replacement' }] },
      { label: 'Fillers', count: 4, sources: [{ chapter: 'fillers' }] },
      { label: 'Connectors', count: 3, sources: [{ chapter: 'connectors' }] },
      { label: 'Error spotting', count: 3, sources: [{ chapter: 'error-spotting' }] },
      { label: 'Word usage', count: 5, sources: [{ chapter: 'word-usage' }] },
    ],
    fallback: [{ chapter: 'fillers' }, { chapter: 'error-spotting' }, { chapter: 'phrase-replacement' }],
  },
);

/** Mains section settings (research/mains.md): questions, minutes, marks per question. GA is out of scope. */
export const MAINS: Record<ExamId, { label: string; order: Subject[]; sections: Record<Subject, { count: number; seconds: number; marks: number; title: string }> }> = {
  'sbi-clerk': {
    label: 'SBI Clerk mains',
    order: ['english', 'quant', 'reasoning'],
    sections: {
      english: { count: 40, seconds: 35 * 60, marks: 1, title: 'General English' },
      quant: { count: 50, seconds: 45 * 60, marks: 1, title: 'Quantitative Aptitude' },
      reasoning: { count: 50, seconds: 45 * 60, marks: 1.2, title: 'Reasoning Ability' },
    },
  },
  'ibps-clerk': {
    label: 'IBPS Clerk mains',
    order: ['english', 'reasoning', 'quant'],
    sections: {
      english: { count: 40, seconds: 35 * 60, marks: 1, title: 'English Language' },
      reasoning: { count: 40, seconds: 35 * 60, marks: 1.5, title: 'Reasoning Ability' },
      quant: { count: 40, seconds: 35 * 60, marks: 1.25, title: 'Quantitative Aptitude' },
    },
  },
};

export function blueprint(subject: Subject, variant = 'A'): SectionBlueprint {
  return BLUEPRINTS.find((b) => b.subject === subject && b.variant === variant) ?? BLUEPRINTS.find((b) => b.subject === subject && b.variant === 'A')!;
}

export function variantsFor(subject: Subject): string[] {
  return BLUEPRINTS.filter((b) => b.subject === subject).map((b) => b.variant);
}

export const SECTION_DEFAULTS: Record<Subject, { count: number; seconds: number; title: string }> = {
  english: { count: 30, seconds: 20 * 60, title: 'English Language' },
  quant: { count: 35, seconds: 20 * 60, title: 'Numerical Ability' },
  reasoning: { count: 35, seconds: 20 * 60, title: 'Reasoning Ability' },
};

export const EXAM_ORDER: Record<ExamId, Subject[]> = {
  'sbi-clerk': ['english', 'quant', 'reasoning'],
  'ibps-clerk': ['quant', 'english', 'reasoning'],
};

export const EXAM_LABEL: Record<ExamId, string> = { 'sbi-clerk': 'SBI Clerk', 'ibps-clerk': 'IBPS Clerk' };

export const MOCK_PRESETS: Record<'exam' | 'tough' | 'extreme', { label: string; mix: Record<Difficulty, number> }> = {
  exam: { label: 'Exam level', mix: { easy: 0.15, medium: 0.5, hard: 0.3, extreme: 0.05 } },
  tough: { label: 'Tough', mix: { easy: 0, medium: 0.35, hard: 0.45, extreme: 0.2 } },
  extreme: { label: 'Extreme', mix: { easy: 0, medium: 0.1, hard: 0.5, extreme: 0.4 } },
};

/** Mixed chapter practice (SPEC 7.3). */
export const MIXED_SHARES: Record<Difficulty, number> = { easy: 0.2, medium: 0.35, hard: 0.3, extreme: 0.15 };

/** Fixed mocks 01–30: fixed seeds and a documented variant per subject. */
export function fixedMockVariants(n: number): Record<Subject, string> {
  const quant = ['A', 'B', 'A', 'C', 'A', 'B'][(n - 1) % 6];
  const reasoning = n % 3 === 0 ? 'B' : 'A';
  return { english: 'A', quant, reasoning };
}
