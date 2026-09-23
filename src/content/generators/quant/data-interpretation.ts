/**
 * Q15 Data interpretation — set generator (5 questions per set, caselets 3).
 *
 * Data are drawn from exam-style ranges (tables 20–300, bars on a 0–500 axis, lines 20–440 at clerk level) and every
 * question is kept only when its answer is clean for the difficulty. Each set carries a derived-entity or sub-split
 * question (seen in every 2024–26 paper). Facts hold one descriptor per question that points at the DISPLAYED
 * data, so the verifier recomputes answers from the chart/table/passage the student sees.
 */
import { defineGenerator } from '../types';
import { makeSet, type SetQuestionDraft } from '../shared/question';
import { numericChoices, shuffleChoices, type Mistake } from '../shared/options';
import { setTargetSeconds } from '../../targets';
import type { ChartSpec, Difficulty, TableSpec } from '../../types';
import type { Rng } from '../../../lib/rng';
import { indian, isWhole, ratio } from '../../../lib/format';
import { cellRef, fmtValue, type Ask, type Ref } from './data-interpretation/refs';
import { gridQuestions, pctOK, cap, n, type QB, type VGrid } from './data-interpretation/grid';
import { GRID_THEMES, PIE_THEMES, TIME_THEMES, gridPhraser, list, piePhraser, timePhraser, type GridTheme } from './data-interpretation/themes';
import { arithSet } from './data-interpretation/arith';
import { caseletSet } from './data-interpretation/caselets';

export interface DIFacts {
  /** One descriptor per question, in item order. */
  questions: Ask[];
  /** Caselets: printed text of every number the descriptors use (must appear verbatim in the passage). */
  inputs?: Record<string, string>;
}

const META = { name: 'quant.data-interpretation', version: 1, subject: 'quant', chapter: 'data-interpretation' } as const;

/** Weights from research/archetypes.md: tables and bars dominate, caselets common, pies/missing tables rare. */
export const DI_SUBTYPES = [
  { id: 'table', label: 'Table', weight: 3 },
  { id: 'bar', label: 'Bar graph', weight: 2 },
  { id: 'grouped-bar', label: 'Grouped bar graph', weight: 2 },
  { id: 'line', label: 'Line graph', weight: 1.5 },
  { id: 'multi-line', label: 'Two-line graph', weight: 1.5 },
  { id: 'caselet', label: 'Caselet', weight: 2.5 },
  { id: 'pie', label: 'Pie chart', weight: 0.5 },
  { id: 'missing-table', label: 'Missing-value table', weight: 0.5, difficulties: ['hard', 'extreme'] as const },
  { id: 'arithmetic-di', label: 'Arithmetic DI (SI/CI, P&L)', weight: 1, difficulties: ['hard', 'extreme'] as const },
] as const;

class Retry extends Error {}

interface Built {
  kind: 'di' | 'caselet';
  title: string;
  stimulus: string;
  chart?: ChartSpec;
  table?: TableSpec;
  questions: QB[];
  inputs?: Record<string, string>;
  tags: string[];
}

const NUM_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Profile = 'table' | 'bar' | 'line';
const RANGES: Record<Profile, Record<Difficulty, [number, number, number]>> = {
  table: { easy: [20, 300, 20], medium: [20, 300, 10], hard: [40, 400, 5], extreme: [100, 960, 5] },
  bar: { easy: [100, 500, 50], medium: [100, 500, 20], hard: [100, 600, 10], extreme: [200, 1200, 5] },
  line: { easy: [80, 440, 40], medium: [60, 440, 20], hard: [100, 600, 10], extreme: [200, 1500, 5] },
};

function values(rng: Rng, d: Difficulty, count: number, profile: Profile): number[] {
  const [lo, hi, step] = RANGES[profile][d];
  const pool: number[] = [];
  for (let x = Math.ceil(lo / step) * step; x <= hi; x += step) pool.push(x);
  return rng.sample(pool, count);
}

