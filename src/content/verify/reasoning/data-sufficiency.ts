/**
 * Independent verifier for reasoning.data-sufficiency. For each of I, II and I + II it recomputes the set of
 * possible answers with a different enumeration from the generator's, then maps the sufficiency pattern to the
 * fixed option order (A: I alone, B: II alone, C: either, D: both needed, E: not sufficient).
 *
 *  - ranking:  backtracking that gives each person a rank (1 = top) and checks clues as soon as they are bound
 *  - seating:  backtracking person → seat over ALL n! seatings (no rotation fixing), right/left derived from facing
 *  - family:   gender-first enumeration of closed families; kinship from lowest-common-ancestor distances
 *  - direction: per-axis coordinate enumeration (the two axes are independent), answers = product of axes
 *  - coding:   signature classes — a word can take a code iff both occur in exactly the same given sentences
 */
import type { GenResult } from '../../generators/types';
import type {
  CodedSentence,
  DataSufficiencyFacts,
  DirClue,
  DsCodingFacts,
  DsDirectionFacts,
  DsFamilyFacts,
  DsRankingFacts,
  DsSeatingFacts,
  FamClue,
  RankClue,
  SeatClue,
} from '../../generators/reasoning/data-sufficiency';

function category(sI: boolean, sII: boolean, sBoth: boolean): number {
  if (sI && sII) return 2;
  if (sI) return 0;
  if (sII) return 1;
  if (sBoth) return 3;
  return 4;
}

/* ------------------------------ ranking ------------------------------ */

function rankHolds(rank: Map<string, number>, n: number, c: RankClue): boolean | null {
  const R = (x: string) => rank.get(x);
  const need = c.t === 'between' ? [c.a, c.lo, c.hi] : c.t === 'gt' ? [c.a, c.b] : [c.a];
  if (need.some((x) => R(x) === undefined)) return null;
  switch (c.t) {
    case 'gt':
      return R(c.a)! < R(c.b)!;
    case 'rank':
      return R(c.a)! === (c.from === 'top' ? c.k : n + 1 - c.k);
    case 'between':
      return R(c.hi)! < R(c.a)! && R(c.a)! < R(c.lo)!;
    case 'not':
      return R(c.a)! !== (c.end === 'top' ? 1 : n);
  }
}

function rankingAnswers(f: DsRankingFacts, clues: RankClue[]): Set<string> {
  const n = f.people.length;
  const out = new Set<string>();
  const rank = new Map<string, number>();
  const used = new Set<number>();
  const rec = (i: number) => {
    for (const c of clues) if (rankHolds(rank, n, c) === false) return;
    if (i === n) {
      const ask = f.ask;
      if (ask.t === 'who') {
        const want = ask.from === 'top' ? ask.k : n + 1 - ask.k;
        for (const [p, r] of rank) if (r === want) out.add(p);
      } else if (ask.t === 'count') out.add(String(rank.get(ask.a)! - 1));
      else out.add(rank.get(ask.a) === 1 ? 'yes' : 'no');
      return;
    }
    for (let r = 1; r <= n; r++) {
      if (used.has(r)) continue;
      used.add(r);
      rank.set(f.people[i], r);
      rec(i + 1);
      rank.delete(f.people[i]);
      used.delete(r);
    }
  };
  rec(0);
  return out;
}

/* ------------------------------ seating ------------------------------ */

