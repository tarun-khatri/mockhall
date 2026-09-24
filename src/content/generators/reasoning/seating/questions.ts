/**
 * Set questions, all read from the unique arrangement: n-th to the left/right (facing-aware), how many between,
 * immediate neighbours, "four of the following five are alike", true/false statement, position of X with
 * respect to Y, interchange, facing counts, opposite/faces/behind, second attribute, uncertain-row counts.
 * The prompt templates here are parsed back by the independent verifier — keep them in step.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty, VisualSpec } from '../../../types';
import { numericChoices, shuffleChoices } from '../../shared/options';
import { IN, NORTH, OUT, SOUTH, isRing, offsetFrom, type Atom, type FaceCode, type Layout, type Side } from '../../solver/seating/model';
import type { Solution } from '../../solver/seating/solve';
import type { Built } from './build';
import { Truth, type ClueItem } from './pool';
import { NUM, ORD, cap, clauseText, entityName, faceWord, listText, relPhrase, type RenderCtx } from './render';

export type QKind =
  | 'nth'
  | 'between'
  | 'neighbours'
  | 'odd'
  | 'true'
  | 'false'
  | 'position'
  | 'swap'
  | 'faceCount'
  | 'opp'
  | 'whoIs'
  | 'attrOf'
  | 'count'
  | 'sideCount'
  | 'which'
  | 'ends';

export interface QSpec {
  kind: QKind;
  /** entity indices / parameters the question is about (inputs only, never the answer) */
  args: (number | string)[];
}

export interface QOut {
  spec: QSpec;
  prompt: string;
  options: string[];
  answerIndex: number;
  steps: string[];
  shortcut?: string;
  trap?: string;
  tags: string[];
}

export interface QCtx {
  b: Built;
  rng: Rng;
  T: Truth;
  L: Layout;
  ctx: RenderCtx;
  difficulty: Difficulty;
  clueTexts: Set<string>;
}

export const numOpt = (n: number) => (n === 0 ? 'None' : n <= 12 ? cap(NUM[n]) : String(n));
export const posOpt = (side: Side, k: number) => (k === 1 ? `Immediate ${side}` : `${cap(ORD[k])} to the ${side}`);
export const ODD_PROMPT = 'Four of the following five pairs are alike in a certain way based on the given arrangement and so form a group. Which pair does not belong to that group?';

const other = (s: Side): Side => (s === 'left' ? 'right' : 'left');

function persons(q: QCtx): number[] {
  return Array.from({ length: q.b.names.length }, (_, i) => i);
}

const nm = (q: QCtx, e: number) => entityName(q.ctx, e);

/** Named person at seat s, or −1. */
const occ = (q: QCtx, s: number) => (s >= 0 ? q.T.occP[s] : -1);

function facingNote(q: QCtx, x: number): string | null {
  const s = q.T.seat(x);
  const f = q.T.face(s);
  const L = q.L;
  const who = nm(q, x);
  if (isRing(L)) {
    const right = f === IN ? 'anticlockwise' : 'clockwise';
    const left = f === IN ? 'clockwise' : 'anticlockwise';
    return `${cap(who)} faces ${f === IN ? 'the centre' : 'outside'}, so ${who.startsWith('the ') ? 'that person' : who}'s right runs ${right} and left runs ${left}.`;
  }
  if (L.facing.kind === 'all' && f === NORTH) return null;
  return `${cap(who)} faces ${f === NORTH ? 'north' : 'south'}, so ${who.startsWith('the ') ? 'that person' : who}'s right is towards the ${f === NORTH ? 'east' : 'west'} end.`;
}

/** Names met while walking k seats from x to the given side. */
function walkNames(q: QCtx, x: number, side: Side, k: number, sol?: Truth): string[] {
  const T = sol ?? q.T;
  const out: string[] = [];
  let s = T.seat(x);
  for (let i = 0; i < k; i++) {
    s = T.ev.walk(s, sideSignOf(T, T.seat(x), side), 1);
    if (s < 0) break;
    const p = T.occP[s];
    out.push(p >= 0 ? q.b.names[p] : 'an unnamed person');
  }
  return out;
}

function sideSignOf(T: Truth, s: number, side: Side): number {
  const f = T.face(s);
  const right = f === NORTH || f === OUT ? 1 : -1;
  return side === 'right' ? right : -right;
}

function pickDistinct(q: QCtx, answer: number, prefer: number[], pool: number[]): number[] {
  const out: number[] = [];
  for (const e of [...prefer, ...q.rng.shuffle(pool)]) {
    if (e < 0 || e === answer || out.includes(e)) continue;
    out.push(e);
    if (out.length === 4) break;
  }
  return out;
}

function nameChoices(q: QCtx, answer: number, prefer: number[], exclude: number[] = []): { options: string[]; answerIndex: number } | null {
  const d = pickDistinct(
    q,
    answer,
    prefer.filter((e) => !exclude.includes(e)),
    persons(q).filter((e) => !exclude.includes(e)),
  );
  if (d.length < 4) return null;
  return shuffleChoices(q.rng, q.b.names[answer], d.map((e) => q.b.names[e]));
}

const maxK = (q: QCtx) => (isRing(q.L) ? Math.max(1, Math.min(3, Math.floor((q.L.len - 1) / 2))) : q.L.kind === 'uncertain' ? 4 : 3);

