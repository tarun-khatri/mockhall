/**
 * Independent verifier for reasoning.inequality — brute force over integer assignments, no closure reasoning.
 *
 * Every letter takes a value from 1..n (n = number of letters, enough to realise every possible ordering).
 * Questions are answered with existence searches ("is there an assignment satisfying the statements in which
 * …?"), each a backtracking search that checks every constraint as soon as both of its letters have values:
 *
 *  - conclusion true        ⇔ no assignment satisfies the statements and the conclusion's negation
 *  - either–or              ⇔ same two letters, neither always true, no assignment makes both false,
 *                             no assignment makes both true
 *  - both-false impossible but both-true possible (overlap), or over different letters ⇒ ambiguous (−1)
 *
 * Letters on the path between the conclusion letters are assigned first, so impossible searches die early.
 */
import type { GenResult } from '../../generators/types';
import type { InequalityFacts, IneqConclusionFact, IneqStatementFact } from '../../generators/reasoning/inequality';

type Sign = '>' | '≥' | '=' | '≤' | '<' | '≠';
const SIGNS: readonly string[] = ['>', '≥', '=', '≤', '<'];

function compare(s: Sign, x: number, y: number): boolean {
  switch (s) {
    case '>':
      return x > y;
    case '≥':
      return x >= y;
    case '=':
      return x === y;
    case '≤':
      return x <= y;
    case '<':
      return x < y;
    case '≠':
      return x !== y;
  }
}

const NEGATE: Record<Sign, Sign> = { '>': '≤', '≥': '<', '=': '≠', '≤': '>', '<': '≥', '≠': '=' };

interface Cons {
  i: number;
  s: Sign;
  j: number;
}

const neg = (c: Cons): Cons => ({ i: c.i, s: NEGATE[c.s], j: c.j });

function decode(op: string, codes: InequalityFacts['codes']): Sign {
  if (codes) {
    const hit = codes.find((c) => c.symbol === op);
    if (!hit) throw new Error(`unknown code symbol ${op}`);
    return hit.rel as Sign;
  }
  if (!SIGNS.includes(op)) throw new Error(`bad relation sign ${op}`);
  return op as Sign;
}

class Problem {
  readonly names: string[] = [];
  private readonly index = new Map<string, number>();

  id(v: string): number {
    let k = this.index.get(v);
    if (k === undefined) {
      k = this.names.length;
      this.index.set(v, k);
      this.names.push(v);
    }
    return k;
  }

  chainCons(st: IneqStatementFact, codes: InequalityFacts['codes'], fill?: readonly string[]): Cons[] {
    if (st.vars.length !== st.ops.length + 1) throw new Error('statement shape');
    let f = 0;
    return st.ops.map((op, k) => {
      const blank = op === '?';
      const raw = blank ? fill?.[f++] : op;
      if (raw === undefined) throw new Error('missing fill for blank');
      return { i: this.id(st.vars[k]), s: decode(raw, blank ? undefined : codes), j: this.id(st.vars[k + 1]) };
    });
  }

  concl(c: IneqConclusionFact, codes: InequalityFacts['codes']): Cons {
    return { i: this.id(c.a), s: decode(c.op, codes), j: this.id(c.b) };
  }
}

/** Shortest undirected path (by letters) between a and b in the statement graph — used only for search order. */
function pathLetters(n: number, cons: readonly Cons[], a: number, b: number): number[] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const c of cons) {
    adj[c.i].push(c.j);
    adj[c.j].push(c.i);
  }
  const prev = new Array<number>(n).fill(-1);
  const seen = new Array<boolean>(n).fill(false);
  seen[a] = true;
  const q = [a];
  while (q.length) {
    const u = q.shift()!;
    for (const w of adj[u]) {
      if (!seen[w]) {
        seen[w] = true;
        prev[w] = u;
        q.push(w);
      }
    }
  }
  if (!seen[b]) return [a, b];
  const path = [b];
  for (let u = b; u !== a; u = prev[u]) path.unshift(prev[u]);
  return path;
}

/**
 * Is there an assignment of 1..n to the letters satisfying `cons`?
 * `first` letters are assigned first (in the given order), then the rest in BFS order.
 */
