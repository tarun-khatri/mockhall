/**
 * Client for the puzzle Worker. Used for "fresh" papers and "Try a similar one" on bank chapters; anything slow,
 * unsupported or failing falls back to the pre-verified bank (the caller decides).
 */
import type { Difficulty, Item } from './types';

/** Chapters with a runtime generator available in the Worker. */
export const WORKER_CHAPTERS = new Set(['puzzles', 'seating']);

/** Cells whose worst-case build time is too slow for phones — always served from the bank. */
const SLOW = new Set(['puzzles:month:hard', 'puzzles:month:extreme', 'puzzles:comparison:extreme']);

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (i: Item) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!worker) {
    worker = new Worker(new URL('./puzzle.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; item?: Item; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(e.data.id);
      if (e.data.item) p.resolve(e.data.item);
      else p.reject(new Error(e.data.error ?? 'generation failed'));
    };
    worker.onerror = () => {
      for (const [, p] of pending) p.reject(new Error('worker crashed'));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

export function canGenerateFresh(chapter: string, difficulty: Difficulty, subtype?: string): boolean {
  if (!WORKER_CHAPTERS.has(chapter)) return false;
  if (subtype && SLOW.has(`${chapter}:${subtype}:${difficulty}`)) return false;
  if (chapter === 'seating' && (difficulty === 'extreme' || subtype === 'linear-uncertain')) return false;
  return typeof Worker !== 'undefined';
}

export function generateFresh(chapter: string, seed: string, difficulty: Difficulty, subtype?: string, timeoutMs = 8000): Promise<Item> {
  const w = getWorker();
  if (!w) return Promise.reject(new Error('Workers unavailable'));
  const id = ++seq;
  return new Promise<Item>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('timed out'));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    w.postMessage({ id, chapter, seed, difficulty, subtype });
  });
}
