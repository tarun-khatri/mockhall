import { describeGenerator } from '../../helpers/harness';
import { generator, type BoatFacts } from '../../../src/content/generators/quant/boats-streams';
import { verify } from '../../../src/content/verify/quant/boats-streams';
import type { GenResult } from '../../../src/content/generators/types';

function value(opt: string): number {
  const s = opt.replace(/[,\s]/g, '');
  const m = s.match(/^\$(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$/);
  if (m) return Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]);
  return parseFloat(s);
}

function sanity(res: GenResult<BoatFacts>): string[] {
  const out: string[] = [];
  const q = res.item.questions[0];
  for (const o of q.options) {
    const v = value(o);
    if (!Number.isFinite(v) || v <= 0) out.push(`non-positive or unparsable option "${o}"`);
    if (o.endsWith('km/h') && v > 80) out.push(`unrealistic boat speed ${o}`);
    if (/hours?$/.test(o) && v > 48) out.push(`unrealistic time ${o}`);
  }
  const g = res.facts.given;
  if (g.B !== undefined && g.S !== undefined && !(g.B > g.S)) out.push('stream faster than boat');
  if (q.prompt.length < 40) out.push('prompt too short');
  return out;
}

describeGenerator(generator, { verify, sanity });
