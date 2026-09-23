/**
 * Percentage (SPEC 8.1 Q3). Built backward: every answer is chosen clean first, then the story is written.
 * Distractors come from the classic percentage mistakes: wrong base, adding successive percentages,
 * simple growth instead of compound, forgetting invalid votes, adding "% of remaining" shares.
 */
import { defineGenerator, type BuildContext, type GenResult, type SubtypeDef } from '../types';
import type { VisualSpec } from '../../types';
import {
  attempt,
  emit,
  fabs,
  factor,
  fdiv,
  fmtPct,
  fmul,
  fr,
  fsub,
  fval,
  gcd,
  He,
  he,
  his,
  indian,
  lcmAll,
  listAnd,
  multipleIn,
  pctF,
  pickPeople,
  rs,
  scale,
  texFr,
  toPct,
  type Fr,
  type Mist,
} from './percentage/kit';

const META = { name: 'quant.percentage', version: 1, subject: 'quant', chapter: 'percentage' } as const;

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'base-change', label: 'More than / less than (base change)', weight: 2 },
  { id: 'successive-change', label: 'Successive percentage change', weight: 2 },
  { id: 'population', label: 'Population growth & depreciation', weight: 1.5 },
  { id: 'election', label: 'Elections & votes', weight: 2 },
  { id: 'income-expenditure', label: 'Income, expenditure & savings', weight: 2.5 },
  { id: 'marks-pass', label: 'Marks & pass percentage', weight: 1.5 },
  { id: 'percent-chain', label: 'Percentage of percentage chains', weight: 1.5 },
  { id: 'participation', label: 'Participation split (the rest = N)', weight: 2 },
];

/* ------------------------------------------------------------------ */
/* Facts: the inputs of every form (never the answer)                  */
/* ------------------------------------------------------------------ */

export type PercentageFacts =
  /** A is x% more/less than B; asked: by what % B is less/more than A. */
  | { form: 'compare'; dir: 'more' | 'less'; x: Fr }
  /** Price rises/falls by x%; asked: % change in consumption keeping expenditure fixed. */
  | { form: 'consumption'; dir: 'rise' | 'fall'; x: Fr }
  /** Price +price%, expenditure +spend%; asked: % decrease in consumption. */
  | { form: 'price-spend'; price: number; spend: number }
  /** A = B + a%, B = C − b%; asked: % by which C is more/less than A. */
  | { form: 'three-way'; a: number; b: number }
  /** A = B + a%, B = C − b%, D = C + d%, D − A = diff (₹); asked: B's salary. */
  | { form: 'salary-chain'; a: number; b: number; d: number; diff: number }
  /** Successive signed % changes; asked: net % change (signed). */
  | { form: 'net-change'; changes: number[] }
  /** Start value and signed % changes; asked: final value. */
  | { form: 'final-value'; start: number; changes: number[] }
  /** Final value after signed % changes; asked: original value. */
  | { form: 'original-value'; final: number; changes: number[] }
  /** +first%, then an unknown decrease, then +last%; net % (signed) given; asked: the unknown decrease %. */
  | { form: 'unknown-change'; first: number; last: number; net: number }
  /** +up% then −down%; final is ₹drop less than original; asked: original. */
  | { form: 'drop-amount'; up: number; down: number; drop: number }
  /** Yearly signed % changes applied to start; asked: value at the end. */
  | { form: 'growth'; start: number; rates: number[] }
  /** Present value after yearly signed % changes; asked: value at the beginning. */
  | { form: 'years-ago'; present: number; rates: number[] }
  /** Birth and death rates (% per year, 1 dp), years; asked: population at the end. */
  | { form: 'birth-death'; start: number; birth: number; death: number; years: number }
  /** start grows to end in 2 years at a constant compound rate; asked: the rate %. */
  | { form: 'find-rate'; start: number; end: number }
  /** Grow rate% for a year, then `moved` people leave (negative = arrive), grow rate% again; asked: final. */
  | { form: 'migration'; start: number; rate: number; moved: number }
  /**
   * Two-candidate election. notVoted % of registered, invalid % of votes cast, winner % of valid votes
   * (or of all votes cast when base = 'total'). Asked quantity in `ask`.
   */
  | {
      form: 'election';
      winner: number;
      invalid: number;
      notVoted: number;
      base: 'valid' | 'total';
      margin: number;
      ask: 'total' | 'valid' | 'winner' | 'loser' | 'registered';
    }
  /** Three candidates: invalid %, A and B shares of valid votes; A beat B by margin; asked: C's votes. */
  | { form: 'election3'; invalid: number; a: number; b: number; margin: number }
  /** Two candidates, all valid: winner won by margin; if swing% of winner's votes moved, loser would win by reverse. Asked: total. */
  | { form: 'election-swing'; margin: number; swing: number; reverse: number }
  /** Spends the listed % of income (each on the whole income), saves `saving`; asked: income. */
  | { form: 'spend-heads'; heads: number[]; saving: number }
  /** Spends heads[0]% of income, heads[1]% of the remainder, …; saves `saving`; asked: income. */
  | { form: 'spend-chain'; heads: number[]; saving: number }
  /** Saves s% of income; income +a%, expenditure +b%; asked: % change in savings (signed). */
  | { form: 'savings-change'; s: number; a: number; b: number }
  /** Income (₹), saves s%; income +a%, expenditure +b%; asked: new savings (₹). */
  | { form: 'savings-new'; income: number; s: number; a: number; b: number }
  /** Incomes p:q, savings sA%, sB%; A's expenditure exceeds B's by diff; asked: A's income. */
  | { form: 'two-earners'; p: number; q: number; sA: number; sB: number; diff: number }
  /** Pass needs pass%; student got `got` marks and failed by `short`; asked: maximum marks. */
  | { form: 'pass-max'; pass: number; got: number; short: number }
  /** Student 1 scores a% and fails by `short`; student 2 scores b% and passes by `extra`. */
  | { form: 'two-students'; a: number; short: number; b: number; extra: number; ask: 'max' | 'pass-marks' | 'pass-pct' }
  /** Papers with maximum marks each; needs pass% of the aggregate; scored the first ones; asked: minimum in the last. */
  | { form: 'aggregate'; maxEach: number; papers: number; pass: number; scored: number[] }
  /** failA% failed subject A, failB% failed B, both% failed both; passedBoth students; asked: total. */
  | { form: 'fail-both'; failA: number; failB: number; both: number; passedBoth: number }
  /** A is p1% of B, B is p2% of C, C = value; asked: A. */
  | { form: 'of-chain'; p1: number; p2: number; value: number }
  /** p% of A = q% of B; the larger exceeds the smaller by diff; asked: A. */
  | { form: 'equal-parts'; p: number; q: number; diff: number }
  /** A = B + a%, B = b% of C, C = D + c%; asked: A as % of D. */
  | { form: 'mixed-chain'; a: number; b: number; c: number }
  /** girls%, girls opting%, boys opting%; notOpting students; asked: total. */
  | { form: 'composition'; girls: number; girlsOpt: number; boysOpt: number; notOpting: number }
  /** a% chose X, b% chose Y, the rest (`rest` people) chose Z; asked: how many more chose X than Y. */
  | { form: 'split-rest'; a: number; b: number; rest: number }
  /** a% by bus, b% by metro, c% of the remaining by car, the rest (`last` people) walk; asked: metro count. */
  | { form: 'split-nested'; a: number; b: number; c: number; last: number }
  /** a% like X, b% like Y, both% like both, `neither` people like neither; asked: how many like only X. */
  | { form: 'split-sets'; a: number; b: number; both: number; neither: number }
  /** men% of adults; gradM% of men and gradW% of women are graduates; `nonGradMen` given; asked: women graduates. */
  | { form: 'split-levels'; men: number; gradM: number; gradW: number; nonGradMen: number };

type Ctx = BuildContext;
type Res = GenResult<PercentageFacts>;

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const STD_PCTS: number[] = [
  4, 5, 6.25, 25 / 3, 100 / 11, 10, 100 / 9, 12.5, 100 / 7, 15, 50 / 3, 20, 25, 200 / 7, 30, 100 / 3, 37.5, 40,
  300 / 7, 45, 50, 60, 62.5, 200 / 3, 75, 80, 100, 125, 150, 200, 300,
];

/** Nearby "standard" percentages, used only as fillers after the documented mistakes. */
function nearPcts(ans: number, n = 5): Mist[] {
  const others = STD_PCTS.filter((v) => Math.abs(v - ans) > 1e-9);
  const below = others.filter((v) => v < ans).sort((a, b) => b - a).slice(0, n);
  const above = others.filter((v) => v > ans).sort((a, b) => a - b).slice(0, n);
  return [...below, ...above].map((value) => ({ value, why: 'filler: nearby standard fraction-percentage' }));
}

/** Signed change as words: −4 → "4% decrease", 0 → "No change". */
function signedPct(v: number): string {
  if (Math.abs(v) < 1e-9) return 'No change';
  return v < 0 ? `${fmtPct(-v)} decrease` : `${fmtPct(v)} increase`;
}

const prodF = (changes: number[]): Fr => changes.reduce<Fr>((acc, c) => fmul(acc, factor(fr(c))), fr(1));
const sgn = (c: number): string => (c >= 0 ? `+${c}%` : `−${-c}%`);
const facTex = (c: number): string => texFr(factor(fr(c)));
const num = (v: number): string => indian(v);
/** Short exact decimal for step text (inputs here always terminate). */
const dec = (v: number): string => String(Math.round(v * 10000) / 10000);
const isTwoDp = (v: number): boolean => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const whole = (v: number): boolean => Math.abs(v - Math.round(v)) < 1e-9;

const VILLAGES = ['Rampur', 'Sonpur', 'Kalyani', 'Devgarh', 'Nandgaon', 'Belur', 'Hosur', 'Madhavpur', 'Kishangarh', 'Pipariya'];
const TOWNS = ['Nashik', 'Guntur', 'Siliguri', 'Bhilai', 'Karnal', 'Hubballi', 'Jhansi', 'Bokaro', 'Tirunelveli', 'Udaipur'];

/** A start value that keeps every intermediate value whole. */
function wholeStart(rng: Ctx['rng'], changes: number[], lo: number, hi: number, base = 1): number {
  let unit = base;
  let acc = fr(1);
  for (const c of changes) {
    acc = fmul(acc, factor(fr(c)));
    unit = lcmAll([unit, acc[1]]);
  }
  return multipleIn(rng, lo, hi, unit);
}

/* ------------------------------------------------------------------ */
/* 1. Base change                                                      */
/* ------------------------------------------------------------------ */

const CMP_X: Record<'easy' | 'medium', Record<'more' | 'less', Fr[]>> = {
  easy: { more: [fr(20), fr(25), fr(50), fr(100)], less: [fr(20), fr(25), fr(50), fr(10)] },
  medium: {
    more: [fr(40), fr(60), fr(75), fr(150), fr(25, 2), fr(100, 3), fr(200, 3), fr(30)],
    less: [fr(40), fr(60), fr(25, 2), fr(100, 3), fr(50, 3), fr(75, 2), fr(30), fr(75)],
  },
};

