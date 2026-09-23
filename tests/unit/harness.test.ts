import { describe, expect, it } from 'vitest';
import { describeGenerator } from '../helpers/harness';
import { exampleGenerator, verifyExample } from '../helpers/example-generator';
import { makeRng } from '../../src/lib/rng';
import { numericChoices } from '../../src/content/generators/shared/options';
import { indian, inr, fracTex, mixedTex, ordinal, clock } from '../../src/lib/format';
import { normaliseOption, parseRich, plainText } from '../../src/content/rich';

describeGenerator(exampleGenerator, { verify: verifyExample, seeds: 200 });

describe('rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = makeRng('x');
    const b = makeRng('x');
    const c = makeRng('y');
    const sa = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(sa);
  });
  it('int stays in range', () => {
    const r = makeRng('range');
    for (let i = 0; i < 2000; i++) {
      const v = r.int(-3, 7);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
});

describe('numericChoices', () => {
  it('places the answer uniformly and keeps options sorted', () => {
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < 2000; i++) {
      const rng = makeRng(`nc${i}`);
      const c = numericChoices(rng, 240, { format: (n) => inr(n), mistakes: [{ value: 300, why: 'x' }, { value: 200, why: 'y' }] });
      expect(c.values).toEqual([...c.values].sort((x, y) => x - y));
      expect(c.options[c.answerIndex]).toBe('₹240');
      counts[c.answerIndex]++;
    }
    for (const n of counts) expect(n / 2000).toBeGreaterThan(0.15);
  });
  it('respects a minimum gap for approximation', () => {
    for (let i = 0; i < 300; i++) {
      const c = numericChoices(makeRng(`gap${i}`), 480, { format: (n) => String(n), minGap: 0.08 });
      const v = c.values;
      for (let j = 1; j < v.length; j++) expect((v[j] - v[j - 1]) / v[j]).toBeGreaterThanOrEqual(0.08 - 1e-9);
    }
  });
});

describe('format', () => {
  it('uses Indian digit grouping', () => {
    expect(indian(120000)).toBe('1,20,000');
    expect(indian(1234567.5)).toBe('12,34,567.5');
    expect(inr(999)).toBe('₹999');
    expect(indian(1.005, 2)).toBe('1.01');
  });
  it('formats fractions and ordinals', () => {
    expect(fracTex(6, 8)).toBe('$\\frac{3}{4}$');
    expect(mixedTex(11, 4)).toBe('$2\\frac{3}{4}$');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(22)).toBe('22nd');
    expect(clock(1234)).toBe('20:34');
  });
});

describe('rich', () => {
  it('parses bold, italic, math, escapes and lists', () => {
    const blocks = parseRich('A **bold** and *it* with $\\frac{1}{2}$ and \\$5\n\n- one\n- two');
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toEqual({ t: 'ul', items: [[{ t: 'text', v: 'one' }], [{ t: 'text', v: 'two' }]] });
    expect(plainText('A **bold** and *it*')).toBe('A bold and it');
  });
  it('normalises numeric options', () => {
    expect(normaliseOption('₹1,20,000')).toBe(normaliseOption('120000'));
    expect(normaliseOption('12%')).not.toBe(normaliseOption('12'));
    expect(normaliseOption(' Only I ')).toBe('only i');
  });
});
