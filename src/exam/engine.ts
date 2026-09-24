/**
 * Pure exam engine: every function takes an Attempt (and `now` in epoch ms) and returns a new Attempt.
 * No React, no storage, no Date.now() inside — so every rule is unit-testable with fake times.
 *
 * Rules mirrored from the real exam (SPEC 10.4):
 *  - A selection counts only after Save & next or Mark for review & next.
 *  - Answered & marked for review IS evaluated; marked without an answer is not.
 *  - Timers are deadlines. Strict mode never pauses. When a section's deadline passes, its draft is auto-saved,
 *    the section closes (no going back) and the next one opens; the last one auto-submits.
 */
import type { Attempt, Question, QuestionSet, ResponseState, TestConfig } from '../content/types';

/** Pause between sections for the "time is over" interstitial; the next section's clock starts after it. */
export const INTERSTITIAL_MS = 3000;
export const MARK_CORRECT = 1;
export const MARK_WRONG = -0.25;

export type PaletteStatus = 'not-visited' | 'not-answered' | 'answered' | 'marked' | 'answered-marked';

export function emptyResponse(): ResponseState {
  return { selected: null, marked: false, visited: false, activeMs: 0, visits: 0, answerChanges: 0 };
}

export function paletteStatus(r: ResponseState | undefined): PaletteStatus {
  if (!r || !r.visited) return 'not-visited';
  if (r.marked) return r.selected !== null ? 'answered-marked' : 'marked';
  return r.selected !== null ? 'answered' : 'not-answered';
}

/** Evaluated = has a saved answer (marked or not). */
export function isEvaluated(r: ResponseState | undefined): boolean {
  return !!r && r.selected !== null;
}

export interface SectionInput {
  questions: Question[];
  sets: QuestionSet[];
}

export function createAttempt(id: string, config: TestConfig, sections: SectionInput[], now: number): Attempt {
  if (sections.length !== config.sections.length) throw new Error('createAttempt: section count mismatch');
  const questions = sections.flatMap((s) => s.questions);
  const sets = sections.flatMap((s) => s.sets);
  const responses: Record<string, ResponseState> = {};
  for (const q of questions) responses[q.id] = emptyResponse();
  const n = sections.length;
  let attempt: Attempt = {
    id,
    config,
    questions,
    sets,
    sectionQuestionIds: sections.map((s) => s.questions.map((q) => q.id)),
    sectionDeadlines: new Array(n).fill(0),
    sectionStartedAt: new Array(n).fill(0),
    sectionEndedAt: new Array(n).fill(0),
    currentSection: 0,
    currentIndex: 0,
    responses,
    bookmarks: [],
    status: 'in-progress',
    createdAt: now,
  };
  attempt = openSection(attempt, 0, now);
  return attempt;
}

export function sectionSeconds(a: Attempt, s: number): number {
  return a.config.sections[s]?.seconds ?? 0;
}

export function isTimed(a: Attempt, s: number): boolean {
  return sectionSeconds(a, s) > 0;
}

export function currentQuestionId(a: Attempt): string {
  return a.sectionQuestionIds[a.currentSection][a.currentIndex];
}

export function questionById(a: Attempt): Map<string, Question> {
  return new Map(a.questions.map((q) => [q.id, q]));
}

/** Remaining ms in the current section, or null when untimed. Frozen while paused. */
export function remainingMs(a: Attempt, now: number): number | null {
  const s = a.currentSection;
  if (!isTimed(a, s)) return null;
  const at = a.pausedAt ?? now;
  return Math.max(0, a.sectionDeadlines[s] - at);
}

/** Elapsed ms in the current section (for untimed stopwatch display). */
export function elapsedMs(a: Attempt, now: number): number {
  const s = a.currentSection;
  const start = a.sectionStartedAt[s];
  if (!start) return 0;
  return Math.max(0, (a.pausedAt ?? now) - start);
}

