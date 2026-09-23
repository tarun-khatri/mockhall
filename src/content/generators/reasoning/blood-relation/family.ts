/**
 * Explicit family model for reasoning.blood-relation: persons with parents (a couple, or none), spouse and gender.
 * Relation names are read with structural predicates (is parent / sibling / spouse's parent …).
 * Standard exam conventions: siblings share both parents, a child of a married person is the child of the
 * spouse too, marriages are between a man and a woman, no step or half relations.
 */
import type { Rng } from '../../../../lib/rng';

export type G = 'm' | 'f';
export interface P {
  id: number;
  name: string;
  g: G;
  /** Parent ids (0 or 2). */
  parents: number[];
  spouse?: number;
}

export type Rel = 'father' | 'mother' | 'son' | 'daughter' | 'brother' | 'sister' | 'husband' | 'wife';

export class Family {
  ps: P[] = [];
  add(name: string, g: G, parents: number[] = []): P {
    const p: P = { id: this.ps.length, name, g, parents };
    this.ps.push(p);
    return p;
  }
  marry(a: P, b: P): void {
    a.spouse = b.id;
    b.spouse = a.id;
  }
  get(id: number): P {
    return this.ps[id];
  }
  byName(n: string): P {
    const p = this.ps.find((x) => x.name === n);
    if (!p) throw new Error(`no person ${n}`);
    return p;
  }
  children(p: P): P[] {
    return this.ps.filter((c) => c.parents.includes(p.id));
  }
  siblings(p: P): P[] {
    if (!p.parents.length) return [];
    return this.ps.filter((c) => c.id !== p.id && c.parents.length && c.parents.every((x) => p.parents.includes(x)));
  }
}

const GT: Record<string, [string, string]> = {
  child: ['Son', 'Daughter'],
  parent: ['Father', 'Mother'],
  spouse: ['Husband', 'Wife'],
  sibling: ['Brother', 'Sister'],
  grandchild: ['Grandson', 'Granddaughter'],
  grandparent: ['Grandfather', 'Grandmother'],
  nephew: ['Nephew', 'Niece'],
  uncle: ['Uncle', 'Aunt'],
  cousin: ['Cousin', 'Cousin'],
  childInLaw: ['Son-in-law', 'Daughter-in-law'],
  parentInLaw: ['Father-in-law', 'Mother-in-law'],
  siblingInLaw: ['Brother-in-law', 'Sister-in-law'],
};

/** Relation kind of x to y ("x is the ___ of y"), independent of x's gender; null when not a standard term. */
export function relKind(f: Family, x: P, y: P): keyof typeof GT | null {
  if (x.id === y.id) return null;
  const par = (p: P) => p.parents.map((i) => f.get(i));
  const isParent = (a: P, b: P) => b.parents.includes(a.id);
  const sib = (a: P, b: P) => f.siblings(a).some((s) => s.id === b.id);
  const sp = (p: P) => (p.spouse !== undefined ? f.get(p.spouse) : undefined);
  if (x.spouse === y.id) return 'spouse';
  if (isParent(y, x)) return 'child';
  if (isParent(x, y)) return 'parent';
  if (sib(x, y)) return 'sibling';
  if (par(x).some((p) => isParent(y, p))) return 'grandchild';
  if (par(y).some((p) => isParent(x, p))) return 'grandparent';
  if (par(x).some((p) => sib(p, y) || (sp(y) && sib(p, sp(y)!)))) return 'nephew';
  if (par(y).some((p) => sib(p, x) || (sp(x) && sib(p, sp(x)!)))) return 'uncle';
  if (par(x).some((a) => par(y).some((b) => sib(a, b)))) return 'cousin';
  if (sp(x) && isParent(y, sp(x)!)) return 'childInLaw';
  if (sp(y) && isParent(x, sp(y)!)) return 'parentInLaw';
  if ((sp(y) && sib(x, sp(y)!)) || (sp(x) && sib(sp(x)!, y))) return 'siblingInLaw';
  return null;
}

export function termOf(kind: keyof typeof GT, g: G): string {
  return GT[kind][g === 'm' ? 0 : 1];
}

export const ALL_TERMS: string[] = [...new Set(Object.values(GT).flat())];

/** "x is the rel of y" as a primitive relation, from the model (null if not primitive). */
export function primitive(f: Family, x: P, y: P): Rel | null {
  const k = relKind(f, x, y);
  const m = x.g === 'm';
  if (k === 'parent') return m ? 'father' : 'mother';
  if (k === 'child') return m ? 'son' : 'daughter';
  if (k === 'sibling') return m ? 'brother' : 'sister';
  if (k === 'spouse') return m ? 'husband' : 'wife';
  return null;
}

export const REL_GENDER: Record<Rel, G> = { father: 'm', mother: 'f', son: 'm', daughter: 'f', brother: 'm', sister: 'f', husband: 'm', wife: 'f' };

export interface Stmt {
  x: string;
  rel: Rel;
  y: string;
}

/**
 * All gender assignments of everyone in the model consistent with the statements on this fixed structure:
 * gendered terms fix the subject's gender, `known` fixes stated genders, spouses and the two parents of a
 * child have opposite genders. Unmentioned people are free.
 */
