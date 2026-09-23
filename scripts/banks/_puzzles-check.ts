// THROWAWAY cross-check — delete before finishing.
import { generator } from '../../src/content/generators/reasoning/puzzles';
import { verify } from '../../src/content/verify/reasoning/puzzles';
import { normaliseOption } from '../../src/content/rich';
import type { Difficulty } from '../../src/content/types';

const subs = process.argv[2].split(',');
const diffs = process.argv[3].split(',') as Difficulty[];
const N = Number(process.argv[4] ?? 5);
for (const sub of subs)
  for (const d of diffs) {
    let bad = 0;
    let genMs = 0;
    let verMs = 0;
    let slow = 0;
    for (let i = 0; i < N; i++) {
      const seed = `c${i}`;
      let t = Date.now();
      let res;
      try {
        res = generator.build(seed, d, sub);
      } catch (e) {
        console.log(`${sub}/${d}/${seed} BUILD FAIL ${(e as Error).message}`);
        bad++;
        continue;
      }
      const g = Date.now() - t;
      genMs += g;
      slow = Math.max(slow, g);
      t = Date.now();
      try {
        const exp = verify(res);
        res.item.questions.forEach((q, j) => {
          const x = exp[j];
          const idx = typeof x === 'number' ? x : q.options.findIndex((o) => normaliseOption(o) === normaliseOption(x));
          if (idx !== q.answerIndex) {
            bad++;
            console.log(`${sub}/${d}/${seed} Q${j + 1} MISMATCH key ${q.answerIndex} verifier ${JSON.stringify(x)}: ${q.prompt} ${JSON.stringify(q.options)}`);
          }
        });
      } catch (e) {
        bad++;
        console.log(`${sub}/${d}/${seed} VERIFY THREW ${(e as Error).message}`);
      }
      verMs += Date.now() - t;
    }
    console.log(`== ${sub}/${d}: bad ${bad}, gen avg ${(genMs / N).toFixed(0)} ms (max ${slow}), verify avg ${(verMs / N).toFixed(0)} ms`);
  }
