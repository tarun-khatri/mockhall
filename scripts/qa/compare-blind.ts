/**
 * Compare a blind solve with the keys. Items that match with ambiguity ≤ 2 get a QA record (content hash + date)
 * in src/content/authored/english/_qa/<chapter>.json; everything else is listed for rewrite.
 * A run log is appended to _qa/<chapter>.log.json for content-qa-report.md.
 *
 *   npx tsx scripts/qa/compare-blind.ts <chapter> <outDir>
 *
 * Expects <outDir>/<chapter>.answers.json:
 *   { "<key>": { "answer": "C", "ambiguity": 1, "note": "…" },            // single items
 *     "<setKey>/<qKey>": { "answer": "B", "ambiguity": 1 },              // set questions
 *     "<pjKey>#1": { "order": "RPTSQ", "ambiguity": 1 }, "<pjKey>#2": … } // para jumbles (two passes)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { authoredFileSchema } from '../../src/content/schema';
import { authoredHash, type QaFile } from '../../src/content/authored';

const [chapter, outDir] = process.argv.slice(2);
const root = join(import.meta.dirname, '..', '..', 'src', 'content', 'authored', 'english');
const file = authoredFileSchema.parse(JSON.parse(readFileSync(join(root, `${chapter}.json`), 'utf8')));
const answers = JSON.parse(readFileSync(join(outDir, `${chapter}.answers.json`), 'utf8')) as Record<string, { answer?: string; order?: string; ambiguity?: number; note?: string }>;
const map = existsSync(join(outDir, `${chapter}.map.json`)) ? (JSON.parse(readFileSync(join(outDir, `${chapter}.map.json`), 'utf8')) as Record<string, Record<string, string>>) : {};
const qaDir = join(root, '_qa');
mkdirSync(qaDir, { recursive: true });
const qaPath = join(qaDir, `${chapter}.json`);
const qa: QaFile = existsSync(qaPath) ? JSON.parse(readFileSync(qaPath, 'utf8')) : { chapter, records: {} };
const today = new Date().toISOString().slice(0, 10);
const L = 'ABCDE';

const passed: string[] = [];
const failed: { key: string; reason: string }[] = [];
const unanswered: string[] = [];

function check(key: string, expected: number): string | null {
  const a = answers[key];
  if (!a || !a.answer) return 'unanswered';
  if (a.answer.trim().toUpperCase() !== L[expected]) return `solver chose ${a.answer}, key is ${L[expected]}${a.note ? ` — ${a.note}` : ''}`;
  if ((a.ambiguity ?? 1) >= 3) return `ambiguity ${a.ambiguity}${a.note ? ` — ${a.note}` : ''}`;
  return null;
}

for (const q of file.items ?? []) {
  if (!answers[q.key]) {
    unanswered.push(q.key);
    continue;
  }
  const problem = check(q.key, q.answerIndex);
  if (problem) failed.push({ key: q.key, reason: problem });
  else {
    passed.push(q.key);
    qa.records[q.key] = { hash: authoredHash(q), passedAt: today };
  }
}

for (const s of file.sets ?? []) {
  const probs: string[] = [];
  let any = false;
  for (const q of s.questions) {
    const k = `${s.key}/${q.key}`;
    if (answers[k]) any = true;
    const p = check(k, q.answerIndex);
    if (p) probs.push(`${q.key}: ${p}`);
  }
  if (!any) {
    unanswered.push(s.key);
    continue;
  }
  if (probs.length) failed.push({ key: s.key, reason: probs.join(' | ') });
  else {
    passed.push(s.key);
    qa.records[s.key] = { hash: authoredHash(s), passedAt: today };
  }
}

for (const pj of file.paraJumbles ?? []) {
  const results: string[] = [];
  let answeredPasses = 0;
  for (const pass of [1, 2]) {
    const k = `${pj.key}#${pass}`;
    const a = answers[k];
    const relabel = map[k];
    if (!a?.order || !relabel) {
      results.push(`pass ${pass} unanswered`);
      continue;
    }
    answeredPasses++;
    const expected = pj.order
      .split('')
      .map((l) => relabel[l])
      .join('');
    if (a.order.replace(/[^A-Z]/gi, '').toUpperCase() !== expected) results.push(`pass ${pass}: solver ${a.order}, expected ${expected}${a.note ? ` — ${a.note}` : ''}`);
    else if ((a.ambiguity ?? 1) >= 3) results.push(`pass ${pass}: ambiguity ${a.ambiguity}`);
  }
  if (!answeredPasses) {
    unanswered.push(pj.key);
    continue;
  }
  if (results.length) failed.push({ key: pj.key, reason: results.join(' | ') });
  else {
    passed.push(pj.key);
    qa.records[pj.key] = { hash: authoredHash(pj), passedAt: today };
  }
}

// Drop records whose failing items were re-solved and failed now.
for (const f of failed) delete qa.records[f.key];
writeFileSync(qaPath, JSON.stringify(qa, null, 2) + '\n');

const logPath = join(qaDir, `${chapter}.log.json`);
const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : [];
log.push({ at: new Date().toISOString(), passed: passed.length, failed, unanswered });
writeFileSync(logPath, JSON.stringify(log, null, 2) + '\n');

console.log(`${chapter}: passed ${passed.length}, failed ${failed.length}, unanswered ${unanswered.length}`);
for (const f of failed) console.log(`  FAIL ${f.key}: ${f.reason}`);
