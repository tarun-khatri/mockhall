import { describeGenerator } from '../../helpers/harness';
import { generator, type SeriesPatternFacts } from '../../../src/content/generators/reasoning/series-pattern';
import { verify } from '../../../src/content/verify/reasoning/series-pattern';
import type { GenResult } from '../../../src/content/generators/types';

function sanity(res: GenResult<SeriesPatternFacts>): string[] {
  const p: string[] = [];
  const f = res.facts;
  const qs = res.item.questions;
  switch (f.kind) {
    case 'alphanumeric-set': {
      if (qs.length !== 5) p.push(`alphanumeric set has ${qs.length} questions`);
      if (f.elements.length < 20 || f.elements.length > 40) p.push(`arrangement length ${f.elements.length}`);
      const letters = f.elements.filter((e) => /^[A-Z]$/.test(e));
      if (new Set(letters).size !== letters.length) p.push('repeated letter in arrangement');
      if (!f.elements.every((e) => e.length === 1)) p.push('multi-character element');
      if (!res.item.set || res.item.set.kind !== 'series') p.push('not a series set');
      break;
    }
    case 'number-set':
      if (qs.length !== 3) p.push(`number set has ${qs.length} questions`);
      if (f.numbers.length !== 5 || f.numbers.some((n) => n < 111 || n > 999 || String(n).includes('0'))) p.push(`bad numbers ${f.numbers}`);
      break;
    case 'word-rearrange':
    case 'letter-pairs':
      if (!/^[A-Z]{6,14}$/.test(f.word)) p.push(`bad word ${f.word}`);
      break;
    case 'meaningful-word': {
      const letters = f.form === 'count-letters' ? f.letters : f.positions.map((x) => f.host[x - 1]);
      if (letters.length < 4 || letters.length > 6) p.push(`letter set size ${letters.length}`);
      if (f.form !== 'count-letters' && new Set(f.positions).size !== f.positions.length) p.push('repeated position');
      break;
    }
  }
  for (const q of qs) {
    if (q.targetSeconds < 15 || q.targetSeconds > 70) p.push(`targetSeconds ${q.targetSeconds}`);
  }
  return p;
}

describeGenerator(generator, { verify, sanity });
