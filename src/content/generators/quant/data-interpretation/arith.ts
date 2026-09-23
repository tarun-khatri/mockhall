/**
 * Arithmetic DI (hard/extreme): SI/CI or profit-and-loss data inside a table. Values are chosen so every
 * interest, marked price and selling price is a whole number of rupees.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty, TableSpec } from '../../../types';
import { gcd, inr, isWhole, pct } from '../../../../lib/format';
import type { Mistake } from '../../shared/options';
import { cellRef, type Ref } from './refs';
import type { QB } from './grid';
import { list } from './themes';

const NAMES = ['Aarav', 'Meena', 'Ravi', 'Sana', 'Kiran', 'Deepa', 'Harsh', 'Farah', 'Joseph', 'Lakshmi', 'Gurpreet', 'Anjali', 'Vikram', 'Nisha'];
const ITEMS = ['Mixer', 'Fan', 'Cooler', 'Iron', 'Kettle', 'Heater', 'Toaster', 'Geyser', 'Cycle', 'Printer'];

export interface ArithData {
  title: string;
  stimulus: string;
  table: TableSpec;
  questions: QB[];
}

const ratioAlts = (x: number, y: number): { parts: [number, number]; why: string }[] => {
  const out: { parts: [number, number]; why: string }[] = [{ parts: [y, x], why: 'you write the ratio the other way round' }];
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [1, 2],
  ]) {
    const a = x + dx;
    const b = y + dy;
    const k = gcd(a, b);
    out.push({ parts: [a / k, b / k], why: 'you slip while cancelling common factors' });
  }
  return out;
};

function reducePair(a: number, b: number): [number, number] {
  const k = gcd(a, b);
  return [a / k, b / k];
}

/* ------------------------------------------------------------------ */
/* SI / CI                                                             */
/* ------------------------------------------------------------------ */

