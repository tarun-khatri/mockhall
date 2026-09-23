/**
 * Independent verifier for reasoning.blood-relation.
 * Rebuilds the family from the statements only: a union-find over people with functional father / mother /
 * spouse edges (anonymous people are created on demand), the standard conventions (a child's parents are a
 * married couple; siblings share both parents; marriages are man–woman; named people are distinct), and
 * "only son / only brother" constraints. Every gender assignment of the named people is tried; a relation is
 * named from the signature of the shortest kinship paths (U = to a parent, D = to a child, S = to the spouse).
 * Different answers across consistent worlds ⇒ "Cannot be determined".
 */
import type { GenResult } from '../../generators/types';
import type { BloodRelationFacts, G, PStep, Rel, Stmt } from '../../generators/reasoning/blood-relation';

const CBD = 'Cannot be determined';
const GENDER_OF: Record<Rel, G> = { father: 'm', mother: 'f', son: 'm', daughter: 'f', brother: 'm', sister: 'f', husband: 'm', wife: 'f' };

const TERMS: Record<string, [string, string]> = {
  U: ['Son', 'Daughter'],
  D: ['Father', 'Mother'],
  S: ['Husband', 'Wife'],
  UD: ['Brother', 'Sister'],
  UU: ['Grandson', 'Granddaughter'],
  DD: ['Grandfather', 'Grandmother'],
  UUD: ['Nephew', 'Niece'],
  UUDS: ['Nephew', 'Niece'],
  UDD: ['Uncle', 'Aunt'],
  SUDD: ['Uncle', 'Aunt'],
  UUDD: ['Cousin', 'Cousin'],
  SU: ['Son-in-law', 'Daughter-in-law'],
  DS: ['Father-in-law', 'Mother-in-law'],
  SUD: ['Brother-in-law', 'Sister-in-law'],
  UDS: ['Brother-in-law', 'Sister-in-law'],
};

interface Node {
  up: number;
  g?: G;
  name?: string;
  fa?: number;
  mo?: number;
  sp?: number;
}

class World {
  n: Node[] = [];
  ok = true;
  distinct: [number, number][] = [];
  onlyChild: { parent: number; g: G }[] = [];
  onlySib: { of: number; g: G }[] = [];
  named = new Map<string, number>();