function exists(n: number, cons: readonly Cons[], first: readonly number[]): boolean {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const c of cons) {
    adj[c.i].push(c.j);
    adj[c.j].push(c.i);
  }
  const order: number[] = [];
  const seen = new Array<boolean>(n).fill(false);
  const take = (v: number) => {
    if (!seen[v]) {
      seen[v] = true;
      order.push(v);
    }
  };
  first.forEach(take);
  for (let k = 0; k < order.length || order.length < n; k++) {
    if (k >= order.length) {
      const next = seen.findIndex((s) => !s);
      if (next < 0) break;
      take(next);
    }
    for (const w of adj[order[k]]) take(w);
  }
  const pos = new Array<number>(n);
  order.forEach((v, k) => (pos[v] = k));
  const checks: Cons[][] = Array.from({ length: n }, () => []);
  for (const c of cons) checks[Math.max(pos[c.i], pos[c.j])].push(c);

  const val = new Int32Array(n);
  const rec = (k: number): boolean => {
    if (k === n) return true;
    const v = order[k];
    for (let x = 1; x <= n; x++) {
      val[v] = x;
      let ok = true;
      for (const c of checks[k]) {
        if (!compare(c.s, val[c.i], val[c.j])) {
          ok = false;
          break;
        }
      }
      if (ok && rec(k + 1)) return true;
    }
    return false;
  };
  return rec(0);
}

function pairAnswer(n: number, cons: readonly Cons[], c1: Cons, c2: Cons): number {
  const p1 = pathLetters(n, cons, c1.i, c1.j);
  const p2 = pathLetters(n, cons, c2.i, c2.j);
  if (!exists(n, cons, [])) return -1;
  const allI = !exists(n, [...cons, neg(c1)], p1);
  const allII = !exists(n, [...cons, neg(c2)], p2);
  if (allI && allII) return 4;
  if (allI) return 0;
  if (allII) return 1;
  const bothFalse = exists(n, [...cons, neg(c1), neg(c2)], [...p1, ...p2]);
  if (bothFalse) return 3;
  const bothTrue = exists(n, [...cons, c1, c2], [...p1, ...p2]);
  const same = (c1.i === c2.i && c1.j === c2.j) || (c1.i === c2.j && c1.j === c2.i);
  return same && !bothTrue ? 2 : -1;
}

/** All required conclusions definitely true (and the statements are satisfiable). */
function allDefinite(n: number, cons: readonly Cons[], req: readonly Cons[]): boolean {
  if (!exists(n, cons, [])) return false;
  return req.every((c) => !exists(n, [...cons, neg(c)], pathLetters(n, cons, c.i, c.j)));
}

function uniqueIndex(flags: boolean[]): number {
  const hits = flags.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
  return hits.length === 1 ? hits[0] : -1;
}

export function verifyInequality(facts: InequalityFacts): number {
  const codes = facts.codes;
  if (facts.form === 'conclusions') {
    const p = new Problem();
    const cons = facts.statements.flatMap((s) => p.chainCons(s, codes));
    if (facts.conclusions.length !== 2) throw new Error('need two conclusions');
    const c1 = p.concl(facts.conclusions[0], codes);
    const c2 = p.concl(facts.conclusions[1], codes);
    return pairAnswer(p.names.length, cons, c1, c2);
  }
  if (facts.form === 'missing-symbol') {
    const fills = facts.fills ?? [];
    if (fills.length !== 5) throw new Error('need five fills');
    return uniqueIndex(
      fills.map((fill) => {
        const p = new Problem();
        const cons = facts.statements.flatMap((s) => p.chainCons(s, undefined, fill));
        const req = facts.conclusions.map((c) => p.concl(c, undefined));
        return allDefinite(p.names.length, cons, req);
      }),
    );
  }
  const cands = facts.candidates ?? [];
  if (cands.length !== 5) throw new Error('need five candidate expressions');
  return uniqueIndex(
    cands.map((cand) => {
      const p = new Problem();
      const cons = p.chainCons(cand, undefined);
      const req = facts.conclusions.map((c) => p.concl(c, undefined));
      return allDefinite(p.names.length, cons, req);
    }),
  );
}

export function verify(res: GenResult<InequalityFacts>): (number | string)[] {
  return [verifyInequality(res.facts)];
}
