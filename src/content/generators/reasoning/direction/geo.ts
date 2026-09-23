/** Geometry, wording and option helpers for reasoning.direction. */
import type { Rng } from '../../../../lib/rng';
import type { Rich } from '../../../types';
import { numericChoices, shuffleChoices, type Choices, type Mistake } from '../../shared/options';

export type Dir4 = 'N' | 'E' | 'S' | 'W';
export type Dir8 = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
/** Clockwise from north, 45° apart. */
export const DIR8: readonly Dir8[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const DIR4: readonly Dir4[] = ['N', 'E', 'S', 'W'];
export const DIR_NAME: Record<Dir8, string> = {
  N: 'North',
  NE: 'North-east',
  E: 'East',
  SE: 'South-east',
  S: 'South',
  SW: 'South-west',
  W: 'West',
  NW: 'North-west',
};
export const dirWord = (d: Dir8): string => DIR_NAME[d].toLowerCase();

export function angleOf(d: Dir8): number {
  return DIR8.indexOf(d) * 45;
}
export function dirAt(angle: number): Dir8 {
  return DIR8[(((Math.round(angle / 45) % 8) + 8) % 8)];
}
export function rotate(d: Dir8, deg: number): Dir8 {
  return dirAt(angleOf(d) + deg);
}
export function opposite(d: Dir8): Dir8 {
  return rotate(d, 180);
}

export const VEC: Record<Dir4, [number, number]> = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };

/** Bank-exam convention: any point with both offsets non-zero is in an intercardinal direction. */
export function dirOfVector(dx: number, dy: number): Dir8 {
  if (dx === 0 && dy === 0) throw new Error('dirOfVector: zero vector');
  const ns = dy > 0 ? 'N' : dy < 0 ? 'S' : '';
  const ew = dx > 0 ? 'E' : dx < 0 ? 'W' : '';
  return (ns + ew) as Dir8;
}

export function squareFree(sq: number): [number, number] {
  let k = 1;
  let r = sq;
  for (let f = 2; f * f <= r; f++) {
    while (r % (f * f) === 0) {
      r /= f * f;
      k *= f;
    }
  }
  return [k, r];
}

export type DistDisplay = 'simple' | 'raw';

/** Distance text from its square: 625 → "25 m", 50 → "$5\sqrt{2}$ m" (simple) / "$\sqrt{50}$ m" (raw). */
export function distTex(sq: number, mode: DistDisplay): Rich {
  const r0 = Math.round(Math.sqrt(sq));
  if (r0 * r0 === sq) return `${r0} m`;
  if (mode === 'raw') return `$\\sqrt{${sq}}$ m`;
  const [k, r] = squareFree(sq);
  return k === 1 ? `$\\sqrt{${sq}}$ m` : `$${k}\\sqrt{${r}}$ m`;
}

/** Plain-text distance for diagram labels ("5√2 m"). */
export function distPlain(sq: number, mode: DistDisplay): string {
  const r0 = Math.round(Math.sqrt(sq));
  if (r0 * r0 === sq) return `${r0} m`;
  if (mode === 'raw') return `√${sq} m`;
  const [k, r] = squareFree(sq);
  return k === 1 ? `√${sq} m` : `${k}√${r} m`;
}

export function sqrtStep(dx: number, dy: number, mode: DistDisplay): Rich {
  const a = Math.abs(dx);
  const b = Math.abs(dy);
  if (a === 0 || b === 0) return `Shortest distance = ${Math.max(a, b)} m (both points on one line).`;
  const sq = a * a + b * b;
  return `Shortest distance = $\\sqrt{${a}^2 + ${b}^2} = \\sqrt{${sq}}$${distTex(sq, mode) === `$\\sqrt{${sq}}$ m` ? ' m' : ` = ${distTex(sq, mode)}`}`;
}

