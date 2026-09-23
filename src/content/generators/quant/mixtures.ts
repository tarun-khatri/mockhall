/**
 * Mixture & alligation (SPEC 8.1 Q17). Research (2024–26): "add water to a target ratio", "remove part,
 * then add water", "find the initial milk", "water is p% of milk" dominate; price alligation and repeated
 * replacement were not seen recently, so they carry lower weight. Quantities 20–200 L; ratios ≤ 20 terms.
 * Traps: removal takes both components in proportion; "% of milk" vs "% of mixture"; linear vs repeated
 * replacement; reversed alligation ratio.
 */
import { defineGenerator, type BuildContext, type GenResult, type SubtypeDef } from '../types';
import { attempt, emit, emitRatio, fmtExact, fmtPct, fr, gcd, pickPeople, reduceParts, rs, texFr, type RatioMistake } from './mixtures/kit';

const META = { name: 'quant.mixtures', version: 1, subject: 'quant', chapter: 'mixtures' } as const;

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'mixing-solutions', label: 'Adding / removing to reach a ratio', weight: 2.5 },
  { id: 'percent-mixture', label: '“Water is p% of milk” mixtures', weight: 1.5 },
  { id: 'alligation-price', label: 'Alligation of prices', weight: 1 },
  { id: 'replacement', label: 'Repeated removal & replacement', weight: 1 },
  { id: 'adding-water-profit', label: 'Profit by adding water', weight: 1 },
];

export type MixturesFacts =
  /** total litres, milk:water a:b; add water to make c:d; asked: water to add. */
  | { form: 'add-water'; total: number; a: number; b: number; c: number; d: number }
  /** total, a:b; remove `removed` L of mixture, then add water → c:d; asked: water added. */
  | { form: 'remove-add'; total: number; a: number; b: number; removed: number; c: number; d: number }
  /** a:b; `removed` L of mixture taken out and `added` L of water put in → c:d; asked: initial milk. */
  | { form: 'initial-milk'; a: number; b: number; removed: number; added: number; c: number; d: number }
  /** Vessels with milk:water p1:q1 and p2:q2; asked: mixing ratio (vessel 1 : vessel 2) for target m:n. */
  | { form: 'two-vessels'; v1: [number, number]; v2: [number, number]; target: [number, number] }
  /** Mixture of `total` L in which water is `pct`% of milk; asked: milk (L). */
  | { form: 'pct-milk'; total: number; pct: number }
  /** `total` L, water `pct`% of milk; `added` L water added; asked: new milk:water ratio. */
  | { form: 'pct-add-ratio'; total: number; pct: number; added: number }
  /** `total` L with water `pct`% of the MIXTURE; asked: water to add so water is `target`% of the new mixture. */
  | { form: 'pct-target'; total: number; pct: number; target: number }
  /** `total` L, water `pct`% of milk; remove `removed` L of mixture, add `added` L of milk; asked: water as % of milk now. */
  | { form: 'pct-remove-add'; total: number; pct: number; removed: number; added: number }
  /** Prices of two varieties and the mean price; asked: mixing ratio (cheaper : dearer). */
  | { form: 'price-ratio'; cheap: number; dear: number; mean: number }
  /** `qty` kg of the cheaper variety; mean price; asked: kg of the dearer variety. */
  | { form: 'price-qty'; cheap: number; dear: number; mean: number; qty: number }
  /** Sell the mixture at `sell` per kg for `gain`% profit; asked: mixing ratio (cheaper : dearer). */
  | { form: 'price-profit'; cheap: number; dear: number; sell: number; gain: number }
  /** A (pa) and B (pb) mixed p:q; that mixture mixed with C in r:s gives `final` per kg; asked: price of C. */
  | { form: 'three-variety'; pa: number; pb: number; p: number; q: number; r: number; s: number; final: number }
  /** `capacity` L of pure milk; `draw` L replaced by water `times` times; asked: milk left (L). */
  | { form: 'replace-left'; capacity: number; draw: number; times: number }
  /** Same, asked: final milk:water ratio. */
  | { form: 'replace-ratio'; capacity: number; draw: number; times: number }
  /** `draw` L replaced 3 times; final ratio milk:water = m:w; asked: capacity. */
  | { form: 'replace-capacity'; draw: number; times: number; m: number; w: number }
  /** Mixture (milk:water a:b, `capacity` L); `draw` L replaced by water `times` times; asked: final ratio. */
  | { form: 'replace-mixture'; capacity: number; a: number; b: number; draw: number; times: number }
  /** Water:milk = w:m, sold at CP of milk; asked: gain %. */
  | { form: 'water-gain'; w: number; m: number }
  /** Milk costs `cost`/L; mixture sold at `sell`/L for `gain`% profit; asked: water:milk ratio. */
  | { form: 'water-ratio'; cost: number; sell: number; gain: number }
  /** Buys `milk` L at `cost`, adds `water` L, sells all at `sell`; asked: profit %. */
  | { form: 'water-profit'; milk: number; cost: number; water: number; sell: number }
  /** `capacity` L milk, `draw` L replaced by water `times` times, all sold at CP of milk; asked: gain %. */
  | { form: 'replace-gain'; capacity: number; draw: number; times: number };

type Ctx = BuildContext;
type Res = GenResult<MixturesFacts>;

const L = (v: number): string => `${fmtExact(v)} litre${v === 1 ? '' : 's'}`;
const kg = (v: number): string => `${fmtExact(v)} kg`;
const perKg = (v: number): string => `${rs(v)} per kg`;
const whole = (v: number): boolean => Math.abs(v - Math.round(v)) < 1e-9;
const twoDp = (v: number): boolean => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const small = (p: readonly number[], max = 20): boolean => reduceParts(p).every((x) => x <= max);
const rt = (p: readonly number[]): string => reduceParts(p).join(' : ');
const RATIOS: [number, number][] = [[4, 3], [5, 2], [8, 7], [11, 6], [15, 8], [3, 1], [5, 3], [7, 3], [3, 2], [7, 5], [9, 4], [2, 1], [5, 4], [7, 2]];

/* ------------------------------------------------------------------ */
/* 1. Adding / removing to reach a ratio                                */
/* ------------------------------------------------------------------ */

