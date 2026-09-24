/**
 * Independent verifier for reasoning.seating — a "virtual student".
 *
 * It reads only what the aspirant sees: the introduction, the numbered clue sentences, each prompt and its
 * options. Clue sentences are parsed back into constraints; nothing is taken from the generator's structured
 * clues except a count cross-check. Semantics are geometric (different from the generator's index arithmetic):
 * every seat has 2-D coordinates, a person's right hand is their facing vector turned 90° clockwise, and
 * "k-th to the right" walks seat to seat starting towards that hand.
 *
 * Solving: exhaustive permutation enumeration for small fixed-facing puzzles (≤ 8 persons); otherwise a
 * separately written domain-propagation CSP (forward checking, smallest domain first). The arrangement must be
 * unique (rings up to rotation; uncertain rows: exactly one N within a bound derived here by interval
 * relaxation), and every question must have exactly one matching option.
 */
import type { GenResult } from '../../generators/types';
import type { SeatingFacts } from '../../generators/reasoning/seating';
import type { Item } from '../../types';

type Side = 'left' | 'right';
type Face = 'N' | 'S' | 'I' | 'O';
type Kind = 'row' | 'parallel' | 'uncertain' | 'circle' | 'square';

type Ref = { t: 'p'; p: number } | { t: 'v'; v: number } | { t: 'rel'; side: Side; k: number; of: Ref } | { t: 'opp'; of: Ref } | { t: 'front'; of: Ref };

type Con =
  | { c: 'rel'; a: Ref; side: Side; k: number; b: Ref }
  | { c: 'gap'; a: Ref; b: Ref; n: number }
  | { c: 'adj'; a: Ref; b: Ref; neg: boolean }
  | { c: 'face'; a: Ref; f: Face }
  | { c: 'same'; a: Ref; b: Ref; same: boolean }
  | { c: 'end'; a: Ref; neg: boolean }
  | { c: 'endSide'; a: Ref; side: Side; k: number }
  | { c: 'middle'; a: Ref }
  | { c: 'opp'; a: Ref; b: Ref }
  | { c: 'faces'; a: Ref; b: Ref }
  | { c: 'behind'; a: Ref; b: Ref }
  | { c: 'diag'; a: Ref; b: Ref }
  | { c: 'corner'; a: Ref; corner: boolean }
  | { c: 'row'; a: Ref; row: number }
  | { c: 'sameRow'; a: Ref; b: Ref; same: boolean }
  | { c: 'asMany'; a: Ref; b: Ref; c2: Ref }
  | { c: 'sideCount'; a: Ref; side: Side; n: number }
  | { c: 'sideEq'; a: Ref; b: Ref }
  | { c: 'attr'; a: Ref; v: number; neg: boolean };

