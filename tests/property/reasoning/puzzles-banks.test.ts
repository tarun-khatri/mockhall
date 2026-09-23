/**
 * SPEC 14.3: every shipped puzzle set is re-verified. Loads every file in public/banks/puzzles/index.json,
 * validates it against bankFileSchema, and re-runs the independent verifier on every set (clue text re-parsed,
 * exactly one arrangement, every answer key recomputed).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { bankFileSchema, itemSchema } from '../../../src/content/schema';
import { normaliseOption } from '../../../src/content/rich';
import { verify } from '../../../src/content/verify/reasoning/puzzles';
import { SUBTYPES, type PuzzlesFacts } from '../../../src/content/generators/reasoning/puzzles';
import { DIFFICULTIES, type Item } from '../../../src/content/types';

const DIR = join(import.meta.dirname, '..', '..', '..', 'public', 'banks', 'puzzles');
const MIN_SETS = Number(process.env.PUZZLE_BANK_MIN ?? 60);

interface Entry {
  chapter: string;
  subtype: string;
  difficulty: string;
  file: string;
  count: number;
  bytes: number;
}

const index: { files: Entry[] } = existsSync(join(DIR, 'index.json')) ? JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')) : { files: [] };

describe('puzzle banks', () => {
  it('cover every subtype × difficulty with enough sets', () => {
    for (const st of SUBTYPES)
      for (const d of st.difficulties ?? DIFFICULTIES) {
        const n = index.files.filter((f) => f.subtype === st.id && f.difficulty === d).reduce((s, f) => s + f.count, 0);
        expect(n, `${st.id}/${d}`).toBeGreaterThanOrEqual(MIN_SETS);
      }
  });

  const seenSets = new Set<string>();
  const seenQuestions = new Set<string>();
  for (const entry of index.files) {
    it(`${entry.file} is valid and every set re-verifies`, () => {
      const raw = readFileSync(join(DIR, '..', entry.file), 'utf8');
      expect(gzipSync(raw).length, 'gzip size').toBeLessThanOrEqual(120 * 1024);
      const json = JSON.parse(raw);
      const parsed = bankFileSchema.safeParse(json);
      expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 3))).toBe(true);
      expect(json.chapter).toBe('puzzles');
      expect(json.subtype).toBe(entry.subtype);
      expect(json.difficulty).toBe(entry.difficulty);
      expect(json.items.length).toBe(entry.count);
      const letters = [0, 0, 0, 0, 0];
      const problems: string[] = [];
      for (const it of json.items as (Item & { facts: PuzzlesFacts })[]) {
        const { facts, ...item } = it;
        const set = item.set!;
        if (!itemSchema.safeParse(item).success) problems.push(`${set.id}: item schema`);
        if (set.subtype !== entry.subtype || set.difficulty !== entry.difficulty) problems.push(`${set.id}: wrong subtype/difficulty`);
        if (seenSets.has(set.id)) problems.push(`${set.id}: duplicate set`);
        seenSets.add(set.id);
        for (const q of item.questions) {
          if (seenQuestions.has(q.id)) problems.push(`${q.id}: duplicate question id`);
          seenQuestions.add(q.id);
          if (q.verification.method !== 'solver-unique') problems.push(`${q.id}: verification method`);
          if (new Set(q.options.map(normaliseOption)).size !== 5) problems.push(`${q.id}: options not distinct`);
          letters[q.answerIndex]++;
        }
        let expected: (number | string)[] = [];
        try {
          expected = verify({ item, facts });
        } catch (e) {
          problems.push(`${set.id}: verifier threw ${(e as Error).message}`);
          continue;
        }
        item.questions.forEach((q, i) => {
          const x = expected[i];
          const idx = typeof x === 'number' ? x : q.options.findIndex((o) => normaliseOption(o) === normaliseOption(x));
          if (idx !== q.answerIndex) problems.push(`${q.id}: key ${'ABCDE'[q.answerIndex]} but verifier says ${JSON.stringify(x)}`);
        });
      }
      expect(problems.slice(0, 10)).toEqual([]);
      // answer letters spread over A–E
      const total = letters.reduce((a, b) => a + b, 0);
      if (total >= 200) for (const n of letters) expect(n / total).toBeGreaterThan(0.08);
    });
  }
});
