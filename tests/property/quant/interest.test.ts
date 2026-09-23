import { describeGenerator } from '../../helpers/harness';
import { generator, type InterestFacts } from '../../../src/content/generators/quant/interest';
import { verify } from '../../../src/content/verify/quant/interest';
import type { GenResult } from '../../../src/content/generators/types';

/** Numeric value of an option ("₹12,345", "12.5%", "7 years", "$2\frac{1}{2}$ years"). */
function value(opt: string): number {
  const s = opt.replace(/[₹,\s]/g, '');
  const m = s.match(/^\$(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$/);
  if (m) return Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]);
  return parseFloat(s);
}

function sanity(res: GenResult<InterestFacts>): string[] {
  const out: string[] = [];
  const q = res.item.questions[0];
  for (const o of q.options) {
    const v = value(o);
    if (!Number.isFinite(v) || v <= 0) out.push(`non-positive or unparsable option "${o}"`);
    if (o.startsWith('₹')) {
      if (!Number.isInteger(v)) out.push(`money option not a whole rupee: ${o}`);
      if (v > 5e7) out.push(`absurd amount ${o}`);
    }
    if (o.endsWith('%') && v > 100) out.push(`rate above 100%: ${o}`);
    if (/years?$/.test(o) && v > 120) out.push(`absurd time ${o}`);
  }
  const g = res.facts.given;
  for (const key of ['P', 'A', 'S', 'X']) {
    const v = g[key];
    if (v !== undefined && (v < 1000 || v > 1e6 || !Number.isInteger(v))) out.push(`unrealistic ${key} = ${v}`);
  }
  for (const key of ['R', 'r1', 'r2', 'r3']) {
    const v = g[key];
    if (v !== undefined && (v <= 0 || v > 40)) out.push(`unrealistic rate ${key} = ${v}`);
  }
  if (res.facts.ask === 'part' && g.S !== undefined) {
    for (const o of q.options) if (value(o) >= g.S) out.push(`part ${o} not below the total ${g.S}`);
  }
  if (res.facts.ask === 'amount' && g.P !== undefined) {
    for (const o of q.options) if (value(o) <= g.P) out.push(`amount option ${o} not above the principal ${g.P}`);
  }
  if (q.prompt.length < 40) out.push('prompt too short');
  return out;
}

describeGenerator(generator, { verify, sanity });
