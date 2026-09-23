/**
 * Profit & loss (SPEC 8.1 Q4). Built backward from a clean cost price; research ranges (CP ₹200–2,500,
 * percentages mostly 10/20/25/30/40). Distractors from the real P&L mistakes: % on the wrong base (SP vs CP),
 * mark-up and discount combined additively, successive discounts added, equal-SP vs equal-CP confusion.
 */
import { defineGenerator, type BuildContext, type GenResult, type SubtypeDef } from '../types';
import {
  attempt,
  emit,
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
  lcmAll,
  multipleIn,
  pctF,
  pickPeople,
  rs,
  scale,
  texFr,
  toPct,
  type Fr,
  type Mist,
} from './profit-loss/kit';

const META = { name: 'quant.profit-loss', version: 1, subject: 'quant', chapter: 'profit-loss' } as const;

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'cp-sp', label: 'Cost price & selling price', weight: 2 },
  { id: 'discount', label: 'Marked price & discount', weight: 1.5 },
  { id: 'markup-discount', label: 'Mark-up then discount', weight: 2 },
  { id: 'successive-discounts', label: 'Successive discounts', weight: 1 },
  { id: 'profit-on-sp', label: 'Profit on SP vs on CP', weight: 0.75 },
  { id: 'dishonest-dealer', label: 'Dishonest dealer (false weights)', weight: 1 },
  { id: 'buy-get-free', label: 'Buy x, get y free', weight: 1 },
  { id: 'same-sp', label: 'Two items at the same SP', weight: 1 },
  { id: 'overall-pl', label: 'Overall profit or loss', weight: 1.5 },
  { id: 'multi-stage', label: 'Multi-stage chains & combined', weight: 1 },
];

/* ------------------------------------------------------------------ */
/* Facts                                                               */
/* ------------------------------------------------------------------ */

export type ProfitLossFacts =
  /** CP and signed profit % (negative = loss); asked: SP. */
  | { form: 'sp-from-cp'; cp: number; pct: number }
  /** SP and signed profit %; asked: CP. */
  | { form: 'cp-from-sp'; sp: number; pct: number }
  /** SP1 gives signed pct1; asked: SP for signed pct2. */
  | { form: 'resell'; sp1: number; pct1: number; pct2: number }
  /** CP of `cpCount` articles = SP of `spCount` articles; asked: signed profit %. */
  | { form: 'count-equal'; cpCount: number; spCount: number }
  /** Sold at signed pct1; ₹extra more would give pct2; asked: CP. */
  | { form: 'more-for'; pct1: number; pct2: number; extra: number }
  /** Profit at sp1 equals loss at sp2; asked: SP for target% profit. */
  | { form: 'equal-pl'; sp1: number; sp2: number; target: number }
  /** Sold at p% profit; bought a% cheaper and sold ₹less cheaper → q% profit; asked: CP. */
  | { form: 'cheaper-buy'; p: number; a: number; less: number; q: number }
  /** MP and discount d%; asked: SP. */
  | { form: 'discount-sp'; mp: number; d: number }
  /** SP after d% discount; asked: MP. */
  | { form: 'discount-mp'; sp: number; d: number }
  /** MP and SP; asked: discount %. */
  | { form: 'discount-pct'; mp: number; sp: number }
  /** MP, discount d%, GST g% on the discounted price; asked: amount paid. */
  | { form: 'gst'; mp: number; d: number; gst: number }
  /** Amount paid after d% discount and g% GST; asked: MP. */
  | { form: 'gst-mp'; paid: number; d: number; gst: number }
  /** Profit p1% after d1% discount; asked: signed profit % after d2% discount. */
  | { form: 'two-discount-profit'; p1: number; d1: number; d2: number }
  /** Mark-up m% (fraction), discount d%; asked: profit %. */
  | { form: 'markup-profit'; m: Fr; d: number }
  /** CP, mark-up m%, discount d%; asked: SP or profit (₹). */
  | { form: 'markup-amount'; cp: number; m: number; d: number; ask: 'sp' | 'profit' }
  /** CP : MP = a : b; SP and profit (₹) given; asked: MP. */
  | { form: 'ratio-mp'; a: number; b: number; sp: number; profit: number }
  /** Discount d%, profit p%; asked: mark-up %. */
  | { form: 'find-markup'; d: number; p: number }
  /** Mark-up m%, profit p%; asked: discount %. */
  | { form: 'find-discount'; m: number; p: number }
  /** Article 1: mark-up m%, discount d%, profit ₹profit. Article 2: CP k% more, sold at l% loss. Asked: SP of article 2. */
  | { form: 'second-article'; m: number; d: number; profit: number; k: number; l: number }
  /** Successive discounts; asked: single equivalent discount %. */
  | { form: 'equiv-discount'; ds: number[] }
  /** MP with successive discounts; asked: SP. */
  | { form: 'succ-sp'; mp: number; ds: number[] }
  /** SP after successive discounts; asked: MP. */
  | { form: 'succ-mp'; sp: number; ds: number[] }
  /** Gap between a single discount and successive discounts; asked: MP. */
  | { form: 'discount-gap'; single: number; ds: number[]; gap: number }
  /** Successive discounts and still p% profit; asked: mark-up %. */
  | { form: 'succ-markup'; ds: number[]; p: number }
  /** Profit is p% of SP; asked: profit % on CP. */
  | { form: 'sp-basis'; p: Fr }
  /** Loss is l% of SP; asked: loss % on CP. */
  | { form: 'sp-basis-loss'; l: number }
  /** SP (₹) with profit p% of SP; asked: CP. */
  | { form: 'sp-basis-cp'; sp: number; p: number }
  /** Profit p% of SP; CP rises rise% with SP unchanged; asked: new profit % on CP. */
  | { form: 'sp-basis-shift'; p: number; rise: number }
  /** Profit p% of SP vs p% of CP differ by ₹diff; asked: SP. */
  | { form: 'sp-basis-diff'; p: number; diff: number }
  /** Uses `grams` for 1 kg; price = CP × (1 + markup%) × (1 − discount%); asked: gain %. */
  | { form: 'false-weight'; grams: number; markup: number; discount: number }
  /** Sells at markup% above CP but gives `less`% less quantity; asked: gain %. */
  | { form: 'short-measure'; less: number; markup: number }
  /** Takes buy% extra while buying and gives sell% less while selling; asked: gain %. */
  | { form: 'cheat-both'; buy: number; sell: number }
  /** Buy `buy` get `free` free; asked: effective discount %. */
  | { form: 'free-discount'; buy: number; free: number }
  /** Mark-up, optional discount, buy x get y free; asked: signed profit %. */
  | { form: 'free-profit'; markup: number; discount: number; buy: number; free: number }
  /** Wants p% profit with buy x get y free; asked: mark-up %. */
  | { form: 'free-markup'; p: number; buy: number; free: number }
  /** Two items at the same SP (₹sp each), profit p% on one, loss l% on the other; asked: overall ₹ (signed). */
  | { form: 'same-sp-amount'; sp: number; p: number; l: number }
  /** Same SP, p% profit / l% loss (fractions); asked: overall % (signed). */
  | { form: 'same-sp-pct'; p: Fr; l: Fr }
  /** Same SP, p% profit / l% loss, overall loss ₹loss; asked: SP of each. */
  | { form: 'same-sp-find'; p: number; l: number; loss: number }
  /** Two items with CPs c1, c2 sold at signed p1%, p2%; asked: overall ₹ (signed). */
  | { form: 'two-items'; c1: number; c2: number; p1: number; p2: number }
  /** CPs differ by `gap`; costlier sold at +x%, cheaper at −x%; total SP; asked: CP of the costlier. */
  | { form: 'cp-gap'; x: number; gap: number; total: number }
  /** Quantities sold at signed %s; asked: % profit needed on the rest (qty.at(-1)) for overall `target`%. */
  | { form: 'rest-pct'; qty: number[]; pcts: number[]; target: number }
  /** Two articles of equal CP at +a% and −b%; net loss ₹loss; asked: SP of one for target% profit. */
  | { form: 'equal-cp-loss'; a: number; b: number; loss: number; target: number }
  /** Signed % at each stage of a supply chain; the last buyer pays `final`; asked: first cost. */
  | { form: 'chain-cp'; pcts: number[]; final: number }
  /** Stage pcts; first cost given; retailer marks up `markup`% and gives `discount`%; asked: retailer's profit ₹. */
  | { form: 'chain-retailer'; cost: number; pcts: number[]; markup: number; discount: number }
  /** Borrowed at SI; goods marked up and discounted; asked: net gain ₹ after repaying (signed). */
  | { form: 'loan-trade'; principal: number; rate: number; years: number; markup: number; discount: number }
  /** Partners fund the stock (capital × months); sold after mark-up/discount; asked: one partner's profit share. */
  | { form: 'partner-trade'; caps: number[]; months: number[]; markup: number; discount: number; ask: number };

type Ctx = BuildContext;
type Res = GenResult<ProfitLossFacts>;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const ITEMS: { name: string; lo: number; hi: number }[] = [
  { name: 'wall clock', lo: 300, hi: 1500 },
  { name: 'school bag', lo: 400, hi: 1600 },
  { name: 'pressure cooker', lo: 800, hi: 2500 },
  { name: 'table lamp', lo: 300, hi: 1200 },
  { name: 'steam iron', lo: 600, hi: 2000 },
  { name: 'electric kettle', lo: 500, hi: 1800 },
  { name: 'pair of shoes', lo: 600, hi: 2500 },
  { name: 'wrist watch', lo: 500, hi: 2500 },
  { name: 'ceiling fan', lo: 1200, hi: 2500 },
  { name: 'suitcase', lo: 1000, hi: 2500 },
  { name: 'silk saree', lo: 800, hi: 2500 },
  { name: 'water filter', lo: 1000, hi: 2500 },
];

const PLURAL: Record<string, string> = { 'pair of shoes': 'pairs of shoes', 'wrist watch': 'wrist watches' };
const plural = (name: string): string => PLURAL[name] ?? `${name}s`;

/** A price for an item that is a multiple of `unit`; widens the range if the item's range is too narrow. */
function priceFor(rng: Ctx['rng'], unit: number, lo = 200, hi = 2500): { item: string; price: number } {
  const fits = ITEMS.filter((it) => Math.floor(Math.min(it.hi, hi) / unit) >= Math.ceil(Math.max(it.lo, lo) / unit));
  if (fits.length) {
    const it = rng.pick(fits);
    return { item: it.name, price: multipleIn(rng, Math.max(it.lo, lo), Math.min(it.hi, hi), unit) };
  }
  return { item: rng.pick(['mobile phone', 'bicycle', 'sewing machine', 'mixer grinder']), price: multipleIn(rng, lo, Math.max(hi, unit * 3), unit) };
}

/** A multiple of unit in [lo, hi], or null when none exists (caller retries with other numbers). */
function tryMultiple(rng: Ctx['rng'], lo: number, hi: number, unit: number): number | null {
  return Math.floor(hi / unit) >= Math.ceil(lo / unit) ? multipleIn(rng, lo, hi, unit) : null;
}

/** Unit that makes CP × every factor whole. */
const unitFor = (...fs: Fr[]): number => lcmAll(fs.map((f) => f[1]));

const whole = (v: number): boolean => Math.abs(v - Math.round(v)) < 1e-9;
const dec = (v: number): string => String(Math.round(v * 10000) / 10000);
const isTwoDp = (v: number): boolean => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const facTex = (c: number): string => texFr(factor(fr(c)));

/** "25% profit" / "20% loss" / "No profit, no loss". */
function plPct(v: number): string {
  if (Math.abs(v) < 1e-9) return 'No profit, no loss';
  return v > 0 ? `${fmtPct(v)} profit` : `${fmtPct(-v)} loss`;
}
/** "Profit of ₹200" / "Loss of ₹200" / "No profit, no loss". */
function plAmt(v: number): string {
  if (Math.abs(v) < 1e-9) return 'No profit, no loss';
  return v > 0 ? `Profit of ${rs(v)}` : `Loss of ${rs(-v)}`;
}
const gl = (p: number): string => (p >= 0 ? `a profit of ${Math.abs(p)}%` : `a loss of ${Math.abs(p)}%`);
const gainWord = (p: number): string => (p >= 0 ? 'gains' : 'loses');

const STD_PCTS: number[] = [
  4, 5, 6.25, 25 / 3, 100 / 11, 10, 100 / 9, 12.5, 100 / 7, 15, 50 / 3, 20, 22.5, 25, 200 / 7, 30, 100 / 3, 37.5, 40,
  45, 50, 60, 62.5, 200 / 3, 75, 80, 100,
];
function nearPcts(ans: number, n = 4): Mist[] {
  const others = STD_PCTS.filter((v) => Math.abs(v - ans) > 1e-9);
  const below = others.filter((v) => v < ans).sort((a, b) => b - a).slice(0, n);
  const above = others.filter((v) => v > ans).sort((a, b) => a - b).slice(0, n);
  return [...below, ...above].map((value) => ({ value, why: 'filler: nearby standard percentage' }));
}

/* ------------------------------------------------------------------ */
/* 1. CP & SP                                                          */
/* ------------------------------------------------------------------ */

function spFromCp(ctx: Ctx): Res {
  const { rng } = ctx;
  const pct = rng.pick([10, 12, 15, 20, 25, 30, 40, -10, -15, -20, -25]);
  const { item, price: cp } = priceFor(rng, unitFor(factor(fr(pct)), factor(fr(-pct))) * 10);
  const sp = scale(cp, factor(fr(pct)));
  const [P] = pickPeople(rng, 1);
  const word = pct > 0 ? 'profit' : 'loss';
  return emit(ctx, {
    facts: { form: 'sp-from-cp', cp, pct },
    prompt: `${P.name} buys a ${item} for ${rs(cp)} and sells it at ${gl(pct)}. At what price does ${he(P)} sell it?`,
    answer: sp,
    format: rs,
    mistakes: [
      { value: scale(cp, factor(fr(-pct))), why: `applied the ${word} in the wrong direction`, trap: `${rs(scale(cp, factor(fr(-pct))))} applies the ${Math.abs(pct)}% the wrong way; a ${word} means the SP is ${pct > 0 ? 'above' : 'below'} the CP.` },
      { value: (cp * Math.abs(pct)) / 100, why: `gave the ${word} instead of the SP` },
      { value: (cp * 100) / (100 - pct), why: `treated the ${word} as a percentage of the SP` },
    ],
    steps: [
      `SP = CP × $\\frac{100 ${pct > 0 ? '+' : '-'} ${Math.abs(pct)}}{100}$.`,
      `= ${rs(cp)} × $\\frac{${100 + pct}}{100}$ = ${rs(sp)}.`,
    ],
    shortcut: `${Math.abs(pct)}% of ${rs(cp)} = ${rs((cp * Math.abs(pct)) / 100)}; ${pct > 0 ? 'add' : 'subtract'} it: ${rs(sp)}.`,
    trap: `Profit and loss percentages are always on the cost price.`,
    tags: ['pl:cp-sp', 'trick:multiplying-factor'],
  });
}

