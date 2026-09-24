/**
 * Worked solution for a whole set, written from the human-path trace:
 * which clues fix seats first, where the cases split, which clue rejects which case, and the final
 * arrangement (text + VisualSpec from ground truth).
 */
import type { Seat, VisualSpec } from '../../../types';
import { IN, NORTH, OUT, isRing, offsetFrom, clueEntities, type Layout } from '../../solver/seating/model';
import type { HpsCase, HpsResult } from '../../solver/seating/hps';
import type { Solution } from '../../solver/seating/solve';
import type { Built } from './build';
import { entityName, listText, ordWord, type RenderCtx } from './render';
import { Truth } from './pool';

const clueList = (idx: number[]) => (idx.length === 1 ? `clue ${idx[0] + 1}` : `clues ${listText(idx.map((i) => String(i + 1)))}`);

/** Position of entity e relative to anchor a inside a (possibly partial) case, in words; null if unclear. */
function relWords(b: Built, hps: HpsResult, c: HpsCase, e: number, a: number): string | null {
  const ev = hps.evaluator;
  ev.st = c;
  const L = b.layout;
  const se = c.seatOf[e];
  const sa = c.seatOf[a];
  if (se < 0 || sa < 0) return null;
  const fa = c.face[sa];
  const ctx = ctxOf(b);
  const an = entityName(ctx, a);
  if (isRing(L)) {
    if (fa < 0) {
      const cw = (se - sa + L.len) % L.len;
      if (2 * cw === L.len) return `opposite ${an}`;
      const [dir, k] = 2 * cw < L.len ? ['clockwise', cw] : ['anticlockwise', L.len - cw];
      return `${k} seat${k > 1 ? 's' : ''} ${dir} from ${an}`;
    }
    const r = offsetFrom(L, sa, fa, se);
    if (2 * r === L.len) return `opposite ${an}`;
    const [side, k] = 2 * r < L.len ? ['right', r] : ['left', L.len - r];
    return k === 1 ? `to the immediate ${side} of ${an}` : `${ordWord(k)} to the ${side} of ${an}`;
  }
  if (ev.rowOf(se) !== ev.rowOf(sa)) return ev.vcol(se) === ev.vcol(sa) ? (L.facing.kind === 'rows' && L.facing.row1 !== L.facing.row2 ? `facing ${an}` : `in line with ${an}`) : null;
  if (fa < 0) {
    const dx = ev.vcol(se) - ev.vcol(sa);
    return `${Math.abs(dx)} seat${Math.abs(dx) > 1 ? 's' : ''} ${dx > 0 ? 'east' : 'west'} of ${an}`;
  }
  const d = (ev.vcol(se) - ev.vcol(sa)) * (fa === NORTH ? 1 : -1);
  const k = Math.abs(d);
  const side = d > 0 ? 'right' : 'left';
  return k === 1 ? `to the immediate ${side} of ${an}` : `${ordWord(k)} to the ${side} of ${an}`;
}

export function ctxOf(b: Built): RenderCtx {
  return { layout: b.layout, names: b.names, attrCat: b.attrCat, attrValues: b.attrValues };
}

function describeCase(b: Built, hps: HpsResult, c: HpsCase, placed: number[], clueIdx: number, parent?: HpsCase): string {
  const ctx = ctxOf(b);
  const ents = clueIdx >= 0 ? clueEntities(b.clues[clueIdx].atoms) : [];
  const parts: string[] = [];
  const faceNews: string[] = [];
  if (parent && b.layout.facing.kind === 'mixed') {
    for (let e = 0; e < b.names.length; e++) {
      const s = c.seatOf[e];
      if (s < 0 || c.face[s] < 0) continue;
      const ps = parent.seatOf[e];
      if (ps >= 0 && parent.face[ps] >= 0) continue;
      const f = c.face[s];
      faceNews.push(`${b.names[e]} faces ${f === IN ? 'the centre' : f === OUT ? 'outside' : f === NORTH ? 'north' : 'south'}`);
    }
  }
  const seated = Array.from({ length: b.names.length }, (_, i) => i).filter((x) => c.seatOf[x] >= 0 && !placed.includes(x));
  for (const e of placed) {
    const fromClue = ents.filter((x) => x !== e && !placed.includes(x));
    const anchors = [...fromClue, ...seated.filter((x) => !fromClue.includes(x)), ...placed.filter((x) => x !== e && x < b.names.length)];
    let w: string | null = null;
    for (const a of anchors) {
      w = relWords(b, hps, c, e, a);
      if (w) break;
    }
    if (!w && c.off >= 0 && !isRing(b.layout)) {
      const ev = hps.evaluator;
      ev.st = c;
      const col = ev.acol(c.seatOf[e]);
      w = `in seat ${col + 1} from the west end`;
    }
    parts.push(`${entityName(ctx, e)} ${w ?? 'placed'}`);
  }
  parts.push(...faceNews.slice(0, 2));
  if (!parts.length) {
    // the split was about where the chain sits in the row
    if (c.off >= 0 && !isRing(b.layout)) {
      const ev = hps.evaluator;
      ev.st = c;
      const e = ents.find((x) => c.seatOf[x] >= 0);
      if (e !== undefined) parts.push(`${entityName(ctx, e)} in seat ${ev.acol(c.seatOf[e]) + 1} from the west end`);
    }
  }
  return parts.length ? listText(parts) : 'another possibility';
}