function compare(ctx: Ctx, level: 'easy' | 'medium'): Res {
  const { rng } = ctx;
  const dir = rng.pick(['more', 'less'] as const);
  const x = rng.pick(CMP_X[level][dir]);
  const xf = fdiv(x, fr(100)); // x% as a fraction p/q
  const [p, q] = xf;
  const other = dir === 'more' ? q + p : q - p;
  const ans = toPct(fr(p, other));
  const ask = dir === 'more' ? 'less' : 'more';
  const [A, B] = pickPeople(rng, 2);
  const X = pctF(x);
  const ctxPick = rng.int(0, 3);
  const va = rng.pick(VILLAGES);
  const vb = rng.pick(VILLAGES.filter((v) => v !== va));
  const item = rng.pick(['ceiling fan', 'pressure cooker', 'school bag', 'mixer grinder', 'wall clock']);
  let prompt: string;
  let aThing: string;
  let bThing: string;
  if (ctxPick === 0) {
    prompt = `${A.name}'s monthly salary is ${X} ${dir} than ${B.name}'s monthly salary. By what percent is ${B.name}'s salary ${ask} than ${A.name}'s salary?`;
    aThing = `${A.name}'s salary`;
    bThing = `${B.name}'s salary`;
  } else if (ctxPick === 1) {
    prompt = `The population of village ${va} is ${X} ${dir} than the population of village ${vb}. By what percent is the population of ${vb} ${ask} than that of ${va}?`;
    aThing = `${va}'s population`;
    bThing = `${vb}'s population`;
  } else if (ctxPick === 2) {
    prompt = `The price of a ${item} at Shop P is ${X} ${dir} than its price at Shop Q. By what percent is the price at Shop Q ${ask} than the price at Shop P?`;
    aThing = 'the price at Shop P';
    bThing = 'the price at Shop Q';
  } else {
    prompt = `${A.name} scored ${X} ${dir === 'more' ? 'more' : 'fewer'} marks than ${B.name} in the half-yearly examination. By what percent are ${B.name}'s marks ${ask} than ${A.name}'s marks?`;
    aThing = `${A.name}'s marks`;
    bThing = `${B.name}'s marks`;
  }
  const wrongDen = dir === 'more' ? q - p : q + p;
  const mistakes: Mist[] = [
    {
      value: fval(x),
      why: 'wrong base: measured the difference against the other quantity',
      trap: `${X} is the "same percentage back" answer. It measures the gap against ${bThing}, but the question compares it with ${aThing}, which is ${dir === 'more' ? 'larger' : 'smaller'}.`,
    },
  ];
  if (wrongDen > 0) {
    const wrong = fval(toPct(fr(p, wrongDen)));
    mistakes.push({
      value: wrong,
      why: `used the formula for the opposite direction, x/(100 ${dir === 'more' ? '−' : '+'} x)`,
      trap: `${fmtPct(wrong)} comes from the opposite formula. When one value is ${dir} by x%, the other is ${ask} by $\\frac{x}{100 ${dir === 'more' ? '+' : '-'} x} \\times 100$, not $\\frac{x}{100 ${dir === 'more' ? '-' : '+'} x} \\times 100$.`,
    });
  }
  mistakes.push(...nearPcts(fval(ans)));
  return emit(ctx, {
    facts: { form: 'compare', dir, x },
    prompt,
    answer: fval(ans),
    format: fmtPct,
    mistakes,
    steps: [
      `${X} = ${texFr(xf)}, so take ${bThing} = ${q} units.`,
      `${cap(aThing)} = ${q} ${dir === 'more' ? '+' : '−'} ${p} = ${other} units.`,
      `The difference is ${p} unit${p === 1 ? '' : 's'}, and it must be compared with ${aThing} (${other} units).`,
      `Required percentage = $\\frac{${p}}{${other}} \\times 100$ = ${fmtPct(fval(ans))}.`,
    ],
    shortcut: `Fraction method: ${dir} by $\\frac{${p}}{${q}}$ means the other is ${ask} by $\\frac{${p}}{${q} ${dir === 'more' ? '+' : '-'} ${p}} = \\frac{${p}}{${other}}$, i.e. ${fmtPct(fval(ans))}.`,
    trap: `The base changes: the difference is the same, but it is divided by ${aThing}, not ${bThing}.`,
    tags: ['percent:base-change', 'trick:fraction-equivalent', 'trap:wrong-base'],
  });
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const CONS_X: Record<'rise' | 'fall', Fr[]> = {
  rise: [fr(20), fr(25), fr(50), fr(25, 2), fr(100, 3), fr(40), fr(60), fr(200, 3)],
  fall: [fr(20), fr(25), fr(10), fr(50, 3), fr(25, 2), fr(40), fr(75, 2), fr(100, 3)],
};

function consumption(ctx: Ctx): Res {
  const { rng } = ctx;
  const dir = rng.pick(['rise', 'fall'] as const);
  const x = rng.pick(CONS_X[dir]);
  const [p, q] = fdiv(x, fr(100));
  const other = dir === 'rise' ? q + p : q - p;
  const ans = toPct(fr(p, other));
  const good = rng.pick(['sugar', 'cooking oil', 'rice', 'tea leaves', 'pulses', 'milk']);
  const X = pctF(x);
  const prompt =
    dir === 'rise'
      ? `The price of ${good} rises by ${X}. By what percent must a family reduce its consumption of ${good} so that its expenditure on ${good} does not change?`
      : `The price of ${good} falls by ${X}. By what percent can a family increase its consumption of ${good} without changing its expenditure on ${good}?`;
  const wrongDen = dir === 'rise' ? q - p : q + p;
  const mistakes: Mist[] = [
    {
      value: fval(x),
      why: 'assumed consumption changes by the same percentage as price',
      trap: `${X} assumes consumption moves by the same percentage as price. Expenditure = price × consumption, so consumption must change by the reciprocal factor, which is a different percentage.`,
    },
  ];
  if (wrongDen > 0) {
    const wrong = fval(toPct(fr(p, wrongDen)));
    mistakes.push({
      value: wrong,
      why: 'used the formula for the opposite case (x/(100 ∓ x) swapped)',
      trap: `${fmtPct(wrong)} uses the formula for the opposite case. For a price ${dir} of x%, the change is $\\frac{x}{100 ${dir === 'rise' ? '+' : '-'} x} \\times 100$.`,
    });
  }
  mistakes.push(...nearPcts(fval(ans)));
  return emit(ctx, {
    facts: { form: 'consumption', dir, x },
    prompt,
    answer: fval(ans),
    format: fmtPct,
    mistakes,
    steps: [
      `Expenditure = price × consumption, and the expenditure must stay the same.`,
      `${X} = ${texFr(fr(p, q))}, so the new price = $\\frac{${other}}{${q}}$ of the old price.`,
      `Consumption must become $\\frac{${q}}{${other}}$ of the old consumption.`,
      `Change in consumption = $\\frac{${p}}{${other}}$ = ${fmtPct(fval(ans))} (${dir === 'rise' ? 'decrease' : 'increase'}).`,
    ],
    shortcut: `If one factor of a fixed product ${dir === 'rise' ? 'rises' : 'falls'} by $\\frac{${p}}{${q}}$, the other ${dir === 'rise' ? 'falls' : 'rises'} by $\\frac{${p}}{${other}}$ (numerator stays, denominator becomes ${q} ${dir === 'rise' ? '+' : '−'} ${p}).`,
    trap: `Consumption does not change by the same ${X}; the reciprocal factor gives a different percentage.`,
    tags: ['percent:base-change', 'percent:consumption-expenditure', 'trick:fraction-equivalent'],
  });
}

function priceSpend(ctx: Ctx): Res {
  const { rng } = ctx;
  const combos: [number, number, number][] = [];
  for (const p of [20, 25, 40, 50, 60]) {
    for (const c of [4, 5, 6, 8, 10, 12, 15, 16, 20, 25, 30]) {
      const e = ((100 + p) * (100 - c)) / 100 - 100;
      if (Number.isInteger(e) && e > 0 && e < p && p - e !== c) combos.push([p, c, e]);
    }
  }
  const [p, c, e] = rng.pick(combos);
  const good = rng.pick(['rice', 'wheat flour', 'cooking oil', 'petrol', 'sugar']);
  const newCons = fr(100 + e, 100 + p);
  const wrongBase = fval(toPct(fr(p - e, 100 + e)));
  const noSpend = fval(toPct(fr(p, 100 + p)));
  return emit(ctx, {
    facts: { form: 'price-spend', price: p, spend: e },
    prompt: `The price of ${good} goes up by ${p}%, and a household's monthly expenditure on ${good} goes up by only ${e}%. By what percent has the household reduced its consumption of ${good}?`,
    answer: c,
    format: fmtPct,
    mistakes: [
      {
        value: p - e,
        why: 'subtracted the two percentages directly',
        trap: `${p - e}% just subtracts ${e} from ${p}. Consumption = expenditure ÷ price, so the factors must be divided: $\\frac{${100 + e}}{${100 + p}}$.`,
      },
      { value: wrongBase, why: 'divided the gap by the new expenditure (wrong base)' },
      {
        value: noSpend,
        why: 'ignored the rise in expenditure (treated expenditure as unchanged)',
        trap: `${fmtPct(noSpend)} would be right only if the expenditure had stayed the same; here it rose by ${e}%.`,
      },
      ...nearPcts(c),
    ],
    steps: [
      `Consumption = expenditure ÷ price.`,
      `Price factor = $\\frac{${100 + p}}{100}$; expenditure factor = $\\frac{${100 + e}}{100}$.`,
      `New consumption = $\\frac{${100 + e}}{${100 + p}}$ of the old = ${texFr(newCons)} of the old consumption.`,
      `Decrease = 1 − ${texFr(newCons)} = ${texFr(fsub(fr(1), newCons))} = ${c}%.`,
    ],
    shortcut: `Work with factors: consumption factor = ${dec((100 + e) / 100)} ÷ ${dec((100 + p) / 100)} = ${dec(fval(newCons))}, so it fell by ${c}%.`,
    trap: `Percentages on different bases cannot be subtracted; divide the factors instead.`,
    tags: ['percent:base-change', 'percent:consumption-expenditure', 'trap:subtracting-percentages'],
  });
}

function threeWay(ctx: Ctx): Res {
  const { rng } = ctx;
  const combos: [number, number][] = [];
  for (const a of [10, 20, 25, 50, 60, 100]) {
    for (const b of [10, 20, 25, 40, 50, 60]) {
      if (a === b) continue;
      const k = fr((100 + a) * (100 - b), 100);
      if (k[0] === 100 * k[1]) continue;
      const ansF = toPct(fdiv(fabs(fsub(fr(100), k)), k));
      if (ansF[1] <= 13 && fval(ansF) < 100 && Math.abs(fval(ansF) - Math.abs(a - b)) > 1e-9) combos.push([a, b]);
    }
  }
  const [a, b] = rng.pick(combos);
  const k = fr((100 + a) * (100 - b), 100); // A per 100 of C
  const cMore = fval(k) < 100;
  const gap = fabs(fsub(fr(100), k));
  const ans = fval(toPct(fdiv(gap, k)));
  const [A, B, C] = pickPeople(rng, 3);
  return emit(ctx, {
    facts: { form: 'three-way', a, b },
    prompt: `${A.name}'s monthly income is ${a}% more than ${B.name}'s, and ${B.name}'s monthly income is ${b}% less than ${C.name}'s. By what percent is ${C.name}'s income ${cMore ? 'more' : 'less'} than ${A.name}'s income?`,
    answer: ans,
    format: fmtPct,
    mistakes: [
      {
        value: Math.abs(a - b),
        why: 'combined the percentages directly as if they had the same base',
        trap: `${Math.abs(a - b)}% combines ${a}% and ${b}% directly, but they are taken on different people's incomes.`,
      },
      {
        value: fval(gap),
        why: `measured the gap against ${C.name}'s income instead of ${A.name}'s`,
        trap: `${fmtPct(fval(gap))} is the gap as a percentage of ${C.name}'s income; the question compares with ${A.name}'s income.`,
      },
      ...nearPcts(ans),
    ],
    steps: [
      `Take ${C.name}'s income = 100.`,
      `${B.name}'s income = 100 − ${b}% of 100 = ${100 - b}.`,
      `${A.name}'s income = ${100 - b} + ${a}% of ${100 - b} = ${dec(fval(k))}.`,
      `${C.name}'s income is ${dec(fval(gap))} ${cMore ? 'more' : 'less'} than ${A.name}'s ${dec(fval(k))}.`,
      `Required % = $\\frac{${dec(fval(gap))}}{${dec(fval(k))}} \\times 100$ = ${fmtPct(ans)}.`,
    ],
    shortcut: `Put everyone on one base (${C.name} = 100), then compare with the person named after "than" — here ${A.name}.`,
    trap: `The answer is measured on ${A.name}'s income, not on ${C.name}'s.`,
    tags: ['percent:base-change', 'percent:chain', 'trap:wrong-base'],
  });
}

function salaryChain(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('salary-chain', 200, () => {
    const a = rng.pick([20, 25, 50]);
    const b = rng.pick([20, 25, 40]);
    const d = rng.pick([10, 20, 25, 30, 50]);
    const kA = fmul(factor(fr(a)), factor(fr(-b))); // A per unit of C
    const kB = factor(fr(-b));
    const kD = factor(fr(d));
    const kDiff = fsub(kD, kA);
    if (!(fval(kDiff) > 0)) return null;
    const unit = lcmAll([kA[1], kB[1], kD[1], kDiff[1]]) * 100;
    const Cs = multipleIn(rng, 20000, 90000, unit);
    const B = scale(Cs, kB);
    const diff = scale(Cs, kDiff);
    if (diff < 1000 || !whole(diff) || !whole(B)) return null;
    const A = scale(Cs, kA);
    const D = scale(Cs, kD);
    const [P, Q, R, S] = pickPeople(rng, 4);
    const kAadd = fr(100 + a - b, 100);
    const kDiffAdd = fsub(kD, kAadd);
    const addB = fval(kDiffAdd) > 0 ? scale(diff, fmul(kB, fdiv(fr(1), kDiffAdd))) : -1;
    const mistakes: Mist[] = [
      { value: Cs, why: `stopped at ${R.name}'s salary`, trap: `${rs(Cs)} is ${R.name}'s salary — the base you solve for first. The question asks for ${Q.name}'s.` },
      { value: A, why: `gave ${P.name}'s salary` },
      { value: D, why: `gave ${S.name}'s salary` },
    ];
    if (whole(addB) && addB > 0) {
      mistakes.push({ value: addB, why: 'added a% and b% as if on the same base', trap: `${rs(addB)} comes from writing ${P.name} = ${R.name} × (1 + ${a}% − ${b}%); successive percentages multiply, they do not add.` });
    }
    return emit(ctx, {
      facts: { form: 'salary-chain', a, b, d, diff },
      prompt: `${P.name}'s monthly salary is ${a}% more than ${Q.name}'s. ${Q.name}'s salary is ${b}% less than ${R.name}'s, and ${S.name}'s salary is ${d}% more than ${R.name}'s. If ${S.name} earns ${rs(diff)} more than ${P.name} every month, what is ${Q.name}'s monthly salary?`,
      answer: B,
      format: rs,
      mistakes,
      steps: [
        `Take ${R.name}'s salary = 100 units.`,
        `${Q.name} = 100 − ${b} = ${100 - b} units.`,
        `${P.name} = ${100 - b} + ${a}% of ${100 - b} = ${dec(fval(kA) * 100)} units.`,
        `${S.name} = 100 + ${d} = ${100 + d} units.`,
        `${S.name} − ${P.name} = ${dec(fval(kDiff) * 100)} units = ${rs(diff)}, so 1 unit = ${rs(Cs / 100)}.`,
        `${Q.name}'s salary = ${100 - b} units = ${rs(B)}.`,
      ],
      shortcut: `Express all four salaries as units of ${R.name}'s salary (= 100); the given ₹ difference fixes the value of one unit.`,
      trap: `Stop at the right person: after finding the unit value, convert ${Q.name}'s ${100 - b} units, not ${R.name}'s 100.`,
      tags: ['percent:base-change', 'percent:chain', 'level:multi-step'],
    });
  });
}

function baseChange(ctx: Ctx): Res {
  const { rng, difficulty } = ctx;
  if (difficulty === 'easy') return compare(ctx, 'easy');
  if (difficulty === 'medium') return rng.chance(0.5) ? consumption(ctx) : compare(ctx, 'medium');
  if (difficulty === 'hard') return rng.chance(0.5) ? priceSpend(ctx) : threeWay(ctx);
  return salaryChain(ctx);
}

/* ------------------------------------------------------------------ */
/* 2. Successive change                                                */
/* ------------------------------------------------------------------ */

function netTwoUp(ctx: Ctx): Res {
  const { rng } = ctx;
  const a = rng.pick([10, 20, 25, 30, 40, 50]);
  const b = rng.pick([10, 20, 25, 30, 40, 50]);
  const net = a + b + (a * b) / 100;
  const item = rng.pick(['air cooler', 'refrigerator', 'washing machine', 'scooter', 'sewing machine']);
  const prompt = rng.chance(0.5)
    ? `The price of a ${item} was increased by ${a}% in January and again by ${b}% in June. What is the net percentage change in its price?`
    : `A company's sales grew by ${a}% in 2024 and by a further ${b}% in 2025. What is the overall percentage change in sales over the two years?`;
  return emit(ctx, {
    facts: { form: 'net-change', changes: [a, b] },
    prompt,
    answer: net,
    format: signedPct,
    allowNegative: true,
    step: Number.isInteger(net) ? 2 : 2.5,
    mistakes: [
      { value: a + b, why: 'added the two percentages directly', trap: `${a + b}% simply adds ${a}% and ${b}%. The second increase acts on the already-increased value, so an extra ${a} × ${b}/100 = ${dec((a * b) / 100)}% appears.` },
      { value: a + b - (a * b) / 100, why: 'subtracted the product term instead of adding it' },
    ],
    steps: [
      `Successive change: net = a + b + $\\frac{ab}{100}$.`,
      `= ${a} + ${b} + $\\frac{${a} \\times ${b}}{100}$`,
      `= ${a + b} + ${dec((a * b) / 100)} = ${fmtPct(net)} increase.`,
    ],
    shortcut: `a + b + ab/100 (or multiply factors: ${facTex(a)} × ${facTex(b)} = ${texFr(prodF([a, b]))}).`,
    trap: `Percentages of successive changes are never simply added — the second one is taken on the new value.`,
    tags: ['percent:successive-change', 'trick:a-plus-b-plus-ab-by-100'],
  });
}

function upDownSame(ctx: Ctx): Res {
  const { rng } = ctx;
  const a = rng.pick([10, 20, 25, 30, 40, 50]);
  const net = -(a * a) / 100;
  const [P] = pickPeople(rng, 1);
  const prompt = rng.chance(0.5)
    ? `${P.name}'s salary was increased by ${a}% and a few months later it was reduced by ${a}%. What is the net percentage change in ${his(P)} salary?`
    : `A shopkeeper first raised the price of a table fan by ${a}% and later reduced the new price by ${a}%. What is the net percentage change in the price?`;
  return emit(ctx, {
    facts: { form: 'net-change', changes: [a, -a] },
    prompt,
    answer: net,
    format: signedPct,
    allowNegative: true,
    step: a <= 10 ? 0.5 : 1,
    mistakes: [
      { value: 0, why: 'assumed +a% and −a% cancel out', trap: `"No change" assumes the ${a}% rise and the ${a}% fall cancel. The fall is taken on the larger, increased value, so there is a net loss.` },
      { value: -net, why: 'right size, wrong direction' },
      { value: 2 * net, why: 'doubled the product term' },
      { value: -a / 10, why: 'took a/10 instead of a²/100' },
    ],
    steps: [
      `Net change = a + b + $\\frac{ab}{100}$ with a = +${a}, b = −${a}.`,
      `= ${a} − ${a} − $\\frac{${a} \\times ${a}}{100}$`,
      `= −${fmtPct(-net)}, i.e. a ${fmtPct(-net)} decrease.`,
    ],
    shortcut: `Equal rise and fall of x% always give a net fall of x²/100 % = ${fmtPct(-net)}.`,
    trap: `The rise and the fall are on different bases, so they cannot cancel.`,
    tags: ['percent:successive-change', 'trick:x-squared-by-100'],
  });
}

const ITEMS_VAL: { name: string; lo: number; hi: number }[] = [
  { name: 'scooter', lo: 50000, hi: 120000 },
  { name: 'LED television', lo: 20000, hi: 60000 },
  { name: 'refrigerator', lo: 15000, hi: 45000 },
  { name: 'laptop', lo: 30000, hi: 80000 },
  { name: 'motorcycle', lo: 60000, hi: 150000 },
];

function finalValue(ctx: Ctx, changes: number[]): Res {
  const { rng } = ctx;
  const it = rng.pick(ITEMS_VAL);
  const start = wholeStart(rng, changes, it.lo, it.hi, 100);
  const vals = [start];
  for (const c of changes) vals.push((vals[vals.length - 1] * (100 + c)) / 100);
  const fin = vals[vals.length - 1];
  const sum = changes.reduce((s, c) => s + c, 0);
  const words = listAnd(changes.map((c, i) => `${i === changes.length - 1 && i > 0 ? 'then ' : ''}${c > 0 ? 'increased' : 'decreased'} by ${Math.abs(c)}%`));
  const prompt = `The price of a ${it.name} was ${rs(start)}. It was ${words}. What is its final price?`;
  const added = (start * (100 + sum)) / 100;
  return emit(ctx, {
    facts: { form: 'final-value', start, changes },
    prompt,
    answer: fin,
    format: rs,
    mistakes: [
      { value: added, why: 'added the percentage changes before applying them', trap: `${rs(added)} applies a single ${sgn(sum)} change; each change acts on the price left by the previous one.` },
      { value: vals[vals.length - 2], why: 'missed the last change' },
      { value: Math.abs(fin - start), why: 'gave the change in price instead of the final price' },
      { value: (start * (100 - sum)) / 100, why: 'reversed the sign of the net change' },
    ],
    steps: [
      `Start: ${rs(start)}.`,
      ...changes.map((c, i) => `${sgn(c)}: ${rs(vals[i])} × ${facTex(c)} = ${rs(vals[i + 1])}.`),
      `Final price = ${rs(fin)}.`,
    ],
    shortcut: `Multiply the factors once: ${rs(start)} × ${changes.map(facTex).join(' × ')} = ${rs(fin)}.`,
    trap: `Each percentage acts on the new price, so the changes cannot be added first.`,
    tags: ['percent:successive-change', 'trick:multiplying-factors'],
    visual: { type: 'grid', columns: ['Stage', 'Change', 'Price'], rows: [['Start', '—', rs(start)], ...changes.map((c, i) => [`Step ${i + 1}`, sgn(c), rs(vals[i + 1])])] },
  });
}

function originalValue(ctx: Ctx, changes: number[]): Res {
  const { rng } = ctx;
  const [P] = pickPeople(rng, 1);
  const start = wholeStart(rng, changes, 18000, 90000, 100);
  const vals = [start];
  for (const c of changes) vals.push((vals[vals.length - 1] * (100 + c)) / 100);
  const fin = vals[vals.length - 1];
  const sum = changes.reduce((s, c) => s + c, 0);
  const words = changes.map((c) => `${c > 0 ? 'a raise' : 'a cut'} of ${Math.abs(c)}%`).join(', followed by ');
  const reversed = changes.reduce((v, c) => (v * (100 - c)) / 100, fin);
  return emit(ctx, {
    facts: { form: 'original-value', final: fin, changes },
    prompt: `After ${words}, ${P.name}'s monthly salary became ${rs(fin)}. What was ${his(P)} salary before these changes?`,
    answer: start,
    format: rs,
    mistakes: [
      {
        value: reversed,
        why: 'undid each change by applying the opposite percentage to the new value',
        trap: `${rs(reversed)} reverses each change by the same percentage on the final salary. A change of ${sgn(changes[0])} is undone by dividing by ${facTex(changes[0])}, not by applying the opposite percentage.`,
      },
      { value: (fin * 100) / (100 + sum), why: 'combined the changes by adding them' },
      { value: vals[1], why: 'gave the salary after the first change' },
      { value: vals[vals.length - 2], why: 'undid only the last change' },
    ],
    steps: [
      `Let the original salary be S.`,
      `S × ${changes.map(facTex).join(' × ')} = ${rs(fin)}.`,
      `Combined factor = ${texFr(prodF(changes))}.`,
      `S = ${rs(fin)} ÷ ${texFr(prodF(changes))} = ${rs(start)}.`,
    ],
    shortcut: `Divide the final value by the product of the factors (or check the options forward: only ${rs(start)} gives ${rs(fin)}).`,
    trap: `A percentage change is undone by dividing by its factor, not by applying the opposite percentage.`,
    tags: ['percent:successive-change', 'percent:reverse'],
  });
}

function areaChange(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('area-change', 100, () => {
    const a = rng.pick([10, 20, 25, 30, 40, 50]);
    const b = rng.pick([-10, -20, -25, -30, -40, 10, 20]);
    if (a === -b) return null;
    const net = a + b + (a * b) / 100;
    if (net === 0) return null;
    return emit(ctx, {
      facts: { form: 'net-change', changes: [a, b] },
      prompt: `The length of a rectangular plot is increased by ${a}% and its breadth is ${b > 0 ? 'increased' : 'decreased'} by ${Math.abs(b)}%. What is the percentage change in the area of the plot?`,
      answer: net,
      format: signedPct,
      allowNegative: true,
      step: Number.isInteger(net) ? 2 : 0.5,
      mistakes: [
        { value: a + b, why: 'added the two percentage changes', trap: `${signedPct(a + b)} just adds ${sgn(a)} and ${sgn(b)}. Area = length × breadth, so the factors multiply and the cross term ${dec((a * b) / 100)}% appears.` },
        { value: a + b - (a * b) / 100, why: 'wrong sign on the product term' },
        { value: -net, why: 'right size, wrong direction' },
      ],
      steps: [
        `Area = length × breadth, so use a + b + $\\frac{ab}{100}$ with a = ${sgn(a)}, b = ${sgn(b)}.`,
        `= ${a} ${b >= 0 ? '+' : '−'} ${Math.abs(b)} ${a * b >= 0 ? '+' : '−'} $\\frac{${a} \\times ${Math.abs(b)}}{100}$`,
        `= ${net > 0 ? '+' : '−'}${fmtPct(Math.abs(net))}, i.e. a ${signedPct(net).toLowerCase()} in area.`,
      ],
      shortcut: `Factors: ${facTex(a)} × ${facTex(b)} = ${texFr(prodF([a, b]))} → ${signedPct(net).toLowerCase()}.`,
      trap: `Length and breadth changes multiply; the product term is what the direct sum misses.`,
      tags: ['percent:successive-change', 'percent:area-change'],
    });
  });
}

function netThree(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('net-three', 300, () => {
    const changes = [rng.pick([10, 20, 25, 50]), rng.pick([-10, -20, -25, -40, -50]), rng.pick([10, 20, 25, -10, -20])];
    const f = prodF(changes);
    const net = fval(fsub(toPct(f), fr(100)));
    if (Math.abs(net) < 1e-9 || !isTwoDp(net) || Math.abs(net) > 60) return null;
    const sum = changes.reduce((s, c) => s + c, 0);
    if (Math.abs(sum - net) < 1e-9) return null;
    const words = listAnd(changes.map((c, i) => `${c > 0 ? 'rose' : 'fell'} by ${Math.abs(c)}% in ${2023 + i}`));
    const two = fval(prodF(changes.slice(0, 2))) * 100 - 100;
    return emit(ctx, {
      facts: { form: 'net-change', changes },
      prompt: `The number of passengers using a city bus route ${words}. What is the net percentage change in the number of passengers over the three years?`,
      answer: net,
      format: signedPct,
      allowNegative: true,
      step: Number.isInteger(net) ? 1 : 0.5,
      mistakes: [
        { value: sum, why: 'added the three percentage changes', trap: `${signedPct(sum)} adds the three changes; each one acts on the previous year's figure, so the factors must be multiplied.` },
        { value: -net, why: 'right size, wrong direction' },
        { value: two, why: 'stopped after two years' },
      ],
      steps: [
        `Factors: ${changes.map(facTex).join(' × ')}.`,
        `Product = ${texFr(f)} = ${dec(fval(f) * 100)}% of the original.`,
        `Net change = ${dec(fval(f) * 100)}% − 100% = ${signedPct(net).toLowerCase()}.`,
      ],
      shortcut: `Take 100 and apply each change in turn: ${[100, ...changes.map((_, i) => fval(prodF(changes.slice(0, i + 1))) * 100)].map(dec).join(' → ')}.`,
      trap: `Three successive changes never add up; chain them on 100.`,
      tags: ['percent:successive-change', 'trick:base-100'],
    });
  });
}

function unknownChange(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('unknown-change', 400, () => {
    const first = rng.pick([20, 25, 40, 50, 60]);
    const x = rng.pick([10, 12, 15, 16, 20, 25, 30, 36, 40]);
    const last = rng.pick([5, 10, 20, 25]);
    const netPct = fsub(toPct(fmul(fmul(factor(fr(first)), factor(fr(-x))), factor(fr(last)))), fr(100));
    if (netPct[1] !== 1 || netPct[0] === 0) return null;
    const net = netPct[0];
    const item = rng.pick(['scooter', 'mobile phone', 'washing machine', 'air conditioner']);
    const additive = first + last - net;
    const noLast = fval(toPct(fsub(fr(1), fdiv(factor(fr(net)), factor(fr(first))))));
    return emit(ctx, {
      facts: { form: 'unknown-change', first, last, net },
      prompt: `The price of a ${item} was first raised by ${first}%. It was then reduced by a certain percentage, and finally raised again by ${last}%. Overall, the price ${net > 0 ? 'rose' : 'fell'} by ${Math.abs(net)}%. By what percent was the price reduced?`,
      answer: x,
      format: fmtPct,
      mistakes: [
        { value: additive, why: 'solved first − x + last = net by adding percentages', trap: `${fmtPct(additive)} treats the three changes as additive (${first} − x + ${last} = ${net}). They multiply: ${facTex(first)} × (1 − x/100) × ${facTex(last)} = ${facTex(net)}.` },
        { value: noLast, why: 'ignored the last increase' },
        ...nearPcts(x),
      ],
      steps: [
        `Let the reduction be x%. Take the starting price = 100.`,
        `After +${first}%: ${100 + first}.`,
        `After −x% and +${last}%: ${100 + first} × (1 − x/100) × ${facTex(last)} = ${100 + net}.`,
        `1 − x/100 = ${100 + net} ÷ (${100 + first} × ${facTex(last)}) = ${texFr(factor(fr(-x)))}.`,
        `x = ${x}%.`,
      ],
      shortcut: `Divide the overall factor by the known factors: ${facTex(net)} ÷ (${facTex(first)} × ${facTex(last)}) = ${texFr(factor(fr(-x)))} → a ${x}% cut.`,
      trap: `Successive percentages multiply; solving them as a sum gives a wrong cut.`,
      tags: ['percent:successive-change', 'percent:reverse', 'level:multi-step'],
    });
  });
}

function dropAmount(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('drop-amount', 200, () => {
    const up = rng.pick([10, 20, 25, 30]);
    const down = rng.pick([20, 25, 30, 40]);
    const f = fmul(factor(fr(up)), factor(fr(-down)));
    if (!(fval(f) < 1)) return null;
    const lossF = fsub(fr(1), f);
    const start = multipleIn(rng, 20000, 90000, lcmAll([lossF[1], f[1], factor(fr(up))[1]]) * 50);
    const drop = scale(start, lossF);
    if (!whole(drop) || drop < 500) return null;
    const additive = down - up > 0 ? (drop * 100) / (down - up) : -1;
    const item = rng.pick(['laptop', 'refrigerator', 'LED television', 'scooter']);
    const mistakes: Mist[] = [];
    if (whole(additive) && additive > 0) {
      mistakes.push({ value: additive, why: 'took the net change as the plain difference of the percentages', trap: `${rs(additive)} treats the net fall as ${down}% − ${up}% = ${down - up}%. The real net fall is ${up} − ${down} − ${dec((up * down) / 100)} = ${dec(fval(lossF) * 100)}%.` });
    }
    mistakes.push({ value: start - drop, why: 'gave the final price' }, { value: scale(start, factor(fr(up))), why: 'gave the price after the increase' });
    return emit(ctx, {
      facts: { form: 'drop-amount', up, down, drop },
      prompt: `The price of a ${item} was increased by ${up}% and then the new price was reduced by ${down}%. The final price is ${rs(drop)} less than the original price. What was the original price?`,
      answer: start,
      format: rs,
      mistakes,
      steps: [
        `Take the original price = 100.`,
        `After +${up}%: ${100 + up}; after −${down}%: ${dec(fval(f) * 100)}.`,
        `Fall = 100 − ${dec(fval(f) * 100)} = ${dec(fval(lossF) * 100)}% of the original.`,
        `${dec(fval(lossF) * 100)}% of the price = ${rs(drop)}.`,
        `Original price = ${rs(drop)} × 100 ÷ ${dec(fval(lossF) * 100)} = ${rs(start)}.`,
      ],
      shortcut: `Net change = ${up} − ${down} − ${up} × ${down}/100 = −${dec(fval(lossF) * 100)}%; then ${rs(drop)} ÷ ${dec(fval(lossF) * 100)}%.`,
      trap: `The net fall is not ${down - up}%; the product term must be included.`,
      tags: ['percent:successive-change', 'percent:reverse', 'level:multi-step'],
    });
  });
}

/** No run of consecutive changes may cancel out (e.g. −20% then +25%), or a distractor would equal a given. */
function noCancel(changes: number[]): boolean {
  for (let i = 0; i < changes.length; i++) {
    for (let j = i + 2; j <= changes.length; j++) {
      const f = prodF(changes.slice(i, j));
      if (f[0] === f[1]) return false;
    }
  }
  return true;
}

function pickChanges(ctx: Ctx, pools: number[][]): number[] {
  return attempt('changes', 100, () => {
    const c = pools.map((p) => ctx.rng.pick(p));
    return noCancel(c) ? c : null;
  });
}

function successive(ctx: Ctx): Res {
  const { rng, difficulty } = ctx;
  if (difficulty === 'easy') return rng.chance(0.55) ? netTwoUp(ctx) : upDownSame(ctx);
  if (difficulty === 'medium') {
    const k = rng.int(0, 2);
    if (k === 0) return finalValue(ctx, pickChanges(ctx, [[10, 15, 20, 25], [-10, -20, -25, 10, 20]]));
    if (k === 1) return originalValue(ctx, pickChanges(ctx, [[10, 20, 25], [10, 20, 25, -10, -20]]));
    return areaChange(ctx);
  }
  if (difficulty === 'hard') {
    const k = rng.int(0, 2);
    if (k === 0) return netThree(ctx);
    if (k === 1) return finalValue(ctx, pickChanges(ctx, [[10, 20, 25], [-10, -20, -25], [10, 20, 5]]));
    return originalValue(ctx, pickChanges(ctx, [[10, 20, 25], [-10, -20], [10, 20, 25]]));
  }
  return rng.chance(0.5) ? unknownChange(ctx) : dropAmount(ctx);
}

/* ------------------------------------------------------------------ */
/* 3. Population growth / depreciation                                 */
/* ------------------------------------------------------------------ */

type GrowthKind = 'town' | 'machine';
const ORD = ['first', 'second', 'third'];

function growthStory(kind: GrowthKind, place: string, what: string, rates: number[], start: number): string {
  const same = rates.every((r) => r === rates[0]);
  if (kind === 'town') {
    const rateText = same
      ? `increases by ${rates[0]}% every year`
      : listAnd(rates.map((r, i) => `${r > 0 ? 'increases' : 'decreases'} by ${Math.abs(r)}% in the ${ORD[i]} year`));
    return `The population of ${place} is ${num(start)}. If it ${rateText}, what will the population be after ${rates.length} years?`;
  }
  const rateText = same
    ? `depreciates by ${Math.abs(rates[0])}% every year`
    : listAnd(rates.map((r, i) => `${r < 0 ? 'depreciates' : 'appreciates'} by ${Math.abs(r)}% in the ${ORD[i]} year`));
  return `A ${what} was bought for ${rs(start)}. If its value ${rateText}, what will its value be after ${rates.length} years?`;
}

function growth(ctx: Ctx, kind: GrowthKind, rates: number[]): Res {
  const { rng } = ctx;
  const place = rng.pick(TOWNS);
  const what = rng.pick(['tractor', 'printing machine', 'delivery van', 'generator set', 'flour mill machine']);
  const start = kind === 'town' ? wholeStart(rng, rates, 20000, 90000, 100) : wholeStart(rng, rates, 150000, 900000, 1000);
  const vals = [start];
  for (const r of rates) vals.push((vals[vals.length - 1] * (100 + r)) / 100);
  const fin = vals[vals.length - 1];
  const n = rates.length;
  const sum = rates.reduce((s, r) => s + r, 0);
  const fmt = kind === 'town' ? num : rs;
  const oneMore = (fin * (100 + rates[n - 1])) / 100;
  const simple = (start * (100 + sum)) / 100;
  const mistakes: Mist[] = [
    { value: simple, why: 'simple (not compound) change: added the yearly rates', trap: `${fmt(simple)} applies ${sgn(sum)} once, like simple interest. Each year's change is on the previous year's figure.` },
    { value: vals[n - 1], why: 'one year too few' },
    { value: oneMore, why: 'one year too many' },
  ];
  if (kind === 'machine') {
    mistakes.push(
      { value: rates.reduce((v, r) => (v * (100 - r)) / 100, start), why: 'treated depreciation as growth' },
      { value: Math.abs(fin - start), why: 'gave the total depreciation instead of the value' },
    );
  }
  return emit(ctx, {
    facts: { form: 'growth', start, rates },
    prompt: growthStory(kind, place, what, rates, start),
    answer: fin,
    format: fmt,
    mistakes,
    steps: [
      `Start: ${fmt(start)}.`,
      ...rates.map((r, i) => `Year ${i + 1} (${sgn(r)}): ${fmt(vals[i])} × ${facTex(r)} = ${fmt(vals[i + 1])}.`),
      `After ${n} years: ${fmt(fin)}.`,
    ],
    shortcut: `Compound change: multiply by every yearly factor — ${fmt(start)} × ${rates.map(facTex).join(' × ')}.`,
    trap: `Growth and depreciation compound: each year's rate acts on the previous year's value.`,
    tags: ['percent:population', kind === 'town' ? 'percent:growth' : 'percent:depreciation', 'trick:multiplying-factors'],
    visual: { type: 'grid', columns: ['Year', 'Change', kind === 'town' ? 'Population' : 'Value'], rows: [['0', '—', fmt(start)], ...rates.map((r, i) => [String(i + 1), sgn(r), fmt(vals[i + 1])])] },
  });
}

function yearsAgo(ctx: Ctx, rates: number[]): Res {
  const { rng } = ctx;
  const place = rng.pick(TOWNS);
  const start = wholeStart(rng, rates, 20000, 80000, 100);
  const vals = [start];
  for (const r of rates) vals.push((vals[vals.length - 1] * (100 + r)) / 100);
  const present = vals[vals.length - 1];
  const n = rates.length;
  const reversed = rates.reduce((v, r) => (v * (100 - r)) / 100, present);
  const same = rates.every((r) => r === rates[0]);
  const history = same
    ? `The population has been increasing at ${rates[0]}% per year.`
    : `Over the last ${n} years, the population increased by ${listAnd(rates.map((r) => `${r}%`))} in successive years.`;
  return emit(ctx, {
    facts: { form: 'years-ago', present, rates },
    prompt: `The present population of ${place} is ${num(present)}. ${history} What was the population ${n} years ago?`,
    answer: start,
    format: num,
    mistakes: [
      { value: reversed, why: 'reduced the present population by the same percentages instead of dividing', trap: `${num(reversed)} subtracts the percentages from today's figure. Going back in time means dividing by each factor, because every increase was taken on the smaller, older figure.` },
      { value: vals[n - 1], why: 'went back only one year' },
      { value: (present * 100) / (100 + rates.reduce((s, r) => s + r, 0)), why: 'removed simple (added) growth' },
    ],
    steps: [
      `Let the population ${n} years ago be P.`,
      `P × ${rates.map(facTex).join(' × ')} = ${num(present)}.`,
      `P = ${num(present)} ÷ ${texFr(prodF(rates))} = ${num(start)}.`,
    ],
    shortcut: `Past value = present ÷ (product of the yearly factors) — here divide by ${texFr(prodF(rates))}.`,
    trap: `Undo growth by dividing by the factor, not by subtracting the same percentage.`,
    tags: ['percent:population', 'percent:reverse'],
  });
}

function birthDeath(ctx: Ctx): Res {
  const { rng } = ctx;
  const net = rng.pick([2, 4, 5, 10]);
  const death = rng.pick([0.8, 1.2, 1.4, 1.6, 1.8]);
  const birth = Math.round((net + death) * 10) / 10;
  const start = wholeStart(rng, [net, net], 20000, 90000, 100);
  const y1 = (start * (100 + net)) / 100;
  const fin = (y1 * (100 + net)) / 100;
  const place = rng.pick(TOWNS);
  return emit(ctx, {
    facts: { form: 'birth-death', start, birth, death, years: 2 },
    prompt: `The population of ${place} is ${num(start)}. Every year the birth rate is ${birth}% and the death rate is ${death}% of the population at the start of that year. What will the population be after 2 years?`,
    answer: fin,
    format: num,
    mistakes: [
      { value: (start * (100 + 2 * net)) / 100, why: 'net growth added simply for two years', trap: `${num((start * (100 + 2 * net)) / 100)} adds ${2 * net}% once; the second year's growth is on the grown population.` },
      { value: y1, why: 'one year only' },
      { value: (start * (100 + birth) * (100 + birth)) / 10000, why: 'used only the birth rate' },
      { value: (start * (100 + birth + death) * (100 + birth + death)) / 10000, why: 'added the death rate instead of subtracting it' },
      { value: fin - start, why: 'gave only the increase' },
    ],
    steps: [
      `Net growth rate = ${birth}% − ${death}% = ${net}% per year.`,
      `After 1 year: ${num(start)} × ${facTex(net)} = ${num(y1)}.`,
      `After 2 years: ${num(y1)} × ${facTex(net)} = ${num(fin)}.`,
    ],
    shortcut: `Net rate = birth − death = ${net}%; then compound it: ${num(start)} × ${texFr(prodF([net, net]))}.`,
    trap: `Deaths reduce the population — subtract the death rate, then compound.`,
    tags: ['percent:population', 'percent:growth'],
  });
}

function findRate(ctx: Ctx): Res {
  const { rng } = ctx;
  const r = rng.pick([5, 10, 15, 20, 25]);
  const start = wholeStart(rng, [r, r], 20000, 150000, 100);
  const end = (start * (100 + r) * (100 + r)) / 10000;
  const place = rng.pick(TOWNS);
  const total = ((end - start) / start) * 100;
  const simple = total / 2;
  const ratioF = fr(end, start);
  const root = `\\frac{${100 + r}}{100}`;
  return emit(ctx, {
    facts: { form: 'find-rate', start, end },
    prompt: `The population of ${place} grew from ${num(start)} to ${num(end)} in 2 years. If it grew at the same rate every year (compounded yearly), what is the annual rate of growth?`,
    answer: r,
    format: fmtPct,
    mistakes: [
      { value: simple, why: 'split the total growth equally between the two years (simple growth)', trap: `${fmtPct(simple)} halves the total growth of ${dec(total)}%. With compounding, (1 + r/100)² = ${texFr(ratioF)}, so r = ${r}%.` },
      { value: total, why: 'gave the total growth over two years' },
      ...nearPcts(r, 3),
    ],
    steps: [
      `(1 + r/100)² = ${num(end)} ÷ ${num(start)} = ${texFr(ratioF)}.`,
      `1 + r/100 = $\\sqrt{${ratioF[1] === 1 ? ratioF[0] : `\\frac{${ratioF[0]}}{${ratioF[1]}}`}} = ${root}$.`,
      `r = ${r}% per year.`,
    ],
    shortcut: `Recognise the perfect square: ${texFr(ratioF)} = $(${root})^2$.`,
    trap: `Two years of compound growth is more than twice one year's growth — do not halve the total.`,
    tags: ['percent:population', 'percent:find-rate', 'trick:perfect-squares'],
  });
}

function migration(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('migration', 100, () => {
    const rate = rng.pick([5, 10, 20]);
    const start = wholeStart(rng, [rate, rate], 30000, 90000, 400);
    const y1 = (start * (100 + rate)) / 100;
    const moved = rng.pick([1, -1]) * multipleIn(rng, 1000, 6000, 100);
    const mid = y1 - moved;
    const fin = (mid * (100 + rate)) / 100;
    if (!whole(fin) || mid <= 0) return null;
    const place = rng.pick(TOWNS);
    const noMove = (start * (100 + rate) * (100 + rate)) / 10000;
    const moveAfter = noMove - moved;
    return emit(ctx, {
      facts: { form: 'migration', start, rate, moved },
      prompt: `The population of ${place} was ${num(start)} at the start of 2024 and grows at ${rate}% per year. At the end of 2024, ${num(Math.abs(moved))} people ${moved > 0 ? 'moved out of' : 'moved into'} the town. What will the population be at the end of 2025?`,
      answer: fin,
      format: num,
      mistakes: [
        { value: moveAfter, why: `${moved > 0 ? 'subtracted' : 'added'} the migrants after two years of growth`, trap: `${num(moveAfter)} adjusts for the migrants at the very end. They ${moved > 0 ? 'left' : 'arrived'} after 2024, so 2025's ${rate}% growth acts on the changed population.` },
        { value: noMove, why: 'ignored the migration' },
        { value: mid, why: 'stopped at the end of 2024' },
        { value: (start * (100 + 2 * rate)) / 100 - moved, why: 'simple growth for two years' },
      ],
      steps: [
        `End of 2024: ${num(start)} × ${facTex(rate)} = ${num(y1)}.`,
        `After migration: ${num(y1)} ${moved > 0 ? '−' : '+'} ${num(Math.abs(moved))} = ${num(mid)}.`,
        `End of 2025: ${num(mid)} × ${facTex(rate)} = ${num(fin)}.`,
      ],
      shortcut: `Handle events in time order: grow, adjust, grow.`,
      trap: `The migration happens between the two years, so it changes the base for the second year's growth.`,
      tags: ['percent:population', 'level:multi-step'],
    });
  });
}

function population(ctx: Ctx): Res {
  const { rng, difficulty } = ctx;
  if (difficulty === 'easy') {
    const r = rng.pick([10, 20]);
    return rng.chance(0.5) ? growth(ctx, 'town', [r, r]) : growth(ctx, 'machine', [-r, -r]);
  }
  if (difficulty === 'medium') {
    const k = rng.int(0, 2);
    if (k === 0) return growth(ctx, 'town', [rng.pick([10, 20, 25]), rng.pick([-10, -20, 5, 10])]);
    if (k === 1) {
      const r = rng.pick([10, 20, 25]);
      return yearsAgo(ctx, [r, r]);
    }
    return growth(ctx, 'machine', [-10, -10, -10]);
  }
  if (difficulty === 'hard') {
    const k = rng.int(0, 2);
    if (k === 0) return birthDeath(ctx);
    if (k === 1) return growth(ctx, 'town', [rng.pick([10, 20]), rng.pick([-10, -20, -25]), rng.pick([10, 25, 5])]);
    return yearsAgo(ctx, [rng.pick([10, 20]), rng.pick([5, 10]), rng.pick([10, 20, 25])]);
  }
  return rng.chance(0.5) ? findRate(ctx) : migration(ctx);
}

/* ------------------------------------------------------------------ */
/* 4. Election                                                          */
/* ------------------------------------------------------------------ */

function electionGrid(rows: [string, string][]): VisualSpec {
  return { type: 'grid', columns: ['Votes', 'Count'], rows: rows.map(([a, b]) => [a, b]) };
}

const SETTINGS = ['a gram panchayat election', 'a college union election', 'a cooperative bank board election', 'a municipal ward election', 'a housing society election'];

function election(ctx: Ctx): Res {
  const { rng, difficulty } = ctx;
  if (difficulty === 'extreme') return rng.chance(0.5) ? election3(ctx) : electionSwing(ctx);
  if (difficulty === 'hard' && rng.chance(0.5)) return electionTotalBase(ctx);
  const winner = difficulty === 'easy' ? rng.pick([55, 56, 58, 60, 62, 65, 70]) : rng.pick([52, 54, 55, 56, 58, 60, 62, 65]);
  const invalid = difficulty === 'easy' ? 0 : rng.pick([5, 10, 12, 15, 20, 25]);
  const notVoted = difficulty === 'hard' ? rng.pick([10, 15, 20, 25]) : 0;
  type Ask = 'total' | 'valid' | 'winner' | 'loser' | 'registered';
  const ask: Ask =
    difficulty === 'hard'
      ? 'registered'
      : difficulty === 'easy'
        ? rng.pick(['total', 'total', 'winner', 'loser'] as const)
        : rng.pick(['total', 'total', 'valid', 'winner', 'loser'] as const);
  return attempt('election', 200, () => {
    const fCast = factor(fr(-notVoted));
    const fValid = fmul(fCast, factor(fr(-invalid)));
    const fWin = fmul(fValid, fr(winner, 100));
    const fMargin = fmul(fValid, fr(2 * winner - 100, 100));
    const unit = lcmAll([fCast[1], fValid[1], fWin[1], fMargin[1], 100]);
    const R = multipleIn(rng, difficulty === 'easy' ? 3000 : 8000, difficulty === 'easy' ? 30000 : 90000, unit);
    const cast = scale(R, fCast);
    const valid = scale(R, fValid);
    const W = scale(R, fWin);
    const L = valid - W;
    const margin = W - L;
    if (margin < 200 || ![cast, valid, W, L, margin].every(whole)) return null;
    const answer = ask === 'registered' ? R : ask === 'total' ? cast : ask === 'valid' ? valid : ask === 'winner' ? W : L;
    const [A, B] = pickPeople(rng, 2);
    let prompt = `In ${rng.pick(SETTINGS)} between two candidates, `;
    if (notVoted) prompt += `${notVoted}% of the registered voters did not vote. Of the votes cast, ${invalid}% were declared invalid. `;
    else if (invalid) prompt += `${invalid}% of the votes cast were declared invalid. `;
    prompt += `${A.name} got ${winner}% of the ${invalid ? 'valid votes' : 'votes'} and defeated ${B.name} by ${num(margin)} votes. `;
    const askText: Record<Ask, string> = {
      registered: 'How many voters were registered?',
      total: invalid ? 'What was the total number of votes cast?' : 'How many votes were cast in all? (No vote was invalid.)',
      valid: 'How many valid votes were cast?',
      winner: `How many votes did ${A.name} get?${invalid ? '' : ' (No vote was invalid.)'}`,
      loser: `How many votes did ${B.name} get?${invalid ? '' : ' (No vote was invalid.)'}`,
    };
    prompt += askText[ask];
    const marginShare = 2 * winner - 100;
    const mistakes: Mist[] = [];
    if (ask === 'total' || ask === 'registered') {
      if (invalid) mistakes.push({ value: valid, why: 'forgot the invalid votes (answered the valid votes)', trap: `${num(valid)} is the number of valid votes. The ${marginShare}% margin is a share of the valid votes, which are only ${100 - invalid}% of the votes cast.` });
      if (notVoted) mistakes.push({ value: cast, why: 'forgot the voters who did not vote (answered votes cast)', trap: `${num(cast)} is the number of votes cast; ${notVoted}% of the registered voters did not vote at all.` });
      mistakes.push({ value: (margin * 100) / winner, why: "took the margin as the winner's share", trap: `${num((margin * 100) / winner)} divides the margin by ${winner}%. The margin is the gap between the candidates: ${winner}% − ${100 - winner}% = ${marginShare}%.` });
      mistakes.push({ value: W, why: "gave the winner's votes" });
      mistakes.push({ value: (margin * 100) / (100 - winner), why: "took the margin as the loser's share" });
    } else if (ask === 'valid') {
      mistakes.push(
        { value: cast, why: 'gave the total votes cast', trap: `${num(cast)} includes the ${invalid}% invalid votes; the question asks only for valid votes.` },
        { value: (margin * 100) / winner, why: "took the margin as the winner's share", trap: `The margin ${num(margin)} is ${marginShare}% of the valid votes, not ${winner}%.` },
        { value: W, why: "gave the winner's votes" },
      );
    } else if (ask === 'winner') {
      mistakes.push(
        { value: L, why: "gave the loser's votes", trap: `${num(L)} is ${B.name}'s tally; ${A.name} has ${num(margin)} more.` },
        { value: valid, why: 'gave the total of valid votes' },
        { value: (margin * winner) / 100, why: `took ${winner}% of the margin` },
        { value: (margin * 100) / winner, why: "took the margin as the winner's share" },
      );
    } else {
      mistakes.push(
        { value: W, why: "gave the winner's votes", trap: `${num(W)} is ${A.name}'s tally; ${B.name} has ${num(margin)} fewer.` },
        { value: valid - margin, why: 'subtracted the margin from the valid total' },
        { value: (margin * (100 - winner)) / 100, why: `took ${100 - winner}% of the margin` },
        { value: (margin * 100) / (100 - winner), why: "took the margin as the loser's share" },
      );
    }
    const units = (f: Fr) => dec(fval(f) * 100);
    const steps: string[] = [];
    if (notVoted) {
      steps.push(`Let the registered voters be 100 units. Votes cast = ${100 - notVoted} units.`);
      steps.push(`Valid votes = ${100 - invalid}% of ${100 - notVoted} = ${units(fValid)} units.`);
    } else if (invalid) {
      steps.push(`Let the votes cast be 100 units. Valid votes = ${100 - invalid} units.`);
    } else {
      steps.push(`Let the votes cast be 100 units.`);
    }
    steps.push(`${A.name} gets ${winner}% and ${B.name} ${100 - winner}% of ${invalid ? 'the valid votes' : 'the votes'}: margin = ${marginShare}% of ${units(fValid)} units = ${units(fMargin)} units.`);
    steps.push(`${units(fMargin)} units = ${num(margin)} votes, so 1 unit = ${num(R / 100)} votes.`);
    const unitsAns = ask === 'registered' ? fr(1) : ask === 'total' ? fCast : ask === 'valid' ? fValid : ask === 'winner' ? fWin : fsub(fValid, fWin);
    steps.push(`Required = ${units(unitsAns)} units = ${num(answer)}.`);
    const rows: [string, string][] = [];
    if (notVoted) rows.push(['Registered', num(R)], [`Did not vote (${notVoted}%)`, num(R - cast)]);
    rows.push(['Cast', num(cast)]);
    if (invalid) rows.push([`Invalid (${invalid}%)`, num(cast - valid)], ['Valid', num(valid)]);
    rows.push([`${A.name} (${winner}%)`, num(W)], [`${B.name} (${100 - winner}%)`, num(L)], ['Margin', num(margin)]);
    return emit(ctx, {
      facts: { form: 'election', winner, invalid, notVoted, base: 'valid', margin, ask },
      prompt,
      answer,
      format: num,
      mistakes,
      steps,
      shortcut: `Margin % = winner % − loser % = ${marginShare}% of the ${invalid ? 'valid ' : ''}votes; find what one unit is worth and scale up.`,
      trap: `Check which total each percentage is taken on — invalid votes and non-voters sit outside the valid-vote base.`,
      tags: ['percent:election', invalid ? 'trap:invalid-votes' : 'percent:margin'],
      visual: electionGrid(rows),
    });
  });
}

function electionTotalBase(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('election-total-base', 200, () => {
    const invalid = rng.pick([10, 12, 15, 20]);
    const winner = rng.pick([48, 50, 52, 54, 55, 56, 60]);
    const loser = 100 - invalid - winner;
    if (!(winner > loser) || winner - loser < 4) return null;
    const T = multipleIn(rng, 10000, 90000, 100);
    const margin = (T * (winner - loser)) / 100;
    const [A, B] = pickPeople(rng, 2);
    const mistakes: Mist[] = [];
    if (2 * winner - 100 > 0) {
      const wrongValid = (margin * 100) / (2 * winner - 100);
      mistakes.push({ value: wrongValid, why: "treated the winner's % as a share of valid votes", trap: `${num(wrongValid)} treats ${winner}% as a share of the valid votes (margin ${2 * winner - 100}%). Here ${winner}% is of all votes cast, so ${B.name} has ${100 - invalid}% − ${winner}% = ${loser}% of the votes cast.` });
    }
    mistakes.push(
      { value: (margin * 100) / winner, why: "took the margin as the winner's share" },
      { value: (T * (100 - invalid)) / 100, why: 'gave the valid votes' },
      { value: (T * winner) / 100, why: "gave the winner's votes" },
    );
    return emit(ctx, {
      facts: { form: 'election', winner, invalid, notVoted: 0, base: 'total', margin, ask: 'total' },
      prompt: `In an election between two candidates, ${invalid}% of the votes cast were invalid. ${A.name} got ${winner}% of the total votes cast and won by ${num(margin)} votes. What was the total number of votes cast?`,
      answer: T,
      format: num,
      mistakes,
      steps: [
        `Take the votes cast = 100 units. Valid votes = ${100 - invalid} units.`,
        `${A.name} = ${winner} units (of all votes cast), so ${B.name} = ${100 - invalid} − ${winner} = ${loser} units.`,
        `Margin = ${winner} − ${loser} = ${winner - loser} units = ${num(margin)} votes.`,
        `Total = ${num(margin)} × 100 ÷ ${winner - loser} = ${num(T)}.`,
      ],
      shortcut: `The loser's share is what is left of the valid votes: ${100 - invalid} − ${winner} = ${loser}% of the votes cast.`,
      trap: `Read the base carefully: "${winner}% of the total votes cast" is not "${winner}% of the valid votes".`,
      tags: ['percent:election', 'trap:wrong-base'],
      visual: electionGrid([['Cast', num(T)], [`Invalid (${invalid}%)`, num((T * invalid) / 100)], [`${A.name} (${winner}% of cast)`, num((T * winner) / 100)], [`${B.name} (${loser}% of cast)`, num((T * loser) / 100)], ['Margin', num(margin)]]),
    });
  });
}

function election3(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('election3', 300, () => {
    const invalid = rng.pick([10, 15, 20, 25]);
    const a = rng.pick([36, 38, 40, 42, 45, 48]);
    const b = rng.pick([24, 28, 30, 32, 35]);
    const c = 100 - a - b;
    if (!(a > b) || c <= 5 || c === a || c === b) return null;
    const fValid = factor(fr(-invalid));
    const unit = lcmAll([fValid[1], fmul(fValid, fr(a, 100))[1], fmul(fValid, fr(b, 100))[1], fmul(fValid, fr(c, 100))[1], 100]);
    const T = multipleIn(rng, 10000, 90000, unit);
    const V = scale(T, fValid);
    const votesB = (V * b) / 100;
    const votesC = (V * c) / 100;
    const margin = (V * (a - b)) / 100;
    if (!whole(votesC) || !whole(margin) || margin < 300) return null;
    const [A, B, C] = pickPeople(rng, 3);
    const ofTotal = (T * c) / 100;
    const noInvalid = (T * (100 - a - b - invalid)) / 100;
    return emit(ctx, {
      facts: { form: 'election3', invalid, a, b, margin },
      prompt: `In an election among three candidates, ${invalid}% of the votes cast were invalid. Of the valid votes, ${A.name} got ${a}% and ${B.name} got ${b}%, and the rest went to ${C.name}. If ${A.name} got ${num(margin)} more votes than ${B.name}, how many votes did ${C.name} get?`,
      answer: votesC,
      format: num,
      mistakes: [
        { value: ofTotal, why: "took C's share of all votes cast instead of the valid votes", trap: `${num(ofTotal)} takes ${c}% of all votes cast; ${C.name}'s ${c}% is a share of the valid votes only.` },
        { value: noInvalid, why: "subtracted the invalid % from C's share of the votes cast" },
        { value: votesB, why: "gave B's votes" },
        { value: V, why: 'gave the valid votes' },
      ],
      steps: [
        `${C.name}'s share of valid votes = 100 − ${a} − ${b} = ${c}%.`,
        `${A.name} − ${B.name} = ${a - b}% of valid votes = ${num(margin)}.`,
        `Valid votes = ${num(margin)} × 100 ÷ ${a - b} = ${num(V)}.`,
        `${C.name} = ${c}% of ${num(V)} = ${num(votesC)}.`,
      ],
      shortcut: `No need to find the total: ${C.name} = ${num(margin)} × ${c}/${a - b} = ${num(votesC)}.`,
      trap: `All the shares here are of the valid votes; the invalid ${invalid}% only matters if you go back to the votes cast.`,
      tags: ['percent:election', 'level:multi-step', 'trick:ratio-of-shares'],
    });
  });
}

function electionSwing(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('election-swing', 300, () => {
    const swing = rng.pick([10, 15, 20, 25]);
    const T = multipleIn(rng, 4000, 40000, 200);
    const w = rng.pick([52, 54, 55, 56, 58, 60]);
    const W = (T * w) / 100;
    const L = T - W;
    const moved = (W * swing) / 100;
    if (!whole(moved)) return null;
    const reverse = L + moved - (W - moved);
    if (reverse <= 100) return null;
    const margin = W - L;
    const [A, B] = pickPeople(rng, 2);
    return emit(ctx, {
      facts: { form: 'election-swing', margin, swing, reverse },
      prompt: `In an election between two candidates (all votes valid), ${A.name} defeated ${B.name} by ${num(margin)} votes. Had ${swing}% of the votes polled for ${A.name} gone to ${B.name} instead, ${B.name} would have won by ${num(reverse)} votes. How many votes were polled in all?`,
      answer: T,
      format: num,
      mistakes: [
        { value: W, why: "gave the winner's votes", trap: `${num(W)} is ${A.name}'s tally (the quantity found first); the question asks for all votes polled = ${A.name} + ${B.name}.` },
        { value: 4 * W - margin, why: 'used swing% instead of 2 × swing% for the change in the gap', trap: `${num(4 * W - margin)} assumes the gap changes by ${swing}% of ${A.name}'s votes. A switched vote leaves ${A.name} and joins ${B.name}, so the gap changes by 2 × ${swing}%.` },
        { value: 2 * W, why: "doubled the winner's votes" },
        { value: margin + reverse, why: 'added the two margins' },
      ],
      steps: [
        `Let ${A.name} get W votes, so ${B.name} gets W − ${num(margin)}.`,
        `Moving ${swing}% of W changes the gap by 2 × ${swing}% of W = ${2 * swing}% of W.`,
        `The gap swings from ${num(margin)} (for ${A.name}) to ${num(reverse)} (for ${B.name}): change = ${num(margin + reverse)} = ${2 * swing}% of W.`,
        `W = ${num(margin + reverse)} × 100 ÷ ${2 * swing} = ${num(W)}; ${B.name} = ${num(L)}.`,
        `Total = ${num(W)} + ${num(L)} = ${num(T)}.`,
      ],
      shortcut: `Each vote that switches changes the margin by 2. So ${2 * swing}% of W = ${num(margin)} + ${num(reverse)}.`,
      trap: `A switched vote is lost by one side and gained by the other — it moves the margin twice.`,
      tags: ['percent:election', 'level:multi-step'],
    });
  });
}

/* ------------------------------------------------------------------ */
/* 5. Income, expenditure & savings                                    */
/* ------------------------------------------------------------------ */

const HEADS = ['house rent', 'food', "children's education", 'travel', 'medical bills', 'electricity and phone bills'];

function spendHeads(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('spend-heads', 200, () => {
    const k = rng.int(2, 3);
    const heads = rng.sample([10, 12, 15, 18, 20, 25, 30, 35], k);
    const spent = heads.reduce((s, h) => s + h, 0);
    if (spent > 80 || spent < 40) return null;
    const income = multipleIn(rng, 15000, 90000, 500);
    const saving = (income * (100 - spent)) / 100;
    if (!whole(saving)) return null;
    const [P] = pickPeople(rng, 1);
    const names = rng.sample(HEADS, k);
    const list = heads.map((h, i) => (i === 0 ? `${h}% of ${his(P)} monthly salary on ${names[i]}` : `${h}% on ${names[i]}`));
    const partial = (saving * 100) / (100 - spent + heads[k - 1]);
    return emit(ctx, {
      facts: { form: 'spend-heads', heads, saving },
      prompt: `${P.name} spends ${listAnd(list)}. ${He(P)} saves the remaining ${rs(saving)}. What is ${his(P)} monthly salary?`,
      answer: income,
      format: rs,
      mistakes: [
        { value: (saving * 100) / spent, why: 'divided the savings by the spent percentage', trap: `${rs((saving * 100) / spent)} treats ${rs(saving)} as ${spent}% of the salary. The saving is what is left: ${100 - spent}%.` },
        { value: partial, why: 'left out one expense head' },
        { value: (income * spent) / 100, why: 'gave the total expenditure' },
        { value: saving + (saving * spent) / 100, why: `added ${spent}% of the savings to the savings` },
      ],
      steps: [
        `Total spent = ${heads.join('% + ')}% = ${spent}% of the salary.`,
        `Savings = 100% − ${spent}% = ${100 - spent}% of the salary = ${rs(saving)}.`,
        `Salary = ${rs(saving)} × 100 ÷ ${100 - spent} = ${rs(income)}.`,
      ],
      shortcut: `${100 - spent}% ↔ ${rs(saving)}, so 1% ↔ ${rs(saving / (100 - spent))} and 100% ↔ ${rs(income)}.`,
      trap: `The ₹ figure given is the savings, i.e. ${100 - spent}% — not the spent ${spent}%.`,
      tags: ['percent:income-expenditure', 'trick:unitary-method'],
    });
  });
}

function spendChain(ctx: Ctx, n: number): Res {
  const { rng } = ctx;
  return attempt('spend-chain', 300, () => {
    const heads = Array.from({ length: n }, () => rng.pick([10, 15, 20, 25, 30, 40]));
    const sum = heads.reduce((s, h) => s + h, 0);
    if (sum >= 90) return null;
    const partials: Fr[] = [];
    let acc = fr(1);
    for (const h of heads) {
      acc = fmul(acc, factor(fr(-h)));
      partials.push(acc);
    }
    const f = acc;
    const income = multipleIn(rng, 20000, 80000, lcmAll(partials.map((x) => x[1])) * 10);
    const saving = scale(income, f);
    if (!whole(saving) || saving < 2000) return null;
    const [P] = pickPeople(rng, 1);
    const names = rng.sample(HEADS, n);
    const parts = heads.map((h, i) => (i === 0 ? `${h}% of ${his(P)} monthly income on ${names[i]}` : `${h}% of the remaining amount on ${names[i]}`));
    const vals = [income, ...partials.map((x) => scale(income, x))];
    const additive = (saving * 100) / (100 - sum);
    return emit(ctx, {
      facts: { form: 'spend-chain', heads, saving },
      prompt: `${P.name} spends ${listAnd(parts)}. ${He(P)} saves the remaining ${rs(saving)} every month. What is ${his(P)} monthly income?`,
      answer: income,
      format: rs,
      mistakes: [
        { value: additive, why: 'added the percentages although each later one is on the remainder', trap: `${rs(additive)} adds ${heads.join('% + ')}% = ${sum}%. Each later percentage is of the remaining amount, so the saving is ${heads.map((h) => `${100 - h}%`).join(' of ')} of the income.` },
        { value: vals[1], why: `gave the amount left after ${names[0]}` },
        { value: vals[n - 1], why: 'stopped one step early' },
        { value: income - saving, why: 'gave the total expenditure' },
      ],
      steps: [
        `Let the income be 100 units.`,
        ...heads.map((h, i) => `After ${names[i]} (${h}%${i ? ' of the rest' : ''}): ${dec((vals[i] / income) * 100)} × ${facTex(-h)} = ${dec((vals[i + 1] / income) * 100)} units.`),
        `${dec(fval(f) * 100)} units = ${rs(saving)}, so income = ${rs(saving)} ÷ ${texFr(f)} = ${rs(income)}.`,
      ],
      shortcut: `Savings fraction = ${heads.map((h) => facTex(-h)).join(' × ')} = ${texFr(f)} of the income.`,
      trap: `"Of the remaining" percentages multiply; they cannot be added.`,
      tags: ['percent:income-expenditure', 'percent:of-remaining', 'trap:adding-percentages'],
      visual: { type: 'grid', columns: ['Head', 'Share', 'Left'], rows: [['Income', '—', rs(income)], ...heads.map((h, i) => [names[i], `${h}%${i ? ' of rest' : ''}`, rs(vals[i + 1])])] },
    });
  });
}

function savingsChange(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('savings-change', 300, () => {
    const s = rng.pick([20, 25, 30, 40]);
    const a = rng.pick([10, 15, 20, 25, 30]);
    const b = rng.pick([5, 10, 12, 15, 20, 25]);
    if (a === b) return null;
    const newExp = fmul(fr(100 - s), factor(fr(b)));
    const newSave = fsub(fr(100 + a), newExp);
    const change = fval(toPct(fdiv(fsub(newSave, fr(s)), fr(s))));
    if (!isTwoDp(change) || Math.abs(change) < 1e-9 || Math.abs(change) > 150) return null;
    const [P] = pickPeople(rng, 1);
    return emit(ctx, {
      facts: { form: 'savings-change', s, a, b },
      prompt: `${P.name} saves ${s}% of ${his(P)} monthly income. This year ${his(P)} income rises by ${a}% and ${his(P)} expenditure rises by ${b}%. What is the percentage change in ${his(P)} savings?`,
      answer: change,
      format: signedPct,
      allowNegative: true,
      step: Number.isInteger(change) ? 5 : 2.5,
      mistakes: [
        { value: a - b, why: 'subtracted the two percentages', trap: `${signedPct(a - b)} subtracts ${b}% from ${a}%, but income and expenditure are different amounts — work in units of income = 100.` },
        { value: a, why: 'assumed savings grow at the income rate' },
        { value: -change, why: 'right size, wrong direction' },
        { value: fval(fsub(newSave, fr(s))), why: 'measured the change against income instead of old savings' },
      ],
      steps: [
        `Let income = 100: expenditure = ${100 - s}, savings = ${s}.`,
        `New income = ${100 + a}; new expenditure = ${100 - s} × ${facTex(b)} = ${dec(fval(newExp))}.`,
        `New savings = ${100 + a} − ${dec(fval(newExp))} = ${dec(fval(newSave))}.`,
        `Change = (${dec(fval(newSave))} − ${s}) ÷ ${s} × 100 = ${signedPct(change).toLowerCase()}.`,
      ],
      shortcut: `Income = 100 makes every figure a percentage; savings = income − expenditure at both times.`,
      trap: `Savings are a small slice of income, so their percentage change is magnified — do not subtract the two rates.`,
      tags: ['percent:income-expenditure', 'percent:savings-change'],
    });
  });
}

function savingsNew(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('savings-new', 300, () => {
    const s = rng.pick([15, 20, 25, 30]);
    const a = rng.pick([10, 12, 15, 20, 25]);
    const b = rng.pick([5, 8, 10, 12, 15, 20]);
    if (a === b) return null;
    const income = multipleIn(rng, 20000, 80000, 500);
    const exp = (income * (100 - s)) / 100;
    const newInc = (income * (100 + a)) / 100;
    const newExp = (exp * (100 + b)) / 100;
    const newSave = newInc - newExp;
    if (![exp, newInc, newExp].every(whole) || newSave <= 0) return null;
    const oldSave = income - exp;
    const [P] = pickPeople(rng, 1);
    const wrongRate = (oldSave * (100 + a - b)) / 100;
    return emit(ctx, {
      facts: { form: 'savings-new', income, s, a, b },
      prompt: `${P.name}'s monthly income is ${rs(income)} and ${he(P)} saves ${s}% of it. Next year ${his(P)} income increases by ${a}% and ${his(P)} expenditure increases by ${b}%. What will ${his(P)} monthly savings be?`,
      answer: newSave,
      format: rs,
      mistakes: [
        { value: wrongRate, why: 'grew the savings by (a − b)%', trap: `${rs(wrongRate)} raises the savings by ${a}% − ${b}%. Savings must be recomputed as new income − new expenditure.` },
        { value: (oldSave * (100 + a)) / 100, why: 'grew the savings at the income rate' },
        { value: newInc - exp, why: 'forgot to raise the expenditure' },
        { value: oldSave, why: 'gave the old savings' },
      ],
      steps: [
        `Old expenditure = ${100 - s}% of ${rs(income)} = ${rs(exp)}.`,
        `New income = ${rs(income)} × ${facTex(a)} = ${rs(newInc)}.`,
        `New expenditure = ${rs(exp)} × ${facTex(b)} = ${rs(newExp)}.`,
        `New savings = ${rs(newInc)} − ${rs(newExp)} = ${rs(newSave)}.`,
      ],
      shortcut: `Savings = income − expenditure; update the two separately.`,
      trap: `Savings do not grow by (${a} − ${b})%; recompute them from the new income and expenditure.`,
      tags: ['percent:income-expenditure', 'percent:savings-change'],
    });
  });
}

function twoEarners(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('two-earners', 300, () => {
    const [p, q] = rng.pick([[5, 4], [4, 3], [3, 2], [7, 5], [6, 5], [5, 3]] as const);
    const sA = rng.pick([10, 15, 20, 25, 30]);
    const sB = rng.pick([10, 15, 20, 25, 30, 40]);
    if (sA === sB) return null;
    const kUnit = fr(p * (100 - sA) - q * (100 - sB), 100);
    if (!(fval(kUnit) > 0)) return null;
    const k = multipleIn(rng, 2000, 20000, 100);
    const diff = scale(k, kUnit);
    if (!whole(diff) || diff < 500) return null;
    const incA = p * k;
    const [A, B] = pickPeople(rng, 2);
    const plainRatio = (diff / (p - q)) * p;
    return emit(ctx, {
      facts: { form: 'two-earners', p, q, sA, sB, diff },
      prompt: `The monthly incomes of ${A.name} and ${B.name} are in the ratio ${p} : ${q}. ${A.name} saves ${sA}% and ${B.name} saves ${sB}% of their respective incomes. If ${A.name}'s monthly expenditure is ${rs(diff)} more than ${B.name}'s, what is ${A.name}'s monthly income?`,
      answer: incA,
      format: rs,
      mistakes: [
        { value: plainRatio, why: 'treated the expenditure gap as the income gap', trap: `${rs(plainRatio)} treats ${rs(diff)} as the difference in incomes. It is the difference in expenditures: ${100 - sA}% of ${p}k − ${100 - sB}% of ${q}k.` },
        { value: q * k, why: "gave B's income" },
        { value: (incA * (100 - sA)) / 100, why: "gave A's expenditure" },
        { value: k * (p + q), why: 'gave the combined income' },
      ],
      steps: [
        `Incomes: ${A.name} = ${p}k, ${B.name} = ${q}k.`,
        `Expenditures: ${A.name} = ${100 - sA}% of ${p}k = ${dec((p * (100 - sA)) / 100)}k; ${B.name} = ${100 - sB}% of ${q}k = ${dec((q * (100 - sB)) / 100)}k.`,
        `Difference = ${dec(fval(kUnit))}k = ${rs(diff)}, so k = ${rs(k)}.`,
        `${A.name}'s income = ${p}k = ${rs(incA)}.`,
      ],
      shortcut: `Write each expenditure as a multiple of k; the ₹ gap fixes k in one step.`,
      trap: `The ₹ figure compares expenditures, not incomes.`,
      tags: ['percent:income-expenditure', 'ratio:income-expenditure', 'level:multi-step'],
    });
  });
}

function incomeExpenditure(ctx: Ctx): Res {
  const { rng, difficulty } = ctx;
  if (difficulty === 'easy') return spendHeads(ctx);
  if (difficulty === 'medium') return spendChain(ctx, rng.chance(0.5) ? 2 : 3);
  if (difficulty === 'hard') return rng.chance(0.5) ? savingsChange(ctx) : savingsNew(ctx);
  return rng.chance(0.5) ? twoEarners(ctx) : spendChain(ctx, 3);
}

/* ------------------------------------------------------------------ */
/* 6. Marks & pass percentage                                           */
/* ------------------------------------------------------------------ */

const marks = (n: number): string => indian(n);

function passMax(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('pass-max', 200, () => {
    const max = rng.pick([200, 250, 300, 400, 450, 500, 600, 750, 800]);
    const pass = rng.pick([30, 33, 35, 36, 40, 45, 50]);
    const passMarks = (max * pass) / 100;
    if (!Number.isInteger(passMarks)) return null;
    const short = rng.int(4, 12) * (max >= 500 ? 5 : 2);
    const got = passMarks - short;
    if (got <= 0) return null;
    const [P] = pickPeople(rng, 1);
    return emit(ctx, {
      facts: { form: 'pass-max', pass, got, short },
      prompt: `To pass an examination, a candidate needs ${pass}% of the maximum marks. ${P.name} scored ${got} marks and failed by ${short} marks. What are the maximum marks?`,
      answer: max,
      format: marks,
      mistakes: [
        { value: passMarks, why: 'gave the pass marks', trap: `${passMarks} are the pass marks (${got} + ${short}). They are ${pass}% of the maximum, so divide by ${pass}% to get the maximum.` },
        { value: ((got - short) * 100) / pass, why: 'subtracted the shortfall instead of adding it' },
        { value: (got * 100) / pass, why: 'ignored the shortfall' },
        { value: (passMarks * 100) / (100 - pass), why: 'divided by the fail percentage' },
      ],
      steps: [
        `Pass marks = ${got} + ${short} = ${passMarks}.`,
        `${pass}% of the maximum = ${passMarks}.`,
        `Maximum = ${passMarks} × 100 ÷ ${pass} = ${max}.`,
      ],
      shortcut: `(scored + shortfall) ÷ pass% = (${got} + ${short}) ÷ ${pass}% = ${max}.`,
      trap: `${got} + ${short} gives the pass mark, not the maximum.`,
      tags: ['percent:marks', 'percent:pass-fail'],
    });
  });
}

function twoStudents(ctx: Ctx, ask: 'max' | 'pass-marks' | 'pass-pct'): Res {
  const { rng } = ctx;
  return attempt('two-students', 400, () => {
    const max = rng.pick([200, 250, 300, 400, 500, 600, 800]);
    const a = rng.pick([25, 28, 30, 32, 35]);
    const b = rng.pick([40, 42, 45, 48, 50, 55]);
    const scoreA = (max * a) / 100;
    const scoreB = (max * b) / 100;
    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreB - scoreA < 12) return null;
    const passMarks = rng.int(scoreA + 5, scoreB - 5);
    const short = passMarks - scoreA;
    const extra = scoreB - passMarks;
    const passPct = (passMarks / max) * 100;
    if (ask === 'pass-pct' && !isTwoDp(passPct)) return null;
    if (short === extra && ask === 'pass-pct') return null;
    const [P, Q] = pickPeople(rng, 2);
    const answer = ask === 'max' ? max : ask === 'pass-marks' ? passMarks : passPct;
    const askText = ask === 'max' ? 'What are the maximum marks of the test?' : ask === 'pass-marks' ? 'What are the pass marks?' : 'What is the pass percentage?';
    const mistakes: Mist[] =
      ask === 'pass-pct'
        ? [
            { value: (a + b) / 2, why: 'averaged the two percentages', trap: `${fmtPct((a + b) / 2)} averages ${a}% and ${b}%. The pass mark is ${short} above ${P.name}'s score and ${extra} below ${Q.name}'s, which is not the midpoint.` },
            { value: a, why: "took the first student's percentage as the pass percentage" },
            { value: ((scoreB + extra) / max) * 100, why: 'added the excess instead of subtracting it' },
            { value: ((scoreA - short) / max) * 100, why: 'subtracted the shortfall instead of adding it' },
          ]
        : ask === 'max'
          ? [
              { value: ((short + extra) * 100) / (b + a), why: 'divided by the sum of the percentages instead of the difference', trap: `The gap between the two students is ${b}% − ${a}% = ${b - a}% of the maximum, and it equals ${short} + ${extra} marks.` },
              { value: passMarks, why: 'gave the pass marks' },
              { value: (Math.abs(extra - short) * 100) / (b - a), why: 'subtracted the shortfall and the excess' },
              { value: (short * 100) / (b - a), why: 'used only the shortfall' },
              { value: (extra * 100) / (b - a), why: 'used only the excess' },
            ]
          : [
              { value: scoreB, why: "gave the second student's score", trap: `${scoreB} is ${Q.name}'s score, which is ${extra} above the pass mark.` },
              { value: scoreA, why: "gave the first student's score" },
              { value: (scoreA + scoreB) / 2, why: 'averaged the two scores' },
              { value: scoreA - short, why: 'subtracted the shortfall' },
            ];
    return emit(ctx, {
      facts: { form: 'two-students', a, short, b, extra, ask },
      prompt: `In a test, ${P.name} scored ${a}% of the maximum marks and failed by ${short} marks, while ${Q.name} scored ${b}% of the maximum marks and got ${extra} marks more than the pass marks. ${askText}`,
      answer,
      format: ask === 'pass-pct' ? fmtPct : marks,
      ...(ask === 'pass-pct' ? { step: 2 } : {}),
      mistakes,
      steps: [
        `Between ${P.name} and ${Q.name}: ${b}% − ${a}% = ${b - a}% of the maximum = ${short} + ${extra} = ${short + extra} marks.`,
        `Maximum = ${short + extra} × 100 ÷ ${b - a} = ${max}.`,
        `Pass marks = ${a}% of ${max} + ${short} = ${scoreA} + ${short} = ${passMarks}.`,
        ...(ask === 'pass-pct' ? [`Pass % = ${passMarks} ÷ ${max} × 100 = ${fmtPct(passPct)}.`] : []),
      ],
      shortcut: `Difference of percentages ↔ (shortfall + excess): ${b - a}% ↔ ${short + extra} marks.`,
      trap: `The shortfall and the excess sit on opposite sides of the pass mark, so they add up across the ${b - a}% gap.`,
      tags: ['percent:marks', 'percent:pass-fail', 'level:two-equations'],
    });
  });
}

