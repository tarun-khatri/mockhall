import { describeGenerator } from '../../helpers/harness';
import { generator, type WorkFacts } from '../../../src/content/generators/quant/time-work';
import { verify } from '../../../src/content/verify/quant/time-work';
import type { GenResult } from '../../../src/content/generators/types';

function value(opt: string): number {
  const s = opt.replace(/[₹,\s]/g, '');
  const m = s.match(/^\$(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$/);
  if (m) return Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]);
  return parseFloat(s);
}

function sanity(res: GenResult<WorkFacts>): string[] {
  const out: string[] = [];
  const q = res.item.questions[0];
  for (const o of q.options) {
    const v = value(o);
    if (!Number.isFinite(v) || v <= 0) out.push(`non-positive or unparsable option "${o}"`);
    if (/days?$/.test(o) && v > 500) out.push(`absurd days ${o}`);
    if (o.startsWith('₹') && !Number.isInteger(v)) out.push(`money not whole: ${o}`);
    if (/workers$/.test(o) && !Number.isInteger(v)) out.push(`fractional workers ${o}`);
  }
  if (q.prompt.length < 40) out.push('prompt too short');
  return out;
}

describeGenerator(generator, { verify, sanity });
