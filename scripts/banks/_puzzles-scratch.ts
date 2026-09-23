// THROWAWAY calibration script — delete before finishing.
import { makeRng } from '../../src/lib/rng';
import { makeSetup, type SubtypeId } from '../../src/content/generators/reasoning/puzzles/setup';
import { cluePool, randomTruth, selectClues, selectFailures } from '../../src/content/generators/reasoning/puzzles/clues';
import type { Difficulty } from '../../src/content/types';
import { prof } from '../../src/content/generators/solver/puzzles/csp';

const subs = process.argv[2].split(',') as SubtypeId[];
const diffs = process.argv[3].split(',') as Difficulty[];
const N = Number(process.argv[4] ?? 40);
const maxC: Record<Difficulty, number> = { easy: 10, medium: 12, hard: 14, extreme: 18 };
for (const sub of subs) {
  for (const d of diffs) {
    const t0 = Date.now();
    const levels: Record<string, number> = { easy: 0, medium: 0, hard: 0, extreme: 0, fail: 0 };
    const counts: number[] = [];
    const deads: number[] = [];
    let slowest = 0;
    for (let i = 0; i < N; i++) {
      const t1 = Date.now();
      const rng = makeRng(`cal:${sub}:${d}:${i}`);
      const setup = makeSetup(sub, d, rng);
      const truth = randomTruth(setup, rng);
      const pool = cluePool(setup, truth, rng);
      const sel = selectClues(setup, pool, rng, maxC[d]);
      slowest = Math.max(slowest, Date.now() - t1);
      if (!sel) {
        levels.fail++;
        continue;
      }
      levels[sel.level]++;
      if (sel.level === d) {
        counts.push(sel.clues.length);
        deads.push(sel.stats.dead);
      }
    }
    const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)).toFixed(1);
    console.log(
      `${sub}/${d}: ${((Date.now() - t0) / N).toFixed(0)} ms avg (max ${slowest}), levels ${JSON.stringify(levels)}, on-target clues ${avg(counts)} [${Math.min(...counts)}..${Math.max(...counts)}] dead avg ${avg(deads)} failures ${JSON.stringify(selectFailures)}`,
    );
    selectFailures.notUnique = selectFailures.tooMany = 0;
    console.log('   prof', JSON.stringify(prof, (_, v) => (typeof v === 'number' ? Math.round(v) : v)));
    for (const k of Object.keys(prof) as (keyof typeof prof)[]) prof[k] = 0;
  }
}
