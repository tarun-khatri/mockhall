/**
 * Export an authored chapter for a BLIND solve: keys, solutions and tags are stripped.
 * Para jumbles are exported twice, each with sentence labels shuffled (SPEC 7.6 step 4).
 *
 *   npx tsx scripts/qa/export-blind.ts <chapter> <outDir> [key,key,...]
 *
 * Writes <outDir>/<chapter>.questions.md (for the solver) and <outDir>/<chapter>.map.json (label maps; keep private).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { authoredFileSchema } from '../../src/content/schema';
import { makeRng } from '../../src/lib/rng';

const [chapter, outDir, only] = process.argv.slice(2);
if (!chapter || !outDir) {
  console.error('usage: export-blind.ts <chapter> <outDir> [keys]');
  process.exit(2);
}
const keys = only ? new Set(only.split(',')) : null;
const file = authoredFileSchema.parse(JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'src', 'content', 'authored', 'english', `${chapter}.json`), 'utf8')));
const L = 'ABCDE';
const lines: string[] = [
  `# Blind solve — ${chapter}`,
  '',
  'Answer every item. For each, give the option letter you are confident is correct and an ambiguity rating 1–5',
  '(1 = exactly one defensible answer, 3 = a second option is arguable, 5 = broken). Explain briefly when ambiguity ≥ 2.',
  '',
];
const map: Record<string, Record<string, string>> = {};

for (const q of file.items ?? []) {
  if (keys && !keys.has(q.key)) continue;
  lines.push(`## ${q.key}`, '', q.prompt, '', ...q.options.map((o, i) => `(${L[i]}) ${o}`), '');
}
for (const s of file.sets ?? []) {
  if (keys && !keys.has(s.key)) continue;
  lines.push(`## SET ${s.key}: ${s.title}`, '', s.stimulus, '');
  for (const q of s.questions) lines.push(`### ${s.key}/${q.key}`, '', q.prompt, '', ...q.options.map((o, i) => `(${L[i]}) ${o}`), '');
}
for (const pj of file.paraJumbles ?? []) {
  if (keys && !keys.has(pj.key)) continue;
  for (const pass of [1, 2]) {
    const labels = pj.sentences.map((s) => s.label);
    const shuffled = makeRng(`blind:${pj.key}:${pass}`).shuffle(labels);
    const relabel: Record<string, string> = {}; // original → shown; labels follow the shuffled display order
    shuffled.forEach((orig, i) => (relabel[orig] = String.fromCharCode(80 + i))); // P, Q, R, S, T, U
    const shown = shuffled.map((orig) => ({ label: relabel[orig], text: pj.sentences.find((x) => x.label === orig)!.text }));
    map[`${pj.key}#${pass}`] = relabel;
    const fixed = pj.fixed ? `\nSentence (${relabel[pj.fixed.label]}) must stay in position ${pj.fixed.position}.` : '';
    lines.push(
      `## ${pj.key}#${pass}`,
      '',
      `Arrange the sentences into the single most coherent paragraph. Give the full order as a string of labels, e.g. "PRTQS".${fixed}`,
      '',
      ...shown.map((s) => `(${s.label}) ${s.text}`),
      '',
    );
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${chapter}.questions.md`), lines.join('\n'));
writeFileSync(join(outDir, `${chapter}.map.json`), JSON.stringify(map, null, 2));
console.log(`wrote ${join(outDir, `${chapter}.questions.md`)}`);