function addWater(ctx: Ctx): Res {
  const { rng } = ctx;
  const rank = rng.int(0, 4); // small answers: fix the letter first, keep room for smaller options
  return attempt('add-water', 400, () => {
    const [a, b] = rng.pick(RATIOS);
    const k = rng.int(3, 15);
    const total = (a + b) * k;
    if (total < 20 || total > 200) return null;
    const milk = a * k;
    const water = b * k;
    const leaner = RATIOS.filter(([x, y]) => x * b < y * a); // adding water makes the mixture less milk-rich
    if (!leaner.length) return null;
    const [c, d] = rng.pick(leaner);
    const newWater = (milk * d) / c;
    if (!whole(newWater) || newWater <= water) return null;
    const w = newWater - water;
    if (!whole(w) || w < rank + 1) return null;
    const onTotal = (total * d) / c - water; // applied the new ratio to the whole mixture
    return emit(ctx, {
      facts: { form: 'add-water', total, a, b, c, d },
      rank,
      step: w <= 12 ? 1 : undefined,
      prompt: `A container has ${L(total)} of a milk and water mixture in the ratio ${a} : ${b}. How much water must be added to make the ratio of milk to water ${c} : ${d}?`,
      answer: w,
      format: L,
      mistakes: [
        { value: onTotal, why: 'applied the new ratio to the whole mixture instead of the milk', trap: `That value scales the whole ${L(total)} by ${d}/${c}. Only the milk (${L(milk)}) stays fixed — water must become ${milk} × ${d}/${c} = ${fmtExact(newWater)} L.` },
        { value: newWater, why: 'gave the final water instead of the water added' },
        { value: Math.abs((total * d) / (c + d) - water), why: 'took d/(c + d) of the old total as the new water' },
      ].filter((m) => m.value > 0 && twoDp(m.value)),
      steps: [
        `Milk = ${a}/${a + b} × ${total} = ${L(milk)}; water = ${L(water)}.`,
        `Milk stays ${milk} L. For ${c} : ${d}, water must be ${milk} × ${d}/${c} = ${L(newWater)}.`,
        `Water to add = ${fmtExact(newWater)} − ${water} = ${L(w)}.`,
      ],
      shortcut: `Keep the unchanged component fixed: make the milk ${c} parts in both ratios (LCM), then compare the water parts.`,
      trap: `Only water is added, so the milk quantity is the anchor.`,
      tags: ['mixture:add-water'],
    });
  });
}

function removeAdd(ctx: Ctx): Res {
  const { rng } = ctx;
  const rank = rng.int(0, 4);
  return attempt('remove-add', 400, () => {
    const [a, b] = rng.pick(RATIOS);
    const k = rng.int(4, 16);
    const j = rng.int(1, k - 2);
    const total = (a + b) * k;
    const removed = (a + b) * j;
    if (total > 200 || removed < 10 || removed > 45) return null;
    const milk = a * (k - j);
    const water = b * (k - j);
    const leaner = RATIOS.filter(([x, y]) => x * b < y * a);
    if (!leaner.length) return null;
    const [c, d] = rng.pick(leaner);
    const newWater = (milk * d) / c;
    if (!whole(newWater) || newWater <= water) return null;
    const w = newWater - water;
    if (!whole(w) || w < rank + 1) return null;
    const milkOnly = (a * k - removed) * d / c - b * k; // assumed only milk was removed
    return emit(ctx, {
      facts: { form: 'remove-add', total, a, b, removed, c, d },
      rank,
      step: w <= 12 ? 1 : undefined,
      prompt: `A vessel contains ${L(total)} of milk and water in the ratio ${a} : ${b}. ${L(removed)} of the mixture is taken out, and then some water is added so that the ratio of milk to water becomes ${c} : ${d}. How much water was added?`,
      answer: w,
      format: L,
      mistakes: [
        { value: milkOnly, why: 'assumed only milk was removed', trap: `That value takes all ${removed} L out of the milk. The mixture removed contains both: ${a}/${a + b} of it is milk and ${b}/${a + b} is water.` },
        { value: (a * k * d) / c - b * k, why: 'ignored the removal' },
        { value: newWater, why: 'gave the final water, not the water added' },
        { value: w + removed, why: 'added back the removed quantity' },
      ].filter((m) => m.value > 0 && twoDp(m.value)),
      steps: [
        `Left after removal: ${total} − ${removed} = ${total - removed} L in the same ratio ${a} : ${b}.`,
        `Milk = ${L(milk)}, water = ${L(water)}.`,
        `For ${c} : ${d}: water must be ${milk} × ${d}/${c} = ${L(newWater)}; add ${fmtExact(newWater)} − ${water} = ${L(w)}.`,
      ],
      shortcut: `Removing mixture keeps the ratio; scale the remaining ${total - removed} L, then adjust water only.`,
      trap: `Taking out mixture removes milk AND water in the ratio ${a} : ${b}.`,
      tags: ['mixture:remove-add'],
    });
  });
}

function initialMilk(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('initial-milk', 600, () => {
    const [a, b] = rng.pick(RATIOS);
    const k = rng.int(4, 20);
    const total = (a + b) * k;
    if (total > 200) return null;
    const j = rng.int(1, Math.min(k - 1, 6));
    const removed = (a + b) * j;
    const added = rng.chance(0.6) ? removed : rng.int(5, 30);
    if (removed < 10 || removed > 45) return null;
    const milk = a * (k - j);
    const water = b * (k - j) + added;
    const [c, d] = reduceParts([milk, water]);
    if (!small([c, d]) || (c === a && d === b)) return null;
    const initial = a * k;
    return emit(ctx, {
      facts: { form: 'initial-milk', a, b, removed, added, c, d },
      prompt: `A can contains milk and water in the ratio ${a} : ${b}. When ${L(removed)} of the mixture is drawn off and ${L(added)} of water is poured in, the ratio of milk to water becomes ${c} : ${d}. How much milk did the can contain initially?`,
      answer: initial,
      format: L,
      mistakes: [
        { value: total, why: 'gave the initial mixture instead of the milk', trap: `${L(total)} is the whole mixture; the question asks only for the milk in it (${a}/${a + b} of the mixture).` },
        { value: milk, why: 'gave the milk left after drawing off' },
        { value: b * k, why: 'gave the initial water' },
        { value: initial + (a * removed) / (a + b), why: 'added the drawn-off milk twice' },
      ].filter((m) => m.value > 0 && twoDp(m.value)),
      steps: [
        `Let the can hold ${a}x L milk and ${b}x L water (total ${a + b}x).`,
        `Drawn off: ${removed} L of mixture = ${fmtExact((a * removed) / (a + b))} L milk and ${fmtExact((b * removed) / (a + b))} L water.`,
        `(${a}x − ${fmtExact((a * removed) / (a + b))}) : (${b}x − ${fmtExact((b * removed) / (a + b))} + ${added}) = ${c} : ${d} ⇒ x = ${k}.`,
        `Initial milk = ${a} × ${k} = ${L(initial)}.`,
      ],
      shortcut: `Test the options: an initial milk of ${initial} L gives ${milk} : ${water} = ${c} : ${d}.`,
      trap: `The drawn-off mixture carries milk and water in the old ratio.`,
      tags: ['mixture:remove-add', 'mixture:initial'],
    });
  });
}