function aggregate(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('aggregate', 200, () => {
    const papers = rng.pick([3, 4]);
    const maxEach = rng.pick([100, 150, 200]);
    const pass = rng.pick([35, 40, 45, 50]);
    const need = (papers * maxEach * pass) / 100;
    if (!Number.isInteger(need)) return null;
    const scored = Array.from({ length: papers - 1 }, () => rng.int(Math.round(maxEach * 0.25), Math.round(maxEach * 0.6)));
    const got = scored.reduce((s, x) => s + x, 0);
    const last = need - got;
    if (last <= 5 || last > maxEach) return null;
    const perPaper = (maxEach * pass) / 100;
    const [P] = pickPeople(rng, 1);
    return emit(ctx, {
      facts: { form: 'aggregate', maxEach, papers, pass, scored },
      prompt: `An examination has ${papers} papers of ${maxEach} marks each. To pass, a candidate must get ${pass}% of the aggregate marks. ${P.name} scored ${listAnd(scored.map(String))} in the first ${papers - 1} papers. What is the minimum ${he(P)} must score in the last paper to pass?`,
      answer: last,
      format: marks,
      mistakes: [
        { value: perPaper, why: 'applied the pass percentage to one paper only', trap: `${perPaper} is ${pass}% of a single paper. The pass condition is on the aggregate of ${papers * maxEach} marks.` },
        { value: need, why: 'gave the aggregate needed' },
        { value: last + scored[0], why: 'left out the first paper' },
        { value: need - got + scored[scored.length - 1], why: 'left out the latest paper' },
      ],
      steps: [
        `Aggregate maximum = ${papers} × ${maxEach} = ${papers * maxEach}.`,
        `Needed = ${pass}% of ${papers * maxEach} = ${need}.`,
        `Scored so far = ${scored.join(' + ')} = ${got}.`,
        `Minimum in the last paper = ${need} − ${got} = ${last}.`,
      ],
      shortcut: `Needed aggregate − marks already scored.`,
      trap: `The ${pass}% applies to the total of all papers, not to each paper.`,
      tags: ['percent:marks', 'percent:aggregate'],
    });
  });
}

