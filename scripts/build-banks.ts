/**
 * Pre-build content gate + bank index.
 *  1. Every authored English file must pass the zod schema, and (unless --allow-unverified) every item must have a
 *     blind-solve QA record whose content hash matches — otherwise the build FAILS (SPEC 14.4).
 *  2. Pre-generated puzzle/seating banks under public/banks/<chapter>/ are schema-checked (light) and listed in
 *     public/banks/index.json with a content-hash query string, so the service worker's CacheFirst never serves
 *     stale files after a deploy.
 *
 *   npx tsx scripts/build-banks.ts [--allow-unverified]
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { authoredFileSchema, bankFileSchema } from '../src/content/schema';
import { authoredHash, type QaFile } from '../src/content/authored';

const ROOT = join(import.meta.dirname, '..');
const allowUnverified = process.argv.includes('--allow-unverified') || process.env.ALLOW_UNVERIFIED === '1';
let failed = false;

// 1. Authored content
const authoredDir = join(ROOT, 'src', 'content', 'authored', 'english');
if (existsSync(authoredDir)) {
  for (const name of readdirSync(authoredDir).filter((n) => n.endsWith('.json'))) {
    const chapter = name.replace(/\.json$/, '');
    const parsed = authoredFileSchema.safeParse(JSON.parse(readFileSync(join(authoredDir, name), 'utf8')));
    if (!parsed.success) {
      console.error(`✗ ${name}: schema errors`);
      for (const i of parsed.error.issues.slice(0, 10)) console.error(`   ${i.path.join('.')}: ${i.message}`);
      failed = true;
      continue;
    }
    const qaPath = join(authoredDir, '_qa', `${chapter}.json`);
    const qa: QaFile = existsSync(qaPath) ? JSON.parse(readFileSync(qaPath, 'utf8')) : { chapter, records: {} };
    const entries = [...(parsed.data.items ?? []), ...(parsed.data.sets ?? []), ...(parsed.data.paraJumbles ?? [])];
    const unverified = entries.filter((e) => qa.records[e.key]?.hash !== authoredHash(e)).map((e) => e.key);
    const msg = `${name}: ${entries.length - unverified.length}/${entries.length} verified`;
    if (unverified.length) {
      const list = unverified.slice(0, 12).join(', ') + (unverified.length > 12 ? '…' : '');
      if (allowUnverified) console.warn(`! ${msg} (unverified: ${list})`);
      else {
        console.error(`✗ ${msg} — unverified items: ${list}`);
        failed = true;
      }
    } else console.log(`✓ ${msg}`);
  }
}

// 2. Bank index
const banksDir = join(ROOT, 'public', 'banks');
mkdirSync(banksDir, { recursive: true });
const files: { chapter: string; subtype: string; label: string; difficulty: string; file: string; count: number; bytes: number }[] = [];

async function labelsFor(chapter: string): Promise<Record<string, string>> {
  try {
    const mod = await import(`../src/content/generators/reasoning/${chapter}.ts`);
    return Object.fromEntries((mod.generator?.subtypes ?? []).map((s: { id: string; label: string }) => [s.id, s.label]));
  } catch {
    return {};
  }
}

for (const chapter of ['seating', 'puzzles']) {
  const dir = join(banksDir, chapter);
  if (!existsSync(dir)) continue;
  const labels = await labelsFor(chapter);
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const path = join(dir, name);
    const raw = readFileSync(path);
    const json = JSON.parse(raw.toString('utf8'));
    const light = bankFileSchema.pick({ chapter: true, subtype: true, difficulty: true }).safeParse(json);
    if (!light.success || !Array.isArray(json.items) || !json.items.length) {
      console.error(`✗ banks/${chapter}/${name}: not a valid bank file`);
      failed = true;
      continue;
    }
    const hash = createHash('sha1').update(raw).digest('hex').slice(0, 10);
    files.push({
      chapter,
      subtype: json.subtype,
      label: labels[json.subtype] ?? json.subtype.replace(/-/g, ' ').replace(/^./, (c: string) => c.toUpperCase()),
      difficulty: json.difficulty,
      file: `${chapter}/${name}?v=${hash}`,
      count: json.items.length,
      bytes: statSync(path).size,
    });
  }
}
writeFileSync(join(banksDir, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), files }));
console.log(`✓ banks/index.json: ${files.length} files, ${files.reduce((s, f) => s + f.count, 0)} sets`);

if (failed) {
  console.error('\nContent gate failed. Fix the items above (or run with --allow-unverified for local development only).');
  process.exit(1);
}
