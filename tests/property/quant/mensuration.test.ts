import { describeGenerator } from '../../helpers/harness';
import { generator, type MensFacts } from '../../../src/content/generators/quant/mensuration';
import { verify } from '../../../src/content/verify/quant/mensuration';
import type { GenResult } from '../../../src/content/generators/types';

function value(opt: string): number {
  if (opt === 'no change') return 0;
  const pct = opt.match(/^(\d+(?:\.\d+)?)% (increase|decrease)$/);
  if (pct) return (pct[2] === 'decrease' ? -1 : 1) * Number(pct[1]);
  const s = opt.replace(/[₹,\s]/g, '');
  const m = s.match(/^\$(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$/);
  if (m) return Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]);
  return parseFloat(s);
}

function sanity(res: GenResult<MensFacts>): string[] {
  const out: string[] = [];
  const q = res.item.questions[0];
  const isPct = /percent/.test(res.facts.form) || res.facts.form === 'scale' || res.facts.form === 'keep-area';
  for (const o of q.options) {
    const v = value(o);
    if (!Number.isFinite(v)) out.push(`unparsable option "${o}"`);
    if (!isPct && v <= 0) out.push(`non-positive option "${o}"`);
    if (o.startsWith('₹') && !Number.isInteger(v)) out.push(`money not whole: ${o}`);
    if (!isPct && v > 1e7) out.push(`absurd value ${o}`);
  }
  if (q.prompt.length < 40) out.push('prompt too short');
  return out;
}

describeGenerator(generator, { verify, sanity });