function seatingAnswers(f: DsSeatingFacts, clues: SeatClue[]): Set<string> {
  const n = f.people.length;
  const lin = f.layout === 'linear';
  // Linear, facing north: a person's right is the next seat towards the east (index + 1).
  // Circular, facing the centre, seats numbered clockwise: the right hand points anticlockwise (index − 1).
  const RIGHT = lin ? 1 : -1;
  const move = (s: number, k: number, side: 'left' | 'right'): number | null => {
    const t = s + (side === 'right' ? RIGHT : -RIGHT) * k;
    if (lin) return t < 0 || t >= n ? null : t;
    return ((t % n) + n) % n;
  };
  const gapAround = (x: number, y: number) => {
    const d = Math.abs(x - y);
    return lin ? d : Math.min(d, n - d);
  };
  const seat = new Map<string, number>();
  const check = (c: SeatClue): boolean | null => {
    const names = 'b' in c ? [c.a, c.b] : [c.a];
    if (names.some((x) => !seat.has(x))) return null;
    const A = seat.get(c.a)!;
    switch (c.t) {
      case 'rel':
        return move(seat.get(c.b)!, c.k, c.side) === A;
      case 'adj':
        return gapAround(A, seat.get(c.b)!) === 1;
      case 'nadj':
        return gapAround(A, seat.get(c.b)!) !== 1;
      case 'gap':
        return Math.abs(A - seat.get(c.b)!) === c.k + 1;
      case 'end':
        return A === 0 || A === n - 1;
      case 'nend':
        return A > 0 && A < n - 1;
      case 'opp':
        return gapAround(A, seat.get(c.b)!) * 2 === n;
    }
  };
  const out = new Set<string>();
  const taken: (string | undefined)[] = new Array(n);
  const rec = (i: number) => {
    for (const c of clues) if (check(c) === false) return;
    if (i === n) {
      const ask = f.ask;
      let s: number | null;
      if (ask.t === 'rel') s = move(seat.get(ask.of)!, ask.k, ask.side);
      else if (ask.t === 'end') s = ask.side === 'left' ? 0 : n - 1; // facing north: the left end is the west end
      else if (ask.t === 'middle') s = (n - 1) / 2;
      else s = (seat.get(ask.of)! + n / 2) % n;
      out.add(s === null ? '(nobody)' : taken[s]!);
      return;
    }
    for (let s = 0; s < n; s++) {
      if (taken[s] !== undefined) continue;
      taken[s] = f.people[i];
      seat.set(f.people[i], s);
      rec(i + 1);
      seat.delete(f.people[i]);
      taken[s] = undefined;
    }
  };
  rec(0);
  return out;
}

/* ------------------------------ family ------------------------------ */

interface Fam {
  /** kinship cache: kin[a * n + b] */
  kin?: string[];
  male: boolean[];
  spouse: (number | null)[];
  father: (number | null)[];
  mother: (number | null)[];
}

const famMemo = new Map<string, Fam[]>();

function families(n: number, couples: number, threeGen: boolean): Fam[] {
  const key = `${n}/${couples}/${threeGen}`;
  const hit = famMemo.get(key);
  if (hit) return hit;
  const out: Fam[] = [];
  for (let gmask = 0; gmask < 1 << n; gmask++) {
    const male = Array.from({ length: n }, (_, i) => ((gmask >> i) & 1) === 0);
    const men = male.flatMap((m, i) => (m ? [i] : []));
    const women = male.flatMap((m, i) => (m ? [] : [i]));
    // couples as (husband, wife) with strictly increasing husbands (unordered set of couples)
    const coupleSets: [number, number][][] = [];
    const pick = (hi: number, usedW: Set<number>, acc: [number, number][]) => {
      if (acc.length === couples) {
        coupleSets.push(acc.slice());
        return;
      }
      for (let h = hi; h < men.length; h++)
        for (const w of women) {
          if (usedW.has(w)) continue;
          usedW.add(w);
          acc.push([men[h], w]);
          pick(h + 1, usedW, acc);
          acc.pop();
          usedW.delete(w);
        }
    };
    pick(0, new Set(), []);
    for (const cs of coupleSets) {
      const spouse: (number | null)[] = new Array(n).fill(null);
      for (const [h, w] of cs) (spouse[h] = w), (spouse[w] = h);
      const options = cs.length + 1;
      const father: (number | null)[] = new Array(n).fill(null);
      const mother: (number | null)[] = new Array(n).fill(null);
      const rec = (i: number) => {
        if (i === n) {
          if (valid(n, spouse, father, mother, threeGen)) out.push({ male, spouse: spouse.slice(), father: father.slice(), mother: mother.slice() });
          return;
        }
        for (let o = 0; o < options; o++) {
          if (o === 0) (father[i] = null), (mother[i] = null);
          else {
            const [h, w] = cs[o - 1];
            if (h === i || w === i) continue;
            father[i] = h;
            mother[i] = w;
          }
          rec(i + 1);
        }
        father[i] = null;
        mother[i] = null;
      };
      rec(0);
    }
  }
  famMemo.set(key, out);
  return out;
}

