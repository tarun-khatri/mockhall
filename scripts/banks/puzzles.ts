/**
 * Pre-generate verified puzzle banks (SPEC 7.2): public/banks/puzzles/<subtype>.<difficulty>[.<n>].json
 *
 *   npx tsx scripts/banks/puzzles.ts                      # every subtype × difficulty, 150 sets each
 *   npx tsx scripts/banks/puzzles.ts --target 60          # quicker first pass
 *   npx tsx scripts/banks/puzzles.ts --subs floor,box --diffs easy,medium
 *
 * A set is kept only if: the independent verifier (src/content/verify/reasoning/puzzles.ts) re-parses every clue,
 * finds exactly one arrangement and agrees with every answer key; the item passes the zod item schema; options are
 * distinct; and the human-model difficulty re-measured from the clues equals the file's difficulty. Seeds are
 * deterministic ("bank:<subtype>:<difficulty>:<i>"), so re-running reproduces the same files and a higher target
 * only appends. Files stay ≤ 120 KB gzipped (split into .1/.2/… parts when larger). Also writes
 * public/banks/puzzles/index.json (entries in the shape of BankIndexEntry in src/content/providers.ts).
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { generator, SUBTYPES, type PuzzlesFacts } from '../../src/content/generators/reasoning/puzzles';
import { verify } from '../../src/content/verify/reasoning/puzzles';
import { measure } from '../../src/content/generators/solver/puzzles/csp';
import { solverInput } from '../../src/content/generators/reasoning/puzzles/clues';
import { levelOf } from '../../src/content/generators/reasoning/puzzles/difficulty';
import type { Setup } from '../../src/content/generators/reasoning/puzzles/setup';
import { bankFileSchema, itemSchema } from '../../src/content/schema';
import { normaliseOption } from '../../src/content/rich';
import { DIFFICULTIES, type Difficulty, type Item } from '../../src/content/types';
import type { GenResult } from '../../src/content/generators/types';

const OUT = join(import.meta.dirname, '..', '..', 'public', 'banks', 'puzzles');
const MAX_GZ = 120 * 1024;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const target = Number(arg('target') ?? 150);
const onlySubs = arg('subs')?.split(',');
const onlyDiffs = arg('diffs')?.split(',') as Difficulty[] | undefined;
const maxSeeds = Number(arg('max-seeds') ?? target * 4);

export type BankItem = Item & { facts: PuzzlesFacts };

function problems(res: GenResult<PuzzlesFacts>, sub: string, d: Difficulty): string[] {
  const out: string[] = [];
  const parsed = itemSchema.safeParse(res.item);
  if (!parsed.success) out.push(`schema: ${parsed.error.issues[0]?.message}`);
  if (res.item.set?.subtype !== sub || res.item.set?.difficulty !== d) out.push('set subtype/difficulty');
  let expected: (number | string)[] = [];
  try {
    expected = verify(res);
  } catch (e) {
    out.push(`verifier: ${(e as Error).message}`);
    return out;
  }
  res.item.questions.forEach((q, i) => {
    if (new Set(q.options.map(normaliseOption)).size !== 5) out.push(`Q${i + 1} options not distinct`);
    const x = expected[i];
    const idx = typeof x === 'number' ? x : q.options.findIndex((o) => normaliseOption(o) === normaliseOption(x));
    if (idx !== q.answerIndex) out.push(`Q${i + 1} key ${q.answerIndex} ≠ verifier ${JSON.stringify(x)}`);
  });
  const f = res.facts;
  const setup = { sub: f.sub, difficulty: d, layout: f.layout, names: f.names, cats: f.cats, labels: f.labels } as Setup;
  const m = measure(solverInput(setup, f.clues));
  if (m.count !== 1) out.push('solver: not unique');
  const lvl = levelOf(f.sub, m.stats);
  if (lvl !== d) out.push(`measured level ${lvl}`);
  return out;
}

function writeBank(sub: string, d: Difficulty, items: BankItem[], generatedAt: string): { file: string; count: number; bytes: number }[] {
  // choose the number of parts so each stays under the gzip budget
  const whole = JSON.stringify(items);
  const gz = gzipSync(whole).length;
  const parts = Math.max(1, Math.ceil(gz / (MAX_GZ * 0.92)));
  const per = Math.ceil(items.length / parts);
  const out: { file: string; count: number; bytes: number }[] = [];
  for (let p = 0; p < parts; p++) {
    const chunk = items.slice(p * per, (p + 1) * per);
    if (!chunk.length) continue;
    const name = parts === 1 ? `${sub}.${d}.json` : `${sub}.${d}.${p + 1}.json`;
    const file = { chapter: 'puzzles', subtype: sub, difficulty: d, generator: { name: generator.name, version: generator.version }, generatedAt, items: chunk };
    const check = bankFileSchema.safeParse(file);
    if (!check.success) throw new Error(`${name}: bank schema ${check.error.issues[0]?.message}`);
    const json = JSON.stringify(file);
    const z = gzipSync(json).length;
    if (z > MAX_GZ) throw new Error(`${name}: ${z} bytes gzipped > ${MAX_GZ}`);
    writeFileSync(join(OUT, name), json);
    out.push({ file: `puzzles/${name}`, count: chunk.length, bytes: Buffer.byteLength(json) });
  }
  return out;
}

/** Rebuild index.json from the bank files on disk (after an interrupted run). */
function rebuildIndex(): void {
  const files: { chapter: string; subtype: string; label: string; difficulty: Difficulty; file: string; count: number; bytes: number }[] = [];
  let generatedAt = '';
  for (const name of readdirSync(OUT).sort()) {
    if (name === 'index.json' || !name.endsWith('.json')) continue;
    const raw = readFileSync(join(OUT, name), 'utf8');
    const j = JSON.parse(raw);
    generatedAt = generatedAt > j.generatedAt ? generatedAt : j.generatedAt;
    const label = SUBTYPES.find((s) => s.id === j.subtype)?.label ?? j.subtype;
    files.push({ chapter: 'puzzles', subtype: j.subtype, label, difficulty: j.difficulty, file: `puzzles/${name}`, count: j.items.length, bytes: Buffer.byteLength(raw) });
  }
  writeFileSync(join(OUT, 'index.json'), JSON.stringify({ generatedAt, files }, null, 1));
  console.log(`index.json: ${files.length} files, ${files.reduce((s, f) => s + f.count, 0)} sets`);
}

