import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, MAINS, fixedMockVariants, MOCK_PRESETS } from '../../src/content/blueprints';
import { decodeConfig, encodeConfig, fixedMock, chapterConfig, chapterSeconds } from '../../src/exam/configs';
import { median, stat, weakAreas, mastery } from '../../src/analytics';
import type { LogEntry } from '../../src/lib/storage';
import { assembleChapter, assembleBlueprint } from '../../src/exam/assemble';
import { blueprint } from '../../src/content/blueprints';
import { mixedProvider, type ChapterProvider } from '../../src/content/providers';
import type { Difficulty, Item } from '../../src/content/types';

describe('blueprints', () => {
  it('every blueprint sums to its section total', () => {
    for (const bp of BLUEPRINTS) {
      expect(bp.slots.reduce((s, x) => s + x.count, 0), bp.id).toBe(bp.total);
      if (!bp.variant.endsWith('-M')) expect(bp.total).toBe(bp.subject === 'english' ? 30 : 35);
      else expect(bp.total).toBe(MAINS[bp.variant === 'SBI-M' ? 'sbi-clerk' : 'ibps-clerk'].sections[bp.subject].count);
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

describe('unseen-first practice', () => {
  it('skips already attempted questions while unseen ones remain', async () => {
    const first = await assembleChapter('error-spotting', 10, 'medium', undefined, 'unseen');
    const avoid = new Set(first.questions.map((q) => q.id));
    const second = await assembleChapter('error-spotting', 10, 'medium', undefined, 'unseen', avoid);
    expect(second.questions).toHaveLength(10);
    expect(second.questions.filter((q) => avoid.has(q.id))).toHaveLength(0);
  });
  it('still fills the test once the bank has run dry', async () => {
    const all = await assembleChapter('error-spotting', 200, 'extreme', undefined, 'dry');
    const again = await assembleChapter('error-spotting', 5, 'extreme', undefined, 'dry-2', new Set(all.questions.map((q) => q.id)));
    expect(again.questions).toHaveLength(5);
  });
});

describe('mixed generator + authored provider', () => {
  const fake = (name: string, subtypes: string[], difficulties: Difficulty[]): ChapterProvider => ({
    chapter: 'percentage',
    subtypes: subtypes.map((id) => ({ id, label: id })),
    difficulties,
    async item(seed, difficulty, subtype) {
      return { questions: [{ id: `${name}:${subtype ?? '-'}:${difficulty}:${seed}` }] } as unknown as Item;
    },
  });
  const gen = fake('gen', ['base-change', 'election'], ['easy', 'medium', 'hard', 'extreme']);
  const auth = fake('auth', ['exam-style'], ['medium', 'hard']);
  const mixed = mixedProvider(gen, auth);
  const from = async (seed: string, d: Difficulty, st?: string) => (await mixed.item(seed, d, st)).questions[0].id.split(':')[0];

  it('routes explicit subtypes to their owner', async () => {
    expect(await from('s', 'medium', 'exam-style')).toBe('auth');
    expect(await from('s', 'medium', 'election')).toBe('gen');
    expect(mixed.subtypes.map((s) => s.id)).toEqual(['base-change', 'election', 'exam-style']);
  });
  it('mixes both sides only where the authored bank has the difficulty', async () => {
    const draws = await Promise.all(Array.from({ length: 400 }, (_, i) => from(`k${i}`, 'hard')));
    const share = draws.filter((d) => d === 'auth').length / draws.length;
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.5);
    const easy = await Promise.all(Array.from({ length: 50 }, (_, i) => from(`k${i}`, 'easy')));
    expect(easy.every((d) => d === 'gen')).toBe(true);
  });
  it('is deterministic in the seed', async () => {
    expect(await mixed.item('same', 'medium')).toEqual(await mixed.item('same', 'medium'));
  });
  it('shares a subtype both sides have, using the bank only where it has that difficulty', async () => {
    const bank = { ...fake('auth', ['election'], ['hard']), has: (d: Difficulty, st?: string) => d === 'hard' && (!st || st === 'election') };
    const both = mixedProvider(gen, bank);
    const hard = await Promise.all(Array.from({ length: 200 }, async (_, i) => (await both.item(`e${i}`, 'hard', 'election')).questions[0].id.split(':')[0]));
    expect(hard.filter((d) => d === 'auth').length).toBeGreaterThan(40);
    expect(hard.filter((d) => d === 'gen').length).toBeGreaterThan(80);
    const medium = await Promise.all(Array.from({ length: 50 }, async (_, i) => (await both.item(`e${i}`, 'medium', 'election')).questions[0].id.split(':')[0]));
    expect(medium.every((d) => d === 'gen')).toBe(true);
  });
  it('falls back to the generator when the bank is empty', () => {
    expect(mixedProvider(gen, fake('auth', [], []))).toBe(gen);
  });
});

describe('fresh mocks', () => {
  it('skip previously attempted questions and still fill the section', async () => {
    const bp = blueprint('english', 'A');
    const mix = { easy: 0, medium: 0.5, hard: 0.5, extreme: 0 };
    const first = await assembleBlueprint(bp, 'fresh-a', mix);
    const seen = new Set(first.questions.map((q) => q.id));
    const second = await assembleBlueprint(bp, 'fresh-a', mix, seen);
    expect(second.questions).toHaveLength(bp.total);
    expect(second.questions.filter((q) => seen.has(q.id)).length).toBeLessThan(bp.total / 3);
  });
});
