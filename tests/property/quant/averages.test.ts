import { describeGenerator } from '../../helpers/harness';
import { generator, type AveragesFacts } from '../../../src/content/generators/quant/averages';
import { verify } from '../../../src/content/verify/quant/averages';
import type { GenResult } from '../../../src/content/generators/types';

function value(o: string): number {
  const s = o.replace(/\s*(kg|years?|marks)$/i, '').replace(/[₹,\s]/g, '');
  const tex = s.match(/^\$(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$$/);
  return tex ? Number(tex[1] ?? 0) + Number(tex[2]) / Number(tex[3]) : Number(s);
}

/** No negative/zero options; realistic ages, weights and teacher ages; at most two decimals. */
function sanity(res: GenResult<AveragesFacts>): string[] {
  const out: string[] = [];
  const q = res.item.questions[0];
  for (const o of q.options) {
    const v = value(o);
    if (!Number.isFinite(v) || v <= 0) out.push(`bad option ${o}`);
    if (/\.\d{3,}/.test(o)) out.push(`over-precise option ${o}`);
  }
  const key = value(q.options[q.answerIndex]);
  const f = res.facts;
  if (f.form.startsWith('teacher') && f.form !== 'teacher-count' && (key < 22 || key > 65)) out.push(`implausible teacher age ${key}`);
  if ((f.form === 'join-leave' || f.form === 'replace') && f.unit === 'kg' && (key < 25 || key > 150)) out.push(`implausible weight ${key}`);
  if (f.form === 'bowling' && (key < 10 || key > 1000)) out.push(`odd wicket count ${key}`);
  return out;
}

describeGenerator(generator, { verify, sanity });