interface Puzzle {
  kind: Kind;
  names: string[];
  attrCat?: 'profession' | 'colour' | 'city';
  values: string[];
  /** seats per row / ring size */
  len: number;
  /** facing rule */
  rule: 'N' | 'S' | 'I' | 'mixedRow' | 'mixedRing' | 'rowsFacing' | 'rowsNorth' | 'cinMout' | 'coutMin';
  rows?: [number[], number[]];
  cons: Con[][];
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const ORDS = ['', 'immediate', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'];
const COUNT_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

function fail(msg: string): never {
  throw new Error(`seating verifier: ${msg}`);
}

function splitList(s: string): string[] {
  const m = s.match(/^(.*) and ([^,]+)$/);
  if (!m) return [s.trim()];
  return [...m[1].split(', ').map((x) => x.trim()), m[2].trim()];
}

const wordNum = (w: string): number => {
  const i = WORDS.indexOf(w.toLowerCase());
  if (i >= 0) return i;
  if (/^\d+$/.test(w)) return Number(w);
  return fail(`not a number word "${w}"`);
};

const faceWord = (w: string): Face => (w === 'the centre' ? 'I' : w === 'outside' ? 'O' : w === 'north' ? 'N' : w === 'south' ? 'S' : fail(`facing "${w}"`));

/* ------------------------------------------------------------------ */
/* Intro                                                               */
/* ------------------------------------------------------------------ */

function parseIntro(intro: string): Omit<Puzzle, 'cons'> {
  let m: RegExpMatchArray | null;
  let base: Omit<Puzzle, 'cons' | 'values'> | null = null;
  if ((m = intro.match(/^(\w+) persons, (.+?), sit in a straight row facing (north|south), not necessarily in the same order\./))) {
    const names = splitList(m[2]);
    base = { kind: 'row', names, len: names.length, rule: m[3] === 'north' ? 'N' : 'S' };
  } else if ((m = intro.match(/^(\w+) persons, (.+?), sit in a straight row, not necessarily in the same order\. Some of them face north while the others face south\./))) {
    const names = splitList(m[2]);
    base = { kind: 'row', names, len: names.length, rule: 'mixedRow' };
  } else if ((m = intro.match(/^(\w+) persons sit in two parallel rows of (\w+) persons each/))) {
    const per = wordNum(m[2]);
    const facing = intro.includes('Persons in Row 1 face south and persons in Row 2 face north, so each person in Row 1 faces a person in Row 2.');
    const north = intro.includes('All of them face north and Row 1 is in front of Row 2');
    if (facing === north) fail('parallel facing rule');
    let names: string[];
    let rows: [number[], number[]] | undefined;
    const mm = intro.match(/ ([^.]+?) sit in Row 1, and ([^.]+?) sit in Row 2, not necessarily in the same order\./);
    if (mm) {
      const r1 = splitList(mm[1]);
      const r2 = splitList(mm[2]);
      names = [...r1, ...r2];
      rows = [r1.map((_, i) => i), r2.map((_, i) => r1.length + i)];
    } else {
      const ml = intro.match(/The persons are (.+?), not necessarily in the same order\./);
      if (!ml) fail('parallel names');
      names = splitList(ml[1]);
    }
    if (names.length !== 2 * per) fail('parallel count');
    base = { kind: 'parallel', names, len: per, rule: facing ? 'rowsFacing' : 'rowsNorth', ...(rows ? { rows } : {}) };
  } else if ((m = intro.match(/^A certain number of persons sit in a straight row facing north\. (.+?) are among them; the others are not named\./))) {
    base = { kind: 'uncertain', names: splitList(m[1]), len: 0, rule: 'N' };
  } else if ((m = intro.match(/^(\w+) persons, (.+?), sit around a circular table facing the centre, not necessarily in the same order\./))) {
    const names = splitList(m[2]);
    base = { kind: 'circle', names, len: names.length, rule: 'I' };
  } else if ((m = intro.match(/^(\w+) persons, (.+?), sit around a circular table, not necessarily in the same order\. Some of them face the centre while the others face outside \(away from the centre\)\./))) {
    const names = splitList(m[2]);
    base = { kind: 'circle', names, len: names.length, rule: 'mixedRing' };
  } else if ((m = intro.match(/^(\w+) persons, (.+?), sit around a square table, not necessarily in the same order\. Four of them sit at the four corners and the other four sit at the middle of each side\. (.+?\.)/))) {
    const names = splitList(m[2]);
    const r = m[3];
    const rule =
      r === 'Those at the corners face the centre, while those at the middle of the sides face outside.'
        ? 'cinMout'
        : r === 'Those at the corners face outside, while those at the middle of the sides face the centre.'
          ? 'coutMin'
          : r === 'All of them face the centre.'
            ? 'I'
            : r === 'Some of them face the centre while the others face outside.'
              ? 'mixedRing'
              : fail(`square rule "${r}"`);
    base = { kind: 'square', names, len: 8, rule };
    if (names.length !== 8) fail('square needs 8 persons');
  } else fail(`intro not recognised: ${intro.slice(0, 90)}`);
  const count = intro.match(/^(\w+) persons/);
  if (count && base.kind !== 'uncertain' && COUNT_WORDS.indexOf(count[1].toLowerCase()) !== base.names.length) fail('person count mismatch');
  let attrCat: Puzzle['attrCat'];
  let values: string[] = [];
  if ((m = intro.match(/Each of them has a different profession: (.+?)\./))) attrCat = 'profession';
  else if ((m = intro.match(/Each of them likes a different colour: (.+?)\./))) attrCat = 'colour';
  else if ((m = intro.match(/Each of them is from a different city: (.+?)\./))) attrCat = 'city';
  if (attrCat && m) {
    values = splitList(m[1]);
    if (values.length !== base.names.length) fail('attribute count');
  }
  if (new Set(base.names).size !== base.names.length) fail('duplicate names');
  return { ...base, ...(attrCat ? { attrCat } : {}), values };
}

/* ------------------------------------------------------------------ */
/* Sentences                                                           */
/* ------------------------------------------------------------------ */

type Slot = 'NP' | 'ORD' | 'SIDE' | 'CNT' | 'FACE' | 'ROW' | 'VAL' | 'NUMW';
type Tok = string | { slot: Slot };
const S = (slot: Slot): Tok => ({ slot });

class Parser {
  constructor(readonly pz: Omit<Puzzle, 'cons'>) {}

  np(s: string): Ref | null {
    const i = this.pz.names.indexOf(s);
    if (i >= 0) return { t: 'p', p: i };
    let m: RegExpMatchArray | null;
    const cat = this.pz.attrCat;
    if (cat === 'profession' && (m = s.match(/^the (\w+)$/))) {
      const v = this.pz.values.indexOf(m[1]);
      if (v >= 0) return { t: 'v', v };
    }
    if (cat === 'colour' && (m = s.match(/^the one who likes (\w+)$/))) {
      const v = this.pz.values.indexOf(m[1]);
      if (v >= 0) return { t: 'v', v };
    }
    if (cat === 'city' && (m = s.match(/^the person from (\w+)$/))) {
      const v = this.pz.values.indexOf(m[1]);
      if (v >= 0) return { t: 'v', v };
    }
    if ((m = s.match(/^the one who sits to the immediate (left|right) of (.+)$/))) {
      const of = this.np(m[2]);
      return of ? { t: 'rel', side: m[1] as Side, k: 1, of } : null;
    }
    if ((m = s.match(/^the one who sits (\w+) to the (left|right) of (.+)$/))) {
      const k = ORDS.indexOf(m[1]);
      const of = this.np(m[3]);
      return k >= 2 && of ? { t: 'rel', side: m[2] as Side, k, of } : null;
    }
    if ((m = s.match(/^the one who sits exactly opposite (.+)$/)) && this.pz.kind === 'circle') {
      const of = this.np(m[1]);
      return of ? { t: 'opp', of } : null;
    }
    if ((m = s.match(/^the one who faces (.+)$/)) && this.pz.kind === 'parallel') {
      const of = this.np(m[1]);
      return of ? { t: 'front', of } : null;
    }
    return null;
  }

  /** Match a token sequence against the whole string; returns slot values (NPs parsed) or null. */
  match(s: string, toks: Tok[]): unknown[] | null {
    const out: unknown[] = [];
    const go = (pos: number, ti: number): boolean => {
      if (ti === toks.length) return pos === s.length;
      const t = toks[ti];
      if (typeof t === 'string') return s.startsWith(t, pos) && go(pos + t.length, ti + 1);
      const rest = s.slice(pos);
      const tryVal = (len: number, v: unknown) => {
        out.push(v);
        if (go(pos + len, ti + 1)) return true;
        out.pop();
        return false;
      };
      switch (t.slot) {
        case 'NP':
          for (let end = s.length; end > pos; end--) {
            const r = this.np(s.slice(pos, end));
            if (r && tryVal(end - pos, r)) return true;
          }
          return false;
        case 'ORD': {
          for (let k = 2; k < ORDS.length; k++) if (rest.startsWith(ORDS[k]) && tryVal(ORDS[k].length, k)) return true;
          return false;
        }
        case 'SIDE':
          for (const w of ['left', 'right']) if (rest.startsWith(w) && tryVal(w.length, w)) return true;
          return false;
        case 'FACE':
          for (const w of ['the centre', 'outside', 'north', 'south']) if (rest.startsWith(w) && tryVal(w.length, faceWord(w))) return true;
          return false;
        case 'ROW':
          for (const w of ['1', '2']) if (rest.startsWith(w) && tryVal(1, Number(w) - 1)) return true;
          return false;
        case 'CNT': {
          if (rest.startsWith('one person sits') && tryVal('one person sits'.length, 1)) return true;
          for (let k = 2; k <= 30; k++) {
            const w = `${k <= 20 ? WORDS[k] : k} persons sit`;
            if (rest.startsWith(w) && tryVal(w.length, k)) return true;
          }
          return false;
        }
        case 'VAL':
          for (let v = 0; v < this.pz.values.length; v++) {
            const w = this.pz.values[v];
            if (rest.startsWith(w) && tryVal(w.length, v)) return true;
          }
          return false;
        case 'NUMW':
          return false;
      }
    };
    return go(0, 0) ? out : null;
  }

  /** One clause (no final full stop) → constraint conjunction. */
  clause(s0: string): Con[] {
    let s = s0.startsWith('The ') ? 'the ' + s0.slice(4) : s0;
    const app = s.match(/^(.*), who faces (the centre|outside|north|south)$/);
    if (app) {
      const head = this.clause(app[1]);
      const last = head[head.length - 1];
      if (head.length !== 1 || last.c !== 'rel' || last.b.t !== 'p') fail(`appositive on "${s0}"`);
      return [...head, { c: 'face', a: last.b, f: faceWord(app[2]) }];
    }
    const P = this.pz;
    const tries: [Tok[], (v: unknown[]) => Con[]][] = [
      [[S('NP'), ' sits to the immediate ', S('SIDE'), ' of ', S('NP')], (v) => [{ c: 'rel', a: v[0] as Ref, side: v[1] as Side, k: 1, b: v[2] as Ref }]],
      [[S('NP'), ' sits ', S('ORD'), ' to the ', S('SIDE'), ' of ', S('NP')], (v) => [{ c: 'rel', a: v[0] as Ref, k: v[1] as number, side: v[2] as Side, b: v[3] as Ref }]],
      [
        ['Only ', S('CNT'), ' between ', S('NP'), ' and ', S('NP'), ' when counted from the ', S('SIDE'), ' of ', S('NP')],
        (v) => {
          if (JSON.stringify(v[1]) !== JSON.stringify(v[4])) fail(`counted-from person differs in "${s0}"`);
          return [{ c: 'rel', a: v[2] as Ref, side: v[3] as Side, k: (v[0] as number) + 1, b: v[1] as Ref }];
        },
      ],
      [['Only ', S('CNT'), ' between ', S('NP'), ' and ', S('NP')], (v) => [{ c: 'gap', a: v[1] as Ref, b: v[2] as Ref, n: v[0] as number }]],
      [['Only ', S('CNT'), ' to the ', S('SIDE'), ' of ', S('NP')], (v) => [{ c: 'sideCount', n: v[0] as number, side: v[1] as Side, a: v[2] as Ref }]],
      [[S('NP'), ' is an immediate neighbour of ', S('NP')], (v) => [{ c: 'adj', a: v[0] as Ref, b: v[1] as Ref, neg: false }]],
      [[S('NP'), ' and ', S('NP'), ' are immediate neighbours'], (v) => [{ c: 'adj', a: v[0] as Ref, b: v[1] as Ref, neg: false }]],
      [[S('NP'), ' is not an immediate neighbour of ', S('NP')], (v) => [{ c: 'adj', a: v[0] as Ref, b: v[1] as Ref, neg: true }]],
      [
        ['Neither ', S('NP'), ' nor ', S('NP'), ' is an immediate neighbour of ', S('NP')],
        (v) => [
          { c: 'adj', a: v[0] as Ref, b: v[2] as Ref, neg: true },
          { c: 'adj', a: v[1] as Ref, b: v[2] as Ref, neg: true },
        ],
      ],
      [[S('NP'), ' faces ', S('FACE')], (v) => [{ c: 'face', a: v[0] as Ref, f: v[1] as Face }]],
      [[S('NP'), ' does not face ', S('FACE')], (v) => [{ c: 'face', a: v[0] as Ref, f: flip(v[1] as Face) }]],
      [[S('NP'), ' faces ', S('NP')], (v) => [{ c: 'faces', a: v[0] as Ref, b: v[1] as Ref }]],
      [[S('NP'), ' and ', S('NP'), ' face the same direction'], (v) => [{ c: 'same', a: v[0] as Ref, b: v[1] as Ref, same: true }]],
      [[S('NP'), ' and ', S('NP'), ' face opposite directions'], (v) => [{ c: 'same', a: v[0] as Ref, b: v[1] as Ref, same: false }]],
      [
        ['Both the immediate neighbours of ', S('NP'), ' face ', S('FACE')],
        (v) => [
          { c: 'face', a: { t: 'rel', side: 'left', k: 1, of: v[0] as Ref }, f: v[1] as Face },
          { c: 'face', a: { t: 'rel', side: 'right', k: 1, of: v[0] as Ref }, f: v[1] as Face },
        ],
      ],
      [['the immediate neighbours of ', S('NP'), ' face opposite directions'], (v) => [{ c: 'same', a: { t: 'rel', side: 'left', k: 1, of: v[0] as Ref }, b: { t: 'rel', side: 'right', k: 1, of: v[0] as Ref }, same: false }]],
      [[S('NP'), ' sits at one of the extreme ends of the row'], (v) => [{ c: 'end', a: v[0] as Ref, neg: false }]],
      [[S('NP'), ' does not sit at any of the extreme ends of the row'], (v) => [{ c: 'end', a: v[0] as Ref, neg: true }]],
      [
        ['Neither ', S('NP'), ' nor ', S('NP'), ' sits at an extreme end of the row'],
        (v) => [
          { c: 'end', a: v[0] as Ref, neg: true },
          { c: 'end', a: v[1] as Ref, neg: true },
        ],
      ],
      [[S('NP'), ' sits at the extreme ', S('SIDE'), ' end of the row'], (v) => [{ c: 'endSide', a: v[0] as Ref, side: v[1] as Side, k: 1 }]],
      [[S('NP'), ' sits ', S('ORD'), ' from the ', S('SIDE'), ' end of the row'], (v) => [{ c: 'endSide', a: v[0] as Ref, k: v[1] as number, side: v[2] as Side }]],
      [[S('NP'), ' sits exactly in the middle of the row'], (v) => [{ c: 'middle', a: v[0] as Ref }]],
      [
        [S('NP'), ' sits exactly opposite ', S('NP')],
        (v) =>
          P.kind === 'square'
            ? [
                { c: 'opp', a: v[0] as Ref, b: v[1] as Ref },
                { c: 'corner', a: v[0] as Ref, corner: false },
              ]
            : P.kind === 'circle'
              ? [{ c: 'opp', a: v[0] as Ref, b: v[1] as Ref }]
              : fail('"exactly opposite" outside a table'),
      ],
      [
        [S('NP'), ' sits diagonally opposite ', S('NP')],
        (v) =>
          P.kind === 'square'
            ? [
                { c: 'opp', a: v[0] as Ref, b: v[1] as Ref },
                { c: 'corner', a: v[0] as Ref, corner: true },
              ]
            : P.kind === 'parallel'
              ? [{ c: 'diag', a: v[0] as Ref, b: v[1] as Ref }]
              : fail('"diagonally opposite" here'),
      ],
      [[S('NP'), ' sits directly behind ', S('NP')], (v) => [{ c: 'behind', a: v[0] as Ref, b: v[1] as Ref }]],
      [[S('NP'), ' sits directly in front of ', S('NP')], (v) => [{ c: 'behind', a: v[1] as Ref, b: v[0] as Ref }]],
      [[S('NP'), ' sits at one of the corners'], (v) => [{ c: 'corner', a: v[0] as Ref, corner: true }]],
      [[S('NP'), ' sits at the middle of one of the sides'], (v) => [{ c: 'corner', a: v[0] as Ref, corner: false }]],
      [[S('NP'), ' does not sit at any of the corners'], (v) => [{ c: 'corner', a: v[0] as Ref, corner: false }]],
      [[S('NP'), ' sits in Row ', S('ROW')], (v) => [{ c: 'row', a: v[0] as Ref, row: v[1] as number }]],
      [[S('NP'), ' and ', S('NP'), ' sit in the same row'], (v) => [{ c: 'sameRow', a: v[0] as Ref, b: v[1] as Ref, same: true }]],
      [[S('NP'), ' and ', S('NP'), ' sit in different rows'], (v) => [{ c: 'sameRow', a: v[0] as Ref, b: v[1] as Ref, same: false }]],
      [
        ['As many persons sit between ', S('NP'), ' and ', S('NP'), ' as between ', S('NP'), ' and ', S('NP')],
        (v) => {
          if (JSON.stringify(v[1]) !== JSON.stringify(v[2])) fail(`"as many" without a shared middle person: "${s0}"`);
          return [{ c: 'asMany', a: v[0] as Ref, b: v[1] as Ref, c2: v[3] as Ref }];
        },
      ],
      [['As many persons sit to the left of ', S('NP'), ' as to the right of ', S('NP')], (v) => [{ c: 'sideEq', a: v[0] as Ref, b: v[1] as Ref }]],
      [[S('NP'), ' is a ', S('VAL')], (v) => [{ c: 'attr', a: v[0] as Ref, v: v[1] as number, neg: false }]],
      [[S('NP'), ' is an ', S('VAL')], (v) => [{ c: 'attr', a: v[0] as Ref, v: v[1] as number, neg: false }]],
      [[S('NP'), ' is not a ', S('VAL')], (v) => [{ c: 'attr', a: v[0] as Ref, v: v[1] as number, neg: true }]],
      [[S('NP'), ' is not an ', S('VAL')], (v) => [{ c: 'attr', a: v[0] as Ref, v: v[1] as number, neg: true }]],
      [[S('NP'), ' likes ', S('VAL')], (v) => [{ c: 'attr', a: v[0] as Ref, v: v[1] as number, neg: false }]],
      [[S('NP'), ' does not like ', S('VAL')], (v) => [{ c: 'attr', a: v[0] as Ref, v: v[1] as number, neg: true }]],
      [[S('NP'), ' is from ', S('VAL')], (v) => [{ c: 'attr', a: v[0] as Ref, v: v[1] as number, neg: false }]],
      [[S('NP'), ' is not from ', S('VAL')], (v) => [{ c: 'attr', a: v[0] as Ref, v: v[1] as number, neg: true }]],
    ];
    const found: Con[][] = [];
    for (const [toks, mk] of tries) {
      // attribute wording must belong to the puzzle's category
      const lit = toks.filter((t) => typeof t === 'string').join('|');
      if (/ is (not )?an? \|/.test(lit + '|') && P.attrCat !== 'profession') continue;
      if (/likes|does not like/.test(lit) && P.attrCat !== 'colour') continue;
      if (/ is (not )?from /.test(lit) && P.attrCat !== 'city') continue;
      const v = this.match(s, toks);
      if (v) found.push(mk(v));
    }
    if (!found.length) s = s0;
    if (!found.length) fail(`cannot read clause "${s0}"`);
    const keys = new Set(found.map((f) => JSON.stringify(f)));
    if (keys.size > 1) fail(`ambiguous clause "${s0}"`);
    return found[0];
  }
}

const flip = (f: Face): Face => (f === 'I' ? 'O' : f === 'O' ? 'I' : f === 'N' ? 'S' : 'N');

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

interface Geo {
  kind: Kind;
  n: number;
  x: number[];
  y: number[];
  /** adjacency lists */
  adj: number[][];
  /** row id per seat (rows only) */
  row: number[];
  corner: boolean[];
}

const ROW_GAP = 3;

function geometry(pz: Omit<Puzzle, 'cons'>, N: number): Geo {
  const x: number[] = [];
  const y: number[] = [];
  const row: number[] = [];
  const corner: boolean[] = [];
  if (pz.kind === 'circle') {
    for (let i = 0; i < pz.len; i++) {
      const th = Math.PI / 2 - (2 * Math.PI * i) / pz.len;
      x.push(Math.cos(th));
      y.push(Math.sin(th));
      row.push(0);
      corner.push(false);
    }
  } else if (pz.kind === 'square') {
    const pts = [
      [-1, 1],
      [0, 1],
      [1, 1],
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, -1],
      [-1, 0],
    ];
    for (const [a, b] of pts) {
      x.push(a);
      y.push(b);
      row.push(0);
      corner.push(a !== 0 && b !== 0);
    }
  } else {
    const rows = pz.kind === 'parallel' ? 2 : 1;
    const per = pz.kind === 'uncertain' ? N : pz.len;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < per; c++) {
        x.push(c);
        y.push(rows === 2 ? (r === 0 ? ROW_GAP : 0) : 0);
        row.push(r);
        corner.push(false);
      }
  }
  const n = x.length;
  let minD = Infinity;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) minD = Math.min(minD, Math.hypot(x[i] - x[j], y[i] - y[j]));
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && Math.abs(Math.hypot(x[i] - x[j], y[i] - y[j]) - minD) < 1e-6) adj[i].push(j);
  return { kind: pz.kind, n, x, y, adj, row, corner };
}