function cpFromSp(ctx: Ctx): Res {
  const { rng } = ctx;
  const pct = rng.pick([10, 20, 25, 12.5, 30, 40, -10, -20, -25, -12.5]);
  const f = factor(pct === 12.5 || pct === -12.5 ? fr(pct * 2, 2) : fr(pct));
  const { item, price: cp } = priceFor(rng, unitFor(f, pct % 1 ? fr(1, 8) : fr(1)) * 10);
  const sp = scale(cp, f);
  const [P] = pickPeople(rng, 1);
  const word = pct > 0 ? 'profit' : 'loss';
  const pctText = fmtPct(Math.abs(pct));
  const onSp = sp - (sp * pct) / 100;
  return emit(ctx, {
    facts: { form: 'cp-from-sp', sp, pct },
    prompt: `By selling a ${item} for ${rs(sp)}, ${P.name} makes a ${word} of ${pctText}. What was the cost price of the ${item}?`,
    answer: cp,
    format: rs,
    mistakes: [
      { value: onSp, why: `took ${pctText} of the SP instead of the CP`, trap: `${rs(onSp)} ${pct > 0 ? 'subtracts' : 'adds'} ${pctText} of the selling price. The ${word} is ${pctText} of the cost price, so divide: CP = SP ÷ ${texFr(f)}.` },
      { value: scale(sp, f), why: 'multiplied by the factor instead of dividing' },
      { value: (sp * Math.abs(pct)) / 100, why: `gave ${pctText} of the SP` },
      { value: sp + (pct > 0 ? 1 : -1) * ((sp * Math.abs(pct)) / 100), why: 'moved the SP the wrong way' },
    ],
    steps: [
      `SP = CP × ${texFr(f)}.`,
      `CP = ${rs(sp)} ÷ ${texFr(f)} = ${rs(cp)}.`,
    ],
    shortcut: `${pctText} = ${texFr(fdiv(fr(Math.round(Math.abs(pct) * 2), 2), fr(100)))}: SP is ${f[0]} parts when CP is ${f[1]} parts → CP = ${rs(sp)} × ${f[1]}/${f[0]}.`,
    trap: `The ${word} percentage is on the CP, which is unknown here — divide the SP by the factor.`,
    tags: ['pl:cp-sp', 'pl:reverse', 'trap:wrong-base'],
  });
}

function resell(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('resell', 100, () => {
    const pct1 = rng.pick([10, 12, 15, 20, 25, -10, -12, -15, -20]);
    const pct2 = rng.pick([10, 15, 20, 25, 30, 35]);
    if (pct1 === pct2) return null;
    const { item, price: cp } = priceFor(rng, unitFor(factor(fr(pct1)), factor(fr(pct2))) * 10);
    const sp1 = scale(cp, factor(fr(pct1)));
    const sp2 = scale(cp, factor(fr(pct2)));
    const wrong = (sp1 * (100 + pct2 - pct1)) / 100;
    const [P] = pickPeople(rng, 1);
    return emit(ctx, {
      facts: { form: 'resell', sp1, pct1, pct2 },
      prompt: `By selling a ${item} for ${rs(sp1)}, ${P.name}, a shopkeeper, ${gainWord(pct1)} ${Math.abs(pct1)}%. At what price should ${he(P)} sell it to gain ${pct2}%?`,
      answer: sp2,
      format: rs,
      mistakes: [
        { value: wrong, why: 'changed the old SP by the difference of the two percentages', trap: `${rs(Math.round(wrong))} moves the old SP by ${pct2 - pct1}%. Both percentages are on the CP, so find the CP first: ${rs(sp1)} ÷ ${facTex(pct1)} = ${rs(cp)}.` },
        { value: scale(sp1, factor(fr(pct2))), why: `applied ${pct2}% to the old SP` },
        { value: cp, why: 'gave the cost price' },
        { value: (cp * (100 + pct2 + pct1)) / 100, why: 'added the two percentages' },
      ],
      steps: [
        `CP = ${rs(sp1)} ÷ ${facTex(pct1)} = ${rs(cp)}.`,
        `Required SP = ${rs(cp)} × ${facTex(pct2)} = ${rs(sp2)}.`,
      ],
      shortcut: `Scale the SP directly: ${rs(sp1)} × $\\frac{${100 + pct2}}{${100 + pct1}}$ = ${rs(sp2)}.`,
      trap: `Both percentages are on the cost price, so the old SP must first be converted back to the CP.`,
      tags: ['pl:cp-sp', 'trick:ratio-scaling'],
    });
  });
}

const COUNT_PAIRS: [number, number][] = [
  [20, 16], [15, 12], [25, 20], [10, 8], [12, 10], [18, 15], [16, 12], [12, 9], [11, 10], [24, 20],
  [16, 20], [12, 15], [20, 25], [9, 12], [15, 20], [8, 10], [24, 30],
];

function countEqual(ctx: Ctx): Res {
  const { rng } = ctx;
  const [x, y] = rng.pick(COUNT_PAIRS);
  const ans = ((x - y) / y) * 100;
  const { item } = priceFor(rng, 10);
  const wrongBase = ((x - y) / x) * 100;
  return emit(ctx, {
    facts: { form: 'count-equal', cpCount: x, spCount: y },
    prompt: `The cost price of ${x} ${plural(item)} is equal to the selling price of ${y} ${plural(item)}. What is the profit or loss percentage?`,
    answer: ans,
    format: plPct,
    allowNegative: true,
    mistakes: [
      { value: wrongBase, why: 'divided the difference by the CP count instead of the SP count', trap: `${plPct(wrongBase)} divides the difference ${Math.abs(x - y)} by ${x}. The ${ans > 0 ? 'profit' : 'loss'} is on the cost of the ${y} articles sold, so divide by ${y}.` },
      { value: -ans, why: 'right size, wrong direction' },
      { value: x - y, why: 'took the difference in counts as the percentage' },
      ...nearPcts(Math.abs(ans), 2).map((m) => ({ ...m, value: Math.sign(ans) * m.value })),
    ],
    steps: [
      `Let the CP of one article be ₹1. Then CP of ${x} = ₹${x} = SP of ${y}.`,
      `On ${y} articles: CP = ₹${y}, SP = ₹${x}.`,
      `${ans > 0 ? 'Profit' : 'Loss'} = ₹${Math.abs(x - y)} on ₹${y} = $\\frac{${Math.abs(x - y)}}{${y}} \\times 100$ = ${fmtPct(Math.abs(ans))}.`,
    ],
    shortcut: `(${x} − ${y}) ÷ ${y} × 100 — always divide by the number of articles sold.`,
    trap: `The base is the cost of the ${y} articles actually sold, not ${x}.`,
    tags: ['pl:cp-sp', 'pl:articles-count'],
  });
}

function moreFor(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('more-for', 200, () => {
    const pct1 = rng.pick([5, 8, 10, 12, 15, 20, -5, -8, -10, -12]);
    const pct2 = rng.pick([12, 15, 18, 20, 25, 30]);
    if (pct2 <= pct1) return null;
    const { item, price: cp } = priceFor(rng, 100 / gcd(pct2 - pct1, 100));
    const extra = (cp * (pct2 - pct1)) / 100;
    if (!whole(extra) || extra < 20 || !whole((cp * pct1) / 100)) return null;
    const sp1 = scale(cp, factor(fr(pct1)));
    const [P] = pickPeople(rng, 1);
    const onlyQ = (extra * 100) / pct2;
    return emit(ctx, {
      facts: { form: 'more-for', pct1, pct2, extra },
      prompt: `${P.name} sold a ${item} at ${gl(pct1)}. Had ${he(P)} sold it for ${rs(extra)} more, ${he(P)} would have gained ${pct2}%. What is the cost price of the ${item}?`,
      answer: cp,
      format: rs,
      mistakes: [
        { value: (extra * 100) / (pct2 + pct1), why: pct1 >= 0 ? 'added the two percentages' : 'subtracted the loss from the gain', trap: `${rs(Math.round((extra * 100) / (pct2 + pct1)))} uses ${pct2}% ${pct1 >= 0 ? '+' : '−'} ${Math.abs(pct1)}%. The extra ${rs(extra)} moves the result from ${pct1 >= 0 ? '+' : '−'}${Math.abs(pct1)}% to +${pct2}%, a change of ${pct2 - pct1}% of the CP.` },
        { value: onlyQ, why: `used only the ${pct2}%` },
        { value: sp1, why: 'gave the original SP' },
        { value: sp1 + extra, why: 'gave the new SP' },
      ],
      steps: [
        `Change in result = ${pct2}% − (${pct1 >= 0 ? '' : '−'}${Math.abs(pct1)}%) = ${pct2 - pct1}% of the CP.`,
        `${pct2 - pct1}% of CP = ${rs(extra)}.`,
        `CP = ${rs(extra)} × 100 ÷ ${pct2 - pct1} = ${rs(cp)}.`,
      ],
      shortcut: `Extra money ↔ change in %: ${rs(extra)} ↔ ${pct2 - pct1}%, so 100% = ${rs(cp)}.`,
      trap: pct1 < 0 ? `Going from a ${Math.abs(pct1)}% loss to a ${pct2}% gain is a swing of ${pct2 - pct1}%, not ${pct2 + pct1}%.` : `Only the difference ${pct2} − ${pct1} = ${pct2 - pct1}% is covered by the extra ${rs(extra)}.`,
      tags: ['pl:cp-sp', 'trick:percent-swing'],
    });
  });
}

function equalPl(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('equal-pl', 200, () => {
    const target = rng.pick([10, 15, 20, 25, 30]);
    const { item, price: cp } = priceFor(rng, 100 / gcd(target, 100) * 2);
    const g = multipleIn(rng, 40, Math.floor(cp * 0.3), 10);
    const sp1 = cp + g;
    const sp2 = cp - g;
    const ans = scale(cp, factor(fr(target)));
    const [P] = pickPeople(rng, 1);
    return emit(ctx, {
      facts: { form: 'equal-pl', sp1, sp2, target },
      prompt: `The profit ${P.name} earns by selling a ${item} for ${rs(sp1)} is equal to the loss ${he(P)} incurs by selling it for ${rs(sp2)}. At what price should ${he(P)} sell it to make a profit of ${target}%?`,
      answer: ans,
      format: rs,
      mistakes: [
        { value: cp, why: 'stopped at the cost price', trap: `${rs(cp)} is the cost price — the midpoint of ${rs(sp1)} and ${rs(sp2)}. The question asks for the SP at ${target}% profit.` },
        { value: scale(sp1, factor(fr(target))), why: `applied ${target}% to the higher SP` },
        { value: ((sp1 - sp2) * (100 + target)) / 100, why: 'used the difference of the prices as the CP' },
        { value: cp + target, why: 'added the percentage as rupees' },
      ],
      steps: [
        `SP₁ − CP = CP − SP₂, so CP = (${rs(sp1)} + ${rs(sp2)}) ÷ 2 = ${rs(cp)}.`,
        `Required SP = ${rs(cp)} × ${facTex(target)} = ${rs(ans)}.`,
      ],
      shortcut: `Equal profit and loss ⇒ CP is the average of the two prices.`,
      trap: `Find the CP first (the average), then add ${target}%.`,
      tags: ['pl:cp-sp', 'trick:average-of-prices'],
    });
  });
}

function cheaperBuy(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('cheaper-buy', 300, () => {
    const p = rng.pick([10, 20, 25, 30]);
    const a = rng.pick([10, 20, 25]);
    const q = rng.pick([20, 25, 30, 40, 50]);
    const k = fsub(factor(fr(p)), fmul(factor(fr(-a)), factor(fr(q)))); // less = CP × k
    if (!(fval(k) > 0)) return null;
    const cp = multipleIn(rng, 400, 5000, unitFor(k, factor(fr(p)), factor(fr(-a)), fmul(factor(fr(-a)), factor(fr(q)))) * 10);
    const less = scale(cp, k);
    if (!whole(less) || less < 20) return null;
    const additive = p + a - q !== 0 ? (less * 100) / (p + a - q) : -1;
    const [P] = pickPeople(rng, 1);
    return emit(ctx, {
      facts: { form: 'cheaper-buy', p, a, less, q },
      prompt: `${P.name} sells an article at a profit of ${p}%. Had ${he(P)} bought it at ${a}% less and sold it for ${rs(less)} less, ${he(P)} would have gained ${q}%. What is the cost price of the article?`,
      answer: cp,
      format: rs,
      mistakes: [
        ...(additive > 0 ? [{ value: additive, why: 'treated the three percentages as additive', trap: `${rs(Math.round(additive))} solves ${p} + ${a} − ${q} = ${p + a - q}% of CP. The ${q}% gain is on the new, lower CP: new SP = ${100 - a}% × ${facTex(q)} of CP.` }] : []),
        { value: scale(cp, factor(fr(p))), why: 'gave the original SP' },
        { value: scale(cp, factor(fr(-a))), why: 'gave the new CP' },
        { value: (less * 100) / q, why: `divided the ₹ gap by ${q}%` },
      ],
      steps: [
        `Let CP = 100. Original SP = ${100 + p}.`,
        `New CP = ${100 - a}; new SP at ${q}% gain = ${100 - a} × ${facTex(q)} = ${dec(fval(fmul(factor(fr(-a)), factor(fr(q)))) * 100)}.`,
        `Difference in SP = ${100 + p} − ${dec(fval(fmul(factor(fr(-a)), factor(fr(q)))) * 100)} = ${dec(fval(k) * 100)} = ${rs(less)}.`,
        `CP = ${rs(less)} × 100 ÷ ${dec(fval(k) * 100)} = ${rs(cp)}.`,
      ],
      shortcut: `Work on CP = 100: the two SPs differ by ${dec(fval(k) * 100)}, which is worth ${rs(less)}.`,
      trap: `The ${q}% is on the reduced cost price, so it cannot be combined additively with ${p}% and ${a}%.`,
      tags: ['pl:cp-sp', 'level:multi-step'],
    });
  });
}

function cpSp(ctx: Ctx): Res {
  const { rng, difficulty } = ctx;
  if (difficulty === 'easy') return rng.chance(0.5) ? spFromCp(ctx) : cpFromSp(ctx);
  if (difficulty === 'medium') return rng.chance(0.6) ? resell(ctx) : countEqual(ctx);
  if (difficulty === 'hard') return rng.chance(0.5) ? moreFor(ctx) : equalPl(ctx);
  return cheaperBuy(ctx);
}

/* ------------------------------------------------------------------ */
/* 2. Discount                                                          */
/* ------------------------------------------------------------------ */