function twoVessels(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('two-vessels', 600, () => {
    const v1 = rng.pick(RATIOS);
    const v2 = rng.pick(RATIOS);
    const f1 = fr(v1[0], v1[0] + v1[1]);
    const f2 = fr(v2[0], v2[0] + v2[1]);
    if (f1[0] * f2[1] === f2[0] * f1[1]) return null;
    // choose a mixing ratio x:y, compute target fraction
    const [x, y] = reduceParts([rng.int(1, 5), rng.int(1, 5)]);
    const tNum = x * f1[0] * f2[1] + y * f2[0] * f1[1];
    const tDen = (x + y) * f1[1] * f2[1];
    const g = gcd(tNum, tDen);
    const tm = tNum / g; // milk share numerator over tDen/g
    const tw = tDen / g - tm;
    const [m, n] = reduceParts([tm, tw]);
    if (!small([m, n], 30) || (m === v1[0] && n === v1[1]) || (m === v2[0] && n === v2[1])) return null;
    const mistakes: RatioMistake[] = [
      { parts: [y, x], why: 'reversed the alligation ratio', trap: `${y} : ${x} puts the distances on the wrong vessels. Each vessel's share is the distance of the OTHER vessel's concentration from the target.` },
      { parts: reduceParts([Math.abs(v2[0] - m), Math.abs(v1[0] - m)]), why: 'did the alligation on the milk parts instead of the milk fractions' },
    ];
    return emitRatio(ctx, {
      facts: { form: 'two-vessels', v1, v2, target: [m, n] },
      prompt: `Vessel P contains milk and water in the ratio ${v1[0]} : ${v1[1]} and vessel Q in the ratio ${v2[0]} : ${v2[1]}. In what ratio should the contents of P and Q be mixed to get a mixture with milk and water in the ratio ${m} : ${n}?`,
      answer: [x, y],
      mistakes: mistakes.filter((mm) => mm.parts.every((v) => v > 0)),
      steps: [
        `Milk fraction: P = ${texFr(f1)}, Q = ${texFr(f2)}, target = ${texFr(fr(m, m + n))}.`,
        `Alligation: P : Q = |${texFr(f2)} − ${texFr(fr(m, m + n))}| : |${texFr(f1)} − ${texFr(fr(m, m + n))}|.`,
        `= ${rt([x, y])}.`,
      ],
      shortcut: `Convert every ratio to a milk fraction first, then cross the differences.`,
      trap: `Compare milk FRACTIONS (milk ÷ total), not the raw ratio terms.`,
      tags: ['mixture:two-vessels', 'trick:alligation'],
    });
  });
}

function mixingSolutions(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return addWater(ctx);
  if (difficulty === 'medium') return removeAdd(ctx);
  if (difficulty === 'hard') return initialMilk(ctx);
  return twoVessels(ctx);
}

/* ------------------------------------------------------------------ */
/* 2. "Water is p% of milk"                                             */
/* ------------------------------------------------------------------ */

const PCTS = [10, 20, 25, 40, 50, 60, 75];

function pctMilk(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('pct-milk', 300, () => {
    const pct = rng.pick(PCTS);
    const milk = rng.int(4, 40) * 5;
    const water = (milk * pct) / 100;
    const total = milk + water;
    if (!whole(water) || total > 250) return null;
    const onMix = total - (total * pct) / 100;
    return emit(ctx, {
      facts: { form: 'pct-milk', total, pct },
      prompt: `In ${L(total)} of a mixture of milk and water, the quantity of water is ${pct}% of the quantity of milk. How much milk is there in the mixture?`,
      answer: milk,
      format: L,
      mistakes: [
        { value: onMix, why: 'took the water as a percentage of the mixture', trap: `${L(onMix)} takes ${pct}% of the whole ${L(total)} as water. Water is ${pct}% of the MILK, so milk : water = 100 : ${pct}.` },
        { value: water, why: 'gave the water' },
        { value: (total * pct) / (100 + pct), why: 'computed the water share' },
        { value: total - pct, why: 'subtracted the percentage as litres' },
      ].filter((m) => m.value > 0 && twoDp(m.value)),
      steps: [`Milk : water = 100 : ${pct} = ${rt([100, pct])}.`, `Milk = ${total} × ${reduceParts([100, pct])[0]}/${reduceParts([100, pct]).reduce((s, v) => s + v, 0)} = ${L(milk)}.`],
      shortcut: `"Water is p% of milk" ⇒ milk = total × 100/(100 + p).`,
      trap: `Read the base: ${pct}% of the milk, not of the mixture.`,
      tags: ['mixture:percent-of-milk', 'trap:wrong-base'],
    });
  });
}

