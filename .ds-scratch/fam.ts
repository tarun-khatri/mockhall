import { familyWorlds } from '../src/content/generators/reasoning/data-sufficiency/family';
for (const [n,c,t] of [[5,2,true],[6,2,true],[6,2,false],[7,2,false]] as const) {
  const t0 = Date.now();
  const w = familyWorlds(n,c,t);
  console.log(n,c,t,w.length, Date.now()-t0,'ms');
}
