/**
 * Every shipped seating bank (public/banks/seating/*.json): schema, size budget, no duplicates, and each set
 * re-solved from its text by the independent verifier (unique arrangement, every key correct). SPEC 14.3.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { bankFileSchema } from '../../../src/content/schema';
import { verifyItem } from '../../../src/content/verify/reasoning/seating';
import { generator } from '../../../src/content/generators/reasoning/seating';
import type { Item } from '../../../src/content/types';

const DIR = join(import.meta.dirname, '..', '..', '..', 'public', 'banks', 'seating');
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).sort() : [];
const seenIds = new Set<string>();

describe('seating banks', () => {
  it('exist for every subtype and difficulty the generator declares', () => {
    for (const st of generator.subtypes)
      for (const d of st.difficulties ?? []) {
        const re = new RegExp(`^${st.id}\\.${d}(\\.\\d+)?\\.json$`);
        expect(files.some((f) => re.test(f)), `${st.id}.${d}`).toBe(true);
      }
  });

  for (const f of files) {
    it(f, () => {
      const raw = readFileSync(join(DIR, f), 'utf8');
      expect(gzipSync(raw).length, 'gzip size').toBeLessThanOrEqual(120 * 1024);
      const bank = bankFileSchema.parse(JSON.parse(raw));
      const [subtype, difficulty] = f.split('.');
      expect(bank.chapter).toBe('seating');
      expect(bank.subtype).toBe(subtype);
      expect(bank.difficulty).toBe(difficulty);
      for (const it0 of bank.items) {
        const item = it0 as Item;
        expect(item.set?.kind).toBe('seating');
        expect(item.set?.subtype).toBe(subtype);
        expect(item.set?.difficulty).toBe(difficulty);
        expect(seenIds.has(item.set!.id), `duplicate set ${item.set!.id}`).toBe(false);
        seenIds.add(item.set!.id);
        const expected = verifyItem(item);
        expect(expected, `${item.set!.id}`).toEqual(item.questions.map((q) => q.answerIndex));
      }
    });
  }
});
