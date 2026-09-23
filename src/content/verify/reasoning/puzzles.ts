/**
 * Independent verifier for reasoning.puzzles.
 *
 * Reads the set like a candidate: every numbered clue sentence in the stimulus is PARSED back into a constraint
 * (and must equal the structured clue kept in facts — so a rendering slip such as "above" for "below" fails here),
 * the puzzle is solved by chronological slot-by-slot enumeration with its own clue semantics (the generator uses
 * bitmask domain propagation), exactly one arrangement must survive, and every answer is recomputed from that
 * arrangement by parsing each prompt and option. Nothing here imports generator code except types.
 */
import type { GenResult } from '../../generators/types';
import type { PuzzlesFacts } from '../../generators/reasoning/puzzles';
import type { Clue, Pred } from '../../generators/solver/puzzles/model';

type F = PuzzlesFacts;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_IN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
const ORDW = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const COUNT = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven'];
const PRIMES = [2, 3, 5, 7, 11];
const NUMW = `(${WORDS.join('|')})`;
const E = '«(\\d+)»';

function suffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  return n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
}

class Puzzle {
  readonly kind: F['layout']['kind'];
  readonly rows: number;
  readonly cols: number;
  readonly S: number;
  readonly P: number;
  readonly K: number;
  readonly E: number;
  /** phrase → entity id, longest first */
  readonly phrases: [string, number][] = [];
  constructor(readonly f: F) {
    this.kind = f.layout.kind;
    this.rows = f.layout.rows;
    this.cols = f.layout.cols;
    this.S = this.rows * this.cols;
    this.P = f.names.length;
    this.K = f.cats.length;
    this.E = this.P * (1 + this.K);
    if (this.P !== f.layout.persons) throw new Error('person count mismatch');
    f.names.forEach((n, p) => {
      if (this.kind === 'box') {
        this.phrases.push([`box ${n}`, p], [`Box ${n}`, p]);
      } else this.phrases.push([n, p]);
    });
    f.cats.forEach((cat, k) => {
      cat.values.forEach((v, i) => {
        const e = (k + 1) * this.P + i;
        let ph: string;
        if (this.kind === 'box') ph = cat.kind === 'colour' ? `the ${v} box` : `the box containing ${v}`;
        else if (cat.kind === 'city') ph = `the one who is from ${v}`;
        else if (cat.kind === 'sport') ph = `the one who plays ${v}`;
        else if (cat.kind === 'subject') ph = `the one who teaches ${v}`;
        else ph = `the one who likes ${v}`;
        this.phrases.push([ph, e], [ph.charAt(0).toUpperCase() + ph.slice(1), e]);
      });
    });
    this.phrases.sort((a, b) => b[0].length - a[0].length);
  }

  row(s: number): number {
    return Math.floor(s / this.cols);
  }
  col(s: number): number {
    return s % this.cols;
  }
  monthOfRow(r: number): number {
    return this.f.layout.months ? this.f.layout.months[r] : r;
  }
  dayOfRow(r: number): string {
    return this.kind === 'session' ? this.f.labels.days![r] : WEEKDAYS[r];
  }

  tokenize(text: string): string {
    let t = text;
    for (const [ph, e] of this.phrases) {
      const esc = ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      t = t.replace(new RegExp(`(?<![A-Za-z])${esc}(?![A-Za-z])`, 'g'), `«${e}»`);
    }
    return t;
  }

