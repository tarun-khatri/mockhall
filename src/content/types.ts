/**
 * Core content data model (SPEC.md section 6).
 * This file is a shared contract: generators, authored banks, the exam engine and the UI all build on it.
 */

export type Subject = 'english' | 'quant' | 'reasoning';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard', 'extreme'];
export const DIFFICULTY_LETTER: Record<Difficulty, string> = { easy: 'e', medium: 'm', hard: 'h', extreme: 'x' };

/**
 * Rich text: plain text with a tiny markdown subset (see src/content/rich.ts).
 *  - `**bold**`, `*italic*`
 *  - `$...$` inline KaTeX (fractions, roots, powers). Never use `$` for currency — use ₹.
 *  - `\n` line break, `\n\n` paragraph break, lines starting with `- ` are bullet items.
 *  - Escape a literal `$`, `*` or `\` as `\$`, `\*`, `\\`.
 *  - No raw HTML.
 */
export type Rich = string;

export type QuantChapter =
  | 'simplification'
  | 'number-series'
  | 'percentage'
  | 'profit-loss'
  | 'ratio-proportion'
  | 'partnership'
  | 'speed-distance'
  | 'boats-streams'
  | 'interest'
  | 'averages'
  | 'time-work'
  | 'pipes-cisterns'
  | 'quadratic'
  | 'mensuration'
  | 'data-interpretation'
  | 'ages'
  | 'mixtures';

export type ReasoningChapter =
  | 'coding-decoding'
  | 'classification'
  | 'series-pattern'
  | 'inequality'
  | 'syllogism'
  | 'input-output'
  | 'order-ranking'
  | 'seating'
  | 'puzzles'
  | 'blood-relation'
  | 'direction'
  | 'data-sufficiency'
  | 'statement-conclusion'
  | 'statement-assumption'
  | 'statement-argument'
  | 'course-of-action'
  | 'cause-effect';

export type EnglishChapter =
  | 'grammar'
  | 'error-spotting'
  | 'phrase-replacement'
  | 'fillers'
  | 'connectors'
  | 'spelling'
  | 'word-swap'
  | 'word-usage'
  | 'cloze'
  | 'reading-comprehension'
  | 'para-jumbles'
  | 'match-column'
  | 'para-filler'
  | 'para-summary';

export type ChapterId = QuantChapter | ReasoningChapter | EnglishChapter;

export type VerificationMethod = 'computed+independent' | 'solver-unique' | 'blind-solve';

export interface Solution {
  /** One operation per step, units shown. */
  steps: Rich[];
  /** The fastest exam method. */
  shortcut?: Rich;
  /** Why the most tempting wrong option is wrong. */
  trap?: Rich;
  /** Diagram generated from ground truth. */
  visual?: VisualSpec;
  /** English: grammar rule name. */
  rule?: string;
}

export interface Question {
  /** Stable id: `${subject}.${chapter}.${subtype}.${difficultyLetter}.${hash}` */
  id: string;
  subject: Subject;
  chapter: ChapterId;
  subtype: string;
  difficulty: Difficulty;
  /** Shared stimulus (puzzle, DI, RC, cloze, para jumble, caselet). */
  setId?: string;
  prompt: Rich;
  /** Exactly 5, all distinct after normalisation. */
  options: [Rich, Rich, Rich, Rich, Rich];
  answerIndex: 0 | 1 | 2 | 3 | 4;
  targetSeconds: number;
  solution: Solution;
  /** Concept tags, e.g. "grammar:subject-verb-agreement", "trick:successive-percent". */
  tags: string[];
  source: 'generator' | 'authored';
  generator?: { name: string; version: number; seed: string };
  verification: { method: VerificationMethod; passedAt: string };
}

export type SetKind =
  | 'puzzle'
  | 'seating'
  | 'di'
  | 'caselet'
  | 'rc'
  | 'cloze'
  | 'parajumble'
  | 'coding'
  | 'input-output'
  | 'series';