function rowCount(d: Difficulty): number {
  return d === 'easy' ? 4 : d === 'extreme' ? 6 : 5;
}

function nextTime(label: string): string {
  if (/^\d{4}$/.test(label)) return String(Number(label) + 1);
  const i = MONTHS.indexOf(label);
  return i >= 0 && i < 11 ? MONTHS[i + 1] : '';
}

function gridDesc(t: GridTheme, rows: string[], cols: string[], single: boolean): string {
  const who = `${NUM_WORD[rows.length]} ${t.rowPlural} (${list(rows)})`;
  const colsText = t.colKind === 'time' ? `${t.prep} ${list(cols)}` : list(cols.map((c) => (t.lowerTypes ? c.toLowerCase() : c)));
  switch (t.key) {
    case 'students':
      return `the number of ${colsText} in ${who}`;
    case 'employees':
      return `the number of ${colsText} employees in ${who}`;
    case 'books':
      return `the number of ${colsText} books sold by ${who}`;
    case 'flats':
      return `the number of ${colsText} flats built by ${who}`;
    case 'phones':
      return `the number of phones sold ${colsText} by ${who}`;
    case 'games':
      return `the number of students of ${who} who play ${colsText}`;
    case 'visitors':
      return `the number of visitors to ${who}${single ? ` ${t.prep} ${cols[0]}` : ` ${colsText}`}`;
    default:
      return `the number of ${t.noun} sold by ${who} ${single ? `${t.prep} ${cols[0]}` : colsText}`;
  }
}

function gridFor(t: GridTheme, rows: string[], cols: string[], vals: number[][], single: boolean): VGrid {
  const unused = t.rowPool.filter((r) => !rows.includes(r));
  return {
    rows,
    cols,
    val: (r, c) => vals[r][c],
    ref: (r, c) => cellRef(rows[r], cols[c]),
    ph: gridPhraser(t, single),
    colsTime: t.colKind === 'time' && !single,
    rowsTime: false,
    colsSummable: !single,
    split: t.split ?? ['of one kind', 'of the other kind'],
    present: t.colKind === 'type',
    newName: unused[0] ?? null,
  };
}

function colsOf(rng: Rng, t: GridTheme, k: number): string[] {
  const k2 = Math.min(k, t.colPool.length);
  if (t.colKind === 'time') {
    const start = rng.int(0, t.colPool.length - k2);
    return t.colPool.slice(start, start + k2);
  }
  const picked = new Set(rng.sample(t.colPool, k2));
  return t.colPool.filter((c) => picked.has(c));
}

const INTRO: Record<string, string> = {
  table: 'Study the following table carefully and answer the questions given below.',
  bar: 'Study the following bar graph carefully and answer the questions given below.',
  line: 'Study the following line graph carefully and answer the questions given below.',
  pie: 'Study the following pie chart carefully and answer the questions given below.',
};

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

function numbersTable(rng: Rng, d: Difficulty): Built | null {
  const themes = GRID_THEMES.filter((t) => t.colPool.length >= 3);
  const t = rng.pick(themes);
  const rows = t.rowPool.slice(0, d === 'easy' ? 4 : d === 'extreme' ? 6 : 5);
  const cols = colsOf(rng, t, d === 'easy' || d === 'medium' ? 3 : rng.int(3, 4));
  const vals = rows.map(() => values(rng, d, cols.length, 'table'));
  const g = gridFor(t, rows, cols, vals, false);
  const qs = gridQuestions(rng, g, d, 5);
  if (!qs) return null;
  return {
    kind: 'di',
    title: `Table: ${t.title}`,
    stimulus: `${INTRO.table}\n\nThe table shows ${gridDesc(t, rows, cols, false)}.`,
    table: { title: cap(t.title), columns: [t.rowHeader, ...cols], rows: rows.map((r, i) => [r, ...vals[i]]) },
    questions: qs,
    tags: ['di:table'],
  };
}

