import type { ChapterId, Difficulty, Item, Subject } from '../types';
import { DIFFICULTIES } from '../types';
import { makeRng, type Rng } from '../../lib/rng';

/**
 * Generator contract. One module per chapter at src/content/generators/<subject>/<chapter>.ts exporting
 * `export const generator: ChapterGenerator<Facts>`.
 *
 * - `build` must be PURE: the same (seed, difficulty, subtype) always returns a deep-equal result.
 *   Use makeRng(`${name}:${version}:${subtype}:${difficulty}:${seed}`) (see seededRng below). Never Math.random.
 * - `facts` = the ground-truth INPUTS (JSON-serialisable) an independent verifier needs to recompute every
 *   answer (e.g. principal, rate, years, which quantity is asked). Never put the computed answer in facts.
 * - Build backward: choose clean answers first, then construct the question.
 */

export interface GenMeta {
  /** `${subject}.${chapter}` */
  name: string;
  version: number;
  subject: Subject;
  chapter: ChapterId;
}

export interface SubtypeDef {
  /** kebab-case, unique within the chapter */
  id: string;
  /** Short label for the subtype chips in the UI (sentence case). */
  label: string;
  /** Difficulties this subtype supports (default: all four). */
  difficulties?: readonly Difficulty[];
  /** Relative frequency when no subtype is requested (default 1). Mirror real-paper frequency. */
  weight?: number;
}

export interface GenResult<F = unknown> {
  item: Item;
  facts: F;
}

export interface ChapterGenerator<F = unknown> extends GenMeta {
  subtypes: readonly SubtypeDef[];
  build(seed: string, difficulty: Difficulty, subtype?: string): GenResult<F>;
}

export function subtypeSupports(def: SubtypeDef, difficulty: Difficulty): boolean {
  return (def.difficulties ?? DIFFICULTIES).includes(difficulty);
}

/**
 * Resolve the subtype to build: validates an explicit one, otherwise picks by weight among the
 * subtypes that support the difficulty.
 */
export function resolveSubtype(
  meta: GenMeta,
  subtypes: readonly SubtypeDef[],
  rng: Rng,
  difficulty: Difficulty,
  subtype?: string,
): SubtypeDef {
  if (subtype) {
    const def = subtypes.find((s) => s.id === subtype);
    if (!def) throw new Error(`${meta.name}: unknown subtype "${subtype}"`);
    if (!subtypeSupports(def, difficulty)) throw new Error(`${meta.name}: subtype "${subtype}" has no ${difficulty} level`);
    return def;
  }
  const options = subtypes.filter((s) => subtypeSupports(s, difficulty));
  if (!options.length) throw new Error(`${meta.name}: no subtype supports ${difficulty}`);
  return rng.weighted(options.map((s) => [s, s.weight ?? 1] as const));
}

/** Canonical RNG for a build call. Subtype choice uses a separate fork so explicit/implicit subtype builds agree. */
export function seededRng(meta: GenMeta, seed: string, difficulty: Difficulty, subtype: string): Rng {
  return makeRng(`${meta.name}:${meta.version}:${subtype}:${difficulty}:${seed}`);
}

/** RNG used only to choose a subtype when none is given. */
export function subtypeRng(meta: GenMeta, seed: string, difficulty: Difficulty): Rng {
  return makeRng(`${meta.name}:${meta.version}:subtype:${difficulty}:${seed}`);
}

/**
 * Standard build wrapper: resolves the subtype, then calls `impl` with a canonical RNG.
 *
 *   export const generator = defineGenerator(meta, SUBTYPES, (ctx) => { … return { item, facts } });
 */
export interface BuildContext {
  meta: GenMeta;
  seed: string;
  difficulty: Difficulty;
  subtype: SubtypeDef;
  rng: Rng;
}

export function defineGenerator<F>(
  meta: GenMeta,
  subtypes: readonly SubtypeDef[],
  impl: (ctx: BuildContext) => GenResult<F>,
): ChapterGenerator<F> {
  return {
    ...meta,
    subtypes,
    build(seed, difficulty, subtype) {
      const def = resolveSubtype(meta, subtypes, subtypeRng(meta, seed, difficulty), difficulty, subtype);
      const rng = seededRng(meta, seed, difficulty, def.id);
      return impl({ meta, seed, difficulty, subtype: def, rng });
    },
  };
}
