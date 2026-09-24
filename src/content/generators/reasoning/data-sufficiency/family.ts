/**
 * DS on blood relations inside a CLOSED family: the named persons are the only members, there are exactly
 * `couples` married couples, every child's father and mother are both in the family (no single parent), the
 * family is connected, and (when stated) it spans exactly three generations. Worlds = every family structure
 * and gender assignment meeting the stem (enumerated once per stem and memoised), so "How is M related to N?"
 * is sufficient iff every consistent world gives the same kinship term.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty, FamilyLink, FamilyMember, VisualSpec } from '../../../types';
import { NUM_WORD, findPair, listAnd, listOr, sizesFor, worldScenario, type Category, type DsDraft } from './common';

export const KIN = [
  'other',
  'father', 'mother', 'son', 'daughter', 'brother', 'sister', 'husband', 'wife',
  'grandfather', 'grandmother', 'grandson', 'granddaughter',
  'father-in-law', 'mother-in-law', 'son-in-law', 'daughter-in-law', 'brother-in-law', 'sister-in-law',
  'uncle', 'aunt', 'nephew', 'niece', 'cousin',
] as const;
export type Kin = (typeof KIN)[number];
export const NEUTRAL = { parent: ['father', 'mother'], child: ['son', 'daughter'], sibling: ['brother', 'sister'], spouse: ['husband', 'wife'], grandparent: ['grandfather', 'grandmother'], grandchild: ['grandson', 'granddaughter'] } as const;
export type FamWord = Exclude<Kin, 'other'> | keyof typeof NEUTRAL;

export type FamClue =
  | { t: 'rel'; a: string; b: string; w: FamWord }
  | { t: 'gender'; a: string; g: 'm' | 'f' }
  | { t: 'married'; a: string; yes: boolean }
  | { t: 'childless'; a: string };

export interface DsFamilyFacts {
  kind: 'family';
  people: string[];
  couples: number;
  threeGen: boolean;
  I: FamClue[];
  II: FamClue[];
  ask: { a: string; b: string };
}

interface World {
  g: number[]; // 0 male, 1 female
  sp: number[];
  fa: number[];
  mo: number[];
  rel: Uint8Array; // rel[a*n+b] = KIN index of "a is the ___ of b"
}

function kinOf(w: Omit<World, 'rel'>, a: number, b: number): Kin {
  const { g, sp, fa, mo } = w;
  const m = g[a] === 0;
  const pk = (x: Kin, y: Kin): Kin => (m ? x : y);
  const par = (x: number) => (fa[x] >= 0 ? [fa[x], mo[x]] : []);
  const sib = (x: number, y: number) => x >= 0 && y >= 0 && x !== y && fa[x] >= 0 && fa[x] === fa[y];
  if (sp[a] === b) return pk('husband', 'wife');
  if (fa[b] === a || mo[b] === a) return pk('father', 'mother');
  if (fa[a] === b || mo[a] === b) return pk('son', 'daughter');
  if (sib(a, b)) return pk('brother', 'sister');
  if (par(b).some((p) => par(p).includes(a))) return pk('grandfather', 'grandmother');
  if (par(a).some((p) => par(p).includes(b))) return pk('grandson', 'granddaughter');
  if (sp[b] >= 0 && par(sp[b]).includes(a)) return pk('father-in-law', 'mother-in-law');
  if (sp[a] >= 0 && par(sp[a]).includes(b)) return pk('son-in-law', 'daughter-in-law');
  if ((sp[b] >= 0 && sib(a, sp[b])) || (sp[a] >= 0 && sib(sp[a], b))) return pk('brother-in-law', 'sister-in-law');
  if (par(b).some((p) => sib(a, p) || (sp[a] >= 0 && sib(sp[a], p)))) return pk('uncle', 'aunt');
  if (par(a).some((p) => sib(b, p) || (sp[b] >= 0 && sib(sp[b], p)))) return pk('nephew', 'niece');
  if (par(a).some((p) => par(b).some((q) => sib(p, q)))) return 'cousin';
  return 'other';
}

const memo = new Map<string, World[]>();

/** Every family meeting the stem (pure; memoised because the same few stems recur). */
export function familyWorlds(n: number, couples: number, threeGen: boolean): World[] {
  const key = `${n}:${couples}:${threeGen}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const out: World[] = [];
  // all sets of `couples` disjoint unordered pairs
  const matchings: [number, number][][] = [];
  const rec = (start: number, used: number, acc: [number, number][]) => {
    if (acc.length === couples) {
      matchings.push(acc.slice());
      return;
    }
    for (let a = start; a < n; a++) {
      if (used & (1 << a)) continue;
      for (let b = a + 1; b < n; b++) {
        if (used & (1 << b)) continue;
        acc.push([a, b]);
        rec(a + 1, used | (1 << a) | (1 << b), acc);
        acc.pop();
      }
    }
  };
  rec(0, 0, []);
  const p = new Array<number>(n).fill(-1);
  for (const M of matchings) {
    const coupleOf = new Array<number>(n).fill(-1);
    M.forEach(([a, b], i) => {
      coupleOf[a] = i;
      coupleOf[b] = i;
    });
    const total = (couples + 1) ** n;
    for (let code = 0; code < total; code++) {
      let x = code;
      let bad = false;
      for (let i = 0; i < n; i++) {
        p[i] = (x % (couples + 1)) - 1;
        x = Math.floor(x / (couples + 1));
        if (p[i] >= 0 && coupleOf[i] === p[i]) bad = true;
      }
      if (bad) continue;
      // generations: spouses equal, child = parent + 1; must be consistent and connected
      const gen = new Array<number>(n).fill(NaN);
      gen[0] = 0;
      let changed = true;
      let conflict = false;
      while (changed && !conflict) {
        changed = false;
        const setG = (i: number, v: number) => {
          if (Number.isNaN(gen[i])) {
            gen[i] = v;
            changed = true;
          } else if (gen[i] !== v) conflict = true;
        };
        for (let i = 0; i < n && !conflict; i++) {
          if (Number.isNaN(gen[i])) continue;
          if (coupleOf[i] >= 0) {
            const [a, b] = M[coupleOf[i]];
            setG(a === i ? b : a, gen[i]);
          }
          if (p[i] >= 0) for (const q of M[p[i]]) setG(q, gen[i] - 1);
          for (let j = 0; j < n; j++) if (p[j] >= 0 && M[p[j]].includes(i)) setG(j, gen[i] + 1);
        }
      }
      if (conflict || gen.some((v) => Number.isNaN(v))) continue;
      const lo = Math.min(...gen);
      const hi = Math.max(...gen);
      if (threeGen ? hi - lo !== 2 : hi - lo > 2) continue;
      // spouses must not be blood relatives (share an ancestor, counting themselves)
      const anc = (i: number): Set<number> => {
        const s = new Set<number>([i]);
        const stack = [i];
        while (stack.length) {
          const y = stack.pop()!;
          if (p[y] >= 0) for (const q of M[p[y]]) if (!s.has(q)) (s.add(q), stack.push(q));
        }
        return s;
      };
      if (M.some(([a, b]) => [...anc(a)].some((q) => anc(b).has(q)))) continue;
      // genders: each couple one of two orientations, singles free
      const singles = [...Array(n).keys()].filter((i) => coupleOf[i] < 0);
      for (let gm = 0; gm < 1 << (couples + singles.length); gm++) {
        const g = new Array<number>(n).fill(0);
        M.forEach(([a, b], i) => {
          const f = (gm >> i) & 1;
          g[a] = f;
          g[b] = 1 - f;
        });
        singles.forEach((s, i) => (g[s] = (gm >> (couples + i)) & 1));
        const sp = new Array<number>(n).fill(-1);
        for (const [a, b] of M) {
          sp[a] = b;
          sp[b] = a;
        }
        const fa = p.map((c) => (c < 0 ? -1 : g[M[c][0]] === 0 ? M[c][0] : M[c][1]));
        const mo = p.map((c) => (c < 0 ? -1 : g[M[c][0]] === 0 ? M[c][1] : M[c][0]));
        const base = { g, sp, fa, mo };
        const rel = new Uint8Array(n * n);
        for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) rel[a * n + b] = KIN.indexOf(kinOf(base, a, b));
        out.push({ ...base, rel });
      }
    }
  }
  memo.set(key, out);
  return out;
}

function wordMatches(w: FamWord, k: Kin): boolean {
  if (w in NEUTRAL) return (NEUTRAL[w as keyof typeof NEUTRAL] as readonly string[]).includes(k);
  return w === k;
}

function holds(world: World, n: number, idx: (x: string) => number, c: FamClue): boolean {
  const a = idx(c.a);
  switch (c.t) {
    case 'rel':
      return wordMatches(c.w, KIN[world.rel[a * n + idx(c.b)]]);
    case 'gender':
      return world.g[a] === (c.g === 'm' ? 0 : 1);
    case 'married':
      return (world.sp[a] >= 0) === c.yes;
    case 'childless':
      return !world.fa.includes(a) && !world.mo.includes(a);
  }
}

export function famClueText(c: FamClue): string {
  switch (c.t) {
    case 'rel':
      switch (c.w) {
        case 'parent':
          return `${c.a} is a parent of ${c.b}.`;
        case 'child':
          return `${c.a} is a child of ${c.b}.`;
        case 'sibling':
          return `${c.a} and ${c.b} are siblings.`;
        case 'spouse':
          return `${c.a} is married to ${c.b}.`;
        case 'grandparent':
          return `${c.a} is a grandparent of ${c.b}.`;
        case 'grandchild':
          return `${c.a} is a grandchild of ${c.b}.`;
        case 'cousin':
          return `${c.a} is a cousin of ${c.b}.`;
        default:
          return `${c.a} is the ${c.w} of ${c.b}.`;
      }
    case 'gender':
      return `${c.a} is ${c.g === 'm' ? 'male' : 'female'}.`;
    case 'married':
      return c.yes ? `${c.a} is married.` : `${c.a} is unmarried.`;
    case 'childless':
      return `${c.a} has no children.`;
  }
}

function neutralOf(k: Kin): FamWord | null {
  for (const [w, pair] of Object.entries(NEUTRAL)) if ((pair as readonly string[]).includes(k)) return w as FamWord;
  return null;
}

export function buildFamily(rng: Rng, d: Difficulty, target: Category): DsDraft<DsFamilyFacts> | null {
  const [n, couples, threeGen] = ({ easy: [5, 2, true], medium: [6, 2, true], hard: [6, 2, true], extreme: [6, 2, false] } as const)[d];
  const worlds = familyWorlds(n, couples, threeGen);
  const pool = rng.pick(['PQRSTUV', 'ABCDEFG', 'JKLMNPQ', 'LMNPQRS', 'DEFGHJK']);
  const people = pool.slice(0, n).split('');
  const idx = (x: string) => people.indexOf(x);
  const truth = rng.pick(worlds);
  // question pair with a proper kinship term (not directly married for variety at higher levels)
  const pairs: [number, number][] = [];
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      const k = KIN[truth.rel[a * n + b]];
      if (k === 'other') continue;
      if (d !== 'easy' && (k === 'husband' || k === 'wife')) continue;
      pairs.push([a, b]);
    }
  if (!pairs.length) return null;
  const [qa, qb] = rng.pick(pairs);
  const ask = { a: people[qa], b: people[qb] };
  const atoms: FamClue[] = [];
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      const k = KIN[truth.rel[a * n + b]];
      if (k === 'other') continue;
      const direct = (a === qa && b === qb) || (a === qb && b === qa);
      if (direct && d !== 'easy') continue; // no statement names the asked relation outright
      if (!direct || rng.chance(0.3)) atoms.push({ t: 'rel', a: people[a], b: people[b], w: k });
      const neu = neutralOf(k);
      if (neu && (neu !== 'sibling' && neu !== 'spouse' ? true : a < b) && rng.chance(0.6)) atoms.push({ t: 'rel', a: people[a], b: people[b], w: neu });
    }
  for (let a = 0; a < n; a++) {
    if (rng.chance(0.5)) atoms.push({ t: 'gender', a: people[a], g: truth.g[a] === 0 ? 'm' : 'f' });
    if (rng.chance(0.25)) atoms.push({ t: 'married', a: people[a], yes: truth.sp[a] >= 0 });
    if (d !== 'easy' && !truth.fa.includes(a) && !truth.mo.includes(a) && rng.chance(0.25)) atoms.push({ t: 'childless', a: people[a] });
  }
  const sc = worldScenario<FamClue>(
    worlds.length,
    atoms,
    (c) => JSON.stringify(c),
    (c, w) => holds(worlds[w], n, idx, c),
    (w) => KIN[worlds[w].rel[qa * n + qb]],
    // real DS statements chain towards the asked persons: each statement must mention one of them
    { accept: (cl) => cl.some((c) => c.a === ask.a || c.a === ask.b || (c.t === 'rel' && (c.b === ask.a || c.b === ask.b))) },
  );
  const sizes = sizesFor(d, [1, 2], [2, 2], [2, 3], [2, 3]);
  const res = findPair(rng, sc, target, sizes, 40);
  if (!res) return null;
  const text = (cl: FamClue[]) => cl.map(famClueText).join(' ');
  const term = (k: string) => (k === 'other' ? 'related in some other way' : k === 'cousin' ? 'a cousin' : `the ${k}`);
  const say = (ans: Set<string>): string => {
    const xs = [...ans].sort();
    return xs.length === 1 ? `${ask.a} is ${term(xs[0])} of ${ask.b}` : `${ask.a} could be ${listOr(xs.map(term))} of ${ask.b}`;
  };
  const both = worlds.filter((w) => [...res.I, ...res.II].every((c) => holds(w, n, idx, c)));
  let visual: VisualSpec | undefined;
  if (both.length) {
    const w = both.includes(truth) ? truth : both[0];
    const gen = generations(w, n);
    const members: FamilyMember[] = people.map((name, i) => ({ id: name, name, gender: w.g[i] === 0 ? 'm' : 'f', generation: gen[i] }));
    const links: FamilyLink[] = [];
    for (let i = 0; i < n; i++) {
      if (w.sp[i] > i) links.push({ type: 'spouse', a: people[i], b: people[w.sp[i]] });
      if (w.fa[i] >= 0) links.push({ type: 'parent', parent: people[w.fa[i]], child: people[i] }, { type: 'parent', parent: people[w.mo[i]], child: people[i] });
    }
    visual = { type: 'family', members, links, caption: both.length === 1 ? 'The only family that fits I and II together' : 'One family that fits I and II together' };
  }
  return {
    facts: { kind: 'family', people, couples, threeGen, I: res.I, II: res.II, ask },
    context: `${listAnd(people)} are the only ${NUM_WORD[n]} members of a family${threeGen ? ' of three generations' : ''}. There are ${NUM_WORD[couples]} married couples in the family, and every child in the family has both parents in the family.`,
    question: `How is ${ask.a} related to ${ask.b}?`,
    I: text(res.I),
    II: text(res.II),
    say,
    shortcut: 'Draw the tree with + (male) and − (female). A statement is sufficient only if it fixes both the link between the two persons and the gender of the first one.',
    visual,
    tags: ['ds:blood-relation', 'blood-relation:closed-family'],
    res,
  };
}

function generations(w: World, n: number): number[] {
  const gen = new Array<number>(n).fill(NaN);
  gen[0] = 0;
  for (let it = 0; it < 3 * n; it++)
    for (let i = 0; i < n; i++) {
      if (Number.isNaN(gen[i])) continue;
      if (w.sp[i] >= 0 && Number.isNaN(gen[w.sp[i]])) gen[w.sp[i]] = gen[i];
      if (w.fa[i] >= 0 && Number.isNaN(gen[w.fa[i]])) (gen[w.fa[i]] = gen[i] - 1), (gen[w.mo[i]] = gen[i] - 1);
      for (let j = 0; j < n; j++) if ((w.fa[j] === i || w.mo[j] === i) && Number.isNaN(gen[j])) gen[j] = gen[i] + 1;
    }
  const lo = Math.min(...gen);
  return gen.map((x) => x - lo);
}