  add(g?: G, name?: string): number {
    this.n.push({ up: this.n.length, ...(g ? { g } : {}), ...(name ? { name } : {}) });
    const id = this.n.length - 1;
    if (name) this.named.set(name, id);
    return id;
  }
  find(x: number): number {
    while (this.n[x].up !== x) x = this.n[x].up = this.n[this.n[x].up].up;
    return x;
  }
  union(a: number, b: number): void {
    const work: [number, number][] = [[a, b]];
    while (work.length && this.ok) {
      const [p, q] = work.pop()!;
      const x = this.find(p);
      const y = this.find(q);
      if (x === y) continue;
      const X = this.n[x];
      const Y = this.n[y];
      if (X.name && Y.name) {
        this.ok = false;
        return;
      }
      if (X.g && Y.g && X.g !== Y.g) {
        this.ok = false;
        return;
      }
      Y.up = x;
      X.name ??= Y.name;
      X.g ??= Y.g;
      for (const k of ['fa', 'mo', 'sp'] as const) {
        const yv = Y[k];
        if (yv === undefined) continue;
        if (X[k] === undefined) X[k] = yv;
        else work.push([X[k]!, yv]);
      }
    }
  }
  node(x: number): Node {
    return this.n[this.find(x)];
  }
  father(x: number): number {
    const nd = this.node(x);
    if (nd.fa === undefined) nd.fa = this.add('m');
    return this.find(nd.fa);
  }
  mother(x: number): number {
    const nd = this.node(x);
    if (nd.mo === undefined) nd.mo = this.add('f');
    return this.find(nd.mo);
  }
  marry(a: number, b: number): void {
    const A = this.node(a);
    if (A.sp === undefined) A.sp = this.find(b);
    else this.union(A.sp, b);
    const B = this.node(b);
    if (B.sp === undefined) B.sp = this.find(a);
    else this.union(B.sp, a);
  }
  spouse(x: number): number {
    const nd = this.node(x);
    if (nd.sp === undefined) {
      const s = this.add(nd.g === 'm' ? 'f' : nd.g === 'f' ? 'm' : undefined);
      this.marry(x, s);
    }
    return this.find(this.node(x).sp!);
  }
  setParent(child: number, parent: number): void {
    const g = this.node(parent).g;
    if (!g) throw new Error('parent gender unknown');
    const nd = this.node(child);
    const slot = g === 'm' ? 'fa' : 'mo';
    if (nd[slot] === undefined) nd[slot] = this.find(parent);
    else this.union(nd[slot]!, parent);
  }
  roots(): number[] {
    return this.n.map((_, i) => i).filter((i) => this.find(i) === i);
  }
  signature(): string {
    return this.roots()
      .map((r) => {
        const nd = this.n[r];
        const f = (v?: number) => (v === undefined ? '-' : this.find(v));
        return `${r}:${f(nd.fa)}:${f(nd.mo)}:${f(nd.sp)}`;
      })
      .join('|');
  }
  /** Conventions and "only" constraints to a fixed point. */
  close(): void {
    for (let iter = 0; iter < 60 && this.ok; iter++) {
      const before = this.signature();
      for (const r of this.roots()) {
        const nd = this.n[r];
        if (nd.sp !== undefined) {
          const s = this.find(nd.sp);
          const sn = this.n[s];
          if (sn.sp === undefined) sn.sp = r;
          else if (this.find(sn.sp) !== r) this.union(sn.sp, r);
        }
        if (nd.fa !== undefined && nd.mo !== undefined) this.marry(nd.fa, nd.mo);
        else if (nd.fa !== undefined && this.node(nd.fa).sp !== undefined) nd.mo = this.find(this.node(nd.fa).sp!);
        else if (nd.mo !== undefined && this.node(nd.mo).sp !== undefined) nd.fa = this.find(this.node(nd.mo).sp!);
      }
      for (const c of this.onlyChild) {
        const p = this.find(c.parent);
        const kids = this.roots().filter((r) => {
          const nd = this.n[r];
          return nd.g === c.g && ((nd.fa !== undefined && this.find(nd.fa) === p) || (nd.mo !== undefined && this.find(nd.mo) === p));
        });
        for (let i = 1; i < kids.length; i++) this.union(kids[0], kids[i]);
      }
      for (const c of this.onlySib) {
        const o = this.find(c.of);
        const on = this.n[o];
        if (on.fa === undefined || on.mo === undefined) continue;
        const fa = this.find(on.fa);
        const mo = this.find(on.mo);
        const sibs = this.roots().filter((r) => {
          const nd = this.n[r];
          return r !== o && nd.g === c.g && nd.fa !== undefined && nd.mo !== undefined && this.find(nd.fa) === fa && this.find(nd.mo) === mo;
        });
        for (let i = 1; i < sibs.length; i++) this.union(sibs[0], sibs[i]);
      }
      if (this.signature() === before) return;
    }
  }
  consistent(): boolean {
    if (!this.ok) return false;
    for (const [a, b] of this.distinct) if (this.find(a) === this.find(b)) return false;
    for (const r of this.roots()) {
      const nd = this.n[r];
      if (nd.fa !== undefined && this.node(nd.fa).g === 'f') return false;
      if (nd.mo !== undefined && this.node(nd.mo).g === 'm') return false;
      if (nd.sp !== undefined) {
        const s = this.find(nd.sp);
        if (s === r) return false;
        const sg = this.n[s].g;
        if (sg && nd.g && sg === nd.g) return false;
      }
      // no one is their own ancestor
      const seen = new Set<number>();
      const stack = [nd.fa, nd.mo].filter((v): v is number => v !== undefined).map((v) => this.find(v));
      while (stack.length) {
        const a = stack.pop()!;
        if (a === r) return false;
        if (seen.has(a)) continue;
        seen.add(a);
        const an = this.n[a];
        for (const v of [an.fa, an.mo]) if (v !== undefined) stack.push(this.find(v));
      }
    }
    return true;
  }
  neighbours(r: number): [string, number][] {
    const out: [string, number][] = [];
    const nd = this.n[r];
    if (nd.fa !== undefined) out.push(['U', this.find(nd.fa)]);
    if (nd.mo !== undefined) out.push(['U', this.find(nd.mo)]);
    if (nd.sp !== undefined) out.push(['S', this.find(nd.sp)]);
    for (const c of this.roots()) {
      const cn = this.n[c];
      if ((cn.fa !== undefined && this.find(cn.fa) === r) || (cn.mo !== undefined && this.find(cn.mo) === r)) out.push(['D', c]);
    }
    return out;
  }
  /** Term for "x is the ___ of y". */
  term(x: number, y: number): string {
    const sx = this.find(x);
    const sy = this.find(y);
    const dist = new Map<number, number>([[sx, 0]]);
    const q = [sx];
    while (q.length) {
      const a = q.shift()!;
      for (const [, b] of this.neighbours(a)) if (!dist.has(b)) {
        dist.set(b, dist.get(a)! + 1);
        q.push(b);
      }
    }
    if (!dist.has(sy)) throw new Error('people not related');
    const sigs = new Set<string>();
    const walk = (a: number, sig: string) => {
      if (a === sy) {
        sigs.add(sig);
        return;
      }
      for (const [m, b] of this.neighbours(a)) if (dist.get(b) === dist.get(a)! + 1 && dist.get(b)! <= dist.get(sy)!) walk(b, sig + m);
    };
    walk(sx, '');
    const g = this.n[sx].g;
    const terms = new Set<string>();
    for (const s of sigs) {
      const t = TERMS[s];
      if (!t) throw new Error(`unnamed relation path ${s}`);
      if (!g && t[0] !== t[1]) throw new Error('gender unknown in a world');
      terms.add(t[g === 'f' ? 1 : 0]);
    }
    if (terms.size !== 1) throw new Error(`relation paths disagree: ${[...terms]}`);
    return [...terms][0];
  }
}

