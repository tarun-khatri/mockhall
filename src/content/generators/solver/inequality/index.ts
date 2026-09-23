/**
 * Inequality engine (SPEC 7.6): relation graph + transitive closure over {>, ≥, =}.
 *
 * A conclusion is TRUE only when it is implied by the statements in every consistent world.
 * For a pair (x, y) the closure yields the set of orderings that remain possible:
 *   bit 1 = x > y, bit 2 = x = y, bit 4 = x < y.
 * A conclusion "x r y" holds iff every possible ordering lies inside r's mask.
 *
 * Either–or (SPEC 7.6): two conclusions on the SAME pair that are individually undetermined but jointly
 * exhaustive and mutually exclusive (e.g. x > y and x = y when x ≥ y is known; x ≥ y and x < y when nothing
 * is known). Jointly exhaustive but overlapping pairs (x ≥ y / x ≤ y) are reported as ambiguous so generators
 * never use them.
 */

export type Rel = '>' | '≥' | '=' | '≤' | '<';
export const RELS: readonly Rel[] = ['>', '≥', '=', '≤', '<'];

export const OUT_GT = 1;
export const OUT_EQ = 2;
export const OUT_LT = 4;
export const OUT_ALL = 7;

/** Orderings of (x, y) under which "x r y" is true. */
export const REL_MASK: Record<Rel, number> = { '>': 1, '≥': 3, '=': 2, '≤': 6, '<': 4 };

export interface Link {
  a: string;
  rel: Rel;
  b: string;
}

export interface Chain {
  vars: string[];
  rels: Rel[];
}

export interface Conclusion {
  a: string;
  rel: Rel;
  b: string;
}

export function flipRel(r: Rel): Rel {
  switch (r) {
    case '>':
      return '<';
    case '<':
      return '>';
    case '≥':
      return '≤';
    case '≤':
      return '≥';
    default:
      return '=';
  }
}

export function isStrict(r: Rel): boolean {
  return r === '>' || r === '<';
}

/** Direction of a relation: +1 for > / ≥, −1 for < / ≤, 0 for =. */
export function relDir(r: Rel): number {
  return r === '>' || r === '≥' ? 1 : r === '<' || r === '≤' ? -1 : 0;
}

export function chainLinks(c: Chain): Link[] {
  if (c.vars.length !== c.rels.length + 1) throw new Error('chainLinks: vars/rels length mismatch');
  return c.rels.map((rel, i) => ({ a: c.vars[i], rel, b: c.vars[i + 1] }));
}

export function chainText(c: Chain): string {
  let s = c.vars[0];
  c.rels.forEach((r, i) => (s += ` ${r} ${c.vars[i + 1]}`));
  return s;
}

/** Transitive closure. m[i][j]: 0 = no path, 1 = i ≥ j implied, 2 = i > j implied. */
export class Closure {
  readonly vars: string[];
  readonly consistent: boolean;
  private readonly idx = new Map<string, number>();
  private readonly m: Uint8Array;
  private readonly n: number;

  constructor(links: readonly Link[], extraVars: readonly string[] = []) {
    const vars: string[] = [];
    const add = (v: string) => {
      if (!this.idx.has(v)) {
        this.idx.set(v, vars.length);
        vars.push(v);
      }
    };
    for (const l of links) {
      add(l.a);
      add(l.b);
    }
    extraVars.forEach(add);
    this.vars = vars;
    const n = vars.length;
    this.n = n;
    const m = new Uint8Array(n * n);
    for (let i = 0; i < n; i++) m[i * n + i] = 1;
    const put = (i: number, j: number, v: number) => {
      if (m[i * n + j] < v) m[i * n + j] = v;
    };
    for (const l of links) {
      const a = this.idx.get(l.a)!;
      const b = this.idx.get(l.b)!;
      switch (l.rel) {
        case '>':
          put(a, b, 2);
          break;
        case '≥':
          put(a, b, 1);
          break;
        case '=':
          put(a, b, 1);
          put(b, a, 1);
          break;
        case '≤':
          put(b, a, 1);
          break;
        case '<':
          put(b, a, 2);
          break;
      }
    }
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < n; i++) {
        const ik = m[i * n + k];
        if (!ik) continue;
        for (let j = 0; j < n; j++) {
          const kj = m[k * n + j];
          if (!kj) continue;
          const v = ik > kj ? ik : kj;
          if (m[i * n + j] < v) m[i * n + j] = v;
        }
      }
    }
    let ok = true;
    for (let i = 0; i < n; i++) if (m[i * n + i] === 2) ok = false;
    this.consistent = ok;
    this.m = m;
  }

  has(v: string): boolean {
    return this.idx.has(v);
  }

  /** 0 = no implication, 1 = a ≥ b, 2 = a > b. */
  raw(a: string, b: string): number {
    const i = this.idx.get(a);
    const j = this.idx.get(b);
    if (i === undefined || j === undefined) return a === b ? 1 : 0;
    return this.m[i * this.n + j];
  }

  /** Bitmask of orderings of (a, b) still possible: 1 '>', 2 '=', 4 '<'. */
  possible(a: string, b: string): number {
    if (a === b) return OUT_EQ;
    const ab = this.raw(a, b);
    const ba = this.raw(b, a);
    if (ab === 2) return OUT_GT;
    if (ba === 2) return OUT_LT;
    if (ab && ba) return OUT_EQ;
    if (ab) return OUT_GT | OUT_EQ;
    if (ba) return OUT_LT | OUT_EQ;
    return OUT_ALL;
  }

  /** Definitely true. */
  holds(c: Conclusion): boolean {
    return (this.possible(c.a, c.b) & ~REL_MASK[c.rel]) === 0;
  }

  /** Strongest definite relation a ? b, or null when no relation can be established. */
  known(a: string, b: string): Rel | null {
    switch (this.possible(a, b)) {
      case OUT_GT:
        return '>';
      case OUT_GT | OUT_EQ:
        return '≥';
      case OUT_EQ:
        return '=';
      case OUT_LT | OUT_EQ:
        return '≤';
      case OUT_LT:
        return '<';
      default:
        return null;
    }
  }
}