function interestSet(rng: Rng, d: Difficulty): ArithData | null {
  const names = rng.sample(NAMES, 5);
  const cols = ['Principal (₹)', 'Rate (% p.a.)', 'Time (years)'];
  const data = names.map(() => {
    const R = rng.pick([5, 8, 10, 12, 15, 20]);
    const T = rng.pick(d === 'extreme' ? [2, 3] : [2, 2, 3]);
    const unit = R === 5 || R === 15 ? 4000 : R === 12 || R === 8 ? 2500 : 1000;
    const P = unit * rng.int(Math.ceil(5000 / unit), Math.floor(48000 / unit));
    return { P, R, T };
  });
  const [a, b, c, e, f] = rng.shuffle([0, 1, 2, 3, 4]);
  // the person asked about CI gets a CI-friendly rate
  const R2 = rng.pick([10, 20, 5]);
  data[b] = { P: (R2 === 5 ? 4000 : 1000) * rng.int(3, 12), R: R2, T: R2 === 5 ? 2 : rng.pick([2, 3]) };
  const si = (i: number) => (data[i].P * data[i].R * data[i].T) / 100;
  const ci = (i: number) => Math.round((data[i].P * ((100 + data[i].R) ** data[i].T)) / 100 ** data[i].T * 1e6) / 1e6 - data[i].P;
  for (let i = 0; i < 5; i++) if (!isWhole(si(i))) return null;
  if (!isWhole(ci(b))) return null;
  const P = (i: number) => cellRef(names[i], cols[0]);
  const Rr = (i: number) => cellRef(names[i], cols[1]);
  const Tt = (i: number) => cellRef(names[i], cols[2]);
  const siRef = (i: number): Ref => ({ op: 'si', p: P(i), r: Rr(i), t: Tt(i) });
  const ciRef = (i: number): Ref => ({ op: 'ci', p: P(i), r: Rr(i), t: Tt(i) });
  const qs: QB[] = [];
  const row = (i: number) => `${names[i]}: ${inr(data[i].P)} at ${data[i].R}% p.a. for ${data[i].T} years`;
  const inrM = (list0: Mistake[]) => list0.filter((m) => m.value > 0 && isWhole(m.value));
  // 1. SI
  qs.push({
    family: 'special',
    ask: { kind: 'value', x: siRef(a), fmt: 'inr' },
    prompt: `What is the simple interest earned by ${names[a]} on the given principal for the given time?`,
    fmt: 'inr',
    answer: si(a),
    steps: [`${row(a)}`, `SI = P × R × T ÷ 100 = ${inr(data[a].P)} × ${data[a].R} × ${data[a].T} ÷ 100 = ${inr(si(a))}`],
    shortcut: `${data[a].R * data[a].T}% of ${inr(data[a].P)} in one step.`,
    mistakes: inrM([
      { value: (data[a].P * data[a].R) / 100, why: 'you find the interest for one year only' },
      { value: data[a].P + si(a), why: 'you give the amount (P + SI) instead of the interest' },
      { value: ci(a), why: 'you use compound interest instead of simple interest' },
    ]),
    cells: [],
    tags: ['di:arithmetic', 'interest:simple'],
  });
  // 2. CI
  const g2 = data[b];
  qs.push({
    family: 'special',
    ask: { kind: 'value', x: ciRef(b), fmt: 'inr' },
    prompt: `If ${names[b]} had invested the given principal at the given rate compounded annually for the given time, what compound interest would ${names[b]} have earned?`,
    fmt: 'inr',
    answer: ci(b),
    steps: [row(b), `Amount = ${inr(g2.P)} × (1 + ${g2.R}/100)^${g2.T} = ${inr(g2.P + ci(b))}`, `CI = ${inr(g2.P + ci(b))} − ${inr(g2.P)} = ${inr(ci(b))}`],
    shortcut: g2.T === 2 ? `Two-year CI = ${g2.R}% + ${g2.R}% + ${g2.R}% of ${g2.R}% = ${pct(2 * g2.R + (g2.R * g2.R) / 100)} of the principal.` : `Three-year CI rate = ${pct(((1 + g2.R / 100) ** 3 - 1) * 100)} of the principal (successive % method).`,
    mistakes: inrM([
      { value: si(b), why: 'you work out simple interest instead' },
      { value: g2.P + ci(b), why: 'you give the amount instead of the interest' },
      { value: g2.P * ((1 + g2.R / 100) ** (g2.T - 1)) - g2.P, why: 'you compound for one year less' },
    ]),
    cells: [],
    tags: ['di:arithmetic', 'interest:compound'],
  });
  // 3. ratio of SI
  const [x, y] = reducePair(si(c), si(e));
  if (x !== y && Math.max(x, y) <= 200) {
    qs.push({
      family: 'special',
      ask: { kind: 'ratio', a: siRef(c), b: siRef(e) },
      prompt: `What is the ratio of the simple interest earned by ${names[c]} to that earned by ${names[e]}?`,
      fmt: 'ratio',
      answer: si(c) / si(e),
      parts: [x, y],
      steps: [`SI of ${names[c]} = ${inr(data[c].P)} × ${data[c].R} × ${data[c].T} ÷ 100 = ${inr(si(c))}`, `SI of ${names[e]} = ${inr(data[e].P)} × ${data[e].R} × ${data[e].T} ÷ 100 = ${inr(si(e))}`, `Ratio = ${si(c)} : ${si(e)} = ${x} : ${y}`],
      shortcut: `Compare P × R × T directly (the ÷ 100 cancels): ${data[c].P * data[c].R * data[c].T} : ${data[e].P * data[e].R * data[e].T}.`,
      mistakes: [],
      ratioAlt: ratioAlts(x, y),
      cells: [],
      tags: ['di:arithmetic', 'di:ratio'],
    });
  }
  // 4. CI − SI for 2 years at the same rate
  const h = data[f];
  const diff2 = (h.P * h.R * h.R) / 10000;
  if (isWhole(diff2)) {
    qs.push({
      family: 'special',
      ask: {
        kind: 'difference',
        a: { op: 'ci', p: P(f), r: Rr(f), t: { op: 'const', v: 2 } },
        b: { op: 'si', p: P(f), r: Rr(f), t: { op: 'const', v: 2 } },
        fmt: 'inr',
      },
      prompt: `For ${names[f]}'s principal and rate, what is the difference between the compound interest (compounded annually) and the simple interest for 2 years?`,
      fmt: 'inr',
      answer: diff2,
      steps: [`${names[f]}: ${inr(h.P)} at ${h.R}% p.a.`, `CI − SI for 2 years = P × (R/100)² = ${inr(h.P)} × (${h.R}/100)² = ${inr(diff2)}`],
      shortcut: 'For 2 years, CI − SI = P(R/100)² — no need to find either interest.',
      mistakes: inrM([
        { value: (h.P * h.R) / 100, why: 'you give one year’s interest' },
        { value: diff2 * 2, why: 'you double the one-year interest-on-interest' },
        { value: (h.P * h.R * h.R * 3) / 10000, why: 'you use the 3-year formula' },
      ]),
      cells: [],
      tags: ['di:arithmetic', 'interest:ci-si-difference'],
    });
  }
  // 5. amount / SI as % of principal
  qs.push({
    family: 'special',
    ask: { kind: 'value', x: { op: 'add', a: P(e), b: siRef(e) }, fmt: 'inr' },
    prompt: `What total amount (principal + simple interest) will ${names[e]} receive at the end of the given time?`,
    fmt: 'inr',
    answer: data[e].P + si(e),
    steps: [`SI = ${inr(data[e].P)} × ${data[e].R} × ${data[e].T} ÷ 100 = ${inr(si(e))}`, `Amount = ${inr(data[e].P)} + ${inr(si(e))} = ${inr(data[e].P + si(e))}`],
    shortcut: `Amount = P × (1 + RT/100) = ${inr(data[e].P)} × ${1 + (data[e].R * data[e].T) / 100}.`,
    mistakes: inrM([
      { value: si(e), why: 'you give only the interest' },
      { value: data[e].P + (data[e].P * data[e].R) / 100, why: 'you add only one year’s interest' },
      { value: data[e].P + ci(e), why: 'you use compound interest' },
    ]),
    cells: [],
    tags: ['di:arithmetic', 'interest:simple'],
  });
  if (qs.length < 5) return null;
  return {
    title: 'Table: investments',
    stimulus: `Study the following table carefully and answer the questions given below.\n\nThe table shows the principal invested by five persons (${list(names)}), the rate of interest per annum and the time for which each sum was invested. Unless stated otherwise, interest is simple interest.`,
    table: { title: 'Investments', columns: ['Person', ...cols], rows: names.map((nm, i) => [nm, data[i].P, data[i].R, data[i].T]) },
    questions: qs.slice(0, 5),
  };
}

