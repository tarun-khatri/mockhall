/**
 * Active-attempt store: wraps the pure engine with persistence (debounced IndexedDB + synchronous live mirror),
 * visible-time accounting, timer warnings and section interstitials.
 */
import { create } from 'zustand';
import type { Attempt, TestConfig } from '../content/types';
import * as E from './engine';
import {
  appendLog,
  clearLive,
  loadAttempt,
  readMistakes,
  saveAttempt,
  writeLive,
  writeMistakes,
  type AttemptSummary,
  type LogEntry,
  type MistakeEntry,
} from '../lib/storage';
import { randomSeed } from '../lib/rng';
import { useSettings } from '../app/settings';

export interface Interstitial {
  ended: string;
  next: string | null;
  until: number;
}

export interface ToastMsg {
  id: number;
  text: string;
  tone: 'info' | 'warn' | 'danger';
}

interface ExamState {
  attempt: Attempt | null;
  error: string | null;
  interstitial: Interstitial | null;
  toast: ToastMsg | null;
  /** When the current question started accruing visible time; null while hidden. */
  activeFrom: number | null;
  warned: Record<string, true>;
  /** Timer pulse trigger for the 1:00 warning. */
  pulseAt: number;

  open(id: string): Promise<Attempt | null>;
  begin(config: TestConfig, sections: E.SectionInput[]): Promise<string>;
  tick(now?: number): void;
  select(option: number): void;
  saveNext(): void;
  /** Save the current answer without moving (last question → submit sheet). */
  saveOnly(): void;
  markNext(): void;
  clear(): void;
  goTo(section: number, index: number): void;
  prev(): void;
  endSection(): void;
  submit(): Promise<void>;
  toggleBookmark(): void;
  pause(): void;
  resume(): void;
  hidden(): void;
  shown(): void;
  showToast(text: string, tone?: ToastMsg['tone']): void;
  flush(): Promise<void>;
  close(): void;
}