function discountSp(ctx: Ctx): Res {
  const { rng } = ctx;
  const d = rng.pick([10, 12, 15, 20, 25, 30, 35, 40]);
  const { item, price: mp } = priceFor(rng, (100 / gcd(d, 100)) * 10, 400, 2500);
  const sp = (mp * (100 - d)) / 100;
  return emit(ctx, {
    facts: { form: 'discount-sp', mp, d },
    prompt: `The marked price of a ${item} is ${rs(mp)}. A shopkeeper sells it at a discount of ${d}%. What is its selling price?`,
    answer: sp,
    format: rs,
    mistakes: [
      { value: (mp * d) / 100, why: 'gave the discount instead of the SP', trap: `${rs((mp * d) / 100)} is the discount itself; the customer pays the marked price minus it.` },
      { value: (mp * (100 + d)) / 100, why: 'added the discount' },
      { value: (mp * 100) / (100 + d), why: 'divided by (1 + d%)' },
    ],
    steps: [`Discount = ${d}% of ${rs(mp)} = ${rs((mp * d) / 100)}.`, `SP = ${rs(mp)} − ${rs((mp * d) / 100)} = ${rs(sp)}.`],
    shortcut: `SP = ${100 - d}% of MP = ${rs(mp)} × ${texFr(fr(100 - d, 100))}.`,
    trap: `Discount is always on the marked price.`,
    tags: ['pl:discount'],
  });
}

function discountMp(ctx: Ctx): Res {
  const { rng } = ctx;
  const d = rng.pick([10, 15, 20, 25, 30, 40]);
  const f = factor(fr(-d));
  const { item, price: mp } = priceFor(rng, unitFor(f) * 10, 400, 2500);
  const sp = scale(mp, f);
  return emit(ctx, {
    facts: { form: 'discount-mp', sp, d },
    prompt: `After a discount of ${d}%, a ${item} is sold for ${rs(sp)}. What is its marked price?`,
    answer: mp,
    format: rs,
    mistakes: [
      { value: (sp * (100 + d)) / 100, why: 'added d% of the SP back', trap: `${rs((sp * (100 + d)) / 100)} adds ${d}% of the selling price. The discount was ${d}% of the marked price, so MP = SP ÷ ${texFr(f)}.` },
      { value: scale(sp, f), why: 'took a further discount' },
      { value: (sp * d) / 100, why: 'gave d% of the SP' },
    ],
    steps: [`SP = ${100 - d}% of MP.`, `MP = ${rs(sp)} × 100 ÷ ${100 - d} = ${rs(mp)}.`],
    shortcut: `${100 - d}% ↔ ${rs(sp)}; 100% ↔ ${rs(mp)}.`,
    trap: `The discount was taken on the (unknown) marked price, not on ${rs(sp)}.`,
    tags: ['pl:discount', 'pl:reverse'],
  });
}

function discountPct(ctx: Ctx): Res {
  const { rng } = ctx;
  const d = rng.pick([5, 8, 10, 12, 15, 20, 25, 30]);
  const { item, price: mp } = priceFor(rng, (100 / gcd(d, 100)) * 10, 400, 2500);
  const sp = (mp * (100 - d)) / 100;
  return emit(ctx, {
    facts: { form: 'discount-pct', mp, sp },
    prompt: `A ${item} marked at ${rs(mp)} is sold for ${rs(sp)}. What is the rate of discount?`,
    answer: d,
    format: fmtPct,
    mistakes: [
      { value: fval(toPct(fr(mp - sp, sp))), why: 'divided the discount by the SP', trap: `${fmtPct(fval(toPct(fr(mp - sp, sp))))} divides the discount by the selling price; discount % is on the marked price.` },
      { value: 100 - d, why: 'gave the SP as a percentage of MP' },
      ...nearPcts(d, 3),
    ],
    steps: [`Discount = ${rs(mp)} − ${rs(sp)} = ${rs(mp - sp)}.`, `Rate = $\\frac{${mp - sp}}{${mp}} \\times 100$ = ${d}%.`],
    shortcut: `Discount ÷ MP × 100.`,
    trap: `The base for a discount is the marked price.`,
    tags: ['pl:discount'],
  });
}

function gst(ctx: Ctx): Res {
  const { rng } = ctx;
  const d = rng.pick([10, 15, 20, 25]);
  const g = rng.pick([5, 12, 18]);
  const f = fmul(factor(fr(-d)), factor(fr(g)));
  const { item, price: mp } = priceFor(rng, unitFor(f, factor(fr(-d)), factor(fr(g))) * 10, 400, 5000);
  const disc = (mp * (100 - d)) / 100;
  const paid = scale(mp, f);
  return emit(ctx, {
    facts: { form: 'gst', mp, d, gst: g },
    prompt: `A ${item} is marked at ${rs(mp)}. The shopkeeper gives a discount of ${d}% and then charges GST at ${g}% on the discounted price. How much does the customer pay?`,
    answer: paid,
    format: rs,
    mistakes: [
      { value: (mp * (100 - d + g)) / 100, why: 'combined discount and GST additively', trap: `${rs((mp * (100 - d + g)) / 100)} applies −${d}% + ${g}% = ${g - d}% at once. GST is charged on the discounted price, so the factors multiply.` },
      { value: disc, why: 'forgot the GST' },
      { value: disc + (mp * g) / 100, why: 'charged GST on the marked price' },
      { value: (mp * (100 + g)) / 100, why: 'forgot the discount' },
    ],
    steps: [`Discounted price = ${rs(mp)} × ${texFr(fr(100 - d, 100))} = ${rs(disc)}.`, `GST = ${g}% of ${rs(disc)} = ${rs(paid - disc)}.`, `Amount paid = ${rs(disc)} + ${rs(paid - disc)} = ${rs(paid)}.`],
    shortcut: `${rs(mp)} × ${facTex(-d)} × ${facTex(g)} = ${rs(paid)}.`,
    trap: `GST is on the discounted price; percentages on different bases cannot be combined by adding.`,
    tags: ['pl:discount', 'pl:gst'],
  });
}

function gstMp(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('gst-mp', 100, () => {
    const d = rng.pick([10, 20, 25, 30]);
    const g = rng.pick([5, 12, 18]);
    const f = fmul(factor(fr(-d)), factor(fr(g)));
    const { item, price: mp } = priceFor(rng, unitFor(f, factor(fr(-d))) * 10, 400, 6000);
    const paid = scale(mp, f);
    if (!whole(paid)) return null;
    const reversed = (paid * (100 + d) * (100 - g)) / 10000;
    return emit(ctx, {
      facts: { form: 'gst-mp', paid, d, gst: g },
      prompt: `A shopkeeper gives a discount of ${d}% on the marked price of a ${item} and then adds GST at ${g}% on the discounted price. A customer pays ${rs(paid)}. What is the marked price?`,
      answer: mp,
      format: rs,
      mistakes: [
        { value: reversed, why: 'reversed each percentage on the amount paid', trap: `${rs(Math.round(reversed))} adds back ${d}% and removes ${g}% of the amount paid. Undo each step by dividing: MP = paid ÷ ${facTex(-d)} ÷ ${facTex(g)}.` },
        { value: (paid * 100) / (100 - d + g), why: 'combined the two percentages additively' },
        { value: (paid * 100) / (100 - d), why: 'ignored the GST' },
        { value: (paid * 100) / (100 + g), why: 'ignored the discount' },
      ],
      steps: [`Paid = MP × ${facTex(-d)} × ${facTex(g)} = MP × ${texFr(f)}.`, `MP = ${rs(paid)} ÷ ${texFr(f)} = ${rs(mp)}.`],
      shortcut: `Combined factor ${texFr(f)}; divide once.`,
      trap: `Undo percentage steps by dividing by their factors, never by applying the opposite percentage.`,
      tags: ['pl:discount', 'pl:gst', 'pl:reverse'],
    });
  });
}

function twoDiscountProfit(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('two-discount-profit', 300, () => {
    const d1 = rng.pick([10, 12, 15, 20]);
    const p1 = rng.pick([8, 10, 12, 20, 26, 35]);
    const d2 = rng.pick([20, 25, 30, 5]);
    if (d1 === d2) return null;
    const ratio = fdiv(factor(fr(p1)), factor(fr(-d1))); // MP / CP
    const p2 = fval(toPct(fsub(fmul(ratio, factor(fr(-d2))), fr(1))));
    if (!isTwoDp(p2) || Math.abs(p2) < 1e-9 || Math.abs(p2) > 60) return null;
    const additive = p1 - (d2 - d1);
    return emit(ctx, {
      facts: { form: 'two-discount-profit', p1, d1, d2 },
      prompt: `After allowing a discount of ${d1}% on the marked price, a shopkeeper makes a profit of ${p1}%. What would be the profit or loss percentage if he allowed a discount of ${d2}% instead?`,
      answer: p2,
      format: plPct,
      allowNegative: true,
      step: Number.isInteger(p2) ? 2 : 1,
      mistakes: [
        ...(Math.abs(additive - p2) > 1e-9 ? [{ value: additive, why: 'shifted the profit % by the change in discount %', trap: `${plPct(additive)} shifts the profit by ${d2 - d1} points. Discounts are on the MP and profit is on the CP, so work with CP = 100 and MP = ${dec(fval(ratio) * 100)}.` }] : []),
        { value: -p2, why: 'right size, wrong direction' },
        { value: p1 - (d1 - d2) * fval(ratio), why: 'scaled the discount change by MP/CP but used the wrong sign' },
      ],
      steps: [
        `Let CP = 100. SP = ${100 + p1} after a ${d1}% discount, so MP = ${100 + p1} ÷ ${texFr(fr(100 - d1, 100))} = ${dec(fval(ratio) * 100)}.`,
        `New SP = ${dec(fval(ratio) * 100)} × ${texFr(fr(100 - d2, 100))} = ${dec(fval(ratio) * (100 - d2))}.`,
        `Result = ${dec(fval(ratio) * (100 - d2))} − 100 = ${plPct(p2).toLowerCase()}.`,
      ],
      shortcut: `MP : CP = ${100 + p1} : ${100 - d1} is fixed; apply the new discount to it.`,
      trap: `Discount points and profit points are on different bases (MP vs CP), so they do not transfer one-for-one.`,
      tags: ['pl:discount', 'pl:markup', 'level:multi-step'],
    });
  });
}

function discount(ctx: Ctx): Res {
  const { rng, difficulty } = ctx;
  if (difficulty === 'easy') {
    const k = rng.int(0, 2);
    return k === 0 ? discountSp(ctx) : k === 1 ? discountMp(ctx) : discountPct(ctx);
  }
  if (difficulty === 'medium') return gst(ctx);
  if (difficulty === 'hard') return gstMp(ctx);
  return twoDiscountProfit(ctx);
}

/* ------------------------------------------------------------------ */
/* 3. Mark-up then discount                                            */
/* ------------------------------------------------------------------ */

function markupProfit(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('markup-profit', 200, () => {
    const m = rng.pick([fr(20), fr(25), fr(30), fr(40), fr(50), fr(60), fr(100, 3)]);
    const d = rng.pick([10, 12, 15, 20, 25]);
    const f = fmul(factor(m), factor(fr(-d)));
    const p = fval(toPct(fsub(f, fr(1))));
    if (!(p > 0) || !isTwoDp(p)) return null;
    const mv = fval(m);
    const [P] = pickPeople(rng, 1);
    return emit(ctx, {
      facts: { form: 'markup-profit', m, d },
      prompt: `${P.name}, a shopkeeper, marks ${his(P)} goods ${pctF(m)} above the cost price and allows a discount of ${d}% on the marked price. What is ${his(P)} profit percentage?`,
      answer: p,
      format: fmtPct,
      step: 1,
      mistakes: [
        { value: mv - d, why: 'subtracted the discount from the mark-up directly', trap: `${fmtPct(mv - d)} is ${pctF(m)} − ${d}%. The discount is on the marked price, which is larger than the CP, so it removes more than ${d}% of the CP.` },
        { value: mv - d + (mv * d) / 100, why: 'added the product term instead of subtracting it' },
        { value: mv, why: 'ignored the discount' },
        { value: d, why: 'confused discount with profit' },
      ],
      steps: [
        `Let CP = 100. MP = 100 + ${dec(mv)} = ${dec(100 + mv)}.`,
        `SP = ${dec(100 + mv)} − ${d}% of ${dec(100 + mv)} = ${dec(fval(f) * 100)}.`,
        `Profit = ${dec(fval(f) * 100)} − 100 = ${fmtPct(p)}.`,
      ],
      shortcut: `a + b + ab/100 with a = +${dec(mv)}, b = −${d}: ${dec(mv)} − ${d} − ${dec((mv * d) / 100)} = ${fmtPct(p)}.`,
      trap: `Mark-up is on CP but discount is on MP — they cannot be subtracted directly.`,
      tags: ['pl:markup', 'pl:discount', 'trick:a-plus-b-plus-ab-by-100'],
    });
  });
}

function markupAmount(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('markup-amount', 200, () => {
    const m = rng.pick([20, 25, 30, 40, 50, 60]);
    const d = rng.pick([10, 15, 20, 25]);
    const f = fmul(factor(fr(m)), factor(fr(-d)));
    if (!(fval(f) > 1)) return null;
    const { item, price: cp } = priceFor(rng, unitFor(f, factor(fr(m))) * 10);
    const mp = scale(cp, factor(fr(m)));
    const sp = scale(cp, f);
    const ask = rng.pick(['sp', 'profit'] as const);
    const answer = ask === 'sp' ? sp : sp - cp;
    const addSp = (cp * (100 + m - d)) / 100;
    const [P] = pickPeople(rng, 1);
    return emit(ctx, {
      facts: { form: 'markup-amount', cp, m, d, ask },
      prompt: `${P.name} buys a ${item} for ${rs(cp)}, marks it ${m}% above the cost price and sells it at a discount of ${d}%. ${ask === 'sp' ? `At what price does ${he(P)} sell it?` : `What is ${his(P)} profit?`}`,
      answer,
      format: rs,
      mistakes:
        ask === 'sp'
          ? [
              { value: addSp, why: 'combined mark-up and discount additively', trap: `${rs(addSp)} uses ${m}% − ${d}% = ${m - d}% on the CP. The discount is ${d}% of the MP (${rs(mp)}), not of the CP.` },
              { value: mp, why: 'gave the marked price' },
              { value: (cp * (100 - d)) / 100, why: 'applied the discount to the CP' },
              { value: mp - d, why: 'took the discount as ₹d' },
            ]
          : [
              { value: addSp - cp, why: 'combined mark-up and discount additively', trap: `${rs(addSp - cp)} is ${m - d}% of the CP. The discount is ${d}% of the MP, so the profit is ${rs(sp)} − ${rs(cp)}.` },
              { value: mp - cp, why: 'ignored the discount' },
              { value: (mp * d) / 100, why: 'gave the discount' },
              { value: sp, why: 'gave the SP' },
            ],
      steps: [`MP = ${rs(cp)} × ${facTex(m)} = ${rs(mp)}.`, `SP = ${rs(mp)} × ${facTex(-d)} = ${rs(sp)}.`, ...(ask === 'profit' ? [`Profit = ${rs(sp)} − ${rs(cp)} = ${rs(sp - cp)}.`] : [])],
      shortcut: `Net factor ${facTex(m)} × ${facTex(-d)} = ${texFr(f)}: ${ask === 'sp' ? `SP = ${rs(cp)} × ${texFr(f)}` : `profit = ${dec(fval(f) * 100 - 100)}% of ${rs(cp)}`}.`,
      trap: `The discount is on the marked price, not on the cost price.`,
      tags: ['pl:markup', 'pl:discount'],
    });
  });
}

