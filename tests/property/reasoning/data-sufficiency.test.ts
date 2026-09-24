import { describe, expect, it } from 'vitest';
import { describeGenerator } from '../../helpers/harness';
import { generator, DS_OPTIONS, type DataSufficiencyFacts } from '../../../src/content/generators/reasoning/data-sufficiency';
import { answerSet, verify, verifyDs } from '../../../src/content/verify/reasoning/data-sufficiency';
import type { GenResult } from '../../../src/content/generators/types';

function sanity(res: GenResult<DataSufficiencyFacts>): string[] {
  const p: string[] = [];
  const f = res.facts;
  const q = res.item.questions[0];
  if (JSON.stringify(q.options) !== JSON.stringify(DS_OPTIONS)) p.push('options not in the standard order');
  if (!f.I.length || !f.II.length) p.push('empty statement');
  if (f.I.length > 3 || f.II.length > 3) p.push('statement too long');
  if (!/\*\*I\.\*\*/.test(q.prompt) || !/\*\*II\.\*\*/.test(q.prompt)) p.push('statements not shown');
  // statements must be consistent with each other and must not answer "for free" from the stem alone
  const base = answerSet(f, []);
  if (base.size < 2) p.push('stem alone answers the question');
  if (f.kind === 'family' && (f.people.length < 5 || f.people.length > 6)) p.push('family size');
  if (f.kind === 'direction') for (const c of [...f.I, ...f.II]) if (c.t === 'exact' && (c.d < 1 || c.d > 30)) p.push(`distance ${c.d}`);
  const names = f.kind === 'coding' ? [] : f.kind === 'direction' ? f.points : f.people;
  if (names.includes('I')) p.push('letter I used as a name (clashes with statement I)');
  return p;
}

describeGenerator(generator, { verify, sanity });

describe('data sufficiency — hand-checked cases', () => {
  it('ranking: I alone fixes the tallest, II does not', () => {
    const f: DataSufficiencyFacts = {
      kind: 'ranking',
      attr: 'height',
      people: ['P', 'Q', 'R', 'S'],
      I: [{ t: 'rank', a: 'R', k: 1, from: 'top' }],
      II: [{ t: 'gt', a: 'P', b: 'Q' }],
      ask: { t: 'who', k: 1, from: 'top' },
    };
    expect(verifyDs(f)).toBe(0);
  });
  it('blood relation: gender missing → both needed', () => {
    // How is M related to N? I. M is a parent of N.  II. M is male.
    const f: DataSufficiencyFacts = {
      kind: 'family',
      people: ['M', 'N', 'P', 'Q', 'R'],
      couples: 2,
      threeGen: true,
      I: [{ t: 'rel', a: 'M', b: 'N', w: 'parent' }],
      II: [{ t: 'gender', a: 'M', g: 'm' }],
      ask: { a: 'M', b: 'N' },
    };
    expect(verifyDs(f)).toBe(3);
  });
  it('direction: exact chain vs due-north without distance', () => {
    const f: DataSufficiencyFacts = {
      kind: 'direction',
      points: ['P', 'Q', 'R'],
      I: [
        { t: 'exact', a: 'P', b: 'R', d: 5, dir: 'N' },
        { t: 'exact', a: 'R', b: 'Q', d: 3, dir: 'E' },
      ],
      II: [{ t: 'line', a: 'P', b: 'R', dir: 'N' }],
      ask: { t: 'dist', a: 'P', b: 'Q' },
    };
    // I gives √34; II gives the direction only
    expect(verifyDs(f)).toBe(0);
    const g: DataSufficiencyFacts = { ...f, II: [{ t: 'line', a: 'R', b: 'Q', dir: 'E' }], ask: { t: 'dir', a: 'P', b: 'Q' } };
    expect(verifyDs(g)).toBe(0); // II alone does not reach P
    const k: DataSufficiencyFacts = { ...f, I: [{ t: 'line', a: 'P', b: 'R', dir: 'N' }], II: [{ t: 'line', a: 'R', b: 'Q', dir: 'E' }], ask: { t: 'dir', a: 'P', b: 'Q' } };
    expect(verifyDs(k)).toBe(3); // north-east only when combined
    expect(verifyDs({ ...k, ask: { t: 'dist', a: 'P', b: 'Q' } })).toBe(4); // lengths unknown
    const h: DataSufficiencyFacts = {
      ...f,
      I: [{ t: 'exact', a: 'P', b: 'Q', d: 4, dir: 'W' }],
      II: [{ t: 'line', a: 'Q', b: 'P', dir: 'E' }],
      ask: { t: 'dir', a: 'P', b: 'Q' },
    };
    expect(verifyDs(h)).toBe(2);
  });
  it('coding: common word elimination', () => {
    const f: DataSufficiencyFacts = {
      kind: 'coding',
      I: [
        { words: ['sky', 'is', 'blue'], codes: ['ka', 'la', 'ta'] },
        { words: ['blue', 'is', 'good'], codes: ['la', 'pa', 'ta'] },
      ],
      II: [{ words: ['sky', 'tea'], codes: ['ni', 'ka'] }],
      ask: { t: 'code', word: 'sky' },
    };
    // I: sky ∈ {ka}; II: sky ∈ {ni, ka} → I alone
    expect(verifyDs(f)).toBe(0);
  });
  it('seating: circular right is anticlockwise', () => {
    const f: DataSufficiencyFacts = {
      kind: 'seating',
      layout: 'circular',
      people: ['A', 'B', 'C', 'D'],
      I: [
        { t: 'rel', a: 'B', b: 'A', k: 1, side: 'right' },
        { t: 'opp', a: 'C', b: 'A' },
      ],
      II: [{ t: 'adj', a: 'D', b: 'A' }],
      ask: { t: 'rel', of: 'A', k: 1, side: 'left' },
    };
    // I: B right of A, C opposite A → D left of A. II: D next to A → left or right
    expect(verifyDs(f)).toBe(0);
  });
});
