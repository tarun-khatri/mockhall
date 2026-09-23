import { describe, expect, it } from 'vitest';
import type { Question, TestConfig } from '../../src/content/types';
import {
  INTERSTITIAL_MS,
  accuracyNeeded,
  advanceIfExpired,
  answerAndLock,
  clearResponse,
  createAttempt,
  endSectionNow,
  markAndNext,
  navigate,
  paletteCounts,
  paletteStatus,
  pause,
  remainingMs,
  resume,
  saveAndNext,
  scoreAttempt,
  submit,
  toggleOption,
} from '../../src/exam/engine';

function q(id: string, answerIndex: 0 | 1 | 2 | 3 | 4 = 0, subject: Question['subject'] = 'quant'): Question {
  return {
    id,
    subject,
    chapter: 'percentage',
    subtype: 'x',
    difficulty: 'medium',
    prompt: `Q ${id}`,
    options: ['a', 'b', 'c', 'd', 'e'],
    answerIndex,
    targetSeconds: 30,
    solution: { steps: ['s'] },
    tags: [],
    source: 'generator',
    verification: { method: 'computed+independent', passedAt: 'x' },
  };
}

function config(sections: number[], strict = true): TestConfig {
  return {
    kind: 'full-mock',
    exam: 'sbi-clerk',
    title: 't',
    sections: sections.map((seconds, i) => ({ subject: (['english', 'quant', 'reasoning'] as const)[i % 3], count: 3, seconds })),
    sectionOrder: ['english', 'quant', 'reasoning'],
    sectionalTiming: sections.length > 1,
    strictTimer: strict,
    instantFeedback: false,
    difficultyMix: { easy: 0, medium: 1, hard: 0, extreme: 0 },
    seed: 's',
    pace: 'exam',
  };
}

const T0 = 1_700_000_000_000;

function threeSections(strict = true) {
  const sections = [0, 1, 2].map((s) => ({ questions: [0, 1, 2].map((i) => q(`s${s}q${i}`, (i % 5) as 0 | 1 | 2)), sets: [] }));
  return createAttempt('a1', config([1200, 1200, 1200], strict), sections, T0);
}

describe('palette status and the save rule', () => {
  it('starts with Q1 visited (not answered) and the rest not visited', () => {
    const a = threeSections();
    expect(paletteStatus(a.responses['s0q0'])).toBe('not-answered');
    expect(paletteStatus(a.responses['s0q1'])).toBe('not-visited');
  });

  it('a selection counts only after Save & next', () => {
    let a = threeSections();
    a = toggleOption(a, 2);
    expect(a.responses['s0q0'].selected).toBeNull();
    a = saveAndNext(a);
    expect(a.responses['s0q0'].selected).toBe(2);
    expect(paletteStatus(a.responses['s0q0'])).toBe('answered');
    expect(a.currentIndex).toBe(1);
  });

  it('tapping the selected option again deselects the draft', () => {
    let a = threeSections();
    a = toggleOption(a, 1);
    a = toggleOption(a, 1);
    a = saveAndNext(a);
    expect(paletteStatus(a.responses['s0q0'])).toBe('not-answered');
  });

  it('mark for review with and without an answer', () => {
    let a = threeSections();
    a = toggleOption(a, 0);
    a = markAndNext(a); // q0 answered & marked
    a = markAndNext(a); // q1 marked, no answer
    expect(paletteStatus(a.responses['s0q0'])).toBe('answered-marked');
    expect(paletteStatus(a.responses['s0q1'])).toBe('marked');
    const c = paletteCounts(a, 0);
    expect(c).toEqual({ 'not-visited': 0, 'not-answered': 1, answered: 0, marked: 1, 'answered-marked': 1 });
  });

  it('clear response removes the saved answer', () => {
    let a = threeSections();
    a = toggleOption(a, 3);
    a = saveAndNext(a);
    a = navigate(a, 0, 0).attempt;
    a = clearResponse(a);
    expect(a.responses['s0q0'].selected).toBeNull();
    expect(paletteStatus(a.responses['s0q0'])).toBe('not-answered');
  });

  it('navigating away with an unsaved selection discards it and reports it', () => {
    let a = threeSections();
    a = toggleOption(a, 4);
    const r = navigate(a, 0, 2);
    expect(r.discardedUnsaved).toBe(true);
    expect(r.attempt.responses['s0q0'].selected).toBeNull();
    expect(paletteStatus(r.attempt.responses['s0q2'])).toBe('not-answered');
  });

  it('Save & next on the last question wraps to the first of the same section', () => {
    let a = threeSections();
    a = navigate(a, 0, 2).attempt;
    a = saveAndNext(a);
    expect(a.currentSection).toBe(0);
    expect(a.currentIndex).toBe(0);
  });

  it('practice instant feedback locks the answer', () => {
    let a = threeSections(false);
    a = answerAndLock(a, 1);
    expect(a.responses['s0q0'].selected).toBe(1);
    const again = toggleOption(a, 2);
    expect(again.draft?.selected).toBe(1);
    expect(clearResponse(a).responses['s0q0'].selected).toBe(1);
  });
});