function withResponse(a: Attempt, qid: string, patch: Partial<ResponseState>): Attempt {
  return { ...a, responses: { ...a.responses, [qid]: { ...(a.responses[qid] ?? emptyResponse()), ...patch } } };
}

/** Enter question (section s, index i): mark visited, count the visit, load the saved answer into the draft. */
export function enterQuestion(a: Attempt, s: number, i: number): Attempt {
  const ids = a.sectionQuestionIds[s];
  if (!ids || i < 0 || i >= ids.length) return a;
  const qid = ids[i];
  const r = a.responses[qid] ?? emptyResponse();
  const next = withResponse({ ...a, currentSection: s, currentIndex: i }, qid, { visited: true, visits: r.visits + 1 });
  return { ...next, draft: { questionId: qid, selected: r.selected } };
}

function openSection(a: Attempt, s: number, startAt: number): Attempt {
  const deadlines = a.sectionDeadlines.slice();
  const started = a.sectionStartedAt.slice();
  started[s] = startAt;
  deadlines[s] = isTimed(a, s) ? startAt + sectionSeconds(a, s) * 1000 : 0;
  return enterQuestion({ ...a, sectionDeadlines: deadlines, sectionStartedAt: started }, s, 0);
}

/** The draft (unsaved selection) on the current question, falling back to the saved answer. */
export function draftSelection(a: Attempt): number | null {
  const qid = currentQuestionId(a);
  if (a.draft && a.draft.questionId === qid) return a.draft.selected;
  return a.responses[qid]?.selected ?? null;
}

/** Tap an option: select it, or deselect when tapping the selected one. Locked (practice feedback) questions ignore taps. */
export function toggleOption(a: Attempt, option: number): Attempt {
  const qid = currentQuestionId(a);
  if (a.responses[qid]?.locked) return a;
  const cur = draftSelection(a);
  return { ...a, draft: { questionId: qid, selected: cur === option ? null : option } };
}

function commit(a: Attempt, marked: boolean): Attempt {
  const qid = currentQuestionId(a);
  const r = a.responses[qid] ?? emptyResponse();
  const selected = draftSelection(a);
  const changed = selected !== r.selected && r.selected !== null && selected !== null ? 1 : 0;
  return withResponse(a, qid, { selected, marked, answerChanges: r.answerChanges + changed });
}

function nextIndex(a: Attempt): number {
  const len = a.sectionQuestionIds[a.currentSection].length;
  return (a.currentIndex + 1) % len;
}

export function saveAndNext(a: Attempt): Attempt {
  const saved = commit(a, false);
  return enterQuestion(saved, a.currentSection, nextIndex(saved));
}

export function markAndNext(a: Attempt): Attempt {
  const saved = commit(a, true);
  return enterQuestion(saved, a.currentSection, nextIndex(saved));
}

/** Clear response: removes the draft AND the saved answer. The review mark stays. */
export function clearResponse(a: Attempt): Attempt {
  const qid = currentQuestionId(a);
  if (a.responses[qid]?.locked) return a;
  return { ...withResponse(a, qid, { selected: null }), draft: { questionId: qid, selected: null } };
}

/** True when the current draft differs from the saved answer. */
export function hasUnsavedChange(a: Attempt): boolean {
  const qid = currentQuestionId(a);
  return draftSelection(a) !== (a.responses[qid]?.selected ?? null);
}

/**
 * Jump to another question (palette / Previous). With sectional timing, only the current section is reachable.
 * An unsaved selection is discarded (the real-exam rule) and reported so the UI can toast.
 */
export function navigate(a: Attempt, s: number, i: number): { attempt: Attempt; discardedUnsaved: boolean; blocked: boolean } {
  if (a.status !== 'in-progress') return { attempt: a, discardedUnsaved: false, blocked: true };
  if (s !== a.currentSection && (a.config.sectionalTiming || a.sectionEndedAt[s] > 0 || a.sectionStartedAt[s] === 0)) {
    return { attempt: a, discardedUnsaved: false, blocked: true };
  }
  if (s === a.currentSection && i === a.currentIndex) return { attempt: a, discardedUnsaved: false, blocked: false };
  const discardedUnsaved = hasUnsavedChange(a);
  return { attempt: enterQuestion(a, s, i), discardedUnsaved, blocked: false };
}