function pctAddRatio(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('pct-add-ratio', 400, () => {
    const pct = rng.pick(PCTS);
    const milk = rng.int(4, 30) * 5;
    const water = (milk * pct) / 100;
    const total = milk + water;
    const added = rng.int(2, 20);
    if (!whole(water) || total > 220) return null;
    const ans = reduceParts([milk, water + added]);
    if (!small(ans, 40)) return null;
    const wrongMilk = total - (total * pct) / 100;
    const wrongWater = (total * pct) / 100 + added;
    const mistakes: RatioMistake[] = [
      { parts: [ans[1], ans[0]], why: 'reversed the ratio', trap: `${ans[1]} : ${ans[0]} is water : milk; the question asks for milk : water.` },
      ...(whole(wrongMilk * 100) && whole(wrongWater * 100) ? [{ parts: reduceParts([Math.round(wrongMilk * 100), Math.round(wrongWater * 100)]), why: 'took the water as a percentage of the mixture', trap: `That ratio treats ${pct}% as a share of the mixture. Water is ${pct}% of the milk.` }] : []),
      { parts: reduceParts([milk, water]), why: 'forgot the added water' },
    ];
    return emitRatio(ctx, {
      facts: { form: 'pct-add-ratio', total, pct, added },
      prompt: `A mixture of ${L(total)} contains milk and water, the water being ${pct}% of the milk. If ${L(added)} of water is added, what is the new ratio of milk to water?`,
      answer: ans,
      mistakes: mistakes.filter((m) => m.parts.every((v) => v > 0 && v <= 500)),
      steps: [`Milk : water = 100 : ${pct} ⇒ milk = ${L(milk)}, water = ${L(water)}.`, `After adding ${added} L: water = ${water + added} L.`, `Milk : water = ${milk} : ${water + added} = ${rt(ans)}.`],
      shortcut: `Split the mixture as 100 : ${pct}, then add to the water only.`,
      trap: `"${pct}% of milk" fixes milk : water = 100 : ${pct}.`,
      tags: ['mixture:percent-of-milk'],
    });
  });
}

function pctTarget(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('pct-target', 400, () => {
    const pct = rng.pick([10, 15, 20, 25, 30]);
    const target = rng.pick([20, 25, 30, 40, 50]);
    if (target <= pct) return null;
    const total = rng.int(4, 40) * 5;
    const water = (total * pct) / 100;
    const milk = total - water;
    const newTotal = (milk * 100) / (100 - target);
    const add = newTotal - total;
    if (!whole(water) || !twoDp(add) || add <= 0) return null;
    const naive = (total * (target - pct)) / 100;
    return emit(ctx, {
      facts: { form: 'pct-target', total, pct, target },
      prompt: `${L(total)} of a mixture contains ${pct}% water. How much water must be added so that water becomes ${target}% of the new mixture?`,
      answer: add,
      format: L,
      mistakes: [
        { value: naive, why: 'added (target − current)% of the old mixture', trap: `${L(naive)} adds ${target - pct}% of the old ${L(total)}, but the percentage is of the NEW, bigger mixture. Milk (${L(milk)}) is fixed and must become ${100 - target}%.` },
        { value: newTotal, why: 'gave the new total' },
        { value: (milk * target) / (100 - target), why: 'gave the final water' },
        { value: (total * target) / 100 - water, why: 'used the old total as the base' },
      ].filter((m) => m.value > 0 && twoDp(m.value)),
      steps: [`Milk = ${100 - pct}% of ${total} = ${L(milk)} (unchanged).`, `In the new mixture milk is ${100 - target}%: new total = ${milk} × 100 ÷ ${100 - target} = ${L(newTotal)}.`, `Water to add = ${fmtExact(newTotal)} − ${total} = ${L(add)}.`],
      shortcut: `Anchor on the component that does not change (milk).`,
      trap: `The target percentage is of the new mixture, so the base grows as water is added.`,
      tags: ['mixture:percent', 'trap:wrong-base'],
    });
  });
}

function pctRemoveAdd(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('pct-remove-add', 500, () => {
    const pct = rng.pick([20, 25, 40, 50]);
    const [pm, pw] = reduceParts([100, pct]);
    const k = rng.int(4, 20);
    const total = (pm + pw) * k;
    const j = rng.int(1, Math.min(k - 1, 5));
    const removed = (pm + pw) * j;
    const added = rng.int(3, 25);
    if (total > 200) return null;
    const milk = pm * (k - j) + added;
    const water = pw * (k - j);
    const ans = (water / milk) * 100;
    if (!twoDp(ans) && fr(water * 100, milk)[1] > 12) return null;
    return emit(ctx, {
      facts: { form: 'pct-remove-add', total, pct, removed, added },
      prompt: `In ${L(total)} of a mixture, water is ${pct}% of the milk. ${L(removed)} of the mixture is taken out and ${L(added)} of pure milk is added. Water is now what percentage of the milk?`,
      answer: ans,
      format: fmtPct,
      mistakes: [
        { value: (water / (milk + water)) * 100, why: 'gave water as a percentage of the mixture', trap: `${fmtPct((water / (milk + water)) * 100)} is water as a share of the whole mixture; the question compares water with milk.` },
        { value: ((pw * k) / (pm * k - removed + added)) * 100, why: 'took all the removed quantity out of the milk' },
        { value: pct, why: 'assumed the percentage is unchanged' },
      ].filter((m) => Number.isFinite(m.value) && m.value > 0 && m.value <= 3 * ans && fr(Math.round(m.value * 1e6), 1e6)[1] <= 40),
      step: 2,
      steps: [
        `Milk : water = 100 : ${pct} = ${pm} : ${pw}; milk = ${pm * k} L, water = ${pw * k} L.`,
        `Removing ${removed} L of mixture leaves ${pm * (k - j)} L milk and ${water} L water.`,
        `Add ${added} L milk: milk = ${milk} L.`,
        `Water as % of milk = ${water} ÷ ${milk} × 100 = ${fmtPct(ans)}.`,
      ],
      shortcut: `Removal keeps the ratio; only the added milk changes it.`,
      trap: `Keep the base straight: water as a % of milk, not of the mixture.`,
      tags: ['mixture:percent-of-milk', 'level:multi-step'],
    });
  });
}

function percentMixture(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return pctMilk(ctx);
  if (difficulty === 'medium') return pctAddRatio(ctx);
  if (difficulty === 'hard') return pctTarget(ctx);
  return pctRemoveAdd(ctx);
}

/* ------------------------------------------------------------------ */
/* 3. Alligation of prices                                              */
/* ------------------------------------------------------------------ */

const GOODS = ['rice', 'wheat', 'tea', 'sugar', 'pulses', 'coffee powder'];