/* ------------------------------------------------------------------ */

function qNth(q: QCtx): QOut | null {
  const { rng, T, b } = q;
  const P = b.names.length;
  for (let t = 0; t < 25; t++) {
    const useAttr = b.attrValues.length > 0 && rng.chance(0.4);
    const x = useAttr ? P + rng.int(0, b.attrValues.length - 1) : rng.int(0, P - 1);
    const side: Side = rng.chance(0.5) ? 'left' : 'right';
    const k = rng.int(1, maxK(q));
    const s0 = T.seat(x);
    const tgt = T.step(s0, side, k);
    const ans = occ(q, tgt);
    if (ans < 0 || ans === occ(q, s0)) continue;
    const mirror = occ(q, T.step(s0, other(side), k));
    const prefer = [mirror, occ(q, T.step(s0, side, k + 1)), occ(q, T.step(s0, side, k - 1)), occ(q, T.step(s0, other(side), k + 1))];
    const ch = nameChoices(q, ans, prefer, [occ(q, s0)]);
    if (!ch) continue;
    const who = nm(q, x);
    const holder = occ(q, s0);
    const steps: string[] = [];
    if (x >= P) steps.push(`${cap(who)} is ${b.names[holder]}.`);
    const note = facingNote(q, holder);
    if (note) steps.push(note);
    const path = walkNames(q, holder, side, k);
    steps.push(`${k === 1 ? 'Immediately' : cap(ORD[k])} to the ${side} of ${b.names[holder]}: ${path.join(' → ')} — answer **${b.names[ans]}**.`);
    return {
      spec: { kind: 'nth', args: [x, side, k] },
      prompt: k === 1 ? `Who sits to the immediate ${side} of ${who}?` : `Who sits ${ORD[k]} to the ${side} of ${who}?`,
      ...ch,
      steps,
      shortcut: isRing(q.L) ? 'Facing the centre: right = anticlockwise. Facing outside: right = clockwise. Fix the direction first, then count seats.' : 'Take left/right from the person’s own facing, then count seats along the row.',
      trap: mirror >= 0 && mirror !== ans ? `${b.names[mirror]} is ${ORD[k] === 'immediate' ? 'immediately' : ORD[k]} to the ${other(side)} — counting in the wrong direction gives this option.` : undefined,
      tags: ['seating:nth-position', ...(q.L.facing.kind === 'mixed' ? ['trick:facing-direction'] : [])],
    };
  }
  return null;
}

function countChoices(q: QCtx, n: number, mistakes: { value: number; why: string }[], numerals = false) {
  return numericChoices(q.rng, n, { format: numerals ? (v) => String(v) : numOpt, integer: true, allowZero: !numerals, step: 1, mistakes });
}

function qBetween(q: QCtx): QOut | null {
  const { rng, T, b } = q;
  const ring = isRing(q.L);
  for (let t = 0; t < 25; t++) {
    const [x, y] = rng.sample(persons(q), 2);
    const sx = T.seat(x);
    const sy = T.seat(y);
    let count: number;
    let side: Side = 'left';
    let otherArc = -1;
    if (ring) {
      side = rng.chance(0.5) ? 'left' : 'right';
      count = stepsTo(q, sx, side, sy) - 1;
      otherArc = q.L.len - 2 - count;
      if (count === otherArc) continue;
    } else {
      if (T.row(sx) !== T.row(sy)) continue;
      count = Math.abs(T.col(sx) - T.col(sy)) - 1;
      if (count < 0) continue;
    }
    // tiny counts pin the key to option A (options run upwards from None), so ask about wider gaps
    if (count < 2 || count > (q.L.kind === 'uncertain' ? 15 : 8)) continue;
    const mistakes = [
      { value: count + 1, why: 'counted one of the two named persons as well' },
      ...(otherArc >= 0 ? [{ value: otherArc, why: 'counted round the other side of the table' }] : []),
      { value: count - 1, why: 'missed one seat while counting' },
      { value: count + 2, why: 'counted both named persons' },
    ];
    const ch = countChoices(q, count, mistakes);
    const X = b.names[x];
    const Y = b.names[y];
    const steps: string[] = [];
    if (ring) {
      const note = facingNote(q, x);
      if (note) steps.push(note);
      steps.push(`Going from ${X} towards ${X}'s ${side} until ${Y}: ${walkNames(q, x, side, count).join(', ') || 'nobody'} — **${numOpt(count)}**.`);
    } else steps.push(`Between ${X} and ${Y} sit ${count ? `${count} person${count > 1 ? 's' : ''}` : 'no one'} — **${numOpt(count)}**.`);
    return {
      spec: { kind: 'between', args: ring ? [x, y, side] : [x, y] },
      prompt: ring ? `How many persons sit between ${X} and ${Y} when counted from the ${side} of ${X}?` : `How many persons sit between ${X} and ${Y}?`,
      options: ch.options,
      answerIndex: ch.answerIndex,
      steps,
      shortcut: ring ? 'Count only along the side the question names; the other arc gives a different number.' : 'Count the seats strictly between the two persons — not the persons themselves.',
      trap: ring ? `${numOpt(otherArc)} is the count along the other side of the table.` : `${numOpt(count + 1)} comes from counting one of the two named persons.`,
      tags: ['seating:count-between'],
    };
  }
  return null;
}