function faceVec(g: Geo, s: number, f: Face): [number, number] {
  if (f === 'N') return [0, 1];
  if (f === 'S') return [0, -1];
  if (f === 'I') return [-g.x[s], -g.y[s]];
  return [g.x[s], g.y[s]];
}

/** Walk k seats from s towards the hand `side` of a person at s facing f; −1 if the walk leaves the row. */
function walk(g: Geo, s: number, f: Face, side: Side, k: number): number {
  const [fx, fy] = faceVec(g, s, f);
  const [rx, ry] = side === 'right' ? [fy, -fx] : [-fy, fx];
  let first = -1;
  for (const nb of g.adj[s]) if ((g.x[nb] - g.x[s]) * rx + (g.y[nb] - g.y[s]) * ry > 1e-9) first = nb;
  if (first < 0) return -1;
  let prev = s;
  let cur = first;
  for (let i = 1; i < k; i++) {
    const next = g.adj[cur].find((nb) => nb !== prev && (g.kind === 'circle' || g.kind === 'square' || g.row[nb] === g.row[cur]));
    if (next === undefined) return -1;
    prev = cur;
    cur = next;
  }
  return cur;
}

/** Seats on the given hand of a person at s facing f, in the same row. */
function sideSeats(g: Geo, s: number, f: Face, side: Side): number {
  const [fx, fy] = faceVec(g, s, f);
  const [rx, ry] = side === 'right' ? [fy, -fx] : [-fy, fx];
  let c = 0;
  for (let t = 0; t < g.n; t++) if (g.row[t] === g.row[s] && t !== s && (g.x[t] - g.x[s]) * rx + (g.y[t] - g.y[s]) * ry > 1e-9) c++;
  return c;
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

interface World {
  g: Geo;
  pz: Omit<Puzzle, 'cons'>;
  /** person → seat (−1 unknown) */
  seat: number[];
  /** person → face (null unknown) */
  face: (Face | null)[];
  /** seat → person (−1 none / unknown) */
  occ: number[];
  /** value → person (−1 unknown) */
  holder: number[];
  /** all persons placed (so an empty seat really holds an unnamed person) */
  full: boolean;
}

const U = undefined;

function fixedFace(pz: Omit<Puzzle, 'cons'>, g: Geo, s: number): Face | null {
  switch (pz.rule) {
    case 'N':
      return 'N';
    case 'S':
      return 'S';
    case 'I':
      return 'I';
    case 'rowsFacing':
      return g.row[s] === 0 ? 'S' : 'N';
    case 'rowsNorth':
      return 'N';
    case 'cinMout':
      return g.corner[s] ? 'I' : 'O';
    case 'coutMin':
      return g.corner[s] ? 'O' : 'I';
    default:
      return null;
  }
}

function seatFace(w: World, s: number): Face | undefined {
  const fx = fixedFace(w.pz, w.g, s);
  if (fx) return fx;
  const p = w.occ[s];
  if (p < 0) return U;
  return w.face[p] ?? U;
}

function refSeat(w: World, r: Ref): number | undefined {
  switch (r.t) {
    case 'p':
      return w.seat[r.p] >= 0 ? w.seat[r.p] : U;
    case 'v': {
      const h = w.holder[r.v];
      return h >= 0 && w.seat[h] >= 0 ? w.seat[h] : U;
    }
    case 'rel': {
      const s = refSeat(w, r.of);
      if (s === U || s < 0) return s;
      const f = seatFace(w, s);
      if (f === U) return U;
      return walk(w.g, s, f, r.side, r.k);
    }
    case 'opp': {
      const s = refSeat(w, r.of);
      if (s === U || s < 0) return s;
      return oppositeSeat(w.g, s);
    }
    case 'front': {
      const s = refSeat(w, r.of);
      if (s === U || s < 0) return s;
      const f = seatFace(w, s);
      if (f === U) return U;
      return frontSeat(w.g, s, f);
    }
  }
}

function oppositeSeat(g: Geo, s: number): number {
  for (let t = 0; t < g.n; t++) if (Math.abs(g.x[t] + g.x[s]) < 1e-6 && Math.abs(g.y[t] + g.y[s]) < 1e-6) return t;
  return -1;
}

function frontSeat(g: Geo, s: number, f: Face): number {
  const [fx, fy] = faceVec(g, s, f);
  for (let t = 0; t < g.n; t++) if (Math.abs(g.x[t] - (g.x[s] + fx * ROW_GAP)) < 1e-6 && Math.abs(g.y[t] - (g.y[s] + fy * ROW_GAP)) < 1e-6) return t;
  return -1;
}

function rowEnds(g: Geo, s: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let t = 0; t < g.n; t++)
    if (g.row[t] === g.row[s]) {
      lo = Math.min(lo, g.x[t]);
      hi = Math.max(hi, g.x[t]);
    }
  return [lo, hi];
}