function priceSet(rng: Ctx['rng']): { cheap: number; dear: number; mean: number; p: number; q: number } | null {
  const [p, q] = reduceParts([rng.int(1, 7), rng.int(1, 7)]);
  if (p === q) return null;
  const cheap = rng.int(20, 90);
  const dear = cheap + rng.int(4, 40);
  const meanNum = p * cheap + q * dear;
  if (meanNum % (p + q) !== 0) return null;
  return { cheap, dear, mean: meanNum / (p + q), p, q };
}

function priceRatio(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('price-ratio', 400, () => {
    const s = priceSet(rng);
    if (!s) return null;
    const { cheap, dear, mean, p, q } = s;
    const good = rng.pick(GOODS);
    return emitRatio(ctx, {
      facts: { form: 'price-ratio', cheap, dear, mean },
      prompt: `In what ratio must ${good} costing ${perKg(cheap)} be mixed with ${good} costing ${perKg(dear)} so that the mixture costs ${perKg(mean)}?`,
      answer: [p, q],
      mistakes: [
        { parts: [q, p], why: 'reversed the alligation ratio', trap: `${q} : ${p} puts the distances on the wrong side: cheaper : dearer = (${dear} − ${mean}) : (${mean} − ${cheap}).` },
        { parts: reduceParts([cheap, dear]), why: 'used the ratio of the prices' },
        { parts: reduceParts([dear - mean, dear - cheap]), why: 'divided by the full price gap' },
      ],
      steps: [`Cheaper ${cheap}, dearer ${dear}, mean ${mean}.`, `Cheaper : dearer = (${dear} − ${mean}) : (${mean} − ${cheap}) = ${dear - mean} : ${mean - cheap}.`, `= ${rt([p, q])}.`],
      shortcut: `Alligation cross: each quantity is the distance of the OTHER price from the mean.`,
      trap: `The cheaper variety gets the dearer price's distance from the mean.`,
      tags: ['mixture:alligation', 'trick:alligation'],
      visual: { type: 'grid', columns: ['Cheaper', 'Mean', 'Dearer'], rows: [[rs(cheap), rs(mean), rs(dear)], [`${dear - mean}`, '', `${mean - cheap}`]] },
    });
  });
}

function priceQty(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('price-qty', 400, () => {
    const s = priceSet(rng);
    if (!s) return null;
    const { cheap, dear, mean, p, q } = s;
    const qty = p * rng.int(2, 12);
    const ans = (qty * q) / p;
    const good = rng.pick(GOODS);
    const [P] = pickPeople(rng, 1);
    return emit(ctx, {
      facts: { form: 'price-qty', cheap, dear, mean, qty },
      prompt: `${P.name}, a grocer, mixes ${kg(qty)} of ${good} costing ${perKg(cheap)} with some ${good} costing ${perKg(dear)}. If the mixture is worth ${perKg(mean)}, how many kilograms of the costlier ${good} did ${P.g === 'm' ? 'he' : 'she'} use?`,
      answer: ans,
      format: kg,
      mistakes: [
        { value: (qty * p) / q, why: 'reversed the alligation ratio', trap: `${kg((qty * p) / q)} uses cheaper : dearer = ${q} : ${p}. From alligation, cheaper : dearer = ${dear - mean} : ${mean - cheap} = ${p} : ${q}.` },
        { value: qty, why: 'assumed equal quantities' },
        { value: qty + ans, why: 'gave the whole mixture' },
        { value: (qty * (dear - cheap)) / (mean - cheap), why: 'used the full price gap' },
      ].filter((m) => m.value > 0 && twoDp(m.value)),
      steps: [`Cheaper : dearer = (${dear} − ${mean}) : (${mean} − ${cheap}) = ${rt([p, q])}.`, `${p} parts = ${qty} kg ⇒ 1 part = ${fmtExact(qty / p)} kg.`, `Dearer = ${q} parts = ${kg(ans)}.`],
      shortcut: `Alligation ratio first, then scale by the known quantity.`,
      trap: `Keep the ratio in the order cheaper : dearer.`,
      tags: ['mixture:alligation'],
    });
  });
}

function priceProfit(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('price-profit', 500, () => {
    const s = priceSet(rng);
    if (!s) return null;
    const { cheap, dear, mean, p, q } = s;
    const gain = rng.pick([10, 20, 25, 50]);
    const sellRaw = (mean * (100 + gain)) / 100;
    if (!whole(sellRaw * 2)) return null;
    const sell = Math.round(sellRaw * 2) / 2;
    const mistakes: RatioMistake[] = [{ parts: [q, p], why: 'reversed the alligation ratio' }];
    if (sell > cheap && sell < dear) mistakes.unshift({ parts: reduceParts([Math.round((dear - sell) * 2), Math.round((sell - cheap) * 2)]), why: 'used the selling price as the mean (ignored the profit)', trap: `${perKg(sell)} includes the ${gain}% profit. The mean COST is ${perKg(sell)} ÷ ${texFr(fr(100 + gain, 100))} = ${perKg(mean)}.` });
    const good = rng.pick(GOODS);
    return emitRatio(ctx, {
      facts: { form: 'price-profit', cheap, dear, sell, gain },
      prompt: `In what ratio should a trader mix ${good} costing ${perKg(cheap)} with ${good} costing ${perKg(dear)} so that by selling the mixture at ${perKg(sell)} he gains ${gain}%?`,
      answer: [p, q],
      mistakes,
      steps: [`Mean cost = ${rs(sell)} ÷ ${texFr(fr(100 + gain, 100))} = ${rs(mean)} per kg.`, `Cheaper : dearer = (${dear} − ${mean}) : (${mean} − ${cheap}) = ${rt([p, q])}.`],
      shortcut: `Strip the profit from the selling price first; alligate on cost.`,
      trap: `Alligation works on cost prices, not on the selling price.`,
      tags: ['mixture:alligation', 'pl:profit'],
    });
  });
}

