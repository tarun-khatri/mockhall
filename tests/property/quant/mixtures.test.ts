import { describeGenerator } from '../../helpers/harness';
import { generator, type MixturesFacts } from '../../../src/content/generators/quant/mixtures';
import { verify } from '../../../src/content/verify/quant/mixtures';
import type { GenResult } from '../../../src/content/generators/types';

function value(o: string): number {
  const s = o.replace(/\s*(litres?|kg|per kg)$/i, '').replace(/[₹,\s%]/g, '');
  const tex = s.match(/^\$(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$$/);
  return tex ? Number(tex[1] ?? 0) + Number(tex[2]) / Number(tex[3]) : Number(s);
}

/** Positive, realistic quantities (≤ 400 L), prices, percentages; ratio terms positive. */
function sanity(res: GenResult<MixturesFacts>): string[] {
  const out: string[] = [];
  const q = res.item.questions[0];
  for (const o of q.options) {
    if (/^\d+ : \d+$/.test(o)) {
      if (o.split(' : ').some((x) => Number(x) <= 0)) out.push(`bad ratio ${o}`);
      continue;
    }
    const v = value(o);
    if (!Number.isFinite(v) || v <= 0) out.push(`bad option ${o}`);
    if (/litre/.test(o) && v > 400) out.push(`implausible volume ${o}`);
    if (/%$/.test(o) && v > 300) out.push(`absurd percentage ${o}`);
  }
  return out;
}

describeGenerator(generator, { verify, sanity });
