import { describe, expect, it } from 'vitest';
import { describeGenerator } from '../../helpers/harness';
import { generator, type ClassificationFacts } from '../../../src/content/generators/reasoning/classification';
import { verify } from '../../../src/content/verify/reasoning/classification';
import type { GenResult } from '../../../src/content/generators/types';

function sanity(res: GenResult<ClassificationFacts>): string[] {
  const p: string[] = [];
  const f = res.facts;
  const q = res.item.questions[0];
  if (f.kind === 'letters') {
    const gs = f.letters ?? [];
    if (gs.length !== 5) p.push('need five letter groups');
    for (const g of gs) {
      if (!/^[A-Z]{2,4}$/.test(g)) p.push(`bad letter group ${g}`);
      if (new Set(g).size !== g.length) p.push(`repeated letter in ${g}`);
    }
    if (new Set(gs.map((g) => g.length)).size !== 1) p.push('letter groups differ in length');
  } else if (f.kind === 'numbers') {
    const ns = f.numbers ?? [];
    if (ns.length !== 5) p.push('need five numbers');
    for (const n of ns) if (!Number.isInteger(n) || n <= 0 || n > 9999) p.push(`number out of range ${n}`);
  } else {
    const ps = f.pairs ?? [];
    if (ps.length !== 5) p.push('need five pairs');
    for (const [a, b] of ps) if (!(a > 0 && b > 0 && b < 5000)) p.push(`pair out of range ${a}:${b}`);
  }
  if (!/Four of the following five are alike/.test(q.prompt)) p.push('prompt wording');
  return p;
}

describeGenerator(generator, { verify, sanity });

describe('classification verifier — hand-checked', () => {
  const mk = (facts: ClassificationFacts, options: string[]) =>
    ({ facts, item: { questions: [{ options }] } }) as unknown as GenResult<ClassificationFacts>;
  it('finds the non-prime among primes (91 = 7 × 13)', () => {
    const o = ['53', '91', '59', '67', '71'];
    expect(verify(mk({ kind: 'numbers', family: 'prime', numbers: o.map(Number) }, o))).toEqual(['91']);
  });
  it('finds the broken gap pattern', () => {
    const o = ['BDF', 'HJL', 'KMP', 'PRT', 'VXZ'];
    expect(verify(mk({ kind: 'letters', family: 'gap-pattern', letters: o }, o))).toEqual(['KMP']);
    // …while UWY would add a second odd one (the only group with a vowel) and must be rejected
    const amb = ['BDF', 'HJL', 'KMP', 'PRT', 'UWY'];
    expect(amb).not.toContain(verify(mk({ kind: 'letters', family: 'gap-pattern', letters: amb }, amb))[0]);
  });
  it('finds the pair that is not opposite letters', () => {
    const o = ['AZ', 'CX', 'GT', 'KQ', 'EV'];
    expect(verify(mk({ kind: 'letters', family: 'opposite-pair', letters: o }, o))).toEqual(['KQ']);
  });
  it('rejects a set with two competing odd ones', () => {
    // 15 is the only odd number, but 16 is the only perfect square: two different odd ones
    const o = ['12', '14', '16', '18', '15'];
    expect(o).not.toContain(verify(mk({ kind: 'numbers', family: 'square', numbers: o.map(Number) }, o))[0]);
  });
});