describe('scoring', () => {
  it('+1 / −0.25 / 0; answered & marked counts, marked without answer does not', () => {
    let a = threeSections();
    // s0q0 answer 0 correct; s0q1 answer 1 correct but only marked with answer; s0q2 marked without answer
    a = toggleOption(a, 0);
    a = saveAndNext(a);
    a = toggleOption(a, 1);
    a = markAndNext(a);
    a = markAndNext(a);
    // section 2: one wrong answer
    a = endSectionNow(a, T0 + 1000);
    a = toggleOption(a, 4);
    a = saveAndNext(a);
    a = submit(a, T0 + 5000);
    const s = scoreAttempt(a);
    expect(s.correct).toBe(2);
    expect(s.wrong).toBe(1);
    expect(s.score).toBe(1.75);
    expect(s.sections[0].score).toBe(2);
    expect(s.sections[1].score).toBe(-0.25);
    expect(s.skipped).toBe(6);
    expect(s.negativeMarks).toBe(0.25);
  });

  it('accuracy needed for a target', () => {
    expect(accuracyNeeded(60, 80)).toBeCloseTo((60 + 20) / 1.25 / 80);
    expect(accuracyNeeded(90, 80)).toBeNull();
  });
});

describe('deadline timers and sectional flow', () => {
  it('sets the first deadline at start and reports remaining time from the deadline', () => {
    const a = threeSections();
    expect(a.sectionDeadlines[0]).toBe(T0 + 1_200_000);
    expect(remainingMs(a, T0 + 60_000)).toBe(1_140_000);
  });

  it('closes an expired section, auto-saves the draft, and starts the next after the interstitial', () => {
    let a = threeSections();
    a = toggleOption(a, 0); // unsaved draft on s0q0
    const { attempt, closed } = advanceIfExpired(a, T0 + 1_200_000);
    expect(closed).toEqual([0]);
    expect(attempt.responses['s0q0'].selected).toBe(0);
    expect(attempt.currentSection).toBe(1);
    expect(attempt.sectionStartedAt[1]).toBe(T0 + 1_200_000 + INTERSTITIAL_MS);
    expect(attempt.sectionDeadlines[1]).toBe(T0 + 2_400_000 + INTERSTITIAL_MS);
  });

  it('locks previous sections under sectional timing', () => {
    const a = advanceIfExpired(threeSections(), T0 + 1_200_000).attempt;
    const r = navigate(a, 0, 1);
    expect(r.blocked).toBe(true);
    expect(r.attempt.currentSection).toBe(1);
  });

  it('strict: catches up several sections after a long absence and auto-submits at the last deadline', () => {
    const a = threeSections();
    const later = T0 + 3 * 1_200_000 + 2 * INTERSTITIAL_MS + 10;
    const { attempt, closed } = advanceIfExpired(a, later);
    expect(closed).toEqual([0, 1, 2]);
    expect(attempt.status).toBe('submitted');
    expect(attempt.submittedAt).toBe(T0 + 3 * 1_200_000 + 2 * INTERSTITIAL_MS);
  });

  it('strict: hidden for 3 minutes means 3 minutes less on return', () => {
    const a = threeSections();
    expect(remainingMs(a, T0 + 180_000)).toBe(1_200_000 - 180_000);
    expect(pause(a, T0).pausedAt).toBeUndefined();
  });

  it('non-strict: pause freezes the clock and resume extends the deadline', () => {
    const a = threeSections(false);
    const p = pause(a, T0 + 60_000);
    expect(remainingMs(p, T0 + 500_000)).toBe(1_140_000);
    expect(advanceIfExpired(p, T0 + 5_000_000).closed).toEqual([]);
    const r = resume(p, T0 + 360_000);
    expect(r.sectionDeadlines[0]).toBe(T0 + 1_200_000 + 300_000);
    expect(remainingMs(r, T0 + 360_000)).toBe(1_140_000);
  });

  it('ending a section early opens the next one and the last one submits', () => {
    let a = threeSections();
    a = endSectionNow(a, T0 + 10_000);
    expect(a.currentSection).toBe(1);
    a = endSectionNow(a, T0 + 20_000);
    a = endSectionNow(a, T0 + 30_000);
    expect(a.status).toBe('submitted');
  });
});