function threeVariety(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('three-variety', 600, () => {
    const pa = rng.int(30, 70);
    const pb = pa + rng.int(6, 30);
    const [p, q] = reduceParts([rng.int(1, 5), rng.int(1, 5)]);
    const m1Num = p * pa + q * pb;
    if (m1Num % (p + q) !== 0) return null;
    const m1 = m1Num / (p + q);
    const pc = m1 + rng.pick([-1, 1]) * rng.int(8, 40);
    const [r, s] = reduceParts([rng.int(1, 5), rng.int(1, 5)]);
    const fNum = r * m1 + s * pc;
    if (pc <= 10 || fNum % (r + s) !== 0 || p === q) return null;
    const final = fNum / (r + s);
    return emit(ctx, {
      facts: { form: 'three-variety', pa, pb, p, q, r, s, final },
      prompt: `Tea of variety A (${perKg(pa)}) and variety B (${perKg(pb)}) are mixed in the ratio ${p} : ${q}. This blend is then mixed with variety C in the ratio ${r} : ${s}, and the final mixture is worth ${perKg(final)}. What is the price of variety C?`,
      answer: pc,
      format: perKg,
      mistakes: [
        { value: 3 * final - pa - pb, why: 'treated the three varieties as equal parts', trap: `${perKg(3 * final - pa - pb)} assumes A, B and C are in equal amounts. First find the blend's price (${perKg(m1)}), then alligate the blend with C in ${r} : ${s}.` },
        { value: ((r + s) * final - r * ((pa + pb) / 2)) / s, why: 'took the plain average of A and B for the blend' },
        { value: ((r + s) * final - s * m1) / r, why: 'swapped the blend and C in the second ratio' },
        { value: m1, why: 'gave the price of the first blend' },
      ].filter((m) => m.value > 0 && twoDp(m.value)),
      steps: [`Blend of A and B = (${p} × ${pa} + ${q} × ${pb}) ÷ ${p + q} = ${perKg(m1)}.`, `Final = (${r} × ${m1} + ${s} × C) ÷ ${r + s} = ${final}.`, `C = (${r + s} × ${final} − ${r} × ${m1}) ÷ ${s} = ${perKg(pc)}.`],
      shortcut: `Two-stage mixture: reduce the first blend to a single price, then it is a two-variety problem.`,
      trap: `Weight each price by its share; the varieties are not in equal amounts.`,
      tags: ['mixture:alligation', 'level:multi-step'],
    });
  });
}

function alligationPrice(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return priceRatio(ctx);
  if (difficulty === 'medium') return priceQty(ctx);
  if (difficulty === 'hard') return priceProfit(ctx);
  return threeVariety(ctx);
}

/* ------------------------------------------------------------------ */
/* 4. Repeated replacement                                              */
/* ------------------------------------------------------------------ */

const FRACS = [4, 5, 8, 10]; // draw = capacity / k

function replaceLeft(ctx: Ctx, times: number): Res {
  const { rng } = ctx;
  return attempt('replace-left', 300, () => {
    const k = rng.pick(FRACS);
    const draw = rng.int(2, 10);
    const capacity = draw * k;
    const left = capacity * ((k - 1) / k) ** times;
    if (!twoDp(left) || capacity > 200) return null;
    const leftR = Math.round(left * 100) / 100;
    return emit(ctx, {
      facts: { form: 'replace-left', capacity, draw, times },
      prompt: `A vessel is full of ${L(capacity)} of pure milk. ${L(draw)} of milk is taken out and replaced with water. This process is carried out ${times === 2 ? 'twice' : `${times} times`} in all. How much milk is left in the vessel?`,
      answer: leftR,
      format: L,
      mistakes: [
        { value: capacity - times * draw, why: 'subtracted the same amount of milk each time', trap: `${L(capacity - times * draw)} removes ${draw} L of milk every time. After the first round, each ${draw} L drawn is part water, so less milk goes out each time.` },
        { value: capacity * ((k - 1) / k), why: 'did only one operation' },
        { value: capacity - leftR, why: 'gave the water instead of the milk' },
        { value: capacity * ((k - 1) / k) ** (times + 1), why: 'one operation too many' },
      ].filter((m) => m.value > 0 && twoDp(m.value)),
      steps: [`Each time, ${draw}/${capacity} = ${texFr(fr(1, k))} of the contents is replaced, so milk becomes ${texFr(fr(k - 1, k))} of what it was.`, `Milk left = ${capacity} × (${texFr(fr(k - 1, k))})^${times} = ${L(leftR)}.`],
      shortcut: `Final = initial × (1 − x/C)ⁿ.`,
      trap: `Repeated replacement is multiplicative, not linear.`,
      tags: ['mixture:replacement'],
    });
  });
}

function replaceRatio(ctx: Ctx): Res {
  const { rng } = ctx;
  const k = rng.pick([3, 4, 5, 6, 10]);
  const draw = rng.int(3, 12);
  const capacity = draw * k;
  const times = 2;
  const milkParts = (k - 1) ** times;
  const ans = reduceParts([milkParts, k ** times - milkParts]);
  const linear = reduceParts([capacity - times * draw, times * draw]);
  return emitRatio(ctx, {
    facts: { form: 'replace-ratio', capacity, draw, times },
    prompt: `From a can full of ${L(capacity)} of pure milk, ${L(draw)} is drawn off and replaced with water. This is done once more. What is the final ratio of milk to water in the can?`,
    answer: ans,
    mistakes: [
      { parts: linear, why: 'removed milk linearly', trap: `${rt(linear)} assumes ${draw} L of milk goes out each time. The second draw is part water: milk left = ${capacity} × (${texFr(fr(k - 1, k))})².` },
      { parts: [ans[1], ans[0]], why: 'reversed the ratio' },
      { parts: reduceParts([k - 1, 1]), why: 'did only one operation' },
    ],
    steps: [`Milk left = ${capacity} × (${texFr(fr(k - 1, k))})² = ${fmtExact((capacity * milkParts) / k ** 2)} L.`, `Water = ${capacity} − ${fmtExact((capacity * milkParts) / k ** 2)} = ${fmtExact(capacity - (capacity * milkParts) / k ** 2)} L.`, `Milk : water = ${milkParts} : ${k ** 2 - milkParts} = ${rt(ans)}.`],
    shortcut: `Milk : total = (k − 1)² : k² with k = capacity/draw = ${k}.`,
    trap: `Each draw removes a fraction of the milk present, not a fixed amount.`,
    tags: ['mixture:replacement'],
  });
}

