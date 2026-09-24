/**
 * Freeze a reference set per verified generator chapter (SPEC 7.7): 60 questions, 15/20/15/10 by difficulty.
 * Stored as ids + seeds in data/reference/<chapter>.json; tests/property/reference.test.ts rebuilds them and fails on
 * any drift (a generator change must bump its version and re-freeze deliberately).
 *   npx tsx scripts/reference-sets.ts
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ChapterGenerator } from '../src/content/generators/types';
import { subtypeSupports } from '../src/content/generators/types';
import type { Difficulty } from '../src/content/types';

const ROOT = join(import.meta.dirname, '..');
const SPLIT: [Difficulty, number][] = [
  ['easy', 15],
  ['medium', 20],
  ['hard', 15],
  ['extreme', 10],
];
// Bank chapters are frozen by their bank files already.
const SKIP = new Set(['seating', 'puzzles']);

const verified: string[] = JSON.parse(readFileSync(join(ROOT, 'src', 'content', 'verified-generators.json'), 'utf8'));
const out = join(ROOT, 'data', 'reference');
mkdirSync(out, { recursive: true });

for (const chapter of verified) {
  if (SKIP.has(chapter)) continue;
  const subject = ['quant', 'reasoning', 'english'].find((s) => existsSync(join(ROOT, 'src', 'content', 'generators', s, `${chapter}.ts`)));
  if (!subject) continue;
  const mod = (await import(`../src/content/generators/${subject}/${chapter}.ts`)) as { generator: ChapterGenerator };
  const gen = mod.generator;
  const entries: { seed: string; difficulty: Difficulty; subtype: string; ids: string[] }[] = [];
  for (const [d, n] of SPLIT) {
    const subs = gen.subtypes.filter((s) => subtypeSupports(s, d));
    if (!subs.length) continue;
    let count = 0;
    for (let i = 0; count < n && i < n * 4; i++) {
      const st = subs[i % subs.length];
      const seed = `ref-${chapter}-${d}-${i}`;
      const item = gen.build(seed, d, st.id).item;
      entries.push({ seed, difficulty: d, subtype: st.id, ids: item.questions.map((q) => q.id) });
      count += item.questions.length;
    }
  }
  writeFileSync(join(out, `${chapter}.json`), JSON.stringify({ chapter, generator: gen.name, version: gen.version, entries }, null, 1) + '\n');
  console.log(`${chapter}: ${entries.reduce((s, e) => s + e.ids.length, 0)} questions frozen`);
}
