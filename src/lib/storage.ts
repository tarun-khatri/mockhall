/**
 * Device storage. IndexedDB (idb-keyval) holds everything; a small synchronous localStorage mirror of the
 * active attempt's live state is written on pagehide so a reload never loses the last interaction.
 */
import { createStore, del, get, keys, set, clear, setMany } from 'idb-keyval';
import type { Attempt, ChapterId, Difficulty, ExamId, Item, Question, QuestionSet, Subject, TestKind } from '../content/types';

const store = createStore('mockhall', 'kv');

export const KEY = {
  index: 'attempts:index',
  attempt: (id: string) => `attempt:${id}`,
  settings: 'settings',
  log: 'log',
  mistakes: 'mistakes',
  reports: 'reports',
  chapterPrefs: 'chapter-prefs',
} as const;

const LIVE_PREFIX = 'mockhall:live:';

export class StorageError extends Error {
  quota: boolean;
  constructor(message: string, quota: boolean) {
    super(message);
    this.quota = quota;
  }
}

function wrap(e: unknown): StorageError {
  const name = (e as { name?: string })?.name ?? '';
  const quota = name === 'QuotaExceededError' || /quota/i.test(String((e as Error)?.message ?? ''));
  return new StorageError(
    quota
      ? 'Your phone is out of storage for this site. Export your progress in Settings, then delete old attempts.'
      : 'Saving failed. Your answers are still on screen — try again in a moment.',
    quota,
  );
}

async function safeSet(key: string, value: unknown): Promise<void> {
  try {
    await set(key, value, store);
  } catch (e) {
    throw wrap(e);
  }
}

/* ------------------------------------------------------------------ */
/* Attempts                                                            */
/* ------------------------------------------------------------------ */

export interface AttemptSummary {
  id: string;
  title: string;
  kind: TestKind;
  exam: ExamId;
  chapter?: ChapterId;
  status: Attempt['status'];
  createdAt: number;
  submittedAt?: number;
  questions: number;
  score?: number;
  maxScore?: number;
  sections: { subject: Subject; title: string; score?: number; correct?: number; wrong?: number; questions: number }[];
}

type LiveState = Pick<
  Attempt,
  | 'responses'
  | 'currentSection'
  | 'currentIndex'
  | 'draft'
  | 'sectionDeadlines'
  | 'sectionStartedAt'
  | 'sectionEndedAt'
  | 'pausedAt'
  | 'status'
  | 'submittedAt'
  | 'bookmarks'
> & { savedAt: number };

interface StoredAttempt {
  attempt: Attempt;
  savedAt: number;
}