/** Steps from seat sx to seat sy walking to x's own side (rings). */
function stepsTo(q: QCtx, sx: number, side: Side, sy: number): number {
  const T = q.T;
  const sign = sideSignOf(T, sx, side);
  for (let k = 1; k < q.L.len; k++) if (T.ev.walk(sx, sign, k) === sy) return k;
  return -1;
}

const pairText = (q: QCtx, a: number, b: number) => (a < b ? `${q.b.names[a]} and ${q.b.names[b]}` : `${q.b.names[b]} and ${q.b.names[a]}`);

function qNeighbours(q: QCtx): QOut | null {
  const { rng, T, b } = q;
  for (let t = 0; t < 25; t++) {
    const x = rng.int(0, b.names.length - 1);
    const s = T.seat(x);
    const l1 = occ(q, T.step(s, 'left', 1));
    const r1 = occ(q, T.step(s, 'right', 1));
    if (l1 < 0 || r1 < 0) continue;
    const l2 = occ(q, T.step(s, 'left', 2));
    const r2 = occ(q, T.step(s, 'right', 2));
    const cands: [number, number][] = [
      [l2, r2],
      [l1, r2],
      [l2, r1],
    ];
    const opts = new Set<string>();
    const correct = pairText(q, l1, r1);
    for (const [a, c] of rng.shuffle(cands)) if (a >= 0 && c >= 0 && a !== c && a !== x && c !== x) opts.add(pairText(q, a, c));
    const all = persons(q).filter((e) => e !== x);
    for (let g = 0; opts.size < 6 && g < 40; g++) {
      const [a, c] = rng.sample(all, 2);
      opts.add(pairText(q, a, c));
    }
    opts.delete(correct);
    const d = [...opts].slice(0, 4);
    if (d.length < 4) continue;
    const ch = shuffleChoices(rng, correct, d);
    return {
      spec: { kind: 'neighbours', args: [x] },
      prompt: `Who are the immediate neighbours of ${b.names[x]}?`,
      ...ch,
      steps: [`On either side of ${b.names[x]} sit ${b.names[l1]} and ${b.names[r1]} — **${correct}**.`],
      shortcut: 'Read the two seats next to the person straight off the final diagram.',
      trap: l2 >= 0 && r2 >= 0 ? `${pairText(q, l2, r2)} sit second to the left and right, not immediately next.` : undefined,
      tags: ['seating:neighbours'],
    };
  }
  return null;
}

/** Relation features of an ordered pair (used to make exactly one pair odd). */
export function pairFeatures(q: QCtx, x: number, y: number): Record<string, string> {
  const T = q.T;
  const L = q.L;
  const sx = T.seat(x);
  const sy = T.seat(y);
  const f: Record<string, string> = {};
  if (isRing(L)) {
    f.dir = String(offsetFrom(L, sx, T.face(sx), sy));
    f.abs = String((sy - sx + L.len) % L.len);
    f.gap = String(T.gapOf(sx, sy));
  } else {
    const same = T.row(sx) === T.row(sy);
    f.dir = same ? String(offsetFrom(L, sx, T.face(sx), sy)) : `x${T.row(sx)}${T.col(sy) - T.col(sx)}`;
    f.abs = same ? String(T.col(sy) - T.col(sx)) : `x${T.row(sx)}${T.col(sy) - T.col(sx)}`;
    f.gap = same ? String(T.gapOf(sx, sy)) : 'x';
  }
  if (L.facing.kind === 'mixed') f.face = T.face(sx) === T.face(sy) ? 'same' : 'diff';
  if (L.kind === 'square') f.corner = `${sx % 2}${sy % 2}`;
  if (L.kind === 'parallel') f.row = `${T.row(sx)}${T.row(sy)}`;
  return f;
}

/** Index of the unique odd option given features; −1 when ambiguous / none. */
export function oddIndex(feats: Record<string, string>[]): number {
  let odd = -1;
  const keys = Object.keys(feats[0]);
  for (const k of keys) {
    const counts = new Map<string, number>();
    for (const f of feats) counts.set(f[k], (counts.get(f[k]) ?? 0) + 1);
    for (const [v, c] of counts) {
      if (c !== 4) continue;
      const i = feats.findIndex((f) => f[k] !== v);
      if (odd >= 0 && odd !== i) return -1;
      odd = i;
    }
  }
  return odd;
}