function ratioMp(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('ratio-mp', 200, () => {
    const [a, b] = rng.pick([[4, 5], [5, 6], [3, 4], [5, 7], [4, 7], [2, 3], [5, 8]] as const);
    const p = rng.pick([10, 12, 15, 20, 25]);
    const cp = multipleIn(rng, 400, 2500, a * (100 / gcd(p, 100)));
    const mp = (cp * b) / a;
    const sp = scale(cp, factor(fr(p)));
    if (!whole(sp) || !(sp < mp)) return null;
    const profit = sp - cp;
    return emit(ctx, {
      facts: { form: 'ratio-mp', a, b, sp, profit },
      prompt: `The ratio of the cost price to the marked price of an article is ${a} : ${b}. It is sold for ${rs(sp)} after a discount, earning a profit of ${rs(profit)}. What is the marked price of the article?`,
      answer: mp,
      format: rs,
      mistakes: [
        { value: (sp * b) / a, why: 'applied the ratio to the SP instead of the CP', trap: `${rs(Math.round((sp * b) / a))} scales the selling price by ${b}/${a}. The ratio links CP and MP, so first find CP = ${rs(sp)} − ${rs(profit)} = ${rs(cp)}.` },
        { value: (cp * a) / b, why: 'reversed the ratio' },
        { value: cp, why: 'gave the cost price' },
        { value: sp + profit, why: 'added the profit to the SP' },
      ],
      steps: [`CP = SP − profit = ${rs(sp)} − ${rs(profit)} = ${rs(cp)}.`, `MP = CP × ${b}/${a} = ${rs(cp)} × ${b} ÷ ${a} = ${rs(mp)}.`],
      shortcut: `CP ↔ ${a} parts = ${rs(cp)}; MP ↔ ${b} parts.`,
      trap: `The ratio is CP : MP — apply it to the cost price, not to the selling price.`,
      tags: ['pl:markup', 'ratio:parts'],
    });
  });
}

function findMarkup(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('find-markup', 300, () => {
    const d = rng.pick([10, 12, 15, 20, 25, 30, 40]);
    const p = rng.pick([5, 8, 10, 12, 15, 20, 26, 35]);
    const m = fval(toPct(fsub(fdiv(factor(fr(p)), factor(fr(-d))), fr(1))));
    if (!isTwoDp(m) || m <= 0) return null;
    const [P] = pickPeople(rng, 1);
    return emit(ctx, {
      facts: { form: 'find-markup', d, p },
      prompt: `${P.name} wants to make a profit of ${p}% even after giving a discount of ${d}% on the marked price. By what percentage above the cost price should ${he(P)} mark the goods?`,
      answer: m,
      format: fmtPct,
      step: Number.isInteger(m) ? 2.5 : 1.25,
      mistakes: [
        { value: p + d, why: 'added the profit and discount percentages', trap: `${fmtPct(p + d)} adds ${p}% and ${d}%. The discount is taken off the MP, so MP must be ${100 + p} ÷ ${texFr(fr(100 - d, 100))} of CP.` },
        { value: fval(toPct(fmul(factor(fr(p)), factor(fr(d))))) - 100, why: 'multiplied by (1 + d%) instead of dividing by (1 − d%)' },
        { value: p + d + (p * d) / 100, why: 'used the successive-increase formula' },
      ],
      steps: [`Let CP = 100. Required SP = ${100 + p}.`, `SP = ${100 - d}% of MP, so MP = ${100 + p} × 100 ÷ ${100 - d} = ${dec(100 + m)}.`, `Mark-up = ${dec(100 + m)} − 100 = ${fmtPct(m)}.`],
      shortcut: `MP/CP = (100 + profit%) ÷ (100 − discount%) = ${100 + p}/${100 - d}.`,
      trap: `Mark-up is not profit% + discount%; divide by the discount factor.`,
      tags: ['pl:markup', 'pl:discount', 'pl:reverse'],
    });
  });
}

function findDiscount(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('find-discount', 300, () => {
    const m = rng.pick([20, 25, 30, 40, 50, 60, 80]);
    const p = rng.pick([4, 5, 8, 10, 12, 20, 26]);
    const d = fval(toPct(fsub(fr(1), fdiv(factor(fr(p)), factor(fr(m))))));
    if (!isTwoDp(d) || d <= 0) return null;
    const [P] = pickPeople(rng, 1);
    return emit(ctx, {
      facts: { form: 'find-discount', m, p },
      prompt: `${P.name} marks a ${rng.pick(ITEMS).name} ${m}% above its cost price. What is the maximum discount percentage ${he(P)} can allow and still make a profit of ${p}%?`,
      answer: d,
      format: fmtPct,
      step: Number.isInteger(d) ? 2 : 1.25,
      mistakes: [
        { value: m - p, why: 'subtracted the profit from the mark-up', trap: `${fmtPct(m - p)} is ${m}% − ${p}% of the CP; the discount is a percentage of the larger MP, so it is smaller than ${m - p}%.` },
        { value: fval(toPct(fdiv(fr(m - p), fr(100 + p)))), why: 'divided the gap by the SP' },
        ...nearPcts(d, 2),
      ],
      steps: [`Let CP = 100. MP = ${100 + m}; required SP = ${100 + p}.`, `Discount = ${100 + m} − ${100 + p} = ${m - p} on MP ${100 + m}.`, `Discount % = $\\frac{${m - p}}{${100 + m}} \\times 100$ = ${fmtPct(d)}.`],
      shortcut: `Discount % = (MP − SP) ÷ MP with CP = 100.`,
      trap: `The discount percentage is measured on the marked price, not on the cost price.`,
      tags: ['pl:markup', 'pl:discount'],
    });
  });
}

function secondArticle(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('second-article', 300, () => {
    const m = rng.pick([25, 30, 40, 50, 60]);
    const d = rng.pick([10, 12, 15, 20, 25]);
    const k = rng.pick([10, 20, 25, 30]);
    const l = rng.pick([5, 8, 10, 12, 15, 20]);
    const f = fmul(factor(fr(m)), factor(fr(-d)));
    const gain = fsub(f, fr(1));
    if (!(fval(gain) > 0)) return null;
    const cp = tryMultiple(rng, 400, 3000, unitFor(gain, f, factor(fr(k)), fmul(factor(fr(k)), factor(fr(-l)))));
    if (cp === null) return null;
    const profit = scale(cp, gain);
    const cp2 = scale(cp, factor(fr(k)));
    const sp2 = scale(cp2, factor(fr(-l)));
    if (![profit, cp2, sp2].every(whole)) return null;
    const additiveCp = (profit * 100) / (m - d);
    return emit(ctx, {
      facts: { form: 'second-article', m, d, profit, k, l },
      prompt: `A shopkeeper marks an article ${m}% above its cost price and sells it after a discount of ${d}%, earning a profit of ${rs(profit)}. A second article, whose cost price is ${k}% more than that of the first, is sold at a loss of ${l}%. What is the selling price of the second article?`,
      answer: sp2,
      format: rs,
      mistakes: [
        { value: scale(additiveCp, fmul(factor(fr(k)), factor(fr(-l)))), why: 'found the first CP with an additive mark-up/discount', trap: `That value treats the first article's profit as ${m - d}% of its CP. The real profit is ${dec(fval(gain) * 100)}% (mark-up and discount multiply).` },
        { value: cp2, why: 'gave the CP of the second article' },
        { value: scale(cp, factor(fr(-l))), why: 'applied the loss to the first CP' },
        { value: scale(cp2, factor(fr(l))), why: 'added the loss instead of subtracting' },
      ],
      steps: [
        `Article 1: CP = 100 ⇒ SP = ${100 + m} × ${facTex(-d)} = ${dec(fval(f) * 100)}, profit = ${dec(fval(gain) * 100)}%.`,
        `${dec(fval(gain) * 100)}% of CP = ${rs(profit)} ⇒ CP₁ = ${rs(cp)}.`,
        `CP₂ = ${rs(cp)} × ${facTex(k)} = ${rs(cp2)}.`,
        `SP₂ = ${rs(cp2)} × ${facTex(-l)} = ${rs(sp2)}.`,
      ],
      shortcut: `One chain of factors: ${rs(profit)} ÷ ${dec(fval(gain) * 100)}% × ${facTex(k)} × ${facTex(-l)}.`,
      trap: `The first article's profit % is ${dec(fval(gain) * 100)}%, not ${m - d}% — get CP₁ right before moving to the second article.`,
      tags: ['pl:markup', 'pl:discount', 'level:multi-step'],
    });
  });
}

function markupDiscount(ctx: Ctx): Res {
  const { rng, difficulty } = ctx;
  if (difficulty === 'easy') return markupProfit(ctx);
  if (difficulty === 'medium') return rng.chance(0.6) ? markupAmount(ctx) : ratioMp(ctx);
  if (difficulty === 'hard') return rng.chance(0.5) ? findMarkup(ctx) : findDiscount(ctx);
  return secondArticle(ctx);
}

/* ------------------------------------------------------------------ */
/* 4. Successive discounts                                             */
/* ------------------------------------------------------------------ */

const discountFactor = (ds: number[]): Fr => ds.reduce<Fr>((acc, d) => fmul(acc, factor(fr(-d))), fr(1));

function equivDiscount(ctx: Ctx, n: 2 | 3): Res {
  const { rng } = ctx;
  return attempt('equiv-discount', 200, () => {
    const ds = Array.from({ length: n }, () => rng.pick([5, 10, 15, 20, 25, 30]));
    const eq = fval(toPct(fsub(fr(1), discountFactor(ds))));
    if (!isTwoDp(eq)) return null;
    const sum = ds.reduce((s, d) => s + d, 0);
    return emit(ctx, {
      facts: { form: 'equiv-discount', ds },
      prompt: `A shop offers successive discounts of ${ds.map((d) => `${d}%`).join(', ').replace(/, ([^,]*)$/, ' and $1')} on the marked price of a ${rng.pick(ITEMS).name}. What single discount is equivalent to them?`,
      answer: eq,
      format: fmtPct,
      step: Number.isInteger(eq) ? 1 : 0.5,
      mistakes: [
        { value: sum, why: 'added the discounts', trap: `${fmtPct(sum)} adds the discounts. Each later discount is on an already reduced price, so the total is less than ${sum}%.` },
        { value: sum + (n === 2 ? (ds[0] * ds[1]) / 100 : 0), why: 'added the product term instead of subtracting it' },
        ...(n === 3 ? [{ value: fval(toPct(fsub(fr(1), discountFactor(ds.slice(0, 2))))), why: 'stopped after two discounts' }] : []),
      ],
      steps: [
        `Price after the discounts = ${ds.map((d) => `${100 - d}%`).join(' of ')} of MP.`,
        `= ${dec(fval(discountFactor(ds)) * 100)}% of MP.`,
        `Single discount = 100% − ${dec(fval(discountFactor(ds)) * 100)}% = ${fmtPct(eq)}.`,
      ],
      shortcut: n === 2 ? `a + b − ab/100 = ${ds[0]} + ${ds[1]} − ${dec((ds[0] * ds[1]) / 100)} = ${fmtPct(eq)}.` : `Apply two at a time with a + b − ab/100, then combine with the third.`,
      trap: `Successive discounts never simply add up.`,
      tags: ['pl:successive-discounts', 'trick:a-plus-b-minus-ab-by-100'],
    });
  });
}

function succSp(ctx: Ctx): Res {
  const { rng } = ctx;
  const ds = [rng.pick([10, 15, 20, 25]), rng.pick([5, 10, 20])];
  const f = discountFactor(ds);
  const { item, price: mp } = priceFor(rng, unitFor(f, factor(fr(-ds[0]))) * 10, 400, 5000);
  const sp = scale(mp, f);
  const after1 = scale(mp, factor(fr(-ds[0])));
  const sum = ds[0] + ds[1];
  return emit(ctx, {
    facts: { form: 'succ-sp', mp, ds },
    prompt: `A ${item} is marked at ${rs(mp)}. During a festival sale, the shopkeeper gives successive discounts of ${ds[0]}% and ${ds[1]}%. What is the selling price?`,
    answer: sp,
    format: rs,
    mistakes: [
      { value: (mp * (100 - sum)) / 100, why: 'added the discounts', trap: `${rs((mp * (100 - sum)) / 100)} takes ${sum}% off in one go. The second discount is on ${rs(after1)}, not on ${rs(mp)}.` },
      { value: after1, why: 'applied only the first discount' },
      { value: mp - sp, why: 'gave the total discount' },
      { value: (mp * (100 - ds[1])) / 100, why: 'applied only the second discount' },
    ],
    steps: [`After ${ds[0]}%: ${rs(mp)} × ${facTex(-ds[0])} = ${rs(after1)}.`, `After ${ds[1]}%: ${rs(after1)} × ${facTex(-ds[1])} = ${rs(sp)}.`],
    shortcut: `${rs(mp)} × ${texFr(f)} in one step.`,
    trap: `Apply discounts one after another; the second one acts on the reduced price.`,
    tags: ['pl:successive-discounts'],
  });
}

function succMp(ctx: Ctx): Res {
  const { rng } = ctx;
  const ds = [rng.pick([10, 20, 25]), rng.pick([10, 20, 25])];
  const f = discountFactor(ds);
  const { item, price: mp } = priceFor(rng, unitFor(f, factor(fr(-ds[0]))) * 10, 400, 5000);
  const sp = scale(mp, f);
  const sum = ds[0] + ds[1];
  const reversed = (sp * (100 + ds[0]) * (100 + ds[1])) / 10000;
  return emit(ctx, {
    facts: { form: 'succ-mp', sp, ds },
    prompt: `After two successive discounts of ${ds[0]}% and ${ds[1]}%, a ${item} is sold for ${rs(sp)}. What is its marked price?`,
    answer: mp,
    format: rs,
    mistakes: [
      { value: reversed, why: 'added the discount percentages back on the SP', trap: `${rs(Math.round(reversed))} adds ${ds[0]}% and ${ds[1]}% back on the selling price. Each discount was on a bigger price, so divide: MP = SP ÷ ${texFr(f)}.` },
      { value: (sp * 100) / (100 - sum), why: 'treated the discounts as one discount of their sum' },
      { value: (sp * (100 + sum)) / 100, why: 'added the sum of the discounts to the SP' },
      { value: scale(sp, factor(fr(ds[0]))), why: 'undid only one discount' },
    ],
    steps: [`SP = MP × ${facTex(-ds[0])} × ${facTex(-ds[1])} = MP × ${texFr(f)}.`, `MP = ${rs(sp)} ÷ ${texFr(f)} = ${rs(mp)}.`],
    shortcut: `Combined factor ${texFr(f)}; divide once.`,
    trap: `Discounts are undone by dividing by their factors, not by adding the percentages back.`,
    tags: ['pl:successive-discounts', 'pl:reverse'],
  });
}

