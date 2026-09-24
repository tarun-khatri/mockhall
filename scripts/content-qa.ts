/**
 * Write content-qa-report.md from the authored banks and the blind-solve logs (SPEC 7.6 step 6).
 *   npx tsx scripts/content-qa.ts
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { authoredFileSchema } from '../src/content/schema';
import { authoredHash, type QaFile } from '../src/content/authored';

const ROOT = join(import.meta.dirname, '..');
const rows: string[] = [];
const details: string[] = [];
let totalFinal = 0;
for (const subjectDir of ['english', 'reasoning']) {
const dir = join(ROOT, 'src', 'content', 'authored', subjectDir);
if (!existsSync(dir)) continue;

for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
  const chapter = name.replace(/\.json$/, '');
  const file = authoredFileSchema.parse(JSON.parse(readFileSync(join(dir, name), 'utf8')));
  const entries = [...(file.items ?? []), ...(file.sets ?? []), ...(file.paraJumbles ?? [])];
  const qaPath = join(dir, '_qa', `${chapter}.json`);
  const logPath = join(dir, '_qa', `${chapter}.log.json`);
  const qa: QaFile = existsSync(qaPath) ? JSON.parse(readFileSync(qaPath, 'utf8')) : { chapter, records: {} };
  const log: { at: string; passed: number; failed: { key: string; reason: string }[] }[] = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : [];
  const verified = entries.filter((e) => qa.records[e.key]?.hash === authoredHash(e));
  const everFailed = new Set(log.flatMap((l) => l.failed.map((f) => f.key)));
  const rewritten = [...everFailed].filter((k) => entries.some((e) => e.key === k)).length;
  const dropped = [...everFailed].filter((k) => !entries.some((e) => e.key === k)).length;
  const byDiff: Record<string, number> = { easy: 0, medium: 0, hard: 0, extreme: 0 };
  for (const e of verified) byDiff[e.difficulty]++;
  const questions = (file.items?.length ?? 0) + (file.sets ?? []).reduce((s, x) => s + x.questions.length, 0) + (file.paraJumbles ?? []).reduce((s, p) => s + (p.sentences.length === 6 ? 5 : 5), 0);
  const unit = file.sets ? 'passages' : file.paraJumbles ? 'sets' : 'items';
  totalFinal += questions;
  rows.push(
    `| ${chapter} | ${entries.length} ${unit} | ${verified.length} | ${rewritten} | ${dropped} | ${verified.length} (${byDiff.easy}/${byDiff.medium}/${byDiff.hard}/${byDiff.extreme}) | ${questions} |`,
  );
  if (everFailed.size) details.push(`- **${chapter}**: ${[...everFailed].join(', ')}`);
}
}

const md = `# Content QA report

Generated ${new Date().toISOString().slice(0, 10)} by \`npm run qa\`.

Pipeline (SPEC 7.6): authored as JSON in batches → zod schema + near-duplicate (trigram > 0.85) + British-spelling checks
(\`scripts/validate-authored.ts\`) → **blind solve** by a separate agent that sees no keys (\`scripts/qa/export-blind.ts\`),
rating ambiguity 1–5 → comparison with the keys (\`scripts/qa/compare-blind.ts\`). An item passes only if the blind answer
matches the key with ambiguity ≤ 2. Para jumbles are solved twice with shuffled labels and both orders must match.
Passing items are recorded with a content hash; editing an item afterwards un-verifies it and the build fails.

| Chapter | Written | Passed | Rewritten | Dropped | Final (E/M/H/X) | Questions served |
|---|---|---|---|---|---|---|
${rows.join('\n')}

Total authored questions served: **${totalFinal}**.

${details.length ? `## Items that failed a blind solve at least once\n\n${details.join('\n')}\n` : 'No item failed a blind solve.\n'}
## Generated English (hybrid)

Misspelt words are generated from a curated word list with dictionary-vetted misspellings; answers are checked by an
independent verifier in the property tests (see \`tests/property/english/\`), not by blind solve.
`;
writeFileSync(join(ROOT, 'content-qa-report.md'), md);
console.log(md);
