/**
 * Validate authored JSON banks: schema, counts by difficulty, correct-letter spread, near-duplicates,
 * and a light American-spelling check.
 *
 *   npx tsx scripts/validate-authored.ts                      # all files in src/content/authored/**
 *   npx tsx scripts/validate-authored.ts error-spotting.json  # one file (matched by name)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { authoredFileSchema, type AuthoredFile } from '../src/content/schema';

const ROOT = join(import.meta.dirname, '..', 'src', 'content', 'authored');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name.startsWith('_')) continue;
      out.push(...walk(p));
    } else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

export function normaliseText(s: string): string {
  return s
    .toLowerCase()
    .replace(/\*\*|\*|_{2,}|\$/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function trigrams(s: string): Set<string> {
  const t = new Set<string>();
  const x = ` ${s} `;
  for (let i = 0; i < x.length - 2; i++) t.add(x.slice(i, i + 3));
  return t;
}

export function similarity(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  return inter / Math.max(1, a.size + b.size - inter);
}

const AMERICAN = [
  /\bcolor(s|ed|ful)?\b/i,
  /\bfavor(s|ed|ite|able)?\b/i,
  /\bhonor(s|ed)?\b/i,
  /\blabor(s|ed)?\b/i,
  /\bneighbor/i,
  /\bbehavior/i,
  /\borganiz/i,
  /\brealiz/i,
  /\brecogniz/i,
  /\banalyz/i,
  /\bcenter(s|ed)?\b/i,
  /\bdefense\b/i,
  /\bcatalog\b/i,
  /\btraveled\b/i,
  /\bjewelry\b/i,
];

interface Report {
  file: string;
  chapter: string;
  total: number;
  byDifficulty: Record<string, number>;
  letters: number[];
  errors: string[];
  warnings: string[];
}

function textsOf(file: AuthoredFile): { key: string; text: string; answerIndex?: number; difficulty: string }[] {
  const out: { key: string; text: string; answerIndex?: number; difficulty: string }[] = [];
  for (const q of file.items ?? []) out.push({ key: q.key, text: q.prompt + ' ' + q.options.join(' '), answerIndex: q.answerIndex, difficulty: q.difficulty });
  for (const s of file.sets ?? []) {
    out.push({ key: s.key, text: s.stimulus, difficulty: s.difficulty });
    for (const q of s.questions) out.push({ key: `${s.key}/${q.key}`, text: q.prompt + ' ' + q.options.join(' '), answerIndex: q.answerIndex, difficulty: q.difficulty ?? s.difficulty });
  }
  for (const p of file.paraJumbles ?? []) out.push({ key: p.key, text: p.sentences.map((x) => x.text).join(' '), difficulty: p.difficulty });
  return out;
}

function validate(path: string): Report {
  const rel = relative(process.cwd(), path);
  const report: Report = { file: rel, chapter: '?', total: 0, byDifficulty: {}, letters: [0, 0, 0, 0, 0], errors: [], warnings: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    report.errors.push(`JSON parse error: ${(e as Error).message}`);
    return report;
  }
  const parsed = authoredFileSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 40)) report.errors.push(`${issue.path.join('.')}: ${issue.message}`);
    return report;
  }
  const file = parsed.data;
  report.chapter = file.chapter;

  const keys = new Set<string>();
  const entries = textsOf(file);
  for (const e of entries) {
    if (keys.has(e.key)) report.errors.push(`duplicate key ${e.key}`);
    keys.add(e.key);
  }

  const counted = [...(file.items ?? []), ...(file.sets ?? []), ...(file.paraJumbles ?? [])];
  report.total = counted.length;
  for (const c of counted) report.byDifficulty[c.difficulty] = (report.byDifficulty[c.difficulty] ?? 0) + 1;
  for (const e of entries) if (e.answerIndex !== undefined) report.letters[e.answerIndex]++;

  // near-duplicates within the file
  const grams = entries.map((e) => ({ key: e.key, g: trigrams(normaliseText(e.text)) }));
  for (let i = 0; i < grams.length; i++) {
    for (let j = i + 1; j < grams.length; j++) {
      const sim = similarity(grams[i].g, grams[j].g);
      if (sim > 0.85) report.errors.push(`near-duplicate (${sim.toFixed(2)}): ${grams[i].key} ~ ${grams[j].key}`);
    }
  }

  // American spellings (warning only — some chapters test them deliberately)
  for (const e of entries) {
    for (const re of AMERICAN) {
      const m = e.text.match(re);
      if (m) report.warnings.push(`${e.key}: American spelling? "${m[0]}"`);
    }
  }
  return report;
}

const filter = process.argv[2];
const files = walk(ROOT).filter((f) => !filter || f.endsWith(filter));
let failed = false;
for (const f of files) {
  const r = validate(f);
  const letters = r.letters.map((n, i) => `${'ABCDE'[i]}:${n}`).join(' ');
  console.log(`\n${r.file}  [${r.chapter}]  total=${r.total}  ${JSON.stringify(r.byDifficulty)}  letters ${letters}`);
  for (const e of r.errors) console.log(`  ERROR ${e}`);
  for (const w of r.warnings.slice(0, 20)) console.log(`  warn  ${w}`);
  if (r.errors.length) failed = true;
}
if (!files.length) console.log('No authored files found.');
process.exit(failed ? 1 : 0);