function applyStmt(w: World, s: Stmt): void {
  const x = w.named.get(s.x)!;
  const y = w.named.get(s.y)!;
  if (w.node(x).g !== GENDER_OF[s.rel]) {
    w.ok = false;
    return;
  }
  switch (s.rel) {
    case 'father':
    case 'mother':
      w.setParent(y, x);
      break;
    case 'son':
    case 'daughter':
      w.setParent(x, y);
      break;
    case 'brother':
    case 'sister':
      w.union(w.father(x), w.father(y));
      w.union(w.mother(x), w.mother(y));
      w.distinct.push([x, y]);
      break;
    case 'husband':
    case 'wife':
      w.marry(x, y);
      break;
  }
}

/** Every consistent world for a set of statements over named people. */
function worlds(names: readonly string[], stmts: readonly Stmt[]): World[] {
  const out: World[] = [];
  for (let mask = 0; mask < 1 << names.length; mask++) {
    const w = new World();
    names.forEach((nm, i) => w.add(mask & (1 << i) ? 'f' : 'm', nm));
    for (const s of stmts) if (w.ok) applyStmt(w, s);
    if (!w.ok) continue;
    w.close();
    if (w.consistent()) out.push(w);
  }
  if (!out.length) throw new Error('statements are inconsistent');
  return out;
}

function relAnswer(ws: readonly World[], x: string, y: string): string {
  const terms = new Set(ws.map((w) => w.term(w.named.get(x)!, w.named.get(y)!)));
  return terms.size === 1 ? [...terms][0] : CBD;
}