function main() {
  mkdirSync(OUT, { recursive: true });
  if (process.argv.includes('--index-only')) {
    rebuildIndex();
    return;
  }
  const generatedAt = new Date().toISOString().slice(0, 10);
  const index: { chapter: string; subtype: string; label: string; difficulty: Difficulty; file: string; count: number; bytes: number }[] = [];
  const t0 = Date.now();
  for (const st of SUBTYPES) {
    for (const d of DIFFICULTIES) {
      if (!(st.difficulties ?? DIFFICULTIES).includes(d)) continue;
      const selected = (!onlySubs || onlySubs.includes(st.id)) && (!onlyDiffs || onlyDiffs.includes(d));
      if (!selected) continue;
      const t1 = Date.now();
      const items: BankItem[] = [];
      const seenStimulus = new Set<string>();
      let rejected = 0;
      for (let i = 0; i < maxSeeds && items.length < target; i++) {
        let res: GenResult<PuzzlesFacts>;
        try {
          res = generator.build(`bank:${st.id}:${d}:${i}`, d, st.id);
        } catch (e) {
          rejected++;
          console.warn(`  build failed ${st.id}/${d}/${i}: ${(e as Error).message}`);
          continue;
        }
        const stim = res.item.set!.stimulus;
        if (seenStimulus.has(stim)) continue;
        const pr = problems(res, st.id, d);
        if (pr.length) {
          rejected++;
          console.warn(`  rejected ${st.id}/${d}/${i}: ${pr.join('; ')}`);
          continue;
        }
        seenStimulus.add(stim);
        items.push({ ...res.item, facts: res.facts });
      }
      // replace this subtype × difficulty's old files
      for (const f of readdirSync(OUT)) if (f.startsWith(`${st.id}.${d}.`) && f.endsWith('.json')) rmSync(join(OUT, f));
      const files = writeBank(st.id, d, items, generatedAt);
      for (const f of files) index.push({ chapter: 'puzzles', subtype: st.id, label: st.label, difficulty: d, ...f });
      const bytes = files.reduce((s, f) => s + f.bytes, 0);
      console.log(`${st.id}/${d}: ${items.length} sets (${rejected} rejected) in ${((Date.now() - t1) / 1000).toFixed(1)} s → ${files.length} file(s), ${(bytes / 1024).toFixed(0)} KB raw`);
    }
  }
  // the index always mirrors what is on disk (covers subtypes not rebuilt in this run)
  rebuildIndex();
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

main();
