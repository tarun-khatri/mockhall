import { describeGenerator } from '../../helpers/harness';
import { generator, RELATIONS, type QuadraticFacts } from '../../../src/content/generators/quant/quadratic';
import { verify } from '../../../src/content/verify/quant/quadratic';
import type { GenResult } from '../../../src/content/generators/types';

function sanity(res: GenResult<QuadraticFacts>): string[] {
  const out: string[] = [];
  const q = res.item.questions[0];
  if (JSON.stringify(q.options) !== JSON.stringify(RELATIONS)) out.push('options not in the fixed exam order');
  for (const e of [res.facts.x, res.facts.y]) {
    if (e.a <= 0 || e.a > 49 || Math.abs(e.b) > 160 || Math.abs(e.c) > 250) out.push(`unrealistic coefficients ${JSON.stringify(e)}`);
  }
  return out;
}

describeGenerator(generator, { verify, sanity });
