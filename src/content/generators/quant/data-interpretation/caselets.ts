/**
 * Caselets: data given as a short paragraph (3 questions). Every number the verifier needs is printed in the
 * passage and recorded in facts.inputs by its printed text, so the verifier reads the passage, not our values.
 */
import type { Rng } from '../../../../lib/rng';
import type { Difficulty } from '../../../types';
import type { Mistake } from '../../shared/options';
import { gcd, indian, inr, isWhole, pct } from '../../../../lib/format';
import type { Ask, Ref } from './refs';
import type { QB } from './grid';

export interface CaseletData {
  title: string;
  stimulus: string;
  inputs: Record<string, string>;
  questions: QB[];
}

const v = (name: string): Ref => ({ op: 'var', name });
const c = (x: number): Ref => ({ op: 'const', v: x });
const add = (a: Ref, b: Ref): Ref => ({ op: 'add', a, b });
const sub = (a: Ref, b: Ref): Ref => ({ op: 'sub', a, b });
const mul = (a: Ref, b: Ref): Ref => ({ op: 'mul', a, b });
const div = (a: Ref, b: Ref): Ref => ({ op: 'div', a, b });
const pctof = (p: Ref, x: Ref): Ref => ({ op: 'pctof', p, x });
const part = (name: string, index: number): Ref => ({ op: 'part', name, index });
const parts = (name: string): Ref => ({ op: 'parts', name });

const fracTxt = (a: number, b: number) => `$\\frac{${a}}{${b}}$`;
const n = (x: number) => indian(x, 2);

function ratioQ(prompt: string, a: Ref, b: Ref, va: number, vb: number, steps: string[], tags: string[], extra: { parts: [number, number]; why: string }[] = []): QB | null {
  if (!isWhole(va) || !isWhole(vb) || va <= 0 || vb <= 0) return null;
  const k = gcd(va, vb);
  const x = va / k;
  const y = vb / k;
  if (x === y || Math.max(x, y) > 200) return null;
  const alts: { parts: [number, number]; why: string }[] = [{ parts: [y, x], why: 'you write the ratio the other way round' }, ...extra];
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [1, 2],
  ]) {
    const kk = gcd(x + dx, y + dy);
    alts.push({ parts: [(x + dx) / kk, (y + dy) / kk], why: 'you slip while cancelling common factors' });
  }
  return {
    family: 'ratio',
    ask: { kind: 'ratio', a, b },
    prompt,
    fmt: 'ratio',
    answer: va / vb,
    parts: [x, y],
    steps: [...steps, `Required ratio = ${n(va)} : ${n(vb)} = ${x} : ${y}`],
    shortcut: `Cancel the common factor ${k} at once.`,
    mistakes: [],
    ratioAlt: alts,
    cells: [],
    tags: ['di:caselet', 'di:ratio', ...tags],
  };
}

function valueQ(prompt: string, ask: Ask, value: number, fmt: QB['fmt'], steps: string[], shortcut: string, mistakes: Mistake[], tags: string[]): QB {
  return {
    family: 'special',
    ask,
    prompt,
    fmt,
    answer: value,
    steps,
    shortcut,
    mistakes: mistakes.filter((m) => m.value > 0 && Math.abs(m.value - value) > 1e-9 && (fmt !== 'int' && fmt !== 'inr' ? true : isWhole(m.value))),
    cells: [],
    tags: ['di:caselet', ...tags],
  };
}

/* ------------------------------------------------------------------ */
/* 1. School games                                                     */
/* ------------------------------------------------------------------ */