function discountGap(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('discount-gap', 200, () => {
    const ds = [rng.pick([10, 15, 20, 25]), rng.pick([5, 10, 15, 20])];
    const single = ds[0] + ds[1];
    const gapF = fsub(discountFactor(ds), factor(fr(-single))); // = d1 d2 / 10000
    const mp = multipleIn(rng, 1000, 12000, unitFor(gapF, discountFactor(ds)) * 10);
    const gap = scale(mp, gapF);
    if (!whole(gap) || gap < 10) return null;
    return emit(ctx, {
      facts: { form: 'discount-gap', single, ds, gap },
      prompt: `On the same marked price, a single discount of ${single}% gives a customer ${rs(gap)} more than two successive discounts of ${ds[0]}% and ${ds[1]}%. What is the marked price?`,
      answer: mp,
      format: rs,
      mistakes: [
        { value: (gap * 100) / ds[1], why: 'took the gap as the second discount percentage of MP' },
        { value: (gap * 100) / single, why: 'took the gap as the single discount' },
        { value: (gap * 10000) / (ds[0] * ds[1]) / 2, why: 'halved the product term', trap: `The gap is exactly ${ds[0]} × ${ds[1]}/100 = ${dec((ds[0] * ds[1]) / 100)}% of the MP, not half of it.` },
        { value: (gap * 10000) / (ds[0] * ds[1]) * 2, why: 'doubled the product term' },
      ],
      steps: [
        `Successive ${ds[0]}% and ${ds[1]}% = ${ds[0]} + ${ds[1]} − ${dec((ds[0] * ds[1]) / 100)} = ${dec(single - (ds[0] * ds[1]) / 100)}%.`,
        `Gap = ${single}% − ${dec(single - (ds[0] * ds[1]) / 100)}% = ${dec((ds[0] * ds[1]) / 100)}% of MP = ${rs(gap)}.`,
        `MP = ${rs(gap)} × 100 ÷ ${dec((ds[0] * ds[1]) / 100)} = ${rs(mp)}.`,
      ],
      shortcut: `The gap between a + b and "a then b" is always ab/100 % of MP.`,
      trap: `Only the product term ab/100 separates the two offers.`,
      tags: ['pl:successive-discounts', 'trick:product-term'],
    });
  });
}

function succMarkup(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('succ-markup', 300, () => {
    const ds = [rng.pick([10, 20, 25]), rng.pick([10, 20])];
    const p = rng.pick([8, 10, 12, 20, 26, 35, 44]);
    const f = discountFactor(ds);
    const m = fval(toPct(fsub(fdiv(factor(fr(p)), f), fr(1))));
    if (!isTwoDp(m) || m <= 0 || m > 150) return null;
    const sum = ds[0] + ds[1];
    return emit(ctx, {
      facts: { form: 'succ-markup', ds, p },
      prompt: `A trader gives successive discounts of ${ds[0]}% and ${ds[1]}% on the marked price and still makes a profit of ${p}%. By what percentage above the cost price are the goods marked?`,
      answer: m,
      format: fmtPct,
      step: Number.isInteger(m) ? 5 : 2.5,
      mistakes: [
        { value: p + sum, why: 'added the profit and both discounts', trap: `${fmtPct(p + sum)} adds ${p}% + ${ds[0]}% + ${ds[1]}%. The discounts come off the MP successively, so MP = ${100 + p} ÷ ${texFr(f)} of CP.` },
        { value: fval(toPct(fsub(fdiv(factor(fr(p)), factor(fr(-sum))), fr(1)))), why: 'combined the discounts by adding them' },
        { value: p + sum - (ds[0] * ds[1]) / 100, why: 'added the profit to the single-equivalent discount' },
      ],
      steps: [
        `Let CP = 100; SP = ${100 + p}.`,
        `SP = MP × ${facTex(-ds[0])} × ${facTex(-ds[1])} = MP × ${texFr(f)}.`,
        `MP = ${100 + p} ÷ ${texFr(f)} = ${dec(100 + m)}.`,
        `Mark-up = ${fmtPct(m)}.`,
      ],
      shortcut: `MP/CP = (100 + profit%) ÷ (product of the discount factors).`,
      trap: `Neither the discounts nor the profit can be added to get the mark-up.`,
      tags: ['pl:successive-discounts', 'pl:markup', 'level:multi-step'],
    });
  });
}

function successiveDiscounts(ctx: Ctx): Res {
  const { rng, difficulty } = ctx;
  if (difficulty === 'easy') return equivDiscount(ctx, 2);
  if (difficulty === 'medium') return rng.chance(0.5) ? succSp(ctx) : succMp(ctx);
  if (difficulty === 'hard') return rng.chance(0.5) ? discountGap(ctx) : equivDiscount(ctx, 3);
  return succMarkup(ctx);
}

/* ------------------------------------------------------------------ */
/* 5. Profit on SP vs CP                                               */
/* ------------------------------------------------------------------ */

function spBasis(ctx: Ctx): Res {
  const { rng } = ctx;
  const p = rng.pick([fr(10), fr(20), fr(25), fr(50, 3), fr(40), fr(50), fr(100, 3), fr(25, 2)]);
  const ans = fval(toPct(fdiv(p, fsub(fr(100), p))));
  const pv = fval(p);
  return emit(ctx, {
    facts: { form: 'sp-basis', p },
    prompt: `A shopkeeper calculates his profit as ${pctF(p)} of the selling price. What is his actual profit percentage on the cost price?`,
    answer: ans,
    format: fmtPct,
    mistakes: [
      { value: pv, why: 'assumed the same percentage on CP', trap: `${pctF(p)} is the profit as a share of the SP. The CP is smaller than the SP, so the same profit is a bigger share of the CP.` },
      { value: fval(toPct(fdiv(p, fadd100(p)))), why: 'divided by (100 + p) instead of (100 − p)' },
      ...nearPcts(ans, 3),
    ],
    steps: [
      `Let SP = 100. Profit = ${pctF(p)} of 100 = ${dec(pv)}.`,
      `CP = 100 − ${dec(pv)} = ${dec(100 - pv)}.`,
      `Profit % on CP = $\\frac{${dec(pv)}}{${dec(100 - pv)}} \\times 100$ = ${fmtPct(ans)}.`,
    ],
    shortcut: `Fraction method: profit = ${texFr(fdiv(p, fr(100)))} of SP ⇒ ${texFr(fdiv(fdiv(p, fr(100)), fsub(fr(1), fdiv(p, fr(100)))))} of CP.`,
    trap: `Profit on SP is smaller than the same profit expressed on CP.`,
    tags: ['pl:profit-on-sp', 'trick:fraction-equivalent'],
  });
}

function fadd100(p: Fr): Fr {
  return fr(p[0] + 100 * p[1], p[1]);
}

function spBasisLoss(ctx: Ctx): Res {
  const { rng } = ctx;
  const l = rng.pick([10, 20, 25, 50, 12.5]);
  const lf = l === 12.5 ? fr(25, 2) : fr(l);
  const ans = fval(toPct(fdiv(lf, fadd100(lf))));
  return emit(ctx, {
    facts: { form: 'sp-basis-loss', l },
    prompt: `A trader's loss on a sale is ${fmtPct(l)} of the selling price. What is his loss percentage on the cost price?`,
    answer: ans,
    format: fmtPct,
    mistakes: [
      { value: l, why: 'assumed the same percentage on CP', trap: `${fmtPct(l)} is the loss as a share of the SP. In a loss the CP is bigger than the SP, so the loss is a smaller share of the CP.` },
      { value: fval(toPct(fdiv(lf, fsub(fr(100), lf)))), why: 'divided by (100 − l) instead of (100 + l)' },
      ...nearPcts(ans, 3),
    ],
    steps: [`Let SP = 100. Loss = ${fmtPct(l).replace('%', '')}.`, `CP = 100 + ${dec(l)} = ${dec(100 + l)}.`, `Loss % on CP = $\\frac{${dec(l)}}{${dec(100 + l)}} \\times 100$ = ${fmtPct(ans)}.`],
    shortcut: `Loss of l% on SP = l/(100 + l) on CP.`,
    trap: `For a loss, CP > SP, so the percentage on CP is smaller.`,
    tags: ['pl:profit-on-sp'],
  });
}

function spBasisCp(ctx: Ctx): Res {
  const { rng } = ctx;
  const p = rng.pick([10, 15, 20, 25, 30]);
  const sp = multipleIn(rng, 400, 3000, (100 / gcd(p, 100)) * 5);
  const cp = sp - (sp * p) / 100;
  const [P] = pickPeople(rng, 1);
  return emit(ctx, {
    facts: { form: 'sp-basis-cp', sp, p },
    prompt: `${P.name} sells a ${rng.pick(ITEMS).name} for ${rs(sp)}. ${He(P)} makes a profit equal to ${p}% of the selling price. What is the cost price?`,
    answer: cp,
    format: rs,
    mistakes: [
      { value: (sp * 100) / (100 + p), why: 'treated the profit as a percentage of the CP', trap: `${rs(Math.round((sp * 100) / (100 + p)))} divides the SP by ${facTex(p)}, which is right only for profit on CP. Here profit = ${p}% of SP, so CP = ${100 - p}% of SP.` },
      { value: (sp * p) / 100, why: 'gave the profit' },
      { value: sp + (sp * p) / 100, why: 'added the profit to the SP' },
      { value: (sp * 100) / (100 - p), why: 'divided by (1 − p%) instead of multiplying' },
    ],
    steps: [`Profit = ${p}% of ${rs(sp)} = ${rs((sp * p) / 100)}.`, `CP = ${rs(sp)} − ${rs((sp * p) / 100)} = ${rs(cp)}.`],
    shortcut: `CP = ${100 - p}% of SP.`,
    trap: `Read the base: "${p}% of the selling price".`,
    tags: ['pl:profit-on-sp'],
  });
}

function spBasisShift(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('sp-basis-shift', 200, () => {
    const p = rng.pick([20, 25, 30, 40]);
    const rise = rng.pick([10, 20, 25]);
    const cp1 = 100 - p;
    const cp2 = (cp1 * (100 + rise)) / 100;
    if (cp2 >= 100) return null;
    const ans = ((100 - cp2) / cp2) * 100;
    if (!isTwoDp(ans) && fr(Math.round((100 - cp2) * 100), Math.round(cp2 * 100))[1] > 12) return null;
    return emit(ctx, {
      facts: { form: 'sp-basis-shift', p, rise },
      prompt: `A shopkeeper earns a profit equal to ${p}% of the selling price of an article. If the cost price goes up by ${rise}% and the selling price stays the same, what will be the profit percentage on the new cost price?`,
      answer: ans,
      format: fmtPct,
      mistakes: [
        { value: fval(toPct(fdiv(fr(p), fr(100 - p)))) - rise, why: 'subtracted the rise from the profit % on CP', trap: `Subtracting ${rise} points ignores that the ${rise}% rise is on the CP and the profit shrinks while the base grows.` },
        { value: p - rise, why: 'subtracted the rise from the profit on SP' },
        { value: 100 - cp2, why: 'gave the new profit as % of SP' },
        ...nearPcts(ans, 2),
      ],
      steps: [`Let SP = 100. Profit = ${p}, so CP = ${cp1}.`, `New CP = ${cp1} × ${facTex(rise)} = ${dec(cp2)}.`, `New profit = 100 − ${dec(cp2)} = ${dec(100 - cp2)}.`, `Profit % on new CP = $\\frac{${dec(100 - cp2)}}{${dec(cp2)}} \\times 100$ = ${fmtPct(ans)}.`],
      shortcut: `Fix SP = 100 and recompute CP; everything else follows.`,
      trap: `Percentage points do not subtract across different bases — recompute from SP = 100.`,
      tags: ['pl:profit-on-sp', 'level:multi-step'],
    });
  });
}

function spBasisDiff(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('sp-basis-diff', 200, () => {
    const p = rng.pick([10, 20, 25, 30]);
    // profit on SP basis = pS; CP = (1 − p)S; profit on CP basis (same CP) = p(1 − p)S; diff = p²S
    const unit = 10000 / gcd(p * p, 10000);
    const sp = multipleIn(rng, 1000, 12000, unit);
    const diff = (sp * p * p) / 10000;
    if (!whole(diff) || diff < 10) return null;
    return emit(ctx, {
      facts: { form: 'sp-basis-diff', p, diff },
      prompt: `A shopkeeper sells an article and counts his profit as ${p}% of the selling price. Had he counted ${p}% of the cost price as profit (with the same cost price), his profit would have been ${rs(diff)} less. What is the selling price?`,
      answer: sp,
      format: rs,
      mistakes: [
        { value: (diff * 100) / p, why: 'took the gap as p% of the SP', trap: `${rs(Math.round((diff * 100) / p))} treats ${rs(diff)} as ${p}% of the SP. The gap is ${p}% of (SP − CP) = ${p}% of ${p}% of SP = ${dec((p * p) / 100)}% of SP.` },
        { value: (sp * (100 - p)) / 100, why: 'gave the cost price' },
        { value: (diff * 10000) / (p * (100 - p)), why: 'used p(100 − p) instead of p²' },
        { value: (sp * p) / 100, why: 'gave the profit on SP' },
      ],
      steps: [
        `Profit (on SP) = ${p}% of SP; CP = ${100 - p}% of SP.`,
        `Profit (on CP) = ${p}% of ${100 - p}% of SP = ${dec((p * (100 - p)) / 100)}% of SP.`,
        `Gap = ${p}% − ${dec((p * (100 - p)) / 100)}% = ${dec((p * p) / 100)}% of SP = ${rs(diff)}.`,
        `SP = ${rs(diff)} × 100 ÷ ${dec((p * p) / 100)} = ${rs(sp)}.`,
      ],
      shortcut: `The gap is p% of p% of SP = ${dec((p * p) / 100)}% of SP.`,
      trap: `The two profits differ by p% of the profit itself, not by p% of the SP.`,
      tags: ['pl:profit-on-sp', 'level:multi-step'],
    });
  });
}

function profitOnSp(ctx: Ctx): Res {
  const { rng, difficulty } = ctx;
  if (difficulty === 'easy') return spBasis(ctx);
  if (difficulty === 'medium') return rng.chance(0.5) ? spBasisCp(ctx) : spBasisLoss(ctx);
  if (difficulty === 'hard') return spBasisShift(ctx);
  return spBasisDiff(ctx);
}

/* ------------------------------------------------------------------ */
/* 6. Dishonest dealer                                                 */
/* ------------------------------------------------------------------ */