function pointing(speaker: { name: string; g: G }, target: G, rhs: readonly PStep[], lhs?: Rel): string {
  const w = new World();
  const s = w.add(speaker.g, speaker.name);
  let n = s;
  for (const st of rhs) {
    const g = GENDER_OF[st.rel];
    switch (st.rel) {
      case 'father':
        n = w.father(n);
        break;
      case 'mother':
        n = w.mother(n);
        break;
      case 'husband':
      case 'wife': {
        if (w.node(n).g === g) throw new Error('same-gender spouse');
        n = w.spouse(n);
        break;
      }
      case 'son':
      case 'daughter': {
        const c = w.add(g);
        w.setParent(c, n);
        w.setParent(c, w.spouse(n));
        if (st.only) w.onlyChild.push({ parent: n, g });
        n = c;
        break;
      }
      case 'brother':
      case 'sister': {
        const c = w.add(g);
        w.union(w.father(c), w.father(n));
        w.union(w.mother(c), w.mother(n));
        w.distinct.push([c, n]);
        if (st.only) w.onlySib.push({ of: n, g });
        n = c;
        break;
      }
    }
  }
  let t = n;
  if (lhs) {
    const g = GENDER_OF[lhs];
    if (w.node(n).g !== g) throw new Error('lhs gender clash');
    if (lhs === 'father' || lhs === 'mother') {
      t = w.add(target);
      w.setParent(t, n);
      w.setParent(t, w.spouse(n));
    } else if (lhs === 'brother' || lhs === 'sister') {
      t = w.add(target);
      w.union(w.father(t), w.father(n));
      w.union(w.mother(t), w.mother(n));
      w.distinct.push([t, n]);
    } else t = w.spouse(n);
  }
  if (w.node(t).g !== target) throw new Error('target gender clash');
  w.distinct.push([t, s]);
  w.close();
  if (!w.consistent()) throw new Error('pointing statement inconsistent');
  return w.term(t, s);
}

export function verify(res: GenResult<BloodRelationFacts>): (number | string)[] {
  const f = res.facts;
  switch (f.kind) {
    case 'direct': {
      const names = [...new Set(f.stmts.flatMap((s) => [s.x, s.y]))];
      return [relAnswer(worlds(names, f.stmts), f.ask.x, f.ask.y)];
    }
    case 'coded': {
      const stmts: Stmt[] = [];
      for (let i = 0; i + 2 < f.expr.length; i += 2) {
        const code = f.codes.find((c) => c.sym === f.expr[i + 1]);
        if (!code) throw new Error('unknown symbol');
        stmts.push({ x: f.expr[i], rel: code.rel, y: f.expr[i + 2] });
      }
      const names = [...new Set(stmts.flatMap((s) => [s.x, s.y]))];
      return [relAnswer(worlds(names, stmts), f.ask.x, f.ask.y)];
    }
    case 'pointing':
      return [pointing(f.speaker, f.target, f.rhs, f.lhs)];
    case 'family-puzzle': {
      const ws = worlds(f.members, f.stmts);
      return f.questions.map((q) => {
        if (q.t === 'rel') return relAnswer(ws, q.x, q.y);
        if (q.t === 'count') {
          const counts = new Set(ws.map((w) => f.members.filter((m) => w.node(w.named.get(m)!).g === q.g).length));
          if (counts.size !== 1) throw new Error('count not determined');
          return String([...counts][0]);
        }
        const sets = ws.map((w) =>
          f.members
            .filter((m) => m !== q.of)
            .filter((m) => {
              try {
                return w.term(w.named.get(m)!, w.named.get(q.of)!) === q.term;
              } catch {
                return false;
              }
            })
            .join(','),
        );
        if (new Set(sets).size !== 1 || !sets[0] || sets[0].includes(',')) throw new Error(`"who" not unique: ${[...new Set(sets)]}`);
        return sets[0];
      });
    }
  }
}
