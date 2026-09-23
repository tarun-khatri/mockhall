import { describeGenerator } from '../../helpers/harness';
import { generator, type PercentageFacts } from '../../../src/content/generators/quant/percentage';
import { verify } from '../../../src/content/verify/quant/percentage';
import type { GenResult } from '../../../src/content/generators/types';

/** Rough numeric value of an option for range checks (fractions read approximately). */
function approx(o: string): number {
  if (/^no change$/i.test(o.trim())) return 0;
  const sign = /decrease$/i.test(o) ? -1 : 1;
  const s = o.replace(/\s*(increase|decrease)$/i, '').replace(/[₹,\s%]/g, '');
  const tex = s.match(/^\$(-)?(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$$/);
  if (tex) return sign * (tex[1] ? -1 : 1) * (Number(tex[2] ?? 0) + Number(tex[3]) / Number(tex[4]));
  return sign * Number(s);
}

function sanity(res: GenResult<PercentageFacts>): string[] {
  const out: string[] = [];
  const f = res.facts;
  const q = res.item.questions[0];
  const key = q.options[q.answerIndex];
  const v = approx(key);
  if (!Number.isFinite(v)) out.push(`key not numeric: ${key}`);
  for (const o of q.options) {
    if (/-₹/.test(o)) out.push(`negative rupees: ${o}`);
    if (/\d\.\d{3,}/.test(o)) out.push(`over-precise option: ${o}`);
    if (!Number.isFinite(approx(o))) out.push(`unreadable option: ${o}`);
  }
  if (key.includes('₹')) {
    if (key.includes('.')) out.push(`paise in a rupee answer: ${key}`);
    if (v < 100) out.push(`implausibly small amount: ${key}`);
  }
  if (key.endsWith('%') && (v <= 0 || v > 400)) out.push(`absurd percentage answer: ${key}`);
  switch (f.form) {
    case 'election':
      if (f.margin < 100) out.push(`tiny margin ${f.margin}`);
      if (f.winner >= 80) out.push(`winner share ${f.winner}`);
      break;
    case 'growth':
    case 'birth-death':
    case 'migration':
      if (f.start < 10000) out.push(`start too small ${f.start}`);
      break;
    case 'pass-max':
      if (f.got <= 0 || f.pass < 25 || f.pass > 60) out.push(`odd marks ${JSON.stringify(f)}`);
      break;
    case 'two-students':
      if (f.short < 5 || f.extra < 5) out.push(`odd margins ${JSON.stringify(f)}`);
      break;
    case 'spend-heads':
    case 'spend-chain':
      if (f.saving < 1000) out.push(`tiny saving ${f.saving}`);
      break;
    default:
      break;
  }
  return out;
}

describeGenerator(generator, { verify, sanity });
