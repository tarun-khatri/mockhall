import { describeGenerator } from '../../helpers/harness';
import { generator, type ProfitLossFacts } from '../../../src/content/generators/quant/profit-loss';
import { verify } from '../../../src/content/verify/quant/profit-loss';
import type { GenResult } from '../../../src/content/generators/types';

/** Approximate signed value of an option (profit +, loss −). */
function approx(o: string): number {
  const t = o.trim();
  if (/^no profit, no loss$/i.test(t)) return 0;
  const sign = /loss/i.test(t) ? -1 : 1;
  const s = t.replace(/^(profit|loss) of /i, '').replace(/\s+(profit|loss)$/i, '').replace(/[₹,\s%]/g, '');
  const tex = s.match(/^\$(-)?(\d+)?\\frac\{(\d+)\}\{(\d+)\}\$$/);
  if (tex) return sign * (tex[1] ? -1 : 1) * (Number(tex[2] ?? 0) + Number(tex[3]) / Number(tex[4]));
  return sign * Number(s);
}

function sanity(res: GenResult<ProfitLossFacts>): string[] {
  const out: string[] = [];
  const f = res.facts;
  const q = res.item.questions[0];
  const key = q.options[q.answerIndex];
  const v = approx(key);
  for (const o of q.options) {
    if (!Number.isFinite(approx(o))) out.push(`unreadable option: ${o}`);
    if (/-₹/.test(o)) out.push(`negative rupees: ${o}`);
  }
  if (key.includes('₹')) {
    if (key.includes('.')) out.push(`paise in answer: ${key}`);
    if (Math.abs(v) < 5 && v !== 0) out.push(`tiny amount: ${key}`);
  }
  if (key.includes('%') && Math.abs(v) > 200) out.push(`absurd percentage: ${key}`);
  if (f.form === 'sp-from-cp' && (f.cp < 100 || f.cp > 10000)) out.push(`cp out of range ${f.cp}`);
  if (f.form === 'false-weight' && (f.grams < 700 || f.grams >= 1000)) out.push(`odd weight ${f.grams}`);
  return out;
}

describeGenerator(generator, { verify, sanity });