function qOdd(q: QCtx): QOut | null {
  const { rng, T, b, L } = q;
  const P = b.names.length;
  if (P < 6) return null;
  const all = persons(q);
  const ring = isRing(L);
  for (let t = 0; t < 30; t++) {
    const kmax = ring ? Math.min(3, Math.floor(L.len / 2) - 1) : 3;
    const k = rng.int(1, Math.max(1, kmax));
    const side: Side = rng.chance(0.5) ? 'left' : 'right';
    const good: [number, number][] = [];
    for (const x of all) {
      const y = occ(q, T.step(T.seat(x), side, k));
      if (y >= 0 && y !== x) good.push([x, y]);
    }
    if (good.length < 4) continue;
    const four = rng.sample(good, 4);
    const usedX = new Set(four.map((p) => p[0]));
    const bad: [number, number][] = [];
    for (const x of all) {
      if (usedX.has(x)) continue;
      for (const [sd, kk] of [
        [other(side), k],
        [side, k + 1],
        [side, k - 1],
      ] as [Side, number][]) {
        if (kk < 1) continue;
        const y = occ(q, T.step(T.seat(x), sd, kk));
        if (y >= 0 && y !== x) bad.push([x, y]);
      }
    }
    if (!bad.length) continue;
    const odd = rng.pick(bad);
    const pairs = [...four, odd];
    const texts = pairs.map(([x, y]) => `${b.names[x]}, ${b.names[y]}`);
    if (new Set(texts).size !== 5) continue;
    if (new Set(pairs.map(([x, y]) => (x < y ? `${x}-${y}` : `${y}-${x}`))).size !== 5) continue;
    const feats = pairs.map(([x, y]) => pairFeatures(q, x, y));
    if (oddIndex(feats) !== 4) continue;
    const ch = shuffleChoices(rng, texts[4], texts.slice(0, 4));
    const rel = k === 1 ? `to the immediate ${side} of` : `${ORD[k]} to the ${side} of`;
    const r2 = T.relOf(T.seat(odd[0]), T.seat(odd[1]));
    return {
      spec: { kind: 'odd', args: pairs.flat() },
      prompt: ODD_PROMPT,
      ...ch,
      steps: [
        `In ${listText(texts.slice(0, 4).map((x) => `"${x}"`))}, the second person sits ${rel} the first.`,
        `In "${texts[4]}", ${b.names[odd[1]]} sits ${r2 ? relPhrase(r2.side, r2.k) : 'elsewhere relative to'} ${b.names[odd[0]]} — so **${texts[4]}** is the odd one.`,
      ],
      shortcut: 'Find the relation in the first two pairs (same direction, same count), then test the rest.',
      trap: 'Check direction from the first person’s own facing — a pair that is the same distance but on the other side does not belong.',
      tags: ['seating:odd-one-out'],
    };
  }
  return null;
}

/** Statement candidates (true and false) as clause items. */
function statements(q: QCtx): { t: ClueItem[]; f: ClueItem[] } {
  const { rng, T, b, L } = q;
  const E = (e: number) => ({ t: 'e' as const, e });
  const t: ClueItem[] = [];
  const f: ClueItem[] = [];
  const all = persons(q);
  const push = (item: ClueItem) => (T.isTrue(item.atoms) ? t : f).push(item);
  for (let g = 0; g < 40; g++) {
    const [x, y] = rng.sample(all, 2);
    const r = T.relOf(T.seat(y), T.seat(x));
    if (r && r.k <= 3) {
      push({ form: 'rel', atoms: [{ t: 'rel', a: E(x), side: r.side, k: r.k, b: E(y) }] });
      push({ form: 'rel', atoms: [{ t: 'rel', a: E(x), side: other(r.side), k: r.k, b: E(y) }] });
      if (r.k < 3) push({ form: 'rel', atoms: [{ t: 'rel', a: E(x), side: r.side, k: r.k + 1, b: E(y) }] });
    }
    const gp = T.gapOf(T.seat(x), T.seat(y));
    if (gp >= 1 && gp <= 3) {
      push({ form: 'gap', atoms: [{ t: 'gap', a: E(x), b: E(y), n: gp }] });
      push({ form: 'gap', atoms: [{ t: 'gap', a: E(x), b: E(y), n: gp + 1 }] });
    }
    if (gp === 0) push({ form: 'adj', atoms: [{ t: 'adj', a: E(x), b: E(y), neg: false }] });
    else if (gp > 0 || !isRing(L)) {
      push({ form: 'adj', atoms: [{ t: 'adj', a: E(x), b: E(y), neg: false }] });
      if (gp > 0) push({ form: 'nadj', atoms: [{ t: 'adj', a: E(x), b: E(y), neg: true }] });
    }
    if (L.facing.kind === 'mixed') {
      const fc = T.face(T.seat(x)) as FaceCode;
      push({ form: 'face', atoms: [{ t: 'face', a: E(x), f: fc }] });
      push({ form: 'face', atoms: [{ t: 'face', a: E(x), f: (isRing(L) ? (fc === IN ? OUT : IN) : fc === NORTH ? SOUTH : NORTH) as FaceCode }] });
    }
    if ((L.kind === 'circle' && L.len % 2 === 0) || (L.kind === 'parallel' && L.facing.kind === 'rows' && L.facing.row1 !== L.facing.row2)) push({ form: 'opp', atoms: [{ t: 'opp', a: E(x), b: E(y) }] });
    if (L.kind === 'row' || L.kind === 'uncertain') push({ form: rng.chance(0.5) ? 'end' : 'nend', atoms: [{ t: 'end', a: E(x), neg: false }] });
    if (L.kind === 'square') push({ form: rng.chance(0.5) ? 'corner' : 'side', atoms: [{ t: 'corner', a: E(x), corner: rng.chance(0.5) }] });
    if (b.attrValues.length) {
      const v = b.names.length + rng.int(0, b.attrValues.length - 1);
      push({ form: 'is', atoms: [{ t: 'is', a: E(x), v, neg: false }] });
    }
  }
  // normalise forms whose wording depends on the atom
  const fix = (it: ClueItem): ClueItem => {
    const a = it.atoms[0] as Atom;
    if (a.t === 'end') return { form: it.form, atoms: [{ ...a, neg: it.form === 'nend' }] };
    if (a.t === 'corner') return { form: a.corner ? 'corner' : 'side', atoms: [a] };
    if (a.t === 'opp' && L.kind === 'square') return it;
    return it;
  };
  const tt: ClueItem[] = [];
  const ff: ClueItem[] = [];
  for (const it of [...t, ...f].map(fix)) (T.isTrue(it.atoms) ? tt : ff).push(it);
  return { t: tt, f: ff };
}

