import { describe, expect, it } from 'vitest';
import { describeGenerator } from '../../helpers/harness';
import { generator, type CodingFacts } from '../../../src/content/generators/reasoning/coding-decoding';
import { verify } from '../../../src/content/verify/reasoning/coding-decoding';
import type { GenResult } from '../../../src/content/generators/types';

function sanity(res: GenResult<CodingFacts>): string[] {
  const p: string[] = [];
  const f = res.facts;
  const qs = res.item.questions;
  if (f.kind === 'letter' || f.kind === 'number') {
    const ex = f.examples ?? [];
    if (!ex.length || ex.length > 2) p.push(`examples: ${ex.length}`);
    if (!f.query || ex.some((e) => e.word === f.query)) p.push('query repeats an example word');
    for (const e of ex) {
      if (!/^[A-Z]+$/.test(e.word)) p.push(`bad word ${e.word}`);
      if (f.kind === 'letter' && (e.code.length !== e.word.length || !/^[A-Z]+$/.test(e.code))) p.push(`bad letter code ${e.code}`);
      if (f.kind === 'number' && !/^\d+$/.test(e.code)) p.push(`bad number code ${e.code}`);
      if (e.code === e.word) p.push('code equals word');
    }
    if (f.kind === 'letter') for (const o of qs[0].options) if (o.length !== (f.query ?? '').length) p.push(`option length ${o}`);
  }
  if (f.kind === 'in-place') {
    const w = f.word ?? '';
    if (new Set(w).size !== w.length) p.push(`repeated letters in ${w}`);
    if (w.length < 5 || w.length > 9) p.push(`word length ${w.length}`);
  }
  if (f.kind === 'sentence') {
    const set = res.item.set;
    if (!set) p.push('sentence coding must be a set');
    else if (set.kind !== 'coding') p.push(`set kind ${set.kind}`);
    const n = qs.length;
    if (n !== 5) p.push(`set has ${n} questions`);
    const ss = f.sentences ?? [];
    for (const s of ss) {
      if (s.words.length !== s.codes.length) p.push('statement words/codes mismatch');
      if (new Set(s.words).size !== s.words.length) p.push('repeated word in a statement');
    }
    const prompts = new Set(qs.map((q) => q.prompt));
    if (prompts.size !== qs.length) p.push('repeated prompt in set');
  }
  return p;
}

describeGenerator(generator, { verify, sanity });

describe('coding-decoding set target', () => {
  it('sentence-coding sets have 5 questions and target 5 × short-reasoning', () => {
    const per = { easy: 20, medium: 30, hard: 45, extreme: 65 } as const;
    for (const d of ['easy', 'medium', 'hard', 'extreme'] as const) {
      const res = generator.build('t1', d, 'sentence-coding');
      expect(res.item.questions.length).toBe(5);
      expect(res.item.set?.targetSeconds).toBe(5 * per[d]);
    }
  });
});