function splitTable(rng: Rng, d: Difficulty): Built | null {
  const t = rng.pick(GRID_THEMES.filter((x) => x.key === 'students' || x.key === 'employees'));
  const rows = t.rowPool.slice(0, d === 'easy' ? 4 : d === 'extreme' ? 6 : 5);
  const [typeA, typeB] = t.colPool;
  const totalCol = `Total ${t.noun}`;
  const pctCol = `${typeB} (%)`;
  const unit = d === 'easy' ? 100 : 20;
  const totals = rng.sample(Array.from({ length: Math.floor(1200 / unit) - 1 }, (_, i) => (i + 2) * unit).filter((x) => x >= 200), rows.length);
  const pcts = rows.map(() => rng.pick(d === 'easy' ? [20, 25, 40, 50, 60, 75] : [20, 25, 30, 35, 40, 45, 55, 60, 65, 70, 75]));
  const B = rows.map((_, i) => (totals[i] * pcts[i]) / 100);
  if (!B.every(isWhole)) return null;
  const refB = (r: number): Ref => ({ op: 'pctof', p: cellRef(rows[r], pctCol), x: cellRef(rows[r], totalCol) });
  const g: VGrid = {
    rows,
    cols: [typeA, typeB],
    val: (r, c) => (c === 1 ? B[r] : totals[r] - B[r]),
    ref: (r, c) => (c === 1 ? refB(r) : { op: 'sub', a: cellRef(rows[r], totalCol), b: refB(r) }),
    ph: gridPhraser(t, false),
    colsTime: false,
    rowsTime: false,
    colsSummable: true,
    split: t.split ?? ['of one kind', 'of the other kind'],
    present: true,
    newName: t.rowPool.find((r) => !rows.includes(r)) ?? null,
  };
  const qs = gridQuestions(rng, g, d, 5);
  if (!qs) return null;
  // steps: show how each count comes from the table
  for (const q of qs) {
    const used = [...new Set(q.cells.map(([r]) => r))];
    q.steps.unshift(
      ...used.map(
        (r) => `${cap(t.rowWord)} ${rows[r]}: ${t.lowerTypes ? typeB.toLowerCase() : typeB} = ${pcts[r]}% of ${n(totals[r])} = ${n(B[r])}, ${t.lowerTypes ? typeA.toLowerCase() : typeA} = ${n(totals[r])} − ${n(B[r])} = ${n(totals[r] - B[r])}`,
      ),
    );
  }
  return {
    kind: 'di',
    title: `Table: ${t.title}`,
    stimulus: `${INTRO.table}\n\nThe table shows the total number of ${t.noun} in ${NUM_WORD[rows.length]} ${t.rowPlural} (${list(rows)}) and the percentage of them who are ${t.lowerTypes ? typeB.toLowerCase() : typeB}${t.key === 'employees' ? ' employees' : ''}. The rest are ${t.lowerTypes ? typeA.toLowerCase() : typeA}${t.key === 'employees' ? ' employees' : ''}.`,
    table: { title: cap(t.title), columns: [t.rowHeader, totalCol, pctCol], rows: rows.map((r, i) => [r, totals[i], pcts[i]]) },
    questions: qs,
    tags: ['di:table', 'di:male-female'],
  };
}