function ancestorsWithDepth(father: (number | null)[], mother: (number | null)[], x: number): Map<number, number> {
  const m = new Map<number, number>([[x, 0]]);
  let frontier = [x];
  let depth = 0;
  while (frontier.length && depth < 10) {
    depth++;
    const next: number[] = [];
    for (const y of frontier)
      for (const p of [father[y], mother[y]]) if (p !== null && !m.has(p)) (m.set(p, depth), next.push(p));
    frontier = next;
  }
  return m;
}

function valid(n: number, spouse: (number | null)[], father: (number | null)[], mother: (number | null)[], threeGen: boolean): boolean {
  // no one is their own ancestor
  for (let x = 0; x < n; x++) {
    const seen = new Set<number>();
    const stack = [x];
    while (stack.length) {
      const y = stack.pop()!;
      for (const p of [father[y], mother[y]]) {
        if (p === null) continue;
        if (p === x) return false;
        if (!seen.has(p)) (seen.add(p), stack.push(p));
      }
    }
  }
  // generation labels by breadth-first propagation: spouse = same level, parent = level − 1
  const level: (number | null)[] = new Array(n).fill(null);
  level[0] = 0;
  const queue = [0];
  const put = (x: number, v: number): boolean => {
    if (level[x] === null) {
      level[x] = v;
      queue.push(x);
      return true;
    }
    return level[x] === v;
  };
  while (queue.length) {
    const x = queue.shift()!;
    const v = level[x]!;
    if (spouse[x] !== null && !put(spouse[x]!, v)) return false;
    if (father[x] !== null && (!put(father[x]!, v - 1) || !put(mother[x]!, v - 1))) return false;
    for (let y = 0; y < n; y++) if ((father[y] === x || mother[y] === x) && !put(y, v + 1)) return false;
  }
  if (level.some((v) => v === null)) return false; // not connected
  const span = Math.max(...(level as number[])) - Math.min(...(level as number[]));
  if (threeGen ? span !== 2 : span > 2) return false;
  // spouses share no ancestor (counting themselves)
  for (let x = 0; x < n; x++) {
    const s = spouse[x];
    if (s === null || s < x) continue;
    const ax = ancestorsWithDepth(father, mother, x);
    for (const k of ancestorsWithDepth(father, mother, s).keys()) if (ax.has(k)) return false;
  }
  // connected through marriage and parenthood
  const parent = [...Array(n).keys()];
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const join = (a: number, b: number) => (parent[find(a)] = find(b));
  for (let x = 0; x < n; x++) {
    if (spouse[x] !== null) join(x, spouse[x]!);
    if (father[x] !== null) join(x, father[x]!);
  }
  return [...Array(n).keys()].every((x) => find(x) === find(0));
}