function games(rng: Rng, d: Difficulty): CaseletData | null {
  const N = 100 * rng.int(d === 'easy' ? 6 : 8, d === 'extreme' ? 48 : 30);
  const gp = rng.pick([35, 40, 45, 55, 60, 65]);
  const girls = (N * gp) / 100;
  const boys = N - girls;
  const fr = rng.pick([
    [1, 4],
    [3, 4],
    [2, 5],
    [3, 5],
    [1, 3],
    [2, 3],
    [3, 8],
    [5, 8],
  ] as const);
  const gB = (girls * fr[0]) / fr[1];
  const bp = rng.pick([20, 25, 30, 40, 60, 75]);
  const bB = (boys * bp) / 100;
  if (!isWhole(gB) || !isWhole(bB)) return null;
  const gC = girls - gB;
  const bC = boys - bB;
  const inputs = { N: indian(N), gp: `${gp}%`, gf: fracTxt(fr[0], fr[1]), bp: `${bp}%` };
  const stimulus = `Read the following information carefully and answer the questions that follow.\n\nA school has ${inputs.N} students, of whom ${inputs.gp} are girls. Every student plays exactly one of two games — badminton or chess. ${inputs.gf} of the girls play badminton and the remaining girls play chess. ${inputs.bp} of the boys play badminton and the remaining boys play chess.`;
  const girlsR = pctof(v('gp'), v('N'));
  const boysR = sub(v('N'), girlsR);
  const gBR = mul(girlsR, v('gf'));
  const gCR = sub(girlsR, gBR);
  const bBR = pctof(v('bp'), boysR);
  const bCR = sub(boysR, bBR);
  const base = [`Girls = ${gp}% of ${n(N)} = ${n(girls)}; boys = ${n(N)} − ${n(girls)} = ${n(boys)}`];
  const pool: (QB | null)[] = [
    valueQ(
      'How many boys play chess?',
      { kind: 'value', x: bCR, fmt: 'int' },
      bC,
      'int',
      [...base, `Boys playing badminton = ${bp}% of ${n(boys)} = ${n(bB)}`, `Boys playing chess = ${n(boys)} − ${n(bB)} = ${n(bC)}`],
      `Chess-playing boys are the remaining ${100 - bp}%: ${100 - bp}% of ${n(boys)} = ${n(bC)}.`,
      [
        { value: bB, why: 'you find the boys who play badminton' },
        { value: gC, why: 'you find the girls who play chess' },
        { value: (N * (100 - bp)) / 100, why: `you take ${100 - bp}% of all the students` },
      ],
      [],
    ),
    ratioQ(
      'What is the ratio of the number of girls who play badminton to the number of boys who play badminton?',
      gBR,
      bBR,
      gB,
      bB,
      [...base, `Girls playing badminton = ${fr[0]}/${fr[1]} × ${n(girls)} = ${n(gB)}`, `Boys playing badminton = ${bp}% of ${n(boys)} = ${n(bB)}`],
      [],
      isWhole(gC) ? [{ parts: [gC / gcd(gC, bB), bB / gcd(gC, bB)], why: 'you take the girls who play chess' }] : [],
    ),
    valueQ(
      'What percentage of all the students play chess?',
      { kind: 'pct-of', a: add(gCR, bCR), b: v('N') },
      ((gC + bC) / N) * 100,
      'pct',
      [...base, `Chess players = ${n(gC)} girls + ${n(bC)} boys = ${n(gC + bC)}`, `Percentage = ${n(gC + bC)} ÷ ${n(N)} × 100 = ${pct(((gC + bC) / N) * 100)}`],
      'Add the chess players first, then divide once by the total.',
      [
        { value: ((gB + bB) / N) * 100, why: 'you find the badminton players instead' },
        { value: (gC / N) * 100, why: 'you count only the girls who play chess' },
        { value: ((gC + bC) / boys) * 100, why: 'you divide by the number of boys' },
      ],
      ['di:percent-of'],
    ),
    valueQ(
      'What is the difference between the number of girls who play badminton and the number of boys who play chess?',
      { kind: 'difference', a: gBR, b: bCR, fmt: 'int' },
      Math.abs(gB - bC),
      'int',
      [...base, `Girls playing badminton = ${n(gB)}`, `Boys playing chess = ${n(bC)}`, `Difference = ${n(Math.abs(gB - bC))}`],
      'Work out only the two groups asked for.',
      [
        { value: Math.abs(gB - bB), why: 'you use the boys who play badminton' },
        { value: Math.abs(gC - bC), why: 'you use the girls who play chess' },
        { value: gB + bC, why: 'you add instead of subtracting' },
      ],
      ['di:difference'],
    ),
  ];
  const qs = rng.shuffle(pool.filter((q): q is QB => !!q && q.answer > 0));
  if (qs.length < 3) return null;
  return { title: 'Caselet: students and games', stimulus, inputs, questions: qs.slice(0, 3) };
}

/* ------------------------------------------------------------------ */
/* 2. Two companies × three cities                                     */
/* ------------------------------------------------------------------ */