function barSet(rng: Rng, d: Difficulty, grouped: boolean): Built | null {
  const t = grouped ? rng.pick(GRID_THEMES) : rng.pick(GRID_THEMES.filter((x) => x.colKind === 'time'));
  const rows = t.rowPool.slice(0, rowCount(d));
  const cols = grouped ? colsOf(rng, t, d === 'easy' || d === 'medium' ? 2 : rng.int(2, 3)) : [rng.pick(t.colPool)];
  const vals = rows.map(() => values(rng, d, cols.length, 'bar'));
  const g = gridFor(t, rows, cols, vals, !grouped);
  const qs = gridQuestions(rng, g, d, 5);
  if (!qs) return null;
  const chart: ChartSpec = {
    type: 'bar',
    title: cap(t.title),
    categories: rows,
    series: cols.map((c, j) => ({ name: c, values: rows.map((_, i) => vals[i][j]) })),
    yLabel: t.yLabel,
  };
  return {
    kind: 'di',
    title: `Bar graph: ${t.title}`,
    stimulus: `${INTRO.bar}\n\nThe bar graph shows ${gridDesc(t, rows, cols, !grouped)}.`,
    chart,
    questions: qs,
    tags: [grouped ? 'di:grouped-bar' : 'di:bar'],
  };
}

function lineSet(rng: Rng, d: Difficulty, multi: boolean): Built | null {
  const t = rng.pick(TIME_THEMES);
  const k = d === 'easy' ? 5 : 6;
  const start = rng.int(0, t.rowPool.length - k);
  const rows = t.rowPool.slice(start, start + k);
  const cols = multi ? t.seriesPool.slice(0, 2) : [cap(t.noun)];
  const vals = rows.map(() => values(rng, d, cols.length, 'line'));
  const next = nextTime(rows[rows.length - 1]);
  const g: VGrid = {
    rows,
    cols,
    val: (r, c) => vals[r][c],
    ref: (r, c) => cellRef(rows[r], cols[c]),
    ph: timePhraser(t, !multi),
    colsTime: false,
    rowsTime: true,
    colsSummable: multi,
    split: t.split,
    present: false,
    newName: next || null,
  };
  const qs = gridQuestions(rng, g, d, 5);
  if (!qs) return null;
  const DESC: Record<string, [string, string]> = {
    tractors: ['the number of tractors manufactured by a company', 'the number of tractors manufactured by two companies, A and B,'],
    tickets: ['the number of tickets sold by a museum', 'the number of adult and child tickets sold by a museum'],
    scooters: ['the number of scooters sold by a dealer', 'the number of scooters sold by two dealers, X and Y,'],
    parcels: ['the number of parcels delivered by a courier company', 'the number of parcels delivered by two couriers, A and B,'],
  };
  return {
    kind: 'di',
    title: `Line graph: ${t.title}`,
    stimulus: `${INTRO.line}\n\nThe line graph shows ${DESC[t.key][multi ? 1 : 0]} from ${rows[0]} to ${rows[rows.length - 1]}.`,
    chart: { type: 'line', title: cap(t.title), categories: rows, series: cols.map((c, j) => ({ name: c, values: rows.map((_, i) => vals[i][j]) })), yLabel: t.yLabel },
    questions: qs,
    tags: [multi ? 'di:multi-line' : 'di:line'],
  };
}

