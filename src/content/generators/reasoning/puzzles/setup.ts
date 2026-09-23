/**
 * Puzzle setups: layout, persons (letters or Indian first names), attribute categories and scene labels for each
 * subtype × difficulty. Pure data + rng choices; no clue logic here.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty } from '../../../types';
import type { Layout } from '../../solver/puzzles/model';

export type SubtypeId = 'floor' | 'floor-flat' | 'box' | 'day' | 'month' | 'comparison' | 'scheduling';

export type AttrKind = 'colour' | 'fruit' | 'flower' | 'city' | 'sport' | 'subject' | 'item';

export interface Cat {
  kind: AttrKind;
  values: string[];
}

export interface Labels {
  /** Person names are single letters. */
  letters: boolean;
  /** floor-flat: west and east flat labels. */
  flats?: [string, string];
  /** day: where they go. */
  place?: string;
  /** session: the day of each row. */
  days?: string[];
  /** month2: the two dates. */
  dates?: [number, number];
  /** comparison */
  measure?: 'height' | 'weight';
}

export interface Setup {
  sub: SubtypeId;
  difficulty: Difficulty;
  layout: Layout;
  names: string[];
  cats: Cat[];
  labels: Labels;
}

export const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const LETTER_SETS: Record<number, string[][]> = {
  5: [['A', 'B', 'C', 'D', 'E'], ['P', 'Q', 'R', 'S', 'T'], ['J', 'K', 'L', 'M', 'N'], ['V', 'W', 'X', 'Y', 'Z']],
  6: [['A', 'B', 'C', 'D', 'E', 'F'], ['P', 'Q', 'R', 'S', 'T', 'U'], ['J', 'K', 'L', 'M', 'N', 'O'], ['U', 'V', 'W', 'X', 'Y', 'Z']],
  7: [['A', 'B', 'C', 'D', 'E', 'F', 'G'], ['P', 'Q', 'R', 'S', 'T', 'U', 'V'], ['J', 'K', 'L', 'M', 'N', 'O', 'P'], ['M', 'N', 'O', 'P', 'Q', 'R', 'S']],
  8: [['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], ['P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W'], ['J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'], ['S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']],
};

/** Indian first names from many regions, both genders; picked with distinct initials. */
const INDIAN_NAMES = [
  'Aarav', 'Anjali', 'Arjun', 'Asha', 'Bhavna', 'Bharat', 'Bina', 'Chetan', 'Chitra', 'Chirag', 'Deepak', 'Divya', 'Dinesh',
  'Esha', 'Eshan', 'Farhan', 'Fatima', 'Gaurav', 'Geeta', 'Gopal', 'Harish', 'Heena', 'Hemant', 'Imran', 'Isha', 'Ishaan',
  'Jatin', 'Jyoti', 'Joseph', 'Kavya', 'Kiran', 'Kunal', 'Lalit', 'Lata', 'Leela', 'Manoj', 'Meera', 'Mohan', 'Neha',
  'Nikhil', 'Nandini', 'Omkar', 'Pooja', 'Pranav', 'Priya', 'Rahul', 'Rekha', 'Rohit', 'Sanjay', 'Sneha', 'Sakshi', 'Tanvi',
  'Tarun', 'Tenzin', 'Uday', 'Uma', 'Usha', 'Varun', 'Vidya', 'Vikram', 'Yash', 'Yamini', 'Zoya', 'Zubin',
];

export const ATTR_VALUES: Record<AttrKind, string[]> = {
  colour: ['Red', 'Blue', 'Green', 'Yellow', 'Pink', 'White', 'Black', 'Orange', 'Purple', 'Brown', 'Grey', 'Violet'],
  fruit: ['Apple', 'Mango', 'Banana', 'Guava', 'Kiwi', 'Papaya', 'Grapes', 'Litchi', 'Cherry', 'Pear', 'Plum', 'Pineapple'],
  flower: ['Rose', 'Lily', 'Lotus', 'Tulip', 'Jasmine', 'Daisy', 'Marigold', 'Orchid', 'Sunflower'],
  city: ['Delhi', 'Mumbai', 'Pune', 'Jaipur', 'Kochi', 'Patna', 'Surat', 'Indore', 'Bhopal', 'Nagpur', 'Lucknow', 'Chennai', 'Kolkata', 'Agra', 'Ranchi', 'Shimla'],
  sport: ['Cricket', 'Hockey', 'Tennis', 'Football', 'Chess', 'Kabaddi', 'Badminton', 'Volleyball', 'Carrom', 'Golf'],
  subject: ['Maths', 'Physics', 'Chemistry', 'Biology', 'English', 'Hindi', 'History', 'Geography', 'Economics', 'Accounts', 'Sanskrit'],
  item: ['Pens', 'Books', 'Toys', 'Watches', 'Shoes', 'Bags', 'Cups', 'Lamps', 'Clocks', 'Bottles', 'Candles', 'Caps'],
};

/** The verb family of an attribute: two categories in one puzzle never share a family ("likes … likes"). */
export function attrFamily(kind: AttrKind): string {
  return kind === 'colour' || kind === 'fruit' || kind === 'flower' ? 'likes' : kind;
}

const PLACES = ['gym', 'library', 'music class', 'swimming pool', 'dance class', 'yoga class', 'cooking class', 'painting class'];
const DATE_PAIRS: [number, number][] = [
  [12, 19],
  [12, 19],
  [8, 17],
  [14, 23],
  [5, 16],
  [11, 25],
];

function pickNames(rng: Rng, n: number, allowNames: boolean): { names: string[]; letters: boolean } {
  if (!allowNames || rng.chance(0.62)) return { names: rng.pick(LETTER_SETS[n]).slice(), letters: true };
  const byInitial = new Map<string, string[]>();
  for (const nm of INDIAN_NAMES) {
    const k = nm[0];
    if (!byInitial.has(k)) byInitial.set(k, []);
    byInitial.get(k)!.push(nm);
  }
  const initials = rng.sample([...byInitial.keys()], n).sort();
  return { names: initials.map((k) => rng.pick(byInitial.get(k)!)), letters: false };
}

function pickCats(rng: Rng, n: number, kinds: AttrKind[], P: number): Cat[] {
  const cats: Cat[] = [];
  const pool = rng.shuffle(kinds);
  for (const kind of pool) {
    if (cats.length >= n) break;
    if (cats.some((c) => attrFamily(c.kind) === attrFamily(kind))) continue;
    cats.push({ kind, values: rng.sample(ATTR_VALUES[kind], P) });
  }
  return cats;
}

/**
 * Attribute count per difficulty. Clerk prelims sets (medium) are almost always single-attribute (names ↔
 * positions); a second attribute is a PO-level (hard) feature and two attributes are mains-level (extreme).
 */
function attrCount(rng: Rng, d: Difficulty): number {
  switch (d) {
    case 'easy':
      return 0;
    case 'medium':
      return rng.chance(0.15) ? 1 : 0;
    case 'hard':
      return rng.chance(0.65) ? 1 : 0;
    case 'extreme':
      return rng.chance(0.6) ? 2 : 1;
  }
}

const PEOPLE_KINDS: AttrKind[] = ['colour', 'fruit', 'city', 'sport', 'flower'];

export function makeSetup(sub: SubtypeId, difficulty: Difficulty, rng: Rng): Setup {
  switch (sub) {
    case 'floor': {
      const { names, letters } = pickNames(rng, 8, true);
      return { sub, difficulty, layout: { kind: 'floor', rows: 8, cols: 1, persons: 8 }, names, cats: pickCats(rng, attrCount(rng, difficulty), PEOPLE_KINDS, 8), labels: { letters } };
    }
    case 'floor-flat': {
      const { names, letters } = pickNames(rng, 8, true);
      const flatChoices: [string, string][] = [
        ['A', 'B'],
        ['P', 'Q'],
        ['X', 'Y'],
      ];
      const ok = flatChoices.filter((f) => !f.some((x) => names.includes(x)));
      return {
        sub,
        difficulty,
        layout: { kind: 'flat', rows: 4, cols: 2, persons: 8 },
        names,
        cats: pickCats(rng, attrCount(rng, difficulty), PEOPLE_KINDS, 8),
        labels: { letters, flats: rng.pick(ok) },
      };
    }
    case 'box': {
      const { names } = pickNames(rng, 8, false);
      const n = attrCount(rng, difficulty);
      const kinds: AttrKind[] = n === 2 ? ['colour', 'item'] : [rng.pick(['colour', 'item'] as AttrKind[])];
      const cats = n === 0 ? [] : kinds.map((kind) => ({ kind, values: rng.sample(ATTR_VALUES[kind], 8) }));
      return { sub, difficulty, layout: { kind: 'box', rows: 8, cols: 1, persons: 8 }, names, cats, labels: { letters: true } };
    }
    case 'day': {
      const { names, letters } = pickNames(rng, 7, true);
      return {
        sub,
        difficulty,
        layout: { kind: 'day', rows: 7, cols: 1, persons: 7 },
        names,
        cats: pickCats(rng, attrCount(rng, difficulty), ['fruit', 'colour', 'sport', 'city', 'flower'], 7),
        labels: { letters, place: rng.pick(PLACES) },
      };
    }
    case 'month': {
      const { names, letters } = pickNames(rng, 8, true);
      const twoDates = rng.chance(0.5);
      const nAttr = difficulty === 'easy' || difficulty === 'medium' ? 0 : difficulty === 'hard' ? (rng.chance(0.5) ? 1 : 0) : twoDates && rng.chance(0.5) ? 2 : 1;
      const cats = pickCats(rng, nAttr, ['fruit', 'colour', 'city', 'flower', 'sport'], 8);
      if (twoDates) {
        let months: number[] = [];
        for (let tries = 0; tries < 50; tries++) {
          months = rng.sample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 4).sort((a, b) => a - b);
          const d30 = months.filter((m) => [3, 5, 8, 10].includes(m)).length;
          const d31 = months.filter((m) => [0, 2, 4, 6, 7, 9, 11].includes(m)).length;
          if (d30 >= 1 && d31 >= 1) break;
        }
        return {
          sub,
          difficulty,
          layout: { kind: 'month2', rows: 4, cols: 2, persons: 8, months },
          names,
          cats,
          labels: { letters, dates: rng.pick(DATE_PAIRS) },
        };
      }
      // 12 months with 4 vacant ones: persons only (the vacancies are the hard part)
      return {
        sub,
        difficulty,
        layout: { kind: 'month', rows: 12, cols: 1, persons: 8, months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
        names,
        cats: [],
        labels: { letters },
      };
    }
    case 'comparison': {
      const n = difficulty === 'easy' ? 5 : difficulty === 'extreme' ? 7 : 6;
      const { names, letters } = pickNames(rng, n, true);
      return { sub, difficulty, layout: { kind: 'rank', rows: n, cols: 1, persons: n }, names, cats: [], labels: { letters, measure: rng.pick(['height', 'weight'] as const) } };
    }
    case 'scheduling': {
      const { names: n8, letters: l8 } = pickNames(rng, 8, true);
      const session = difficulty === 'hard' ? rng.chance(0.55) : rng.chance(0.4);
      if (session) {
        const start = rng.int(0, 2);
        const kinds: AttrKind[] = difficulty === 'extreme' ? rng.shuffle(['subject', 'city'] as AttrKind[]) : [rng.pick(['subject', 'city'] as AttrKind[])];
        const cats = kinds.map((kind) => ({ kind, values: rng.sample(ATTR_VALUES[kind], 8) }));
        return {
          sub,
          difficulty,
          layout: { kind: 'session', rows: 4, cols: 2, persons: 8 },
          names: n8,
          cats,
          labels: { letters: l8, days: WEEK.slice(start, start + 4) },
        };
      }
      const { names, letters } = pickNames(rng, 7, true);
      const cats = rng.shuffle(['subject', 'city'] as AttrKind[]).map((kind) => ({ kind, values: rng.sample(ATTR_VALUES[kind], 7) }));
      return { sub, difficulty, layout: { kind: 'week', rows: 7, cols: 1, persons: 7 }, names, cats, labels: { letters } };
    }
  }
}
