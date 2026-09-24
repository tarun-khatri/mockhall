import { generator } from '../src/content/generators/reasoning/data-sufficiency';
const N = Number(process.argv[2] ?? 20);
const show = process.argv[3];
for (const st of generator.subtypes) for (const d of ['easy','medium','hard','extreme'] as const) {
  const t0 = Date.now(); const cats=[0,0,0,0,0]; let fail=0;
  for (let i=0;i<N;i++) { try { const r = generator.build('s'+i, d, st.id); cats[r.item.questions[0].answerIndex]++; if (show===st.id && i<2) { const q=r.item.questions[0]; console.log('----',d,'\n'+q.prompt,'\nKEY',q.answerIndex,'\n'+q.solution.steps.join('\n')); } } catch(e) { fail++; if (fail<2) console.log(st.id,d,(e as Error).message); } }
  console.log(st.id, d, cats.join('/'), 'fail', fail, ((Date.now()-t0)/N).toFixed(1),'ms/q');
}
