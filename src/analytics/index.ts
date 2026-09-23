/** Aggregation over the answer log (SPEC 11). Pure functions — unit-tested. */
import type { ChapterId, Difficulty, Subject } from '../content/types';
import { CHAPTERS, chapterMeta } from '../content/chapters';
import type { LogEntry } from '../lib/storage';

export interface Stat {
  attempted: number;
  correct: number;
  wrong: number;
  seen: number;
  accuracy: number;
  medianMs: number;
  medianTarget: number;
}

const DIFF_WEIGHT: Record<Difficulty, number> = { easy: 0.7, medium: 1, hard: 1.3, extreme: 1.6 };

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function stat(entries: LogEntry[]): Stat {
  const answered = entries.filter((e) => e.outcome !== 'skipped');
  const correct = answered.filter((e) => e.outcome === 'correct').length;
  const timed = entries.filter((e) => e.ms > 0);
  return {
    attempted: answered.length,
    correct,
    wrong: answered.length - correct,
    seen: entries.length,
    accuracy: answered.length ? correct / answered.length : 0,
    medianMs: median(timed.map((e) => e.ms)),
    medianTarget: median(timed.map((e) => e.target)),
  };
}

/** Accuracy weighted by difficulty: hard questions count more (SPEC 11.3 "mastery"). */
export function mastery(entries: LogEntry[]): number {
  let num = 0;
  let den = 0;
  for (const e of entries) {
    if (e.outcome === 'skipped') continue;
    const w = DIFF_WEIGHT[e.difficulty];
    den += w;
    if (e.outcome === 'correct') num += w;
  }
  return den ? num / den : 0;
}

export function byChapter(log: LogEntry[]): Map<ChapterId, LogEntry[]> {
  const m = new Map<ChapterId, LogEntry[]>();
  for (const e of log) {
    const list = m.get(e.chapter) ?? [];
    list.push(e);
    m.set(e.chapter, list);
  }
  return m;
}

export function bySubject(log: LogEntry[]): Record<Subject, LogEntry[]> {
  const out: Record<Subject, LogEntry[]> = { english: [], quant: [], reasoning: [] };
  for (const e of log) out[e.subject].push(e);
  return out;
}

export interface WeakArea {
  chapter: ChapterId;
  subtype: string;
  stat: Stat;
  /** Marks at stake: accuracy gap × exam weight. */
  stake: number;
}

/** Weakest subtypes by marks at stake (needs ≥ 3 answered to count). */
export function weakAreas(log: LogEntry[], limit = 5): WeakArea[] {
  const groups = new Map<string, LogEntry[]>();
  for (const e of log) {
    const k = `${e.chapter}|${e.subtype}`;
    const list = groups.get(k) ?? [];
    list.push(e);
    groups.set(k, list);
  }
  const out: WeakArea[] = [];
  for (const [k, entries] of groups) {
    const s = stat(entries);
    if (s.attempted + entries.filter((e) => e.outcome === 'skipped' && e.visited).length < 3) continue;
    const [chapter, subtype] = k.split('|') as [ChapterId, string];
    const weight = chapterMeta(chapter).examWeight || 0.2;
    const gap = 1 - (s.seen ? s.correct / s.seen : 0);
    out.push({ chapter, subtype, stat: s, stake: gap * weight });
  }
  return out.sort((a, b) => b.stake - a.stake).slice(0, limit);
}

export function chapterStats(log: LogEntry[]): Map<ChapterId, Stat> {
  const m = new Map<ChapterId, Stat>();
  for (const [c, entries] of byChapter(log)) m.set(c, stat(entries));
  return m;
}

export function subjectSummary(log: LogEntry[], subject: Subject): { practised: number; total: number; accuracy: number; questions: number } {
  const chapters = CHAPTERS.filter((c) => c.subject === subject);
  const entries = log.filter((e) => e.subject === subject);
  const practised = new Set(entries.map((e) => e.chapter)).size;
  const s = stat(entries);
  return { practised, total: chapters.length, accuracy: s.accuracy, questions: entries.length };
}
