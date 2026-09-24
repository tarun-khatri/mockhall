/**
 * Chapter providers: one uniform, lazily loaded way to draw Items for any chapter.
 *  - Generator chapters: modules discovered at build time under generators/<subject>/<chapter>.ts.
 *  - Bank chapters (seating, puzzles): pre-generated, solver-verified JSON fetched from /banks and cached by the SW.
 *  - Authored chapters (English): JSON under authored/english, filtered by blind-solve QA records.
 * Everything is deterministic in the seed, so fixed mocks and shared links reproduce the same paper.
 */
import type { ChapterId, Difficulty, Item } from './types';
import { DIFFICULTIES } from './types';
import type { ChapterGenerator, SubtypeDef } from './generators/types';
import { subtypeSupports } from './generators/types';
import { CHAPTERS, chapterMeta } from './chapters';
import type { AuthoredFile } from './schema';
import { authoredItems, type QaFile } from './authored';
import { makeRng } from '../lib/rng';
import verifiedGenerators from './verified-generators.json';

export interface ChapterProvider {
  chapter: ChapterId;
  subtypes: readonly SubtypeDef[];
  /** Difficulties that have content. */
  difficulties: Difficulty[];
  item(seed: string, difficulty: Difficulty, subtype?: string): Promise<Item>;
}

/* ------------------------------------------------------------------ */
/* Discovery                                                           */
/* ------------------------------------------------------------------ */

type GenModule = { generator?: ChapterGenerator };
const generatorModules = import.meta.glob<GenModule>(['./generators/quant/*.ts', './generators/reasoning/*.ts', './generators/english/*.ts']);
const authoredModules = import.meta.glob<AuthoredFile>('./authored/*/*.json', { import: 'default' });
const qaModules = import.meta.glob<QaFile>(['./authored/*/_qa/*.json', '!./authored/*/_qa/*.log.json'], { import: 'default' });

const baseName = (path: string) => path.split('/').pop()!.replace(/\.(ts|json)$/, '');
const KNOWN = new Set<string>(CHAPTERS.map((c) => c.id));

/** Chapters served from pre-generated banks even though a runtime generator exists (solver too slow on phones). */
const BANK_CHAPTERS = new Set<ChapterId>(['seating', 'puzzles']);

/** Generators whose independent verifier + property suite exist (written by scripts/build-banks.ts). */
const VERIFIED = new Set<string>(verifiedGenerators as string[]);

const genPaths = new Map<ChapterId, string>();
for (const path of Object.keys(generatorModules)) {
  const id = baseName(path);
  if (KNOWN.has(id) && (VERIFIED.has(id) || import.meta.env.DEV)) genPaths.set(id as ChapterId, path);
}
const authoredPaths = new Map<ChapterId, string>();
for (const path of Object.keys(authoredModules)) {
  const id = baseName(path);
  if (KNOWN.has(id)) authoredPaths.set(id as ChapterId, path);
}
const qaPaths = new Map<string, string>();
for (const path of Object.keys(qaModules)) qaPaths.set(baseName(path), path);

/** Bank chapters are listed as available; the bank index decides at load time ("coming soon" if empty). */
export function isAvailable(chapter: ChapterId): boolean {
  if (BANK_CHAPTERS.has(chapter)) return true;
  return genPaths.has(chapter) || authoredPaths.has(chapter);
}

export function availableChapters(): ChapterId[] {
  return CHAPTERS.filter((c) => isAvailable(c.id)).map((c) => c.id);
}

/* ------------------------------------------------------------------ */
/* Providers                                                           */
/* ------------------------------------------------------------------ */

const cache = new Map<ChapterId, Promise<ChapterProvider>>();

export function getProvider(chapter: ChapterId): Promise<ChapterProvider> {
  let p = cache.get(chapter);
  if (!p) {
    p = load(chapter);
    cache.set(chapter, p);
    p.catch(() => cache.delete(chapter));
  }
  return p;
}

async function load(chapter: ChapterId): Promise<ChapterProvider> {
  if (BANK_CHAPTERS.has(chapter)) return bankProvider(chapter);
  const gen = genPaths.get(chapter);
  if (gen) {
    const mod = await generatorModules[gen]();
    if (!mod.generator) throw new Error(`No generator exported for ${chapter}`);
    return generatorProvider(mod.generator);
  }
  const authored = authoredPaths.get(chapter);
  if (authored) return authoredProvider(chapter, authored);
  throw new Error(`${chapterMeta(chapter).title} is coming soon.`);
}

function generatorProvider(gen: ChapterGenerator): ChapterProvider {
  const difficulties = DIFFICULTIES.filter((d) => gen.subtypes.some((s) => subtypeSupports(s, d)));
  return {
    chapter: gen.chapter,
    subtypes: gen.subtypes,
    difficulties,
    async item(seed, difficulty, subtype) {
      const d = difficulties.includes(difficulty) ? difficulty : nearest(difficulty, difficulties);
      const st = subtype && gen.subtypes.find((s) => s.id === subtype && subtypeSupports(s, d)) ? subtype : undefined;
      return gen.build(seed, d, st).item;
    },
  };
}

const ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'extreme'];
function nearest(d: Difficulty, have: Difficulty[]): Difficulty {
  if (!have.length) throw new Error('No content available');
  const i = ORDER.indexOf(d);
  return have.slice().sort((a, b) => Math.abs(ORDER.indexOf(a) - i) - Math.abs(ORDER.indexOf(b) - i))[0];
}

/** Pick deterministically from a pool, by subtype when asked. */
function pickFrom(pool: { item: Item; subtype: string; difficulty: Difficulty }[], seed: string, difficulty: Difficulty, subtype?: string): Item {
  const rng = makeRng(`pick:${seed}`);
  const byDiff = (d: Difficulty) => pool.filter((p) => p.difficulty === d && (!subtype || p.subtype === subtype));
  let candidates = byDiff(difficulty);
  if (!candidates.length) {
    const have = ORDER.filter((d) => byDiff(d).length);
    if (!have.length) throw new Error('No questions available for this selection yet.');
    candidates = byDiff(nearest(difficulty, have));
  }
  // choose a subtype first (uniform over available subtypes), then an item — keeps rare subtypes visible
  const subtypes = [...new Set(candidates.map((c) => c.subtype))];
  const st = rng.pick(subtypes);
  return rng.pick(candidates.filter((c) => c.subtype === st)).item;
}

async function authoredProvider(chapter: ChapterId, path: string): Promise<ChapterProvider> {
  const file = await authoredModules[path]();
  const qaPath = qaPaths.get(chapter);
  const qa = qaPath ? await qaModules[qaPath]() : null;
  // Production builds refuse unverified content (scripts/build-banks.ts fails first); dev shows drafts.
  const items = authoredItems(chapter, file, qa ?? (import.meta.env.DEV ? null : { chapter, records: {} }));
  const pool = items.map((item) => ({ item, subtype: item.set?.subtype ?? item.questions[0].subtype, difficulty: item.set?.difficulty ?? item.questions[0].difficulty }));
  const subtypeIds = [...new Set(pool.map((p) => p.subtype))];
  return {
    chapter,
    subtypes: subtypeIds.map((id) => ({ id, label: labelFor(id) })),
    difficulties: ORDER.filter((d) => pool.some((p) => p.difficulty === d)),
    async item(seed, difficulty, subtype) {
      return pickFrom(pool, seed, difficulty, subtype);
    },
  };
}

function labelFor(id: string): string {
  const s = id.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ------------------------------------------------------------------ */
/* Pre-generated banks                                                 */
/* ------------------------------------------------------------------ */

export interface BankIndexEntry {
  chapter: ChapterId;
  subtype: string;
  label: string;
  difficulty: Difficulty;
  file: string;
  count: number;
  bytes: number;
}

export interface BankIndex {
  generatedAt: string;
  files: BankIndexEntry[];
}

let bankIndex: Promise<BankIndex> | null = null;
export function loadBankIndex(): Promise<BankIndex> {
  if (!bankIndex) {
    bankIndex = fetch(`${import.meta.env.BASE_URL}banks/index.json`).then((r) => {
      if (!r.ok) throw new Error('Could not load question banks. Check your connection and try again.');
      return r.json() as Promise<BankIndex>;
    });
    bankIndex.catch(() => (bankIndex = null));
  }
  return bankIndex;
}

const bankFiles = new Map<string, Promise<Item[]>>();
export function loadBankFile(file: string): Promise<Item[]> {
  let p = bankFiles.get(file);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}banks/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error('Could not load this puzzle bank. Check your connection and try again.');
        return r.json();
      })
      .then((j: { items: Item[] }) => j.items);
    bankFiles.set(file, p);
    p.catch(() => bankFiles.delete(file));
  }
  return p;
}

async function bankProvider(chapter: ChapterId): Promise<ChapterProvider> {
  const index = await loadBankIndex();
  const entries = index.files.filter((f) => f.chapter === chapter);
  if (!entries.length) throw new Error(`${chapterMeta(chapter).title} is coming soon.`);
  const subtypes: SubtypeDef[] = [];
  for (const e of entries) {
    const existing = subtypes.find((s) => s.id === e.subtype);
    if (existing) (existing.difficulties as Difficulty[]).push(e.difficulty);
    else subtypes.push({ id: e.subtype, label: e.label, difficulties: [e.difficulty] });
  }
  const difficulties = ORDER.filter((d) => entries.some((e) => e.difficulty === d));
  return {
    chapter,
    subtypes,
    difficulties,
    async item(seed, difficulty, subtype) {
      const rng = makeRng(`bank:${seed}`);
      const d = difficulties.includes(difficulty) ? difficulty : nearest(difficulty, difficulties);
      let pool = entries.filter((e) => e.difficulty === d && (!subtype || e.subtype === subtype));
      if (!pool.length) pool = entries.filter((e) => e.difficulty === d);
      const st = rng.pick([...new Set(pool.map((e) => e.subtype))]);
      const files = pool.filter((e) => e.subtype === st);
      const total = files.reduce((s, f) => s + f.count, 0);
      let k = rng.int(0, total - 1);
      for (const f of files) {
        if (k < f.count) return (await loadBankFile(f.file))[k];
        k -= f.count;
      }
      return (await loadBankFile(files[0].file))[0];
    },
  };
}
