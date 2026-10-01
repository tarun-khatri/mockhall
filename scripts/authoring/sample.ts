/**
 * Print generated questions for a chapter (to see the house style and what the generator already covers).
 *
 *   npx tsx scripts/authoring/sample.ts <chapter> [count=12]
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DIFFICULTIES } from '../../src/content/types';

const [chapter, n = '12'] = process.argv.slice(2);
const subject = ['quant', 'reasoning', 'english'].find((s) => existsSync(join(import.meta.dirname, '..', '..', 'src', 'content', 'generators', s, `${chapter}.ts`)));
if (!subject) {
  console.error(`no generator for ${chapter}`);
  process.exit(1);
}
const { generator } = await import(`../../src/content/generators/${subject}/${chapter}.ts`);
console.log(`subtypes: ${generator.subtypes.map((s: { id: string }) => s.id).join(', ')}\n`);
for (let i = 0; i < Number(n); i++) {
  const d = DIFFICULTIES[i % 4];
  const { item } = generator.build(`sample-${i}`, d);
  const q = item.questions[0];
  console.log(`[${d} · ${q.subtype}] ${q.prompt}\n   ${q.options.map((o: string, j: number) => `(${'ABCDE'[j]}) ${o}`).join('  ')}   key ${'ABCDE'[q.answerIndex]}\n`);
}