function falseWeight(ctx: Ctx, level: 'easy' | 'medium' | 'extreme'): Res {
  const { rng } = ctx;
  return attempt('false-weight', 400, () => {
    const grams = rng.pick(level === 'easy' ? [750, 800, 875, 900, 960, 950] : [800, 840, 850, 880, 900, 920, 950, 960]);
    const markup = level === 'easy' ? 0 : rng.pick([5, 8, 10, 12, 15, 20, 25]);
    const discount = level === 'extreme' ? rng.pick([4, 5, 8, 10, 12]) : 0;
    const sell = fmul(factor(fr(markup)), factor(fr(-discount))); // price per unit / CP per unit
    const gainF = fsub(fmul(sell, fr(1000, grams)), fr(1));
    const gain = fval(toPct(gainF));
    if (!(gain > 0)) return null;
    const pctFr = toPct(gainF);
    if (!isTwoDp(gain) && pctFr[1] > 20) return null;
    const good = rng.pick(['rice', 'sugar', 'pulses', 'tea leaves', 'cashew nuts']);
    const naive = markup - discount + (1000 - grams) / 10;
    const onSell = (1000 - grams) / 10;
    const pricing = markup === 0 ? 'at the cost price' : discount === 0 ? `at ${markup}% above the cost price` : `after marking it ${markup}% above the cost price and giving a discount of ${discount}%`;
    return emit(ctx, {
      facts: { form: 'false-weight', grams, markup, discount },
      prompt: `A dishonest shopkeeper sells ${good} ${pricing}, but uses a weight of ${grams} g in place of 1 kg. What is his overall gain percentage?`,
      answer: gain,
      format: fmtPct,
      mistakes: [
        { value: naive, why: 'added the weight shortfall (as % of 1 kg) to the price gain', trap: `${fmtPct(naive)} adds ${dec((1000 - grams) / 10)}% for the weight to the price effect. The ${1000 - grams} g saved is a share of the ${grams} g actually given, not of 1,000 g, and the effects multiply.` },
        { value: onSell, why: 'divided the shortfall by 1,000 g instead of the grams given' },
        ...(markup > 0
          ? [
              { value: fval(toPct(fsub(sell, fr(1)))), why: 'ignored the false weight' },
              { value: fval(toPct(fr(1000 - grams, grams))), why: 'ignored the price mark-up' },
            ]
          : []),
        ...nearPcts(gain, 2),
      ].filter((m) => m.value > 0),
      steps: [
        `Let the CP be ₹1 per gram, i.e. ₹1,000 per kg.`,
        `He gives ${grams} g, which costs him ₹${grams}.`,
        `He charges for 1 kg: ₹1,000${markup ? ` × ${texFr(sell)} = ₹${dec(1000 * fval(sell))}` : ''}.`,
        `Gain % = $\\frac{${dec(1000 * fval(sell))} - ${grams}}{${grams}} \\times 100$ = ${fmtPct(gain)}.`,
      ],
      shortcut: `Gain factor = (price factor) × (1000 ÷ ${grams}) = ${texFr(fadd1(gainF))}.`,
      trap: `The gain is measured on what he actually gives (${grams} g), not on 1 kg.`,
      tags: ['pl:dishonest-dealer', 'pl:false-weight'],
    });
  });
}

function fadd1(f: Fr): Fr {
  return fr(f[0] + f[1], f[1]);
}

function shortMeasure(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('short-measure', 300, () => {
    const less = rng.pick([10, 20, 25, 4, 5]);
    const markup = rng.pick([0, 5, 10, 20]);
    const gainF = fsub(fdiv(factor(fr(markup)), factor(fr(-less))), fr(1));
    const gain = fval(toPct(gainF));
    if (!(gain > 0) || (!isTwoDp(gain) && toPct(gainF)[1] > 20)) return null;
    const good = rng.pick(['milk', 'cooking oil', 'kerosene', 'rice']);
    return emit(ctx, {
      facts: { form: 'short-measure', less, markup },
      prompt: `A shopkeeper sells ${good} ${markup ? `at ${markup}% above the cost price` : 'at the cost price'} but gives ${less}% less quantity than he charges for. What is his gain percentage?`,
      answer: gain,
      format: fmtPct,
      mistakes: [
        { value: markup + less, why: 'added the short measure to the mark-up', trap: `${fmtPct(markup + less)} adds ${less}% to ${markup}%. Giving ${less}% less means he delivers only ${100 - less}% of what he charges for, so divide by ${texFr(fr(100 - less, 100))}.` },
        { value: markup + less + (markup * less) / 100, why: 'multiplied by (1 + less%) instead of dividing by (1 − less%)' },
        ...nearPcts(gain, 3),
      ],
      steps: [`Let CP = ₹1 per unit. He charges for 100 units: ₹${100 + markup}.`, `He actually gives ${100 - less} units, costing ₹${100 - less}.`, `Gain % = $\\frac{${100 + markup} - ${100 - less}}{${100 - less}} \\times 100$ = ${fmtPct(gain)}.`],
      shortcut: `Gain factor = ${100 + markup}/${100 - less}.`,
      trap: `The short measure is a divisor, not an extra percentage to add.`,
      tags: ['pl:dishonest-dealer'],
    });
  });
}

function cheatBoth(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('cheat-both', 200, () => {
    const buy = rng.pick([10, 20, 25]);
    const sell = rng.pick([10, 20, 25]);
    const gainF = fsub(fr(100 + buy, 100 - sell), fr(1));
    const gain = fval(toPct(gainF));
    if (!isTwoDp(gain) && toPct(gainF)[1] > 12) return null;
    return emit(ctx, {
      facts: { form: 'cheat-both', buy, sell },
      prompt: `A dishonest trader cheats both his supplier and his customers. While buying, he takes ${buy}% more goods than he pays for, and while selling, he gives ${sell}% less than what he charges for. If he sells at the cost price, what is his gain percentage?`,
      answer: gain,
      format: fmtPct,
      mistakes: [
        { value: buy + sell, why: 'added the two cheating percentages', trap: `${fmtPct(buy + sell)} adds ${buy}% and ${sell}%. The effects multiply: he gets ${100 + buy} units for the price of 100 and sells ${100 - sell} units for the price of 100.` },
        { value: buy + sell + (buy * sell) / 100, why: 'used (1 + b)(1 + s) instead of (1 + b)/(1 − s)' },
        ...nearPcts(gain, 3),
      ],
      steps: [
        `He pays ₹100 and receives ${100 + buy} units.`,
        `He sells ${100 - sell} units for ₹100, so ${100 + buy} units fetch ₹100 × ${100 + buy}/${100 - sell} = ₹${dec((100 * (100 + buy)) / (100 - sell))}.`,
        `Gain % = ${fmtPct(gain)}.`,
      ],
      shortcut: `Gain factor = (100 + ${buy}) ÷ (100 − ${sell}).`,
      trap: `Cheating while buying and while selling compounds; it does not add.`,
      tags: ['pl:dishonest-dealer'],
    });
  });
}

function dishonestDealer(ctx: Ctx): Res {
  const { rng, difficulty } = ctx;
  if (difficulty === 'easy') return falseWeight(ctx, 'easy');
  if (difficulty === 'medium') return rng.chance(0.5) ? falseWeight(ctx, 'medium') : shortMeasure(ctx);
  if (difficulty === 'hard') return cheatBoth(ctx);
  return falseWeight(ctx, 'extreme');
}

/* ------------------------------------------------------------------ */
/* 7. Buy x get y free                                                 */
/* ------------------------------------------------------------------ */

const OFFERS: [number, number][] = [[4, 1], [3, 1], [5, 1], [2, 1], [3, 2], [7, 3], [9, 1], [6, 2], [8, 2]];

function freeDiscount(ctx: Ctx): Res {
  const { rng } = ctx;
  const [buy, free] = rng.pick(OFFERS);
  const ans = (free / (buy + free)) * 100;
  const item = rng.pick(['shirts', 'soap bars', 'notebooks', 'packets of biscuits', 'pens']);
  return emit(ctx, {
    facts: { form: 'free-discount', buy, free },
    prompt: `A store runs a "Buy ${buy}, get ${free} free" offer on ${item}. What is the effective discount percentage?`,
    answer: ans,
    format: fmtPct,
    mistakes: [
      { value: (free / buy) * 100, why: 'divided the free items by the items paid for', trap: `${fmtPct((free / buy) * 100)} divides ${free} by ${buy}. The customer receives ${buy + free} items, so the discount is ${free} out of ${buy + free}.` },
      { value: (buy / (buy + free)) * 100, why: 'gave the share paid for' },
      ...nearPcts(ans, 3),
    ],
    steps: [`Customer pays for ${buy} and gets ${buy + free}.`, `Discount = ${free} items' price out of ${buy + free} items' price.`, `= $\\frac{${free}}{${buy + free}} \\times 100$ = ${fmtPct(ans)}.`],
    shortcut: `Discount = free ÷ (paid + free).`,
    trap: `The base is the total number of items taken home.`,
    tags: ['pl:buy-get-free'],
  });
}

function freeProfit(ctx: Ctx, withDiscount: boolean): Res {
  const { rng } = ctx;
  return attempt('free-profit', 400, () => {
    const [buy, free] = rng.pick(OFFERS);
    const markup = rng.pick([20, 25, 40, 50, 60, 80, 100]);
    const discount = withDiscount ? rng.pick([4, 5, 10, 20]) : 0;
    const f = fmul(fmul(factor(fr(markup)), factor(fr(-discount))), fr(buy, buy + free));
    const p = fval(toPct(fsub(f, fr(1))));
    if (Math.abs(p) < 1e-9 || !isTwoDp(p) || Math.abs(p) > 60) return null;
    const naive = markup - discount - (free / (buy + free)) * 100;
    return emit(ctx, {
      facts: { form: 'free-profit', markup, discount, buy, free },
      prompt: `A shopkeeper marks his goods ${markup}% above the cost price${discount ? `, gives a discount of ${discount}% on the marked price` : ''} and also offers "buy ${buy}, get ${free} free". What is his profit or loss percentage?`,
      answer: p,
      format: plPct,
      allowNegative: true,
      step: Number.isInteger(p) ? 2 : 2.5,
      mistakes: [
        ...(Math.abs(naive - p) > 1e-9 ? [{ value: naive, why: 'subtracted the discount percentages from the mark-up', trap: `${plPct(naive)} subtracts the offers from ${markup}% directly. Each one acts on a different base, so multiply the factors: ${facTex(markup)}${discount ? ` × ${facTex(-discount)}` : ''} × ${texFr(fr(buy, buy + free))}.` }] : []),
        { value: fval(toPct(fsub(fmul(fmul(factor(fr(markup)), factor(fr(-discount))), fr(buy, buy + free + free)), fr(1)))), why: 'counted the free items twice' },
        { value: -p, why: 'right size, wrong direction' },
        { value: fval(toPct(fsub(fmul(factor(fr(markup)), factor(fr(-discount))), fr(1)))), why: 'ignored the free items' },
      ],
      steps: [
        `Let the CP of one item be ₹100. MP = ₹${100 + markup}${discount ? `; after ${discount}% off, price = ₹${dec((100 + markup) * (1 - discount / 100))}` : ''}.`,
        `For ${buy + free} items (cost ₹${100 * (buy + free)}), he is paid for ${buy}: ₹${dec(fval(fmul(factor(fr(markup)), factor(fr(-discount)))) * 100 * buy)}.`,
        `Result = $\\frac{${dec(fval(fmul(factor(fr(markup)), factor(fr(-discount)))) * 100 * buy)} - ${100 * (buy + free)}}{${100 * (buy + free)}} \\times 100$ = ${plPct(p).toLowerCase()}.`,
      ],
      shortcut: `Multiply the factors: ${facTex(markup)}${discount ? ` × ${facTex(-discount)}` : ''} × ${texFr(fr(buy, buy + free))} = ${texFr(f)}.`,
      trap: `Mark-up, discount and free items each act on a different base; combine them by multiplying.`,
      tags: ['pl:buy-get-free', 'pl:markup'],
    });
  });
}

function freeMarkup(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('free-markup', 300, () => {
    const [buy, free] = rng.pick(OFFERS);
    const p = rng.pick([5, 10, 12, 15, 20, 25, 35, 50]);
    const m = fval(toPct(fsub(fmul(factor(fr(p)), fr(buy + free, buy)), fr(1))));
    if (!isTwoDp(m) || m > 150) return null;
    return emit(ctx, {
      facts: { form: 'free-markup', p, buy, free },
      prompt: `A trader offers "buy ${buy}, get ${free} free" and still wants a profit of ${p}%. By what percentage above the cost price should he mark the items?`,
      answer: m,
      format: fmtPct,
      step: Number.isInteger(m) ? 2.5 : 1.25,
      mistakes: [
        { value: p + (free / (buy + free)) * 100, why: 'added the profit and the effective discount', trap: `${fmtPct(p + (free / (buy + free)) * 100)} adds ${p}% and the ${fmtPct((free / (buy + free)) * 100)} discount. MP must be ${100 + p}% of CP scaled by ${buy + free}/${buy}.` },
        { value: p + (free / buy) * 100, why: 'added the profit and free ÷ paid' },
      ].filter((x) => x.value > 0),
      steps: [`Let the CP of one item be ₹100. For ${buy + free} items the cost is ₹${100 * (buy + free)}.`, `Required revenue = ${100 + p}% of ₹${100 * (buy + free)} = ₹${dec((100 + p) * (buy + free))}, collected on ${buy} items.`, `MP = ₹${dec(((100 + p) * (buy + free)) / buy)} per item, i.e. ${fmtPct(m)} above CP.`],
      shortcut: `MP/CP = (100 + ${p})/100 × (${buy} + ${free})/${buy}.`,
      trap: `The free items raise the required mark-up by the factor ${buy + free}/${buy}, not by a flat percentage.`,
      tags: ['pl:buy-get-free', 'pl:markup'],
    });
  });
}

function buyGetFree(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return freeDiscount(ctx);
  if (difficulty === 'medium') return freeProfit(ctx, false);
  if (difficulty === 'hard') return freeMarkup(ctx);
  return freeProfit(ctx, true);
}

/* ------------------------------------------------------------------ */
/* 8. Same SP, one profit one loss                                     */
/* ------------------------------------------------------------------ */

