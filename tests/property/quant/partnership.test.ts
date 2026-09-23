import { describeGenerator } from '../../helpers/harness';
import { generator, type PartnershipFacts } from '../../../src/content/generators/quant/partnership';
import { verify } from '../../../src/content/verify/quant/partnership';
import type { GenResult } from '../../../src/content/generators/types';

/** Realistic capitals, profits and months; shares in whole rupees. */
function sanity(res: GenResult<PartnershipFacts>): string[] {
  const out: string[] = [];
  const q = res.item.questions[0];
  const key = q.options[q.answerIndex];
  for (const o of q.options) {
    if (/months?$/.test(o)) {
      const m = Number(o.replace(/\s*months?$/, ''));
      if (!(m >= 1 && m <= 12)) out.push(`month option out of range ${o}`);
    } else if (!/^\d+ : \d+$/.test(o)) {
      const v = Number(o.replace(/[₹,]/g, ''));
      if (!(v > 0)) out.push(`bad option ${o}`);
    }
  }
  if (key.includes('₹') && key.includes('.')) out.push(`paise in the key ${key}`);
  const f = res.facts;
  if (f.form === 'shares') {
    if (f.profit < 1000) out.push(`tiny profit ${f.profit}`);
    for (const s of f.schedules) for (const [a, b, c] of s) if (c <= 0 || a < 0 || b > f.period || a >= b) out.push(`bad segment ${a}-${b}:${c}`);
  }
  return out;
}

describeGenerator(generator, { verify, sanity });