function cities(rng: Rng, d: Difficulty): CaseletData | null {
  const TA = 100 * rng.int(10, d === 'extreme' ? 60 : 36);
  const p = rng.pick([20, 25, 30, 35, 40]);
  const fr = rng.pick([
    [1, 4],
    [1, 5],
    [3, 10],
    [2, 5],
    [1, 3],
  ] as const);
  const aP = (TA * p) / 100;
  const aS = (TA * fr[0]) / fr[1];
  const aK = TA - aP - aS;
  const m = rng.pick([10, 20, 25, 30, 40, 50]);
  const TB = (TA * (100 + m)) / 100;
  const rr = rng.pick([
    [3, 4, 5],
    [2, 3, 5],
    [4, 5, 3],
    [5, 3, 4],
    [1, 2, 3],
    [3, 5, 4],
    [7, 5, 3],
  ] as const);
  const s = rr[0] + rr[1] + rr[2];
  const [bP, bS, bK] = rr.map((x) => (TB * x) / s);
  if (![aP, aS, aK, TB, bP, bS, bK].every(isWhole) || aK <= 0) return null;
  const item = rng.pick(['televisions', 'refrigerators', 'air conditioners', 'washing machines']);
  const inputs = { TA: indian(TA), aP: `${p}%`, aS: fracTxt(fr[0], fr[1]), bM: `${m}%`, bR: rr.join(' : ') };
  const stimulus = `Read the following information carefully and answer the questions that follow.\n\nTwo companies, A and B, sell ${item} in three cities — Pune, Surat and Kochi. Company A sold ${inputs.TA} ${item} in all: ${inputs.aP} of them in Pune and ${inputs.aS} of them in Surat, and the rest in Kochi. Company B sold ${inputs.bM} more ${item} than company A, and its sales in Pune, Surat and Kochi were in the ratio ${inputs.bR} respectively.`;
  const aPR = pctof(v('aP'), v('TA'));
  const aSR = mul(v('TA'), v('aS'));
  const aKR = sub(v('TA'), add(aPR, aSR));
  const TBR = add(v('TA'), pctof(v('bM'), v('TA')));
  const bCity = (i: number) => mul(TBR, div(part('bR', i), parts('bR')));
  const tb = `Company B's total = ${n(TA)} + ${m}% = ${n(TB)}`;
  const pool: (QB | null)[] = [
    valueQ(
      `How many ${item} did company B sell in Surat?`,
      { kind: 'value', x: bCity(1), fmt: 'int' },
      bS,
      'int',
      [tb, `Surat share = ${rr[1]} ÷ (${rr.join(' + ')}) = ${rr[1]}/${s}`, `B in Surat = ${rr[1]}/${s} × ${n(TB)} = ${n(bS)}`],
      `One ratio part = ${n(TB)} ÷ ${s} = ${n(TB / s)}; Surat has ${rr[1]} parts.`,
      [
        { value: (TA * rr[1]) / s, why: 'you split company A’s total instead of B’s' },
        { value: aS, why: 'you give company A’s sales in Surat' },
        { value: (TB * rr[0]) / s, why: 'you take the Pune share instead of Surat' },
      ],
      [],
    ),
    ratioQ(
      `What is the ratio of the number of ${item} sold by company A in Kochi to the number sold by company B in Kochi?`,
      aKR,
      bCity(2),
      aK,
      bK,
      [`A in Pune = ${p}% of ${n(TA)} = ${n(aP)}; A in Surat = ${fr[0]}/${fr[1]} × ${n(TA)} = ${n(aS)}`, `A in Kochi = ${n(TA)} − ${n(aP)} − ${n(aS)} = ${n(aK)}`, tb, `B in Kochi = ${rr[2]}/${s} × ${n(TB)} = ${n(bK)}`],
      [],
    ),
    valueQ(
      `Company A's sales in Pune are what percent of company B's sales in Pune?`,
      { kind: 'pct-of', a: aPR, b: bCity(0) },
      (aP / bP) * 100,
      'pct',
      [`A in Pune = ${p}% of ${n(TA)} = ${n(aP)}`, tb, `B in Pune = ${rr[0]}/${s} × ${n(TB)} = ${n(bP)}`, `Required % = ${n(aP)} ÷ ${n(bP)} × 100 = ${pct((aP / bP) * 100)}`],
      'Divide A’s figure by B’s figure — the base is the value after "of".',
      [
        { value: (bP / aP) * 100, why: 'you divide the other way round' },
        { value: (aP / (aP + bP)) * 100, why: 'you divide by the total Pune sales' },
        { value: (Math.abs(aP - bP) / bP) * 100, why: 'you find the percentage difference' },
      ],
      ['di:percent-of'],
    ),
    valueQ(
      `What is the total number of ${item} sold in Kochi by the two companies together?`,
      { kind: 'sum', items: [aKR, bCity(2)], fmt: 'int' },
      aK + bK,
      'int',
      [`A in Kochi = ${n(TA)} − ${n(aP)} − ${n(aS)} = ${n(aK)}`, tb, `B in Kochi = ${rr[2]}/${s} × ${n(TB)} = ${n(bK)}`, `Total = ${n(aK)} + ${n(bK)} = ${n(aK + bK)}`],
      'Find each company’s Kochi figure from its own total, then add.',
      [
        { value: aK + (TA * rr[2]) / s, why: 'you split A’s total for company B' },
        { value: aP + bP, why: 'you add the Pune figures' },
        { value: aK + bK + 10, why: 'you make a carrying slip of 10' },
      ],
      ['di:sum'],
    ),
  ];
  const qs = rng.shuffle(pool.filter((q): q is QB => !!q && q.answer > 0));
  if (qs.length < 3) return null;
  return { title: `Caselet: ${item} sold in three cities`, stimulus, inputs, questions: qs.slice(0, 3) };
}