function evalCon(w: World, c: Con): boolean | undefined {
  const g = w.g;
  const two = (a: Ref, b: Ref): [number, number] | undefined | null => {
    const sa = refSeat(w, a);
    const sb = refSeat(w, b);
    if (sa === U || sb === U) return U;
    if (sa < 0 || sb < 0) return null;
    return [sa, sb];
  };
  switch (c.c) {
    case 'rel': {
      const sb = refSeat(w, c.b);
      if (sb === U) return U;
      if (sb < 0) return false;
      const fb = seatFace(w, sb);
      if (fb === U) return U;
      const t = walk(g, sb, fb, c.side, c.k);
      const sa = refSeat(w, c.a);
      if (sa === U) return U;
      return t >= 0 && sa === t;
    }
    case 'gap':
    case 'adj': {
      const p = two(c.a, c.b);
      if (p === U) return U;
      if (p === null) return false;
      const [sa, sb] = p;
      let ok: boolean;
      if (sa === sb) ok = false;
      else if (g.kind === 'circle' || g.kind === 'square') {
        let steps = 0;
        let prev = sa;
        let cur = g.adj[sa][0];
        steps = 1;
        while (cur !== sb) {
          const nx = g.adj[cur].find((t) => t !== prev)!;
          prev = cur;
          cur = nx;
          steps++;
        }
        const one = steps - 1;
        const other = g.n - 2 - one;
        const want = c.c === 'gap' ? c.n : 0;
        ok = one === want || other === want;
      } else ok = g.row[sa] === g.row[sb] && Math.abs(g.x[sa] - g.x[sb]) - 1 === (c.c === 'gap' ? c.n : 0);
      return c.c === 'adj' && c.neg ? !ok : ok;
    }
    case 'face': {
      const s = refSeat(w, c.a);
      if (s === U) return U;
      if (s < 0) return false;
      const f = seatFace(w, s);
      return f === U ? U : f === c.f;
    }
    case 'same': {
      const p = two(c.a, c.b);
      if (p === U) return U;
      if (p === null) return false;
      const fa = seatFace(w, p[0]);
      const fb = seatFace(w, p[1]);
      if (fa === U || fb === U) return U;
      return p[0] !== p[1] && (fa === fb) === c.same;
    }
    case 'end': {
      const s = refSeat(w, c.a);
      if (s === U) return U;
      if (s < 0) return false;
      const [lo, hi] = rowEnds(g, s);
      return (g.x[s] === lo || g.x[s] === hi) !== c.neg;
    }
    case 'endSide':
    case 'sideCount': {
      const s = refSeat(w, c.a);
      if (s === U) return U;
      if (s < 0) return false;
      const f = seatFace(w, s);
      if (f === U) return U;
      const cnt = sideSeats(g, s, f, c.side);
      return c.c === 'endSide' ? cnt === c.k - 1 : cnt === c.n;
    }
    case 'middle': {
      const s = refSeat(w, c.a);
      if (s === U) return U;
      if (s < 0) return false;
      const [lo, hi] = rowEnds(g, s);
      return g.x[s] - lo === hi - g.x[s];
    }
    case 'opp': {
      const p = two(c.a, c.b);
      if (p === U) return U;
      if (p === null) return false;
      return oppositeSeat(g, p[1]) === p[0];
    }
    case 'faces': {
      const p = two(c.a, c.b);
      if (p === U) return U;
      if (p === null) return false;
      const fa = seatFace(w, p[0]);
      const fb = seatFace(w, p[1]);
      if (fa === U || fb === U) return U;
      return frontSeat(g, p[0], fa) === p[1] && frontSeat(g, p[1], fb) === p[0];
    }
    case 'behind': {
      const p = two(c.a, c.b);
      if (p === U) return U;
      if (p === null) return false;
      const fb = seatFace(w, p[1]);
      if (fb === U) return U;
      const [fx, fy] = faceVec(g, p[1], fb);
      return Math.abs(g.x[p[0]] - (g.x[p[1]] - fx * ROW_GAP)) < 1e-6 && Math.abs(g.y[p[0]] - (g.y[p[1]] - fy * ROW_GAP)) < 1e-6;
    }
    case 'diag': {
      const p = two(c.a, c.b);
      if (p === U) return U;
      if (p === null) return false;
      const [sa, sb] = p;
      if (g.row[sa] === g.row[sb]) return false;
      const [lo, hi] = rowEnds(g, sa);
      return (g.x[sa] === lo && g.x[sb] === hi) || (g.x[sa] === hi && g.x[sb] === lo);
    }
    case 'corner': {
      const s = refSeat(w, c.a);
      if (s === U) return U;
      if (s < 0) return false;
      return g.corner[s] === c.corner;
    }
    case 'row': {
      const s = refSeat(w, c.a);
      if (s === U) return U;
      if (s < 0) return false;
      return g.row[s] === c.row;
    }
    case 'sameRow': {
      const p = two(c.a, c.b);
      if (p === U) return U;
      if (p === null) return false;
      return p[0] !== p[1] && (g.row[p[0]] === g.row[p[1]]) === c.same;
    }
    case 'asMany': {
      const sa = refSeat(w, c.a);
      const sb = refSeat(w, c.b);
      const sc = refSeat(w, c.c2);
      if (sa === U || sb === U || sc === U) return U;
      if (sa < 0 || sb < 0 || sc < 0 || new Set([sa, sb, sc]).size < 3) return false;
      if (g.row[sa] !== g.row[sb] || g.row[sb] !== g.row[sc]) return false;
      return Math.abs(g.x[sa] - g.x[sb]) === Math.abs(g.x[sb] - g.x[sc]);
    }
    case 'sideEq': {
      const p = two(c.a, c.b);
      if (p === U) return U;
      if (p === null) return false;
      const fa = seatFace(w, p[0]);
      const fb = seatFace(w, p[1]);
      if (fa === U || fb === U) return U;
      return sideSeats(g, p[0], fa, 'left') === sideSeats(g, p[1], fb, 'right');
    }
    case 'attr': {
      const sa = refSeat(w, c.a);
      const h = w.holder[c.v];
      if (sa === U || h < 0 || w.seat[h] < 0) return U;
      return (sa === w.seat[h]) !== c.neg;
    }
  }
}

