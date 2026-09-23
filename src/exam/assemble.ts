/**
 * Test assembly: blueprint- or chapter-driven, deterministic in the config seed, never repeating a question.
 */
import type { ChapterId, Difficulty, Item, Question, QuestionSet, Subject, TestConfig } from '../content/types';
import { blueprint, type BlueprintSlot, type SectionBlueprint, type SlotSource, MIXED_SHARES } from '../content/blueprints';
import { getProvider, isAvailable, type ChapterProvider } from '../content/providers';
import { makeRng, type Rng } from '../lib/rng';
import type { SectionInput } from './engine';

const MAX_TRIES = 10;

function weightedDifficulty(rng: Rng, mix: Record<Difficulty, number>): Difficulty {
  const entries = (Object.entries(mix) as [Difficulty, number][]).filter(([, w]) => w > 0);
  return entries.length ? rng.weighted(entries) : 'medium';
}

/** Take the first n questions of a set item (set copied with trimmed ids). */
export function takeFromItem(item: Item, n: number): Item {
  if (item.questions.length <= n) return item;
  const questions = item.questions.slice(0, n);
  return { set: item.set ? { ...item.set, questionIds: questions.map((q) => q.id) } : undefined, questions };
}

class Collector {
  questions: Question[] = [];
  sets: QuestionSet[] = [];
  ids = new Set<string>();
  groupUsed = new Map<string, Set<string>>();

  has(item: Item): boolean {
    if (item.set && this.ids.has(item.set.id)) return true;
    return item.questions.some((q) => this.ids.has(q.id));
  }

  add(item: Item): void {
    if (item.set) {
      this.sets.push(item.set);
      this.ids.add(item.set.id);
    }
    for (const q of item.questions) {
      this.questions.push(q);
      this.ids.add(q.id);
    }
  }
}

async function providerFor(chapter: ChapterId): Promise<ChapterProvider | null> {
  if (!isAvailable(chapter)) return null;
  try {
    return await getProvider(chapter);
  } catch {
    return null;
  }
}

function subtypeChoices(provider: ChapterProvider, source: SlotSource, difficulty: Difficulty, exclude: Set<string>): string[] {
  const supported = provider.subtypes.filter((s) => !s.difficulties || s.difficulties.includes(difficulty)).map((s) => s.id);
  const wanted = source.subtypes ? supported.filter((s) => source.subtypes!.includes(s)) : supported;
  const fresh = wanted.filter((s) => !exclude.has(`${source.chapter}:${s}`));
  return fresh.length ? fresh : wanted;
}

async function drawSetSlot(
  slot: BlueprintSlot,
  seed: string,
  mix: Record<Difficulty, number>,
  out: Collector,
): Promise<void> {
  const used = slot.group ? (out.groupUsed.get(slot.group) ?? new Set<string>()) : new Set<string>();
  for (let t = 0; t < MAX_TRIES; t++) {
    const rng = makeRng(`${seed}:t${t}`);
    const sources = rng.shuffle(slot.sources);
    for (const source of sources) {
      const provider = await providerFor(source.chapter);
      if (!provider) continue;
      const difficulty = weightedDifficulty(rng, mix);
      const choices = subtypeChoices(provider, source, difficulty, used);
      if (source.subtypes && !choices.length) continue;
      const subtype = choices.length ? rng.pick(choices) : undefined;
      let item: Item;
      try {
        item = await provider.item(`${seed}:${t}`, difficulty, subtype);
      } catch {
        continue;
      }
      if (!item.set || out.has(item)) continue;
      out.add(takeFromItem(item, slot.count));
      used.add(`${source.chapter}:${item.set.subtype}`);
      if (slot.group) out.groupUsed.set(slot.group, used);
      return;
    }
  }
}

async function drawSingles(
  slot: BlueprintSlot,
  seed: string,
  mix: Record<Difficulty, number>,
  out: Collector,
  count = slot.count,
): Promise<number> {
  let added = 0;
  const rotation: SlotSource[] = [];
  const rngRot = makeRng(`${seed}:rotation`);
  for (let k = 0; k < count; k++) {
    let done = false;
    for (let t = 0; t < MAX_TRIES && !done; t++) {
      const rng = makeRng(`${seed}:${k}:t${t}`);
      let source: SlotSource;
      if (slot.rotate) {
        if (!rotation.length) rotation.push(...rngRot.shuffle(slot.sources));
        source = rotation.shift()!;
      } else source = rng.pick(slot.sources);
      const provider = await providerFor(source.chapter);
      if (!provider) continue;
      const difficulty = weightedDifficulty(rng, mix);
      const choices = subtypeChoices(provider, source, difficulty, new Set());
      if (source.subtypes && !choices.length) continue;
      const subtype = source.subtypes ? rng.pick(choices) : undefined;
      let item: Item;
      try {
        item = await provider.item(`${seed}:${k}:${t}`, difficulty, subtype);
      } catch {
        continue;
      }
      if (item.set || item.questions.length !== 1 || out.has(item)) continue;
      out.add(item);
      added++;
      done = true;
    }
  }
  return added;
}