function pieSet(rng: Rng, d: Difficulty): Built | null {
  const t = rng.pick(PIE_THEMES);
  const k = d === 'easy' ? 5 : 6;
  const labels = t.labels.slice(0, k);
  const degree = d === 'hard' || d === 'extreme' ? rng.chance(0.6) : rng.chance(0.25);
  const unit = degree ? (d === 'easy' || d === 'medium' ? 12 : 6) : d === 'easy' || d === 'medium' ? 5 : 1;
  const whole = degree ? 360 : 100;
  const minEach = degree ? 24 : 5;
  // random composition of `whole` into k parts, multiples of `unit`, each ≥ minEach
  const slots = whole / unit - k * Math.ceil(minEach / unit);
  if (slots < 0) return null;
  const cuts = Array.from({ length: k - 1 }, () => rng.int(0, slots)).sort((a, b) => a - b);
  const parts = [...cuts, slots].map((x, i) => (x - (i ? cuts[i - 1] : 0) + Math.ceil(minEach / unit)) * unit);
  if (parts.reduce((a, b) => a + b, 0) !== whole || new Set(parts).size < k - 2) return null;
  const T = degree ? 60 * rng.int(20, d === 'extreme' ? 160 : 90) : 100 * rng.int(12, d === 'extreme' ? 80 : 60);
  const count = parts.map((p) => (p * T) / whole);
  if (!count.every(isWhole)) return null;
  const g: VGrid = {
    rows: labels,
    cols: ['count'],
    val: (r) => count[r],
    ref: (r) => ({ op: 'slice', label: labels[r] }),
    ph: piePhraser(t),
    colsTime: false,
    rowsTime: false,
    colsSummable: false,
    split: t.split,
    present: true,
    newName: null,
    partialSums: true,
  };
  const special = () => {
    const r = rng.int(0, k - 1);
    const raw = parts[r];
    if (!degree) {
      const v = raw * 3.6;
      return {
        family: 'special',
        ask: { kind: 'value', x: { op: 'mul', a: { op: 'raw', label: labels[r] }, b: { op: 'const', v: 3.6 } }, fmt: 'deg' },
        prompt: `What is the central angle (in degrees) of the sector for ${labels[r]}?`,
        fmt: 'deg',
        answer: v,
        steps: [`${labels[r]} = ${raw}% of the whole circle`, `Angle = ${raw}% of 360° = ${raw} × 3.6 = ${n(v)}°`],
        shortcut: '1% of the pie = 3.6°.',
        mistakes: [
          { value: raw * 3, why: 'you multiply by 3 instead of 3.6' },
          { value: raw * 4, why: 'you multiply by 4 instead of 3.6' },
          { value: 360 - v, why: 'you find the angle of the rest of the pie' },
        ].filter((m) => m.value > 0 && m.value < 360),
        cells: [[r, 0]],
        tags: ['di:pie-angle'],
      } as QB;
    }
    const v = raw / 3.6;
    if (!pctOK(v, d)) return null;
    return {
      family: 'special',
      ask: { kind: 'value', x: { op: 'div', a: { op: 'raw', label: labels[r] }, b: { op: 'const', v: 3.6 } }, fmt: 'pct' },
      prompt: `What percentage of the total number of ${t.totalNoun} does ${labels[r]} account for?`,
      fmt: 'pct',
      answer: v,
      steps: [`${labels[r]} = ${raw}°`, `Percentage = ${raw} ÷ 360 × 100 = ${n(v)}%`],
      shortcut: '1° of the pie = 100/360 ≈ 0.2778%, i.e. divide the angle by 3.6.',
      mistakes: [
        { value: raw / 3, why: 'you divide by 3 instead of 3.6' },
        { value: raw / 4, why: 'you divide by 4 instead of 3.6' },
        { value: 100 - v, why: 'you find the percentage for the rest of the pie' },
      ].filter((m) => m.value > 0 && m.value < 100),
      cells: [[r, 0]],
      tags: ['di:pie-percent'],
    } as QB;
  };
  const qs = gridQuestions(rng, g, d, 5, [special]);
  if (!qs) return null;
  for (const q of qs) {
    if (q.family === 'special') continue;
    const used = [...new Set(q.cells.map(([r]) => r))];
    q.steps.unshift(...used.map((r) => `${labels[r]}: ${parts[r]}${degree ? '°' : '%'} of ${indian(T)} = ${degree ? `${parts[r]}/360` : `${parts[r]}/100`} × ${indian(T)} = ${n(count[r])}`));
  }
  return {
    kind: 'di',
    title: `Pie chart: ${t.title}`,
    stimulus: `${INTRO.pie}\n\nThe pie chart shows the distribution of ${indian(T)} ${t.totalNoun} ${t.title.slice(t.totalNoun.length + 1)} (values in ${degree ? 'degrees' : 'percent'}).`,
    chart: { type: 'pie', title: cap(t.title), slices: labels.map((l, i) => ({ label: l, value: parts[i] })), valueKind: degree ? 'degree' : 'percent', note: `Total = ${indian(T)} ${t.totalNoun}` },
    questions: qs,
    tags: ['di:pie'],
  };
}

