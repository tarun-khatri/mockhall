import { describeGenerator } from '../../helpers/harness';
import { generator, type NumberSeriesFacts } from '../../../src/content/generators/quant/number-series';
import { verify } from '../../../src/content/verify/quant/number-series';
import type { GenResult } from '../../../src/content/generators/types';

function sanity(res: GenResult<NumberSeriesFacts>): string[] {
  const out: string[] = [];
  const q = res.item.questions[0];
  const terms = res.facts.shown;
  if (terms.length < 6 || terms.length > 8) out.push(`series length ${terms.length}`);
  for (const t of terms) if (t !== null && (!(t > 0) || t > 99999 || !Number.isInteger(t * 2))) out.push(`bad term ${t}`);
  const vals = q.options.map(Number);
  if (vals.some((v) => !(v > 0) || !Number.isFinite(v))) out.push(`bad option ${JSON.stringify(q.options)}`);
  if (q.subtype === 'missing-number') {
    if (terms.filter((t) => t === null).length !== 1) out.push('missing-number needs exactly one ?');
    for (let i = 1; i < 5; i++) if (!(vals[i] > vals[i - 1])) out.push(`options not ascending ${JSON.stringify(q.options)}`);
  } else {
    if (terms.includes(null)) out.push('wrong-number series must be complete');
    const opts = terms.slice(1, 6).map(String);
    if (JSON.stringify(opts) !== JSON.stringify(q.options.map((o) => String(Number(o))))) out.push('wrong-number options must be terms 2–6 in series order');
  }
  if (!q.solution.shortcut || !q.solution.trap) out.push('missing shortcut or trap');
  return out;
}

describeGenerator(generator, { verify, sanity });
