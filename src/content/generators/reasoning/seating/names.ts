import type { Rng } from '../../../../lib/rng';

/**
 * Names for seating puzzles. Real papers mostly use runs of capital letters (A–H, P–W …) and sometimes first
 * names. Letters I and O are skipped (they read as a pronoun / zero). Every first name here is a single word,
 * starts with a distinct capital within a puzzle and never collides with a clue keyword or attribute value.
 */
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('');

const FIRST_NAMES: readonly string[] = [
  'Aarav', 'Anjali', 'Arjun', 'Bhavna', 'Bala', 'Chetan', 'Charu', 'Deepak', 'Divya', 'Esha', 'Eshwar', 'Farhan',
  'Farida', 'Gauri', 'Gopal', 'Harish', 'Hema', 'Ishaan', 'Imran', 'Jyoti', 'Jatin', 'Kabir', 'Kavya', 'Kiran',
  'Lata', 'Lokesh', 'Manish', 'Meera', 'Neha', 'Nitin', 'Omkar', 'Pooja', 'Pranav', 'Rahul', 'Rekha', 'Ritu',
  'Sneha', 'Suresh', 'Tanvi', 'Tarun', 'Uma', 'Uday', 'Varun', 'Vidya', 'Wasim', 'Yamini', 'Yash', 'Zoya', 'Zubin',
  'Sameer', 'Bindu', 'Mohan', 'Nandini', 'Tejas', 'Geeta', 'Dhruv', 'Asha', 'Rohan', 'Kunal', 'Leela',
];

/** Letters that start a run of `count` consecutive letters (from the list above). */
function letterRun(rng: Rng, count: number): string[] {
  const starts: number[] = [];
  for (let i = 0; i + count <= LETTERS.length; i++) starts.push(i);
  // favour the classic runs A…, J…, P…
  const preferred = starts.filter((i) => ['A', 'J', 'K', 'L', 'M', 'P', 'Q'].includes(LETTERS[i]));
  const start = rng.chance(0.75) && preferred.length ? rng.pick(preferred) : rng.pick(starts);
  return LETTERS.slice(start, start + count);
}

function firstNames(rng: Rng, count: number): string[] {
  const byInitial = new Map<string, string[]>();
  for (const n of FIRST_NAMES) {
    const k = n[0];
    if (!byInitial.has(k)) byInitial.set(k, []);
    byInitial.get(k)!.push(n);
  }
  const initials = rng.sample([...byInitial.keys()], count);
  return initials.map((k) => rng.pick(byInitial.get(k)!)).sort();
}

/** `count` person names: letters (about 70%) or first names with distinct initials. Sorted for the intro list. */
export function pickNames(rng: Rng, count: number, allowFirstNames = true): string[] {
  if (allowFirstNames && count <= 12 && rng.chance(0.3)) return firstNames(rng, count);
  return letterRun(rng, count);
}

/** Two disjoint letter runs for parallel rows (e.g. A–E and P–T), or first names split in two. */
export function pickRowNames(rng: Rng, perRow: number): [string[], string[]] {
  if (rng.chance(0.25)) {
    const all = firstNames(rng, perRow * 2);
    const shuffled = rng.shuffle(all);
    return [shuffled.slice(0, perRow).sort(), shuffled.slice(perRow).sort()];
  }
  const pairs: [string, string][] = [
    ['A', 'P'],
    ['A', 'L'],
    ['J', 'P'],
    ['A', 'Q'],
    ['B', 'S'],
    ['L', 'T'],
  ];
  const [x, y] = rng.pick(pairs);
  const run = (c: string) => LETTERS.slice(LETTERS.indexOf(c), LETTERS.indexOf(c) + perRow);
  const r1 = run(x);
  const r2 = run(y);
  if (r1.some((n) => r2.includes(n)) || r1.length < perRow || r2.length < perRow) {
    const all = letterRun(rng, perRow * 2);
    return [all.slice(0, perRow), all.slice(perRow)];
  }
  return rng.chance(0.5) ? [r1, r2] : [r2, r1];
}

export type AttrCat = 'profession' | 'colour' | 'city';

const ATTR_POOLS: Record<AttrCat, readonly string[]> = {
  profession: ['Architect', 'Banker', 'Chef', 'Doctor', 'Engineer', 'Lawyer', 'Pilot', 'Teacher', 'Dancer', 'Singer', 'Writer', 'Nurse', 'Farmer', 'Painter'],
  colour: ['Red', 'Blue', 'Green', 'Yellow', 'Black', 'White', 'Pink', 'Orange', 'Purple', 'Grey', 'Brown', 'Violet'],
  city: ['Delhi', 'Mumbai', 'Chennai', 'Kolkata', 'Pune', 'Jaipur', 'Lucknow', 'Patna', 'Bhopal', 'Kochi', 'Indore', 'Surat', 'Nagpur', 'Ranchi'],
};

/** Attribute values for the extreme level (never sharing a spelling with a person name). */
export function pickAttrs(rng: Rng, count: number, names: readonly string[]): { cat: AttrCat; values: string[] } {
  const cat = rng.pick<AttrCat>(['profession', 'colour', 'city']);
  const pool = ATTR_POOLS[cat].filter((v) => !names.includes(v));
  const values = rng.sample(pool, count).sort();
  return { cat, values };
}