function evalAll(w: World, cons: Con[][]): boolean | undefined {
  let unknown = false;
  for (const cl of cons)
    for (const c of cl) {
      const r = evalCon(w, c);
      if (r === false) return false;
      if (r === U) unknown = true;
    }
  return unknown ? U : true;
}

/* ------------------------------------------------------------------ */
/* Solving                                                             */
/* ------------------------------------------------------------------ */

interface Sol {
  seat: number[];
  face: Face[];
  holder: number[];
  n: number;
}

function newWorld(pz: Omit<Puzzle, 'cons'>, g: Geo): World {
  return {
    g,
    pz,
    seat: pz.names.map(() => -1),
    face: pz.names.map(() => null),
    occ: new Array<number>(g.n).fill(-1),
    holder: pz.values.map(() => -1),
    full: false,
  };
}

const mixedRule = (pz: Omit<Puzzle, 'cons'>) => pz.rule === 'mixedRow' || pz.rule === 'mixedRing';
const faceChoices = (pz: Omit<Puzzle, 'cons'>): Face[] => (pz.rule === 'mixedRow' ? ['N', 'S'] : ['I', 'O']);

function snapshot(w: World): Sol {
  return {
    seat: w.seat.slice(),
    face: w.seat.map((s, p) => (fixedFace(w.pz, w.g, s) ?? w.face[p]) as Face),
    holder: w.holder.slice(),
    n: w.g.n,
  };
}

/** Rotation normalisation for tables: person 0 sits at seat 0 (circle) or seat 0/1 (square). */
function allowedFirst(pz: Omit<Puzzle, 'cons'>, p: number, s: number): boolean {
  if (p !== 0) return true;
  if (pz.kind === 'circle') return s === 0;
  if (pz.kind === 'square') return s === 0 || s === 1;
  return true;
}

/** Exhaustive enumeration of all seatings (small fixed-facing puzzles, no second attribute). */
function enumerateAll(pz: Puzzle, g: Geo, limit: number): Sol[] {
  const w = newWorld(pz, g);
  const P = pz.names.length;
  const out: Sol[] = [];
  const rec = (p: number) => {
    if (out.length >= limit) return;
    if (p === P) {
      w.full = true;
      if (evalAll(w, pz.cons) === true) out.push(snapshot(w));
      w.full = false;
      return;
    }
    for (let s = 0; s < g.n; s++) {
      if (w.occ[s] >= 0 || !allowedFirst(pz, p, s)) continue;
      w.occ[s] = p;
      w.seat[p] = s;
      rec(p + 1);
      w.occ[s] = -1;
      w.seat[p] = -1;
    }
  };
  rec(0);
  return out;
}

type Var = { t: 'p'; p: number } | { t: 'v'; v: number };
type Val = number; // p: seat*4 + faceIndex (3 = fixed); v: person