function failBoth(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('fail-both', 300, () => {
    const failA = rng.pick([20, 24, 25, 30, 32, 35]);
    const failB = rng.pick([15, 18, 20, 22, 28, 30]);
    const both = rng.pick([5, 8, 10, 12, 14]);
    if (both >= Math.min(failA, failB)) return null;
    const passPct = 100 - (failA + failB - both);
    if (passPct <= 20) return null;
    const total = multipleIn(rng, 500, 5000, 100 / gcd(passPct, 100));
    const passed = (total * passPct) / 100;
    if (!whole(passed)) return null;
    const [s1, s2] = rng.pick([['Hindi', 'English'], ['Mathematics', 'Science'], ['English', 'Mathematics'], ['Economics', 'Accountancy']] as const);
    const noOverlapPct = 100 - failA - failB;
    const mistakes: Mist[] = [];
    if (noOverlapPct > 0) {
      const v = (passed * 100) / noOverlapPct;
      mistakes.push({ value: v, why: 'ignored the overlap (did not add back those who failed in both)', trap: `${num(v)} treats ${failA}% + ${failB}% as all different candidates. The ${both}% who failed in both are counted twice, so failures = ${failA} + ${failB} − ${both} = ${failA + failB - both}%.` });
    }
    if (noOverlapPct - both > 0) mistakes.push({ value: (passed * 100) / (noOverlapPct - both), why: 'subtracted the overlap instead of adding it back' });
    mistakes.push({ value: (passed * 100) / (100 - both), why: 'used only the "failed in both" share' }, { value: total - passed, why: 'gave the number who failed' });
    return emit(ctx, {
      facts: { form: 'fail-both', failA, failB, both, passedBoth: passed },
      prompt: `In an examination, ${failA}% of the candidates failed in ${s1}, ${failB}% failed in ${s2} and ${both}% failed in both subjects. If ${num(passed)} candidates passed in both subjects, how many candidates appeared in the examination?`,
      answer: total,
      format: num,
      mistakes,
      steps: [
        `Failed in at least one = ${failA}% + ${failB}% − ${both}% = ${failA + failB - both}%.`,
        `Passed in both = 100% − ${failA + failB - both}% = ${passPct}%.`,
        `${passPct}% of the candidates = ${num(passed)}.`,
        `Total = ${num(passed)} × 100 ÷ ${passPct} = ${num(total)}.`,
      ],
      shortcut: `n(A ∪ B) = n(A) + n(B) − n(A ∩ B); passed in both = 100% − that.`,
      trap: `Those who failed in both are inside both percentages — add them back once.`,
      tags: ['percent:marks', 'percent:sets', 'trap:double-counting'],
    });
  });
}