/** "a is the ___ of b" from blood distances (steps up to the nearest common ancestor). */
function kinship(f: Fam, a: number, b: number): string {
  const g = (m: string, w: string) => (f.male[a] ? m : w);
  if (f.spouse[a] === b) return g('husband', 'wife');
  const blood = (x: number, y: number): [number, number] | null => {
    const ax = ancestorsWithDepth(f.father, f.mother, x);
    const ay = ancestorsWithDepth(f.father, f.mother, y);
    let best: [number, number] | null = null;
    for (const [k, dx] of ax) {
      const dy = ay.get(k);
      if (dy !== undefined && (!best || dx + dy < best[0] + best[1])) best = [dx, dy];
    }
    return best;
  };
  const is = (d: [number, number] | null, x: number, y: number) => !!d && d[0] === x && d[1] === y;
  const bl = blood(a, b);
  if (bl) {
    if (is(bl, 0, 1)) return g('father', 'mother');
    if (is(bl, 1, 0)) return g('son', 'daughter');
    if (is(bl, 1, 1)) return g('brother', 'sister');
    if (is(bl, 0, 2)) return g('grandfather', 'grandmother');
    if (is(bl, 2, 0)) return g('grandson', 'granddaughter');
    if (is(bl, 1, 2)) return g('uncle', 'aunt');
    if (is(bl, 2, 1)) return g('nephew', 'niece');
    if (is(bl, 2, 2)) return 'cousin';
    return 'other';
  }
  const sb = f.spouse[b];
  if (sb !== null) {
    const d = blood(a, sb);
    if (is(d, 0, 1)) return g('father-in-law', 'mother-in-law');
    if (is(d, 1, 1)) return g('brother-in-law', 'sister-in-law');
    if (is(d, 2, 1)) return g('nephew', 'niece');
  }
  const sa = f.spouse[a];
  if (sa !== null) {
    const d = blood(sa, b);
    if (is(d, 1, 0)) return g('son-in-law', 'daughter-in-law');
    if (is(d, 1, 1)) return g('brother-in-law', 'sister-in-law');
    if (is(d, 1, 2)) return g('uncle', 'aunt');
  }
  return 'other';
}

const NEUTRAL: Record<string, string[]> = {
  parent: ['father', 'mother'],
  child: ['son', 'daughter'],
  sibling: ['brother', 'sister'],
  spouse: ['husband', 'wife'],
  grandparent: ['grandfather', 'grandmother'],
  grandchild: ['grandson', 'granddaughter'],
};

function kinOf(fam: Fam, a: number, b: number): string {
  const n = fam.male.length;
  if (!fam.kin) fam.kin = new Array<string>(n * n);
  return (fam.kin[a * n + b] ??= kinship(fam, a, b));
}

function famHolds(fam: Fam, ix: (x: string) => number, c: FamClue): boolean {
  const a = ix(c.a);
  switch (c.t) {
    case 'rel': {
      const k = kinOf(fam, a, ix(c.b));
      return NEUTRAL[c.w] ? NEUTRAL[c.w].includes(k) : k === c.w;
    }
    case 'gender':
      return fam.male[a] === (c.g === 'm');
    case 'married':
      return (fam.spouse[a] !== null) === c.yes;
    case 'childless':
      return fam.father.every((p) => p !== a) && fam.mother.every((p) => p !== a);
  }
}

function familyAnswers(f: DsFamilyFacts, clues: FamClue[]): Set<string> {
  const ix = (x: string) => f.people.indexOf(x);
  const out = new Set<string>();
  for (const fam of families(f.people.length, f.couples, f.threeGen))
    if (clues.every((c) => famHolds(fam, ix, c))) out.add(kinOf(fam, ix(f.ask.a), ix(f.ask.b)));
  return out;
}

/* ------------------------------ direction ------------------------------ */

const UNIT: Record<string, [number, number]> = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] };

/** Possible values of coord(a) − coord(b) on one axis, or null if a is not linked to b. */
function axisValues(clues: DirClue[], a: string, b: string, axis: 0 | 1): number[] | null {
  const linked = new Set([b]);
  const order: string[] = [b];
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of clues)
      for (const [x, y] of [[c.a, c.b], [c.b, c.a]])
        if (linked.has(x) && !linked.has(y)) (linked.add(y), order.push(y), (grew = true));
  }
  if (!linked.has(a)) return null;
  const S = 1 + clues.reduce((s, c) => s + (c.t === 'exact' ? Math.abs(UNIT[c.dir][axis]) * c.d : Math.abs(UNIT[c.dir][axis])), 0);
  const R = 2 * S + 2;
  const val = new Map<string, number>([[b, 0]]);
  const sat = (c: DirClue): boolean | null => {
    const va = val.get(c.a);
    const vb = val.get(c.b);
    if (va === undefined || vb === undefined) return null;
    const u = UNIT[c.dir][axis];
    if (c.t === 'exact') return va - vb === u * c.d;
    return u === 0 ? va === vb : (va - vb) * u > 0;
  };
  const out = new Set<number>();
  const rec = (i: number) => {
    for (const c of clues) if (sat(c) === false) return;
    if (i === order.length) {
      out.add(val.get(a)!);
      return;
    }
    const p = order[i];
    // a clue that pins p's coordinate on this axis relative to an already placed point leaves one value
    let forced: number | null = null;
    for (const c of clues) {
      const other = c.a === p ? c.b : c.b === p ? c.a : null;
      if (other === null || !val.has(other)) continue;
      const u = UNIT[c.dir][axis];
      if (c.t === 'line' && u !== 0) continue;
      const off = c.t === 'exact' ? u * c.d : 0; // coord(a) − coord(b)
      forced = c.a === p ? val.get(other)! + off : val.get(other)! - off;
      break;
    }
    for (let v = forced ?? -R; v <= (forced ?? R); v++) {
      val.set(p, v);
      rec(i + 1);
    }
    val.delete(p);
  };
  rec(1);
  return [...out];
}