/** Domain-propagation CSP: forward checking with the smallest domain first. */
function propagate(pz: Puzzle, g: Geo, limit: number, budget: { nodes: number }): Sol[] {
  const w = newWorld(pz, g);
  const P = pz.names.length;
  const V = pz.values.length;
  const mixed = mixedRule(pz);
  const fc = faceChoices(pz);
  const vars: Var[] = [...pz.names.map((_, p) => ({ t: 'p' as const, p })), ...pz.values.map((_, v) => ({ t: 'v' as const, v }))];
  const initial: Val[][] = vars.map((vr) => {
    if (vr.t === 'v') return pz.names.map((_, p) => p);
    const out: Val[] = [];
    for (let s = 0; s < g.n; s++) {
      if (!allowedFirst(pz, vr.p, s)) continue;
      if (pz.rows && !pz.rows[g.row[s]].includes(vr.p)) continue;
      if (mixed) for (let i = 0; i < 2; i++) out.push(s * 4 + i);
      else out.push(s * 4 + 3);
    }
    return out;
  });
  const assign = (i: number, val: Val) => {
    const vr = vars[i];
    if (vr.t === 'p') {
      const s = val >> 2;
      w.seat[vr.p] = s;
      w.occ[s] = vr.p;
      w.face[vr.p] = (val & 3) === 3 ? null : fc[val & 3];
    } else w.holder[vr.v] = val;
  };
  const unassign = (i: number, val: Val) => {
    const vr = vars[i];
    if (vr.t === 'p') {
      w.occ[val >> 2] = -1;
      w.seat[vr.p] = -1;
      w.face[vr.p] = null;
    } else w.holder[vr.v] = -1;
  };
  const clash = (i: number, val: Val) => {
    const vr = vars[i];
    if (vr.t === 'p') return w.occ[val >> 2] >= 0;
    return w.holder.includes(val);
  };
  // clauses that can change when a variable is set: those naming it, those with "the one who …" references,
  // and (for persons) every clause naming a second-attribute value, since values sit wherever their holder sits
  const mentions = (r: Ref, acc: { ps: Set<number>; vs: Set<number>; dyn: boolean }) => {
    if (r.t === 'p') acc.ps.add(r.p);
    else if (r.t === 'v') acc.vs.add(r.v);
    else {
      acc.dyn = true;
      mentions(r.of, acc);
    }
  };
  const relevant: Con[][][] = vars.map((vr) =>
    pz.cons.filter((cl) => {
      const acc = { ps: new Set<number>(), vs: new Set<number>(), dyn: false };
      for (const c of cl) {
        for (const key of ['a', 'b', 'c2'] as const) {
          const r = (c as Record<string, unknown>)[key] as Ref | undefined;
          if (r) mentions(r, acc);
        }
        if (c.c === 'attr') acc.vs.add(c.v);
      }
      if (acc.dyn || (mixed && vr.t === 'p')) return true;
      return vr.t === 'p' ? acc.ps.has(vr.p) || acc.vs.size > 0 : acc.vs.has(vr.v);
    }),
  );
  const out: Sol[] = [];
  const done = new Array<boolean>(vars.length).fill(false);
  const rec = (doms: Val[][]) => {
    if (out.length >= limit) return;
    if (++budget.nodes > 3_000_000) fail('search budget exhausted');
    // filter every open domain against the current partial assignment
    const nd: Val[][] = doms.map((d) => d);
    let pick = -1;
    for (let i = 0; i < vars.length; i++) {
      if (done[i]) continue;
      const keep: Val[] = [];
      for (const val of nd[i]) {
        if (clash(i, val)) continue;
        assign(i, val);
        const r = evalAll(w, relevant[i]);
        unassign(i, val);
        if (r !== false) keep.push(val);
      }
      if (!keep.length) return;
      nd[i] = keep;
      if (pick < 0 || keep.length < nd[pick].length) pick = i;
    }
    if (pick < 0) {
      w.full = true;
      if (evalAll(w, pz.cons) === true) out.push(snapshot(w));
      w.full = false;
      return;
    }
    done[pick] = true;
    for (const val of nd[pick]) {
      assign(pick, val);
      rec(nd);
      unassign(pick, val);
      if (out.length >= limit) break;
    }
    done[pick] = false;
  };
  void P;
  void V;
  rec(initial);
  return out;
}

/** Sound upper bound on the number of persons in an uncertain row, by interval relaxation. */
function boundN(pz: Puzzle): number {
  const P = pz.names.length;
  const INF = 1e9;
  const hi = new Array<number>(P).fill(INF);
  const atoms = pz.cons.flat();
  const pl = (r: Ref) => (r.t === 'p' ? r.p : -1);
  for (const c of atoms) {
    if (c.c === 'endSide' && c.side === 'left' && pl(c.a) >= 0) hi[pl(c.a)] = Math.min(hi[pl(c.a)], c.k - 1);
    if (c.c === 'sideCount' && c.side === 'left' && pl(c.a) >= 0) hi[pl(c.a)] = Math.min(hi[pl(c.a)], c.n);
  }
  // pairwise distance bounds |p_i − p_j| ≤ dist[i][j], relaxed to a fixpoint (triangle rule + "as many" equalities)
  const dist = Array.from({ length: P }, (_, i) => Array.from({ length: P }, (_, j) => (i === j ? 0 : INF)));
  const setD = (i: number, j: number, v: number) => {
    if (i < 0 || j < 0 || v >= dist[i][j]) return false;
    dist[i][j] = dist[j][i] = v;
    return true;
  };
  for (const c of atoms) {
    if (c.c === 'rel') setD(pl(c.a), pl(c.b), c.k);
    else if (c.c === 'gap') setD(pl(c.a), pl(c.b), c.n + 1);
    else if (c.c === 'adj' && !c.neg) setD(pl(c.a), pl(c.b), 1);
  }
  for (let changed = true, guard = 0; changed && guard < 50; guard++) {
    changed = false;
    for (let i = 0; i < P; i++) for (let j = 0; j < P; j++) for (let k = 0; k < P; k++) if (setD(i, j, dist[i][k] + dist[k][j])) changed = true;
    for (const c of atoms)
      if (c.c === 'asMany') {
        const [x, m, z] = [pl(c.a), pl(c.b), pl(c.c2)];
        if (x < 0 || m < 0 || z < 0) continue;
        if (setD(m, z, dist[x][m]) || setD(x, m, dist[m][z])) changed = true;
      }
  }
  for (let x = 0; x < P; x++) for (let a = 0; a < P; a++) if (hi[a] < INF && dist[a][x] < INF) hi[x] = Math.min(hi[x], hi[a] + dist[a][x]);
  for (let round = 0; round < 3 * P + 3; round++) {
    let changed = false;
    const relax = (x: number, v: number) => {
      if (x >= 0 && v < hi[x]) {
        hi[x] = v;
        changed = true;
      }
    };
    for (const c of atoms) {
      let a = -1;
      let b = -1;
      let d = 0;
      if (c.c === 'rel') [a, b, d] = [pl(c.a), pl(c.b), c.k];
      else if (c.c === 'gap') [a, b, d] = [pl(c.a), pl(c.b), c.n + 1];
      else if (c.c === 'adj' && !c.neg) [a, b, d] = [pl(c.a), pl(c.b), 1];
      else if (c.c === 'asMany') {
        const [x, m, z] = [pl(c.a), pl(c.b), pl(c.c2)];
        if (x >= 0 && m >= 0 && z >= 0) {
          relax(z, hi[m] + Math.max(hi[x], hi[m]));
          relax(x, hi[m] + Math.max(hi[z], hi[m]));
          relax(m, Math.max(hi[x], hi[z]));
        }
        continue;
      } else continue;
      if (a < 0 || b < 0) continue;
      relax(a, hi[b] + d);
      relax(b, hi[a] + d);
    }
    if (!changed) break;
  }
  let best = INF;
  for (const c of atoms) {
    const a = pl(c.a as Ref);
    if (a < 0) continue;
    if (c.c === 'endSide' && c.side === 'right') best = Math.min(best, hi[a] + c.k);
    if (c.c === 'sideCount' && c.side === 'right') best = Math.min(best, hi[a] + c.n + 1);
    if (c.c === 'middle') best = Math.min(best, 2 * hi[a] + 1);
    if (c.c === 'sideEq' && pl(c.b) >= 0) best = Math.min(best, hi[a] + hi[pl(c.b)] + 1);
  }
  if (best >= INF / 2) fail('number of persons in the row is not bounded by the clues');
  return best;
}

interface Solved {
  pz: Puzzle;
  g: Geo;
  sol: Sol;
}

