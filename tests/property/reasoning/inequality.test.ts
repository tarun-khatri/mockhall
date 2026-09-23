import { describe, expect, it } from 'vitest';
import { describeGenerator } from '../../helpers/harness';
import { generator, type InequalityFacts } from '../../../src/content/generators/reasoning/inequality';
import { verify, verifyInequality } from '../../../src/content/verify/reasoning/inequality';
import { Closure, linksOf, pairVerdict, type Chain, type Conclusion, type Rel } from '../../../src/content/generators/solver/inequality';
import type { GenResult } from '../../../src/content/generators/types';

function sanity(res: GenResult<InequalityFacts>): string[] {
  const p: string[] = [];
  const f = res.facts;
  const letters = new Set<string>();
  const chains = f.form === 'which-expression' ? (f.candidates ?? []) : f.statements;
  for (const s of chains) {
    if (s.vars.length !== s.ops.length + 1) p.push('statement shape');
    if (new Set(s.vars).size !== s.vars.length) p.push(`repeated letter in ${s.vars.join('')}`);
    s.vars.forEach((v) => letters.add(v));
  }
  for (const v of letters) if (/[IOVX]/.test(v)) p.push(`confusing letter ${v}`);
  if (letters.size > 9) p.push(`too many letters: ${letters.size}`);
  for (const c of f.conclusions) {
    if (!letters.has(c.a) || !letters.has(c.b)) p.push(`conclusion letter not in statements: ${c.a} ${c.op} ${c.b}`);
    if (c.a === c.b) p.push('conclusion compares a letter with itself');
  }
  if (f.form === 'conclusions') {
    if (f.conclusions.length !== 2) p.push('need two conclusions');
    const [a, b] = f.conclusions;
    if (a && b && a.a === b.a && a.b === b.b && a.op === b.op) p.push('identical conclusions');
    if (!/Conclusions:/.test(res.item.questions[0].prompt)) p.push('prompt lacks conclusions');
  }
  if (f.codes && new Set(f.codes.map((c) => c.symbol)).size !== 5) p.push('codes not distinct');
  const q = res.item.questions[0];
  if (q.solution.visual?.type !== 'chain') p.push('missing chain visual');
  else {
    for (const line of q.solution.visual.lines) {
      for (const [s, e] of line.highlight ?? []) if (s < 0 || e > line.text.length || s >= e) p.push(`bad highlight ${s}-${e} in "${line.text}"`);
    }
  }
  return p;
}

describeGenerator(generator, { verify, sanity });

const L = (vars: string, rels: Rel[]): Chain => ({ vars: vars.split(''), rels });
const C = (a: string, rel: Rel, b: string): Conclusion => ({ a, rel, b });