function qStatement(q: QCtx, truth: boolean): QOut | null {
  const { rng } = q;
  const { t, f } = statements(q);
  const uniq = (items: ClueItem[]) => {
    const seen = new Set<string>();
    const out: { item: ClueItem; text: string }[] = [];
    for (const it of rng.shuffle(items)) {
      const text = clauseText(q.ctx, it);
      if (seen.has(text.toLowerCase()) || q.clueTexts.has(`${text}.`)) continue;
      seen.add(text.toLowerCase());
      out.push({ item: it, text });
    }
    return out;
  };
  const T1 = uniq(t);
  const F1 = uniq(f);
  const [one, many] = truth ? [T1, F1] : [F1, T1];
  if (!one.length || many.length < 4) return null;
  const correct = one[0];
  const rest = many.filter((x) => x.text.toLowerCase() !== correct.text.toLowerCase()).slice(0, 4);
  if (rest.length < 4) return null;
  const ch = shuffleChoices(rng, correct.text, rest.map((x) => x.text));
  return {
    spec: { kind: truth ? 'true' : 'false', args: [] },
    prompt: truth ? 'Which of the following statements is true according to the given arrangement?' : 'Which of the following statements is false according to the given arrangement?',
    ...ch,
    steps: [
      ...ch.options.map((o, i) => `(${'ABCDE'[i]}) ${o} — ${i === ch.answerIndex ? (truth ? '**true**' : '**false**') : truth ? 'false' : 'true'}.`),
    ],
    shortcut: 'Test each statement on the final diagram, not on the clue list.',
    trap: 'A statement copied from a clue with one word changed (left ↔ right, second ↔ third) looks familiar but is wrong.',
    tags: ['seating:statement'],
  };
}

function qPosition(q: QCtx): QOut | null {
  const { rng, T, b } = q;
  for (let t = 0; t < 25; t++) {
    const [x, y] = rng.sample(persons(q), 2);
    const r = T.relOf(T.seat(y), T.seat(x));
    if (!r || r.k > (isRing(q.L) ? Math.floor((q.L.len - 1) / 2) : 5)) continue;
    const truthOf = (sd: Side, k: number) => T.step(T.seat(y), sd, k) === T.seat(x);
    const cand: [Side, number][] = [
      [other(r.side), r.k],
      [r.side, r.k + 1],
      [r.side, r.k - 1],
      [other(r.side), r.k + 1],
      [other(r.side), r.k - 1],
      [r.side, r.k + 2],
    ];
    const d: string[] = [];
    for (const [sd, k] of cand) {
      if (k < 1 || truthOf(sd, k)) continue;
      const s = posOpt(sd, k);
      if (!d.includes(s)) d.push(s);
    }
    if (d.length < 4) continue;
    const ch = shuffleChoices(rng, posOpt(r.side, r.k), d.slice(0, 4));
    const note = facingNote(q, y);
    return {
      spec: { kind: 'position', args: [x, y] },
      prompt: `What is the position of ${b.names[x]} with respect to ${b.names[y]}?`,
      ...ch,
      steps: [...(note ? [note] : []), `From ${b.names[y]}, going to ${b.names[y]}'s ${r.side}: ${walkNames(q, y, r.side, r.k).join(' → ')} — **${posOpt(r.side, r.k)}**.`],
      shortcut: 'Stand in the seat of the second person, face where they face, and count.',
      trap: `${posOpt(other(r.side), r.k)} is what you get by taking left/right from your own view instead of ${b.names[y]}'s.`,
      tags: ['seating:relative-position'],
    };
  }
  return null;
}

function qSwap(q: QCtx): QOut | null {
  const { rng, T, b, L } = q;
  if (L.facing.kind === 'mixed') return null;
  for (let t = 0; t < 25; t++) {
    const [x, y] = rng.sample(persons(q), 2);
    const seatOf = T.sol.seatOf.slice();
    [seatOf[x], seatOf[y]] = [seatOf[y], seatOf[x]];
    const sol2: Solution = { seatOf, face: T.sol.face, n: T.sol.n };
    const T2 = new Truth(L, sol2, b.names.length);
    const side: Side = rng.chance(0.5) ? 'left' : 'right';
    const k = rng.int(1, Math.min(2, maxK(q)));
    const tgt = T2.step(T2.seat(y), side, k);
    const ans = tgt >= 0 ? T2.occP[tgt] : -1;
    if (ans < 0 || ans === y) continue;
    const before = occ(q, T.step(T.seat(y), side, k));
    const mirror = T2.step(T2.seat(y), other(side), k);
    const ch = nameChoices(q, ans, [before, mirror >= 0 ? T2.occP[mirror] : -1, x], [y]);
    if (!ch) continue;
    const path = walkNames(q, y, side, k, T2);
    return {
      spec: { kind: 'swap', args: [x, y, side, k] },
      prompt: `If ${b.names[x]} and ${b.names[y]} interchange their seats, who will sit ${relPhrase(side, k)} ${b.names[y]}?`,
      ...ch,
      steps: [`After the interchange ${b.names[y]} takes ${b.names[x]}'s seat (and its facing).`, `${k === 1 ? 'Immediately' : cap(ORD[k])} to the ${side} of ${b.names[y]} now: ${path.join(' → ')} — **${b.names[ans]}**.`],
      shortcut: 'Swap the two names on your diagram first; then count from the new seat.',
      trap: before >= 0 && before !== ans ? `${b.names[before]} is the answer before the interchange.` : undefined,
      tags: ['seating:interchange'],
    };
  }
  return null;
}

