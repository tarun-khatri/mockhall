import { describeGenerator } from '../../helpers/harness';
import { generator, type DIFacts } from '../../../src/content/generators/quant/data-interpretation';
import { verify } from '../../../src/content/verify/quant/data-interpretation';
import type { GenResult } from '../../../src/content/generators/types';

function sanity(res: GenResult<DIFacts>): string[] {
  const out: string[] = [];
  const set = res.item.set;
  if (!set) return ['DI item must be a set'];
  const nq = res.item.questions.length;
  if (set.kind === 'caselet' ? nq !== 3 : nq !== 5) out.push(`${set.kind} set has ${nq} questions`);
  if (!set.title) out.push('set title missing');
  const chart = set.chart;
  if (chart) {
    if (chart.type === 'pie') {
      if (chart.slices.length > 6) out.push('more than 6 slices');
      const sum = chart.slices.reduce((a, s) => a + s.value, 0);
      if (sum !== (chart.valueKind === 'percent' ? 100 : 360)) out.push(`pie values add up to ${sum}`);
      if (!chart.note?.startsWith('Total =')) out.push('pie note must give the total');
      for (const s of chart.slices) if (s.label.length > 10) out.push(`long label ${s.label}`);
    } else {
      if (chart.categories.length > 6) out.push('more than 6 categories');
      if (chart.series.length > 3) out.push('more than 3 series');
      for (const l of [...chart.categories, ...chart.series.map((s) => s.name)]) if (l.length > 10) out.push(`label longer than 10 chars: ${l}`);
      for (const s of chart.series) for (const v of s.values) if (!(v > 0) || v > 9999 || !Number.isInteger(v)) out.push(`bad chart value ${v}`);
    }
  }
  if (set.table) {
    for (const row of set.table.rows) {
      if (row.length !== set.table.columns.length) out.push('ragged table row');
      for (const c of row.slice(1)) if (typeof c === 'number' && (!(c > 0) || c > 99999)) out.push(`bad table value ${c}`);
    }
    if (set.table.rows.length > 6) out.push('more than 6 table rows');
  }
  for (const q of res.item.questions) {
    if (q.options.some((o) => o.startsWith('-'))) out.push(`negative option ${JSON.stringify(q.options)}`);
    if (!q.solution.shortcut || !q.solution.trap) out.push('missing shortcut or trap');
    if (q.prompt.length > 420) out.push('prompt too long');
  }
  return out;
}

describeGenerator(generator, { verify, sanity });