export function summarize(a: Attempt): AttemptSummary {
  const submitted = a.status === 'submitted';
  const score = submitted ? E.scoreAttempt(a) : null;
  return {
    id: a.id,
    title: a.config.title,
    kind: a.config.kind,
    exam: a.config.exam,
    chapter: a.config.chapter,
    status: a.status,
    createdAt: a.createdAt,
    submittedAt: a.submittedAt,
    questions: a.questions.length,
    score: score?.score,
    maxScore: score?.maxScore,
    sections: a.config.sections.map((s, i) => ({
      subject: s.subject,
      title: s.title ?? s.subject,
      questions: a.sectionQuestionIds[i].length,
      score: score?.sections[i].score,
      correct: score?.sections[i].correct,
      wrong: score?.sections[i].wrong,
    })),
  };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let toastSeq = 0;

function vibrate(ms: number) {
  if (useSettings.getState().settings.vibration && 'vibrate' in navigator) navigator.vibrate(ms);
}

export const useExam = create<ExamState>((set, get) => {
  /** Commit a new attempt: accrue visible time for the question being left, persist (debounced). */
  function commit(next: Attempt, opts: { leaving?: boolean; now?: number } = {}) {
    const state = get();
    const now = opts.now ?? Date.now();
    let a = next;
    const prev = state.attempt;
    if (prev && state.activeFrom !== null && opts.leaving) {
      const qid = E.currentQuestionId(prev);
      a = E.addActiveTime(a, qid, now - state.activeFrom);
    }
    set({ attempt: a, activeFrom: opts.leaving ? (state.activeFrom === null ? null : now) : state.activeFrom });
    schedulePersist();
  }

  function schedulePersist() {
    const a = get().attempt;
    if (!a) return;
    writeLive(a);
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void persistNow(), 300);
  }

  async function persistNow() {
    const a = get().attempt;
    if (!a) return;
    try {
      await saveAttempt(a, summarize(a));
    } catch (e) {
      get().showToast((e as Error).message, 'danger');
    }
  }

  function interstitialFor(before: Attempt, closed: number[], after: Attempt, now: number): Interstitial | null {
    if (!closed.length || !before.config.sectionalTiming) return null;
    const last = closed[closed.length - 1];
    const ended = before.config.sections[last]?.title ?? 'This section';
    const next = after.status === 'in-progress' ? (after.config.sections[after.currentSection]?.title ?? null) : null;
    // Only show when the switch just happened (not when catching up hours later).
    const deadline = before.sectionDeadlines[last];
    if (now - deadline > E.INTERSTITIAL_MS) return null;
    return { ended, next, until: deadline + E.INTERSTITIAL_MS };
  }

  return {
    attempt: null,
    error: null,
    interstitial: null,
    toast: null,
    activeFrom: null,
    warned: {},
    pulseAt: 0,

    async open(id) {
      const cur = get().attempt;
      if (cur?.id === id) return cur;
      const a = await loadAttempt(id);
      if (!a) {
        set({ attempt: null, error: 'This test is not on this device. It may have been deleted or started on another phone.' });
        return null;
      }
      set({ attempt: a, error: null, interstitial: null, warned: {}, activeFrom: document.visibilityState === 'visible' ? Date.now() : null });
      if (a.status === 'in-progress') {
        if (a.pausedAt !== undefined && !a.config.strictTimer) get().resume();
        get().tick();
      }
      return get().attempt;
    },

    async begin(config, sections) {
      const id = `${Date.now().toString(36)}-${randomSeed().slice(0, 6)}`;
      const now = Date.now();
      const a = E.createAttempt(id, config, sections, now);
      set({ attempt: a, error: null, interstitial: null, warned: {}, activeFrom: now });
      await saveAttempt(a, summarize(a));
      return id;
    },

    tick(nowArg) {
      const now = nowArg ?? Date.now();
      const a = get().attempt;
      if (!a || a.status !== 'in-progress') return;
      const { attempt, closed } = E.advanceIfExpired(a, now);
      if (closed.length) {
        const inter = interstitialFor(a, closed, attempt, now);
        const state = get();
        let next = attempt;
        if (state.activeFrom !== null) next = E.addActiveTime(next, E.currentQuestionId(a), Math.max(0, Math.min(now, a.sectionDeadlines[a.currentSection]) - state.activeFrom));
        set({ attempt: next, interstitial: inter, activeFrom: now });
        vibrate(200);
        if (next.status === 'submitted') void get().submit();
        else schedulePersist();
        return;
      }
      // Warnings at 5:00 and 1:00 (timed sections only).
      const rem = E.remainingMs(a, now);
      if (rem !== null && a.pausedAt === undefined) {
        const s = a.currentSection;
        const title = a.config.sections[s]?.title ?? 'this section';
        const warned = get().warned;
        if (rem <= 60_000 && !warned[`${s}:1`]) {
          set({ warned: { ...warned, [`${s}:1`]: true, [`${s}:5`]: true }, pulseAt: now });
          get().showToast(`1 minute left in ${title}`, 'danger');
          vibrate(120);
        } else if (rem <= 300_000 && rem > 60_000 && !warned[`${s}:5`]) {
          set({ warned: { ...warned, [`${s}:5`]: true } });
          get().showToast(`5 minutes left in ${title}`, 'warn');
        }
      }
      const inter = get().interstitial;
      if (inter && now >= inter.until) set({ interstitial: null });
    },

    select(option) {
      const a = get().attempt;
      if (!a || a.status !== 'in-progress') return;
      if (a.config.instantFeedback) commit(E.answerAndLock(a, option));
      else commit(E.toggleOption(a, option));
    },

    saveOnly() {
      const a = get().attempt;
      if (!a || a.status !== 'in-progress') return;
      commit(E.saveCurrent(a));
    },

    saveNext() {
      const a = get().attempt;
      if (!a || a.status !== 'in-progress') return;
      commit(E.saveAndNext(a), { leaving: true });
    },

    markNext() {
      const a = get().attempt;
      if (!a || a.status !== 'in-progress') return;
      commit(E.markAndNext(a), { leaving: true });
    },

    clear() {
      const a = get().attempt;
      if (!a || a.status !== 'in-progress') return;
      commit(E.clearResponse(a));
    },

    goTo(section, index) {
      const a = get().attempt;
      if (!a || a.status !== 'in-progress') return;
      const r = E.navigate(a, section, index);
      if (r.blocked) {
        if (section !== a.currentSection) get().showToast('Other sections are locked while this section is running.', 'info');
        return;
      }
      commit(r.attempt, { leaving: true });
      if (r.discardedUnsaved && !a.config.instantFeedback) get().showToast('Answer not saved — use Save & next', 'warn');
    },

    prev() {
      const a = get().attempt;
      if (!a) return;
      const len = a.sectionQuestionIds[a.currentSection].length;
      get().goTo(a.currentSection, (a.currentIndex - 1 + len) % len);
    },

    endSection() {
      const a = get().attempt;
      if (!a || a.status !== 'in-progress') return;
      const now = Date.now();
      const next = E.endSectionNow(a, now);
      commit(next, { leaving: true, now });
      if (next.status === 'submitted') void get().submit();
      else {
        set({ interstitial: { ended: a.config.sections[a.currentSection].title ?? 'Section', next: next.config.sections[next.currentSection].title ?? null, until: now + E.INTERSTITIAL_MS } });
      }
    },

    async submit() {
      const cur = get().attempt;
      if (!cur) return;
      const now = Date.now();
      let a = cur;
      if (get().activeFrom !== null && a.status === 'in-progress') a = E.addActiveTime(a, E.currentQuestionId(a), now - get().activeFrom!);
      a = E.submit(a, now);
      set({ attempt: a, activeFrom: null, interstitial: null });
      if (saveTimer) clearTimeout(saveTimer);
      await saveAttempt(a, summarize(a)).catch((e) => get().showToast((e as Error).message, 'danger'));
      clearLive(a.id);
      await recordResults(a).catch(() => undefined);
    },

    toggleBookmark() {
      const a = get().attempt;
      if (!a) return;
      commit(E.toggleBookmark(a, E.currentQuestionId(a)));
    },

    pause() {
      const a = get().attempt;
      if (!a) return;
      const now = Date.now();
      commit(E.pause(a, now), { leaving: true, now });
      set({ activeFrom: null });
    },

    resume() {
      const a = get().attempt;
      if (!a) return;
      const now = Date.now();
      set({ attempt: E.resume(a, now), activeFrom: document.visibilityState === 'visible' ? now : null });
      schedulePersist();
    },

    hidden() {
      const a = get().attempt;
      if (!a || a.status !== 'in-progress') return;
      const now = Date.now();
      let next = a;
      const from = get().activeFrom;
      if (from !== null) next = E.addActiveTime(next, E.currentQuestionId(a), now - from);
      if (!a.config.strictTimer) next = E.pause(next, now);
      set({ attempt: next, activeFrom: null });
      writeLive(next);
      void persistNow();
    },

    shown() {
      const a = get().attempt;
      if (!a || a.status !== 'in-progress') return;
      const now = Date.now();
      if (a.pausedAt !== undefined && !a.config.strictTimer) set({ attempt: E.resume(a, now) });
      set({ activeFrom: now });
      get().tick(now);
    },

    showToast(text, tone = 'info') {
      set({ toast: { id: ++toastSeq, text, tone } });
    },

    async flush() {
      if (saveTimer) clearTimeout(saveTimer);
      await persistNow();
    },

    close() {
      const a = get().attempt;
      if (a && a.status === 'in-progress') {
        get().hidden();
      }
      set({ attempt: null, interstitial: null, toast: null, activeFrom: null });
    },
  };
});