const OUT_REL: Record<number, Rel> = { [OUT_GT]: '>', [OUT_EQ]: '=', [OUT_LT]: '<' };

/** Is there a world where c1 has one of the orderings in m1 AND c2 has one of the orderings in m2? */
function jointly(links: readonly Link[], c1: Conclusion, m1: number, c2: Conclusion, m2: number): boolean {
  for (const o1 of [OUT_GT, OUT_EQ, OUT_LT]) {
    if (!(m1 & o1)) continue;
    for (const o2 of [OUT_GT, OUT_EQ, OUT_LT]) {
      if (!(m2 & o2)) continue;
      const extra: Link[] = [
        { a: c1.a, rel: OUT_REL[o1], b: c1.b },
        { a: c2.a, rel: OUT_REL[o2], b: c2.b },
      ];
      if (new Closure([...links, ...extra]).consistent) return true;
    }
  }
  return false;
}

export function samePair(c1: Conclusion, c2: Conclusion): boolean {
  return (c1.a === c2.a && c1.b === c2.b) || (c1.a === c2.b && c1.b === c2.a);
}

/**
 * Answer category for a two-conclusion inequality question:
 * 0 only I, 1 only II, 2 either, 3 neither, 4 both, −1 ambiguous (never generate).
 */
export function pairVerdict(links: readonly Link[], c1: Conclusion, c2: Conclusion): number {
  const cl = new Closure(links, [c1.a, c1.b, c2.a, c2.b]);
  if (!cl.consistent) return -1;
  const t1 = cl.holds(c1);
  const t2 = cl.holds(c2);
  if (t1 && t2) return 4;
  if (t1) return 0;
  if (t2) return 1;
  const p1 = cl.possible(c1.a, c1.b);
  const p2 = cl.possible(c2.a, c2.b);
  const f1 = p1 & ~REL_MASK[c1.rel];
  const f2 = p2 & ~REL_MASK[c2.rel];
  const canBothFail = jointly(links, c1, f1, c2, f2);
  if (canBothFail) return 3;
  // jointly exhaustive
  const canBothHold = jointly(links, c1, p1 & REL_MASK[c1.rel], c2, p2 & REL_MASK[c2.rel]);
  if (samePair(c1, c2) && !canBothHold) return 2;
  return -1;
}

/** All links of a set of chains. */
export function linksOf(chains: readonly Chain[]): Link[] {
  return chains.flatMap(chainLinks);
}

/**
 * Shortest path between two variables in the (undirected) statement graph, written as a chain
 * from `from` to `to` with every relation oriented along the path. Null when not connected.
 */
export function pathChain(links: readonly Link[], from: string, to: string): Chain | null {
  if (from === to) return { vars: [from], rels: [] };
  const adj = new Map<string, { v: string; rel: Rel }[]>();
  const push = (u: string, v: string, rel: Rel) => {
    if (!adj.has(u)) adj.set(u, []);
    adj.get(u)!.push({ v, rel });
  };
  for (const l of links) {
    push(l.a, l.b, l.rel);
    push(l.b, l.a, flipRel(l.rel));
  }
  const prev = new Map<string, { u: string; rel: Rel }>();
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const u = queue.shift()!;
    if (u === to) break;
    for (const { v, rel } of adj.get(u) ?? []) {
      if (seen.has(v)) continue;
      seen.add(v);
      prev.set(v, { u, rel });
      queue.push(v);
    }
  }
  if (!seen.has(to)) return null;
  const vars = [to];
  const rels: Rel[] = [];
  let cur = to;
  while (cur !== from) {
    const p = prev.get(cur)!;
    rels.unshift(p.rel);
    vars.unshift(p.u);
    cur = p.u;
  }
  return { vars, rels };
}

/** Number of links on the shortest undirected path (Infinity when unconnected). */
export function pathLength(links: readonly Link[], a: string, b: string): number {
  const p = pathChain(links, a, b);
  return p ? p.rels.length : Infinity;
}