function replaceCapacity(ctx: Ctx): Res {
  const { rng } = ctx;
  const k = rng.pick([3, 4, 5, 6, 8]);
  const draw = rng.int(3, 12);
  const times = 3;
  const m = (k - 1) ** times;
  const w = k ** times - m;
  const capacity = draw * k;
  return emit(ctx, {
    facts: { form: 'replace-capacity', draw, times, m, w },
    prompt: `From a vessel full of pure milk, ${L(draw)} is taken out and replaced with water. This is repeated two more times. The ratio of milk to water in the vessel is now ${m} : ${w}. What is the capacity of the vessel?`,
    answer: capacity,
    format: L,
    mistakes: [
      { value: draw * (k - 1), why: 'took (k − 1) × draw', trap: `${L(draw * (k - 1))} matches the cube root of the milk parts, not of the total. (1 − ${draw}/C)³ = ${m}/${m + w} ⇒ 1 − ${draw}/C = ${k - 1}/${k} ⇒ C = ${k} × ${draw}.` },
      { value: draw * (k + 1), why: 'off by one in the cube root' },
      { value: (draw * (m + w)) / w, why: 'used the ratio linearly' },
      { value: 3 * draw, why: 'added the three draws' },
    ].filter((mm) => mm.value > 0 && twoDp(mm.value)),
    steps: [`Milk fraction left = ${m}/${m + w} = (${k - 1}/${k})³.`, `So each draw keeps ${k - 1}/${k}: ${draw}/C = 1/${k}.`, `C = ${k} × ${draw} = ${L(capacity)}.`],
    shortcut: `Cube-root the milk fraction: ∛(${m}/${m + w}) = ${k - 1}/${k}.`,
    trap: `Take the cube root of milk ÷ TOTAL (${m + w}), not milk ÷ water.`,
    tags: ['mixture:replacement', 'trick:cube-roots'],
  });
}

function replaceMixture(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('replace-mixture', 400, () => {
    const [a, b] = rng.pick(RATIOS);
    const k = rng.pick([4, 5, 10]);
    const draw = rng.int(3, 12);
    const capacity = draw * k;
    if (capacity % (a + b) !== 0) return null;
    const milk = ((capacity * a) / (a + b)) * ((k - 1) / k) ** 2;
    const water = capacity - milk;
    const scale = 100 * (a + b) * k * k;
    const ans = reduceParts([Math.round(milk * scale), Math.round(water * scale)]);
    if (!small(ans, 60)) return null;
    const naiveMilk = ((capacity * a) / (a + b)) - 2 * ((draw * a) / (a + b));
    const naive = reduceParts([Math.round(naiveMilk * scale), Math.round((capacity - naiveMilk) * scale)]);
    return emitRatio(ctx, {
      facts: { form: 'replace-mixture', capacity, a, b, draw, times: 2 },
      prompt: `A vessel contains ${L(capacity)} of milk and water in the ratio ${a} : ${b}. ${L(draw)} of the mixture is taken out and replaced with water, and the process is repeated once more. What is the ratio of milk to water now?`,
      answer: ans,
      mistakes: [
        { parts: naive, why: 'removed milk linearly', trap: `That ratio takes the same ${fmtExact((draw * a) / (a + b))} L of milk out each time; the second draw carries less milk.` },
        { parts: [ans[1], ans[0]], why: 'reversed the ratio' },
        { parts: reduceParts([a * (k - 1), b * (k - 1) + (a + b)]), why: 'did only one operation' },
      ].filter((m) => m.parts.every((v) => v > 0 && v <= 500)),
      steps: [`Milk = ${fmtExact((capacity * a) / (a + b))} L at the start.`, `After two replacements: ${fmtExact((capacity * a) / (a + b))} × (${texFr(fr(k - 1, k))})² = ${fmtExact(milk)} L; water = ${fmtExact(water)} L.`, `Milk : water = ${rt(ans)}.`],
      shortcut: `Only the milk decays by (1 − x/C)ⁿ; water is whatever is left.`,
      trap: `Water is added each time, so apply the decay factor to milk only.`,
      tags: ['mixture:replacement', 'level:multi-step'],
    });
  });
}

function replacement(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return replaceLeft(ctx, 2);
  if (difficulty === 'medium') return replaceRatio(ctx);
  if (difficulty === 'hard') return replaceCapacity(ctx);
  return replaceMixture(ctx);
}

/* ------------------------------------------------------------------ */
/* 5. Profit by adding water                                            */
/* ------------------------------------------------------------------ */

function waterGain(ctx: Ctx): Res {
  const { rng } = ctx;
  const [w, m] = rng.pick([[1, 4], [1, 5], [1, 8], [1, 10], [1, 3], [2, 5], [3, 10], [1, 6]] as [number, number][]);
  const ans = (w / m) * 100;
  return emit(ctx, {
    facts: { form: 'water-gain', w, m },
    prompt: `A milkman mixes water with milk in the ratio ${w} : ${m} and sells the mixture at the cost price of milk. What is his gain percentage?`,
    answer: ans,
    format: fmtPct,
    mistakes: [
      { value: (w / (w + m)) * 100, why: 'divided by the total mixture instead of the milk', trap: `${fmtPct((w / (w + m)) * 100)} divides the free water by the whole mixture. He pays only for the ${m} parts of milk, so gain = ${w}/${m}.` },
      { value: w * 10, why: 'multiplied the water parts by 10' },
    ].filter((mm) => mm.value > 0 && mm.value !== ans),
    steps: [`Cost: ${m} parts of milk. Revenue: ${w + m} parts sold at the milk price.`, `Gain = ${w} part${w > 1 ? 's' : ''} on ${m} = ${fmtPct(ans)}.`],
    shortcut: `Gain % = water ÷ milk × 100.`,
    trap: `The gain is measured on what he paid for — the milk only.`,
    tags: ['mixture:adding-water', 'pl:profit'],
  });
}