function marksPass(ctx: Ctx): Res {
  const { rng, difficulty } = ctx;
  if (difficulty === 'easy') return passMax(ctx);
  if (difficulty === 'medium') return twoStudents(ctx, rng.chance(0.5) ? 'max' : 'pass-marks');
  if (difficulty === 'hard') return rng.chance(0.5) ? twoStudents(ctx, 'pass-pct') : aggregate(ctx);
  return failBoth(ctx);
}

/* ------------------------------------------------------------------ */
/* 7. % of % chains                                                     */
/* ------------------------------------------------------------------ */

function ofChain(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('of-chain', 200, () => {
    const p1 = rng.pick([20, 25, 40, 50, 60, 75, 80]);
    const p2 = rng.pick([20, 25, 40, 50, 60, 75, 80]);
    const value = multipleIn(rng, 20000, 120000, 1000);
    const mid = (value * p2) / 100;
    const A = (mid * p1) / 100;
    if (!whole(A)) return null;
    const [P, Q, R] = pickPeople(rng, 3);
    const mistakes: Mist[] = [];
    if (p1 + p2 < 100) mistakes.push({ value: (value * (p1 + p2)) / 100, why: 'added the two percentages', trap: `${rs((value * (p1 + p2)) / 100)} adds ${p1}% and ${p2}%. "${p1}% of ${p2}% of" multiplies: ${p1}% × ${p2}% = ${dec((p1 * p2) / 100)}%.` });
    mistakes.push(
      { value: mid, why: `stopped at ${Q.name}'s salary`, trap: `${rs(mid)} is ${Q.name}'s salary; ${P.name} earns ${p1}% of that.` },
      { value: (value * p1) / 100, why: `took ${p1}% of ${R.name}'s salary directly` },
      { value: (value * p1) / p2, why: 'divided by the second percentage instead of multiplying' },
    );
    return emit(ctx, {
      facts: { form: 'of-chain', p1, p2, value },
      prompt: `${P.name}'s monthly salary is ${p1}% of ${Q.name}'s, and ${Q.name}'s salary is ${p2}% of ${R.name}'s. If ${R.name} earns ${rs(value)} a month, how much does ${P.name} earn?`,
      answer: A,
      format: rs,
      mistakes,
      steps: [
        `${Q.name}'s salary = ${p2}% of ${rs(value)} = ${rs(mid)}.`,
        `${P.name}'s salary = ${p1}% of ${rs(mid)} = ${rs(A)}.`,
      ],
      shortcut: `${p1}% of ${p2}% = ${dec((p1 * p2) / 100)}%, so ${dec((p1 * p2) / 100)}% of ${rs(value)} = ${rs(A)}.`,
      trap: `A percentage of a percentage multiplies — it never adds.`,
      tags: ['percent:chain', 'trick:multiply-percentages'],
    });
  });
}

