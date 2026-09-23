import { describeGenerator } from '../../helpers/harness';
import { generator, type AgesFacts } from '../../../src/content/generators/quant/ages';
import { verify } from '../../../src/content/verify/quant/ages';
import type { GenResult } from '../../../src/content/generators/types';

/** Ages must be realistic: no option at or below 0, the key between 1 and 150 years (sums of two ages can pass 100). */
function sanity(res: GenResult<AgesFacts>): string[] {
  const out: string[] = [];
  const q = res.item.questions[0];
  for (const o of q.options) {
    const m = o.match(/^(\d+) years?$/);
    if (m) {
      const v = Number(m[1]);
      if (v <= 0 || v > 200) out.push(`odd age option ${o}`);
    } else if (!/^\d+ : \d+$/.test(o)) out.push(`unexpected option format ${o}`);
  }
  const key = q.options[q.answerIndex];
  const km = key.match(/^(\d+) years?$/);
  if (km && (Number(km[1]) < 1 || Number(km[1]) > 150)) out.push(`implausible age answer ${key}`);
  return out;
}

describeGenerator(generator, { verify, sanity });