/* ------------------------------------------------------------------ */
/* 3. SI / CI caselet                                                  */
/* ------------------------------------------------------------------ */

const PEOPLE: [string, 'He' | 'She'][] = [
  ['Ravi', 'He'],
  ['Meena', 'She'],
  ['Harpreet', 'She'],
  ['Arjun', 'He'],
  ['Farhan', 'He'],
  ['Kavya', 'She'],
  ['Sunil', 'He'],
  ['Lalitha', 'She'],
];

function interest(rng: Rng, d: Difficulty): CaseletData | null {
  const [name, he] = rng.pick(PEOPLE);
  const P1 = 1000 * rng.int(10, d === 'extreme' ? 80 : 50);
  const r1 = rng.pick([6, 8, 10, 12, 15]);
  const t1 = rng.int(2, 5);
  const r2 = rng.pick([10, 20, 5]);
  const P2 = (r2 === 5 ? 4000 : 1000) * rng.int(r2 === 5 ? 3 : 10, r2 === 5 ? 12 : 50);
  const si = (P1 * r1 * t1) / 100;
  const amt2 = (P2 * (100 + r2) ** 2) / 10000;
  const ci = amt2 - P2;
  if (!isWhole(si) || !isWhole(ci)) return null;
  const inputs = { P1: inr(P1), r1: `${r1}%`, t1: `${t1} years`, P2: inr(P2), r2: `${r2}%` };
  const stimulus = `Read the following information carefully and answer the questions that follow.\n\n${name} invested ${inputs.P1} in scheme A, which pays simple interest at ${inputs.r1} per annum, for ${inputs.t1}. ${he} also invested ${inputs.P2} in scheme B, which pays ${inputs.r2} per annum compounded annually, for 2 years.`;
  const siR: Ref = { op: 'si', p: v('P1'), r: v('r1'), t: v('t1') };
  const ciR: Ref = { op: 'ci', p: v('P2'), r: v('r2'), t: c(2) };
  const siStep = `SI from A = ${inr(P1)} × ${r1} × ${t1} ÷ 100 = ${inr(si)}`;
  const ciStep = `CI from B = ${inr(P2)} × (1 + ${r2}/100)² − ${inr(P2)} = ${inr(amt2)} − ${inr(P2)} = ${inr(ci)}`;
  const pool: (QB | null)[] = [
    valueQ(
      `What interest did ${name} earn from scheme A?`,
      { kind: 'value', x: siR, fmt: 'inr' },
      si,
      'inr',
      [siStep],
      `${r1 * t1}% of ${inr(P1)} in one step.`,
      [
        { value: (P1 * r1) / 100, why: 'you find one year’s interest only' },
        { value: P1 + si, why: 'you give the amount instead of the interest' },
        { value: (P1 * r1 * (t1 + 1)) / 100, why: 'you count one year too many' },
      ],
      ['interest:simple'],
    ),
    valueQ(
      `What interest did ${name} earn from scheme B?`,
      { kind: 'value', x: ciR, fmt: 'inr' },
      ci,
      'inr',
      [ciStep],
      `Two-year CI = ${2 * r2 + (r2 * r2) / 100}% of the principal (${r2} + ${r2} + ${r2} × ${r2}/100).`,
      [
        { value: (P2 * r2 * 2) / 100, why: 'you use simple interest' },
        { value: amt2, why: 'you give the amount instead of the interest' },
        { value: (P2 * r2) / 100, why: 'you find one year’s interest only' },
      ],
      ['interest:compound'],
    ),
    valueQ(
      `What total interest did ${name} earn from the two schemes together?`,
      { kind: 'sum', items: [siR, ciR], fmt: 'inr' },
      si + ci,
      'inr',
      [siStep, ciStep, `Total = ${inr(si)} + ${inr(ci)} = ${inr(si + ci)}`],
      'Find each interest separately; do not add the principals.',
      [
        { value: si + (P2 * r2 * 2) / 100, why: 'you use simple interest for scheme B too' },
        { value: si + amt2, why: 'you add B’s amount instead of its interest' },
        { value: si + ci + 100, why: 'you make a slip of ₹100 while adding' },
      ],
      ['di:sum'],
    ),
    ratioQ(`What is the ratio of the interest from scheme A to the interest from scheme B?`, siR, ciR, si, ci, [siStep, ciStep], ['interest:simple']),
    valueQ(
      `By how much does the interest from one scheme exceed the interest from the other?`,
      { kind: 'difference', a: siR, b: ciR, fmt: 'inr' },
      Math.abs(si - ci),
      'inr',
      [siStep, ciStep, `Difference = ${inr(Math.abs(si - ci))}`],
      'Compute both interests, then subtract.',
      [
        { value: Math.abs(si - (P2 * r2 * 2) / 100), why: 'you use simple interest for scheme B' },
        { value: Math.abs(P1 + si - amt2), why: 'you compare the amounts instead of the interests' },
        { value: si + ci, why: 'you add instead of subtracting' },
      ],
      ['di:difference'],
    ),
  ];
  const qs = rng.shuffle(pool.filter((q): q is QB => !!q && q.answer > 0));
  if (qs.length < 3) return null;
  return { title: 'Caselet: two investment schemes', stimulus, inputs, questions: qs.slice(0, 3) };
}