/** Practice with instant feedback: a tap commits and locks the answer. */
export function answerAndLock(a: Attempt, option: number): Attempt {
  const qid = currentQuestionId(a);
  if (a.responses[qid]?.locked) return a;
  const next = withResponse(a, qid, { selected: option, locked: true });
  return { ...next, draft: { questionId: qid, selected: option } };
}

/** Add on-screen time to a question. */
export function addActiveTime(a: Attempt, qid: string, ms: number): Attempt {
  if (!(ms > 0) || !a.responses[qid]) return a;
  return withResponse(a, qid, { activeMs: a.responses[qid].activeMs + ms });
}

/** Close the current section at time `at` (auto-saving its draft), then open the next or submit. */
export function closeSection(a: Attempt, at: number): Attempt {
  if (a.status !== 'in-progress') return a;
  const s = a.currentSection;
  let next = a;
  // Section end auto-saves the current response (SPEC 10.4); the review mark is kept as is.
  if (next.draft && next.sectionQuestionIds[s].includes(next.draft.questionId)) {
    const qid = next.draft.questionId;
    const r = next.responses[qid];
    if (r && !r.locked && next.draft.selected !== r.selected) next = withResponse(next, qid, { selected: next.draft.selected });
  }
  const ended = next.sectionEndedAt.slice();
  ended[s] = at;
  next = { ...next, sectionEndedAt: ended, draft: undefined };
  if (s + 1 >= next.sectionQuestionIds.length) return { ...next, status: 'submitted', submittedAt: at };
  const gap = next.config.sectionalTiming ? INTERSTITIAL_MS : 0;
  return openSection(next, s + 1, at + gap);
}

/**
 * Catch up with the clock: closes every section whose deadline has passed (strict mode keeps running while the
 * page is hidden or closed). Returns the sections that were closed.
 */
export function advanceIfExpired(a: Attempt, now: number): { attempt: Attempt; closed: number[] } {
  let cur = a;
  const closed: number[] = [];
  let guard = 0;
  while (cur.status === 'in-progress' && cur.pausedAt === undefined && guard++ < 20) {
    const s = cur.currentSection;
    if (!isTimed(cur, s)) break;
    const deadline = cur.sectionDeadlines[s];
    if (now < deadline) break;
    cur = closeSection(cur, deadline);
    closed.push(s);
  }
  return { attempt: cur, closed };
}

/** Candidate ends the current section early (moves on; no going back). */
export function endSectionNow(a: Attempt, now: number): Attempt {
  return closeSection(a, now);
}

export function submit(a: Attempt, now: number): Attempt {
  if (a.status !== 'in-progress') return a;
  const s = a.currentSection;
  const ended = a.sectionEndedAt.slice();
  if (!ended[s]) ended[s] = now;
  return { ...a, sectionEndedAt: ended, draft: undefined, pausedAt: undefined, status: 'submitted', submittedAt: now };
}

/** Non-strict only: freeze the clock. */
export function pause(a: Attempt, now: number): Attempt {
  if (a.config.strictTimer || a.pausedAt !== undefined || a.status !== 'in-progress') return a;
  return { ...a, pausedAt: now };
}

/** Non-strict only: extend the running section's deadline by the paused duration. */
export function resume(a: Attempt, now: number): Attempt {
  if (a.pausedAt === undefined) return a;
  const pausedFor = Math.max(0, now - a.pausedAt);
  const s = a.currentSection;
  const deadlines = a.sectionDeadlines.slice();
  const started = a.sectionStartedAt.slice();
  if (deadlines[s]) deadlines[s] += pausedFor;
  if (started[s]) started[s] += pausedFor; // keeps the elapsed stopwatch honest
  return { ...a, sectionDeadlines: deadlines, sectionStartedAt: started, pausedAt: undefined };
}