describe('inequality engine — hand-checked cases', () => {
  // P > Q ≥ R = S < T
  const chain = [L('PQRST', ['>', '≥', '=', '<'])];
  const links = linksOf(chain);
  const cl = new Closure(links);

  it('closure: strict and non-strict implications', () => {
    expect(cl.holds(C('P', '>', 'S'))).toBe(true);
    expect(cl.holds(C('Q', '≥', 'S'))).toBe(true);
    expect(cl.holds(C('Q', '>', 'S'))).toBe(false);
    expect(cl.holds(C('R', '=', 'S'))).toBe(true);
    expect(cl.holds(C('T', '>', 'R'))).toBe(true);
    expect(cl.known('P', 'T')).toBe(null);
    expect(cl.known('Q', 'T')).toBe(null);
    expect(cl.known('S', 'P')).toBe('<');
  });

  const cases: [string, Conclusion, Conclusion, number][] = [
    ['only I', C('P', '>', 'R'), C('Q', '>', 'R'), 0],
    ['only II', C('P', '<', 'T'), C('T', '>', 'R'), 1],
    ['neither: T and Q both sit above R (no relation)', C('T', '>', 'Q'), C('P', '<', 'T'), 3],
    ['either: > / = with ≥ known', C('Q', '>', 'S'), C('Q', '=', 'S'), 2],
    ['either: ≥ / < with nothing known', C('P', '≥', 'T'), C('P', '<', 'T'), 2],
    ['either: > / ≤ with nothing known', C('T', '>', 'P'), C('T', '≤', 'P'), 2],
    ['either written the other way round', C('Q', '>', 'S'), C('S', '=', 'Q'), 2],
    ['neither: > / = with nothing known (not exhaustive)', C('P', '>', 'T'), C('P', '=', 'T'), 3],
    ['neither: > / < with ≥ known (equality left out)', C('Q', '>', 'S'), C('Q', '<', 'S'), 3],
    ['neither: different pairs', C('P', '>', 'T'), C('Q', '>', 'S'), 3],
    ['both', C('P', '>', 'S'), C('T', '>', 'S'), 4],
    ['ambiguous: ≥ / ≤ overlap', C('P', '≥', 'T'), C('P', '≤', 'T'), -1],
  ];
  for (const [name, c1, c2, want] of cases) {
    it(`pair verdict — ${name}`, () => {
      expect(pairVerdict(links, c1, c2)).toBe(want);
      const facts: InequalityFacts = {
        form: 'conclusions',
        statements: chain.map((c) => ({ vars: c.vars, ops: c.rels })),
        conclusions: [c1, c2].map((c) => ({ a: c.a, op: c.rel, b: c.b })),
      };
      expect(verifyInequality(facts)).toBe(want);
    });
  }

  it('combined statements join at the common letter', () => {
    // A ≥ B > C, D < C ≤ E, E = F
    const chains = [L('ABC', ['≥', '>']), L('DCE', ['<', '≤']), L('EF', ['='])];
    const lk = linksOf(chains);
    expect(pairVerdict(lk, C('A', '>', 'D'), C('F', '≥', 'C'))).toBe(4);
    expect(pairVerdict(lk, C('A', '>', 'E'), C('A', '≤', 'E'))).toBe(2);
    expect(pairVerdict(lk, C('B', '>', 'F'), C('D', '<', 'B'))).toBe(1);
  });

  it('coded symbols decode before solving (verifier path)', () => {
    // @ '>', # '≥', % '=', & '≤', © '<'
    const codes = [
      { symbol: '@', rel: '>' as Rel },
      { symbol: '#', rel: '≥' as Rel },
      { symbol: '%', rel: '=' as Rel },
      { symbol: '&', rel: '≤' as Rel },
      { symbol: '©', rel: '<' as Rel },
    ];
    // K @ L, L # M, M % N, N © R  →  K > L ≥ M = N < R
    const facts: InequalityFacts = {
      form: 'conclusions',
      codes,
      statements: [
        { vars: ['K', 'L'], ops: ['@'] },
        { vars: ['L', 'M'], ops: ['#'] },
        { vars: ['M', 'N'], ops: ['%'] },
        { vars: ['N', 'R'], ops: ['©'] },
      ],
      conclusions: [
        { a: 'K', op: '@', b: 'N' }, // K > N true
        { a: 'R', op: '#', b: 'K' }, // R ≥ K undetermined
      ],
    };
    expect(verifyInequality(facts)).toBe(0);
    facts.conclusions = [
      { a: 'L', op: '@', b: 'N' }, // L > N  (L ≥ N known)
      { a: 'L', op: '%', b: 'N' }, // L = N
    ];
    expect(verifyInequality(facts)).toBe(2);
  });

  it('either-or appears in at least 10% of pair questions', () => {
    for (const st of ['direct', 'combined', 'coded', 'either-or']) {
      let either = 0;
      const n = 200;
      for (let i = 0; i < n; i++) {
        const res = generator.build(`share${i}`, 'medium', st);
        if (res.item.questions[0].answerIndex === 2) either++;
      }
      expect(either / n, st).toBeGreaterThanOrEqual(0.1);
    }
  });
});
