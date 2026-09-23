/**
 * Independent verifier for reasoning.syllogism — a different model from the generator's region enumeration.
 *
 * Model: a universe is a collection of elements; each element has a membership vector over the terms (its
 * "type"). Statements split into
 *   - universal rules on single elements (All A are B: no element is A-and-not-B; No A is B: no element is both),
 *   - existence requirements (Some …, Some … not, Only a few = both, and every term has at least one member).
 * Universal rules are checked element by element, so if any universe satisfies everything, the universe holding
 * ONE element of EVERY allowed type does too (adding allowed elements never breaks a rule and only helps
 * existence). Hence "satisfiable" ⇔ that maximal universe meets every existence requirement — no enumeration.
 *
 *  - definite conclusion ⇔ statements + (negation of the conclusion) is unsatisfiable
 *  - possibility          ⇔ statements + conclusion is satisfiable, and the conclusion is not already definite
 *                           (possibility of a certainty is ambiguous by convention → −1)
 *  - either–or            ⇔ classic complementary pair (Some/No on the same two terms, or All/Some-not with the
 *                           same subject and predicate), neither following alone
 */
import type { GenResult } from '../../generators/types';
import type { SyllogismFacts, SylPropFact } from '../../generators/reasoning/syllogism';

type Member = readonly boolean[];
type Cond = (e: Member) => boolean;

interface Theory {
  /** No element may satisfy any of these. */
  forbid: Cond[];
  /** For each, some element must satisfy it. */
  need: Cond[];
}

interface Stmt {
  q: string;
  a: number;
  b: number;
}

function clone(t: Theory): Theory {
  return { forbid: [...t.forbid], need: [...t.need] };
}

function add(t: Theory, s: Stmt): Theory {
  const { a, b } = s;
  const both: Cond = (e) => e[a] && e[b];
  const aNotB: Cond = (e) => e[a] && !e[b];
  const out = clone(t);
  switch (s.q) {
    case 'all':
      out.forbid.push(aNotB);
      break;
    case 'no':
      out.forbid.push(both);
      break;
    case 'some':
      out.need.push(both);
      break;
    case 'some-not':
      out.need.push(aNotB);
      break;
    case 'only-a-few':
      out.need.push(both, aNotB);
      break;
    default:
      throw new Error(`unknown quantifier ${s.q}`);
  }
  return out;
}

function memberTypes(n: number): Member[] {
  const out: Member[] = [];
  for (let m = 1; m < 1 << n; m++) out.push(Array.from({ length: n }, (_, s) => ((m >> s) & 1) === 1));
  return out;
}

function satisfiable(n: number, t: Theory): boolean {
  const allowed = memberTypes(n).filter((e) => !t.forbid.some((f) => f(e)));
  const nonEmpty: Cond[] = Array.from({ length: n }, (_, s) => (e: Member) => e[s]);
  return [...t.need, ...nonEmpty].every((req) => allowed.some(req));
}

function theoryOf(stmts: readonly Stmt[]): Theory {
  return stmts.reduce<Theory>((t, s) => add(t, s), { forbid: [], need: [] });
}

/** The negation of a (definite) statement as a list of alternatives (a disjunction). */
function negation(s: Stmt): Stmt[] {
  const { a, b } = s;
  switch (s.q) {
    case 'all':
      return [{ q: 'some-not', a, b }];
    case 'no':
      return [{ q: 'some', a, b }];
    case 'some':
      return [{ q: 'no', a, b }];
    case 'some-not':
      return [{ q: 'all', a, b }];
    case 'only-a-few':
      return [
        { q: 'no', a, b },
        { q: 'all', a, b },
      ];
    default:
      throw new Error(`unknown quantifier ${s.q}`);
  }
}

export function sylConsistent(n: number, stmts: readonly Stmt[]): boolean {
  return satisfiable(n, theoryOf(stmts));
}

export function sylDefinite(n: number, stmts: readonly Stmt[], c: Stmt): boolean {
  const t = theoryOf(stmts);
  if (!satisfiable(n, t)) return false;
  return negation(c).every((alt) => !satisfiable(n, add(t, alt)));
}

export function sylPossible(n: number, stmts: readonly Stmt[], c: Stmt): boolean {
  return satisfiable(n, add(theoryOf(stmts), c));
}

/** true / false, or null when ambiguous (a possibility conclusion that is already certain, or bad statements). */
export function sylFollows(n: number, stmts: readonly Stmt[], c: SylPropFact | Stmt): boolean | null {
  if (!sylConsistent(n, stmts)) return null;
  if ((c as SylPropFact).possibility) {
    if (sylDefinite(n, stmts, c)) return null;
    return sylPossible(n, stmts, c);
  }
  return sylDefinite(n, stmts, c);
}

function classicPair(x: SylPropFact, y: SylPropFact): boolean {
  if (x.possibility || y.possibility) return false;
  const sameTerms = x.a === y.a && x.b === y.b;
  const swapped = x.a === y.b && x.b === y.a;
  const kinds = [x.q, y.q].sort().join('+');
  if (kinds === 'no+some') return sameTerms || swapped;
  if (kinds === 'all+some-not') return sameTerms;
  return false;
}

/** Can both conclusions be false together? (Only meaningful for definite conclusions.) */
function canBothFail(n: number, stmts: readonly Stmt[], c1: Stmt, c2: Stmt): boolean {
  const base = theoryOf(stmts);
  return negation(c1).some((x) => negation(c2).some((y) => satisfiable(n, add(add(base, x), y))));
}

export function sylPairAnswer(n: number, stmts: readonly Stmt[], c1: SylPropFact, c2: SylPropFact): number {
  const f1 = sylFollows(n, stmts, c1);
  const f2 = sylFollows(n, stmts, c2);
  if (f1 === null || f2 === null) return -1;
  if (f1 && f2) return 4;
  if (f1) return 0;
  if (f2) return 1;
  if (c1.possibility || c2.possibility) return 3;
  const exhaustive = !canBothFail(n, stmts, c1, c2);
  if (classicPair(c1, c2)) return exhaustive ? 2 : -1;
  return exhaustive ? -1 : 3;
}

function worksWith(n: number, stmts: readonly Stmt[], concs: readonly SylPropFact[]): boolean {
  return sylConsistent(n, stmts) && concs.every((c) => sylFollows(n, stmts, c) === true);
}

export function verifySyllogism(f: SyllogismFacts): number {
  const n = f.terms.length;
  if (f.form === 'conclusions') {
    if (f.conclusions.length !== 2) throw new Error('need two conclusions');
    return sylPairAnswer(n, f.statements, f.conclusions[0], f.conclusions[1]);
  }
  const opts = f.options ?? [];
  if (opts.length !== 5) throw new Error('need five options');
  const works = opts.map((opt) => {
    let stmts: Stmt[];
    if (f.form === 'missing-statement') {
      if (opt.length !== 1 || f.blank === undefined) throw new Error('missing-statement option shape');
      stmts = [...f.statements.slice(0, f.blank), opt[0], ...f.statements.slice(f.blank)];
    } else stmts = [...opt];
    return worksWith(n, stmts, f.conclusions);
  });
  const hits = works.map((w, i) => (w ? i : -1)).filter((i) => i >= 0);
  return hits.length === 1 ? hits[0] : -1;
}

export function verify(res: GenResult<SyllogismFacts>): (number | string)[] {
  return [verifySyllogism(res.facts)];
}
