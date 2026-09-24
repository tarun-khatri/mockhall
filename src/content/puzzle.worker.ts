/// <reference lib="webworker" />
/** Fresh puzzle sets generated off the main thread (SPEC 7.2). Same pure generators the property suites verify. */
import { generator as puzzles } from './generators/reasoning/puzzles';
import type { ChapterGenerator } from './generators/types';
import type { Difficulty } from './types';

const GENERATORS: Record<string, ChapterGenerator> = { puzzles };

interface Req {
  id: number;
  chapter: string;
  seed: string;
  difficulty: Difficulty;
  subtype?: string;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, chapter, seed, difficulty, subtype } = e.data;
  try {
    const gen = GENERATORS[chapter];
    if (!gen) throw new Error(`no runtime generator for ${chapter}`);
    const { item } = gen.build(seed, difficulty, subtype);
    (self as unknown as Worker).postMessage({ id, item });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: (err as Error).message });
  }
};