function missingTable(rng: Rng, d: Difficulty): Built | null {
  const t = rng.pick(GRID_THEMES.filter((x) => x.colPool.length >= 3));
  const rows = t.rowPool.slice(0, 5);
  const cols = colsOf(rng, t, 3);
  const vals = rows.map(() => values(rng, d, 3, 'table'));
  const g = gridFor(t, rows, cols, vals, false);
  const qs = gridQuestions(rng, g, d, 5);
  if (!qs) return null;
  const totals = vals.map((r) => r.reduce((a, b) => a + b, 0));
  // hide cells the questions actually need (at most one per row) so the totals must be used
  const used = rng.shuffle([...new Map(qs.flatMap((q) => q.cells).map(([r, c]) => [`${r},${c}`, [r, c] as [number, number]])).values()]);
  const missing = new Map<number, number>();
  for (const [r, c] of used) if (!missing.has(r) && missing.size < (d === 'extreme' ? 4 : 3)) missing.set(r, c);
  if (missing.size < 2) return null;
  const totalHidden = rows.map((_, i) => i).filter((i) => !missing.has(i));
  const hideTotal = totalHidden.length ? rng.pick(totalHidden) : -1;
  const shown = rows.map((r, i) => [r, ...vals[i].map((v, j) => (missing.get(i) === j ? '?' : v)), i === hideTotal ? '?' : totals[i]] as (string | number)[]);
  for (const q of qs) {
    const derivations = [...missing.entries()]
      .filter(([r, c]) => q.cells.some(([qr, qc]) => qr === r && qc === c))
      .map(([r, c]) => `${cap(g.ph.short(rows[r], cols[c]))} (missing) = ${n(totals[r])} − (${vals[r].filter((_, j) => j !== c).map(n).join(' + ')}) = ${n(vals[r][c])}`);
    q.steps.unshift(...derivations);
  }
  return {
    kind: 'di',
    title: `Missing-value table: ${t.title}`,
    stimulus: `${INTRO.table}\n\nThe table shows ${gridDesc(t, rows, cols, false)}, and the total for each ${t.rowWord}. Some values are missing (shown as ?); find them from the totals where needed.`,
    table: { title: cap(t.title), columns: [t.rowHeader, ...cols, 'Total'], rows: shown },
    questions: qs,
    tags: ['di:table', 'di:missing-value'],
  };
}

function build(sub: string, rng: Rng, d: Difficulty): Built | null {
  switch (sub) {
    case 'table':
      return rng.chance(0.45) ? splitTable(rng, d) : numbersTable(rng, d);
    case 'bar':
      return barSet(rng, d, false);
    case 'grouped-bar':
      return barSet(rng, d, true);
    case 'line':
      return lineSet(rng, d, false);
    case 'multi-line':
      return lineSet(rng, d, true);
    case 'pie':
      return pieSet(rng, d);
    case 'missing-table':
      return missingTable(rng, d);
    case 'arithmetic-di': {
      const a = arithSet(rng, d);
      return a ? { kind: 'di', title: a.title, stimulus: a.stimulus, table: a.table, questions: a.questions, tags: ['di:arithmetic'] } : null;
    }
    case 'caselet': {
      const c = caseletSet(rng, d);
      return c ? { kind: 'caselet', title: c.title, stimulus: c.stimulus, questions: c.questions, inputs: c.inputs, tags: ['di:caselet'] } : null;
    }
    default:
      throw new Error(`data-interpretation: unknown subtype ${sub}`);
  }
}

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