function equalParts(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('equal-parts', 200, () => {
    const p = rng.pick([12, 15, 20, 24, 25, 30, 35, 40, 45]);
    const q = rng.pick([16, 18, 20, 25, 28, 30, 36, 40, 50]);
    if (p === q) return null;
    const g = gcd(p, q);
    const ra = q / g; // A : B = q : p
    const rb = p / g;
    if (Math.max(ra, rb) > 12) return null;
    const k = multipleIn(rng, 500, 8000, 100);
    const A = ra * k;
    const B = rb * k;
    const diff = Math.abs(A - B);
    const [P, Q] = pickPeople(rng, 2);
    const bigger = A > B ? P.name : Q.name;
    const smaller = A > B ? Q.name : P.name;
    return emit(ctx, {
      facts: { form: 'equal-parts', p, q, diff },
      prompt: `${p}% of ${P.name}'s monthly savings is equal to ${q}% of ${Q.name}'s monthly savings. If ${bigger} saves ${rs(diff)} more than ${smaller} every month, what are ${P.name}'s monthly savings?`,
      answer: A,
      format: rs,
      mistakes: [
        { value: B, why: 'reversed the ratio (A : B = p : q)', trap: `${rs(B)} comes from A : B = ${p} : ${q}. From ${p}% of A = ${q}% of B, the larger percentage goes with the smaller amount: A : B = ${q} : ${p}.` },
        ...(Math.abs(ra - rb) > 1 ? [{ value: diff * ra, why: 'forgot to divide the gap by the difference in parts' }] : []),
        { value: A + B, why: 'gave the combined savings' },
        { value: k, why: 'stopped at the value of one part' },
      ],
      steps: [
        `${p}% of A = ${q}% of B ⇒ A : B = ${q} : ${p} = ${ra} : ${rb}.`,
        `Difference = ${Math.abs(ra - rb)} part${Math.abs(ra - rb) === 1 ? '' : 's'} = ${rs(diff)}, so 1 part = ${rs(k)}.`,
        `${P.name}'s savings = ${ra} parts = ${rs(A)}.`,
      ],
      shortcut: `x% of A = y% of B ⇒ A : B = y : x (cross over).`,
      trap: `The percentages cross over: the bigger percentage is taken of the smaller amount.`,
      tags: ['percent:chain', 'ratio:cross-multiplication'],
    });
  });
}