/** Nearby "nice" distance squares for filler options. */
function niceNeighbours(sq: number, mode: DistDisplay): number[] {
  const out: number[] = [];
  const r0 = Math.round(Math.sqrt(sq));
  if (r0 * r0 === sq) {
    for (const d of [5, -5, 10, -10, 2, -2, 3, -3, 1, -1, 15]) if (r0 + d > 0) out.push((r0 + d) * (r0 + d));
    return out;
  }
  if (mode === 'raw') {
    for (const d of [1, -1, 2, -2, 4, -4, 10, -10]) if (sq + d > 0) out.push(sq + d);
    return out;
  }
  const [k, r] = squareFree(sq);
  for (const kk of [k + 1, k - 1, k + 2, k - 2]) if (kk > 0) out.push(kk * kk * r);
  for (const rr of [r + 1, r - 1, r + 2]) if (rr > 1) out.push(k * k * rr);
  out.push((k + 1) * (k + 1), k * k * 4);
  return out;
}

/** Distance options: ascending, same unit, correct rank uniform (numericChoices on the squares). */
export function distanceChoices(rng: Rng, sq: number, mistakes: Mistake[], mode: DistDisplay): Choices & { values: number[] } {
  const fillers = niceNeighbours(sq, mode).map((v) => ({ value: v, why: 'nearby value' }));
  const all = [...mistakes.filter((m) => m.value > 0 && Number.isInteger(m.value)), ...fillers];
  return numericChoices(rng, sq, { format: (v) => distTex(v, mode), mistakes: all, integer: true, step: Math.max(1, Math.round(sq * 0.08)) });
}

/** Five direction options (correct + most tempting mistakes, then fillers), shuffled. */
export function directionChoices(rng: Rng, correct: Dir8, tempting: readonly Dir8[]): Choices {
  const out: Dir8[] = [];
  for (const d of tempting) if (d !== correct && !out.includes(d) && out.length < 4) out.push(d);
  for (const d of rng.shuffle(DIR8)) if (d !== correct && !out.includes(d) && out.length < 4) out.push(d);
  return shuffleChoices(
    rng,
    DIR_NAME[correct],
    out.map((d) => DIR_NAME[d]),
  );
}

/* ------------------------------------------------------------------ */
/* People                                                               */
/* ------------------------------------------------------------------ */

export interface Person {
  name: string;
  g: 'm' | 'f';
}
const MEN = [
  'Ravi', 'Arjun', 'Karthik', 'Imran', 'Suresh', 'Manoj', 'Vikram', 'Rahul', 'Anil', 'Deepak', 'Farhan', 'Joseph', 'Tenzing', 'Abhishek',
  'Sandeep', 'Gaurav', 'Nikhil', 'Pranav', 'Rohit', 'Aditya', 'Siddharth', 'Vivek', 'Kunal', 'Arvind', 'Biju', 'Dinesh', 'Harish', 'Lokesh',
  'Sameer', 'Yusuf', 'Gurpreet', 'Bhaskar', 'Prakash', 'Ramesh',
];
const WOMEN = [
  'Priya', 'Anjali', 'Meera', 'Kavya', 'Sneha', 'Fatima', 'Lakshmi', 'Pooja', 'Neha', 'Divya', 'Ritu', 'Swati', 'Anita', 'Rekha', 'Shalini',
  'Nandini', 'Aparna', 'Bhavna', 'Chitra', 'Deepa', 'Farah', 'Gita', 'Hema', 'Ishita', 'Jaya', 'Lata', 'Nisha', 'Radha', 'Sunita', 'Tara',
  'Uma', 'Vandana', 'Zoya', 'Mary',
];

export function person(rng: Rng, g?: 'm' | 'f'): Person {
  const gg = g ?? (rng.chance(0.5) ? 'm' : 'f');
  return { name: rng.pick(gg === 'm' ? MEN : WOMEN), g: gg };
}
export function twoPeople(rng: Rng): [Person, Person] {
  const a = person(rng);
  let b = person(rng);
  while (b.name === a.name) b = person(rng);
  return [a, b];
}
export const he = (p: Person) => (p.g === 'm' ? 'he' : 'she');
export const He = (p: Person) => (p.g === 'm' ? 'He' : 'She');
export const his = (p: Person) => (p.g === 'm' ? 'his' : 'her');
export const him = (p: Person) => (p.g === 'm' ? 'him' : 'her');

export const PLACES_M = ['his house', 'his office', 'his school', 'the bank', 'the bus stand', 'point P', 'the post office', 'the temple gate'];
export const PLACES_F = ['her house', 'her office', 'her school', 'the bank', 'the bus stand', 'point P', 'the post office', 'the temple gate'];