export function solvePuzzle(pz: Puzzle): Solved {
  const budget = { nodes: 0 };
  if (pz.kind === 'uncertain') {
    const hiN = boundN(pz);
    const found: { g: Geo; sol: Sol }[] = [];
    for (let n = pz.names.length; n <= hiN && found.length < 2; n++) {
      const g = geometry(pz, n);
      for (const sol of propagate(pz, g, 2 - found.length, budget)) found.push({ g, sol });
    }
    if (found.length !== 1) fail(`uncertain row has ${found.length === 0 ? 'no' : 'more than one'} solution (N ≤ ${hiN})`);
    return { pz, ...found[0] };
  }
  const g = geometry(pz, 0);
  const small = pz.names.length <= 8 && !pz.values.length && !mixedRule(pz);
  const sols = small ? enumerateAll(pz, g, 2) : propagate(pz, g, 2, budget);
  if (small) {
    // cross-check the enumeration against the propagation solver
    const other = propagate(pz, g, 2, budget);
    if (other.length !== sols.length) fail('enumeration and propagation disagree');
  }
  if (sols.length !== 1) fail(`${sols.length === 0 ? 'no' : 'more than one'} arrangement satisfies the clues`);
  return { pz, g, sol: sols[0] };
}

/* ------------------------------------------------------------------ */
/* Questions                                                           */
/* ------------------------------------------------------------------ */

function worldOf(sv: Solved, seat?: number[]): World {
  const w = newWorld(sv.pz, sv.g);
  const st = seat ?? sv.sol.seat;
  st.forEach((s, p) => {
    w.seat[p] = s;
    w.occ[s] = p;
    w.face[p] = sv.sol.face[p];
  });
  w.holder = sv.sol.holder.slice();
  w.full = true;
  return w;
}