/* ------------------------------------------------------------------ */
/* 4. Employees in three companies                                     */
/* ------------------------------------------------------------------ */

function staff(rng: Rng, d: Difficulty): CaseletData | null {
  const rr = rng.pick([
    [4, 5, 3],
    [3, 4, 5],
    [5, 4, 3],
    [2, 3, 4],
    [5, 6, 4],
    [3, 5, 4],
  ] as const);
  const s = rr[0] + rr[1] + rr[2];
  const N = s * 20 * rng.int(d === 'easy' ? 3 : 5, d === 'extreme' ? 20 : 12);
  const [X, Y, Z] = rr.map((x) => (N * x) / s);
  const xf = rng.pick([20, 25, 30, 35, 40, 45, 60]);
  const yr = rng.pick([
    [3, 2],
    [2, 3],
    [5, 3],
    [3, 5],
    [7, 3],
    [4, 1],
  ] as const);
  const D = 10 * rng.int(2, Math.max(2, Math.floor(Z / 30)));
  const Xf = (X * xf) / 100;
  const Xm = X - Xf;
  const Ym = (Y * yr[0]) / (yr[0] + yr[1]);
  const Yf = Y - Ym;
  const Zf = (Z - D) / 2;
  const Zm = Zf + D;
  if (![X, Y, Z, Xf, Ym, Zf].every(isWhole) || Zf <= 0) return null;
  const inputs = { N: indian(N), R: rr.join(' : '), xf: `${xf}%`, yr: yr.join(' : '), D: indian(D) };
  const stimulus = `Read the following information carefully and answer the questions that follow.\n\nThree companies P, Q and R together have ${inputs.N} employees, and the numbers of employees in P, Q and R are in the ratio ${inputs.R} respectively. In company P, ${inputs.xf} of the employees are women. In company Q, the ratio of men to women is ${inputs.yr}. In company R, there are ${inputs.D} more men than women.`;
  const comp = (i: number) => mul(v('N'), div(part('R', i), parts('R')));
  const XfR = pctof(v('xf'), comp(0));
  const XmR = sub(comp(0), XfR);
  const YmR = mul(comp(1), div(part('yr', 0), parts('yr')));
  const YfR = sub(comp(1), YmR);
  const ZfR = div(sub(comp(2), v('D')), c(2));
  const ZmR = add(ZfR, v('D'));
  const split = `P = ${rr[0]}/${s} × ${n(N)} = ${n(X)}, Q = ${n(Y)}, R = ${n(Z)}`;
  const pool: (QB | null)[] = [
    valueQ(
      'How many women work in company Q?',
      { kind: 'value', x: YfR, fmt: 'int' },
      Yf,
      'int',
      [split, `Women in Q = ${yr[1]}/${yr[0] + yr[1]} × ${n(Y)} = ${n(Yf)}`],
      `Women are ${yr[1]} of the ${yr[0] + yr[1]} ratio parts of Q.`,
      [
        { value: Ym, why: 'you find the men instead of the women' },
        { value: (N * yr[1]) / (yr[0] + yr[1]), why: 'you split the total of all three companies' },
        { value: (Y * yr[1]) / yr[0], why: 'you divide by the men’s part instead of the total parts' },
      ],
      [],
    ),
    ratioQ('What is the ratio of the number of men in company P to the number of men in company R?', XmR, ZmR, Xm, Zm, [split, `Men in P = ${100 - xf}% of ${n(X)} = ${n(Xm)}`, `In R: women = (${n(Z)} − ${n(D)}) ÷ 2 = ${n(Zf)}, men = ${n(Zf)} + ${n(D)} = ${n(Zm)}`], []),
    valueQ(
      'Women form what percent of all the employees of the three companies together?',
      { kind: 'pct-of', a: { op: 'sum', items: [XfR, YfR, ZfR] }, b: v('N') },
      ((Xf + Yf + Zf) / N) * 100,
      'pct',
      [split, `Women: P = ${n(Xf)}, Q = ${n(Yf)}, R = ${n(Zf)}; total = ${n(Xf + Yf + Zf)}`, `Percentage = ${n(Xf + Yf + Zf)} ÷ ${n(N)} × 100 = ${pct(((Xf + Yf + Zf) / N) * 100)}`],
      'Add the women of all three companies, then divide once.',
      [
        { value: ((Xm + Ym + Zm) / N) * 100, why: 'you find the men instead' },
        { value: (xf + (yr[1] / (yr[0] + yr[1])) * 100 + (Zf / Z) * 100) / 3, why: 'you average the three percentages without weighting' },
        { value: ((Xf + Yf) / N) * 100, why: 'you leave out company R' },
      ],
      ['di:percent-of'],
    ),
    valueQ(
      'What is the average number of women per company in the three companies?',
      { kind: 'average', items: [XfR, YfR, ZfR], fmt: isWhole((Xf + Yf + Zf) / 3) ? 'int' : 'num' },
      (Xf + Yf + Zf) / 3,
      isWhole((Xf + Yf + Zf) / 3) ? 'int' : 'num',
      [split, `Women: ${n(Xf)} + ${n(Yf)} + ${n(Zf)} = ${n(Xf + Yf + Zf)}`, `Average = ${n(Xf + Yf + Zf)} ÷ 3 = ${n((Xf + Yf + Zf) / 3)}`],
      'Total first, then divide by 3.',
      [
        { value: (Xm + Ym + Zm) / 3, why: 'you average the men instead' },
        { value: (Xf + Yf + Zf) / 2, why: 'you divide by 2 instead of 3' },
        { value: (Xf + Yf) / 3, why: 'you leave out company R' },
      ],
      ['di:average'],
    ),
  ];
  const qs = rng.shuffle(pool.filter((q): q is QB => !!q && q.answer > 0 && (q.fmt !== 'num' || isWhole(q.answer * 100))));
  if (qs.length < 3) return null;
  return { title: 'Caselet: employees in three companies', stimulus, inputs, questions: qs.slice(0, 3) };
}

export function caseletSet(rng: Rng, d: Difficulty): CaseletData | null {
  const pick = rng.weighted<(r: Rng, dd: Difficulty) => CaseletData | null>([
    [games, 1],
    [cities, 1.2],
    [interest, 1],
    [staff, 1],
  ]);
  return pick(rng, d);
}