/* ------------------------------------------------------------------ */
/* Profit & loss                                                       */
/* ------------------------------------------------------------------ */

function profitSet(rng: Rng, d: Difficulty): ArithData | null {
  const items = rng.sample(ITEMS, 5);
  const cols = ['Cost price (₹)', 'Mark-up (%)', 'Discount (%)'];
  const data = items.map(() => {
    const m = rng.pick([20, 25, 30, 40, 50, 60]);
    const dd = rng.pick(d === 'extreme' ? [5, 10, 12.5, 15, 20, 25] : [5, 10, 15, 20, 25]);
    const cp = 200 * rng.int(5, 30);
    return { cp, m, d: dd };
  });
  const mp = (i: number) => (data[i].cp * (100 + data[i].m)) / 100;
  const sp = (i: number) => (mp(i) * (100 - data[i].d)) / 100;
  for (let i = 0; i < 5; i++) if (!isWhole(sp(i)) || !(sp(i) > data[i].cp)) return null;
  const CP = (i: number) => cellRef(items[i], cols[0]);
  const MPr = (i: number): Ref => ({ op: 'add', a: CP(i), b: { op: 'pctof', p: cellRef(items[i], cols[1]), x: CP(i) } });
  const SPr = (i: number): Ref => ({ op: 'sub', a: MPr(i), b: { op: 'pctof', p: cellRef(items[i], cols[2]), x: MPr(i) } });
  const [a, b, c, e, f] = rng.shuffle([0, 1, 2, 3, 4]);
  const qs: QB[] = [];
  const inrM = (list0: Mistake[]) => list0.filter((m) => m.value > 0 && isWhole(m.value));
  const mpStep = (i: number) => `Marked price of the ${items[i].toLowerCase()} = ${inr(data[i].cp)} + ${data[i].m}% = ${inr(mp(i))}`;
  const spStep = (i: number) => `Selling price = ${inr(mp(i))} − ${data[i].d}% = ${inr(sp(i))}`;
  qs.push({
    family: 'special',
    ask: { kind: 'value', x: SPr(a), fmt: 'inr' },
    prompt: `What is the selling price of the ${items[a].toLowerCase()}?`,
    fmt: 'inr',
    answer: sp(a),
    steps: [mpStep(a), spStep(a)],
    shortcut: `SP = CP × ${(100 + data[a].m) / 100} × ${(100 - data[a].d) / 100}.`,
    mistakes: inrM([
      { value: mp(a), why: 'you stop at the marked price' },
      { value: (data[a].cp * (100 + data[a].m - data[a].d)) / 100, why: 'you add the mark-up and subtract the discount on the cost price' },
      { value: (data[a].cp * (100 - data[a].d)) / 100, why: 'you apply the discount to the cost price' },
    ]),
    cells: [],
    tags: ['di:arithmetic', 'profit:marked-price'],
  });
  qs.push({
    family: 'special',
    ask: { kind: 'value', x: { op: 'sub', a: SPr(b), b: CP(b) }, fmt: 'inr' },
    prompt: `What profit is made on the ${items[b].toLowerCase()}?`,
    fmt: 'inr',
    answer: sp(b) - data[b].cp,
    steps: [mpStep(b), spStep(b), `Profit = ${inr(sp(b))} − ${inr(data[b].cp)} = ${inr(sp(b) - data[b].cp)}`],
    shortcut: `Net effect of +${data[b].m}% and −${data[b].d}% = ${pct(data[b].m - data[b].d - (data[b].m * data[b].d) / 100)} of CP.`,
    mistakes: inrM([
      { value: mp(b) - data[b].cp, why: 'you ignore the discount' },
      { value: (data[b].cp * (data[b].m - data[b].d)) / 100, why: 'you subtract the percentages directly (m − d)% of CP' },
      { value: mp(b) - sp(b), why: 'you give the discount amount instead' },
    ]),
    cells: [],
    tags: ['di:arithmetic', 'profit:profit'],
  });
  const profPct = ((sp(c) - data[c].cp) / data[c].cp) * 100;
  qs.push({
    family: 'special',
    ask: { kind: 'pct-change', from: CP(c), to: SPr(c) },
    prompt: `What is the profit percentage on the ${items[c].toLowerCase()}?`,
    fmt: 'pct',
    answer: profPct,
    steps: [mpStep(c), spStep(c), `Profit % = (${inr(sp(c))} − ${inr(data[c].cp)}) ÷ ${inr(data[c].cp)} × 100 = ${pct(profPct)}`],
    shortcut: `Successive change: ${data[c].m} − ${data[c].d} − (${data[c].m} × ${data[c].d})/100 = ${pct(profPct)}.`,
    mistakes: [
      { value: data[c].m - data[c].d, why: 'you subtract the discount % from the mark-up % directly' },
      { value: ((sp(c) - data[c].cp) / sp(c)) * 100, why: 'you divide the profit by the selling price' },
      { value: data[c].m, why: 'you ignore the discount' },
    ].filter((m) => m.value > 0),
    cells: [],
    tags: ['di:arithmetic', 'profit:percent'],
  });
  const [x, y] = reducePair(mp(e), mp(f));
  if (x !== y && Math.max(x, y) <= 400) {
    qs.push({
      family: 'special',
      ask: { kind: 'ratio', a: MPr(e), b: MPr(f) },
      prompt: `What is the ratio of the marked price of the ${items[e].toLowerCase()} to that of the ${items[f].toLowerCase()}?`,
      fmt: 'ratio',
      answer: mp(e) / mp(f),
      parts: [x, y],
      steps: [mpStep(e), mpStep(f), `Ratio = ${mp(e)} : ${mp(f)} = ${x} : ${y}`],
      shortcut: 'Write CP × (1 + mark-up) for both and cancel common factors before multiplying.',
      mistakes: [],
      ratioAlt: [...ratioAlts(x, y), { parts: reducePair(data[e].cp, data[f].cp), why: 'you compare the cost prices instead' }],
      cells: [],
      tags: ['di:arithmetic', 'di:ratio'],
    });
  }
  const discAmt = (i: number) => mp(i) - sp(i);
  const v5 = Math.abs(discAmt(a) - discAmt(e));
  if (v5 > 0 && isWhole(v5)) {
    qs.push({
      family: 'special',
      ask: { kind: 'difference', a: { op: 'sub', a: MPr(a), b: SPr(a) }, b: { op: 'sub', a: MPr(e), b: SPr(e) }, fmt: 'inr' },
      prompt: `What is the difference between the discount given on the ${items[a].toLowerCase()} and that given on the ${items[e].toLowerCase()} (in rupees)?`,
      fmt: 'inr',
      answer: v5,
      steps: [mpStep(a), `Discount = ${data[a].d}% of ${inr(mp(a))} = ${inr(discAmt(a))}`, mpStep(e), `Discount = ${data[e].d}% of ${inr(mp(e))} = ${inr(discAmt(e))}`, `Difference = ${inr(v5)}`],
      shortcut: 'Discount is always a percentage of the marked price, not of the cost price.',
      mistakes: inrM([
        { value: Math.abs((data[a].cp * data[a].d) / 100 - (data[e].cp * data[e].d) / 100), why: 'you take the discount on the cost prices' },
        { value: discAmt(a) + discAmt(e), why: 'you add the two discounts' },
        { value: v5 + 10, why: 'you make a slip of 10 while subtracting' },
      ]).filter((m) => m.value !== v5),
      cells: [],
      tags: ['di:arithmetic', 'profit:discount'],
    });
  }
  if (qs.length < 5) return null;
  return {
    title: 'Table: pricing of appliances',
    stimulus: `Study the following table carefully and answer the questions given below.\n\nThe table shows the cost price of five items sold by a shopkeeper, the percentage by which each is marked up above its cost price and the discount (%) allowed on the marked price.`,
    table: { title: 'Pricing', columns: ['Item', ...cols], rows: items.map((it, i) => [it, data[i].cp, data[i].m, data[i].d]) },
    questions: qs.slice(0, 5),
  };
}

export function arithSet(rng: Rng, d: Difficulty): ArithData | null {
  return rng.chance(0.5) ? interestSet(rng, d) : profitSet(rng, d);
}