function toDraft(rng: Rng, q: QB): SetQuestionDraft {
  if (q.fmt === 'ratio') {
    const [x, y] = q.parts!;
    const correct = ratio(x, y);
    const seen = new Set([correct]);
    const alts: { text: string; why: string }[] = [];
    const reversed = q.ratioAlt?.[0];
    const rest = rng.shuffle(q.ratioAlt?.slice(1) ?? []);
    for (const a of [...(reversed ? [reversed] : []), ...rest]) {
      if (a.parts.some((p) => !(p > 0) || !Number.isInteger(p))) continue;
      const s = ratio(a.parts[0], a.parts[1]);
      if (seen.has(s)) continue;
      seen.add(s);
      alts.push({ text: s, why: a.why });
      if (alts.length === 4) break;
    }
    for (let k = 2; alts.length < 4 && k < 30; k++) {
      const s = ratio(x + k, y + 1);
      if (!seen.has(s)) {
        seen.add(s);
        alts.push({ text: s, why: 'you slip while cancelling common factors' });
      }
    }
    const ch = shuffleChoices(rng, correct, alts.map((a) => a.text));
    return {
      prompt: q.prompt,
      options: ch.options,
      answerIndex: ch.answerIndex,
      solution: { steps: q.steps, shortcut: q.shortcut, trap: `**${alts[0].text}** is what you get if ${alts[0].why}.` },
      tags: q.tags,
    };
  }
  const fmt = q.fmt;
  if ((fmt === 'int' || fmt === 'inr') && !isWhole(q.answer)) throw new Retry('non-integer count');
  const ch = numericChoices(rng, q.answer, {
    format: (v) => fmtValue(v, fmt),
    mistakes: q.mistakes.filter((m) => Number.isFinite(m.value) && m.value > 0),
    integer: fmt === 'int' || fmt === 'inr',
  });
  const order = (m: Mistake) => q.mistakes.findIndex((x) => x.why === m.why && Math.abs(x.value - m.value) < 1e-9);
  const trapM = [...ch.used].sort((a, b) => order(a) - order(b))[0];
  return {
    prompt: q.prompt,
    options: ch.options,
    answerIndex: ch.answerIndex,
    solution: {
      steps: q.steps,
      shortcut: q.shortcut,
      trap: trapM ? `**${fmtValue(trapM.value, fmt)}** is what you get if ${trapM.why}.` : 'Check which value is the base of the percentage and read the right row and column.',
    },
    tags: q.tags,
  };
}

export const generator = defineGenerator<DIFacts>(META, DI_SUBTYPES, ({ meta, seed, difficulty, subtype, rng }) => {
  let lastErr = 'no data set passed the cleanliness checks';
  for (let attempt = 0; attempt < 120; attempt++) {
    const r = rng.fork(`try${attempt}`);
    try {
      const b = build(subtype.id, r, difficulty);
      if (!b) continue;
      const drafts = b.questions.map((q) => toDraft(r, q));
      const kind = b.kind;
      const item = makeSet(meta, seed, {
        kind,
        subtype: subtype.id,
        difficulty,
        title: b.title,
        stimulus: b.stimulus,
        chart: b.chart,
        table: b.table,
        targetSeconds: setTargetSeconds(kind === 'caselet' ? 'caselet-set' : 'di-set', difficulty, drafts.length),
        questions: drafts.map((q) => ({ ...q, tags: [...new Set([...(q.tags ?? []), ...b.tags])] })),
      });
      return { item, facts: { questions: b.questions.map((q) => q.ask), ...(b.inputs ? { inputs: b.inputs } : {}) } };
    } catch (e) {
      if (e instanceof Retry || (e instanceof Error && (e.message.startsWith('numericChoices') || e.message.startsWith('rng.') || e.message.startsWith('shuffleChoices')))) {
        lastErr = (e as Error).message;
        continue;
      }
      throw e;
    }
  }
  throw new Error(`data-interpretation: could not build ${subtype.id}/${difficulty} for seed ${seed}: ${lastErr}`);
});
