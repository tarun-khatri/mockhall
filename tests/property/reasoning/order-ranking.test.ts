import { describeGenerator } from '../../helpers/harness';
import { generator, type OrderRankingFacts } from '../../../src/content/generators/reasoning/order-ranking';
import { verify } from '../../../src/content/verify/reasoning/order-ranking';
import type { GenResult } from '../../../src/content/generators/types';

function sanity(res: GenResult<OrderRankingFacts>): string[] {
  const p: string[] = [];
  const f = res.facts;
  const q = res.item.questions[0];
  if (f.kind === 'row') {
    for (const s of f.stmts) {
      if (s.t === 'pos' && (s.k < 1 || s.k > 150)) p.push(`position ${s.k}`);
      if (s.t === 'total' && (s.n < 10 || s.n > 100)) p.push(`row of ${s.n}`);
      if (s.t === 'between' && s.k < 0) p.push('negative persons between');
    }
    const nums = q.options.filter((o) => /^\d+$/.test(o)).map(Number);
    if (nums.some((x) => x < 0 || x > 150)) p.push(`absurd option ${nums}`);
  } else {
    if (f.people.length < 5 || f.people.length > 7) p.push(`${f.people.length} people`);
    if (f.clues.length < 3 || f.clues.length > 7) p.push(`${f.clues.length} clues`);
  }
  const i = q.options.indexOf('Cannot be determined');
  if (i >= 0 && i !== 4) p.push('"Cannot be determined" not at E');
  return p;
}

describeGenerator(generator, { verify, sanity });
