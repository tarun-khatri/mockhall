/**
 * Hand-checked classic syllogism cases (SPEC 7.6 / 14.3), incl. "only a few" and possibility.
 * Every case runs through BOTH the region-enumeration engine and the independent verifier model.
 */
import { describe, expect, it } from 'vitest';
import { SyllogismEngine, type Concl, type Prop, type Quant } from '../../../src/content/generators/solver/syllogism';
import { sylFollows, sylPairAnswer } from '../../../src/content/verify/reasoning/syllogism';

const LETTER = 'ABCD';

function parseProp(src: string): Concl {
  let s = src.trim();
  const possibility = /\(possibility\)$/.test(s);
  s = s.replace(/\s*\(possibility\)$/, '');
  const m =
    s.match(/^All ([A-D]) are ([A-D])$/) ??
    s.match(/^Some ([A-D]) are not ([A-D])$/) ??
    s.match(/^Some ([A-D]) are ([A-D])$/) ??
    s.match(/^No ([A-D]) is ([A-D])$/) ??
    s.match(/^Only a few ([A-D]) are ([A-D])$/);
  if (!m) throw new Error(`cannot parse "${src}"`);
  const q: Quant = s.startsWith('All')
    ? 'all'
    : s.startsWith('No ')
      ? 'no'
      : s.startsWith('Only')
        ? 'only-a-few'
        : / are not /.test(s)
          ? 'some-not'
          : 'some';
  return { q, a: LETTER.indexOf(m[1]), b: LETTER.indexOf(m[2]), ...(possibility ? { possibility: true } : {}) };
}

function setup(statements: string) {
  const stmts: Prop[] = statements.split(';').map(parseProp);
  const n = Math.max(...stmts.flatMap((s) => [s.a, s.b])) + 1;
  return { stmts, n: Math.max(n, 2) };
}

// [statements, conclusion, follows?] — each checked by hand
const CASES: [string, string, boolean][] = [
  ['All A are B; All B are C', 'All A are C', true],
  ['All A are B; All B are C', 'Some C are A', true],
  ['All A are B; All B are C', 'All C are A', false],
  ['All A are B; All B are C', 'All C are A (possibility)', true],
  ['All A are B; Some B are C', 'Some A are C', false],
  ['All A are B; Some B are C', 'Some A are C (possibility)', true],
  ['All A are B; Some B are C', 'All A are C (possibility)', true],
  ['Some A are B; All B are C', 'Some A are C', true],
  ['Some A are B; All B are C', 'Some C are A', true],
  ['Some A are B; All B are C', 'All A are C', false],
  ['All A are B; No B is C', 'No A is C', true],
  ['All A are B; No B is C', 'Some A are C (possibility)', false],
  ['Some A are B; No B is C', 'Some A are not C', true],
  ['Some A are B; No B is C', 'No A is C', false],
  ['Some A are B; No B is C', 'All A are C (possibility)', false],
  ['No A is B; All B are C', 'No A is C', false],
  ['No A is B; All B are C', 'Some C are not A', true],
  ['No A is B; All B are C', 'Some A are not C', false],
  ['No A is B; All B are C', 'All A are C (possibility)', true],
  ['No A is B; Some B are C', 'Some C are not A', true],
  ['No A is B; Some B are C', 'No A is C', false],
  ['Some A are B; Some B are C', 'Some A are C', false],
  ['Some A are B; Some B are C', 'No A is C', false],
  ['All A are B', 'All B are A', false],
  ['All A are B', 'All B are A (possibility)', true],
  ['All A are B', 'Some B are A', true],
  ['All A are B', 'Some B are not A', false],
  ['All A are B', 'Some B are not A (possibility)', true],
  ['Only a few A are B', 'Some A are B', true],
  ['Only a few A are B', 'Some A are not B', true],
  ['Only a few A are B', 'All A are B (possibility)', false],
  ['Only a few A are B', 'All B are A (possibility)', true],
  ['Only a few A are B', 'Some B are A', true],
  ['Only a few A are B', 'Only a few B are A', false],
  ['Only a few A are B; All B are C', 'Some A are C', true],
  ['Only a few A are B; All B are C', 'All A are C (possibility)', true],
  ['Only a few A are B; All B are C', 'Only a few A are C', false],
  ['Only a few A are B; No B is C', 'Some A are not C', true],
  ['Only a few A are B; No B is C', 'All A are C (possibility)', false],
  ['Only a few A are B; No B is C', 'No A is C', false],
  ['All A are B; Only a few B are C', 'Some A are C', false],
  ['All A are B; Only a few B are C', 'All A are C (possibility)', true],
  ['All A are B; Only a few B are C', 'All B are C (possibility)', false],
  ['All A are B; Some B are not C', 'Some A are not C', false],
  ['Some A are not B', 'Some B are not A', false],
  ['Some A are not B; All C are B', 'Some A are not C', true],
  ['No A is B; No B is C', 'No A is C', false],
  ['No A is B; No B is C', 'Some A are C', false],
  ['All A are B; All C are B', 'Some A are C', false],
  ['All A are B; Some A are not C', 'Some B are not C', true],
  ['All A are B; No C is B', 'No A is C', true],
  ['All A are B; All B are C; All C are D', 'All A are D', true],
  ['Some A are B; All B are C; No C is D', 'Some A are not D', true],
  ['All A are B; Some B are C; No C is D', 'Some B are not D', true],
  ['All A are B; Some B are C; No C is D', 'No A is D', false],
  ['All A are B; No B is C; Some C are D', 'Some D are not A', true],
  ['Some A are B; All B are C', 'Some C are not A (possibility)', true],
  ['All A are B; All B are C', 'Some C are not A (possibility)', true],
  ['No A is B', 'All A are B (possibility)', false],
  ['No A is B', 'Some A are not B', true],
];