export async function assembleBlueprint(bp: SectionBlueprint, seed: string, mix: Record<Difficulty, number>): Promise<SectionInput> {
  const out = new Collector();
  for (let i = 0; i < bp.slots.length; i++) {
    const slot = bp.slots[i];
    const slotSeed = `${seed}:${bp.id}:${i}`;
    if (slot.set) await drawSetSlot(slot, slotSeed, mix, out);
    else await drawSingles(slot, slotSeed, mix, out);
  }
  // Top up if a set came back short or a chapter was unavailable; trim if over.
  let deficit = bp.total - out.questions.length;
  let round = 0;
  while (deficit > 0 && round < 3) {
    const added = await drawSingles({ label: 'Top-up', count: deficit, sources: bp.fallback }, `${seed}:${bp.id}:topup:${round++}`, mix, out, deficit);
    deficit -= added;
  }
  if (out.questions.length > bp.total) {
    const keep = new Set(out.questions.slice(0, bp.total).map((q) => q.id));
    out.questions = out.questions.filter((q) => keep.has(q.id));
    out.sets = out.sets
      .map((s) => ({ ...s, questionIds: s.questionIds.filter((id) => keep.has(id)) }))
      .filter((s) => s.questionIds.length > 0);
  }
  return { questions: out.questions, sets: out.sets };
}

export async function assembleChapter(
  chapter: ChapterId,
  count: number,
  difficulty: Difficulty | 'mixed',
  subtypes: string[] | undefined,
  seed: string,
): Promise<SectionInput> {
  const provider = await getProvider(chapter);
  const out = new Collector();
  let tries = 0;
  let k = 0;
  while (out.questions.length < count && tries < count * 6 + 20) {
    tries++;
    const itemSeed = `${seed}:${chapter}:${k++}`;
    const rng = makeRng(itemSeed);
    const d = difficulty === 'mixed' ? weightedDifficulty(rng, MIXED_SHARES) : difficulty;
    const supported = provider.subtypes.filter((s) => (!subtypes?.length || subtypes.includes(s.id)) && (!s.difficulties || s.difficulties.includes(d)));
    const subtype = subtypes?.length ? (supported.length ? rng.pick(supported).id : undefined) : undefined;
    let item: Item;
    try {
      item = await provider.item(itemSeed, d, subtype);
    } catch (e) {
      if (tries > 3 && !out.questions.length) throw e;
      continue;
    }
    if (out.has(item)) continue;
    out.add(takeFromItem(item, count - out.questions.length));
  }
  if (!out.questions.length) throw new Error('No questions available for this selection yet.');
  return { questions: out.questions, sets: out.sets };
}

/** Assemble every section of a config. */
export async function assemble(config: TestConfig): Promise<SectionInput[]> {
  const sections: SectionInput[] = [];
  for (let i = 0; i < config.sections.length; i++) {
    const sec = config.sections[i];
    if (config.kind === 'full-mock' || config.kind === 'sectional') {
      const bp = blueprint(sec.subject, config.variants?.[sec.subject] ?? 'A');
      sections.push(await assembleBlueprint(bp, `${config.seed}:${sec.subject}`, config.difficultyMix));
    } else {
      if (!config.chapter) throw new Error('Chapter test without a chapter');
      sections.push(await assembleChapter(config.chapter, sec.count, config.difficulty ?? 'mixed', config.subtypes, config.seed));
    }
  }
  return sections;
}

/** Sum of question targets, used for timed chapter tests. */
export function targetTotalSeconds(section: SectionInput): number {
  return section.questions.reduce((s, q) => s + q.targetSeconds, 0);
}

export function subjectOf(chapter: ChapterId, chapters: { id: ChapterId; subject: Subject }[]): Subject {
  return chapters.find((c) => c.id === chapter)?.subject ?? 'quant';
}
