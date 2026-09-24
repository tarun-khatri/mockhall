import { generator } from '../src/content/generators/reasoning/data-sufficiency';
const st = process.argv[2]; const d = (process.argv[3] ?? 'medium') as any; const n = Number(process.argv[4] ?? 2);
for (let i=0;i<n;i++){ const r=generator.build('x'+i,d,st); const q=r.item.questions[0]; console.log('=====',st,d,'KEY',q.answerIndex,'\n'+q.prompt.split('\n\n').slice(1).join('\n\n'),'\n--\n'+q.solution.steps.join('\n'),'\nTRAP',q.solution.trap); }
