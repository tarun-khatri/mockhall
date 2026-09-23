import { describeGenerator } from '../../helpers/harness';
import { generator, type SyllogismFacts } from '../../../src/content/generators/reasoning/syllogism';
import { verify } from '../../../src/content/verify/reasoning/syllogism';
import type { GenResult } from '../../../src/content/generators/types';

function sanity(res: GenResult<SyllogismFacts>): string[] {
  const p: string[] = [];
  const f = res.facts;
  const q = res.item.questions[0];
  const n = f.terms.length;
  if (new Set(f.terms).size !== n) p.push('repeated term');
  if (n < 2 || n > 4) p.push(`term count ${n}`);
  const inRange = (x: { a: number; b: number }) => x.a >= 0 && x.b >= 0 && x.a < n && x.b < n && x.a !== x.b;
  for (const s of f.statements) if (!inRange(s)) p.push('statement term out of range');
  for (const c of f.conclusions) if (!inRange(c)) p.push('conclusion term out of range');
  if (f.conclusions.length !== 2) p.push('need two conclusions');
  const st = q.subtype;
  if (f.form === 'conclusions') {
    if (st === 'two-statement' && f.statements.length !== 2) p.push(`two-statement has ${f.statements.length}`);
    if (st === 'three-statement' && f.statements.length !== 3) p.push(`three-statement has ${f.statements.length}`);
    if (st === 'only-a-few' && !f.statements.some((s) => s.q === 'only-a-few')) p.push('only-a-few subtype without "only a few"');
    if (st === 'possibility' && q.answerIndex !== 2 && !f.conclusions.some((c) => c.possibility)) p.push('possibility subtype without a possibility conclusion');
    const [a, b] = f.conclusions;
    if (a && b && a.q === b.q && a.a === b.a && a.b === b.b && !!a.possibility === !!b.possibility) p.push('identical conclusions');
    if (!/Statements:/.test(q.prompt) || !/Conclusions:/.test(q.prompt)) p.push('prompt shape');
  } else {
    if ((f.options ?? []).length !== 5) p.push('reverse needs five options');
  }
  const v = q.solution.visual;
  if (!v || v.type !== 'venn') p.push('missing venn visual');
  else {
    if (!v.worlds.length) p.push('venn without worlds');
    for (const w of v.worlds) {
      for (const set of v.sets) if (!w.regions.some((r) => r.includes(set))) p.push(`world "${w.label}" leaves ${set} empty`);
    }
  }
  return p;
}

describeGenerator(generator, { verify, sanity });
