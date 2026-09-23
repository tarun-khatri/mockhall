/**
 * Exam-style wording for seating puzzles. The independent verifier parses exactly these templates back into
 * constraints, so keep the two in step (tests fail loudly on any sentence the verifier cannot read).
 */
import { IN, NORTH, OUT, SOUTH, type Atom, type FaceCode, type Layout, type Ref, type Side } from '../../solver/seating/model';
import type { AttrCat } from './names';
import type { ClueItem } from './pool';

export interface RenderCtx {
  layout: Layout;
  names: readonly string[];
  attrCat?: AttrCat;
  attrValues: readonly string[];
}

export const ORD = ['', 'immediate', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'];
export const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const numWord = (n: number) => (n <= 20 ? NUM[n] : String(n));
export const ordWord = (n: number) => (n < ORD.length ? ORD[n] : `${n}th`);

export function listText(items: readonly string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function faceWord(f: number): string {
  return f === IN ? 'the centre' : f === OUT ? 'outside' : f === NORTH ? 'north' : 'south';
}

export function otherFace(f: number): FaceCode {
  return f === IN ? OUT : f === OUT ? IN : f === NORTH ? SOUTH : NORTH;
}

/** "second to the right of" / "to the immediate left of" */
export function relPhrase(side: Side, k: number): string {
  return k === 1 ? `to the immediate ${side} of` : `${ordWord(k)} to the ${side} of`;
}

const article = (w: string) => (/^[AEIOU]/.test(w) ? 'an' : 'a');

export function entityName(ctx: RenderCtx, e: number, capital = false): string {
  const P = ctx.names.length;
  if (e < P) return ctx.names[e];
  const v = ctx.attrValues[e - P];
  const s = ctx.attrCat === 'profession' ? `the ${v}` : ctx.attrCat === 'colour' ? `the one who likes ${v}` : `the person from ${v}`;
  return capital ? cap(s) : s;
}

export function refText(ctx: RenderCtx, r: Ref, capital = false): string {
  let s: string;
  switch (r.t) {
    case 'e':
      return entityName(ctx, r.e, capital);
    case 'rel':
      s = `the one who sits ${relPhrase(r.side, r.k)} ${refText(ctx, r.of)}`;
      break;
    case 'opp':
      s = ctx.layout.kind === 'parallel' ? `the one who faces ${refText(ctx, r.of)}` : `the one who sits exactly opposite ${refText(ctx, r.of)}`;
      break;
  }
  return capital ? cap(s) : s;
}

const persons = (n: number) => (n === 1 ? 'one person sits' : `${numWord(n)} persons sit`);

/** Attribute statement: "A is a Doctor" / "A likes Red" / "A is from Pune" (neg: not). */
export function attrText(ctx: RenderCtx, who: string, v: number, neg: boolean): string {
  const val = ctx.attrValues[v - ctx.names.length];
  switch (ctx.attrCat) {
    case 'profession':
      return `${who} is ${neg ? 'not ' : ''}${article(val)} ${val}`;
    case 'colour':
      return `${who} ${neg ? 'does not like' : 'likes'} ${val}`;
    default:
      return `${who} is ${neg ? 'not ' : ''}from ${val}`;
  }
}

/** One clue sentence, without the final full stop. */
export function clauseText(ctx: RenderCtx, item: ClueItem): string {
  const a0 = item.atoms[0];
  const R = (r: Ref, c = false) => refText(ctx, r, c);
  switch (item.form) {
    case 'rel': {
      const a = a0 as Extract<Atom, { t: 'rel' }>;
      return `${R(a.a, true)} sits ${relPhrase(a.side, a.k)} ${R(a.b)}`;
    }
    case 'relCount': {
      const a = a0 as Extract<Atom, { t: 'rel' }>;
      return `Only ${persons(a.k - 1)} between ${R(a.b)} and ${R(a.a)} when counted from the ${a.side} of ${R(a.b)}`;
    }
    case 'gap': {
      const a = a0 as Extract<Atom, { t: 'gap' }>;
      return `Only ${persons(a.n)} between ${R(a.a)} and ${R(a.b)}`;
    }
    case 'adj': {
      const a = a0 as Extract<Atom, { t: 'adj' }>;
      return `${R(a.a, true)} is an immediate neighbour of ${R(a.b)}`;
    }
    case 'adj2': {
      const a = a0 as Extract<Atom, { t: 'adj' }>;
      return `${R(a.a, true)} and ${R(a.b)} are immediate neighbours`;
    }
    case 'nadj': {
      const a = a0 as Extract<Atom, { t: 'adj' }>;
      return `${R(a.a, true)} is not an immediate neighbour of ${R(a.b)}`;
    }
    case 'nnadj': {
      const a = a0 as Extract<Atom, { t: 'adj' }>;
      const b = item.atoms[1] as Extract<Atom, { t: 'adj' }>;
      return `Neither ${R(a.a)} nor ${R(b.a)} is an immediate neighbour of ${R(a.b)}`;
    }
    case 'face': {
      const a = a0 as Extract<Atom, { t: 'face' }>;
      return `${R(a.a, true)} faces ${faceWord(a.f)}`;
    }
    case 'nface': {
      const a = a0 as Extract<Atom, { t: 'face' }>;
      return `${R(a.a, true)} does not face ${faceWord(otherFace(a.f))}`;
    }
    case 'relFace': {
      const a = a0 as Extract<Atom, { t: 'rel' }>;
      const f = item.atoms[1] as Extract<Atom, { t: 'face' }>;
      return `${R(a.a, true)} sits ${relPhrase(a.side, a.k)} ${R(a.b)}, who faces ${faceWord(f.f)}`;
    }
    case 'sameFace': {
      const a = a0 as Extract<Atom, { t: 'sameFace' }>;
      return `${R(a.a, true)} and ${R(a.b)} face ${a.same ? 'the same direction' : 'opposite directions'}`;
    }
    case 'nbrFace': {
      const a = a0 as Extract<Atom, { t: 'face' }>;
      const of = (a.a as Extract<Ref, { t: 'rel' }>).of;
      return `Both the immediate neighbours of ${R(of)} face ${faceWord(a.f)}`;
    }
    case 'nbrOpp': {
      const a = a0 as Extract<Atom, { t: 'sameFace' }>;
      const of = (a.a as Extract<Ref, { t: 'rel' }>).of;
      return `The immediate neighbours of ${R(of)} face opposite directions`;
    }
    case 'refFace': {
      const a = a0 as Extract<Atom, { t: 'face' }>;
      return `${R(a.a, true)} faces ${faceWord(a.f)}`;
    }
    case 'end': {
      const a = a0 as Extract<Atom, { t: 'end' }>;
      return `${R(a.a, true)} sits at one of the extreme ends of the row`;
    }
    case 'nend': {
      const a = a0 as Extract<Atom, { t: 'end' }>;
      return `${R(a.a, true)} does not sit at any of the extreme ends of the row`;
    }
    case 'nnend': {
      const a = a0 as Extract<Atom, { t: 'end' }>;
      const b = item.atoms[1] as Extract<Atom, { t: 'end' }>;
      return `Neither ${R(a.a)} nor ${R(b.a)} sits at an extreme end of the row`;
    }
    case 'endSide': {
      const a = a0 as Extract<Atom, { t: 'endSide' }>;
      return a.k === 1 ? `${R(a.a, true)} sits at the extreme ${a.side} end of the row` : `${R(a.a, true)} sits ${ordWord(a.k)} from the ${a.side} end of the row`;
    }
    case 'middle': {
      const a = a0 as Extract<Atom, { t: 'middle' }>;
      return `${R(a.a, true)} sits exactly in the middle of the row`;
    }
    case 'opp': {
      const a = a0 as Extract<Atom, { t: 'opp' }>;
      return ctx.layout.kind === 'parallel' ? `${R(a.a, true)} faces ${R(a.b)}` : `${R(a.a, true)} sits exactly opposite ${R(a.b)}`;
    }
    case 'oppCorner': {
      const a = a0 as Extract<Atom, { t: 'opp' }>;
      return `${R(a.a, true)} sits diagonally opposite ${R(a.b)}`;
    }
    case 'oppMiddle': {
      const a = a0 as Extract<Atom, { t: 'opp' }>;
      return `${R(a.a, true)} sits exactly opposite ${R(a.b)}`;
    }
    case 'behind': {
      const a = a0 as Extract<Atom, { t: 'behind' }>;
      return `${R(a.a, true)} sits directly behind ${R(a.b)}`;
    }
    case 'front': {
      const a = a0 as Extract<Atom, { t: 'behind' }>;
      return `${R(a.b, true)} sits directly in front of ${R(a.a)}`;
    }
    case 'diag': {
      const a = a0 as Extract<Atom, { t: 'diag' }>;
      return `${R(a.a, true)} sits diagonally opposite ${R(a.b)}`;
    }
    case 'corner': {
      const a = a0 as Extract<Atom, { t: 'corner' }>;
      return `${R(a.a, true)} sits at one of the corners`;
    }
    case 'side': {
      const a = a0 as Extract<Atom, { t: 'corner' }>;
      return `${R(a.a, true)} sits at the middle of one of the sides`;
    }
    case 'ncorner': {
      const a = a0 as Extract<Atom, { t: 'corner' }>;
      return `${R(a.a, true)} does not sit at any of the corners`;
    }
    case 'row': {
      const a = a0 as Extract<Atom, { t: 'row' }>;
      return `${R(a.a, true)} sits in Row ${a.row + 1}`;
    }
    case 'sameRow': {
      const a = a0 as Extract<Atom, { t: 'sameRow' }>;
      return `${R(a.a, true)} and ${R(a.b)} sit in ${a.same ? 'the same row' : 'different rows'}`;
    }
    case 'asMany': {
      const a = a0 as Extract<Atom, { t: 'asMany' }>;
      return `As many persons sit between ${R(a.a)} and ${R(a.b)} as between ${R(a.b)} and ${R(a.c)}`;
    }
    case 'sideCount': {
      const a = a0 as Extract<Atom, { t: 'sideCount' }>;
      return `Only ${persons(a.n)} to the ${a.side} of ${R(a.a)}`;
    }
    case 'sideEq': {
      const a = a0 as Extract<Atom, { t: 'sideEq' }>;
      return `As many persons sit to the left of ${R(a.a)} as to the right of ${R(a.b)}`;
    }
    case 'is':
    case 'nis': {
      const a = a0 as Extract<Atom, { t: 'is' }>;
      return attrText(ctx, R(a.a, true), a.v, a.neg);
    }
  }
}

export function clueText(ctx: RenderCtx, item: ClueItem): string {
  return `${clauseText(ctx, item)}.`;
}

const COUNT = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

export interface IntroInput {
  layout: Layout;
  facingKey: string;
  names: readonly string[];
  attrCat?: AttrCat;
  attrValues: readonly string[];
  membership: boolean;
}

export const CONVENTION = "Left and right are taken from each person's own point of view.";

export function introText(b: IntroInput): string {
  const L = b.layout;
  const P = b.names.length;
  const list = listText(b.names);
  const parts: string[] = [];
  let convention = false;
  switch (L.kind) {
    case 'row':
      if (b.facingKey === 'mixed') {
        parts.push(`${COUNT[P]} persons, ${list}, sit in a straight row, not necessarily in the same order. Some of them face north while the others face south.`);
        convention = true;
      } else {
        parts.push(`${COUNT[P]} persons, ${list}, sit in a straight row facing ${b.facingKey === 'south' ? 'south' : 'north'}, not necessarily in the same order.`);
        convention = b.facingKey === 'south';
      }
      break;
    case 'parallel': {
      const per = L.len;
      const facing = b.facingKey === 'facing';
      const r1 = listText(b.names.slice(0, per));
      const r2 = listText(b.names.slice(per));
      if (facing) {
        parts.push(`${COUNT[P]} persons sit in two parallel rows of ${numWord(per)} persons each, with equal distance between adjacent persons. Persons in Row 1 face south and persons in Row 2 face north, so each person in Row 1 faces a person in Row 2.`);
        convention = true;
      } else {
        parts.push(`${COUNT[P]} persons sit in two parallel rows of ${numWord(per)} persons each, one row behind the other. All of them face north and Row 1 is in front of Row 2, so each person in Row 2 sits directly behind a person in Row 1.`);
      }
      if (b.membership) parts.push(`${r1} sit in Row 1, and ${r2} sit in Row 2, not necessarily in the same order.`);
      else parts.push(`The persons are ${list}, not necessarily in the same order.`);
      break;
    }
    case 'uncertain':
      parts.push(`A certain number of persons sit in a straight row facing north. ${list} are among them; the others are not named. They are not necessarily seated in the same order.`);
      break;
    case 'circle':
      if (b.facingKey === 'mixed') {
        parts.push(`${COUNT[P]} persons, ${list}, sit around a circular table, not necessarily in the same order. Some of them face the centre while the others face outside (away from the centre).`);
        convention = true;
      } else parts.push(`${COUNT[P]} persons, ${list}, sit around a circular table facing the centre, not necessarily in the same order.`);
      break;
    case 'square': {
      parts.push(`${COUNT[P]} persons, ${list}, sit around a square table, not necessarily in the same order. Four of them sit at the four corners and the other four sit at the middle of each side.`);
      const f = b.facingKey;
      if (f === 'cin-mout') parts.push('Those at the corners face the centre, while those at the middle of the sides face outside.');
      else if (f === 'cout-min') parts.push('Those at the corners face outside, while those at the middle of the sides face the centre.');
      else if (f === 'all-in') parts.push('All of them face the centre.');
      else parts.push('Some of them face the centre while the others face outside.');
      convention = f !== 'all-in';
      break;
    }
  }
  if (b.attrCat) {
    const vals = listText(b.attrValues);
    parts.push(
      b.attrCat === 'profession'
        ? `Each of them has a different profession: ${vals}.`
        : b.attrCat === 'colour'
          ? `Each of them likes a different colour: ${vals}.`
          : `Each of them is from a different city: ${vals}.`,
    );
  }
  if (convention) parts.push(CONVENTION);
  return parts.join(' ');
}

export function stimulusText(intro: string, ctx: RenderCtx, clues: readonly ClueItem[]): string {
  return `${intro}\n\n${clues.map((c, i) => `${i + 1}. ${clueText(ctx, c)}`).join('\n')}`;
}
