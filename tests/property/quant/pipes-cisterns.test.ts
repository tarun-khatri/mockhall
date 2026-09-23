import { describeGenerator } from '../../helpers/harness';
import { generator, type PipeFacts } from '../../../src/content/generators/quant/pipes-cisterns';
import { verify } from '../../../src/content/verify/quant/pipes-cisterns';
import type { GenResult } from '../../../src/content/generators/types';

function value(opt: string): number {
  const s = opt.replace(/[,\s]/g, '');
  const m = s.match(/^\$(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$/);
  if (m) return Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]);
  return parseFloat(s);
}

function sanity(res: GenResult<PipeFacts>): string[] {
  const out: string[] = [];
  const q = res.item.questions[0];
  for (const o of q.options) {
    const v = value(o);
    if (!Number.isFinite(v) || v <= 0) out.push(`non-positive or unparsable option "${o}"`);
    if (/(minutes|hours)$/.test(o) && v > 400) out.push(`absurd time ${o}`);
    if (o.endsWith('litres') && (v > 100000 || !Number.isInteger(v))) out.push(`absurd capacity ${o}`);
  }
  if (q.prompt.length < 40) out.push('prompt too short');
  return out;
}

describeGenerator(generator, { verify, sanity });