  verbs(): { s: string; p: string; neg: string; up: string; down: string; unit: [string, string] } {
    switch (this.kind) {
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

  /* ---------------- positions ---------------- */

  rankWords(): [string, string, string, string] {
    return this.f.labels.measure === 'weight' ? ['heaviest', 'lightest', 'heavier', 'lighter'] : ['tallest', 'shortest', 'taller', 'shorter'];
  }

  /** Parse a rank phrase "the third tallest" → slot (0 = lowest value). */
  parseRank(t: string): number | null {
    const [top, bottom] = this.rankWords();
    const m = t.match(new RegExp(`^the (?:(${ORDW.join('|')}) )?(${top}|${bottom})$`));
    if (!m) return null;
    const k = m[1] ? ORDW.indexOf(m[1]) : 1;
    if (k < 1 || k > this.S) return null;
    return m[2] === top ? this.S - k : k - 1;
  }

  /** Parse a position phrase (after the verb) into a predicate. */
  parsePos(t: string): Pred | null {
    const k = this.kind;
    let m: RegExpMatchArray | null;
    if (k === 'floor' || k === 'flat') {
      const R = this.rows;
      const rowPred = (r: number): Pred => (k === 'flat' ? { t: 'row', r } : { t: 'slot', s: r });
      if (t === 'on the topmost floor') return rowPred(R - 1);
      if (t === 'on the lowermost floor') return rowPred(0);
      if ((m = t.match(/^on floor (\d+)$/))) {
        const n = Number(m[1]);
        return n >= 2 && n <= R - 1 ? rowPred(n - 1) : null;
      }
      if (t === 'on an even-numbered floor') return { t: 'even' };
      if (t === 'on an odd-numbered floor') return { t: 'odd' };
      if (t === 'on a prime-numbered floor') return { t: 'prime' };
      if ((m = t.match(/^on one of the floors (above|below) floor (\d+)$/))) return m[1] === 'above' ? { t: 'gt', r: Number(m[2]) - 1 } : { t: 'lt', r: Number(m[2]) - 1 };
      if (k === 'flat') {
        const [fa, fb] = this.f.labels.flats!;
        if ((m = t.match(/^in flat (\w) of floor (\d+)$/))) {
          const c = m[1] === fa ? 0 : m[1] === fb ? 1 : -1;
          const r = Number(m[2]) - 1;
          return c < 0 || r < 0 || r >= R ? null : { t: 'slot', s: r * 2 + c };
        }
        if ((m = t.match(/^in flat (\w)$/))) return m[1] === fa ? { t: 'col', c: 0 } : m[1] === fb ? { t: 'col', c: 1 } : null;
      }
      return null;
    }
    if (k === 'box') {
      if (t === 'at the top') return { t: 'slot', s: this.S - 1 };
      if (t === 'at the bottom') return { t: 'slot', s: 0 };
      if ((m = t.match(new RegExp(`^(${ORDW.join('|')}) from the (top|bottom)$`)))) {
        const n = ORDW.indexOf(m[1]);
        const s = m[2] === 'top' ? this.S - n : n - 1;
        // the renderer names the nearer end; "first from the top" would be "at the top"
        if (n < 2 || s < 0 || s >= this.S) return null;
        return { t: 'slot', s };
      }
      if (t === 'at an even-numbered position') return { t: 'even' };
      if (t === 'at an odd-numbered position') return { t: 'odd' };
      if (t === 'at a prime-numbered position') return { t: 'prime' };
      return null;
    }
    if (k === 'day' || k === 'week' || k === 'session') {
      const dayIdx = (d: string) => {
        for (let r = 0; r < this.rows; r++) if (this.dayOfRow(r) === d) return r;
        return -1;
      };
      if (k === 'session' && (m = t.match(/^on (\w+) (morning|evening)$/))) {
        const r = dayIdx(m[1]);
        return r < 0 ? null : { t: 'slot', s: r * 2 + (m[2] === 'morning' ? 0 : 1) };
      }
      if ((m = t.match(/^on (\w+)$/))) {
        const r = dayIdx(m[1]);
        if (r < 0) return null;
        return k === 'session' ? { t: 'row', r } : { t: 'slot', s: r };
      }
      if (k === 'session' && (m = t.match(/^in the (morning|evening)$/))) return { t: 'col', c: m[1] === 'morning' ? 0 : 1 };
      if ((m = t.match(/^on one of the days (after|before) (\w+)$/))) {
        const r = dayIdx(m[2]);
        return r < 0 ? null : m[1] === 'after' ? { t: 'gt', r } : { t: 'lt', r };
      }
      return null;
    }
    if (k === 'month' || k === 'month2') {
      const rowOfMonth = (name: string) => {
        const mi = MONTH_NAMES.indexOf(name);
        for (let r = 0; r < this.rows; r++) if (this.monthOfRow(r) === mi) return r;
        return -1;
      };
      if (t === 'in a month that has 31 days') return { t: 'd31' };
      if (t === 'in a month that has 30 days') return { t: 'd30' };
      if ((m = t.match(/^in one of the months (after|before) (\w+)$/))) {
        const r = rowOfMonth(m[2]);
        return r < 0 ? null : m[1] === 'after' ? { t: 'gt', r } : { t: 'lt', r };
      }
      if ((m = t.match(/^in (\w+)$/))) {
        const r = rowOfMonth(m[1]);
        if (r < 0) return null;
        return k === 'month' ? { t: 'slot', s: r } : { t: 'row', r };
      }
      if (k === 'month2') {
        const dates = this.f.labels.dates!;
        if ((m = t.match(/^on (\d+)(st|nd|rd|th) (\w+)$/))) {
          const c = dates.indexOf(Number(m[1]));
          const r = rowOfMonth(m[3]);
          if (c < 0 || r < 0 || suffix(Number(m[1])) !== m[2]) return null;
          return { t: 'slot', s: r * 2 + c };
        }
        if ((m = t.match(/^on the (\d+)(st|nd|rd|th) of a month$/))) {
          const c = dates.indexOf(Number(m[1]));
          return c < 0 ? null : { t: 'col', c };
        }
      }
      return null;
    }
    if (k === 'rank') {
      const s = this.parseRank(t);
      return s === null ? null : { t: 'slot', s };
    }
    return null;
  }

  /** Does slot s satisfy the predicate? (independent semantics) */
  inPred(p: Pred, s: number): boolean {
    const r = this.row(s);
    switch (p.t) {
      case 'slot':
        return s === p.s;
      case 'row':
        return r === p.r;
      case 'col':
        return this.col(s) === p.c;
      case 'even':
        return (r + 1) % 2 === 0;
      case 'odd':
        return (r + 1) % 2 === 1;
      case 'prime':
        return PRIMES.includes(r + 1);
      case 'gt':
        return r > p.r;
      case 'lt':
        return r < p.r;
      case 'd31':
        return DAYS_IN[this.monthOfRow(r)] === 31;
      case 'd30':
        return DAYS_IN[this.monthOfRow(r)] === 30;
    }
  }

  /* ---------------- attribute predicates ---------------- */

  /** "likes Red" etc. → attribute entity, or null. */
  attrFromPred(verb: string, value: string): number | null {
    const fam: Record<string, string[]> = {
      likes: ['colour', 'fruit', 'flower'],
      'is from': ['city'],
      plays: ['sport'],
      teaches: ['subject'],
      is: ['colour'],
      contains: ['item'],
    };
    const kinds = fam[verb];
    if (!kinds) return null;
    if ((verb === 'is' || verb === 'contains') !== (this.kind === 'box')) return null;
    for (let k = 0; k < this.K; k++) {
      const cat = this.f.cats[k];
      if (!kinds.includes(cat.kind)) continue;
      const i = cat.values.indexOf(value);
      if (i >= 0) return (k + 1) * this.P + i;
    }
    return null;
  }

  /* ---------------- clue parsing ---------------- */

  parseClue(text: string): Clue | null {
    const t = this.tokenize(text);
    const V = this.verbs();
    const k = this.kind;
    const num = (w: string) => WORDS.indexOf(w);
    const e = (x: string) => Number(x);
    let m: RegExpMatchArray | null;
    const re = (src: string) => new RegExp(`^${src}\\.$`);

    if (k === 'rank') {
      const [top, bottom, more, less] = this.rankWords();
      const cmpDir = (w: string) => (w === more ? 1 : w === less ? -1 : 0);
      if ((m = t.match(re(`${E} is (${more}|${less}) than ${E} but (${more}|${less}) than ${E}`)))) {
        if (m[2] !== more || m[4] !== less) return null;
        return { k: 'btw', a: e(m[1]), b: e(m[3]), c: e(m[5]) };
      }
      if ((m = t.match(re(`Only ${NUMW} (person is|persons are) ${more} than ${E} but ${less} than ${E}`)))) {
        const n = num(m[1]);
        if ((n === 1) !== (m[2] === 'person is')) return null;
        return { k: 'delta', a: e(m[4]), b: e(m[3]), d: n + 1 };
      }
      if ((m = t.match(re(`${E} is (${more}|${less}) than ${E}`)))) return cmpDir(m[2]) === 1 ? { k: 'order', a: e(m[1]), b: e(m[3]) } : { k: 'order', a: e(m[3]), b: e(m[1]) };
      if ((m = t.match(re(`Only ${NUMW} (person is|persons are) (${more}|${less}) than ${E}`)))) {
        const n = num(m[1]);
        if ((n === 1) !== (m[2] === 'person is')) return null;
        return { k: 'count', e: e(m[4]), dir: m[3] === more ? 1 : -1, n };
      }
      if ((m = t.match(re(`At least one person is (${more}|${less}) than ${E}`)))) return { k: 'countc', e: e(m[2]), dir: m[1] === more ? 1 : -1, op: 'gt', n: 0 };
      if ((m = t.match(re(`More than one person is (${more}|${less}) than ${E}`)))) return { k: 'countc', e: e(m[2]), dir: m[1] === more ? 1 : -1, op: 'gt', n: 1 };
      if ((m = t.match(re(`(More|Less) than ${NUMW} persons are (${more}|${less}) than ${E}`)))) return { k: 'countc', e: e(m[4]), dir: m[3] === more ? 1 : -1, op: m[1] === 'More' ? 'gt' : 'lt', n: num(m[2]) };
      if ((m = t.match(re(`Neither ${E} nor ${E} is (.+)`)))) {
        const s = this.parseRank(m[3]);
        return s === null ? null : { k: 'not', es: [e(m[1]), e(m[2])], p: { t: 'slot', s } };
      }
      if ((m = t.match(re(`${E} is not (.+)`)))) {
        const s = this.parseRank(m[2]);
        return s === null ? null : { k: 'not', es: [e(m[1])], p: { t: 'slot', s } };
      }
      if ((m = t.match(re(`${E} is (\\d+) cm tall`))) && top === 'tallest') return { k: 'val', e: e(m[1]), v: Number(m[2]) };
      if ((m = t.match(re(`${E} weighs (\\d+) kg`))) && top === 'heaviest') return { k: 'val', e: e(m[1]), v: Number(m[2]) };
      if ((m = t.match(re(`The (.+) person is (\\d+) cm tall`))) && top === 'tallest') {
        const s = this.parseRank(`the ${m[1]}`);
        return s === null ? null : { k: 'rval', s, v: Number(m[2]) };
      }
      if ((m = t.match(re(`The (.+) person weighs (\\d+) kg`))) && top === 'heaviest') {
        const s = this.parseRank(`the ${m[1]}`);
        return s === null ? null : { k: 'rval', s, v: Number(m[2]) };
      }
      if ((m = t.match(re(`${E} is (.+)`)))) {
        const s = this.parseRank(m[2]);
        return s === null ? null : { k: 'is', e: e(m[1]), p: { t: 'slot', s } };
      }
      void bottom;
      return null;
    }

    // attribute links
    if ((m = t.match(re(`${E} (likes|is from|plays|teaches|is|contains) (\\w+)`)))) {
      const b = this.attrFromPred(m[2], m[3]);
      if (b !== null) return { k: 'link', a: e(m[1]), b };
    }
    if ((m = t.match(re(`${E} (does not like|is not from|does not play|does not teach|is not|does not contain) (\\w+)`)))) {
      const pos = { 'does not like': 'likes', 'is not from': 'is from', 'does not play': 'plays', 'does not teach': 'teaches', 'is not': 'is', 'does not contain': 'contains' }[m[2]]!;
      const b = this.attrFromPred(pos, m[3]);
      if (b !== null) return { k: 'nlink', a: e(m[1]), b };
    }

    // month (calendar) specials
    if (k === 'month') {
      if ((m = t.match(re(`${E} was born in the month immediately (after|before) the month in which ${E} was born`))))
        return m[2] === 'after' ? { k: 'delta', a: e(m[1]), b: e(m[3]), d: 1 } : { k: 'delta', a: e(m[3]), b: e(m[1]), d: 1 };
      if ((m = t.match(re(`${E} was born ${NUMW} months (after|before) ${E}`)))) {
        const n = num(m[2]);
        if (n < 2) return null;
        return m[3] === 'after' ? { k: 'delta', a: e(m[1]), b: e(m[4]), d: n } : { k: 'delta', a: e(m[4]), b: e(m[1]), d: n };
      }
      if ((m = t.match(re(`No one was born in the month immediately (after|before) the month in which ${E} was born`)))) return { k: 'empty', e: e(m[2]), dir: m[1] === 'after' ? 1 : -1 };
      if ((m = t.match(re(`${E} and ${E} were not born in consecutive months`)))) return { k: 'nadj', a: e(m[1]), b: e(m[2]) };
    }

    // floor × flat specials
    if (k === 'flat') {
      if ((m = t.match(re(`${E} lives immediately (above|below) ${E}`)))) return m[2] === 'above' ? { k: 'vert', a: e(m[1]), b: e(m[3]), d: 1 } : { k: 'vert', a: e(m[3]), b: e(m[1]), d: 1 };
      if ((m = t.match(re(`${E} lives on the floor immediately (above|below) the floor of ${E}`))))
        return m[2] === 'above' ? { k: 'rdelta', a: e(m[1]), b: e(m[3]), d: 1 } : { k: 'rdelta', a: e(m[3]), b: e(m[1]), d: 1 };
      if ((m = t.match(re(`${E} and ${E} live on adjacent floors`)))) return { k: 'rgap', a: e(m[1]), b: e(m[2]), n: 0 };
      if ((m = t.match(re(`Only ${NUMW} (floor is|floors are) between the floors of ${E} and ${E}`)))) {
        const n = num(m[1]);
        if ((n === 1) !== (m[2] === 'floor is')) return null;
        return { k: 'rgap', a: e(m[3]), b: e(m[4]), n };
      }
      if ((m = t.match(re(`${E} lives on a floor (above|below) the floor of ${E}`)))) return m[2] === 'above' ? { k: 'rorder', a: e(m[1]), b: e(m[3]) } : { k: 'rorder', a: e(m[3]), b: e(m[1]) };
      if ((m = t.match(re(`${E} lives on the same floor as ${E}`)))) return { k: 'srow', a: e(m[1]), b: e(m[2]) };
      if ((m = t.match(re(`${E} and ${E} live on different floors`)))) return { k: 'drow', a: e(m[1]), b: e(m[2]) };
      if ((m = t.match(re(`${E} lives in the same type of flat as ${E}`)))) return { k: 'scol', a: e(m[1]), b: e(m[2]) };
      if ((m = t.match(re(`${E} and ${E} live in different types of flats`)))) return { k: 'dcol', a: e(m[1]), b: e(m[2]) };
      if ((m = t.match(re(`${E} lives to the (east|west) of ${E}`)))) return m[2] === 'east' ? { k: 'east', a: e(m[1]), b: e(m[3]) } : { k: 'east', a: e(m[3]), b: e(m[1]) };
      if ((m = t.match(re(`${E} does not live immediately above or immediately below ${E}`)))) return { k: 'nadj', a: e(m[1]), b: e(m[2]) };
    }
    if (k === 'month2' || k === 'session') {
      const same = k === 'month2' ? 'were born in the same month' : 'have lectures on the same day';
      const diff = k === 'month2' ? 'were born in different months' : 'have lectures on different days';
      if ((m = t.match(re(`${E} and ${E} ${same}`)))) return { k: 'srow', a: e(m[1]), b: e(m[2]) };
      if ((m = t.match(re(`${E} and ${E} ${diff}`)))) return { k: 'drow', a: e(m[1]), b: e(m[2]) };
    }

    const [u1, u2] = V.unit;
    const cnt = (w: string, unit: string, verb: string) => {
      const n = num(w);
      const okU = n === 1 ? unit === u1 && verb === V.s : unit === u2 && verb === V.p;
      return okU ? n : -1;
    };
    const vs = `(${V.s}|${V.p})`;
    const us = `(${u1}|${u2})`;
    if (k !== 'flat') {
      if ((m = t.match(re(`Only ${NUMW} ${us} ${vs} between ${E} and ${E}, and ${E} ${V.s} (${V.up}|${V.down}) ${E}`)))) {
        const n = cnt(m[1], m[2], m[3]);
        if (n < 1) return null;
        const pair = [e(m[4]), e(m[5])].sort().join();
        if ([e(m[6]), e(m[8])].sort().join() !== pair) return null;
        return m[7] === V.up ? { k: 'delta', a: e(m[6]), b: e(m[8]), d: n + 1 } : { k: 'delta', a: e(m[8]), b: e(m[6]), d: n + 1 };
      }
      if ((m = t.match(re(`${E} ${V.s} immediately (${V.up}|${V.down}) ${E}`))))
        return m[2] === V.up ? { k: 'delta', a: e(m[1]), b: e(m[3]), d: 1 } : { k: 'delta', a: e(m[3]), b: e(m[1]), d: 1 };
      if ((m = t.match(re(`Only ${NUMW} ${us} ${vs} between ${E} and ${E}`)))) {
        const n = cnt(m[1], m[2], m[3]);
        return n < 1 ? null : { k: 'gap', a: e(m[4]), b: e(m[5]), n };
      }
      if ((m = t.match(re(`At least one ${u1} ${V.s} between ${E} and ${E}`)))) return { k: 'gapc', a: e(m[1]), b: e(m[2]), op: 'gt', n: 0 };
      if ((m = t.match(re(`More than one ${u1} ${V.s} between ${E} and ${E}`)))) return { k: 'gapc', a: e(m[1]), b: e(m[2]), op: 'gt', n: 1 };
      if ((m = t.match(re(`(More|Less) than ${NUMW} ${u2} ${V.p} between ${E} and ${E}`)))) {
        const n = num(m[2]);
        if (n < 2) return null;
        return { k: 'gapc', a: e(m[3]), b: e(m[4]), op: m[1] === 'More' ? 'gt' : 'lt', n };
      }
      if ((m = t.match(re(`${E} ${V.neg} immediately ${V.up} or immediately ${V.down} ${E}`)))) return { k: 'nadj', a: e(m[1]), b: e(m[2]) };
      if ((m = t.match(re(`${E} ${V.neg} immediately (${V.up}|${V.down}) ${E}`)))) return { k: 'ndelta', a: e(m[1]), b: e(m[3]), d: m[2] === V.up ? 1 : -1 };
      if ((m = t.match(re(`As many ${u2} ${V.p} between ${E} and ${E} as between ${E} and ${E}`)))) {
        if (m[2] !== m[3]) return null;
        return { k: 'eqgap', a: e(m[1]), b: e(m[2]), c: e(m[4]) };
      }
      if ((m = t.match(re(`Only ${NUMW} ${us} ${vs} (${V.up}|${V.down}) ${E}`)))) {
        const n = cnt(m[1], m[2], m[3]);
        return n < 1 ? null : { k: 'count', e: e(m[5]), dir: m[4] === V.up ? 1 : -1, n };
      }
      if ((m = t.match(re(`At least one ${u1} ${V.s} (${V.up}|${V.down}) ${E}`)))) return { k: 'countc', e: e(m[2]), dir: m[1] === V.up ? 1 : -1, op: 'gt', n: 0 };
      if ((m = t.match(re(`More than one ${u1} ${V.s} (${V.up}|${V.down}) ${E}`)))) return { k: 'countc', e: e(m[2]), dir: m[1] === V.up ? 1 : -1, op: 'gt', n: 1 };
      if ((m = t.match(re(`(More|Less) than ${NUMW} ${u2} ${V.p} (${V.up}|${V.down}) ${E}`)))) {
        const n = num(m[2]);
        if (n < 2) return null;
        return { k: 'countc', e: e(m[4]), dir: m[3] === V.up ? 1 : -1, op: m[1] === 'More' ? 'gt' : 'lt', n };
      }
      if ((m = t.match(re(`As many ${u2} ${V.p} ${V.down} ${E} as ${V.up} ${E}`)))) return { k: 'mirror', a: e(m[1]), b: e(m[2]) };
      if ((m = t.match(re(`${E} ${V.s} ${V.up} ${E} but ${V.down} ${E}`)))) return { k: 'btw', a: e(m[1]), b: e(m[2]), c: e(m[3]) };
      if ((m = t.match(re(`${E} ${V.s} (${V.up}|${V.down}) ${E}`)))) return m[2] === V.up ? { k: 'order', a: e(m[1]), b: e(m[3]) } : { k: 'order', a: e(m[3]), b: e(m[1]) };
    }
    // positions
    if ((m = t.match(re(`Neither ${E} nor ${E} ${V.s} (.+)`)))) {
      const p = this.parsePos(m[3]);
      return p ? { k: 'not', es: [e(m[1]), e(m[2])], p } : null;
    }
    if ((m = t.match(re(`${E} ${V.neg} (.+)`)))) {
      const p = this.parsePos(m[2]);
      return p ? { k: 'not', es: [e(m[1])], p } : null;
    }
    if ((m = t.match(re(`${E} ${V.s} (.+)`)))) {
      const p = this.parsePos(m[2]);
      return p ? { k: 'is', e: e(m[1]), p } : null;
    }
    return null;
  }

  /* ---------------- semantics ---------------- */

  /** occupancy-aware person count strictly between / above / below, given who sits where */
  countIn(occ: (s: number) => boolean, lo: number, hi: number): number {
    let n = 0;
    for (let s = lo; s <= hi; s++) if (occ(s)) n++;
    return n;
  }

  /**
   * Evaluate a clue on (possibly partial) positions. Returns true/false, or null when it cannot be decided yet.
   * pos[e] = slot or −1 (unplaced); occ(s) = true/false, or null when unknown.
   */
  evalClue(c: Clue, pos: number[], occ: (s: number) => boolean | null, complete: boolean): boolean | null {
    const S = this.S;
    const need = (...es: number[]) => es.every((x) => pos[x] >= 0);
    const between = (x: number, y: number): number | null => {
      let n = 0;
      for (let s = Math.min(x, y) + 1; s < Math.max(x, y); s++) {
        const o = occ(s);
        if (o === null) return null;
        if (o) n++;
      }
      return n;
    };
    const side = (x: number, dir: number): number | null => {
      let n = 0;
      for (let s = dir > 0 ? x + 1 : 0; dir > 0 ? s < S : s < x; s++) {
        const o = occ(s);
        if (o === null) return null;
        if (o) n++;
      }
      return n;
    };
    const cmp = (v: number | null, op: 'gt' | 'lt', n: number) => (v === null ? null : op === 'gt' ? v > n : v < n);
    switch (c.k) {
      case 'is':
        return need(c.e) ? this.inPred(c.p, pos[c.e]) : null;
      case 'not': {
        let unknown = false;
        for (const x of c.es) {
          if (pos[x] < 0) unknown = true;
          else if (this.inPred(c.p, pos[x])) return false;
        }
        return unknown ? null : true;
      }
      case 'link':
        return need(c.a, c.b) ? pos[c.a] === pos[c.b] : null;
      case 'nlink':
        return need(c.a, c.b) ? pos[c.a] !== pos[c.b] : null;
      case 'delta':
        return need(c.a, c.b) ? pos[c.a] - pos[c.b] === c.d : null;
      case 'vert':
        return need(c.a, c.b) ? this.col(pos[c.a]) === this.col(pos[c.b]) && this.row(pos[c.a]) - this.row(pos[c.b]) === c.d : null;
      case 'rdelta':
        return need(c.a, c.b) ? this.row(pos[c.a]) - this.row(pos[c.b]) === c.d : null;
      case 'rgap':
        return need(c.a, c.b) ? Math.abs(this.row(pos[c.a]) - this.row(pos[c.b])) === c.n + 1 : null;
      case 'rorder':
        return need(c.a, c.b) ? this.row(pos[c.a]) > this.row(pos[c.b]) : null;
      case 'srow':
        return need(c.a, c.b) ? this.row(pos[c.a]) === this.row(pos[c.b]) : null;
      case 'drow':
        return need(c.a, c.b) ? this.row(pos[c.a]) !== this.row(pos[c.b]) : null;
      case 'scol':
        return need(c.a, c.b) ? this.col(pos[c.a]) === this.col(pos[c.b]) : null;
      case 'dcol':
        return need(c.a, c.b) ? this.col(pos[c.a]) !== this.col(pos[c.b]) : null;
      case 'east':
        return need(c.a, c.b) ? this.row(pos[c.a]) === this.row(pos[c.b]) && this.col(pos[c.a]) === 1 && this.col(pos[c.b]) === 0 : null;
      case 'order':
        return need(c.a, c.b) ? pos[c.a] > pos[c.b] : null;
      case 'btw':
        return need(c.a, c.b, c.c) ? pos[c.b] < pos[c.a] && pos[c.a] < pos[c.c] : null;
      case 'nadj':
        if (!need(c.a, c.b)) return null;
        if (this.kind === 'flat') return !(this.col(pos[c.a]) === this.col(pos[c.b]) && Math.abs(this.row(pos[c.a]) - this.row(pos[c.b])) === 1);
        return Math.abs(pos[c.a] - pos[c.b]) !== 1;
      case 'ndelta':
        return need(c.a, c.b) ? pos[c.a] - pos[c.b] !== c.d : null;
      case 'gap':
        if (!need(c.a, c.b)) return null;
        if (pos[c.a] === pos[c.b]) return false;
        return ((v) => (v === null ? null : v === c.n))(between(pos[c.a], pos[c.b]));
      case 'gapc':
        if (!need(c.a, c.b)) return null;
        if (pos[c.a] === pos[c.b]) return false;
        return cmp(between(pos[c.a], pos[c.b]), c.op, c.n);
      case 'eqgap': {
        if (!need(c.a, c.b, c.c)) return null;
        if (pos[c.a] === pos[c.b] || pos[c.b] === pos[c.c]) return false;
        const x = between(pos[c.a], pos[c.b]);
        const y = between(pos[c.b], pos[c.c]);
        return x === null || y === null ? null : x === y;
      }
      case 'count':
        return need(c.e) ? ((v) => (v === null ? null : v === c.n))(side(pos[c.e], c.dir)) : null;
      case 'countc':
        return need(c.e) ? cmp(side(pos[c.e], c.dir), c.op, c.n) : null;
      case 'mirror': {
        if (!need(c.a, c.b)) return null;
        const x = side(pos[c.a], -1);
        const y = side(pos[c.b], 1);
        return x === null || y === null ? null : x === y;
      }
      case 'empty': {
        if (!need(c.e)) return null;
        const t = pos[c.e] + c.dir;
        if (t < 0 || t >= S) return true;
        const o = occ(t);
        return o === null ? null : !o;
      }
      case 'val':
      case 'rval':
        return complete ? true : null;
    }
  }

  /** Categories of an entity. */
  cat(e: number): number {
    return Math.floor(e / this.P);
  }

  /**
   * Plain enumeration, entity by entity in a fixed order (persons first, then whichever entity shares most clues
   * with those already placed). Each entity tries every free slot of its kind; every clue touching it is then
   * checked, letting at most two still-unplaced entities take any slot (a relaxation, so nothing valid is
   * pruned). Complete assignments are checked exactly against every clue.
   */
  solve(clues: Clue[], limit = 2): number[][] {
    const { S, P, K, E } = this;
    const vac = S - P;
    const pos = new Array<number>(E).fill(-1);
    const personAt = new Array<number>(S).fill(-1);
    const usedBy: boolean[][] = Array.from({ length: K + 1 }, () => new Array<boolean>(S).fill(false));
    let placedPersons = 0;
    const out: number[][] = [];
    // Layouts with vacant slots: the set of occupied slots is enumerated first (C(S, P) patterns), after which
    // every count clue can be evaluated as soon as its own entities are placed.
    let pattern = -1;
    const occ = (t: number): boolean | null =>
      pattern >= 0 ? ((pattern >> t) & 1) === 1 : personAt[t] >= 0 ? true : placedPersons === P ? false : vac === 0 ? true : null;
    const ents = (c: Clue): number[] => {
      switch (c.k) {
        case 'is':
        case 'count':
        case 'countc':
        case 'empty':
        case 'val':
          return [c.e];
        case 'not':
          return c.es;
        case 'rval':
          return [];
        case 'eqgap':
        case 'btw':
          return [c.a, c.b, c.c];
        default:
          return [c.a, c.b];
      }
    };
    const byEntity: number[][] = Array.from({ length: E }, () => []);
    clues.forEach((c, i) => ents(c).forEach((x) => byEntity[x].push(i)));
    // static order
    const order: number[] = [];
    const chosen = new Set<number>();
    const score = (x: number) => byEntity[x].reduce((acc, i) => acc + 1 + ents(clues[i]).filter((y) => chosen.has(y)).length * 4, 0);
    while (order.length < E) {
      let best = -1;
      let bestScore = -1;
      for (let x = 0; x < E; x++) {
        if (chosen.has(x)) continue;
        if (vac > 0 && x >= P && placedCountIn(order, P) < P) continue; // persons first when months can be vacant
        const sc = score(x);
        if (sc > bestScore) {
          bestScore = sc;
          best = x;
        }
      }
      order.push(best);
      chosen.add(best);
    }
    function placedCountIn(list: number[], n: number): number {
      return list.filter((x) => x < n).length;
    }
    const feasible = (c: Clue): boolean => {
      const direct = this.evalClue(c, pos, occ, false);
      if (direct !== null) return direct;
      const unplaced = ents(c).filter((x) => pos[x] < 0);
      if (unplaced.length === 0 || unplaced.length > 2) return true;
      const tryAt = (j: number): boolean => {
        if (j === unplaced.length) return this.evalClue(c, pos, occ, false) !== false;
        const cat = Math.floor(unplaced[j] / P);
        for (let t = 0; t < S; t++) {
          if (usedBy[cat][t]) continue;
          if (pattern >= 0 && ((pattern >> t) & 1) === 0) continue;
          pos[unplaced[j]] = t;
          const ok = tryAt(j + 1);
          pos[unplaced[j]] = -1;
          if (ok) return true;
        }
        return false;
      };
      return tryAt(0);
    };
    const valuesOk = (): boolean => {
      const known: [number, number][] = [];
      for (const c of clues) {
        if (c.k === 'val') known.push([pos[c.e], c.v]);
        if (c.k === 'rval') known.push([c.s, c.v]);
      }
      for (const [s1, v1] of known) for (const [s2, v2] of known) if ((s1 === s2 && v1 !== v2) || (s1 < s2 && !(v1 < v2))) return false;
      return true;
    };
    const rec = (i: number): void => {
      if (out.length >= limit) return;
      if (i === E) {
        for (let x = P; x < E; x++) if (personAt[pos[x]] < 0) return; // attributes only on occupied slots
        if (clues.every((c) => this.evalClue(c, pos, occ, true) === true) && valuesOk()) out.push(pos.slice());
        return;
      }
      const x = order[i];
      const cat = Math.floor(x / P);
      for (let t = 0; t < S && out.length < limit; t++) {
        if (usedBy[cat][t]) continue;
        if (cat > 0 && vac > 0 && personAt[t] < 0) continue;
        if (cat === 0 && pattern >= 0 && ((pattern >> t) & 1) === 0) continue;
        usedBy[cat][t] = true;
        pos[x] = t;
        if (cat === 0) {
          personAt[t] = x;
          placedPersons++;
        }
        const ids = new Set(byEntity[x]);
        if (cat === 0 && vac > 0 && pattern < 0) clues.forEach((c, j) => ['gap', 'gapc', 'eqgap', 'count', 'countc', 'mirror', 'empty'].includes(c.k) && ids.add(j));
        let ok = true;
        for (const j of ids)
          if (!feasible(clues[j])) {
            ok = false;
            break;
          }
        if (ok) rec(i + 1);
        if (cat === 0) {
          personAt[t] = -1;
          placedPersons--;
        }
        pos[x] = -1;
        usedBy[cat][t] = false;
      }
    };
    if (vac === 0) rec(0);
    else {
      const choose = (from: number, left: number, mask: number): void => {
        if (out.length >= limit) return;
        if (left === 0) {
          pattern = mask;
          rec(0);
          return;
        }
        for (let t = from; t <= S - left; t++) choose(t + 1, left - 1, mask | (1 << t));
      };
      choose(0, P, 0);
      pattern = -1;
    }    return out;
  }
}
/* ------------------------------------------------------------------ */
/* Canonical clue keys                                                 */
/* ------------------------------------------------------------------ */

function canon(c: Clue): string {
  const sym = (a: number, b: number) => (a < b ? [a, b] : [b, a]);
  switch (c.k) {
    case 'gap':
    case 'rgap': {
      const [a, b] = sym(c.a, c.b);
      return JSON.stringify({ k: c.k, a, b, n: c.n });
    }
    case 'gapc': {
      const [a, b] = sym(c.a, c.b);
      return JSON.stringify({ k: c.k, a, b, op: c.op, n: c.n });
    }
    case 'nadj':
    case 'srow':
    case 'drow':
    case 'scol':
    case 'dcol':
    case 'link':
    case 'nlink': {
      const [a, b] = sym(c.a, c.b);
      return JSON.stringify({ k: c.k, a, b });
    }
    case 'eqgap': {
      const [a, cc] = sym(c.a, c.c);
      return JSON.stringify({ k: c.k, a, b: c.b, c: cc });
    }
    case 'not':
      return JSON.stringify({ k: c.k, es: c.es.slice().sort((x, y) => x - y), p: c.p });
    case 'is':
      return JSON.stringify({ k: c.k, e: c.e, p: c.p });
    default: {
      const o: Record<string, unknown> = {};
      for (const key of Object.keys(c).sort()) o[key] = (c as unknown as Record<string, unknown>)[key];
      return JSON.stringify(o);
    }
  }
}

function predKey(p: Pred): string {
  return JSON.stringify(Object.keys(p).sort().map((k) => [k, (p as unknown as Record<string, unknown>)[k]]));
}

function sameClue(a: Clue, b: Clue): boolean {
  if (a.k === 'is' && b.k === 'is') return a.e === b.e && predKey(a.p) === predKey(b.p);
  if (a.k === 'not' && b.k === 'not') return a.es.slice().sort().join() === b.es.slice().sort().join() && predKey(a.p) === predKey(b.p);
  return canon(a) === canon(b);
}

/* ------------------------------------------------------------------ */
/* Answers                                                             */
/* ------------------------------------------------------------------ */

class Solved {
  readonly personAt: number[];
  constructor(
    readonly z: Puzzle,
    readonly pos: number[],
  ) {
    this.personAt = new Array<number>(z.S).fill(-1);
    for (let p = 0; p < z.P; p++) this.personAt[pos[p]] = p;
  }
  before(s: number): number {
    return this.personAt.slice(0, s).filter((p) => p >= 0).length;
  }
  after(s: number): number {
    return this.personAt.slice(s + 1).filter((p) => p >= 0).length;
  }
  holder(e: number): number {
    return this.personAt[this.pos[e]];
  }
  label(e: number): string {
    const z = this.z;
    if (e < z.P) return z.f.names[e];
    const k = Math.floor(e / z.P) - 1;
    return z.f.cats[k].values[e % z.P];
  }
  posLabel(s: number): string {
    const z = this.z;
    switch (z.kind) {
      case 'floor':
        return `Floor ${s + 1}`;
      case 'box':
        return `${s + 1}${suffix(s + 1)}`;
      case 'day':
      case 'week':
        return WEEKDAYS[s];
      case 'session':
        return `${z.dayOfRow(z.row(s))} ${z.col(s) === 0 ? 'morning' : 'evening'}`;
      case 'month':
        return MONTH_NAMES[s];
      case 'month2': {
        const d = z.f.labels.dates![z.col(s)];
        return `${d}${suffix(d)} ${MONTH_NAMES[z.monthOfRow(z.row(s))]}`;
      }
      case 'flat':
        return `Flat ${z.f.labels.flats![z.col(s)]}, floor ${z.row(s) + 1}`;
      case 'rank': {
        const [top, bottom] = z.rankWords();
        const fromTop = z.S - s;
        const ph = fromTop <= Math.ceil(z.S / 2) ? (fromTop === 1 ? top : `${ORDW[fromTop]} ${top}`) : s === 0 ? bottom : `${ORDW[s + 1]} ${bottom}`;
        return ph.charAt(0).toUpperCase() + ph.slice(1);
      }
    }
  }
}

function optionIndex(options: string[], pred: (o: string, i: number) => boolean, what: string): number {
  const hits = options.map((o, i) => (pred(o, i) ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) throw new Error(`${what}: ${hits.length} options qualify in ${JSON.stringify(options)}`);
  return hits[0];
}

function answer(z: Puzzle, w: Solved, clues: Clue[], prompt: string, options: string[]): number | string {
  const t = z.tokenize(prompt);
  const V = z.verbs();
  const k = z.kind;
  let m: RegExpMatchArray | null;
  const e = (x: string) => Number(x);
  const nameAt = (s: number) => {
    if (s < 0 || s >= z.S || w.personAt[s] < 0) throw new Error(`no person at slot ${s}`);
    return z.f.names[w.personAt[s]];
  };
  const [top, , more, less] = z.rankWords();

  if (t === 'Four of the following five are alike in a certain way based on the given arrangement and so form a group. Which one does not belong to that group?') {
    // pairs "X – Y": offset of the second from the first (persons' order; floors × flats: row/col offsets)
    const ordOf = (x: number) => w.before(w.pos[x]);
    const sigs = options.map((o) => {
      const parts = o.split(' – ');
      if (parts.length !== 2) throw new Error(`odd option ${o}`);
      const a = z.f.names.indexOf(parts[0]);
      let b = z.f.names.indexOf(parts[1]);
      if (b < 0) {
        for (let kk = 0; kk < z.K; kk++) {
          const i = z.f.cats[kk].values.indexOf(parts[1]);
          if (i >= 0) b = (kk + 1) * z.P + i;
        }
      }
      if (a < 0 || b < 0) throw new Error(`odd option ${o}`);
      if (k === 'flat') return [z.row(w.pos[b]) - z.row(w.pos[a]), z.col(w.pos[b]) - z.col(w.pos[a])];
      return [ordOf(b) - ordOf(a)];
    });
    const key = (s: number[]) => s.join(',');
    const abs = (s: number[]) => s.map(Math.abs).join(',');
    const groups = new Map<string, number[]>();
    sigs.forEach((s, i) => groups.set(key(s), [...(groups.get(key(s)) ?? []), i]));
    const big = [...groups.values()].find((g) => g.length === 4);
    if (!big) throw new Error('odd: no group of four');
    const odd = [0, 1, 2, 3, 4].find((i) => !big.includes(i))!;
    // no competing grouping by distance alone
    if (abs(sigs[odd]) === abs(sigs[big[0]])) throw new Error('odd: ambiguous by distance');
    return odd;
  }
  if (t === 'Which of the following statements is true?') {
    return optionIndex(
      options,
      (o) => {
        const c = z.parseClue(`${o}.`);
        if (!c) throw new Error(`statement not parsed: ${o}`);
        const v = z.evalClue(c, w.pos, (s) => w.personAt[s] >= 0, true);
        if (v === null) throw new Error(`statement undecided: ${o}`);
        return v;
      },
      'statements',
    );
  }
  if (t === 'Which of the following combinations is correct?') {
    return optionIndex(
      options,
      (o) => {
        const [nm, pl, val] = o.split(' – ');
        const p = z.f.names.indexOf(nm);
        if (p < 0 || val === undefined) throw new Error(`combo ${o}`);
        let ve = -1;
        for (let kk = 0; kk < z.K; kk++) {
          const i = z.f.cats[kk].values.indexOf(val);
          if (i >= 0) ve = (kk + 1) * z.P + i;
        }
        if (ve < 0) throw new Error(`combo value ${o}`);
        return w.posLabel(w.pos[p]) === pl && w.pos[ve] === w.pos[p];
      },
      'combination',
    );
  }
  if (/^If all the .* how many .*\?$/.test(t)) {
    const sorted = z.f.names.map((n, p) => ({ n, p })).sort((a, b) => (a.n < b.n ? -1 : 1));
    const fromTop = k === 'rank';
    const expectPrompt =
      k === 'floor'
        ? 'If all the persons are rearranged in alphabetical order from the lowermost floor to the topmost floor, how many of them will remain on the same floor?'
        : k === 'box'
          ? 'If all the boxes are rearranged in alphabetical order from the bottom to the top, how many boxes will remain at the same position?'
          : k === 'rank'
            ? `If all the persons are arranged in alphabetical order from the ${top} to the ${z.rankWords()[1]}, how many of them will keep the same position?`
            : k === 'day' || k === 'week'
              ? 'If all the persons are rescheduled in alphabetical order from Monday to Sunday, how many of them will keep the same day?'
              : '';
    if (t !== expectPrompt) throw new Error(`alpha prompt: ${prompt}`);
    const same = sorted.filter((o, i) => w.pos[o.p] === (fromTop ? z.S - 1 - i : i)).length;
    return COUNT[same];
  }
  if ((m = t.match(new RegExp(`^Which of the following can be the (height|weight) of ${E}\\?$`)))) {
    if ((m[1] === 'weight') !== (top === 'heaviest')) throw new Error('measure mismatch');
    const s = w.pos[e(m[2])];
    const known = new Map<number, number>();
    for (const c of clues) {
      if (c.k === 'val') known.set(w.pos[c.e], c.v);
      if (c.k === 'rval') known.set(c.s, c.v);
    }
    if (known.has(s)) throw new Error('value already given');
    const lo = Math.max(...[...known.entries()].filter(([ss]) => ss < s).map(([, v]) => v));
    const hi = Math.min(...[...known.entries()].filter(([ss]) => ss > s).map(([, v]) => v));
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error('unbounded value');
    const unit = top === 'heaviest' ? 'kg' : 'cm';
    return optionIndex(
      options,
      (o) => {
        const mm = o.match(new RegExp(`^(\\d+) ${unit}$`));
        if (!mm) throw new Error(`value option ${o}`);
        const v = Number(mm[1]);
        return v > lo && v < hi;
      },
      'possible value',
    );
  }
  // who is at a position
  if (k === 'rank' && (m = t.match(/^Who is (.+)\?$/))) {
    const s = z.parseRank(m[1]);
    if (s === null) throw new Error(`rank ${prompt}`);
    return nameAt(s);
  }
  if (k === 'rank' && (m = t.match(new RegExp(`^How many persons are (${more}|${less}) than ${E}\\?$`)))) {
    const s = w.pos[e(m[2])];
    return COUNT[m[1] === more ? w.after(s) : w.before(s)];
  }
  if (k === 'box' && (m = t.match(new RegExp(`^Which box is kept immediately (above|below) ${E}\\?$`)))) return nameAt(w.pos[e(m[2])] + (m[1] === 'above' ? 1 : -1));
  if (k === 'box' && (m = t.match(/^Which box is kept (.+)\?$/))) {
    const p = z.parsePos(m[1]);
    if (!p || p.t !== 'slot') throw new Error(`box position ${prompt}`);
    return nameAt(p.s);
  }
  if (k === 'flat' && (m = t.match(new RegExp(`^Who lives immediately (above|below) ${E}\\?$`)))) {
    const s = w.pos[e(m[2])];
    return nameAt((z.row(s) + (m[1] === 'above' ? 1 : -1)) * 2 + z.col(s));
  }
  if (k === 'flat' && (m = t.match(new RegExp(`^Who lives to the (east|west) of ${E}\\?$`)))) {
    const s = w.pos[e(m[2])];
    const want = m[1] === 'east' ? 1 : 0;
    if (z.col(s) === want) throw new Error('side question has no answer');
    return nameAt(z.row(s) * 2 + want);
  }
  if (k !== 'flat' && k !== 'month' && k !== 'rank' && (m = t.match(new RegExp(`^Who ${V.s} immediately (${V.up}|${V.down}) ${E}\\?$`)))) {
    return nameAt(w.pos[e(m[2])] + (m[1] === V.up ? 1 : -1));
  }
  if ((m = t.match(new RegExp(`^Who ${V.s} (.+)\\?$`)))) {
    const p = z.parsePos(m[1]);
    if (!p || p.t !== 'slot') throw new Error(`position ${prompt}`);
    return nameAt(p.s);
  }
  // where is X
  const posQ: Partial<Record<F['layout']['kind'], RegExp>> = {
    floor: new RegExp(`^On which floor does ${E} live\\?$`),
    flat: new RegExp(`^Where does ${E} live\\?$`),
    box: new RegExp(`^At which position from the bottom is ${E} kept\\?$`),
    day: new RegExp(`^On which day does ${E} go\\?$`),
    week: new RegExp(`^On which day does ${E} have a lecture\\?$`),
    session: new RegExp(`^When does ${E} have a lecture\\?$`),
    month: new RegExp(`^In which month was ${E} born\\?$`),
    month2: new RegExp(`^On which date was ${E} born\\?$`),
  };
  if (posQ[k] && (m = t.match(posQ[k]!))) return w.posLabel(w.pos[e(m[1])]);
  if ((m = t.match(new RegExp(`^How many ${V.unit[1]} ${V.p} between ${E} and ${E}\\?$`)))) {
    const a = w.pos[e(m[1])];
    const b = w.pos[e(m[2])];
    if (a === b) throw new Error('same person');
    let n = 0;
    for (let s = Math.min(a, b) + 1; s < Math.max(a, b); s++) if (w.personAt[s] >= 0) n++;
    return COUNT[n];
  }
  if ((m = t.match(new RegExp(`^How many ${V.unit[1]} ${V.p} (${V.up}|${V.down}) ${E}\\?$`)))) {
    const s = w.pos[e(m[2])];
    return COUNT[m[1] === V.up ? w.after(s) : w.before(s)];
  }
  // attributes
  const attrQ: [RegExp, string[]][] = [
    [new RegExp(`^Which (colour|fruit|flower) does ${E} like\\?$`), []],
    [new RegExp(`^Which city is ${E} from\\?$`), ['city']],
    [new RegExp(`^Which sport does ${E} play\\?$`), ['sport']],
    [new RegExp(`^Which subject does ${E} teach\\?$`), ['subject']],
    [new RegExp(`^What is the colour of ${E}\\?$`), ['colour']],
    [new RegExp(`^What does ${E} contain\\?$`), ['item']],
  ];
  for (const [rx, kinds0] of attrQ) {
    if ((m = t.match(rx))) {
      const kinds = kinds0.length ? kinds0 : [m[1]];
      const who = e(m[m.length - 1]);
      const isBoxQ = rx.source.startsWith('^What');
      if (isBoxQ !== (k === 'box')) throw new Error('attribute prompt layout mismatch');
      const kk = z.f.cats.findIndex((c) => kinds.includes(c.kind));
      if (kk < 0) throw new Error(`no category for ${prompt}`);
      for (let v = 0; v < z.P; v++) if (w.pos[(kk + 1) * z.P + v] === w.pos[who]) return z.f.cats[kk].values[v];
    }
  }
  throw new Error(`unrecognised prompt: ${prompt}`);
}

/* ------------------------------------------------------------------ */

export function verify(res: GenResult<F>): (number | string)[] {
  const f = res.facts;
  const z = new Puzzle(f);
  const set = res.item.set;
  if (!set) throw new Error('puzzle item has no set');
  const [intro, body] = set.stimulus.split('\n\n');
  if (!body) throw new Error('stimulus has no clue block');
  for (const n of f.names) if (!intro.includes(n)) throw new Error(`intro misses ${n}`);
  for (const c of f.cats) for (const v of c.values) if (!intro.includes(v)) throw new Error(`intro misses ${v}`);
  const lines = body.split('\n');
  if (lines.length !== f.clues.length) throw new Error(`clue count ${lines.length} ≠ ${f.clues.length}`);
  const parsed: Clue[] = lines.map((line, i) => {
    const m = line.match(/^(\d+)\. (.+)$/);
    if (!m || Number(m[1]) !== i + 1) throw new Error(`bad clue line: ${line}`);
    const c = z.parseClue(m[2]);
    if (!c) throw new Error(`clue ${i + 1} not understood: ${m[2]}`);
    if (!sameClue(c, f.clues[i])) throw new Error(`clue ${i + 1} text means ${JSON.stringify(c)} but facts say ${JSON.stringify(f.clues[i])}`);
    return c;
  });
  const sols = z.solve(parsed, 2);
  if (sols.length !== 1) throw new Error(`expected exactly one arrangement, found ${sols.length}`);
  const w = new Solved(z, sols[0]);
  return res.item.questions.map((q) => answer(z, w, parsed, q.prompt, q.options));
}

/** Solve a facts object's clues directly (used by the bank tests for the uniqueness count). */
export function countSolutions(f: F): number {
  return new Puzzle(f).solve(f.clues, 2).length;
}
