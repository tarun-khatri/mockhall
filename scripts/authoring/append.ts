/**
 * Append a batch of new authored entries to a chapter file (schema-checked, keys must be new).
 *
 *   npx tsx scripts/authoring/append.ts <chapter> <batch.json>
 *
 * <batch.json> is either an array of single items, or { "items": [...], "sets": [...], "paraJumbles": [...] }.
 * The chapter file is found under src/content/authored/{english,reasoning,quant}/<chapter>.json
 * (a quant file is created on first append). Nothing is written if any entry fails the schema.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { authoredFileSchema, authoredQuestionSchema, authoredSetSchema, paraJumbleSetSchema } from '../../src/content/schema';
import { CHAPTERS } from '../../src/content/chapters';

const [chapter, batchPath] = process.argv.slice(2);
if (!chapter || !batchPath) {
  console.error('usage: append.ts <chapter> <batch.json>');
  process.exit(2);
}
const meta = CHAPTERS.find((c) => c.id === chapter);
if (!meta) {
  console.error(`unknown chapter ${chapter}`);
  process.exit(2);
}
const root = join(import.meta.dirname, '..', '..', 'src', 'content', 'authored', meta.subject);
const path = join(root, `${chapter}.json`);
const file = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { chapter, version: 1 };
const raw = JSON.parse(readFileSync(batchPath, 'utf8'));
const batch: { items?: unknown[]; sets?: unknown[]; paraJumbles?: unknown[] } = Array.isArray(raw) ? { items: raw } : raw;

const errors: string[] = [];
const existing = new Set<string>([...(file.items ?? []), ...(file.sets ?? []), ...(file.paraJumbles ?? [])].map((e: { key: string }) => e.key));
const check = (kind: 'items' | 'sets' | 'paraJumbles', schema: { safeParse: (x: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }) => {
  for (const [i, e] of (batch[kind] ?? []).entries()) {
    const key = (e as { key?: string }).key ?? `#${i}`;
    const r = schema.safeParse(e);
    if (!r.success) for (const iss of r.error!.issues.slice(0, 5)) errors.push(`${kind}[${i}] ${key}: ${iss.path.join('.')}: ${iss.message}`);
    if (existing.has(key)) errors.push(`${kind}[${i}] ${key}: key already exists`);
    existing.add(key);
  }
};
check('items', authoredQuestionSchema);
check('sets', authoredSetSchema);
check('paraJumbles', paraJumbleSetSchema);
if (errors.length) {
  console.error(`✗ nothing written — ${errors.length} problem(s):`);
  for (const e of errors.slice(0, 60)) console.error('  ' + e);
  process.exit(1);
}
for (const kind of ['items', 'sets', 'paraJumbles'] as const) if (batch[kind]?.length) file[kind] = [...(file[kind] ?? []), ...batch[kind]!];
const whole = authoredFileSchema.safeParse(file);
if (!whole.success) {
  console.error('✗ nothing written — merged file fails the schema:', whole.error.issues.slice(0, 5));
  process.exit(1);
}
mkdirSync(root, { recursive: true });
writeFileSync(path, JSON.stringify(file, null, 2) + '\n');
const n = (batch.items?.length ?? 0) + (batch.sets?.length ?? 0) + (batch.paraJumbles?.length ?? 0);
console.log(`✓ appended ${n} to ${path} (now ${(file.items?.length ?? 0) + (file.sets?.length ?? 0) + (file.paraJumbles?.length ?? 0)} entries)`);