function onlyIndex(opts: string[], pred: (o: string) => boolean, what: string): number {
  const hits = opts.map((o, i) => (pred(o) ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) fail(`${what}: ${hits.length} options match (${JSON.stringify(opts)})`);
  return hits[0];
}

const optNumber = (o: string): number | null => {
  if (o === 'None') return 0;
  const i = WORDS.indexOf(o.toLowerCase());
  if (i >= 0) return i;
  return /^\d+$/.test(o) ? Number(o) : null;
};

function answer(sv: Solved, parser: Parser, prompt: string, opts: string[]): number {
  const pz = sv.pz;
  const g = sv.g;
  const w = worldOf(sv);
  const name = (p: number) => pz.names[p];
  const np = (s: string): Ref => parser.np(s.startsWith('The ') ? 'the ' + s.slice(4) : s) ?? fail(`unknown person "${s}"`);
  const seatOf = (r: Ref, ww = w): number => {
    const s = refSeat(ww, r);
    if (s === U || s < 0) fail('reference does not resolve');
    return s;
  };
  const byName = (target: number) => onlyIndex(opts, (o) => o === name(target), prompt);
  const occupant = (s: number, ww = w) => (s >= 0 ? ww.occ[s] : -1);
  let m: RegExpMatchArray | null;

  const nthOf = (side: Side, k: number, ref: Ref, ww = w) => {
    const s = seatOf(ref, ww);
    const t = walk(g, s, seatFace(ww, s)!, side, k);
    const p = occupant(t, ww);
    if (p < 0) fail(`nobody named sits there: ${prompt}`);
    return p;
  };
  if ((m = prompt.match(/^Who sits to the immediate (left|right) of (.+)\?$/))) return byName(nthOf(m[1] as Side, 1, np(m[2])));
  if ((m = prompt.match(/^Who sits (\w+) to the (left|right) of (.+)\?$/)) && ORDS.indexOf(m[1]) >= 2) return byName(nthOf(m[2] as Side, ORDS.indexOf(m[1]), np(m[3])));

  const countIdx = (n: number) => onlyIndex(opts, (o) => optNumber(o) === n, prompt);
  if ((m = prompt.match(/^How many persons sit between (\S+) and (\S+) when counted from the (left|right) of (\S+)\?$/))) {
    if (m[1] !== m[4]) fail('count direction person');
    const sa = seatOf(np(m[1]));
    const sb = seatOf(np(m[2]));
    const f = seatFace(w, sa)!;
    let k = 1;
    while (walk(g, sa, f, m[3] as Side, k) !== sb) {
      k++;
      if (k > g.n) fail('walk never reaches');
    }
    return countIdx(k - 1);
  }
  if ((m = prompt.match(/^How many persons sit between (\S+) and (\S+)\?$/))) {
    if (g.kind === 'circle' || g.kind === 'square') fail('undirected count on a table');
    const sa = seatOf(np(m[1]));
    const sb = seatOf(np(m[2]));
    if (g.row[sa] !== g.row[sb]) fail('count across rows');
    return countIdx(Math.abs(g.x[sa] - g.x[sb]) - 1);
  }
  if ((m = prompt.match(/^Who are the immediate neighbours of (\S+)\?$/))) {
    const s = seatOf(np(m[1]));
    const nb = g.adj[s].filter((t) => g.row[t] === g.row[s]).map((t) => occupant(t));
    if (nb.length !== 2 || nb.some((p) => p < 0)) fail('neighbours');
    const want = nb.map(name).sort().join('|');
    return onlyIndex(opts, (o) => splitList(o).sort().join('|') === want, prompt);
  }
  if (prompt === 'Four of the following five pairs are alike in a certain way based on the given arrangement and so form a group. Which pair does not belong to that group?') {
    const pairs = opts.map((o) => {
      const [a, b] = o.split(', ');
      const pa = pz.names.indexOf(a);
      const pb = pz.names.indexOf(b);
      if (pa < 0 || pb < 0) fail(`odd option "${o}"`);
      return [pa, pb];
    });
    const feats = pairs.map(([a, b]) => pairSignature(sv, w, a, b));
    const cands = new Set<number>();
    for (const key of Object.keys(feats[0])) {
      const counts = new Map<string, number>();
      for (const f of feats) counts.set(f[key], (counts.get(f[key]) ?? 0) + 1);
      for (const [v, c] of counts) if (c === 4) cands.add(feats.findIndex((f) => f[key] !== v));
    }
    if (cands.size !== 1) fail(`odd one out not unique (${[...cands].join(',')})`);
    return [...cands][0];
  }
  if ((m = prompt.match(/^Which of the following statements is (true|false) according to the given arrangement\?$/))) {
    const want = m[1] === 'true';
    return onlyIndex(
      opts,
      (o) => {
        const cons = parser.clause(o);
        const r = cons.every((c) => evalCon(w, c) === true);
        return r === want;
      },
      prompt,
    );
  }
  if ((m = prompt.match(/^What is the position of (\S+) with respect to (\S+)\?$/))) {
    const sx = seatOf(np(m[1]));
    const sy = seatOf(np(m[2]));
    const f = seatFace(w, sy)!;
    return onlyIndex(
      opts,
      (o) => {
        const mm = o.match(/^Immediate (left|right)$/) ?? o.match(/^(\w+) to the (left|right)$/);
        if (!mm) fail(`position option "${o}"`);
        const [side, k] = mm.length === 2 ? [mm[1] as Side, 1] : [mm[2] as Side, ORDS.indexOf(mm[1].toLowerCase())];
        if (k < 1) fail(`position option "${o}"`);
        return walk(g, sy, f, side, k) === sx;
      },
      prompt,
    );
  }
  if ((m = prompt.match(/^If (\S+) and (\S+) interchange their seats, who will sit (?:to the immediate (left|right)|(\w+) to the (left|right)) of (\S+)\?$/))) {
    if (mixedRule(pz)) fail('interchange with person-specific facing');
    const x = pz.names.indexOf(m[1]);
    const y = pz.names.indexOf(m[2]);
    const seat = sv.sol.seat.slice();
    [seat[x], seat[y]] = [seat[y], seat[x]];
    const w2 = worldOf(sv, seat);
    const side = (m[3] ?? m[5]) as Side;
    const k = m[3] ? 1 : ORDS.indexOf(m[4]);
    return byName(nthOf(side, k, np(m[6]), w2));
  }
  if ((m = prompt.match(/^How many persons face (the centre|outside|north|south)\?$/))) {
    const f = faceWord(m[1]);
    return countIdx(pz.names.filter((_, p) => seatFace(w, w.seat[p]) === f).length);
  }
  if ((m = prompt.match(/^Who sits exactly opposite (\S+)\?$/)) || (m = prompt.match(/^Who sits diagonally opposite (\S+)\?$/))) {
    const s = seatOf(np(m[1]));
    if (prompt.includes('diagonally') !== (g.kind === 'square' && g.corner[s])) fail('opposite wording');
    return byName(occupant(oppositeSeat(g, s)));
  }
  if ((m = prompt.match(/^Who faces (\S+)\?$/))) {
    const s = seatOf(np(m[1]));
    const t = frontSeat(g, s, seatFace(w, s)!);
    if (t < 0 || frontSeat(g, t, seatFace(w, t)!) !== s) fail('not facing each other');
    return byName(occupant(t));
  }
  if ((m = prompt.match(/^Who sits directly behind (\S+)\?$/))) {
    const s = seatOf(np(m[1]));
    const [fx, fy] = faceVec(g, s, seatFace(w, s)!);
    const t = [...Array(g.n).keys()].find((u) => Math.abs(g.x[u] - (g.x[s] - fx * ROW_GAP)) < 1e-6 && Math.abs(g.y[u] - (g.y[s] - fy * ROW_GAP)) < 1e-6);
    if (t === undefined) fail('nobody behind');
    return byName(occupant(t));
  }
  if ((m = prompt.match(/^Who is the (\w+)\?$/)) || (m = prompt.match(/^Who likes (\w+)\?$/)) || (m = prompt.match(/^Who is from (\w+)\?$/))) {
    const v = pz.values.indexOf(m[1]);
    if (v < 0) fail('unknown attribute');
    return byName(sv.sol.holder[v]);
  }
  if ((m = prompt.match(/^What is the profession of (\S+)\?$/)) || (m = prompt.match(/^Which colour does (\S+) like\?$/)) || (m = prompt.match(/^Which city is (\S+) from\?$/))) {
    const p = pz.names.indexOf(m[1]);
    const v = sv.sol.holder.indexOf(p);
    return onlyIndex(opts, (o) => o === pz.values[v], prompt);
  }
  if (prompt === 'How many persons sit in the row?') return countIdx(g.n);
  if ((m = prompt.match(/^How many persons sit to the (left|right) of (\S+)\?$/))) {
    const s = seatOf(np(m[2]));
    return countIdx(sideSeats(g, s, seatFace(w, s)!, m[1] as Side));
  }
  if ((m = prompt.match(/^Which of the following persons (.+)\?$/))) {
    const what = m[1];
    const test = (p: number): boolean => {
      const s = w.seat[p];
      let mm: RegExpMatchArray | null;
      if (what === 'sits at a corner') return g.corner[s];
      if (what === 'sits at the middle of a side') return g.kind === 'square' && !g.corner[s];
      if ((mm = what.match(/^faces (the centre|outside|north|south)$/))) return seatFace(w, s) === faceWord(mm[1]);
      if ((mm = what.match(/^sits in the same row as (\S+)$/))) {
        const x = pz.names.indexOf(mm[1]);
        return p !== x && g.row[s] === g.row[w.seat[x]];
      }
      return fail(`which-question "${what}"`);
    };
    return onlyIndex(
      opts,
      (o) => {
        const p = pz.names.indexOf(o);
        if (p < 0) fail(`option "${o}"`);
        return test(p);
      },
      prompt,
    );
  }
  if (prompt === 'Who sit at the extreme ends of the row?') {
    const ends = [0, g.n - 1].map((s) => occupant(s));
    if (ends.some((p) => p < 0)) fail('unnamed end');
    const want = ends.map(name).sort().join('|');
    return onlyIndex(opts, (o) => splitList(o).sort().join('|') === want, prompt);
  }
  return fail(`prompt not recognised: "${prompt}"`);
}

/** Geometric relation signature of an ordered pair (for "four of the five are alike"). */
function pairSignature(sv: Solved, w: World, a: number, b: number): Record<string, string> {
  const g = sv.g;
  const sa = w.seat[a];
  const sb = w.seat[b];
  const fa = seatFace(w, sa)!;
  const out: Record<string, string> = {};
  const ring = g.kind === 'circle' || g.kind === 'square';
  const sameRow = g.row[sa] === g.row[sb];
  // steps from a to b walking to a's right (rings) / signed steps along a's own right (rows)
  let dir = 'x';
  if (ring || sameRow) {
    for (let k = 1; k < g.n; k++) {
      if (walk(g, sa, fa, 'right', k) === sb) dir = String(k);
      if (!ring && walk(g, sa, fa, 'left', k) === sb) dir = String(-k);
    }
  } else dir = `x${g.row[sa]}${g.x[sb] - g.x[sa]}`;
  out.dir = dir;
  // plain clockwise / eastward offset, ignoring facing
  if (ring) {
    let k = 1;
    while (walk(g, sa, 'O', 'right', k) !== sb && k < g.n) k++;
    out.abs = String(k);
  } else out.abs = sameRow ? String(g.x[sb] - g.x[sa]) : `x${g.row[sa]}${g.x[sb] - g.x[sa]}`;
  if (ring) {
    const d = Number(out.abs);
    const m = Math.min(d, g.n - d);
    out.gap = 2 * m === g.n ? '-1' : String(m - 1);
  } else out.gap = sameRow ? String(Math.abs(g.x[sa] - g.x[sb]) - 1) : 'x';
  if (mixedRule(sv.pz)) out.face = seatFace(w, sa) === seatFace(w, sb) ? 'same' : 'diff';
  if (g.kind === 'square') out.corner = `${g.corner[sa] ? 0 : 1}${g.corner[sb] ? 0 : 1}`;
  if (g.kind === 'parallel') out.row = `${g.row[sa]}${g.row[sb]}`;
  return out;
}

/* ------------------------------------------------------------------ */
/* Entry points                                                        */
/* ------------------------------------------------------------------ */

export function parseStimulus(stimulus: string): { pz: Puzzle; parser: Parser } {
  const [intro, clueBlock, ...rest] = stimulus.split('\n\n');
  if (!clueBlock || rest.length) fail('stimulus layout');
  const base = parseIntro(intro);
  const parser = new Parser(base);
  const lines = clueBlock.split('\n');
  const cons: Con[][] = lines.map((line, i) => {
    const m = line.match(/^(\d+)\. (.+)\.$/);
    if (!m || Number(m[1]) !== i + 1) fail(`clue line "${line}"`);
    return parser.clause(m[2]);
  });
  if (base.rows) cons.push(...base.rows.flatMap((r, ri) => r.map((p) => [{ c: 'row' as const, a: { t: 'p' as const, p }, row: ri }])));
  return { pz: { ...base, cons }, parser };
}

/** All arrangements (up to `limit`) of a fixed-size puzzle — for diagnostics and tests. */
export function solutionsOf(stimulus: string, limit = 3): { seat: number[]; face: string[]; holder: number[] }[] {
  const { pz } = parseStimulus(stimulus);
  if (pz.kind === 'uncertain') fail('solutionsOf: fixed layouts only');
  return propagate(pz, geometry(pz, 0), limit, { nodes: 0 });
}

/** Expected option index per question, from the item's text alone. Throws on any doubt. */
export function verifyItem(item: Item): number[] {
  if (!item.set) fail('not a set');
  const { pz, parser } = parseStimulus(item.set.stimulus);
  const sv = solvePuzzle(pz);
  return item.questions.map((q) => answer(sv, parser, q.prompt, q.options));
}

export function verify(res: GenResult<SeatingFacts>): number[] {
  const out = verifyItem(res.item);
  const lines = res.item.set!.stimulus.split('\n\n')[1].split('\n').length;
  if (lines !== res.facts.clues.length) fail('clue count differs from the structured clues');
  if (res.item.set!.subtype !== res.facts.subtype) fail('subtype mismatch');
  return out;
}
