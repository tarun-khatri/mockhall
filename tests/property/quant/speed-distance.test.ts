import { describeGenerator } from '../../helpers/harness';
import { generator, type SpeedFacts } from '../../../src/content/generators/quant/speed-distance';
import { verify } from '../../../src/content/verify/quant/speed-distance';
import type { GenResult } from '../../../src/content/generators/types';

function value(opt: string): number {
  const s = opt.replace(/[,\s]/g, '');
  const m = s.match(/^\$(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$/);
  if (m) return Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]);
  return parseFloat(s);
}

function sanity(res: GenResult<SpeedFacts>): string[] {
  const out: string[] = [];
  const q = res.item.questions[0];
  for (const o of q.options) {
    const v = value(o);
    if (!Number.isFinite(v) || v <= 0) out.push(`non-positive or unparsable option "${o}"`);
    if (o.endsWith('km/h') && v > 200) out.push(`unrealistic speed ${o}`);
    if (/ m$/.test(o) && v > 5000) out.push(`unrealistic length ${o}`);
    if (o.endsWith('seconds') && v > 3600) out.push(`unrealistic seconds ${o}`);
  }
  const t = res.facts.train;
  if (t?.speed && (t.speed < 20 || t.speed > 160)) out.push(`train speed ${t.speed}`);
  if (t?.len && (t.len < 50 || t.len > 600)) out.push(`train length ${t.len}`);
  if (q.prompt.length < 40) out.push('prompt too short');
  return out;
}

describeGenerator(generator, { verify, sanity });