function qFaceCount(q: QCtx): QOut | null {
  const { T, b, L, rng } = q;
  if (L.facing.kind !== 'mixed') return null;
  const f: FaceCode = isRing(L) ? (rng.chance(0.5) ? IN : OUT) : rng.chance(0.5) ? NORTH : SOUTH;
  const n = persons(q).filter((e) => T.face(T.seat(e)) === f).length;
  const ch = countChoices(q, n, [
    { value: b.names.length - n, why: 'counted the persons facing the other way' },
    { value: n + 1, why: 'miscounted by one' },
    { value: n - 1, why: 'miscounted by one' },
  ]);
  const who = persons(q).filter((e) => T.face(T.seat(e)) === f).map((e) => b.names[e]);
  return {
    spec: { kind: 'faceCount', args: [f] },
    prompt: `How many persons face ${faceWord(f)}?`,
    options: ch.options,
    answerIndex: ch.answerIndex,
    steps: [`Facing ${faceWord(f)}: ${listText(who)} — **${numOpt(n)}**.`],
    shortcut: 'Mark each person’s facing on the diagram as soon as a clue fixes it.',
    tags: ['seating:facing-count', 'trick:facing-direction'],
  };
}

function qOpp(q: QCtx): QOut | null {
  const { T, b, L, rng } = q;
  const facingEach = L.kind === 'parallel' && L.facing.kind === 'rows' && L.facing.row1 !== L.facing.row2;
  const sameDir = L.kind === 'parallel' && !facingEach;
  if (!((L.kind === 'circle' && L.len % 2 === 0) || L.kind === 'square' || L.kind === 'parallel')) return null;
  for (let t = 0; t < 20; t++) {
    const x = rng.int(0, b.names.length - 1);
    const sx = T.seat(x);
    if (sameDir && T.row(sx) !== 0) continue;
    const so = T.ev.opposite(sx);
    const ans = occ(q, so);
    if (ans < 0) continue;
    const prefer = [occ(q, T.step(so, 'left', 1)), occ(q, T.step(so, 'right', 1)), occ(q, T.step(sx, 'left', 1)), occ(q, T.step(sx, 'right', 1))];
    const ch = nameChoices(q, ans, prefer, [x]);
    if (!ch) continue;
    const X = b.names[x];
    const prompt =
      L.kind === 'parallel'
        ? facingEach
          ? `Who faces ${X}?`
          : `Who sits directly behind ${X}?`
        : L.kind === 'square' && sx % 2 === 0
          ? `Who sits diagonally opposite ${X}?`
          : `Who sits exactly opposite ${X}?`;
    return {
      spec: { kind: 'opp', args: [x] },
      prompt,
      ...ch,
      steps: [`${L.kind === 'parallel' ? `In the same column of the other row as ${X}` : `Across the table from ${X}`} sits **${b.names[ans]}**.`],
      shortcut: L.kind === 'parallel' ? 'The person in the same column of the other row.' : `Opposite = ${L.len / 2} seats away either way.`,
      tags: ['seating:opposite'],
    };
  }
  return null;
}

function attrPhrase(q: QCtx, v: number): { who: string; what: string } {
  const val = q.b.attrValues[v - q.b.names.length];
  switch (q.b.attrCat) {
    case 'profession':
      return { who: `Who is the ${val}?`, what: 'What is the profession of' };
    case 'colour':
      return { who: `Who likes ${val}?`, what: 'Which colour does' };
    default:
      return { who: `Who is from ${val}?`, what: 'Which city is' };
  }
}

function qWhoIs(q: QCtx): QOut | null {
  const { T, b, rng } = q;
  if (!b.attrValues.length) return null;
  const P = b.names.length;
  for (let t = 0; t < 10; t++) {
    const v = P + rng.int(0, b.attrValues.length - 1);
    const sv = T.seat(v);
    const ans = occ(q, sv);
    const ch = nameChoices(q, ans, [occ(q, T.step(sv, 'left', 1)), occ(q, T.step(sv, 'right', 1))]);
    if (!ch) continue;
    return {
      spec: { kind: 'whoIs', args: [v] },
      prompt: attrPhrase(q, v).who,
      ...ch,
      steps: [`From the final arrangement, ${entityName(q.ctx, v)} is **${b.names[ans]}**.`],
      shortcut: 'Fill the second attribute only after the seats are fixed; most attribute clues hang on a seated person.',
      tags: ['seating:attribute'],
    };
  }
  return null;
}