function sameSpAmount(ctx: Ctx, equal: boolean): Res {
  const { rng } = ctx;
  return attempt('same-sp-amount', 300, () => {
    const p = rng.pick([10, 20, 25, 30, 40, 50]);
    const l = equal ? p : rng.pick([10, 20, 25, 40, 50]);
    if (!equal && l === p) return null;
    const fp = factor(fr(p));
    const fl = factor(fr(-l));
    const sp = multipleIn(rng, 600, 6000, lcmAll([fp[0], fl[0]]) * 10);
    const c1 = scale(sp, fdiv(fr(1), fp));
    const c2 = scale(sp, fdiv(fr(1), fl));
    if (!whole(c1) || !whole(c2)) return null;
    const net = 2 * sp - c1 - c2;
    if (Math.abs(net) < 1e-9) return null;
    const item = rng.pick(['mobile phones', 'bicycles', 'sewing machines', 'ceiling fans', 'wrist watches']);
    return emit(ctx, {
      facts: { form: 'same-sp-amount', sp, p, l },
      prompt: `A shopkeeper sold two ${item} for ${rs(sp)} each. On one he gained ${p}% and on the other he lost ${l}%. What is his overall profit or loss?`,
      answer: net,
      format: plAmt,
      allowNegative: true,
      allowZero: true,
      mistakes: [
        { value: 0, why: 'assumed the gain and the loss cancel', trap: `"No profit, no loss" assumes equal-looking percentages cancel. They are on different cost prices (${rs(c1)} and ${rs(c2)}), so they do not.` },
        { value: (2 * sp * (p - l)) / 100, why: 'applied the percentages to the SP' },
        { value: -net, why: 'right size, wrong direction' },
        { value: equal ? -(sp * p * p) / 10000 : ((c1 + c2) * (p - l)) / 200, why: equal ? 'took p²/100 % of one SP only' : 'averaged the percentages on the total CP' },
      ],
      steps: [
        `CP of the first = ${rs(sp)} ÷ ${texFr(fp)} = ${rs(c1)}.`,
        `CP of the second = ${rs(sp)} ÷ ${texFr(fl)} = ${rs(c2)}.`,
        `Total CP = ${rs(c1 + c2)}; total SP = ${rs(2 * sp)}.`,
        `${net > 0 ? 'Profit' : 'Loss'} = ${rs(Math.abs(net))}.`,
      ],
      shortcut: equal ? `Same SP, x% gain and x% loss ⇒ always a loss of x²/100 % = ${dec((p * p) / 100)}% of the total CP.` : `Find each CP from the SP; percentages on different CPs never cancel.`,
      trap: net < 0 ? `The loss-making item cost more (${rs(c2)} vs ${rs(c1)}), so the loss outweighs the gain.` : `Work in rupees: the gain on ${rs(c1)} is bigger than the loss on ${rs(c2)} here.`,
      tags: ['pl:same-sp', 'trap:equal-sp'],
    });
  });
}

