import { generator } from '../src/content/generators/reasoning/input-output';
const st = process.argv[2]; const d = (process.argv[3] ?? 'medium') as any; const n = Number(process.argv[4] ?? 1);
const t0=Date.now();
for (let i=0;i<n;i++){ const r=generator.build('x'+i,d,st); if (i<Number(process.argv[5]??1)) { console.log('=====',st,d,'\n'+r.item.set!.stimulus); for (const q of r.item.questions) console.log('\nQ:',q.prompt,'\n',q.options.map((o,j)=>(j===q.answerIndex?'*':' ')+o).join(' | '),'\n  ',q.solution.steps.slice(-1)[0]); console.log(r.item.questions[0].solution.steps.join('\n')); } }
console.log('ms/set',(Date.now()-t0)/n);