function qAttrOf(q: QCtx): QOut | null {
  const { T, b, rng } = q;
  if (!b.attrValues.length) return null;
  const P = b.names.length;
  const x = rng.int(0, P - 1);
  const sx = T.seat(x);
  const vOf = (s: number) => T.sol.seatOf.findIndex((z, e) => e >= P && z === s);
  const v = vOf(sx);
  const prefer = [vOf(T.step(sx, 'left', 1)), vOf(T.step(sx, 'right', 1)), vOf(T.ev.opposite(sx))].filter((e) => e >= P && e !== v);
  const pool = Array.from({ length: b.attrValues.length }, (_, i) => P + i).filter((e) => e !== v);
  const d: number[] = [];
  for (const e of [...prefer, ...rng.shuffle(pool)]) if (!d.includes(e) && d.length < 4) d.push(e);
  if (d.length < 4) return null;
  const val = (e: number) => b.attrValues[e - P];
  const ch = shuffleChoices(rng, val(v), d.map(val));
  const ph = attrPhrase(q, v);
  const X = b.names[x];
  const prompt = b.attrCat === 'profession' ? `${ph.what} ${X}?` : b.attrCat === 'colour' ? `${ph.what} ${X} like?` : `${ph.what} ${X} from?`;
  return {
    spec: { kind: 'attrOf', args: [x] },
    prompt,
    ...ch,
    steps: [`From the final arrangement, ${X} — **${val(v)}**.`],
    tags: ['seating:attribute'],
  };
}

function qCount(q: QCtx): QOut | null {
  if (q.L.kind !== 'uncertain') return null;
  const n = q.T.sol.n;
  const named = q.b.names.length;
  const ch = countChoices(
    q,
    n,
    [
      { value: n - 1, why: 'forgot to count one of the persons at an end' },
      { value: n + 1, why: 'counted a named person twice' },
      { value: n - 2, why: 'left out both end persons' },
      { value: n + 2, why: 'added the gaps without subtracting the overlap' },
      { value: n - 3 > named ? n - 3 : n + 3, why: 'miscounted a gap of unnamed persons' },
    ],
    true,
  );
  return {
    spec: { kind: 'count', args: [] },
    prompt: 'How many persons sit in the row?',
    options: ch.options,
    answerIndex: ch.answerIndex,
    steps: [`Counting every seat from the left end to the right end: **${n}** persons.`],
    shortcut: 'Total = persons to the left of X + 1 + persons to the right of X, for any seated X.',
    trap: `${n - 1} leaves out one end person.`,
    tags: ['seating:total-count'],
  };
}

function qSideCount(q: QCtx): QOut | null {
  const { T, b, L, rng } = q;
  if (!(L.kind === 'uncertain' || (L.kind === 'row' && L.facing.kind !== 'mixed'))) return null;
  const x = rng.int(0, b.names.length - 1);
  const side: Side = rng.chance(0.5) ? 'left' : 'right';
  const s = T.seat(x);
  const n = sideSignOf(T, s, side) > 0 ? T.rowLen() - 1 - T.col(s) : T.col(s);
  if (n < 2) return null;
  const ch = countChoices(
    q,
    n,
    [
      { value: n + 1, why: `counted ${b.names[x]} too` },
      { value: T.rowLen() - 1 - n, why: 'counted on the other side' },
      { value: n - 1, why: 'missed the person at the end' },
    ],
    n > 12,
  );
  return {
    spec: { kind: 'sideCount', args: [x, side] },
    prompt: `How many persons sit to the ${side} of ${b.names[x]}?`,
    options: ch.options,
    answerIndex: ch.answerIndex,
    steps: [`To the ${side} of ${b.names[x]} there are ${n} seats up to the end of the row — **${numOpt(n)}**.`],
    shortcut: 'Persons to the left + persons to the right = total − 1.',
    tags: ['seating:count-side'],
  };
}

function qWhich(q: QCtx): QOut | null {
  const { T, b, L, rng } = q;
  const all = persons(q);
  const options: { prompt: string; yes: number[]; no: number[]; why: string; args: (number | string)[] }[] = [];
  if (L.kind === 'square') {
    const corner = all.filter((e) => T.seat(e) % 2 === 0);
    const mid = all.filter((e) => T.seat(e) % 2 === 1);
    options.push({ prompt: 'Which of the following persons sits at a corner?', yes: corner, no: mid, why: 'sits at a corner', args: ['corner'] });
    options.push({ prompt: 'Which of the following persons sits at the middle of a side?', yes: mid, no: corner, why: 'sits at the middle of a side', args: ['middle'] });
  }
  if (L.facing.kind === 'mixed') {
    const fs: FaceCode[] = isRing(L) ? [IN, OUT] : [NORTH, SOUTH];
    for (const f of fs) {
      const yes = all.filter((e) => T.face(T.seat(e)) === f);
      options.push({ prompt: `Which of the following persons faces ${faceWord(f)}?`, yes, no: all.filter((e) => !yes.includes(e)), why: `faces ${faceWord(f)}`, args: ['face', f] });
    }
  }
  if (L.kind === 'parallel') {
    const x = rng.int(0, b.names.length - 1);
    const yes = all.filter((e) => e !== x && T.row(T.seat(e)) === T.row(T.seat(x)));
    const no = all.filter((e) => T.row(T.seat(e)) !== T.row(T.seat(x)));
    if (!q.b.membership) options.push({ prompt: `Which of the following persons sits in the same row as ${b.names[x]}?`, yes, no, why: `sits in ${b.names[x]}'s row`, args: ['row', x] });
  }
  const usable = options.filter((o) => o.yes.length >= 1 && o.no.length >= 4);
  if (!usable.length) return null;
  const o = rng.pick(usable);
  const ans = rng.pick(o.yes);
  const d = rng.sample(o.no, 4);
  const ch = shuffleChoices(rng, b.names[ans], d.map((e) => b.names[e]));
  return {
    spec: { kind: 'which', args: o.args },
    prompt: o.prompt,
    ...ch,
    steps: [`Of the options, only **${b.names[ans]}** ${o.why}.`],
    tags: ['seating:which'],
  };
}