// [statements, conclusion I, conclusion II, answer] — 0 only I, 1 only II, 2 either, 3 neither, 4 both, −1 ambiguous
const PAIRS: [string, string, string, number][] = [
  ['Some A are B; Some B are C', 'Some A are C', 'No A is C', 2],
  ['Some A are B; Some B are C', 'Some A are C', 'No C is A', 2],
  ['No A is B; No B is C', 'Some A are C', 'No A is C', 2],
  ['All A are B; All C are B', 'No A is C', 'Some A are C', 2],
  ['Some A are C; All C are B', 'All A are B', 'Some A are not B', 2],
  ['All A are B; Some B are C', 'Some A are C', 'Some A are not C', -1],
  ['All A are B; Some B are C', 'Some A are C', 'All A are C (possibility)', 1],
  ['Some A are B; All B are C', 'Some A are C', 'Some C are A', 4],
  ['All A are B; No B is C', 'No A is C', 'Some A are C', 0],
  ['Some A are B; Some B are C', 'Some A are C', 'All A are C (possibility)', 1],
  ['All A are B; Some B are C', 'All A are C', 'Some C are not B', 3],
  ['All A are B', 'All B are A', 'Some B are not A', 2],
  ['All A are B', 'All A are B (possibility)', 'Some B are A', -1],
];

describe('syllogism classic cases (engine + independent model)', () => {
  it('has at least 40 hand-checked single-conclusion cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(40);
    expect(CASES.some(([s]) => /Only a few/.test(s))).toBe(true);
    expect(CASES.some(([, c]) => /possibility/.test(c))).toBe(true);
  });

  for (const [stmts, concl, want] of CASES) {
    it(`${stmts} ⇒ ${concl}: ${want ? 'follows' : 'does not follow'}`, () => {
      const { stmts: ss, n: n0 } = setup(stmts);
      const c = parseProp(concl);
      const n = Math.max(n0, c.a + 1, c.b + 1);
      const eng = new SyllogismEngine(n, ss);
      expect(eng.follows(c), 'engine').toBe(want);
      expect(sylFollows(n, ss, c), 'verifier model').toBe(want);
    });
  }

  for (const [stmts, c1s, c2s, want] of PAIRS) {
    it(`${stmts} | I: ${c1s} | II: ${c2s} → ${want}`, () => {
      const { stmts: ss, n: n0 } = setup(stmts);
      const c1 = parseProp(c1s);
      const c2 = parseProp(c2s);
      const n = Math.max(n0, c1.a + 1, c1.b + 1, c2.a + 1, c2.b + 1);
      const eng = new SyllogismEngine(n, ss);
      expect(eng.pairVerdict(c1, c2), 'engine').toBe(want);
      expect(sylPairAnswer(n, ss, c1, c2), 'verifier model').toBe(want);
    });
  }

  it('four sets enumerate 32,768 region subsets', () => {
    // no statements: every world with all four sets non-empty survives
    const eng = new SyllogismEngine(4, []);
    let expected = 0;
    for (let w = 1; w < 1 << 15; w++) {
      let ok = true;
      for (let s = 0; s < 4; s++) {
        let m = 0;
        for (let r = 1; r < 16; r++) if (r & (1 << s)) m |= 1 << (r - 1);
        if (!(w & m)) ok = false;
      }
      if (ok) expected++;
    }
    expect(eng.worlds.length).toBe(expected);
  });
});
