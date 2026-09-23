import { describe, expect, it } from 'vitest';
import { describeGenerator } from '../../helpers/harness';
import { generator, type BloodRelationFacts } from '../../../src/content/generators/reasoning/blood-relation';
import { verify } from '../../../src/content/verify/reasoning/blood-relation';
import type { GenResult } from '../../../src/content/generators/types';

const CBD = 'Cannot be determined';

function sanity(res: GenResult<BloodRelationFacts>): string[] {
  const p: string[] = [];
  const f = res.facts;
  const qs = res.item.questions;
  if (f.kind === 'family-puzzle') {
    if (qs.length !== 3) p.push(`family puzzle has ${qs.length} questions`);
    if (f.members.length < 5 || f.members.length > 8) p.push(`${f.members.length} members`);
    if (!res.item.set || res.item.set.kind !== 'puzzle') p.push('not a puzzle set');
  }
  if (f.kind === 'direct' && (f.stmts.length < 2 || f.stmts.length > 5)) p.push(`${f.stmts.length} statements`);
  for (const q of qs) {
    // CBD, when offered, is always option E
    const i = q.options.indexOf(CBD);
    if (i >= 0 && i !== 4) p.push('"Cannot be determined" not at E');
    if (q.targetSeconds < 15 || q.targetSeconds > 70) p.push(`targetSeconds ${q.targetSeconds}`);
    const v = q.solution.visual;
    if (v && v.type === 'family') {
      const ids = new Set(v.members.map((m) => m.id));
      for (const l of v.links) if (l.type === 'spouse' ? !ids.has(l.a) || !ids.has(l.b) : !ids.has(l.parent) || !ids.has(l.child)) p.push('family visual link to unknown member');
    }
  }
  return p;
}

describeGenerator(generator, { verify, sanity });

// SPEC 14.3: undetermined-gender cases resolve to "Cannot be determined" — and only those.
describe('blood-relation: hand-checked cases (verifier engine)', () => {
  const direct = (stmts: [string, string, string][], x: string, y: string) =>
    verify({ item: { questions: [] }, facts: { kind: 'direct', stmts: stmts.map(([a, rel, b]) => ({ x: a, rel: rel as never, y: b })), ask: { x, y } } } as never)[0];
  it('asked person gender never given → CBD', () => {
    // M is the brother of N. N is the daughter of O. How is O related to M?
    expect(direct([['M', 'brother', 'N'], ['N', 'daughter', 'O']], 'O', 'M')).toBe(CBD);
  });
  it('gender implied by a husband/wife statement is determined', () => {
    // A is the wife of B. C is the son of B. How is B related to C? → Father
    expect(direct([['A', 'wife', 'B'], ['C', 'son', 'B']], 'B', 'C')).toBe('Father');
  });
  it('cousin is gender-neutral, so unknown gender still gives Cousin', () => {
    // P is the son of Q. Q is the brother of R. S is the daughter of R... ask R's child about P via neutral path
    expect(direct([['P', 'son', 'Q'], ['Q', 'brother', 'R'], ['T', 'son', 'R']], 'T', 'P')).toBe('Cousin');
    expect(direct([['Q', 'brother', 'R'], ['P', 'son', 'Q'], ['R', 'mother', 'T']], 'T', 'P')).toBe('Cousin');
  });
  it('structural inference fixes a gender (the other parent must be the mother)', () => {
    // X is the father of Y. Y is the daughter of Z. How is Z related to Y? → Mother
    expect(direct([['X', 'father', 'Y'], ['Y', 'daughter', 'Z']], 'Z', 'Y')).toBe('Mother');
  });
  it('in-laws through a sibling', () => {
    // A is the sister of B. B is the husband of C. How is A related to C? → Sister-in-law
    expect(direct([['A', 'sister', 'B'], ['B', 'husband', 'C']], 'A', 'C')).toBe('Sister-in-law');
  });
  it('pointing: "the only son of my father" is the speaker himself', () => {
    const r = verify({ item: { questions: [] }, facts: { kind: 'pointing', speaker: { name: 'Ravi', g: 'm' }, target: 'm', rhs: [{ rel: 'father' }, { rel: 'son', only: true }], lhs: 'father' } } as never)[0];
    expect(r).toBe('Son');
    const r2 = verify({ item: { questions: [] }, facts: { kind: 'pointing', speaker: { name: 'Meera', g: 'f' }, target: 'm', rhs: [{ rel: 'father' }, { rel: 'son', only: true }], lhs: 'father' } } as never)[0];
    expect(r2).toBe('Nephew');
  });
});