function qEnds(q: QCtx): QOut | null {
  const { T, b, L, rng } = q;
  if (L.kind !== 'row' && L.kind !== 'uncertain') return null;
  const a = occ(q, 0);
  const z = occ(q, T.rowLen() - 1);
  if (a < 0 || z < 0) return null;
  const all = persons(q);
  const correct = pairText(q, a, z);
  const opts = new Set<string>();
  const n1 = occ(q, 1);
  const n2 = occ(q, T.rowLen() - 2);
  if (n1 >= 0) opts.add(pairText(q, n1, z));
  if (n2 >= 0) opts.add(pairText(q, a, n2));
  if (n1 >= 0 && n2 >= 0 && n1 !== n2) opts.add(pairText(q, n1, n2));
  for (let g = 0; opts.size < 7 && g < 40; g++) {
    const [x, y] = rng.sample(all, 2);
    opts.add(pairText(q, x, y));
  }
  opts.delete(correct);
  const d = [...opts].slice(0, 4);
  if (d.length < 4) return null;
  const ch = shuffleChoices(rng, correct, d);
  return {
    spec: { kind: 'ends', args: [] },
    prompt: 'Who sit at the extreme ends of the row?',
    ...ch,
    steps: [`The two end seats hold ${b.names[a]} and ${b.names[z]} — **${correct}**.`],
    tags: ['seating:ends'],
  };
}

const BUILDERS: Record<QKind, (q: QCtx) => QOut | null> = {
  nth: qNth,
  between: qBetween,
  neighbours: qNeighbours,
  odd: qOdd,
  true: (q) => qStatement(q, true),
  false: (q) => qStatement(q, false),
  position: qPosition,
  swap: qSwap,
  faceCount: qFaceCount,
  opp: qOpp,
  whoIs: qWhoIs,
  attrOf: qAttrOf,
  count: qCount,
  sideCount: qSideCount,
  which: qWhich,
  ends: qEnds,
};

/** The five questions of a set: the classic prelims mix (identity, count, position, odd one out, statements). */
export function buildQuestions(q: QCtx, count = 5): QOut[] {
  const { rng, difficulty: d, b } = q;
  const must: QKind[] = [];
  if (d !== 'easy') must.push('odd', rng.chance(0.75) ? 'true' : 'false');
  if (b.layout.kind === 'uncertain' && rng.chance(0.7)) must.push('count');
  if (b.attrValues.length) must.push(rng.chance(0.5) ? 'whoIs' : 'attrOf');
  const weights: [QKind, number][] = [
    ['nth', 4],
    ['between', 2.5],
    ['neighbours', d === 'easy' ? 2 : 1],
    ['position', 2],
    ['swap', d === 'easy' ? 0.3 : 1.2],
    ['faceCount', 1],
    ['opp', 1.2],
    ['sideCount', 1],
    ['which', 1],
    ['ends', d === 'easy' ? 1 : 0.4],
    ['odd', d === 'easy' ? 1 : 0],
    ['true', d === 'easy' ? 0.6 : 0],
  ];
  const out: QOut[] = [];
  const used = new Map<QKind, number>();
  const seenPrompts = new Set<string>();
  const tryKind = (k: QKind) => {
    const r = BUILDERS[k](q);
    if (!r || seenPrompts.has(r.prompt + r.options.join('|'))) return false;
    if (r.spec.kind !== 'odd' && r.spec.kind !== 'true' && r.spec.kind !== 'false' && seenPrompts.has(r.prompt)) return false;
    seenPrompts.add(r.prompt + r.options.join('|'));
    seenPrompts.add(r.prompt);
    out.push(r);
    used.set(k, (used.get(k) ?? 0) + 1);
    return true;
  };
  for (const k of must) if (out.length < count) tryKind(k);
  for (let g = 0; out.length < count && g < 60; g++) {
    const avail = weights.filter(([k]) => (used.get(k) ?? 0) < (k === 'nth' ? 2 : 1));
    if (!avail.length) break;
    tryKind(rng.weighted(avail));
  }
  // keep a natural order: identity questions first, statements last
  const rank: Record<QKind, number> = { nth: 0, opp: 1, whoIs: 1, attrOf: 1, neighbours: 2, ends: 2, which: 2, swap: 5, between: 3, sideCount: 3, count: 3, faceCount: 3, position: 4, odd: 6, true: 7, false: 7 };
  return out.sort((x, y) => rank[x.spec.kind] - rank[y.spec.kind]);
}

export type { VisualSpec };