function waterRatio(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('water-ratio', 400, () => {
    const cost = rng.int(30, 70);
    const gain = rng.pick([10, 20, 25, 50]);
    const [w, m] = reduceParts([rng.int(1, 4), rng.int(3, 12)]);
    if (w >= m) return null;
    const mean = (cost * m) / (w + m);
    const sellRaw = (mean * (100 + gain)) / 100;
    if (!whole(sellRaw)) return null;
    const sell = Math.round(sellRaw);
    const naiveMean = sell;
    const naive = naiveMean < cost ? reduceParts([Math.round((cost - naiveMean) * 100), Math.round(naiveMean * 100)]) : null;
    return emitRatio(ctx, {
      facts: { form: 'water-ratio', cost, sell, gain },
      prompt: `A milkman buys milk at ${rs(cost)} per litre, adds water to it and sells the mixture at ${rs(sell)} per litre, making a profit of ${gain}%. In what ratio did he mix water and milk?`,
      answer: [w, m],
      mistakes: [
        ...(naive ? [{ parts: naive, why: 'used the selling price as the cost of the mixture', trap: `${rs(sell)} includes the ${gain}% profit; the cost of a litre of mixture is ${rs(sell)} ÷ ${texFr(fr(100 + gain, 100))} = ${rs(mean)}.` }] : []),
        { parts: [m, w], why: 'reversed the ratio (milk : water)' },
        { parts: reduceParts([w, w + m]), why: 'gave water : mixture' },
      ],
      steps: [`Cost of 1 L of mixture = ${rs(sell)} ÷ ${texFr(fr(100 + gain, 100))} = ${rs(mean)}.`, `Milk (₹${cost}) and water (₹0): water : milk = (${cost} − ${fmtExact(mean)}) : (${fmtExact(mean)} − 0).`, `= ${rt([w, m])}.`],
      shortcut: `Alligation with water at ₹0: water : milk = (milk price − mean) : mean.`,
      trap: `Remove the profit first — alligation needs the cost of the mixture.`,
      tags: ['mixture:adding-water', 'trick:alligation'],
    });
  });
}

function waterProfit(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('water-profit', 400, () => {
    const milk = rng.int(4, 20) * 5;
    const cost = rng.int(30, 70);
    const water = rng.int(2, 20);
    const sell = rng.int(cost - 10, cost + 10);
    const revenue = (milk + water) * sell;
    const outlay = milk * cost;
    const ans = ((revenue - outlay) / outlay) * 100;
    if (ans <= 0 || !twoDp(ans) || ans > 60) return null;
    const [P] = pickPeople(rng, 1);
    return emit(ctx, {
      facts: { form: 'water-profit', milk, cost, water, sell },
      prompt: `${P.name} buys ${L(milk)} of milk at ${rs(cost)} per litre, adds ${L(water)} of water and sells the whole mixture at ${rs(sell)} per litre. What is ${P.g === 'm' ? 'his' : 'her'} profit percentage?`,
      answer: ans,
      format: fmtPct,
      mistakes: [
        { value: ((milk * sell - outlay) / outlay) * 100 > 0 ? ((milk * sell - outlay) / outlay) * 100 : (water / milk) * 100, why: 'forgot that the water is sold too', trap: `The ${water} L of water is sold at ${rs(sell)} as well: revenue = ${milk + water} × ${sell}.` },
        { value: ((revenue - outlay) / revenue) * 100, why: 'took profit on the selling price' },
        { value: (water / milk) * 100, why: 'assumed selling at the cost price of milk' },
      ].filter((m) => m.value > 0 && twoDp(m.value)),
      steps: [`Cost = ${milk} × ${rs(cost)} = ${rs(outlay)}.`, `Revenue = ${milk + water} × ${rs(sell)} = ${rs(revenue)}.`, `Profit % = (${revenue} − ${outlay}) ÷ ${outlay} × 100 = ${fmtPct(ans)}.`],
      shortcut: `Compare total revenue with total cost; water costs nothing.`,
      trap: `Profit % is on the cost price, which is the milk only.`,
      tags: ['mixture:adding-water', 'pl:profit'],
    });
  });
}

function replaceGain(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('replace-gain', 300, () => {
    const k = rng.pick([4, 5, 10]);
    const draw = rng.int(2, 10);
    const capacity = draw * k;
    const times = 2;
    const left = capacity * ((k - 1) / k) ** times;
    const ans = (capacity / left - 1) * 100;
    if (!twoDp(ans) && fr(capacity * k * k - (k - 1) ** 2 * capacity, (k - 1) ** 2 * capacity)[1] > 90) return null;
    return emit(ctx, {
      facts: { form: 'replace-gain', capacity, draw, times },
      prompt: `A milkman has ${L(capacity)} of pure milk. He takes out ${L(draw)} and replaces it with water, and then repeats this once more. He sells the whole mixture at the cost price of pure milk. What is his gain percentage?`,
      answer: ans,
      format: fmtPct,
      mistakes: [
        { value: ((times * draw) / (capacity - times * draw)) * 100, why: 'assumed the milk fell by the same amount each time', trap: `That value removes ${draw} L of milk each time. The second draw is part water, so only ${fmtExact(left)} L of milk remains.` },
        { value: ((capacity - left) / capacity) * 100, why: 'divided the water by the whole mixture' },
        { value: (1 / (k - 1)) * 100, why: 'counted only one replacement' },
      ].filter((m) => m.value > 0),
      step: 10,
      steps: [`Milk left = ${capacity} × (${texFr(fr(k - 1, k))})² = ${fmtExact(left)} L — this is all he paid for.`, `He sells ${capacity} L at the milk price.`, `Gain % = (${capacity} − ${fmtExact(left)}) ÷ ${fmtExact(left)} × 100 = ${fmtPct(ans)}.`],
      shortcut: `Gain factor = (k/(k − 1))² with k = ${k}.`,
      trap: `The cost is only the milk that remains; the gain is measured on that.`,
      tags: ['mixture:adding-water', 'mixture:replacement', 'level:multi-step'],
    });
  });
}

function addingWaterProfit(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return waterGain(ctx);
  if (difficulty === 'medium') return waterRatio(ctx);
  if (difficulty === 'hard') return waterProfit(ctx);
  return replaceGain(ctx);
}

/* ------------------------------------------------------------------ */

const BUILDERS: Record<string, (ctx: Ctx) => Res> = {
  'mixing-solutions': mixingSolutions,
  'percent-mixture': percentMixture,
  'alligation-price': alligationPrice,
  replacement,
  'adding-water-profit': addingWaterProfit,
};

export const generator = defineGenerator<MixturesFacts>(META, SUBTYPES, (ctx) => {
  const build = BUILDERS[ctx.subtype.id];
  if (!build) throw new Error(`quant.mixtures: no builder for ${ctx.subtype.id}`);
  return build(ctx);
});