function directionAnswers(f: DsDirectionFacts, clues: DirClue[]): Set<string> {
  const { a, b } = f.ask;
  const xs = axisValues(clues, a, b, 0);
  const ys = axisValues(clues, a, b, 1);
  if (!xs || !ys) return new Set(['unlinked:1', 'unlinked:2']);
  const out = new Set<string>();
  for (const x of xs)
    for (const y of ys) {
      if (f.ask.t === 'dist') out.add(x === 0 && y === 0 ? 'same' : `d2:${x * x + y * y}`);
      else {
        const ns = y > 0 ? 'north' : y < 0 ? 'south' : '';
        const ew = x > 0 ? 'east' : x < 0 ? 'west' : '';
        out.add(!ns && !ew ? 'same' : ns && ew ? `${ns}-${ew}` : ns + ew);
      }
    }
  return out;
}

/* ------------------------------ coding ------------------------------ */

function codingAnswers(f: DsCodingFacts, sents: CodedSentence[]): Set<string> {
  const wordSig = (w: string) => sents.map((s) => (s.words.includes(w) ? '1' : '0')).join('');
  const codeSig = (c: string) => sents.map((s) => (s.codes.includes(c) ? '1' : '0')).join('');
  const words = [...new Set(sents.flatMap((s) => s.words))];
  const codes = [...new Set(sents.flatMap((s) => s.codes))];
  if (f.ask.t === 'code') {
    if (!words.includes(f.ask.word)) return new Set(['unknown:1', 'unknown:2']);
    const sig = wordSig(f.ask.word);
    return new Set(codes.filter((c) => codeSig(c) === sig));
  }
  if (!codes.includes(f.ask.code)) return new Set(['unknown:1', 'unknown:2']);
  const sig = codeSig(f.ask.code);
  return new Set(words.filter((w) => wordSig(w) === sig));
}

/* ------------------------------ dispatch ------------------------------ */

export function answerSet(f: DataSufficiencyFacts, clues: unknown[]): Set<string> {
  switch (f.kind) {
    case 'ranking':
      return rankingAnswers(f, clues as RankClue[]);
    case 'seating':
      return seatingAnswers(f, clues as SeatClue[]);
    case 'family':
      return familyAnswers(f, clues as FamClue[]);
    case 'direction':
      return directionAnswers(f, clues as DirClue[]);
    case 'coding':
      return codingAnswers(f, clues as CodedSentence[]);
  }
}

export function verifyDs(f: DataSufficiencyFacts): number {
  const I = answerSet(f, f.I as unknown[]);
  const II = answerSet(f, f.II as unknown[]);
  const both = answerSet(f, [...(f.I as unknown[]), ...(f.II as unknown[])]);
  if (!I.size || !II.size || !both.size) throw new Error('statements are inconsistent');
  return category(I.size === 1, II.size === 1, both.size === 1);
}

export function verify(res: GenResult<DataSufficiencyFacts>): number[] {
  return [verifyDs(res.facts)];
}