export function toggleBookmark(a: Attempt, qid: string): Attempt {
  const list = a.bookmarks ?? [];
  return { ...a, bookmarks: list.includes(qid) ? list.filter((x) => x !== qid) : [...list, qid] };
}

/* ------------------------------------------------------------------ */
/* Counts and scoring                                                  */
/* ------------------------------------------------------------------ */

export interface PaletteCounts {
  'not-visited': number;
  'not-answered': number;
  answered: number;
  marked: number;
  'answered-marked': number;
}

export function paletteCounts(a: Attempt, s: number): PaletteCounts {
  const c: PaletteCounts = { 'not-visited': 0, 'not-answered': 0, answered: 0, marked: 0, 'answered-marked': 0 };
  for (const qid of a.sectionQuestionIds[s]) c[paletteStatus(a.responses[qid])]++;
  return c;
}

export interface SectionScore {
  index: number;
  subject: Question['subject'];
  title: string;
  questions: number;
  attempted: number;
  correct: number;
  wrong: number;
  skipped: number;
  score: number;
  maxScore: number;
  timeUsedMs: number;
  /** Marks per correct answer in this section (mains: 1.2, 1.25, 1.5). */
  marks: number;
}

export interface ScoreSummary {
  sections: SectionScore[];
  questions: number;
  attempted: number;
  correct: number;
  wrong: number;
  skipped: number;
  score: number;
  maxScore: number;
  /** Correct / attempted, 0–1. */
  accuracy: number;
  negativeMarks: number;
}

export type Outcome = 'correct' | 'wrong' | 'skipped';

export function outcomeOf(q: Question, r: ResponseState | undefined): Outcome {
  if (!r || r.selected === null) return 'skipped';
  return r.selected === q.answerIndex ? 'correct' : 'wrong';
}

export function scoreAttempt(a: Attempt): ScoreSummary {
  const byId = questionById(a);
  const sections: SectionScore[] = a.sectionQuestionIds.map((ids, index) => {
    let correct = 0;
    let wrong = 0;
    for (const id of ids) {
      const o = outcomeOf(byId.get(id)!, a.responses[id]);
      if (o === 'correct') correct++;
      else if (o === 'wrong') wrong++;
    }
    const started = a.sectionStartedAt[index];
    const ended = a.sectionEndedAt[index] || a.submittedAt || 0;
    const cfg = a.config.sections[index];
    const m = cfg.marks ?? 1;
    return {
      index,
      subject: cfg.subject,
      title: cfg.title ?? cfg.subject,
      questions: ids.length,
      attempted: correct + wrong,
      correct,
      wrong,
      skipped: ids.length - correct - wrong,
      score: m * (correct * MARK_CORRECT + wrong * MARK_WRONG),
      maxScore: m * ids.length * MARK_CORRECT,
      marks: m,
      timeUsedMs: started && ended ? Math.max(0, ended - started) : 0,
    };
  });
  const sum = (k: keyof SectionScore) => sections.reduce((acc, s) => acc + (s[k] as number), 0);
  const correct = sum('correct');
  const wrong = sum('wrong');
  const attempted = correct + wrong;
  return {
    sections,
    questions: sum('questions'),
    attempted,
    correct,
    wrong,
    skipped: sum('skipped'),
    score: sum('score'),
    maxScore: sum('maxScore'),
    accuracy: attempted ? correct / attempted : 0,
    negativeMarks: sections.reduce((s, x) => s - x.wrong * MARK_WRONG * x.marks, 0),
  };
}

/** Accuracy needed at `attempts` attempts to reach `target` marks: c − 0.25(n − c) = T → c = (T + 0.25n) / 1.25. */
export function accuracyNeeded(target: number, attempts: number): number | null {
  if (attempts <= 0) return null;
  const c = (target - MARK_WRONG * attempts) / (MARK_CORRECT - MARK_WRONG);
  const acc = c / attempts;
  return acc > 1 ? null : Math.max(0, acc);
}