export async function listAttempts(): Promise<AttemptSummary[]> {
  return ((await get<AttemptSummary[]>(KEY.index, store)) ?? []).slice().sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveAttempt(attempt: Attempt, summary: AttemptSummary): Promise<void> {
  const savedAt = Date.now();
  writeLive(attempt, savedAt);
  const index = (await get<AttemptSummary[]>(KEY.index, store)) ?? [];
  const next = [summary, ...index.filter((s) => s.id !== attempt.id)];
  try {
    await setMany(
      [
        [KEY.attempt(attempt.id), { attempt, savedAt } satisfies StoredAttempt],
        [KEY.index, next],
      ],
      store,
    );
  } catch (e) {
    throw wrap(e);
  }
}

export async function loadAttempt(id: string): Promise<Attempt | undefined> {
  const stored = await get<StoredAttempt>(KEY.attempt(id), store);
  if (!stored) return undefined;
  const live = readLive(id);
  if (live && live.savedAt > stored.savedAt) {
    const { savedAt: _ignored, ...rest } = live;
    void _ignored;
    return { ...stored.attempt, ...rest };
  }
  return stored.attempt;
}

export async function deleteAttempt(id: string): Promise<void> {
  const index = (await get<AttemptSummary[]>(KEY.index, store)) ?? [];
  await del(KEY.attempt(id), store);
  await safeSet(
    KEY.index,
    index.filter((s) => s.id !== id),
  );
  try {
    localStorage.removeItem(LIVE_PREFIX + id);
  } catch {
    /* storage blocked */
  }
}

/** Synchronous mirror of the dynamic part of an attempt (small), for pagehide / crash safety. */
export function writeLive(attempt: Attempt, savedAt = Date.now()): void {
  const live: LiveState = {
    responses: attempt.responses,
    currentSection: attempt.currentSection,
    currentIndex: attempt.currentIndex,
    draft: attempt.draft,
    sectionDeadlines: attempt.sectionDeadlines,
    sectionStartedAt: attempt.sectionStartedAt,
    sectionEndedAt: attempt.sectionEndedAt,
    pausedAt: attempt.pausedAt,
    status: attempt.status,
    submittedAt: attempt.submittedAt,
    bookmarks: attempt.bookmarks,
    savedAt,
  };
  try {
    localStorage.setItem(LIVE_PREFIX + attempt.id, JSON.stringify(live));
  } catch {
    /* private mode or quota — IndexedDB copy still exists */
  }
}

function readLive(id: string): LiveState | undefined {
  try {
    const raw = localStorage.getItem(LIVE_PREFIX + id);
    return raw ? (JSON.parse(raw) as LiveState) : undefined;
  } catch {
    return undefined;
  }
}

export function clearLive(id: string): void {
  try {
    localStorage.removeItem(LIVE_PREFIX + id);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Answer log (analytics) and mistakes                                  */
/* ------------------------------------------------------------------ */

export interface LogEntry {
  qid: string;
  attemptId: string;
  kind: TestKind;
  subject: Subject;
  chapter: ChapterId;
  subtype: string;
  difficulty: Difficulty;
  outcome: 'correct' | 'wrong' | 'skipped';
  visited: boolean;
  ms: number;
  target: number;
  at: number;
}

export async function readLog(): Promise<LogEntry[]> {
  return (await get<LogEntry[]>(KEY.log, store)) ?? [];
}

export async function appendLog(entries: LogEntry[]): Promise<void> {
  if (!entries.length) return;
  const log = await readLog();
  const seen = new Set(log.map((e) => `${e.attemptId}|${e.qid}`));
  await safeSet(KEY.log, [...log, ...entries.filter((e) => !seen.has(`${e.attemptId}|${e.qid}`))]);
}

export interface MistakeEntry {
  question: Question;
  set?: QuestionSet;
  reason: 'wrong' | 'skipped' | 'bookmark';
  addedAt: number;
  /** Consecutive correct answers in revision. */
  streak: number;
}

export async function readMistakes(): Promise<Record<string, MistakeEntry>> {
  return (await get<Record<string, MistakeEntry>>(KEY.mistakes, store)) ?? {};
}

export async function writeMistakes(m: Record<string, MistakeEntry>): Promise<void> {
  await safeSet(KEY.mistakes, m);
}

export interface ReportEntry {
  qid: string;
  attemptId: string;
  note: string;
  at: number;
  question: Question;
}

export async function addReport(r: ReportEntry): Promise<void> {
  const list = (await get<ReportEntry[]>(KEY.reports, store)) ?? [];
  await safeSet(KEY.reports, [...list, r]);
}

/* ------------------------------------------------------------------ */
/* Generic key/value                                                   */
/* ------------------------------------------------------------------ */

export async function readKey<T>(key: string): Promise<T | undefined> {
  return get<T>(key, store);
}

export async function writeKey(key: string, value: unknown): Promise<void> {
  await safeSet(key, value);
}

/* ------------------------------------------------------------------ */
/* Export / import / reset                                             */
/* ------------------------------------------------------------------ */

export const EXPORT_VERSION = 1;

export interface ExportFile {
  app: 'mockhall';
  version: number;
  exportedAt: number;
  entries: [string, unknown][];
}

export async function exportAll(): Promise<ExportFile> {
  const all = await keys(store);
  const entries: [string, unknown][] = [];
  for (const k of all) entries.push([String(k), await get(k, store)]);
  return { app: 'mockhall', version: EXPORT_VERSION, exportedAt: Date.now(), entries };
}

export async function importAll(file: ExportFile, mode: 'merge' | 'replace'): Promise<void> {
  if (mode === 'replace') await clear(store);
  const current = mode === 'merge' ? await exportAll() : undefined;
  const byKey = new Map(current?.entries ?? []);
  const merged: [string, unknown][] = [];
  for (const [k, v] of file.entries) {
    if (mode === 'merge' && byKey.has(k)) {
      const cur = byKey.get(k);
      if (k === KEY.index && Array.isArray(cur) && Array.isArray(v)) {
        const map = new Map<string, AttemptSummary>();
        for (const s of [...(v as AttemptSummary[]), ...(cur as AttemptSummary[])]) map.set(s.id, s);
        merged.push([k, [...map.values()]]);
        continue;
      }
      if (k === KEY.log && Array.isArray(cur) && Array.isArray(v)) {
        const seen = new Set((cur as LogEntry[]).map((e) => `${e.attemptId}|${e.qid}`));
        merged.push([k, [...(cur as LogEntry[]), ...(v as LogEntry[]).filter((e) => !seen.has(`${e.attemptId}|${e.qid}`))]]);
        continue;
      }
      if (k === KEY.mistakes && cur && v && typeof cur === 'object' && typeof v === 'object') {
        merged.push([k, { ...(v as object), ...(cur as object) }]);
        continue;
      }
      if (k === KEY.settings) continue; // keep this phone's settings
    }
    merged.push([k, v]);
  }
  try {
    await setMany(merged, store);
  } catch (e) {
    throw wrap(e);
  }
}

export async function resetAll(): Promise<void> {
  await clear(store);
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith('mockhall:')) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/** Cache of generated/loaded items is not persisted; items are snapshotted into attempts. */
export type { Item };
