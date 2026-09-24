import type { ChapterId, Difficulty, ExamId, Pace, Subject, TestConfig } from '../content/types';
import { PACE_FACTOR } from '../content/types';
import { EXAM_LABEL, EXAM_ORDER, MAINS, MOCK_PRESETS, MIXED_SHARES, SECTION_DEFAULTS, fixedMockVariants, type BlueprintSlot } from '../content/blueprints';
import { chapterMeta } from '../content/chapters';
import type { MockPreset } from '../app/settings';
import { randomSeed } from '../lib/rng';

export function fullMockConfig(opts: {
  exam: ExamId;
  seed: string;
  title: string;
  preset: MockPreset;
  strict: boolean;
  variants?: Partial<Record<Subject, string>>;
}): TestConfig {
  const order = EXAM_ORDER[opts.exam];
  return {
    kind: 'full-mock',
    exam: opts.exam,
    title: opts.title,
    sections: order.map((subject) => ({ subject, ...SECTION_DEFAULTS[subject] })),
    sectionOrder: order,
    sectionalTiming: true,
    strictTimer: opts.strict,
    instantFeedback: false,
    difficultyMix: MOCK_PRESETS[opts.preset].mix,
    seed: opts.seed,
    pace: 'exam',
    variants: opts.variants ?? { english: 'A', quant: 'A', reasoning: 'A' },
  };
}

export function fixedMock(n: number, exam: ExamId, preset: MockPreset, strict: boolean): TestConfig {
  const nn = String(n).padStart(2, '0');
  return fullMockConfig({
    exam,
    seed: `mock-${nn}`,
    title: `Mock ${nn}`,
    preset,
    strict,
    variants: fixedMockVariants(n),
  });
}

export function freshMock(exam: ExamId, preset: MockPreset, strict: boolean): TestConfig {
  return fullMockConfig({ exam, seed: `fresh-${randomSeed()}`, title: `Fresh mock · ${EXAM_LABEL[exam]}`, preset, strict });
}

/** Mains mock (Phase 3): research/mains.md pattern, tough difficulty mix, strict sectional timing. */
export function mainsMockConfig(exam: ExamId, n: number | 'fresh', strict: boolean): TestConfig {
  const m = MAINS[exam];
  const variant = exam === 'sbi-clerk' ? 'SBI-M' : 'IBPS-M';
  const nn = n === 'fresh' ? null : String(n).padStart(2, '0');
  return {
    kind: 'full-mock',
    exam,
    title: nn ? `${m.label} · Mock ${nn}` : `${m.label} · fresh mock`,
    sections: m.order.map((subject) => ({ subject, ...m.sections[subject] })),
    sectionOrder: m.order,
    sectionalTiming: true,
    strictTimer: strict,
    instantFeedback: false,
    difficultyMix: MOCK_PRESETS.tough.mix,
    seed: nn ? `mains-${exam}-${nn}` : `fresh-${randomSeed()}`,
    pace: 'exam',
    variants: { english: variant, quant: variant, reasoning: variant },
  };
}

export function sectionalConfig(subject: Subject, exam: ExamId, preset: MockPreset, strict: boolean, seed = `sec-${randomSeed()}`): TestConfig {
  return {
    kind: 'sectional',
    exam,
    title: `${SECTION_DEFAULTS[subject].title} · sectional`,
    sections: [{ subject, ...SECTION_DEFAULTS[subject] }],
    sectionOrder: [subject],
    sectionalTiming: false,
    strictTimer: strict,
    instantFeedback: false,
    difficultyMix: MOCK_PRESETS[preset].mix,
    seed,
    pace: 'exam',
    variants: { [subject]: 'A' },
  };
}

export function chapterConfig(opts: {
  chapter: ChapterId;
  exam: ExamId;
  count: number;
  difficulty: Difficulty | 'mixed';
  mode: 'practice' | 'test';
  pace: Pace;
  subtypes: string[];
  seed?: string;
}): TestConfig {
  const meta = chapterMeta(opts.chapter);
  const practice = opts.mode === 'practice';
  const diffLabel = opts.difficulty === 'mixed' ? 'mixed' : opts.difficulty;
  return {
    kind: practice ? 'practice' : 'chapter-test',
    exam: opts.exam,
    title: `${meta.title} · ${practice ? 'practice' : 'test'} · ${diffLabel}`,
    sections: [{ subject: meta.subject, count: opts.count, seconds: 0, title: meta.title }],
    sectionOrder: [meta.subject],
    sectionalTiming: false,
    strictTimer: false,
    instantFeedback: practice,
    difficultyMix: opts.difficulty === 'mixed' ? MIXED_SHARES : { easy: 0, medium: 0, hard: 0, extreme: 0, [opts.difficulty]: 1 },
    seed: opts.seed ?? `ch-${randomSeed()}`,
    pace: practice ? 'untimed' : opts.pace,
    chapter: opts.chapter,
    subtypes: opts.subtypes.length ? opts.subtypes : undefined,
    difficulty: opts.difficulty,
  };
}

/** Timed chapter tests: sum of targets × pace, rounded up to the minute (SPEC 7.3). */
export function chapterSeconds(targetSum: number, pace: Pace): number {
  const f = PACE_FACTOR[pace];
  if (f === null) return 0;
  return Math.max(60, Math.ceil((targetSum * f) / 60) * 60);
}

/* ------------------------------------------------------------------ */
/* Share links: /t/<encoded>                                           */
/* ------------------------------------------------------------------ */

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeConfig(config: TestConfig): string {
  return toBase64Url(JSON.stringify({ v: 1, c: config }));
}

export function decodeConfig(encoded: string): TestConfig | null {
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as { v: number; c: TestConfig };
    if (parsed.v !== 1 || !parsed.c || !Array.isArray(parsed.c.sections)) return null;
    return parsed.c;
  } catch {
    return null;
  }
}

export type { BlueprintSlot };