export interface QuestionSet {
  id: string;
  subject: Subject;
  chapter: ChapterId;
  kind: SetKind;
  /** Generator / bank subtype of the whole set (used for "Try a similar one" and analytics). */
  subtype: string;
  difficulty: Difficulty;
  /** Short heading shown in the stimulus panel, e.g. "Floor puzzle" or "Passage: The millet revival". */
  title?: string;
  /** Clues, passage, caselet text. */
  stimulus: Rich;
  chart?: ChartSpec;
  table?: TableSpec;
  questionIds: string[];
  /** Target for the whole set, seconds. */
  targetSeconds: number;
}

/** One unit produced by a generator or drawn from a bank: a single question, or a set with its questions. */
export interface Item {
  set?: QuestionSet;
  questions: Question[];
}

/* ------------------------------------------------------------------ */
/* Charts and tables (DI)                                              */
/* ------------------------------------------------------------------ */

export interface Series {
  name: string;
  values: number[];
}

export type ChartSpec =
  | {
      /** Single series = simple bar; 2–3 series = grouped bars. */
      type: 'bar';
      title?: string;
      categories: string[];
      series: Series[];
      yLabel?: string;
      /** Printed next to values, e.g. "₹ crore" or "%" — keep short. */
      unit?: string;
    }
  | {
      type: 'stacked-bar';
      title?: string;
      categories: string[];
      series: Series[];
      yLabel?: string;
      unit?: string;
    }
  | {
      /** Single or multi-line. */
      type: 'line';
      title?: string;
      categories: string[];
      series: Series[];
      yLabel?: string;
      unit?: string;
    }
  | {
      type: 'pie';
      title?: string;
      slices: { label: string; value: number }[];
      /** How the values are printed: percentages (sum 100) or degrees (sum 360). */
      valueKind: 'percent' | 'degree';
      /** e.g. "Total = 2,400 students" */
      note?: string;
    };