/** After submit: append the answer log (analytics) and update the mistakes book. */
async function recordResults(a: Attempt): Promise<void> {
  const byId = E.questionById(a);
  const entries: LogEntry[] = a.questions.map((q) => {
    const r = a.responses[q.id];
    return {
      qid: q.id,
      attemptId: a.id,
      kind: a.config.kind,
      subject: q.subject,
      chapter: q.chapter,
      subtype: q.subtype,
      difficulty: q.difficulty,
      outcome: E.outcomeOf(q, r),
      visited: !!r?.visited,
      ms: r?.activeMs ?? 0,
      target: q.targetSeconds,
      at: a.submittedAt ?? Date.now(),
    };
  });
  await appendLog(entries);

  const mistakes = await readMistakes();
  const prune = useSettings.getState().settings.pruneMistakes;
  const setsById = new Map(a.sets.map((s) => [s.id, s]));
  for (const e of entries) {
    const q = byId.get(e.qid)!;
    const existing = mistakes[e.qid];
    if (e.outcome === 'correct') {
      if (existing) {
        existing.streak += 1;
        if (prune && existing.streak >= 2 && existing.reason !== 'bookmark') delete mistakes[e.qid];
      }
    } else if (e.outcome === 'wrong' || (e.outcome === 'skipped' && e.visited)) {
      const entry: MistakeEntry = {
        question: q,
        set: q.setId ? setsById.get(q.setId) : undefined,
        reason: e.outcome === 'wrong' ? 'wrong' : 'skipped',
        addedAt: e.at,
        streak: 0,
      };
      mistakes[e.qid] = existing ? { ...existing, reason: entry.reason, streak: 0 } : entry;
    }
  }
  for (const qid of a.bookmarks ?? []) {
    const q = byId.get(qid);
    if (q && !mistakes[qid]) mistakes[qid] = { question: q, set: q.setId ? setsById.get(q.setId) : undefined, reason: 'bookmark', addedAt: Date.now(), streak: 0 };
  }
  await writeMistakes(mistakes);
}
