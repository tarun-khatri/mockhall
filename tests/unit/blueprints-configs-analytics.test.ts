import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, fixedMockVariants, MOCK_PRESETS } from '../../src/content/blueprints';
import { decodeConfig, encodeConfig, fixedMock, chapterConfig, chapterSeconds } from '../../src/exam/configs';
import { median, stat, weakAreas, mastery } from '../../src/analytics';
import type { LogEntry } from '../../src/lib/storage';
import { assembleChapter } from '../../src/exam/assemble';

describe('blueprints', () => {
  it('every blueprint sums to its section total', () => {
    for (const bp of BLUEPRINTS) {
      expect(bp.slots.reduce((s, x) => s + x.count, 0), bp.id).toBe(bp.total);
      expect(bp.total).toBe(bp.subject === 'english' ? 30 : 35);
    }
  });
  it('mock presets are probability mixes', () => {
    for (const p of Object.values(MOCK_PRESETS)) expect(Object.values(p.mix).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  it('fixed mocks use only defined variants', () => {
    for (let n = 1; n <= 30; n++) {
      const v = fixedMockVariants(n);
      for (const [subject, variant] of Object.entries(v)) expect(BLUEPRINTS.some((b) => b.subject === subject && b.variant === variant)).toBe(true);
    }
  });
});

describe('share links', () => {
  it('config encode/decode round-trips', () => {
    const cfg = fixedMock(7, 'ibps-clerk', 'tough', true);
    expect(decodeConfig(encodeConfig(cfg))).toEqual(cfg);
    const ch = chapterConfig({ chapter: 'percentage', exam: 'sbi-clerk', count: 20, difficulty: 'hard', mode: 'test', pace: 'pressure', subtypes: ['election'], seed: 's' });
    expect(decodeConfig(encodeConfig(ch))).toEqual(ch);
    expect(decodeConfig('not-a-config')).toBeNull();
  });
  it('chapter timing = targets × pace, rounded up to the minute', () => {
    expect(chapterSeconds(500, 'exam')).toBe(540);
    expect(chapterSeconds(500, 'pressure')).toBe(420);
    expect(chapterSeconds(500, 'untimed')).toBe(0);
  });
});

function entry(p: Partial<LogEntry>): LogEntry {
  return { qid: 'q', attemptId: 'a', kind: 'chapter-test', subject: 'quant', chapter: 'percentage', subtype: 'x', difficulty: 'medium', outcome: 'correct', visited: true, ms: 30_000, target: 50, at: 0, ...p };
}

describe('analytics', () => {
  it('median and accuracy', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    const s = stat([entry({}), entry({ outcome: 'wrong' }), entry({ outcome: 'skipped' })]);
    expect(s.attempted).toBe(2);
    expect(s.accuracy).toBe(0.5);
  });
  it('mastery weights hard questions more', () => {
    expect(mastery([entry({ difficulty: 'hard' }), entry({ difficulty: 'easy', outcome: 'wrong' })])).toBeGreaterThan(0.5);
  });
  it('weak areas rank by accuracy gap × exam weight', () => {
    const log = [
      ...Array.from({ length: 4 }, (_, i) => entry({ qid: `a${i}`, chapter: 'simplification', subtype: 'bodmas', outcome: 'wrong' })),
      ...Array.from({ length: 4 }, (_, i) => entry({ qid: `b${i}`, chapter: 'mixtures', subtype: 'replacement', outcome: 'wrong' })),
    ];
    const w = weakAreas(log);
    expect(w[0].chapter).toBe('simplification');
  });
});

describe('assembly', () => {
  it('never repeats a question within a chapter test', async () => {
    const section = await assembleChapter('percentage', 30, 'mixed', undefined, 'no-repeat');
    expect(section.questions).toHaveLength(30);
    expect(new Set(section.questions.map((q) => q.id)).size).toBe(30);
  });
  it('is deterministic for a seed', async () => {
    const a = await assembleChapter('interest', 10, 'medium', undefined, 'same-seed');
    const b = await assembleChapter('interest', 10, 'medium', undefined, 'same-seed');
    expect(a.questions.map((q) => q.id)).toEqual(b.questions.map((q) => q.id));
  });
});