function sameSpPct(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('same-sp-pct', 400, () => {
    const p = rng.pick([fr(20), fr(25), fr(50), fr(100, 3), fr(100), fr(40), fr(60)]);
    const l = rng.pick([fr(20), fr(25), fr(50, 3), fr(100, 7), fr(10), fr(40), fr(100, 3)]);
    // overall factor = 2 / (1/(1+p) + 1/(1−l))
    const a = fdiv(fr(1), factor(p));
    const b = fdiv(fr(1), factor(fr(-l[0], l[1])));
    const total = fr(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
    const f = fdiv(fr(2), total);
    const res = fval(toPct(fsub(f, fr(1))));
    const resF = toPct(fsub(f, fr(1)));
    if (!isTwoDp(res) && resF[1] > 30) return null;
    if (Math.abs(res) > 40) return null;
    const naive = fval(p) - fval(l);
    return emit(ctx, {
      facts: { form: 'same-sp-pct', p, l },
      prompt: `Two scooters were sold for the same price. The first was sold at a profit of ${pctF(p)} and the second at a loss of ${pctF(l)}. What is the overall profit or loss percentage?`,
      answer: res,
      format: plPct,
      allowNegative: true,
      allowZero: true,
      step: 1,
      mistakes: [
        ...(Math.abs(naive - res) > 1e-9 ? [{ value: naive, why: 'subtracted the percentages directly', trap: `${plPct(naive)} subtracts ${pctF(l)} from ${pctF(p)}. With equal selling prices the two cost prices differ, so the percentages must be weighted by those cost prices.` }] : []),
        ...(Math.abs(res) > 1e-9 ? [{ value: 0, why: 'assumed the two effects cancel' }] : []),
        { value: (fval(p) - fval(l)) / 2, why: 'averaged the percentages' },
        { value: -res, why: 'right size, wrong direction' },
      ],
      steps: [
        `Let each SP = 1. CP₁ = 1 ÷ ${texFr(factor(p))} = ${texFr(a)}; CP₂ = 1 ÷ ${texFr(factor(fr(-l[0], l[1])))} = ${texFr(b)}.`,
        `Total CP = ${texFr(fr(total[0], total[1]))}; total SP = 2.`,
        `Overall = $\\frac{2}{${tfrac(fr(total[0], total[1]))}}$ − 1 = ${plPct(res).toLowerCase()}.`,
      ],
      shortcut: `With equal SPs, compare the total CP with the total SP; take SP = LCM of the numerators to keep numbers whole.`,
      trap: `Equal selling prices mean unequal cost prices — the percentages cannot be combined directly.`,
      tags: ['pl:same-sp', 'trap:equal-sp'],
    });
  });
}

function tfrac(f: Fr): string {
  return f[1] === 1 ? String(f[0]) : `\\frac{${f[0]}}{${f[1]}}`;
}

function sameSpFind(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('same-sp-find', 300, () => {
    const p = rng.pick([10, 20, 25, 50]);
    const l = rng.pick([10, 20, 25, 40, 50]);
    const fp = factor(fr(p));
    const fl = factor(fr(-l));
    const sp = multipleIn(rng, 1000, 12000, lcmAll([fp[0], fl[0]]) * 10);
    const c1 = scale(sp, fdiv(fr(1), fp));
    const c2 = scale(sp, fdiv(fr(1), fl));
    const net = 2 * sp - c1 - c2;
    if (!(net < 0) || !whole(c1) || !whole(c2)) return null;
    const loss = -net;
    const item = rng.pick(['mobile phones', 'bicycles', 'sewing machines']);
    return emit(ctx, {
      facts: { form: 'same-sp-find', p, l, loss },
      prompt: `A dealer sold two ${item} at the same price. He gained ${p}% on one and lost ${l}% on the other, and his overall loss was ${rs(loss)}. What was the selling price of each?`,
      answer: sp,
      format: rs,
      mistakes: [
        { value: (loss * 100) / (l - p || 1), why: 'took the loss as (l − p)% of one SP', trap: `That value treats ${rs(loss)} as ${l - p}% of one selling price. The percentages are on two different cost prices: SP/${dec(fval(fp))} and SP/${dec(fval(fl))}.` },
        { value: c1, why: 'gave the CP of the profitable item' },
        { value: c2, why: 'gave the CP of the loss-making item' },
        { value: 2 * sp, why: 'gave the total SP' },
      ].filter((m) => m.value > 0),
      steps: [
        `Let each SP = S. CP₁ = S ÷ ${texFr(fp)}, CP₂ = S ÷ ${texFr(fl)}.`,
        `Loss = CP₁ + CP₂ − 2S = S × (${texFr(fdiv(fr(1), fp))} + ${texFr(fdiv(fr(1), fl))} − 2) = S × ${texFr(fr(-net, sp))}.`,
        `S × ${texFr(fr(-net, sp))} = ${rs(loss)} ⇒ S = ${rs(sp)}.`,
      ],
      shortcut: `Write both CPs as fractions of S; the loss is a fixed fraction of S.`,
      trap: `Equal SPs, unequal CPs — the loss is a fraction of S, not (l − p)% of S.`,
      tags: ['pl:same-sp', 'level:multi-step'],
    });
  });
}

function sameSp(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return sameSpAmount(ctx, true);
  if (difficulty === 'medium') return sameSpAmount(ctx, false);
  if (difficulty === 'hard') return sameSpPct(ctx);
  return sameSpFind(ctx);
}

/* ------------------------------------------------------------------ */
/* 9. Overall profit or loss                                           */
/* ------------------------------------------------------------------ */

function twoItems(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('two-items', 200, () => {
    const p1 = rng.pick([10, 15, 20, 25, 30]);
    const p2 = -rng.pick([5, 10, 15, 20]);
    const c1 = multipleIn(rng, 400, 2500, 100 / gcd(p1, 100) * 5);
    const c2 = multipleIn(rng, 400, 2500, 100 / gcd(-p2, 100) * 5);
    const net = (c1 * p1) / 100 + (c2 * p2) / 100;
    if (!whole(net) || Math.abs(net) < 1e-9 || c1 === c2) return null;
    const [a, b] = rng.sample(ITEMS, 2).map((x) => x.name);
    return emit(ctx, {
      facts: { form: 'two-items', c1, c2, p1, p2 },
      prompt: `A shopkeeper bought a ${a} for ${rs(c1)} and a ${b} for ${rs(c2)}. He sold the ${a} at a profit of ${p1}% and the ${b} at a loss of ${-p2}%. What is his overall profit or loss?`,
      answer: net,
      format: plAmt,
      allowNegative: true,
      allowZero: true,
      step: 10,
      mistakes: [
        { value: ((c1 + c2) * (p1 + p2)) / 100, why: 'applied the net percentage to the total CP', trap: `${plAmt(((c1 + c2) * (p1 + p2)) / 100)} applies ${p1}% − ${-p2}% to the total cost. The two percentages are on different cost prices.` },
        { value: -net, why: 'right size, wrong direction' },
        { value: (c1 * p1) / 100, why: 'gave the profit on the first item only' },
        { value: (c1 * p1) / 100 - (c2 * p2) / 100, why: 'added the loss instead of subtracting' },
      ],
      steps: [`Profit on the ${a} = ${p1}% of ${rs(c1)} = ${rs((c1 * p1) / 100)}.`, `Loss on the ${b} = ${-p2}% of ${rs(c2)} = ${rs((c2 * -p2) / 100)}.`, `Net = ${rs((c1 * p1) / 100)} − ${rs((c2 * -p2) / 100)} = ${plAmt(net).toLowerCase()}.`],
      shortcut: `Work in rupees, not percentages, when the cost prices differ.`,
      trap: `Percentages of different cost prices cannot be netted directly.`,
      tags: ['pl:overall'],
    });
  });
}

function cpGap(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('cp-gap', 200, () => {
    const x = rng.pick([10, 20, 25, 30, 40]);
    const gap = multipleIn(rng, 100, 800, 100 / gcd(x, 100) * 10);
    const c2 = multipleIn(rng, 400, 2000, 100 / gcd(x, 100) * 10);
    const c1 = c2 + gap;
    const total = (c1 * (100 + x)) / 100 + (c2 * (100 - x)) / 100;
    if (!whole(total)) return null;
    const noGap = (total + gap) / 2;
    return emit(ctx, {
      facts: { form: 'cp-gap', x, gap, total },
      prompt: `The cost prices of two articles differ by ${rs(gap)}. The costlier one is sold at a profit of ${x}% and the cheaper one at a loss of ${x}%. If the total selling price is ${rs(total)}, what is the cost price of the costlier article?`,
      answer: c1,
      format: rs,
      mistakes: [
        { value: noGap, why: 'ignored that the ±x% act on different amounts (averaged the total SP and the gap)', trap: `${rs(Math.round(noGap))} treats the +${x}% and −${x}% as cancelling. They do not: the costlier article's ${x}% is ${x}% of a bigger CP, adding ${x}% of the gap (${rs((gap * x) / 100)}) to the total.` },
        { value: c2, why: 'gave the cheaper CP' },
        { value: (c1 * (100 + x)) / 100, why: 'gave the SP of the costlier article' },
        { value: (total - gap) / 2, why: 'subtracted the gap instead of adding' },
      ],
      steps: [
        `Let the costlier CP = C, so the cheaper CP = C − ${gap}.`,
        `Total SP = C × ${facTex(x)} + (C − ${gap}) × ${facTex(-x)} = 2C − ${gap} × ${texFr(fr(100 - x, 100))} = 2C − ${dec((gap * (100 - x)) / 100)}.`,
        `2C − ${dec((gap * (100 - x)) / 100)} = ${rs(total)} ⇒ 2C = ${rs(total + (gap * (100 - x)) / 100)}.`,
        `C = ${rs(c1)}.`,
      ],
      shortcut: `+${x}% on C and −${x}% on (C − ${gap}): total = 2C − ${gap} + ${x}% of ${gap}.`,
      trap: `The ±${x}% do not cancel because they are taken on different cost prices.`,
      tags: ['pl:overall', 'level:two-equations'],
    });
  });
}

function restPct(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('rest-pct', 300, () => {
    const q1 = rng.pick([20, 30, 40, 50]);
    const q2 = rng.pick([20, 30, 40, 50]);
    const q3 = rng.pick([20, 30, 40, 60]);
    const p1 = rng.pick([10, 12, 15, 20, 25]);
    const p2 = -rng.pick([4, 5, 8, 10]);
    const target = rng.pick([8, 10, 12, 15]);
    const total = q1 + q2 + q3;
    const need = target * total - p1 * q1 - p2 * q2;
    if (need % q3 !== 0) return null;
    const r = need / q3;
    if (r <= target || r > 60) return null;
    const good = rng.pick(['rice', 'wheat', 'sugar', 'pulses']);
    const naive = 3 * target - p1 - p2;
    return emit(ctx, {
      facts: { form: 'rest-pct', qty: [q1, q2, q3], pcts: [p1, p2], target },
      prompt: `A trader bought ${total} kg of ${good}. He sold ${q1} kg at a profit of ${p1}% and ${q2} kg at a loss of ${-p2}%. At what profit percentage must he sell the remaining ${good} to earn ${target}% profit on the whole?`,
      answer: r,
      format: fmtPct,
      step: 2,
      mistakes: [
        ...(naive > 0 && naive !== r ? [{ value: naive, why: 'ignored the quantities (treated the three lots as equal)', trap: `${fmtPct(naive)} balances the percentages as if the lots were equal. Weight each percentage by its quantity: ${q1}, ${q2} and ${q3} kg.` }] : []),
        { value: (target * total - p1 * q1 + p2 * q2) / q3, why: 'added the loss instead of subtracting it' },
        ...nearPcts(r, 2),
      ].filter((m) => m.value > 0),
      steps: [
        `Take CP = ₹1 per kg. Required profit = ${target}% of ${total} = ${dec((target * total) / 100)}.`,
        `Profit so far = ${p1}% of ${q1} − ${-p2}% of ${q2} = ${dec((p1 * q1) / 100)} − ${dec((-p2 * q2) / 100)} = ${dec((p1 * q1 + p2 * q2) / 100)}.`,
        `Needed from ${q3} kg = ${dec((target * total) / 100)} − ${dec((p1 * q1 + p2 * q2) / 100)} = ${dec(need / 100)}.`,
        `Profit % on the rest = ${dec(need / 100)} ÷ ${q3} × 100 = ${fmtPct(r)}.`,
      ],
      shortcut: `Weighted average: ${q1}×${p1} + ${q2}×(${p2}) + ${q3}×r = ${total}×${target}.`,
      trap: `Percentages on different quantities must be weighted by those quantities.`,
      tags: ['pl:overall', 'trick:weighted-average'],
    });
  });
}

function equalCpLoss(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('equal-cp-loss', 300, () => {
    const a = rng.pick([10, 12, 15, 20]);
    const b = rng.pick([20, 25, 30, 32]);
    const target = rng.pick([10, 15, 20, 25]);
    if (b <= a) return null;
    const cp = multipleIn(rng, 400, 2500, lcmAll([100 / gcd(b - a, 100), 100 / gcd(target, 100)]) * 5);
    const loss = (cp * (b - a)) / 100;
    const ans = (cp * (100 + target)) / 100;
    if (!whole(loss) || !whole(ans) || loss < 10) return null;
    return emit(ctx, {
      facts: { form: 'equal-cp-loss', a, b, loss, target },
      prompt: `Two articles have the same cost price. One is sold at a profit of ${a}% and the other at a loss of ${b}%, resulting in an overall loss of ${rs(loss)}. At what price should one article be sold to earn a profit of ${target}%?`,
      answer: ans,
      format: rs,
      mistakes: [
        { value: ((loss * 100) / (b - a) / 2) * ((100 + target) / 100), why: 'split the CP between the two articles', trap: `That value halves the cost. The ${b - a}% net loss is on the CP of one article (each has the same CP), so CP = ${rs(loss)} × 100 ÷ ${b - a}.` },
        { value: cp, why: 'gave the cost price' },
        { value: ((loss * 100) / (a + b)) * ((100 + target) / 100), why: 'used (a + b)% instead of (b − a)%' },
        { value: 2 * ans, why: 'priced both articles together' },
      ],
      steps: [`Each CP = C. Net = ${a}% of C − ${b}% of C = −${b - a}% of C.`, `${b - a}% of C = ${rs(loss)} ⇒ C = ${rs(cp)}.`, `SP for ${target}% profit = ${rs(cp)} × ${facTex(target)} = ${rs(ans)}.`],
      shortcut: `Equal CPs let the percentages net directly: −${b - a}% of one CP = ${rs(loss)}.`,
      trap: `With equal cost prices the percentages net on ONE article's CP — do not halve it.`,
      tags: ['pl:overall', 'trap:equal-cp'],
    });
  });
}

function overallPl(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return twoItems(ctx);
  if (difficulty === 'medium') return cpGap(ctx);
  if (difficulty === 'hard') return restPct(ctx);
  return equalCpLoss(ctx);
}

/* ------------------------------------------------------------------ */
/* 10. Multi-stage chains & combined                                   */
/* ------------------------------------------------------------------ */

const STAGES = ['manufacturer', 'wholesaler', 'retailer', 'customer'];

function chainCp(ctx: Ctx, n: 2 | 3): Res {
  const { rng } = ctx;
  return attempt('chain-cp', 200, () => {
    const pcts = Array.from({ length: n }, () => rng.pick([10, 15, 20, 25, 30]));
    const f = pcts.reduce<Fr>((acc, p) => fmul(acc, factor(fr(p))), fr(1));
    const partials = pcts.map((_, i) => pcts.slice(0, i + 1).reduce<Fr>((acc, p) => fmul(acc, factor(fr(p))), fr(1)));
    const cost = tryMultiple(rng, 200, 3000, lcmAll(partials.map((x) => x[1])));
    if (cost === null) return null;
    const final = scale(cost, f);
    const names = n === 2 ? ['manufacturer', 'retailer', 'customer'] : STAGES;
    const sum = pcts.reduce((s, p) => s + p, 0);
    const item = rng.pick(ITEMS).name;
    const chain = pcts.map((p, i) => `the ${names[i]} sells it to ${i + 1 === n ? 'a' : 'the'} ${names[i + 1]} at a profit of ${p}%`);
    return emit(ctx, {
      facts: { form: 'chain-cp', pcts, final },
      prompt: `A ${item} passes through a supply chain: ${chain.join(', ').replace(/, ([^,]*)$/, ' and $1')}. If the ${names[n]} pays ${rs(final)}, what did it cost the ${names[0]} to make it?`,
      answer: cost,
      format: rs,
      mistakes: [
        { value: (final * 100) / (100 + sum), why: 'added the stage profits', trap: `${rs(Math.round((final * 100) / (100 + sum)))} removes ${sum}% in one go. Each profit is on the previous stage's price, so divide by every factor.` },
        { value: pcts.reduce((v, p) => (v * (100 - p)) / 100, final), why: 'subtracted each percentage from the final price' },
        { value: scale(final, fdiv(fr(1), factor(fr(pcts[n - 1])))), why: 'removed only the last stage' },
        { value: scale(cost, partials[0]), why: `gave the ${names[1]}'s cost` },
      ],
      steps: [
        `Final price = cost × ${pcts.map(facTex).join(' × ')} = cost × ${texFr(f)}.`,
        `Cost = ${rs(final)} ÷ ${texFr(f)} = ${rs(cost)}.`,
      ],
      shortcut: `Chain the factors and divide once; check forward: ${rs(cost)} → ${partials.map((p) => rs(scale(cost, p))).join(' → ')}.`,
      trap: `Stage profits compound — divide by each factor, never subtract the sum of percentages.`,
      tags: ['pl:multi-stage', 'trick:multiplying-factors'],
      visual: { type: 'grid', columns: ['Stage', 'Profit', 'Price'], rows: [[names[0], '—', rs(cost)], ...pcts.map((p, i) => [names[i + 1], `${p}%`, rs(scale(cost, partials[i]))])] },
    });
  });
}

function chainRetailer(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('chain-retailer', 300, () => {
    const pcts = [rng.pick([10, 20, 25]), rng.pick([10, 15, 20, 25])];
    const markup = rng.pick([20, 25, 30, 40, 50]);
    const discount = rng.pick([5, 10, 12, 15, 20]);
    const fWhole = fmul(factor(fr(pcts[0])), factor(fr(pcts[1]))); // retailer's cost / manufacturer's cost
    const fSell = fmul(factor(fr(markup)), factor(fr(-discount)));
    const fProfit = fmul(fWhole, fsub(fSell, fr(1)));
    if (!(fval(fSell) > 1)) return null;
    const cost = tryMultiple(rng, 200, 3000, lcmAll([factor(fr(pcts[0]))[1], fWhole[1], fmul(fWhole, factor(fr(markup)))[1], fmul(fWhole, fSell)[1], fProfit[1]]));
    if (cost === null) return null;
    const rCost = scale(cost, fWhole);
    const profit = scale(cost, fProfit);
    if (!whole(profit) || !whole(rCost)) return null;
    const addProfit = (rCost * (markup - discount)) / 100;
    return emit(ctx, {
      facts: { form: 'chain-retailer', cost, pcts, markup, discount },
      prompt: `A manufacturer makes a pressure cooker for ${rs(cost)} and sells it to a wholesaler at a profit of ${pcts[0]}%. The wholesaler sells it to a retailer at a profit of ${pcts[1]}%. The retailer marks it ${markup}% above his cost and sells it after a discount of ${discount}%. What is the retailer's profit?`,
      answer: profit,
      format: rs,
      mistakes: [
        { value: addProfit, why: 'combined the retailer\'s mark-up and discount additively', trap: `${rs(Math.round(addProfit))} uses ${markup}% − ${discount}% on the retailer's cost. The discount is on the marked price, so profit = cost × (${facTex(markup)} × ${facTex(-discount)} − 1).` },
        { value: scale(cost, fsub(fSell, fr(1))), why: "applied the retailer's margin to the manufacturer's cost" },
        { value: scale(cost, fmul(factor(fr(pcts[0] + pcts[1])), fsub(fSell, fr(1)))), why: 'added the first two stage profits' },
        { value: scale(rCost, fsub(factor(fr(markup)), fr(1))), why: 'ignored the discount' },
      ],
      steps: [
        `Wholesaler's cost = ${rs(cost)} × ${facTex(pcts[0])} = ${rs(scale(cost, factor(fr(pcts[0]))))}.`,
        `Retailer's cost = ${rs(scale(cost, factor(fr(pcts[0]))))} × ${facTex(pcts[1])} = ${rs(rCost)}.`,
        `Retailer's SP = ${rs(rCost)} × ${facTex(markup)} × ${facTex(-discount)} = ${rs(scale(rCost, fSell))}.`,
        `Profit = ${rs(scale(rCost, fSell))} − ${rs(rCost)} = ${rs(profit)}.`,
      ],
      shortcut: `Retailer's profit % = ${facTex(markup)} × ${facTex(-discount)} − 1 = ${dec(fval(fSell) * 100 - 100)}% of his own cost.`,
      trap: `Each percentage belongs to its own stage and base — track the price stage by stage.`,
      tags: ['pl:multi-stage', 'pl:markup', 'level:multi-step'],
    });
  });
}

function loanTrade(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('loan-trade', 300, () => {
    const rate = rng.pick([6, 8, 10, 12, 15]);
    const years = rng.pick([1, 2]);
    const markup = rng.pick([25, 30, 40, 50]);
    const discount = rng.pick([10, 12, 15, 20]);
    const principal = multipleIn(rng, 20000, 200000, 1000);
    const interest = (principal * rate * years) / 100;
    const revenue = scale(principal, fmul(factor(fr(markup)), factor(fr(-discount))));
    const net = revenue - principal - interest;
    if (!whole(revenue) || Math.abs(net) < 100) return null;
    const [P] = pickPeople(rng, 1);
    const ci = principal * ((1 + rate / 100) ** years - 1);
    return emit(ctx, {
      facts: { form: 'loan-trade', principal, rate, years, markup, discount },
      prompt: `${P.name} borrows ${rs(principal)} at ${rate}% per annum simple interest and uses all of it to buy stock for ${his(P)} shop. ${He(P)} marks the stock ${markup}% above cost and sells all of it at a discount of ${discount}%. ${He(P)} repays the loan with interest after ${years} year${years > 1 ? 's' : ''}. What is ${his(P)} net profit or loss?`,
      answer: net,
      format: plAmt,
      allowNegative: true,
      allowZero: true,
      step: 500,
      mistakes: [
        { value: revenue - principal, why: 'forgot the interest', trap: `${plAmt(revenue - principal)} is the trading profit only; the interest of ${rs(interest)} must also be paid out of it.` },
        { value: (principal * (markup - discount)) / 100 - interest, why: 'combined mark-up and discount additively' },
        ...(years > 1 ? [{ value: revenue - principal - ci, why: 'used compound interest instead of simple' }] : []),
        { value: revenue - principal - interest / years, why: 'counted interest for one year only' },
      ],
      steps: [
        `Revenue = ${rs(principal)} × ${facTex(markup)} × ${facTex(-discount)} = ${rs(revenue)}.`,
        `Trading profit = ${rs(revenue)} − ${rs(principal)} = ${rs(revenue - principal)}.`,
        `Interest = ${rs(principal)} × ${rate} × ${years} ÷ 100 = ${rs(interest)}.`,
        `Net = ${rs(revenue - principal)} − ${rs(interest)} = ${plAmt(net).toLowerCase()}.`,
      ],
      shortcut: `Net % of the loan = (${dec(fval(fmul(factor(fr(markup)), factor(fr(-discount)))) * 100 - 100)} − ${rate * years})%.`,
      trap: `The loan's interest is a cost too — subtract it from the trading profit.`,
      tags: ['pl:multi-stage', 'pl:combined-si', 'level:multi-step'],
    });
  });
}

function partnerTrade(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('partner-trade', 300, () => {
    const caps = [multipleIn(rng, 20000, 80000, 5000), multipleIn(rng, 20000, 80000, 5000)];
    const months = [12, rng.pick([4, 6, 8, 9])];
    const markup = rng.pick([25, 30, 40, 50]);
    const discount = rng.pick([10, 15, 20]);
    const f = fsub(fmul(factor(fr(markup)), factor(fr(-discount))), fr(1));
    if (!(fval(f) > 0)) return null;
    const cost = caps[0] + caps[1];
    const profit = scale(cost, f);
    const w = [caps[0] * months[0], caps[1] * months[1]];
    const ask = rng.int(0, 1);
    const share = (profit * w[ask]) / (w[0] + w[1]);
    if (!whole(profit) || !whole(share)) return null;
    const [A, B] = pickPeople(rng, 2);
    const names = [A.name, B.name];
    const capOnly = (profit * caps[ask]) / cost;
    return emit(ctx, {
      facts: { form: 'partner-trade', caps, months, markup, discount, ask },
      prompt: `${A.name} and ${B.name} buy a stock of goods together: ${A.name} puts in ${rs(caps[0])} for the whole year and ${B.name} puts in ${rs(caps[1])} for the last ${months[1]} months. The goods are marked ${markup}% above cost and sold at a discount of ${discount}%. If the profit is shared in the ratio of capital × time, what is ${names[ask]}'s share?`,
      answer: share,
      format: rs,
      mistakes: [
        { value: capOnly, why: 'shared in the ratio of capitals only (ignored time)', trap: `${rs(Math.round(capOnly))} splits the profit by capital alone. ${B.name}'s money was in for only ${months[1]} months, so the ratio is ${rs(caps[0])} × 12 : ${rs(caps[1])} × ${months[1]}.` },
        { value: (cost * (markup - discount) * w[ask]) / 100 / (w[0] + w[1]), why: 'profit from an additive mark-up and discount' },
        { value: profit - share, why: "gave the other partner's share" },
        { value: profit, why: 'gave the total profit' },
      ],
      steps: [
        `Total cost = ${rs(caps[0])} + ${rs(caps[1])} = ${rs(cost)}.`,
        `Profit = ${rs(cost)} × (${facTex(markup)} × ${facTex(-discount)} − 1) = ${rs(profit)}.`,
        `Ratio = ${caps[0]} × 12 : ${caps[1]} × ${months[1]} = ${ratioText(w[0], w[1])}.`,
        `${names[ask]}'s share = ${rs(profit)} × ${texFr(fr(w[ask], w[0] + w[1]))} = ${rs(share)}.`,
      ],
      shortcut: `Two separate steps: P&L gives the profit; capital × months splits it.`,
      trap: `Time matters in partnership — a partner who joined later gets less per rupee invested.`,
      tags: ['pl:multi-stage', 'pl:combined-partnership', 'level:multi-step'],
    });
  });
}

function ratioText(a: number, b: number): string {
  const g = gcd(a, b);
  return `${a / g} : ${b / g}`;
}

function multiStage(ctx: Ctx): Res {
  const { rng, difficulty } = ctx;
  if (difficulty === 'easy') return chainCp(ctx, 2);
  if (difficulty === 'medium') return chainCp(ctx, 3);
  if (difficulty === 'hard') return chainRetailer(ctx);
  return rng.chance(0.5) ? loanTrade(ctx) : partnerTrade(ctx);
}

/* ------------------------------------------------------------------ */

const BUILDERS: Record<string, (ctx: Ctx) => Res> = {
  'cp-sp': cpSp,
  discount,
  'markup-discount': markupDiscount,
  'successive-discounts': successiveDiscounts,
  'profit-on-sp': profitOnSp,
  'dishonest-dealer': dishonestDealer,
  'buy-get-free': buyGetFree,
  'same-sp': sameSp,
  'overall-pl': overallPl,
  'multi-stage': multiStage,
};

export const generator = defineGenerator<ProfitLossFacts>(META, SUBTYPES, (ctx) => {
  const build = BUILDERS[ctx.subtype.id];
  if (!build) throw new Error(`quant.profit-loss: no builder for ${ctx.subtype.id}`);
  return build(ctx);
});
