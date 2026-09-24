/** Frozen reference sets (SPEC 7.7): every generator must still produce exactly the frozen questions. */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChapterGenerator } from '../../src/content/generators/types';
import type { Difficulty } from '../../src/content/types';

const ROOT = join(import.meta.dirname, '..', '..');
const dir = join(ROOT, 'data', 'reference');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];

describe('frozen reference sets', () => {
  it('exist', () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    it(f, async () => {
      const ref = JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
        chapter: string;
        version: number;
        entries: { seed: string; difficulty: Difficulty; subtype: string; ids: string[] }[];
      };
      const subject = ['quant', 'reasoning', 'english'].find((s) => existsSync(join(ROOT, 'src', 'content', 'generators', s, `${ref.chapter}.ts`)));
      const mod = (await import(`../../src/content/generators/${subject}/${ref.chapter}.ts`)) as { generator: ChapterGenerator };
      if (mod.generator.version !== ref.version) return; // version bumped: re-freeze with scripts/reference-sets.ts
      const total = ref.entries.reduce((s, e) => s + e.ids.length, 0);
      expect(total).toBeGreaterThanOrEqual(60);
      for (const e of ref.entries) {
        expect(mod.generator.build(e.seed, e.difficulty, e.subtype).item.questions.map((q) => q.id), `${ref.chapter} ${e.seed}`).toEqual(e.ids);
      }
    });
  }
});