/** Derivation lines (one idea per line). */
export function derivation(b: Built): string[] {
  const hps = b.hps;
  const ctx = ctxOf(b);
  const lines: string[] = [];
  const label = new Map<number, string>();
  let counter = 0;
  let pendingFix: number[] = [];
  let pendingEnts: number[] = [];
  let started = false;
  const flushFix = () => {
    if (!pendingFix.length) return;
    const names = listText([...new Set(pendingEnts)].map((e) => entityName(ctx, e)));
    if (!started) {
      lines.push(`Start with ${clueList(pendingFix)}: ${pendingFix.length > 1 ? 'together they fix' : 'it fixes'} ${names || 'the first seats'}.${isRing(b.layout) ? ' (On a round or square table, place the first person anywhere — only relative positions matter.)' : ''}`);
      started = true;
    } else lines.push(`${cap1(clueList(pendingFix))} then ${pendingFix.length > 1 ? 'place' : 'places'} ${names || 'the next persons'}.`);
    pendingFix = [];
    pendingEnts = [];
  };
  for (const ev of hps.events) {
    const alive = ev.results.reduce((n, r) => n + r.to.length, 0);
    const splits = ev.results.filter((r) => r.to.length > 1);
    if (ev.kind === 'filter') {
      flushFix();
      const dead = ev.results.filter((r) => r.to.length === 0).map((r) => label.get(r.from) ?? 'this case');
      const left = ev.results.filter((r) => r.to.length === 1).map((r) => label.get(r.from));
      lines.push(`Clue ${ev.clue + 1} rules out ${listText(dead)}${alive === 1 && left[0] ? ` — only ${left[0]} survives` : ''}.`);
      continue;
    }
    if (!splits.length) {
      const dead = ev.results.filter((r) => r.to.length === 0).map((r) => label.get(r.from) ?? 'this case');
      if (dead.length) {
        flushFix();
        lines.push(`${ev.kind === 'fill' ? 'Filling the last seats' : `Clue ${ev.clue + 1}`} cannot be met in ${listText(dead)}, so ${dead.length > 1 ? 'they are' : 'it is'} rejected.`);
      }
      const placed = ev.results.flatMap((r) => r.placed?.[0] ?? []);
      if (ev.kind === 'fill') {
        flushFix();
        const whoSet = [...new Set(placed)];
        if (whoSet.length) lines.push(`${listText(whoSet.map((e) => entityName(ctx, e, false)))} ${whoSet.length > 1 ? 'take' : 'takes'} the only ${ev.fill?.kind === 'seat' ? 'seat' : 'possibility'} left${hps.events.filter((x) => x.alive > 1).length && alive > 1 ? ' in each case' : ''}.`);
        else if (ev.fill?.kind === 'off') lines.push('The chain fits into the row in only one way.');
        else if (ev.fill?.kind === 'n') lines.push('Only one total number of persons fits.');
        else if (ev.fill?.kind === 'face') lines.push('The remaining facing direction is now forced.');
      } else {
        pendingFix.push(ev.clue);
        pendingEnts.push(...placed);
      }
      continue;
    }
    flushFix();
    for (const r of splits) {
      const parentLabel = label.get(r.from);
      const labels = r.to.map((id, i) => {
        const l = parentLabel ? `${parentLabel}${String.fromCharCode(97 + i)}` : `Case ${++counter}`;
        label.set(id, l);
        return l;
      });
      const parentCase = hps.cases.get(r.from);
      const descr = r.to.map((id, i) => `${labels[i]}: ${describeCase(b, hps, hps.cases.get(id)!, r.placed?.[i] ?? [], ev.clue, parentCase)}`);
      const src = ev.kind === 'fill' ? 'The remaining seats' : `Clue ${ev.clue + 1}`;
      lines.push(`${src} ${parentLabel ? `splits ${parentLabel} into` : 'gives'} ${r.to.length} cases — ${descr.join('; ')}.`);
    }
    for (const r of ev.results) if (r.to.length === 1 && label.has(r.from)) label.set(r.to[0], label.get(r.from)!);
  }
  flushFix();
  return condense(lines, b, 13).concat(arrangementLine(b, b.truth));
}