function mixedChain(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('mixed-chain', 300, () => {
    const a = rng.pick([10, 20, 25, 50, 60]);
    const b = rng.pick([20, 25, 40, 50, 75, 80]);
    const c = rng.pick([10, 20, 25, 40, 50]);
    const f = fmul(fmul(factor(fr(a)), fr(b, 100)), factor(fr(c)));
    const ans = fval(toPct(f));
    if (!isTwoDp(ans) || ans >= 200 || ans <= 5) return null;
    const additive = (b * (100 + a + c)) / 100;
    return emit(ctx, {
      facts: { form: 'mixed-chain', a, b, c },
      prompt: `A is ${a}% more than B, B is ${b}% of C, and C is ${c}% more than D. A is what percent of D?`,
      answer: ans,
      format: fmtPct,
      step: 2,
      mistakes: [
        { value: additive, why: 'added the two "more than" percentages', trap: `${fmtPct(additive)} adds ${a}% and ${c}% before scaling. Each link multiplies: ${facTex(a)} × ${texFr(fr(b, 100))} × ${facTex(c)}.` },
        { value: (b * (100 + a)) / 100, why: 'missed the last link (found A as % of C)' },
        { value: (b * (100 + c)) / 100, why: 'missed the first link (found B as % of D)' },
        { value: b + a + c, why: 'added all three percentages' },
      ],
      steps: [
        `Take D = 100.`,
        `C = 100 + ${c}% of 100 = ${100 + c}.`,
        `B = ${b}% of ${100 + c} = ${dec((b * (100 + c)) / 100)}.`,
        `A = ${dec((b * (100 + c)) / 100)} + ${a}% of it = ${dec(ans)}.`,
        `So A is ${fmtPct(ans)} of D.`,
      ],
      shortcut: `Multiply the links: ${facTex(a)} × ${texFr(fr(b, 100))} × ${facTex(c)} = ${texFr(f)}.`,
      trap: `Chains of percentages multiply link by link; nothing is added.`,
      tags: ['percent:chain', 'trick:base-100'],
    });
  });
}

