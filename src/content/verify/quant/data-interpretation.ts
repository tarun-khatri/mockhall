/**
 * Independent verifier for quant.data-interpretation.
 *
 * Every answer is recomputed from what the student sees: table cells (a "?" cell is rebuilt from the row's Total),
 * chart points, pie slices (with the total parsed from the note) or numbers printed in a caselet passage (each
 * input must appear verbatim in the stimulus and is re-parsed from that text). The facts only say WHICH displayed
 * values a question combines and how (ratio, % of, % change, average, difference, sum, SI/CI…).
 */
import type { GenResult } from '../../generators/types';
import type { DIFacts } from '../../generators/quant/data-interpretation';
import type { Ask, Fmt, Ref } from '../../generators/quant/data-interpretation/refs';
import type { QuestionSet } from '../../types';
import { indian, inr, isWhole, pct, plain, ratio } from '../../../lib/format';

function parseNumber(text: string): number {
  const frac = text.match(/\\frac\{(\d+)\}\{(\d+)\}/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const m = text.replace(/[₹,]/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!m) throw new Error(`verifier: no number in "${text}"`);
  return Number(m[0]);
}

class Data {
  constructor(
    private set: QuestionSet,
    private inputs: Record<string, string> = {},
  ) {}

  cell(row: string, col: string): number {
    const { table, chart } = this.set;
    if (table) {
      const ci = table.columns.indexOf(col);
      const ri = table.rows.findIndex((r) => String(r[0]) === row);
      if (ci < 1 || ri < 0) throw new Error(`verifier: no table cell ${row}/${col}`);
      const raw = table.rows[ri][ci];
      if (raw !== '?') return Number(raw);
      // missing value: rebuild from the row total
      const ti = table.columns.indexOf('Total');
      if (ti < 0) throw new Error('verifier: missing value without a Total column');
      const nums = table.rows[ri].map((x, j) => (j === 0 ? 0 : x === '?' ? NaN : Number(x)));
      if (ci === ti) {
        const parts = nums.filter((_, j) => j !== 0 && j !== ti);
        if (parts.some(Number.isNaN)) throw new Error('verifier: two missing values in one row');
        return parts.reduce((a, b) => a + b, 0);
      }
      const others = nums.filter((_, j) => j !== 0 && j !== ti && j !== ci);
      if (others.some(Number.isNaN) || Number.isNaN(nums[ti])) throw new Error('verifier: missing value is not derivable');
      return nums[ti] - others.reduce((a, b) => a + b, 0);
    }
    if (chart && (chart.type === 'bar' || chart.type === 'line' || chart.type === 'stacked-bar')) {
      const i = chart.categories.indexOf(row);
      const s = chart.series.find((x) => x.name === col);
      if (i < 0 || !s) throw new Error(`verifier: no chart point ${row}/${col}`);
      return s.values[i];
    }
    throw new Error('verifier: cell reference without a table or bar/line chart');
  }

  private pie() {
    const chart = this.set.chart;
    if (!chart || chart.type !== 'pie') throw new Error('verifier: slice reference without a pie chart');
    const whole = chart.slices.reduce((a, s) => a + s.value, 0);
    const expect = chart.valueKind === 'percent' ? 100 : 360;
    if (Math.abs(whole - expect) > 1e-9) throw new Error(`verifier: pie values add up to ${whole}, not ${expect}`);
    const total = parseNumber((chart.note ?? '').replace(/^.*?=/, ''));
    return { chart, total, expect };
  }

  raw(label: string): number {
    const { chart } = this.pie();
    const s = chart.slices.find((x) => x.label === label);
    if (!s) throw new Error(`verifier: no slice ${label}`);
    return s.value;
  }

  slice(label: string): number {
    const { total, expect } = this.pie();
    return (this.raw(label) / expect) * total;
  }

  private printed(name: string): string {
    const text = this.inputs[name];
    if (text === undefined) throw new Error(`verifier: unknown input ${name}`);
    if (!this.set.stimulus.includes(text)) throw new Error(`verifier: input "${text}" is not printed in the passage`);
    return text;
  }

  variable(name: string): number {
    return parseNumber(this.printed(name));
  }

  ratioParts(name: string): number[] {
    const parts = this.printed(name)
      .split(':')
      .map((s) => Number(s.trim()));
    if (parts.length < 2 || parts.some((x) => !(x > 0))) throw new Error(`verifier: bad ratio input ${name}`);
    return parts;
  }
}

function evalRef(ref: Ref, data: Data, prompt: string): number {
  const ev = (r: Ref) => evalRef(r, data, prompt);
  switch (ref.op) {
    case 'cell':
      return data.cell(ref.row, ref.col);
    case 'slice':
      return data.slice(ref.label);
    case 'raw':
      return data.raw(ref.label);
    case 'var':
      return data.variable(ref.name);
    case 'part':
      return data.ratioParts(ref.name)[ref.index];
    case 'parts':
      return data.ratioParts(ref.name).reduce((a, b) => a + b, 0);
    case 'const':
      return ref.v;
    case 'add':
      return ev(ref.a) + ev(ref.b);
    case 'sub':
      return ev(ref.a) - ev(ref.b);
    case 'mul':
      return ev(ref.a) * ev(ref.b);
    case 'div':
      return ev(ref.a) / ev(ref.b);
    case 'pctof':
      return (ev(ref.p) * ev(ref.x)) / 100;
    case 'grow': {
      // the percentage must be stated in the question itself
      if (!prompt.includes(`${Math.abs(ref.p)}% ${ref.p > 0 ? 'more' : 'less'}`)) throw new Error(`verifier: question does not state ${ref.p}%`);
      let x = ev(ref.x);
      x += (x * ref.p) / 100;
      return x;
    }
    case 'sum':
      return ref.items.reduce((a, r) => a + ev(r), 0);
    case 'si': {
      const P = ev(ref.p);
      const R = ev(ref.r);
      const T = ev(ref.t);
      let interest = 0;
      for (let y = 0; y < T; y++) interest += (P * R) / 100; // year by year
      return interest;
    }
    case 'ci': {
      const P = ev(ref.p);
      const R = ev(ref.r);
      const T = ev(ref.t);
      let amount = P;
      for (let y = 0; y < T; y++) amount += (amount * R) / 100; // compound year by year
      return amount - P;
    }
  }
}

const clean = (v: number) => Math.round(v * 1e9) / 1e9;

function format(v: number, fmt: Fmt): string {
  const x = clean(v);
  switch (fmt) {
    case 'int':
      if (!isWhole(x)) throw new Error(`verifier: expected a whole number, got ${x}`);
      return indian(x, 0);
    case 'num':
      return indian(x, 2);
    case 'pct':
      return pct(x, 2);
    case 'inr':
      if (!isWhole(x)) throw new Error(`verifier: expected whole rupees, got ${x}`);
      return inr(x, 2);
    case 'deg':
      return `${plain(x, 2)}°`;
  }
}

function answer(ask: Ask, data: Data, prompt: string): string {
  const ev = (r: Ref) => evalRef(r, data, prompt);
  switch (ask.kind) {
    case 'value':
      return format(ev(ask.x), ask.fmt);
    case 'ratio': {
      const a = clean(ev(ask.a));
      const b = clean(ev(ask.b));
      if (!isWhole(a) || !isWhole(b) || a <= 0 || b <= 0) throw new Error(`verifier: ratio of non-whole quantities ${a} : ${b}`);
      return ratio(Math.round(a), Math.round(b));
    }
    case 'pct-of':
      return format((ev(ask.a) / ev(ask.b)) * 100, 'pct');
    case 'pct-change': {
      const from = ev(ask.from);
      const to = ev(ask.to);
      return format((Math.abs(to - from) / from) * 100, 'pct');
    }
    case 'average':
      return format(ask.items.reduce((s, r) => s + ev(r), 0) / ask.items.length, ask.fmt);
    case 'difference':
      return format(Math.abs(ev(ask.a) - ev(ask.b)), ask.fmt);
    case 'sum':
      return format(ask.items.reduce((s, r) => s + ev(r), 0), ask.fmt);
  }
}

export function verify(res: GenResult<DIFacts>): string[] {
  const set = res.item.set;
  if (!set) throw new Error('verifier: DI item without a set');
  const data = new Data(set, res.facts.inputs);
  if (res.facts.questions.length !== res.item.questions.length) throw new Error('verifier: descriptor count mismatch');
  return res.facts.questions.map((ask, i) => answer(ask, data, res.item.questions[i].prompt));
}
