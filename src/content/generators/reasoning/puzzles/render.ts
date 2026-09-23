/**
 * Clue / question / option text in real exam style. One clue per sentence. The independent verifier parses these
 * sentences back into clues (src/content/verify/reasoning/puzzles.ts), so every template here has a mirror there.
 */
import type { Rng } from '../../../../lib/rng';
import type { VisualSpec } from '../../../types';
import { type Clue, type Layout, type Pred, colOf, rowOf, slotCount } from '../../solver/puzzles/model';
import { MONTHS, type Setup } from './setup';

export const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
export const ORD = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
export const COUNT_OPTION = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven'];

export function ordDigits(n: number): string {
  const v = n % 100;
  const suf = v >= 11 && v <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suf}`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Verbs {
  s: string;
  p: string;
  neg: string;
  up: string;
  down: string;
  unit: [string, string];
}

export function verbsOf(L: Layout): Verbs {
  switch (L.kind) {
    case 'box':
      return { s: 'is kept', p: 'are kept', neg: 'is not kept', up: 'above', down: 'below', unit: ['box', 'boxes'] };
    case 'day':
      return { s: 'goes', p: 'go', neg: 'does not go', up: 'after', down: 'before', unit: ['person', 'persons'] };
    case 'week':
    case 'session':
      return { s: 'has a lecture', p: 'have lectures', neg: 'does not have a lecture', up: 'after', down: 'before', unit: ['person', 'persons'] };
    case 'month':
    case 'month2':
      return { s: 'was born', p: 'were born', neg: 'was not born', up: 'after', down: 'before', unit: ['person', 'persons'] };
    default:
      return { s: 'lives', p: 'live', neg: 'does not live', up: 'above', down: 'below', unit: ['person', 'persons'] };
  }
}

export class Renderer {
  readonly L: Layout;
  readonly S: number;
  readonly P: number;
  readonly V: Verbs;
  constructor(readonly setup: Setup) {
    this.L = setup.layout;
    this.S = slotCount(this.L);
    this.P = this.L.persons;
    this.V = verbsOf(this.L);
  }

  /* ---------------- entities ---------------- */

  /** Bare label for options: person name / box letter / attribute value. */
  label(e: number): string {
    if (e < this.P) return this.setup.names[e];
    const k = Math.floor(e / this.P) - 1;
    return this.setup.cats[k].values[e % this.P];
  }

  ref(e: number, start = false): string {
    let s: string;
    if (e < this.P) s = this.L.kind === 'box' ? `box ${this.setup.names[e]}` : this.setup.names[e];
    else {
      const k = Math.floor(e / this.P) - 1;
      const cat = this.setup.cats[k];
      const v = cat.values[e % this.P];
      if (this.L.kind === 'box') s = cat.kind === 'colour' ? `the ${v} box` : `the box containing ${v}`;
      else
        switch (cat.kind) {
          case 'city':
            s = `the one who is from ${v}`;
            break;
          case 'sport':
            s = `the one who plays ${v}`;
            break;
          case 'subject':
            s = `the one who teaches ${v}`;
            break;
          default:
            s = `the one who likes ${v}`;
        }
    }
    return start ? cap(s) : s;
  }

  /** "likes Red" / "is from Delhi" / "contains Pens" (neg: "does not like Red" …) */
  attrPred(e: number, neg: boolean): string {
    const k = Math.floor(e / this.P) - 1;
    const cat = this.setup.cats[k];
    const v = cat.values[e % this.P];
    if (this.L.kind === 'box') {
      if (cat.kind === 'colour') return neg ? `is not ${v}` : `is ${v}`;
      return neg ? `does not contain ${v}` : `contains ${v}`;
    }
    switch (cat.kind) {
      case 'city':
        return neg ? `is not from ${v}` : `is from ${v}`;
      case 'sport':
        return neg ? `does not play ${v}` : `plays ${v}`;
      case 'subject':
        return neg ? `does not teach ${v}` : `teaches ${v}`;
      default:
        return neg ? `does not like ${v}` : `likes ${v}`;
    }
  }

  /* ---------------- positions ---------------- */

  dayOfRow(r: number): string {
    if (this.L.kind === 'session') return this.setup.labels.days![r];
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][r];
  }
  monthOfRow(r: number): string {
    return MONTHS[this.L.months![r]];
  }
  measureWords(): { top: string; bottom: string; more: string; less: string } {
    return this.setup.labels.measure === 'weight'
      ? { top: 'heaviest', bottom: 'lightest', more: 'heavier', less: 'lighter' }
      : { top: 'tallest', bottom: 'shortest', more: 'taller', less: 'shorter' };
  }
  /** "the third tallest" / "the tallest" / "the second shortest" */
  rankPhrase(s: number): string {
    const w = this.measureWords();
    const fromTop = this.S - s;
    if (fromTop <= Math.ceil(this.S / 2)) return fromTop === 1 ? `the ${w.top}` : `the ${ORD[fromTop]} ${w.top}`;
    return s === 0 ? `the ${w.bottom}` : `the ${ORD[s + 1]} ${w.bottom}`;
  }

  /** Phrase after the verb for a position predicate. */
  posPhrase(p: Pred): string {
    const L = this.L;
    const floorPh = (r: number, rows: number) => (r === rows - 1 ? 'on the topmost floor' : r === 0 ? 'on the lowermost floor' : `on floor ${r + 1}`);
    switch (L.kind) {
      case 'floor':
      case 'flat': {
        const flats = this.setup.labels.flats;
        switch (p.t) {
          case 'slot':
            return L.kind === 'flat' ? `in flat ${flats![colOf(L, p.s)]} of floor ${rowOf(L, p.s) + 1}` : floorPh(p.s, L.rows);
          case 'row':
            return floorPh(p.r, L.rows);
          case 'col':
            return `in flat ${flats![p.c]}`;
          case 'even':
            return 'on an even-numbered floor';
          case 'odd':
            return 'on an odd-numbered floor';
          case 'prime':
            return 'on a prime-numbered floor';
          case 'gt':
            return `on one of the floors above floor ${p.r + 1}`;
          case 'lt':
            return `on one of the floors below floor ${p.r + 1}`;
        }
        break;
      }
      case 'box':
        switch (p.t) {
          case 'slot':
            if (p.s === this.S - 1) return 'at the top';
            if (p.s === 0) return 'at the bottom';
            return p.s >= this.S / 2 ? `${ORD[this.S - p.s]} from the top` : `${ORD[p.s + 1]} from the bottom`;
          case 'even':
            return 'at an even-numbered position';
          case 'odd':
            return 'at an odd-numbered position';
          case 'prime':
            return 'at a prime-numbered position';
        }
        break;
      case 'day':
      case 'week':
      case 'session':
        switch (p.t) {
          case 'slot':
            return L.kind === 'session' ? `on ${this.dayOfRow(rowOf(L, p.s))} ${colOf(L, p.s) === 0 ? 'morning' : 'evening'}` : `on ${this.dayOfRow(p.s)}`;
          case 'row':
            return `on ${this.dayOfRow(p.r)}`;
          case 'col':
            return `in the ${p.c === 0 ? 'morning' : 'evening'}`;
          case 'gt':
            return `on one of the days after ${this.dayOfRow(p.r)}`;
          case 'lt':
            return `on one of the days before ${this.dayOfRow(p.r)}`;
        }
        break;
      case 'month':
      case 'month2':
        switch (p.t) {
          case 'slot':
            return L.kind === 'month2' ? `on ${ordDigits(this.setup.labels.dates![colOf(L, p.s)])} ${this.monthOfRow(rowOf(L, p.s))}` : `in ${this.monthOfRow(p.s)}`;
          case 'row':
            return `in ${this.monthOfRow(p.r)}`;
          case 'col':
            return `on the ${ordDigits(this.setup.labels.dates![p.c])} of a month`;
          case 'gt':
            return `in one of the months after ${this.monthOfRow(p.r)}`;
          case 'lt':
            return `in one of the months before ${this.monthOfRow(p.r)}`;
          case 'd31':
            return 'in a month that has 31 days';
          case 'd30':
            return 'in a month that has 30 days';
        }
        break;
      case 'rank':
        if (p.t === 'slot') return this.rankPhrase(p.s);
        break;
    }
    throw new Error(`puzzles: no phrase for ${L.kind}/${JSON.stringify(p)}`);
  }

  /** Short label used in options and combinations. */
  posLabel(s: number): string {
    const L = this.L;
    switch (L.kind) {
      case 'floor':
        return `Floor ${s + 1}`;
      case 'box':
        return ordDigits(s + 1);
      case 'day':
      case 'week':
        return this.dayOfRow(s);
      case 'session':
        return `${this.dayOfRow(rowOf(L, s))} ${colOf(L, s) === 0 ? 'morning' : 'evening'}`;
      case 'month':
        return this.monthOfRow(s);
      case 'month2':
        return `${ordDigits(this.setup.labels.dates![colOf(L, s)])} ${this.monthOfRow(rowOf(L, s))}`;
      case 'flat':
        return `Flat ${this.setup.labels.flats![colOf(L, s)]}, floor ${rowOf(L, s) + 1}`;
      case 'rank':
        return cap(this.rankPhrase(s).replace(/^the /, ''));
    }
  }

  /* ---------------- clues ---------------- */

  private units(n: number): string {
    return n === 1 ? this.V.unit[0] : this.V.unit[1];
  }
  private verbN(n: number): string {
    return n === 1 ? this.V.s : this.V.p;
  }

  /** Clue sentence; `alt` picks the mirrored wording where one exists. */
  clue(c: Clue, alt = false): string {
    const L = this.L;
    const V = this.V;
    const R = (e: number) => this.ref(e, true);
    const r = (e: number) => this.ref(e);
    const rank = L.kind === 'rank';
    const w = this.measureWords();
    switch (c.k) {
      case 'is':
        if (rank) return `${R(c.e)} is ${this.posPhrase(c.p)}.`;
        return `${R(c.e)} ${V.s} ${this.posPhrase(c.p)}.`;
      case 'not':
        if (c.es.length === 2) return `Neither ${r(c.es[0])} nor ${r(c.es[1])} ${rank ? 'is' : V.s} ${this.posPhrase(c.p)}.`;
        if (rank) return `${R(c.es[0])} is not ${this.posPhrase(c.p)}.`;
        return `${R(c.es[0])} ${V.neg} ${this.posPhrase(c.p)}.`;
      case 'link':
        return `${R(c.a)} ${this.attrPred(c.b, false)}.`;
      case 'nlink':
        return `${R(c.a)} ${this.attrPred(c.b, true)}.`;
      case 'delta': {
        if (rank) return `Only ${NUM[c.d - 1]} ${c.d - 1 === 1 ? 'person is' : 'persons are'} ${w.more} than ${r(c.b)} but ${w.less} than ${r(c.a)}.`;
        if (L.kind === 'month') {
          if (c.d === 1)
            return alt
              ? `${R(c.b)} was born in the month immediately before the month in which ${r(c.a)} was born.`
              : `${R(c.a)} was born in the month immediately after the month in which ${r(c.b)} was born.`;
          return alt ? `${R(c.b)} was born ${NUM[c.d]} months before ${r(c.a)}.` : `${R(c.a)} was born ${NUM[c.d]} months after ${r(c.b)}.`;
        }
        if (c.d === 1) return alt ? `${R(c.b)} ${V.s} immediately ${V.down} ${r(c.a)}.` : `${R(c.a)} ${V.s} immediately ${V.up} ${r(c.b)}.`;
        const n = c.d - 1;
        return alt
          ? `Only ${NUM[n]} ${this.units(n)} ${this.verbN(n)} between ${r(c.a)} and ${r(c.b)}, and ${r(c.b)} ${V.s} ${V.down} ${r(c.a)}.`
          : `Only ${NUM[n]} ${this.units(n)} ${this.verbN(n)} between ${r(c.a)} and ${r(c.b)}, and ${r(c.a)} ${V.s} ${V.up} ${r(c.b)}.`;
      }
      case 'vert':
        return alt ? `${R(c.b)} lives immediately below ${r(c.a)}.` : `${R(c.a)} lives immediately above ${r(c.b)}.`;
      case 'rdelta':
        return alt ? `${R(c.b)} lives on the floor immediately below the floor of ${r(c.a)}.` : `${R(c.a)} lives on the floor immediately above the floor of ${r(c.b)}.`;
      case 'rgap':
        if (c.n === 0) return `${R(c.a)} and ${r(c.b)} live on adjacent floors.`;
        return `Only ${NUM[c.n]} ${c.n === 1 ? 'floor is' : 'floors are'} between the floors of ${r(c.a)} and ${r(c.b)}.`;
      case 'gap':
        return `Only ${NUM[c.n]} ${this.units(c.n)} ${this.verbN(c.n)} between ${r(c.a)} and ${r(c.b)}.`;
      case 'gapc':
        if (c.op === 'gt' && c.n === 0) return `At least one ${V.unit[0]} ${V.s} between ${r(c.a)} and ${r(c.b)}.`;
        if (c.op === 'gt' && c.n === 1) return `More than one ${V.unit[0]} ${V.s} between ${r(c.a)} and ${r(c.b)}.`;
        return `${c.op === 'gt' ? 'More' : 'Less'} than ${NUM[c.n]} ${V.unit[1]} ${V.p} between ${r(c.a)} and ${r(c.b)}.`;
      case 'order':
        if (rank) return alt ? `${R(c.b)} is ${w.less} than ${r(c.a)}.` : `${R(c.a)} is ${w.more} than ${r(c.b)}.`;
        return alt ? `${R(c.b)} ${V.s} ${V.down} ${r(c.a)}.` : `${R(c.a)} ${V.s} ${V.up} ${r(c.b)}.`;
      case 'rorder':
        return alt ? `${R(c.b)} lives on a floor below the floor of ${r(c.a)}.` : `${R(c.a)} lives on a floor above the floor of ${r(c.b)}.`;
      case 'nadj':
        if (L.kind === 'month') return `${R(c.a)} and ${r(c.b)} were not born in consecutive months.`;
        return `${R(c.a)} ${V.neg} immediately ${V.up} or immediately ${V.down} ${r(c.b)}.`;
      case 'ndelta':
        return `${R(c.a)} ${V.neg} immediately ${c.d > 0 ? V.up : V.down} ${r(c.b)}.`;
      case 'eqgap':
        return `As many ${V.unit[1]} ${V.p} between ${r(c.a)} and ${r(c.b)} as between ${r(c.b)} and ${r(c.c)}.`;
      case 'srow':
        if (L.kind === 'flat') return `${R(c.a)} lives on the same floor as ${r(c.b)}.`;
        if (L.kind === 'month2') return `${R(c.a)} and ${r(c.b)} were born in the same month.`;
        return `${R(c.a)} and ${r(c.b)} have lectures on the same day.`;
      case 'drow':
        if (L.kind === 'flat') return `${R(c.a)} and ${r(c.b)} live on different floors.`;
        if (L.kind === 'month2') return `${R(c.a)} and ${r(c.b)} were born in different months.`;
        return `${R(c.a)} and ${r(c.b)} have lectures on different days.`;
      case 'scol':
        return `${R(c.a)} lives in the same type of flat as ${r(c.b)}.`;
      case 'dcol':
        return `${R(c.a)} and ${r(c.b)} live in different types of flats.`;
      case 'east':
        return alt ? `${R(c.b)} lives to the west of ${r(c.a)}.` : `${R(c.a)} lives to the east of ${r(c.b)}.`;
      case 'count': {
        if (rank) return `Only ${NUM[c.n]} ${c.n === 1 ? 'person is' : 'persons are'} ${c.dir === 1 ? w.more : w.less} than ${r(c.e)}.`;
        return `Only ${NUM[c.n]} ${this.units(c.n)} ${this.verbN(c.n)} ${c.dir === 1 ? V.up : V.down} ${r(c.e)}.`;
      }
      case 'countc': {
        const side = rank ? (c.dir === 1 ? w.more : w.less) : c.dir === 1 ? V.up : V.down;
        if (c.op === 'gt' && c.n === 0) return rank ? `At least one person is ${side} than ${r(c.e)}.` : `At least one ${V.unit[0]} ${V.s} ${side} ${r(c.e)}.`;
        if (c.op === 'gt' && c.n === 1) return rank ? `More than one person is ${side} than ${r(c.e)}.` : `More than one ${V.unit[0]} ${V.s} ${side} ${r(c.e)}.`;
        const word = c.op === 'gt' ? 'More' : 'Less';
        return rank ? `${word} than ${NUM[c.n]} persons are ${side} than ${r(c.e)}.` : `${word} than ${NUM[c.n]} ${V.unit[1]} ${V.p} ${side} ${r(c.e)}.`;
      }
      case 'mirror':
        return `As many ${V.unit[1]} ${V.p} ${V.down} ${r(c.a)} as ${V.up} ${r(c.b)}.`;
      case 'empty':
        return `No one was born in the month immediately ${c.dir === 1 ? 'after' : 'before'} the month in which ${r(c.e)} was born.`;
      case 'btw':
        if (rank) return `${R(c.a)} is ${w.more} than ${r(c.b)} but ${w.less} than ${r(c.c)}.`;
        return `${R(c.a)} ${V.s} ${V.up} ${r(c.b)} but ${V.down} ${r(c.c)}.`;
      case 'val':
        return this.setup.labels.measure === 'weight' ? `${R(c.e)} weighs ${c.v} kg.` : `${R(c.e)} is ${c.v} cm tall.`;
      case 'rval':
        return this.setup.labels.measure === 'weight' ? `${cap(this.rankPhrase(c.s))} person weighs ${c.v} kg.` : `${cap(this.rankPhrase(c.s))} person is ${c.v} cm tall.`;
    }
  }

  /* ---------------- intro ---------------- */

  intro(): string {
    const { setup, L } = this;
    const list = (xs: string[]) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
    const names = list(setup.names);
    const count = NUM[this.P].charAt(0).toUpperCase() + NUM[this.P].slice(1);
    let s = '';
    switch (L.kind) {
      case 'floor':
        s = `${count} persons — ${names} — live on eight different floors of a building, one person on each floor, but not necessarily in the same order. The lowermost floor is numbered 1 and the topmost floor is numbered 8.`;
        break;
      case 'flat': {
        const [a, b] = setup.labels.flats!;
        s = `${count} persons — ${names} — live in a four-storey building. Each floor has two flats: flat ${a} and flat ${b}. Flat ${a} is to the west of flat ${b}. Flat ${a} of floor 2 is immediately above flat ${a} of floor 1 and immediately below flat ${a} of floor 3, and so on; the same holds for flat ${b}. The lowermost floor is numbered 1 and the topmost floor is numbered 4. Exactly one person lives in each flat.`;
        break;
      }
      case 'box':
        s = `${count} boxes — ${names} — are kept one above another in a single stack, but not necessarily in the same order. The bottommost position is numbered 1 and the topmost position is numbered 8.`;
        break;
      case 'day':
        s = `${count} persons — ${names} — go to a ${setup.labels.place} on different days of the same week, starting from Monday and ending on Sunday. Only one person goes on each day.`;
        break;
      case 'week':
        s = `${count} persons — ${names} — have lectures on different days of the same week, starting from Monday and ending on Sunday. Only one lecture is held on each day.`;
        break;
      case 'session': {
        const days = setup.labels.days!;
        s = `${count} persons — ${names} — have lectures on four consecutive days of a week — ${list(days)} — in two sessions each day: morning and evening. Only one lecture is held in each session, and the morning session comes before the evening session.`;
        break;
      }
      case 'month':
        s = `${count} persons — ${names} — were born in eight different months of the same year, from January to December, but not necessarily in the same order. No two persons were born in the same month, so four months have no birthday.`;
        break;
      case 'month2': {
        const [d1, d2] = setup.labels.dates!;
        s = `${count} persons — ${names} — were born on two dates, ${ordDigits(d1)} and ${ordDigits(d2)}, of four months — ${list(L.months!.map((m) => MONTHS[m]))} — of the same year. Exactly one of them was born on each of these eight dates.`;
        break;
      }
      case 'rank':
        s = setup.labels.measure === 'weight' ? `${count} persons — ${names} — have different weights.` : `${count} persons — ${names} — have different heights.`;
        break;
    }
    for (const cat of setup.cats) {
      const vals = list(cat.values);
      if (L.kind === 'box') s += cat.kind === 'colour' ? ` Each box is of a different colour — ${vals}.` : ` Each box contains a different item — ${vals}.`;
      else
        switch (cat.kind) {
          case 'city':
            s += ` Each of them is from a different city — ${vals}.`;
            break;
          case 'sport':
            s += ` Each of them plays a different sport — ${vals}.`;
            break;
          case 'subject':
            s += ` Each of them teaches a different subject — ${vals}.`;
            break;
          default:
            s += ` Each of them likes a different ${cat.kind} — ${vals}.`;
        }
    }
    return s;
  }

  /** Stimulus: intro + numbered clues, one per line. */
  stimulus(lines: string[]): string {
    return `${this.intro()}\n\n${lines.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
  }

  /* ---------------- visual ---------------- */

  visual(truth: number[], values?: number[]): VisualSpec {
    const { L, P, setup } = this;
    const personAt = new Array<number>(this.S).fill(-1);
    for (let p = 0; p < P; p++) personAt[truth[p]] = p;
    const attrsOf = (p: number) => setup.cats.map((_, k) => setup.cats[k].values[truth.slice(P * (k + 1), P * (k + 2)).indexOf(truth[p])]);
    const catCols = setup.cats.map((c) => (c.kind === 'item' ? 'Item' : c.kind.charAt(0).toUpperCase() + c.kind.slice(1)));
    const cell = (s: number) => {
      const p = personAt[s];
      if (p < 0) return '—';
      const at = attrsOf(p);
      return at.length ? `${setup.names[p]} (${at.join(', ')})` : setup.names[p];
    };
    if (L.kind === 'rank') {

      const items: string[] = [];
      for (let s = this.S - 1; s >= 0; s--) items.push(setup.names[personAt[s]] + (values ? ` (${values[s]} ${setup.labels.measure === 'weight' ? 'kg' : 'cm'})` : ''));
      return { type: 'order', items, label: `${cap(this.measureWords().top)} → ${this.measureWords().bottom}`, caption: 'Final order' };
    }
    if (L.cols === 2) {
      const heads =
        L.kind === 'flat'
          ? ['Floor', `Flat ${setup.labels.flats![0]}`, `Flat ${setup.labels.flats![1]}`]
          : L.kind === 'session'
            ? ['Day', 'Morning', 'Evening']
            : ['Month', ordDigits(setup.labels.dates![0]), ordDigits(setup.labels.dates![1])];
      const rows: string[][] = [];
      const order = L.kind === 'flat' ? [...Array(L.rows).keys()].reverse() : [...Array(L.rows).keys()];
      for (const r of order) {
        const first = L.kind === 'flat' ? String(r + 1) : L.kind === 'session' ? this.dayOfRow(r) : this.monthOfRow(r);
        rows.push([first, cell(r * 2), cell(r * 2 + 1)]);
      }
      return { type: 'grid', columns: heads, rows, caption: 'Final arrangement' };
    }
    const first = L.kind === 'floor' ? 'Floor' : L.kind === 'box' ? 'Position' : L.kind === 'month' ? 'Month' : 'Day';
    const rows: string[][] = [];
    const topFirst = L.kind === 'floor' || L.kind === 'box';
    const order = topFirst ? [...Array(this.S).keys()].reverse() : [...Array(this.S).keys()];
    for (const s of order) {
      const p = personAt[s];
      const lab = L.kind === 'floor' || L.kind === 'box' ? String(s + 1) : L.kind === 'month' ? this.monthOfRow(s) : this.dayOfRow(s);
      rows.push([lab, p < 0 ? '—' : setup.names[p], ...(p < 0 ? setup.cats.map(() => '—') : attrsOf(p))]);
    }
    return { type: 'grid', columns: [first, L.kind === 'box' ? 'Box' : 'Person', ...catCols], rows, caption: 'Final arrangement' };
  }

  /** Random choice between the two wordings of a clue. */
  clueText(c: Clue, rng: Rng): string {
    return this.clue(c, rng.chance(0.4));
  }
}