export function genderWorlds(f: Family, stmts: readonly Stmt[], known: ReadonlyMap<string, G> = new Map()): Map<number, G>[] {
  const worlds: Map<number, G>[] = [];
  const people = f.ps;
  const n = people.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const g = new Map<number, G>();
    people.forEach((p, i) => g.set(p.id, mask & (1 << i) ? 'f' : 'm'));
    const gg = (p: P) => g.get(p.id)!;
    let ok = stmts.every((s) => gg(f.byName(s.x)) === REL_GENDER[s.rel]) && [...known].every(([nm, gx]) => gg(f.byName(nm)) === gx);
    for (const p of f.ps) {
      if (!ok) break;
      if (p.spouse !== undefined && gg(p) === gg(f.get(p.spouse))) ok = false;
      if (p.parents.length === 2 && gg(f.get(p.parents[0])) === gg(f.get(p.parents[1]))) ok = false;
    }
    if (ok) worlds.push(g);
  }
  return worlds;
}

/** Answer for "How is x related to y?" over all consistent gender worlds: a term, or null when undetermined. */
export function answerTerm(f: Family, x: P, y: P, worlds: readonly Map<number, G>[]): string | null {
  const k = relKind(f, x, y);
  if (!k) throw new Error('unsupported relation');
  const terms = new Set(worlds.map((w) => termOf(k, w.get(x.id) ?? x.g)));
  return terms.size === 1 ? [...terms][0] : null;
}

/* ------------------------------------------------------------------ */
/* Names                                                                */
/* ------------------------------------------------------------------ */

const MEN = ['Ravi', 'Arjun', 'Karthik', 'Imran', 'Suresh', 'Manoj', 'Vikram', 'Rahul', 'Anil', 'Deepak', 'Farhan', 'Joseph', 'Tenzing', 'Sandeep', 'Gaurav', 'Nikhil', 'Pranav', 'Rohit', 'Aditya', 'Vivek', 'Kunal', 'Arvind', 'Dinesh', 'Harish', 'Sameer', 'Yusuf', 'Bhaskar', 'Prakash'];
const WOMEN = ['Priya', 'Anjali', 'Meera', 'Kavya', 'Sneha', 'Fatima', 'Lakshmi', 'Pooja', 'Neha', 'Divya', 'Ritu', 'Swati', 'Anita', 'Rekha', 'Shalini', 'Nandini', 'Aparna', 'Bhavna', 'Chitra', 'Deepa', 'Farah', 'Gita', 'Hema', 'Ishita', 'Jaya', 'Nisha', 'Radha', 'Sunita'];

export function personName(rng: Rng, g: G, used: Set<string>): string {
  const pool = (g === 'm' ? MEN : WOMEN).filter((x) => !used.has(x));
  const n = rng.pick(pool);
  used.add(n);
  return n;
}

/** Letter names for puzzles (A–H style or P–W style). */
export function letterNames(rng: Rng, n: number): string[] {
  const set = rng.pick(['ABCDEFGHJK', 'PQRSTUVWXY', 'JKLMNOPQRS']);
  return rng.shuffle(set.split('')).slice(0, n);
}

/**
 * Random three-generation family: an elder couple, 2–3 children (some married, spouses from outside),
 * grandchildren of the married children. `size` bounds the member count.
 */
export type NameSource = () => (g: G) => string;

/** Fresh Indian first names per family. */
export function indianNames(rng: Rng): NameSource {
  return () => {
    const used = new Set<string>();
    return (g: G) => personName(rng, g, used);
  };
}
/** Fresh single-letter names per family. */
export function letterSource(rng: Rng): NameSource {
  return () => {
    const pool = letterNames(rng, 10);
    let i = 0;
    return () => pool[i++];
  };
}

export function randomFamily(rng: Rng, source: NameSource, maxSize: number): Family {
  for (;;) {
    const f = new Family();
    const names = source();
    const newP = (g: G, parents: number[] = []) => f.add(names(g), g, parents);
    const gm = rng.chance(0.5) ? 'm' : 'f';
    const a = newP(gm);
    const b = newP(gm === 'm' ? 'f' : 'm');
    f.marry(a, b);
    const par = [a.id, b.id];
    const kids: P[] = [];
    const nk = rng.int(2, 3);
    for (let i = 0; i < nk; i++) kids.push(newP(rng.chance(0.5) ? 'm' : 'f', par));
    for (const k of kids) {
      if (f.ps.length >= maxSize) break;
      if (rng.chance(0.75)) {
        const s = newP(k.g === 'm' ? 'f' : 'm');
        f.marry(k, s);
        const nc = rng.int(0, 2);
        for (let j = 0; j < nc && f.ps.length < maxSize; j++) newP(rng.chance(0.5) ? 'm' : 'f', k.g === 'm' ? [k.id, s.id] : [s.id, k.id]);
      }
    }
    if (f.ps.length >= Math.min(6, maxSize) && f.ps.length <= maxSize && f.ps.some((p) => p.parents.length && f.get(p.parents[0]).parents.length + f.get(p.parents[1]).parents.length > 0)) return f;
  }
}

/** Graph neighbours using primitive links (parent/child, spouse, sibling). */
export function links(f: Family, p: P): P[] {
  const out: P[] = [...p.parents.map((i) => f.get(i)), ...f.children(p), ...f.siblings(p)];
  if (p.spouse !== undefined) out.push(f.get(p.spouse));
  return out;
}

/** A random simple path of primitive links from `from` of exactly `len` edges ending at a person with a supported relation. */
export function randomPath(rng: Rng, f: Family, from: P, len: number): P[] | null {
  for (let tries = 0; tries < 60; tries++) {
    const path = [from];
    let ok = true;
    for (let i = 0; i < len && ok; i++) {
      const cur = path[path.length - 1];
      const next = rng.shuffle(links(f, cur)).find((n) => !path.some((q) => q.id === n.id));
      if (!next) ok = false;
      else path.push(next);
    }
    if (ok) return path;
  }
  return null;
}
