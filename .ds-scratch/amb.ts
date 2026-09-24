import { simulate, consistentRuns, sameRuns, stepFamily } from '../src/content/generators/reasoning/input-output/machine';
const rule = { cycle: [[{ kind: 'word', order: 'asc', end: 'left', op: { t: 'none' } }], [{ kind: 'num', order: 'desc', end: 'right', op: { t: 'none' } }]] } as any;
const input = ['mango', '45', 'apple', '78', 'tiger', '12'];
const sim = simulate(input, rule);
console.log(sim.lines.map(l=>l.join(' ')), sim.last, sim.midNoOp);
const runs = consistentRuns(input, [sim.lines[1], sim.lines[2]]);
console.log(runs.length, sameRuns(runs));
for (const r of runs) console.log(r.map(l=>l.join(' ')).join(' | '));
