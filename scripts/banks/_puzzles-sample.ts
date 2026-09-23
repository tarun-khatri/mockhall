// THROWAWAY sample printer — delete before finishing.
import { generator } from '../../src/content/generators/reasoning/puzzles';
import type { Difficulty } from '../../src/content/types';

const sub = process.argv[2];
const d = process.argv[3] as Difficulty;
const seed = process.argv[4] ?? 's1';
const full = process.argv[5] !== 'brief';
const t = Date.now();
const res = generator.build(seed, d, sub);
console.log(`built in ${Date.now() - t} ms; measured ${JSON.stringify(res.facts.measured)}`);
console.log(res.item.set!.stimulus);
for (const q of res.item.questions) {
  console.log('\nQ:', q.prompt);
  q.options.forEach((o, i) => console.log(`  ${'ABCDE'[i]}${i === q.answerIndex ? '*' : ' '} ${o}`));
  if (full) {
    console.log('  steps:\n    ' + q.solution.steps.join('\n    '));
    console.log('  shortcut:', q.solution.shortcut, '\n  trap:', q.solution.trap);
  }
}
if (full) console.log(JSON.stringify(res.item.questions[0].solution.visual));
