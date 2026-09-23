import { describeGenerator } from '../../helpers/harness';
import { generator, type RatioFacts } from '../../../src/content/generators/quant/ratio-proportion';
import { verify } from '../../../src/content/verify/quant/ratio-proportion';
import type { GenResult } from '../../../src/content/generators/types';

function sanity(res: GenResult<RatioFacts>): string[] {
  const out: string[] = [];
  const q = res.item.questions[0];
  const key = q.options[q.answerIndex];
  for (const o of q.options) {
    if (/ : /.test(o)) {
      const parts = o.split(' : ').map(Number);
      if (parts.some((x) => !(x > 0) || !Number.isInteger(x))) out.push(`bad ratio option ${o}`);
      if (parts.some((x) => x > 400)) out.push(`huge ratio term ${o}`);
    } else {
      const v = Number(o.replace(/[₹,\s]/g, ''));
      if (!Number.isFinite(v) || v <= 0) out.push(`bad numeric option ${o}`);
    }
  }
  if (!/ : /.test(key)) {
    const v = Number(key.replace(/[₹,\s]/g, ''));
    if (key.includes('.')) out.push(`fractional key ${key}`);
    if (!key.includes('₹') && v > 5000) out.push(`implausibly large count ${key}`);
  }
  const f = res.facts;
  if (f.form === 'coin-count' || f.form === 'coin-value' || f.form === 'coin-chain') {
    if (!(f.value > 0 && f.value <= 20000)) out.push(`coin total ${f.value}`);
  }
  return out;
}

describeGenerator(generator, { verify, sanity });