/** Keep long (extreme) derivations readable: merge runs of case lines, then summarise the middle. */
function condense(lines: string[], b: Built, max: number): string[] {
  if (lines.length <= max) return lines;
  const merged: string[] = [];
  const isCase = (l: string) => / cases — /.test(l) || / rules out | is rejected| are rejected/.test(l);
  for (const l of lines) {
    const prev = merged[merged.length - 1];
    if (prev !== undefined && isCase(prev) && isCase(l) && prev.length + l.length < 600) merged[merged.length - 1] = `${prev} ${l}`;
    else merged.push(l);
  }
  if (merged.length <= max) return merged;
  const head = merged.slice(0, 3);
  const tail = merged.slice(merged.length - (max - 4));
  const skipped = merged.length - head.length - tail.length;
  return [...head, `Work through the remaining case splits the same way (${skipped} more step${skipped > 1 ? 's' : ''}; ${b.hps.splits} extra cases in all): each case is closed as soon as one clue fails in it.`, ...tail];
}

const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const faceShort = (f: number) => (f === IN ? 'centre' : f === OUT ? 'outside' : f === NORTH ? 'north' : 'south');

/** Final arrangement in one line of text. */
export function arrangementLine(b: Built, sol: Solution): string {
  const T = new Truth(b.layout.kind === 'uncertain' ? { ...b.layout, len: sol.n } : b.layout, sol, b.names.length);
  const P = b.names.length;
  const who = (s: number) => {
    const p = T.occP[s];
    if (p < 0) return '';
    let t = b.names[p];
    if (b.attrValues.length) {
      const v = sol.seatOf.findIndex((x, e) => e >= P && x === s);
      if (v >= 0) t += ` (${b.attrValues[v - P]})`;
    }
    if (b.layout.facing.kind === 'mixed') t += ` [${faceShort(sol.face[s])}]`;
    return t;
  };
  const L = b.layout;
  if (L.kind === 'circle') return `Final arrangement, clockwise from ${b.names[T.occP[0]]}: ${Array.from({ length: L.len }, (_, s) => who(s)).join(', ')}.`;
  if (L.kind === 'square')
    return `Final arrangement, clockwise from the top-left corner: ${Array.from({ length: 8 }, (_, s) => `${who(s)} (${s % 2 === 0 ? 'corner' : 'middle'})`).join(', ')}.`;
  if (L.kind === 'parallel') {
    const row = (r: number) => Array.from({ length: L.len }, (_, c) => who(r * L.len + c)).join(', ');
    return `Final arrangement (west to east): Row 1 — ${row(0)}; Row 2 — ${row(1)}.`;
  }
  if (L.kind === 'uncertain') {
    const bits: string[] = [];
    let gap = 0;
    for (let s = 0; s < sol.n; s++) {
      const w = who(s);
      if (!w) gap++;
      else {
        if (gap) bits.push(`${gap} unnamed`);
        gap = 0;
        bits.push(w);
      }
    }
    if (gap) bits.push(`${gap} unnamed`);
    return `Final arrangement from the left end: ${bits.join(', ')} — ${sol.n} persons in all.`;
  }
  return `Final arrangement (west to east): ${Array.from({ length: L.len }, (_, s) => who(s)).join(', ')}.`;
}

const FACING: Record<number, Seat['facing']> = { 0: 'north', 1: 'south', 2: 'inside', 3: 'outside' };

export function visualOf(b: Built, sol: Solution): VisualSpec {
  const L: Layout = b.layout.kind === 'uncertain' ? { ...b.layout, len: sol.n } : b.layout;
  const T = new Truth(L, sol, b.names.length);
  const P = b.names.length;
  const seat = (s: number): Seat => {
    const p = T.occP[s];
    const v = b.attrValues.length ? sol.seatOf.findIndex((x, e) => e >= P && x === s) : -1;
    return { name: p >= 0 ? b.names[p] : '', facing: FACING[sol.face[s]], ...(v >= 0 ? { note: b.attrValues[v - P] } : {}) };
  };
  switch (L.kind) {
    case 'circle':
      return { type: 'circular', seats: Array.from({ length: L.len }, (_, s) => seat(s)), caption: 'Clockwise from the top.' };
    case 'square':
      return { type: 'square', shape: 'square', seats: Array.from({ length: 8 }, (_, s) => seat(s)), caption: 'Corners and middles of the sides, clockwise from the top-left corner.' };
    case 'parallel': {
      const f = L.facing.kind === 'rows' ? L.facing : { row1: NORTH, row2: NORTH };
      return {
        type: 'linear',
        rows: [0, 1].map((r) => ({ label: `Row ${r + 1} (facing ${faceShort(r === 0 ? f.row1 : f.row2)})`, seats: Array.from({ length: L.len }, (_, c) => seat(r * L.len + c)) })),
      };
    }
    case 'uncertain':
      return { type: 'linear', rows: [{ seats: Array.from({ length: sol.n }, (_, s) => seat(s)) }], caption: `${sol.n} persons in all; a dash marks an unnamed person.` };
    default:
      return { type: 'linear', rows: [{ seats: Array.from({ length: L.len }, (_, s) => seat(s)) }] };
  }
}