function composition(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('composition', 400, () => {
    const girls = rng.pick([40, 45, 55, 60]);
    const girlsOpt = rng.pick([20, 25, 30, 40, 50]);
    const boysOpt = rng.pick([10, 15, 20, 25, 30, 35]);
    if (girlsOpt === boysOpt) return null;
    const total = multipleIn(rng, 800, 8000, 400);
    const g = (total * girls) / 100;
    const gOpt = (g * girlsOpt) / 100;
    const bOpt = ((total - g) * boysOpt) / 100;
    if (![g, gOpt, bOpt].every(whole)) return null;
    const notOpting = total - gOpt - bOpt;
    const optPct = ((gOpt + bOpt) / total) * 100;
    const notPct = 100 - optPct;
    const subject = rng.pick(['music', 'painting', 'yoga', 'computer science']);
    const avgWrong = (notOpting * 100) / (100 - (girlsOpt + boysOpt) / 2);
    const mistakes: Mist[] = [
      { value: avgWrong, why: 'averaged the two opting percentages without weighting', trap: `${num(avgWrong)} averages ${girlsOpt}% and ${boysOpt}% equally, but girls and boys are ${girls}% and ${100 - girls}% of the school — the average must be weighted.` },
    ];
    if (100 - girlsOpt - boysOpt > 0) mistakes.push({ value: (notOpting * 100) / (100 - girlsOpt - boysOpt), why: 'added the two opting percentages' });
    mistakes.push({ value: (notOpting * 100) / optPct, why: 'used the opting share instead of the not-opting share' }, { value: gOpt + bOpt, why: 'gave the number who opted' });
    return emit(ctx, {
      facts: { form: 'composition', girls, girlsOpt, boysOpt, notOpting },
      prompt: `In a school, ${girls}% of the students are girls. ${girlsOpt}% of the girls and ${boysOpt}% of the boys have opted for ${subject}. If ${num(notOpting)} students have not opted for ${subject}, how many students are there in the school?`,
      answer: total,
      format: num,
      mistakes,
      steps: [
        `Take the school = 100 students: ${girls} girls, ${100 - girls} boys.`,
        `Opted: ${girlsOpt}% of ${girls} + ${boysOpt}% of ${100 - girls} = ${dec((girls * girlsOpt) / 100)} + ${dec(((100 - girls) * boysOpt) / 100)} = ${dec(optPct)}.`,
        `Not opted = 100 − ${dec(optPct)} = ${dec(notPct)}% of the school.`,
        `Total = ${num(notOpting)} × 100 ÷ ${dec(notPct)} = ${num(total)}.`,
      ],
      shortcut: `Weighted share: ${girls}% × ${girlsOpt}% + ${100 - girls}% × ${boysOpt}% = ${dec(optPct)}% opt; the other ${dec(notPct)}% ↔ ${num(notOpting)}.`,
      trap: `Percentages of different groups must be weighted by the group sizes before combining.`,
      tags: ['percent:chain', 'percent:weighted', 'level:multi-step'],
    });
  });
}

function percentChain(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return ofChain(ctx);
  if (difficulty === 'medium') return equalParts(ctx);
  if (difficulty === 'hard') return mixedChain(ctx);
  return composition(ctx);
}

/* ------------------------------------------------------------------ */
/* 8. Participation split ("the rest = N")                              */
/* ------------------------------------------------------------------ */

const SPLITS: { group: string; verb: string; x: string; y: string; z: string }[] = [
  { group: 'residents of a housing colony', verb: 'prefer', x: 'tea', y: 'coffee', z: 'buttermilk' },
  { group: 'students of a college', verb: 'play', x: 'cricket', y: 'football', z: 'badminton' },
  { group: 'employees of a bank branch', verb: 'commute by', x: 'bus', y: 'metro', z: 'two-wheeler' },
  { group: 'households in a town', verb: 'read', x: 'a Hindi newspaper', y: 'an English newspaper', z: 'a regional-language newspaper' },
  { group: 'customers of a sweet shop', verb: 'pay by', x: 'UPI', y: 'cash', z: 'card' },
];

function splitRest(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('split-rest', 200, () => {
    const a = rng.pick([30, 35, 40, 45, 50]);
    const b = rng.pick([15, 20, 25, 30, 35]);
    if (a <= b || a + b > 80) return null;
    const T = multipleIn(rng, 200, 3000, 20);
    const rest = (T * (100 - a - b)) / 100;
    const X = (T * a) / 100;
    const Y = (T * b) / 100;
    if (![rest, X, Y].every(whole)) return null;
    const s = rng.pick(SPLITS);
    return emit(ctx, {
      facts: { form: 'split-rest', a, b, rest },
      prompt: `In a survey of the ${s.group}, ${a}% said they ${s.verb} ${s.x}, ${b}% ${s.verb} ${s.y} and the rest ${s.verb} ${s.z}. If ${num(rest)} of them ${s.verb} ${s.z}, how many more ${s.verb} ${s.x} than ${s.y}?`,
      answer: X - Y,
      format: num,
      mistakes: [
        { value: (rest * (a - b)) / 100, why: `took (a − b)% of the given count ${rest} (wrong base)`, trap: `${num((rest * (a - b)) / 100)} takes ${a - b}% of ${num(rest)}. The percentages are shares of the whole group, and ${num(rest)} is only the ${100 - a - b}% who ${s.verb} ${s.z}.` },
        { value: X, why: `gave the number who ${s.verb} ${s.x}` },
        { value: Y, why: `gave the number who ${s.verb} ${s.y}` },
        { value: T, why: 'gave the size of the whole group' },
        { value: X + Y, why: 'added instead of subtracting' },
      ],
      steps: [
        `The rest = 100% − ${a}% − ${b}% = ${100 - a - b}% of the group = ${num(rest)}.`,
        `1% of the group = ${num(rest)} ÷ ${100 - a - b} = ${dec(rest / (100 - a - b))}.`,
        `Required = (${a}% − ${b}%) = ${a - b}% of the group = ${a - b} × ${dec(rest / (100 - a - b))} = ${num(X - Y)}.`,
      ],
      shortcut: `No need for the total: difference = ${num(rest)} × $\\frac{${a - b}}{${100 - a - b}}$ = ${num(X - Y)}.`,
      trap: `Every percentage is a share of the whole group, not of the ${num(rest)} people in the last category.`,
      tags: ['percent:participation', 'trick:unitary-method'],
    });
  });
}

function splitNested(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('split-nested', 300, () => {
    const a = rng.pick([25, 30, 35, 40]);
    const b = rng.pick([15, 20, 25, 30]);
    const c = rng.pick([20, 25, 40, 50, 60]);
    const R = 100 - a - b;
    if (R < 20 || a === b) return null;
    const T = multipleIn(rng, 400, 4000, 20);
    const remain = (T * R) / 100;
    const car = (remain * c) / 100;
    const last = remain - car;
    const metro = (T * b) / 100;
    if (![remain, car, metro].every(whole)) return null;
    const wrongPct = 100 - a - b - c;
    const wrongMetro = wrongPct > 0 ? (last * b) / wrongPct : -1;
    const org = rng.pick(['an IT company', 'a bank head office', 'a government hospital', 'a university']);
    return emit(ctx, {
      facts: { form: 'split-nested', a, b, c, last },
      prompt: `Of the employees of ${org}, ${a}% travel to work by bus and ${b}% by metro. Of the remaining employees, ${c}% come by car and the rest walk. If ${num(last)} employees walk to work, how many travel by metro?`,
      answer: metro,
      format: num,
      mistakes: [
        { value: wrongMetro, why: 'took the car share as a percentage of all employees', trap: `${num(Math.round(wrongMetro))} treats ${c}% as a share of all employees. It is ${c}% of the remaining ${R}%, i.e. ${dec((R * c) / 100)}% of all employees.` },
        { value: (T * a) / 100, why: 'gave the bus count' },
        { value: car, why: 'gave the car count' },
        { value: T, why: 'gave the total number of employees' },
      ],
      steps: [
        `Remaining after bus and metro = 100% − ${a}% − ${b}% = ${R}%.`,
        `Car = ${c}% of ${R}% = ${dec((R * c) / 100)}%; walkers = ${R}% − ${dec((R * c) / 100)}% = ${dec((R * (100 - c)) / 100)}% of all employees.`,
        `${dec((R * (100 - c)) / 100)}% = ${num(last)}, so total = ${num(last)} × 100 ÷ ${dec((R * (100 - c)) / 100)} = ${num(T)}.`,
        `Metro = ${b}% of ${num(T)} = ${num(metro)}.`,
      ],
      shortcut: `Walkers are ${100 - c}% of ${R}% = ${dec((R * (100 - c)) / 100)}% of everyone; scale ${num(last)} to ${b}%.`,
      trap: `"Of the remaining" changes the base: ${c}% is of the leftover ${R}%, not of everyone.`,
      tags: ['percent:participation', 'percent:of-remaining'],
    });
  });
}

function splitSets(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('split-sets', 300, () => {
    const a = rng.pick([40, 45, 50, 55, 60]);
    const b = rng.pick([30, 35, 40, 45]);
    const both = rng.pick([10, 15, 20, 25]);
    const neitherPct = 100 - (a + b - both);
    if (both >= b || neitherPct < 10 || neitherPct > 40) return null;
    const T = multipleIn(rng, 400, 5000, 20);
    const neither = (T * neitherPct) / 100;
    const onlyA = (T * (a - both)) / 100;
    if (![neither, onlyA].every(whole)) return null;
    const noOverlapPct = 100 - a - b;
    const s = rng.pick([
      { who: 'students of a school', x: 'yoga', y: 'dance' },
      { who: 'members of a club', x: 'swimming', y: 'tennis' },
      { who: 'customers of a bank branch', x: 'mobile banking', y: 'net banking' },
    ]);
    const mistakes: Mist[] = [
      { value: (T * a) / 100, why: `gave everyone who chose ${s.x} (forgot to remove those who chose both)`, trap: `${num((T * a) / 100)} counts all ${a}% who chose ${s.x}; ${both}% of them chose ${s.y} too, so "only ${s.x}" is ${a - both}%.` },
      { value: (T * (b - both)) / 100, why: `gave "only ${s.y}"` },
      { value: (T * both) / 100, why: 'gave "both"' },
    ];
    if (noOverlapPct > 0) mistakes.push({ value: (neither * (a - both)) / noOverlapPct, why: 'took neither% = 100 − a − b (ignored the overlap)' });
    return emit(ctx, {
      facts: { form: 'split-sets', a, b, both, neither },
      prompt: `Among the ${s.who}, ${a}% chose ${s.x}, ${b}% chose ${s.y} and ${both}% chose both. If ${num(neither)} of them chose neither, how many chose only ${s.x}?`,
      answer: onlyA,
      format: num,
      mistakes,
      steps: [
        `At least one = ${a}% + ${b}% − ${both}% = ${a + b - both}%.`,
        `Neither = 100% − ${a + b - both}% = ${neitherPct}% = ${num(neither)}, so the total = ${num(T)}.`,
        `Only ${s.x} = ${a}% − ${both}% = ${a - both}% of ${num(T)} = ${num(onlyA)}.`,
      ],
      shortcut: `Only ${s.x} ↔ ${a - both}% and neither ↔ ${neitherPct}%: answer = ${num(neither)} × $\\frac{${a - both}}{${neitherPct}}$.`,
      trap: `"Only ${s.x}" excludes the ${both}% who chose both.`,
      tags: ['percent:participation', 'percent:sets'],
    });
  });
}

function splitLevels(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('split-levels', 300, () => {
    const men = rng.pick([40, 45, 55, 60]);
    const gradM = rng.pick([20, 25, 30, 40]);
    const gradW = rng.pick([15, 20, 25, 30, 35]);
    if (gradM === gradW) return null;
    const T = multipleIn(rng, 2000, 20000, 400);
    const M = (T * men) / 100;
    const W = T - M;
    const nonGradMen = (M * (100 - gradM)) / 100;
    const gradWomen = (W * gradW) / 100;
    if (![M, nonGradMen, gradWomen].every(whole)) return null;
    const place = rng.pick(VILLAGES);
    const swapT = (nonGradMen * 10000) / (men * gradM);
    return emit(ctx, {
      facts: { form: 'split-levels', men, gradM, gradW, nonGradMen },
      prompt: `In the village of ${place}, ${men}% of the adults are men. ${gradM}% of the men and ${gradW}% of the women are graduates. If ${num(nonGradMen)} men are not graduates, how many women in the village are graduates?`,
      answer: gradWomen,
      format: num,
      mistakes: [
        { value: (swapT * (100 - men) * gradW) / 10000, why: "used the men's graduate share for the non-graduates", trap: `The ${num(nonGradMen)} men who are not graduates are ${100 - gradM}% of the men, not ${gradM}%.` },
        { value: (W * (100 - gradW)) / 100, why: 'gave the women who are not graduates' },
        { value: (M * gradM) / 100, why: 'gave the men who are graduates' },
        { value: (T * gradW) / 100, why: "took the women's graduate share of all adults" },
        { value: W, why: 'gave the number of women' },
      ],
      steps: [
        `Take the adults = 100: men = ${men}, women = ${100 - men}.`,
        `Non-graduate men = ${100 - gradM}% of ${men} = ${dec((men * (100 - gradM)) / 100)}% of the adults = ${num(nonGradMen)}.`,
        `Total adults = ${num(nonGradMen)} × 100 ÷ ${dec((men * (100 - gradM)) / 100)} = ${num(T)}.`,
        `Women = ${num(W)}; graduate women = ${gradW}% of ${num(W)} = ${num(gradWomen)}.`,
      ],
      shortcut: `Convert both groups to % of all adults: ${dec((men * (100 - gradM)) / 100)}% ↔ ${num(nonGradMen)}, and the answer is ${dec(((100 - men) * gradW) / 100)}%.`,
      trap: `Each percentage is of a different group — men, then women — so convert everything to a share of all adults first.`,
      tags: ['percent:participation', 'percent:nested', 'level:multi-step'],
    });
  });
}

function participation(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return splitRest(ctx);
  if (difficulty === 'medium') return splitNested(ctx);
  if (difficulty === 'hard') return splitSets(ctx);
  return splitLevels(ctx);
}

/* ------------------------------------------------------------------ */

const BUILDERS: Record<string, (ctx: Ctx) => Res> = {
  participation,
  'base-change': baseChange,
  'successive-change': successive,
  population,
  election,
  'income-expenditure': incomeExpenditure,
  'marks-pass': marksPass,
  'percent-chain': percentChain,
};

export const generator = defineGenerator<PercentageFacts>(META, SUBTYPES, (ctx) => {
  const build = BUILDERS[ctx.subtype.id];
  if (!build) throw new Error(`quant.percentage: no builder for ${ctx.subtype.id}`);
  return build(ctx);
});
