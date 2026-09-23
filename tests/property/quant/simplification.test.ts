import { describeGenerator } from '../../helpers/harness';
import { generator, type SimplificationFacts } from '../../../src/content/generators/quant/simplification';
import { verify } from '../../../src/content/verify/quant/simplification';
import type { GenResult } from '../../../src/content/generators/types';
import { mathSegments } from '../../../src/content/rich';

/** Numeric value of an option: "267", "12.5", "$3\frac{3}{4}$", "$\frac{7}{12}$". */
function optionValue(o: string): number {
  const s = o.replace(/\$/g, '');
  const mixed = s.match(/^(\d+)\\frac\{(\d+)\}\{(\d+)\}$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fr = s.match(/^\\frac\{(\d+)\}\{(\d+)\}$/);
  if (fr) return Number(fr[1]) / Number(fr[2]);
  return Number(s);
}

function sanity(res: GenResult<SimplificationFacts>): string[] {
  const out: string[] = [];
  const q = res.item.questions[0];
  const segs = mathSegments(q.prompt);
  const tex = segs[segs.length - 1] ?? '';
  if (segs.length !== 1) out.push(`prompt should hold exactly one equation, found ${segs.length}`);
  if (tex.length > 200) out.push(`equation too long for a phone screen (${tex.length} chars)`);
  for (const m of tex.matchAll(/\d+(?:\.\d+)?/g)) {
    const [int, frac = ''] = m[0].split('.');
    if (int.length > 5) out.push(`huge number ${m[0]}`);
    if (frac.length > 2) out.push(`too many decimals in ${m[0]}`);
  }
  const vals = q.options.map(optionValue);
  if (vals.some((v) => !Number.isFinite(v))) out.push(`unreadable option ${JSON.stringify(q.options)}`);
  if (vals.some((v) => v <= 0)) out.push(`non-positive option ${JSON.stringify(q.options)}`);
  for (let i = 1; i < vals.length; i++) if (!(vals[i] > vals[i - 1])) out.push(`options not ascending ${JSON.stringify(q.options)}`);
  if (vals[q.answerIndex] > 99999) out.push(`answer too large ${vals[q.answerIndex]}`);
  if (res.facts.mode === 'approx') {
    for (let i = 1; i < vals.length; i++) {
      if ((vals[i] - vals[i - 1]) / vals[i] < 0.08 - 1e-9) out.push(`approximation options closer than 8%: ${JSON.stringify(q.options)}`);
    }
    if (!q.prompt.includes('approximate')) out.push('approximation prompt wording');
  } else if (q.prompt.includes('approximate')) out.push('exact question uses approximation wording');
  if (q.solution.steps.length > 14) out.push(`too many steps (${q.solution.steps.length})`);
  if (!q.solution.shortcut || !q.solution.trap) out.push('missing shortcut or trap');
  return out;
}

describeGenerator(generator, { verify, sanity });
