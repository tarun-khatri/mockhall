/**
 * Build the pre-generated seating banks (SPEC 7.2): public/banks/seating/<subtype>.<difficulty>[.<n>].json
 *
 *   npx tsx scripts/banks/seating.ts                         # all subtypes × difficulties, 150 sets each
 *   npx tsx scripts/banks/seating.ts --count=60              # first pass
 *   npx tsx scripts/banks/seating.ts --only=square,circular-inside --diff=hard,extreme
 *
 * Existing files are kept and topped up (sets already in them are not regenerated). Every set is re-solved by
 * the independent verifier from its text alone; a set ships only if the arrangement is unique and every key
 * matches. Files are written minified after every few sets, so an interrupted run keeps its progress.
 * Each file stays ≤ 120 KB gzipped (split into .1, .2 … parts when larger).
 */
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { generator } from '../../src/content/generators/reasoning/seating';
import { verifyItem } from '../../src/content/verify/reasoning/seating';
import { bankFileSchema } from '../../src/content/schema';
import { subtypeSupports } from '../../src/content/generators/types';
import type { Difficulty, Item } from '../../src/content/types';

const OUT = join(import.meta.dirname, '..', '..', 'public', 'banks', 'seating');
const MAX_GZ = 120 * 1024;
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard', 'extreme'];

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const target = Number(arg('count') ?? 150);
const only = arg('only')?.split(',');
const diffs = (arg('diff')?.split(',') as Difficulty[] | undefined) ?? DIFFS;
const maxSeeds = Number(arg('max-seeds') ?? target * 4);

mkdirSync(OUT, { recursive: true });

function filesFor(subtype: string, d: Difficulty): string[] {
  const re = new RegExp(`^${subtype}\\.${d}(\\.\\d+)?\\.json$`);
  return readdirSync(OUT).filter((f) => re.test(f));
}

function loadExisting(subtype: string, d: Difficulty): Item[] {
  const items: Item[] = [];
  for (const f of filesFor(subtype, d).sort()) {
    const parsed = bankFileSchema.parse(JSON.parse(readFileSync(join(OUT, f), 'utf8')));
    items.push(...(parsed.items as Item[]));
  }
  return items;
}

function fileBody(subtype: string, d: Difficulty, items: Item[]): string {
  const body = {
    chapter: 'seating',
    subtype,
    difficulty: d,
    generator: { name: generator.name, version: generator.version },
    generatedAt: new Date().toISOString().slice(0, 10),
    items,
  };
  bankFileSchema.parse(body);
  return JSON.stringify(body);
}

/** Write items, split into parts so each stays under the gzip budget. Returns [file, raw, gz, count][]. */
function writeAll(subtype: string, d: Difficulty, items: Item[]): [string, number, number, number][] {
  for (const f of filesFor(subtype, d)) unlinkSync(join(OUT, f));
  const whole = fileBody(subtype, d, items);
  const gz = gzipSync(whole).length;
  const parts = Math.max(1, Math.ceil(gz / (MAX_GZ * 0.92)));
  const out: [string, number, number, number][] = [];
  const per = Math.ceil(items.length / parts);
  for (let p = 0; p < parts; p++) {
    const slice = items.slice(p * per, (p + 1) * per);
    if (!slice.length) continue;
    const name = parts === 1 ? `${subtype}.${d}.json` : `${subtype}.${d}.${p + 1}.json`;
    const body = fileBody(subtype, d, slice);
    const size = gzipSync(body).length;
    if (size > MAX_GZ) throw new Error(`${name} is ${size} bytes gzipped`);
    writeFileSync(join(OUT, name), body);
    out.push([name, body.length, size, slice.length]);
  }
  return out;
}

const summary: string[] = [];
for (const st of generator.subtypes) {
  if (only && !only.includes(st.id)) continue;
  for (const d of diffs) {
    if (!subtypeSupports(st, d)) continue;
    const t0 = Date.now();
    const items = loadExisting(st.id, d);
    const seenSets = new Set(items.map((it) => it.set!.id));
    const seenStimulus = new Set(items.map((it) => it.set!.stimulus));
    const usedSeeds = new Set(items.map((it) => it.questions[0].generator!.seed));
    let rejected = 0;
    let lastWrite = items.length;
    for (let i = 0; items.length < target && i < maxSeeds; i++) {
      const seed = `bank-${st.id}-${d}-${i}`;
      if (usedSeeds.has(seed)) continue;
      let item: Item;
      try {
        item = generator.build(seed, d, st.id).item;
      } catch (e) {
        rejected++;
        console.warn(`  ! ${seed}: generator failed — ${(e as Error).message}`);
        continue;
      }
      if (seenSets.has(item.set!.id) || seenStimulus.has(item.set!.stimulus)) continue;
      try {
        const expected = verifyItem(item);
        const keys = item.questions.map((q) => q.answerIndex);
        if (expected.length !== keys.length || expected.some((x, j) => x !== keys[j])) throw new Error(`key ${keys} vs verifier ${expected}`);
      } catch (e) {
        rejected++;
        console.warn(`  ! ${seed}: not shipped — ${(e as Error).message}`);
        continue;
      }
      items.push(item);
      seenSets.add(item.set!.id);
      seenStimulus.add(item.set!.stimulus);
      if (items.length - lastWrite >= 10) {
        writeAll(st.id, d, items);
        lastWrite = items.length;
        process.stdout.write(`  ${st.id}/${d}: ${items.length}/${target}\r`);
      }
    }
    const files = writeAll(st.id, d, items);
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    const line = `${st.id}/${d}: ${items.length} sets (${rejected} rejected) in ${secs}s — ${files.map(([f, raw, gz, n]) => `${f} ${n} sets ${(raw / 1024).toFixed(0)} KB raw / ${(gz / 1024).toFixed(1)} KB gz`).join('; ')}`;
    console.log(line);
    summary.push(line);
  }
}
console.log('\n' + summary.join('\n'));
