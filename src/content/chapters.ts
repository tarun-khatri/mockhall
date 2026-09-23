import type { ChapterId, Subject } from './types';

/**
 * Chapter metadata (SPEC.md section 8). Pure data — safe to import anywhere.
 * `examWeight` = typical number of questions in one prelims paper (from section 3.4); drives weak-area ranking.
 */
export interface ChapterMeta {
  id: ChapterId;
  subject: Subject;
  title: string;
  priority: 'P1' | 'P2' | 'P3';
  method: 'GEN' | 'AUTH' | 'HYB';
  /** 'set' chapters draw whole stimulus sets (DI, puzzles, RC, para jumbles). */
  itemKind: 'single' | 'set' | 'mixed';
  examWeight: number;
  /** Phase in which the chapter first ships. */
  phase: 1 | 2 | 3;
}

export const SUBJECT_TITLE: Record<Subject, string> = {
  english: 'English Language',
  quant: 'Numerical Ability',
  reasoning: 'Reasoning Ability',
};

export const SUBJECT_SHORT: Record<Subject, string> = {
  english: 'English',
  quant: 'Numerical',
  reasoning: 'Reasoning',
};

export const CHAPTERS: readonly ChapterMeta[] = [
  // Numerical Ability
  { id: 'simplification', subject: 'quant', title: 'Simplification & approximation', priority: 'P1', method: 'GEN', itemKind: 'single', examWeight: 12, phase: 1 },
  { id: 'data-interpretation', subject: 'quant', title: 'Data interpretation', priority: 'P1', method: 'GEN', itemKind: 'set', examWeight: 12, phase: 1 },
  { id: 'percentage', subject: 'quant', title: 'Percentage', priority: 'P1', method: 'GEN', itemKind: 'single', examWeight: 1.5, phase: 1 },
  { id: 'profit-loss', subject: 'quant', title: 'Profit & loss', priority: 'P1', method: 'GEN', itemKind: 'single', examWeight: 1.5, phase: 1 },
  { id: 'interest', subject: 'quant', title: 'Simple & compound interest', priority: 'P1', method: 'GEN', itemKind: 'single', examWeight: 1.5, phase: 1 },
  { id: 'speed-distance', subject: 'quant', title: 'Speed, distance & time', priority: 'P1', method: 'GEN', itemKind: 'single', examWeight: 1.5, phase: 1 },
  { id: 'boats-streams', subject: 'quant', title: 'Boats & streams', priority: 'P1', method: 'GEN', itemKind: 'single', examWeight: 1, phase: 1 },
  { id: 'time-work', subject: 'quant', title: 'Time & work', priority: 'P1', method: 'GEN', itemKind: 'single', examWeight: 1, phase: 1 },
  { id: 'ratio-proportion', subject: 'quant', title: 'Ratio & proportion', priority: 'P1', method: 'GEN', itemKind: 'single', examWeight: 1, phase: 1 },
  { id: 'ages', subject: 'quant', title: 'Problems on ages', priority: 'P1', method: 'GEN', itemKind: 'single', examWeight: 1, phase: 1 },
  { id: 'averages', subject: 'quant', title: 'Averages', priority: 'P1', method: 'GEN', itemKind: 'single', examWeight: 1, phase: 1 },
  { id: 'partnership', subject: 'quant', title: 'Partnership', priority: 'P1', method: 'GEN', itemKind: 'single', examWeight: 1, phase: 1 },
  { id: 'mixtures', subject: 'quant', title: 'Mixture & alligation', priority: 'P1', method: 'GEN', itemKind: 'single', examWeight: 1, phase: 1 },
  { id: 'number-series', subject: 'quant', title: 'Number series', priority: 'P2', method: 'GEN', itemKind: 'single', examWeight: 2.5, phase: 1 },
  { id: 'pipes-cisterns', subject: 'quant', title: 'Pipes & cisterns', priority: 'P2', method: 'GEN', itemKind: 'single', examWeight: 0.5, phase: 1 },
  { id: 'mensuration', subject: 'quant', title: 'Mensuration', priority: 'P2', method: 'GEN', itemKind: 'single', examWeight: 0.5, phase: 1 },
  { id: 'quadratic', subject: 'quant', title: 'Quadratic equations', priority: 'P2', method: 'GEN', itemKind: 'single', examWeight: 0.5, phase: 1 },

  // Reasoning Ability
  { id: 'seating', subject: 'reasoning', title: 'Seating arrangement', priority: 'P1', method: 'GEN', itemKind: 'set', examWeight: 9, phase: 1 },
  { id: 'puzzles', subject: 'reasoning', title: 'Puzzles', priority: 'P1', method: 'GEN', itemKind: 'set', examWeight: 9, phase: 1 },
  { id: 'inequality', subject: 'reasoning', title: 'Inequality', priority: 'P1', method: 'GEN', itemKind: 'single', examWeight: 4, phase: 1 },
  { id: 'syllogism', subject: 'reasoning', title: 'Syllogism', priority: 'P1', method: 'GEN', itemKind: 'single', examWeight: 4, phase: 1 },
  { id: 'series-pattern', subject: 'reasoning', title: 'Alphanumeric & letter series', priority: 'P1', method: 'GEN', itemKind: 'mixed', examWeight: 5, phase: 1 },
  { id: 'direction', subject: 'reasoning', title: 'Direction & distance', priority: 'P1', method: 'GEN', itemKind: 'single', examWeight: 3, phase: 1 },
  { id: 'blood-relation', subject: 'reasoning', title: 'Blood relation', priority: 'P1', method: 'GEN', itemKind: 'single', examWeight: 2.5, phase: 1 },
  { id: 'coding-decoding', subject: 'reasoning', title: 'Coding–decoding', priority: 'P1', method: 'GEN', itemKind: 'mixed', examWeight: 2.5, phase: 1 },
  { id: 'order-ranking', subject: 'reasoning', title: 'Order & ranking', priority: 'P1', method: 'GEN', itemKind: 'single', examWeight: 1, phase: 1 },
  { id: 'classification', subject: 'reasoning', title: 'Odd one out', priority: 'P2', method: 'HYB', itemKind: 'single', examWeight: 1, phase: 1 },
  { id: 'input-output', subject: 'reasoning', title: 'Input–output', priority: 'P2', method: 'GEN', itemKind: 'set', examWeight: 0.2, phase: 3 },
  { id: 'data-sufficiency', subject: 'reasoning', title: 'Data sufficiency', priority: 'P2', method: 'GEN', itemKind: 'single', examWeight: 0.2, phase: 2 },
  { id: 'statement-conclusion', subject: 'reasoning', title: 'Statement & conclusion', priority: 'P3', method: 'AUTH', itemKind: 'single', examWeight: 0, phase: 3 },
  { id: 'statement-assumption', subject: 'reasoning', title: 'Statement & assumption', priority: 'P3', method: 'AUTH', itemKind: 'single', examWeight: 0, phase: 3 },
  { id: 'statement-argument', subject: 'reasoning', title: 'Statement & argument', priority: 'P3', method: 'AUTH', itemKind: 'single', examWeight: 0, phase: 3 },
  { id: 'course-of-action', subject: 'reasoning', title: 'Course of action', priority: 'P3', method: 'AUTH', itemKind: 'single', examWeight: 0, phase: 3 },
  { id: 'cause-effect', subject: 'reasoning', title: 'Cause & effect', priority: 'P3', method: 'AUTH', itemKind: 'single', examWeight: 0, phase: 3 },

  // English Language
  { id: 'reading-comprehension', subject: 'english', title: 'Reading comprehension', priority: 'P1', method: 'AUTH', itemKind: 'set', examWeight: 9, phase: 1 },
  { id: 'error-spotting', subject: 'english', title: 'Error spotting', priority: 'P1', method: 'AUTH', itemKind: 'single', examWeight: 5, phase: 1 },
  { id: 'para-jumbles', subject: 'english', title: 'Para jumbles', priority: 'P1', method: 'AUTH', itemKind: 'set', examWeight: 6, phase: 1 },
  { id: 'fillers', subject: 'english', title: 'Fillers', priority: 'P1', method: 'AUTH', itemKind: 'single', examWeight: 4, phase: 1 },
  { id: 'spelling', subject: 'english', title: 'Misspelt words', priority: 'P1', method: 'HYB', itemKind: 'single', examWeight: 4.5, phase: 1 },
  { id: 'phrase-replacement', subject: 'english', title: 'Phrase replacement', priority: 'P1', method: 'AUTH', itemKind: 'single', examWeight: 3, phase: 1 },
  { id: 'word-swap', subject: 'english', title: 'Word swap', priority: 'P1', method: 'AUTH', itemKind: 'single', examWeight: 2.5, phase: 2 },
  { id: 'match-column', subject: 'english', title: 'Match the column', priority: 'P2', method: 'AUTH', itemKind: 'single', examWeight: 1.5, phase: 2 },
  { id: 'word-usage', subject: 'english', title: 'Word usage', priority: 'P2', method: 'AUTH', itemKind: 'single', examWeight: 1, phase: 2 },
  { id: 'cloze', subject: 'english', title: 'Cloze test', priority: 'P2', method: 'AUTH', itemKind: 'set', examWeight: 3.5, phase: 2 },
  { id: 'connectors', subject: 'english', title: 'Sentence connectors', priority: 'P2', method: 'AUTH', itemKind: 'single', examWeight: 0.5, phase: 2 },
  { id: 'grammar', subject: 'english', title: 'Basic grammar', priority: 'P2', method: 'AUTH', itemKind: 'single', examWeight: 0, phase: 2 },
  { id: 'para-filler', subject: 'english', title: 'Para filler', priority: 'P3', method: 'AUTH', itemKind: 'single', examWeight: 0, phase: 3 },
  { id: 'para-summary', subject: 'english', title: 'Para summary', priority: 'P3', method: 'AUTH', itemKind: 'single', examWeight: 0, phase: 3 },
];

const BY_ID = new Map(CHAPTERS.map((c) => [c.id, c]));

export function chapterMeta(id: ChapterId): ChapterMeta {
  const meta = BY_ID.get(id);
  if (!meta) throw new Error(`Unknown chapter: ${id}`);
  return meta;
}

export function chaptersFor(subject: Subject): ChapterMeta[] {
  return CHAPTERS.filter((c) => c.subject === subject);
}

export function weightLabel(meta: ChapterMeta): string | undefined {
  if (meta.examWeight >= 5) return 'High weight in prelims';
  if (meta.examWeight >= 2) return 'Regular in prelims';
  if (meta.priority === 'P3') return 'Mainly mains';
  return undefined;
}