export interface TableSpec {
  title?: string;
  columns: string[];
  /** Cells as display strings or numbers. Use "?" for missing-value tables. */
  rows: (string | number)[][];
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Solution visuals — always generated from ground truth               */
/* ------------------------------------------------------------------ */

export type Facing = 'north' | 'south' | 'east' | 'west' | 'inside' | 'outside';

export interface Seat {
  /** Person name, or '' for an empty seat. */
  name: string;
  facing?: Facing;
  /** Second attribute, e.g. profession or colour. */
  note?: string;
}

export interface SeatRow {
  label?: string;
  /** Seats listed left → right as seen from above (west → east). */
  seats: Seat[];
}

export interface VennWorld {
  label?: string;
  /** Non-empty Venn regions; a region is the sorted list of sets it lies in, e.g. ['A','B']. */
  regions: string[][];
}

export interface FamilyMember {
  id: string;
  name: string;
  gender: 'm' | 'f' | '?';
  /** 0 = oldest generation shown. */
  generation: number;
}

export type FamilyLink = { type: 'spouse'; a: string; b: string } | { type: 'parent'; parent: string; child: string };

export type VisualSpec =
  | { type: 'linear'; rows: SeatRow[]; caption?: string }
  | {
      /** Seats listed clockwise starting from the top (12 o'clock). */
      type: 'circular';
      seats: Seat[];
      caption?: string;
    }
  | {
      /** 8 positions listed clockwise starting from the top-left corner: corner, middle, corner, middle… */
      type: 'square';
      shape: 'square' | 'rectangle';
      seats: Seat[];
      caption?: string;
    }
  | {
      /** Generic grid for floor / box / day / month / scheduling puzzles. First column is usually the slot. */
      type: 'grid';
      columns: string[];
      rows: string[][];
      caption?: string;
    }
  | { type: 'venn'; sets: string[]; worlds: VennWorld[]; caption?: string }
  | {
      type: 'path';
      /** Walk points in order; (0,0) is the start. x grows east, y grows north. */
      points: { x: number; y: number; label?: string }[];
      unit: string;
      /** Straight-line answer segment between two point labels. */
      shortest?: { from: string; to: string; label: string };
      caption?: string;
    }
  | { type: 'family'; members: FamilyMember[]; links: FamilyLink[]; caption?: string }
  | {
      /** Inequality chain, e.g. "P > Q ≥ R = S"; highlight = [start, end] char ranges to emphasise. */
      type: 'chain';
      lines: { text: string; highlight?: [number, number][] }[];
      caption?: string;
    }
  | {
      /** Ordered list, e.g. comparison puzzles: tallest → shortest. */
      type: 'order';
      items: string[];
      label?: string;
      caption?: string;
    };

/* ------------------------------------------------------------------ */
/* Tests and attempts                                                  */
/* ------------------------------------------------------------------ */

export type TestKind = 'practice' | 'chapter-test' | 'sectional' | 'full-mock' | 'drill' | 'weak-mix' | 'mistakes';
export type ExamId = 'sbi-clerk' | 'ibps-clerk';
export type Pace = 'exam' | 'pressure' | 'relaxed' | 'untimed';
export const PACE_FACTOR: Record<Pace, number | null> = { exam: 1, pressure: 0.8, relaxed: 1.3, untimed: null };

export interface SectionConfig {
  subject: Subject;
  count: number;
  /** 0 = untimed. */
  seconds: number;
  blueprint?: string;
  /** Marks per correct answer (default 1); a wrong answer costs a quarter of it. */
  marks?: number;
  /** Display name, e.g. "Reasoning Ability". */
  title?: string;
}

export interface TestConfig {
  kind: TestKind;
  exam: ExamId;
  /** Human title, e.g. "Mock 04" or "Percentage — practice". */
  title: string;
  sections: SectionConfig[];
  sectionOrder: Subject[];
  sectionalTiming: boolean;
  /** true = timer never pauses (mocks default). */
  strictTimer: boolean;
  /** Practice only. */
  instantFeedback: boolean;
  difficultyMix: Record<Difficulty, number>;
  seed: string;
  pace: Pace;
  /** Chapter tests / practice: what to draw from. */
  chapter?: ChapterId;
  subtypes?: string[];
  /** Fixed-difficulty chapter practice ('mixed' uses difficultyMix). */
  difficulty?: Difficulty | 'mixed';
  /** Mock blueprint variant ids per subject. */
  variants?: Partial<Record<Subject, string>>;
}

export interface ResponseState {
  /** Saved answer (only Save & next / Mark for review & next save). */
  selected: number | null;
  marked: boolean;
  visited: boolean;
  /** Time spent on-screen while the page is visible. */
  activeMs: number;
  visits: number;
  answerChanges: number;
  /** Practice mode: answer locked after instant feedback. */
  locked?: boolean;
}

export interface Attempt {
  id: string;
  config: TestConfig;
  /** Full snapshot, so history survives generator changes. Ordered section by section. */
  questions: Question[];
  sets: QuestionSet[];
  /** Question ids per section, in display order. */
  sectionQuestionIds: string[][];
  /** Epoch ms per section; 0 = section not started yet. */
  sectionDeadlines: number[];
  /** Epoch ms when each section started (0 = not started). */
  sectionStartedAt: number[];
  /** Epoch ms when each section closed (0 = still open / not started). */
  sectionEndedAt: number[];
  /** Non-strict modes only. */
  pausedAt?: number;
  currentSection: number;
  currentIndex: number;
  responses: Record<string, ResponseState>;
  /** Unsaved selection on the current question (restored after reload). */
  draft?: { questionId: string; selected: number | null };
  bookmarks?: string[];
  status: 'in-progress' | 'submitted';
  createdAt: number;
  submittedAt?: number;
}
