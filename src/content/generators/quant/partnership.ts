/**
 * Partnership (SPEC 8.1 Q6). Profit is shared in the ratio of capital × time. Every partner's money is a
 * schedule of segments [fromMonth, toMonth, capital] over the business period, so joining, leaving and
 * capital changes are all the same computation. Research ranges: capital ₹2,400–12,000, profit
 * ₹1,500–9,000, months 3–10. Traps: 12 − m vs m months, ignoring time, withdrawals splitting the year.
 */
import { defineGenerator, type BuildContext, type GenResult, type SubtypeDef } from '../types';
import { attempt, emit, emitRatio, gcd, listAnd, multipleIn, pickPeople, reduceParts, rs, type Mist, type RatioMistake } from './partnership/kit';

const META = { name: 'quant.partnership', version: 1, subject: 'quant', chapter: 'partnership' } as const;

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'time-weighted', label: 'Capital × time', weight: 2 },
  { id: 'join-withdraw', label: 'Joining or leaving mid-year', weight: 2.5 },
  { id: 'capital-change', label: 'Capital added or withdrawn', weight: 1.5 },
  { id: 'working-partner', label: 'Working partner’s salary or commission', weight: 1 },
  { id: 'capital-from-share', label: 'Capital or time from the profit share', weight: 1.5 },
];

/** [fromMonth, toMonth, capital] — money held from month `from` to month `to`. */
export type Seg = [number, number, number];

export type PartnershipFacts =
  /** Schedules over `period` months; total profit; asked: share of partner `ask`, or the gap between two partners. */
  | { form: 'shares'; schedules: Seg[][]; period: number; profit: number; ask: number; vs?: number }
  /** Capital ratio parts and time ratio parts; total profit; asked: share of `ask` (or gap to `vs`). */
  | { form: 'ratio-shares'; caps: number[]; times: number[]; profit: number; ask: number; vs?: number }
  /** A (capA, full year) and B (capB, joins after unknown months); profit shares ratio pA:pB; asked: months after which B joined. */
  | { form: 'find-join'; capA: number; capB: number; pA: number; pB: number }
  /** Three partners for the year except one who left after unknown months; that partner's share and total profit; asked: months stayed. */
  | { form: 'find-leave'; caps: number[]; leaver: number; share: number; profit: number }
  /** Working partner gets `pct`% of profit (or `salary` per month); rest split by capital × time; asked: `ask`. */
  | { form: 'working'; pct: number; salary: number; schedules: Seg[][]; profit: number; ask: 'working-total' | 'other-share' }
  /** Working partner gets pct%; the rest split capA:capB; A's total exceeds B's by gap; asked: total profit. */
  | { form: 'working-gap'; pct: number; capA: number; capB: number; gap: number }
  /** Equal time; A's capital, total profit, B's share; asked: B's capital. */
  | { form: 'find-capital'; capA: number; monthsA: number; monthsB: number; profit: number; shareB: number }
  /** Profit ratio and time ratio; asked: capital ratio (or capital ratio + times → time ratio). */
  | { form: 'ratio-from-profit'; profit: number[]; other: number[]; find: 'capital' | 'time' };

type Ctx = BuildContext;
type Res = GenResult<PartnershipFacts>;

const MONTHS_TXT = (m: number): string => `${m} month${m === 1 ? '' : 's'}`;
const weightOf = (segs: Seg[]): number => segs.reduce((s, [a, b, c]) => s + c * (b - a), 0);

/** Pick a total profit that splits into whole rupees for the given weights, in [lo, hi]. */
function profitFor(rng: Ctx['rng'], weights: number[], lo = 1500, hi = 9000): number | null {
  const parts = reduceParts(weights);
  const total = parts.reduce((s, x) => s + x, 0);
  const unit = total * (total <= 40 ? 10 : 1);
  if (unit > hi) return null;
  return multipleIn(rng, Math.max(lo, unit), Math.max(hi, unit), unit);
}

function shareOf(weights: number[], profit: number, i: number): number {
  const W = weights.reduce((s, x) => s + x, 0);
  return (profit * weights[i]) / W;
}

const cap = (rng: Ctx['rng']): number => multipleIn(rng, 2400, 12000, rng.pick([200, 400, 1000]));
const ratioText = (ws: number[]): string => reduceParts(ws).join(' : ');

function shareMistakes(names: string[], caps: number[], weights: number[], profit: number, ask: number, alt?: number[]): Mist[] {
  const capShare = shareOf(caps, profit, ask);
  const ms: Mist[] = [
    { value: capShare, why: 'split in the ratio of capitals only (ignored time)', trap: `${rs(Math.round(capShare))} splits by capital alone. Money invested for fewer months earns less: use capital × months = ${ratioText(weights)}.` },
    { value: profit - shareOf(weights, profit, ask), why: "gave the other partners' combined share" },
    { value: shareOf(weights, profit, (ask + 1) % weights.length), why: `gave ${names[(ask + 1) % names.length]}'s share` },
    { value: profit / weights.length, why: 'split equally' },
  ];
  if (alt) ms.splice(1, 0, { value: shareOf(alt, profit, ask), why: 'counted the joining month instead of the months actually invested', trap: `That value counts the months before joining. A partner who joins after m months invests for 12 − m months.` });
  return ms;
}

/* ------------------------------------------------------------------ */
/* 1. Capital × time                                                    */
/* ------------------------------------------------------------------ */

function twoPartners(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('two-partners', 300, () => {
    const caps = [cap(rng), cap(rng)];
    const months = [12, rng.int(4, 10)];
    if (rng.chance(0.5)) months.reverse();
    const schedules: Seg[][] = caps.map((c, i) => [[12 - months[i], 12, c]]);
    const weights = schedules.map(weightOf);
    const profit = profitFor(rng, weights);
    if (!profit) return null;
    const ask = rng.int(0, 1);
    const names = pickPeople(rng, 2).map((p) => p.name);
    const ans = shareOf(weights, profit, ask);
    return emit(ctx, {
      facts: { form: 'shares', schedules, period: 12, profit, ask },
      prompt: `${names[0]} and ${names[1]} started a business. ${names[0]} invested ${rs(caps[0])} for ${MONTHS_TXT(months[0])} and ${names[1]} invested ${rs(caps[1])} for ${MONTHS_TXT(months[1])}. Out of a total profit of ${rs(profit)}, what is ${names[ask]}'s share?`,
      answer: ans,
      format: rs,
      mistakes: shareMistakes(names, caps, weights, profit, ask),
      steps: [
        `Ratio = ${caps[0]} × ${months[0]} : ${caps[1]} × ${months[1]} = ${weights[0]} : ${weights[1]} = ${ratioText(weights)}.`,
        `${names[ask]}'s share = ${rs(profit)} × ${reduceParts(weights)[ask]}/${reduceParts(weights).reduce((s, x) => s + x, 0)} = ${rs(ans)}.`,
      ],
      shortcut: `Cancel common factors first: ${caps[0]}:${caps[1]} and ${months[0]}:${months[1]} reduce separately, then multiply.`,
      trap: `Profit follows capital × time, not capital alone.`,
      tags: ['partnership:capital-time'],
    });
  });
}

function threePartners(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('three-partners', 300, () => {
    const caps = [cap(rng), cap(rng), cap(rng)];
    const months = [12, rng.int(4, 11), rng.int(3, 10)];
    const schedules: Seg[][] = caps.map((c, i) => [[12 - months[i], 12, c]]);
    const weights = schedules.map(weightOf);
    if (reduceParts(weights).reduce((s, x) => s + x, 0) > 300) return null;
    const profit = profitFor(rng, weights, 3000, 15000);
    if (!profit) return null;
    const ask = rng.int(0, 2);
    const names = pickPeople(rng, 3).map((p) => p.name);
    const ans = shareOf(weights, profit, ask);
    return emit(ctx, {
      facts: { form: 'shares', schedules, period: 12, profit, ask },
      prompt: `${listAnd(names)} invested ${listAnd(caps.map((c) => rs(c)))} in a business for ${listAnd(months.map((m) => String(m)))} months respectively. If the total profit is ${rs(profit)}, what is ${names[ask]}'s share?`,
      answer: ans,
      format: rs,
      mistakes: shareMistakes(names, caps, weights, profit, ask),
      steps: [`Ratio = ${caps.map((c, i) => `${c} × ${months[i]}`).join(' : ')} = ${ratioText(weights)}.`, `${names[ask]}'s share = ${rs(profit)} × ${reduceParts(weights)[ask]}/${reduceParts(weights).reduce((s, x) => s + x, 0)} = ${rs(ans)}.`],
      shortcut: `Reduce capitals and months to small numbers before multiplying.`,
      trap: `Each partner's weight is capital × months.`,
      tags: ['partnership:capital-time'],
    });
  });
}

function ratioShares(ctx: Ctx, fractions: boolean): Res {
  const { rng } = ctx;
  return attempt('ratio-shares', 300, () => {
    let caps: number[];
    let capText: string;
    let dens: number[] = [];
    if (fractions) {
      dens = rng.pick([[2, 3, 4], [2, 3, 6], [3, 4, 6], [2, 4, 5], [3, 5, 6]]);
      const L = dens.reduce((acc, x) => (acc * x) / gcd(acc, x), 1);
      caps = dens.map((x) => L / x);
      capText = dens.map((x) => `$\\frac{1}{${x}}$`).join(' : ');
    } else {
      caps = rng.pick([[2, 3, 5], [3, 4, 5], [4, 5, 6], [5, 6, 8], [3, 5, 7], [2, 5, 6]]);
      capText = caps.join(' : ');
    }
    const times = rng.pick([[4, 3, 2], [3, 2, 1], [5, 4, 3], [6, 5, 4], [2, 3, 4], [4, 5, 6]]);
    const weights = caps.map((c, i) => c * times[i]);
    const profit = profitFor(rng, weights, 3000, 20000);
    if (!profit) return null;
    const names = pickPeople(rng, 3).map((p) => p.name);
    const shares = weights.map((_, i) => shareOf(weights, profit, i));
    const hi = shares.indexOf(Math.max(...shares));
    const lo = shares.indexOf(Math.min(...shares));
    if (hi === lo) return null;
    const gap = shares[hi] - shares[lo];
    const naiveW = dens.map((c, i) => c * times[i]);
    return emit(ctx, {
      facts: { form: 'ratio-shares', caps, times, profit, ask: hi, vs: lo },
      prompt: `${listAnd(names)} start a business with capitals in the ratio ${capText}, and keep them invested for periods in the ratio ${times.join(' : ')}. Out of a total profit of ${rs(profit)}, what is the difference between the largest and the smallest shares?`,
      answer: gap,
      format: rs,
      mistakes: [
        ...(fractions ? [{ value: shareOf(naiveW, profit, naiveW.indexOf(Math.max(...naiveW))) - shareOf(naiveW, profit, naiveW.indexOf(Math.min(...naiveW))), why: 'used the denominators as the capital ratio', trap: `The capitals are $\\frac{1}{a}$ : $\\frac{1}{b}$ : $\\frac{1}{c}$ — convert with the LCM to ${caps.join(' : ')}; the denominators themselves give the reverse order.` }] : []),
        { value: shareOf(caps, profit, caps.indexOf(Math.max(...caps))) - shareOf(caps, profit, caps.indexOf(Math.min(...caps))), why: 'ignored the time ratio' },
        { value: shares[hi], why: 'gave the largest share' },
        { value: shares[hi] - shares[3 - hi - lo], why: 'subtracted the middle share' },
      ],
      steps: [
        ...(fractions ? [`Capitals ${capText} = ${caps.join(' : ')} (multiply by the LCM).`] : []),
        `Profit ratio = capital × time = ${caps.map((c, i) => `${c} × ${times[i]}`).join(' : ')} = ${ratioText(weights)}.`,
        `Shares: ${names.map((n, i) => `${n} ${rs(shares[i])}`).join(', ')}.`,
        `Difference = ${rs(shares[hi])} − ${rs(shares[lo])} = ${rs(gap)}.`,
      ],
      shortcut: `Difference = profit × (largest part − smallest part) ÷ total parts.`,
      trap: `Combine the capital ratio and the time ratio term by term before splitting.`,
      tags: ['partnership:capital-time', ...(fractions ? ['ratio:reciprocal'] : [])],
    });
  });
}

function timeWeighted(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return twoPartners(ctx);
  if (difficulty === 'medium') return threePartners(ctx);
  if (difficulty === 'hard') return ratioShares(ctx, false);
  return ratioShares(ctx, true);
}

/* ------------------------------------------------------------------ */
/* 2. Joining / leaving                                                 */
/* ------------------------------------------------------------------ */

function joinShare(ctx: Ctx, three: boolean): Res {
  const { rng } = ctx;
  return attempt('join-share', 300, () => {
    const n = three ? 3 : 2;
    const caps = Array.from({ length: n }, () => cap(rng));
    const joins = three ? [0, rng.chance(0.5) ? 0 : rng.int(2, 6), rng.int(3, 9)] : [0, rng.int(2, 9)];
    const leaves = three && rng.chance(0.4) ? [12, 12, 12].map((v, i) => (i === 0 ? rng.int(6, 10) : v)) : Array(n).fill(12);
    const schedules: Seg[][] = caps.map((c, i) => [[joins[i], leaves[i], c]]);
    const weights = schedules.map(weightOf);
    if (reduceParts(weights).reduce((s, x) => s + x, 0) > 400) return null;
    const profit = profitFor(rng, weights, 1500, three ? 15000 : 9000);
    if (!profit) return null;
    const ask = three ? rng.int(0, 2) : 1;
    const names = pickPeople(rng, n).map((p) => p.name);
    const alt = schedules.map((segs) => segs.reduce((s, [a, b, c]) => s + c * (a > 0 ? a : b - a), 0));
    const ans = shareOf(weights, profit, ask);
    const events: string[] = [];
    events.push(`${names[0]} started a business with ${rs(caps[0])}${three && joins[1] === 0 ? ` and ${names[1]} joined at the start with ${rs(caps[1])}` : ''}.`);
    for (let i = 1; i < n; i++) if (joins[i] > 0) events.push(`After ${MONTHS_TXT(joins[i])}, ${names[i]} joined with ${rs(caps[i])}.`);
    if (leaves[0] < 12) events.push(`${names[0]} withdrew completely after ${MONTHS_TXT(leaves[0])}.`);
    return emit(ctx, {
      facts: { form: 'shares', schedules, period: 12, profit, ask },
      prompt: `${events.join(' ')} At the end of the year the profit was ${rs(profit)}. What is ${names[ask]}'s share?`,
      answer: ans,
      format: rs,
      mistakes: shareMistakes(names, caps, weights, profit, ask, alt),
      steps: [
        ...schedules.map((segs, i) => `${names[i]}: ${rs(caps[i])} × ${segs[0][1] - segs[0][0]} months = ${weights[i]}.`),
        `Ratio = ${ratioText(weights)}; ${names[ask]}'s share = ${rs(profit)} × ${reduceParts(weights)[ask]}/${reduceParts(weights).reduce((s, x) => s + x, 0)} = ${rs(ans)}.`,
      ],
      shortcut: `Joining after m months ⇒ invested for (12 − m) months.`,
      trap: `A partner who joins after ${MONTHS_TXT(joins[n - 1])} is in the business for ${12 - joins[n - 1]} months, not ${joins[n - 1]}.`,
      tags: ['partnership:join-withdraw'],
    });
  });
}

function findJoin(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('find-join', 300, () => {
    const capA = cap(rng);
    const capB = cap(rng);
    // Options are months 1–11: choose the letter first, then an answer that leaves room on both sides.
    const rank = rng.int(0, 4);
    const m = rng.int(Math.max(2, 1 + rank), Math.min(10, 11 - (4 - rank)));
    const [pA, pB] = reduceParts([capA * 12, capB * (12 - m)]);
    if (pA + pB > 40) return null;
    const names = pickPeople(rng, 2).map((p) => p.name);
    return emit(ctx, {
      facts: { form: 'find-join', capA, capB, pA, pB },
      prompt: `${names[0]} started a business with ${rs(capA)}. Some months later, ${names[1]} joined with ${rs(capB)}. At the end of the year, the profit was shared in the ratio ${pA} : ${pB}. After how many months did ${names[1]} join?`,
      answer: m,
      format: (v) => MONTHS_TXT(v),
      integer: true,
      step: 1,
      rank,
      mistakes: [
        { value: 12 - m, why: 'gave the months invested instead of the joining time', trap: `${MONTHS_TXT(12 - m)} is how long ${names[1]} stayed invested; ${names[1]} joined after 12 − ${12 - m} = ${m} months.` },
        { value: m + 1, why: 'off by one' },
        { value: m - 1, why: 'off by one' },
      ].filter((x) => x.value > 0 && x.value < 12),
      steps: [
        `${capA} × 12 : ${capB} × t = ${pA} : ${pB}, where t = months ${names[1]} invested.`,
        `t = ${capA} × 12 × ${pB} ÷ (${capB} × ${pA}) = ${12 - m}.`,
        `${names[1]} joined after 12 − ${12 - m} = ${m} months.`,
      ],
      shortcut: `Find the invested months first, then subtract from 12.`,
      trap: `The profit ratio gives months invested; the question asks when ${names[1]} joined.`,
      tags: ['partnership:join-withdraw', 'partnership:find-time'],
    });
  });
}

function findLeave(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('find-leave', 400, () => {
    const caps = [cap(rng), cap(rng), cap(rng)];
    const leaver = rng.int(0, 2);
    // Options are months 1–11 (a partner who stays 12 months has not left).
    const rank = rng.int(0, 4);
    const stay = rng.int(Math.max(3, 1 + rank), Math.min(10, 11 - (4 - rank)));
    const weights = caps.map((c, i) => c * (i === leaver ? stay : 12));
    const profit = profitFor(rng, weights, 3000, 15000);
    if (!profit) return null;
    const share = shareOf(weights, profit, leaver);
    const names = pickPeople(rng, 3).map((p) => p.name);
    return emit(ctx, {
      facts: { form: 'find-leave', caps, leaver, share, profit },
      prompt: `${listAnd(names)} started a business with ${listAnd(caps.map((c) => rs(c)))} respectively. ${names[leaver]} left the business after a few months, while the others stayed for the whole year. Out of the year's profit of ${rs(profit)}, ${names[leaver]} received ${rs(share)}. For how many months did ${names[leaver]} stay in the business?`,
      answer: stay,
      format: (v) => MONTHS_TXT(v),
      integer: true,
      step: 1,
      rank,
      mistakes: [
        { value: 12 - stay, why: 'gave the months remaining after leaving', trap: `${MONTHS_TXT(12 - stay)} is the part of the year after ${names[leaver]} left.` },
        { value: stay + 1, why: 'off by one' },
        { value: stay - 1, why: 'off by one' },
        { value: stay + 2, why: 'arithmetic slip' },
      ].filter((x) => x.value > 0 && x.value < 12),
      steps: [
        `Others' share = ${rs(profit)} − ${rs(share)} = ${rs(profit - share)}, earned by ${caps.filter((_, i) => i !== leaver).map((c) => `${c} × 12`).join(' + ')} = ${weights.filter((_, i) => i !== leaver).reduce((s, x) => s + x, 0)}.`,
        `Profit per unit of (capital × month) = ${rs(profit - share)} ÷ ${weights.filter((_, i) => i !== leaver).reduce((s, x) => s + x, 0)}.`,
        `${names[leaver]}'s capital × months = ${rs(share)} ÷ that = ${weights[leaver]} ⇒ months = ${weights[leaver]} ÷ ${caps[leaver]} = ${stay}.`,
      ],
      shortcut: `${names[leaver]}'s share : others' share = ${caps[leaver]}t : ${weights.filter((_, i) => i !== leaver).reduce((s, x) => s + x, 0)}.`,
      trap: `Compare the leaver's share with the others' combined share, not with the total.`,
      tags: ['partnership:join-withdraw', 'partnership:find-time'],
    });
  });
}

function joinWithdraw(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return joinShare(ctx, false);
  if (difficulty === 'medium') return joinShare(ctx, true);
  if (difficulty === 'hard') return findJoin(ctx);
  return findLeave(ctx);
}

/* ------------------------------------------------------------------ */
/* 3. Capital changes                                                   */
/* ------------------------------------------------------------------ */

function capitalChange(ctx: Ctx): Res {
  const { rng, difficulty } = ctx;
  return attempt('capital-change', 400, () => {
    const names = pickPeople(rng, difficulty === 'extreme' ? 3 : 2).map((p) => p.name);
    const n = names.length;
    const caps = Array.from({ length: n }, () => cap(rng));
    const schedules: Seg[][] = caps.map((c) => [[0, 12, c]]);
    const events: string[] = [];
    const change = (i: number, at: number, delta: number) => {
      const segs = schedules[i];
      const last = segs[segs.length - 1];
      segs[segs.length - 1] = [last[0], at, last[2]];
      segs.push([at, 12, last[2] + delta]);
    };
    if (difficulty === 'easy') {
      const at = rng.pick([4, 6, 8]);
      const delta = rng.pick([1, -1]) * multipleIn(rng, 1000, 4000, 1000);
      if (caps[0] + delta <= 0) return null;
      change(0, at, delta);
      events.push(`After ${MONTHS_TXT(at)}, ${names[0]} ${delta > 0 ? 'added' : 'withdrew'} ${rs(Math.abs(delta))}.`);
    } else if (difficulty === 'medium') {
      const a1 = rng.int(3, 6);
      const a2 = rng.int(a1 + 1, 10);
      const d1 = -multipleIn(rng, 1000, 3000, 1000);
      const d2 = multipleIn(rng, 1000, 4000, 1000);
      if (caps[0] + d1 <= 0) return null;
      change(0, a1, d1);
      change(1, a2, d2);
      events.push(`After ${MONTHS_TXT(a1)}, ${names[0]} withdrew ${rs(-d1)}, and after ${MONTHS_TXT(a2)}, ${names[1]} added ${rs(d2)}.`);
    } else if (difficulty === 'hard') {
      // Research template: one partner leaves while the other withdraws a third of the capital at the same time.
      const at = rng.int(4, 9);
      if (caps[1] % 3 !== 0) return null;
      schedules[0] = [[0, at, caps[0]]];
      change(1, at, -caps[1] / 3);
      events.push(`After ${MONTHS_TXT(at)}, ${names[0]} left the business and, at the same time, ${names[1]} withdrew one-third of the amount ${names[1]} had invested.`);
    } else {
      const a1 = rng.int(2, 5);
      const a2 = rng.int(a1 + 1, 9);
      const d1 = multipleIn(rng, 1000, 3000, 1000);
      const d2 = -multipleIn(rng, 1000, 3000, 1000);
      if (caps[2] + d2 <= 0) return null;
      change(0, a1, d1);
      change(2, a2, d2);
      schedules[1] = [[a1, 12, caps[1]]];
      events.push(`${names[1]} joined after ${MONTHS_TXT(a1)} with ${rs(caps[1])}, when ${names[0]} also added ${rs(d1)}. After ${MONTHS_TXT(a2)}, ${names[2]} withdrew ${rs(-d2)}.`);
    }
    const weights = schedules.map(weightOf);
    if (reduceParts(weights).reduce((s, x) => s + x, 0) > 400) return null;
    const profit = profitFor(rng, weights, 2000, 15000);
    if (!profit) return null;
    const ask = difficulty === 'hard' ? 1 : rng.int(0, n - 1);
    const ans = shareOf(weights, profit, ask);
    const naive = shareOf(caps.map((c) => c * 12), profit, ask);
    const finalOnly = shareOf(schedules.map((s) => s[s.length - 1][2] * 12), profit, ask);
    const startText =
      difficulty === 'extreme'
        ? `${names[0]} and ${names[2]} started a business with ${rs(caps[0])} and ${rs(caps[2])} respectively.`
        : `${names[0]} and ${names[1]} started a business with ${rs(caps[0])} and ${rs(caps[1])} respectively.`;
    return emit(ctx, {
      facts: { form: 'shares', schedules, period: 12, profit, ask },
      prompt: `${startText} ${events.join(' ')} If the profit at the end of the year was ${rs(profit)}, what is ${names[ask]}'s share?`,
      answer: ans,
      format: rs,
      mistakes: [
        { value: naive, why: 'ignored the capital changes', trap: `${rs(Math.round(naive))} uses the opening capitals for the whole year. The year splits into periods at each change; multiply each capital by its own months.` },
        { value: finalOnly, why: 'used only the final capitals' },
        { value: profit - ans, why: "gave the other partners' combined share" },
        { value: shareOf(caps, profit, ask), why: 'split by opening capital, ignoring time' },
      ],
      steps: [
        ...schedules.map((segs, i) => `${names[i]}: ${segs.map(([a, b, c]) => `${c} × ${b - a}`).join(' + ')} = ${weights[i]}.`),
        `Ratio = ${ratioText(weights)}.`,
        `${names[ask]}'s share = ${rs(profit)} × ${reduceParts(weights)[ask]}/${reduceParts(weights).reduce((s, x) => s + x, 0)} = ${rs(ans)}.`,
      ],
      shortcut: `Split the year at every change and add capital × months for each period.`,
      trap: `A withdrawal or addition splits the year into periods with different capitals.`,
      tags: ['partnership:capital-change'],
    });
  });
}

/* ------------------------------------------------------------------ */
/* 4. Working partner                                                   */
/* ------------------------------------------------------------------ */

function working(ctx: Ctx, byCapital: boolean, joinMid: boolean): Res {
  const { rng } = ctx;
  return attempt('working', 400, () => {
    const pct = rng.pick([10, 12.5, 15, 20, 25]);
    const caps = byCapital ? [cap(rng), cap(rng)] : [5000, 5000];
    const join = joinMid ? rng.int(3, 8) : 0;
    const schedules: Seg[][] = [[[0, 12, caps[0]]], [[join, 12, caps[1]]]];
    const weights = schedules.map(weightOf);
    const parts = reduceParts(weights);
    const total = parts[0] + parts[1];
    const keep = (100 - pct) / 100;
    const unit = Math.max(100, total * 200);
    if (unit > 40000) return null;
    const profit = multipleIn(rng, 4000, 40000, unit);
    const rest = profit * keep;
    const shareA = (rest * parts[0]) / total;
    const commission = (profit * pct) / 100;
    if (![rest, shareA, commission].every((v) => Math.abs(v - Math.round(v)) < 1e-9)) return null;
    const names = pickPeople(rng, 2).map((p) => p.name);
    const ask = rng.chance(0.6) ? 'working-total' : 'other-share';
    const ans = ask === 'working-total' ? commission + shareA : rest - shareA;
    const split = byCapital ? (joinMid ? `in the ratio of their capital × time` : `in the ratio of their capitals`) : 'equally';
    return emit(ctx, {
      facts: { form: 'working', pct, salary: 0, schedules, profit, ask },
      prompt: `${names[0]} and ${names[1]} are partners${byCapital ? `: ${names[0]} invested ${rs(caps[0])} and ${names[1]} invested ${rs(caps[1])}${joinMid ? ` after ${MONTHS_TXT(join)}` : ''}` : ''}. ${names[0]}, the working partner, receives ${pct}% of the profit for managing the business, and the remaining profit is divided ${split}. If the total profit is ${rs(profit)}, what ${ask === 'working-total' ? `is ${names[0]}'s total income from the business` : `is ${names[1]}'s share`}?`,
      answer: ans,
      format: rs,
      mistakes:
        ask === 'working-total'
          ? [
              { value: shareA, why: 'forgot the commission', trap: `${rs(shareA)} is only ${names[0]}'s share of the remaining profit; add the ${pct}% commission (${rs(commission)}).` },
              { value: commission + (profit * parts[0]) / total, why: 'split the whole profit instead of the remainder' },
              { value: commission, why: 'gave only the commission' },
              { value: (profit * parts[0]) / total, why: 'ignored the commission rule' },
            ]
          : [
              { value: (profit * parts[1]) / total, why: 'split the whole profit, ignoring the commission', trap: `${rs(Math.round((profit * parts[1]) / total))} splits all of ${rs(profit)}. First take out ${names[0]}'s ${pct}% (${rs(commission)}); only ${rs(rest)} is shared.` },
              { value: shareA, why: "gave the working partner's share of the remainder" },
              { value: rest / 2, why: 'split the remainder equally' },
              { value: commission + shareA, why: "gave the working partner's total" },
            ],
      steps: [
        `Commission = ${pct}% of ${rs(profit)} = ${rs(commission)}.`,
        `Remaining = ${rs(rest)}, split ${parts.join(' : ')}${byCapital ? ` (${joinMid ? `${caps[0]} × 12 : ${caps[1]} × ${12 - join}` : `${caps[0]} : ${caps[1]}`})` : ''}.`,
        `${names[0]} gets ${rs(shareA)} from the split; ${names[1]} gets ${rs(rest - shareA)}.`,
        ask === 'working-total' ? `${names[0]}'s total = ${rs(commission)} + ${rs(shareA)} = ${rs(ans)}.` : `${names[1]}'s share = ${rs(ans)}.`,
      ],
      shortcut: `Take the working partner's cut off the top, then split what is left.`,
      trap: `The commission comes out first; only the remainder is shared by capital.`,
      tags: ['partnership:working-partner'],
    });
  });
}

function workingGap(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('working-gap', 400, () => {
    const pct = rng.pick([10, 15, 20, 25]);
    const [ca, cb] = rng.pick([[3, 2], [2, 3], [4, 3], [3, 4], [5, 3], [1, 1], [4, 5]] as [number, number][]);
    const capA = ca * 2000;
    const capB = cb * 2000;
    const profit = multipleIn(rng, 5000, 60000, 100 * (ca + cb));
    const rest = (profit * (100 - pct)) / 100;
    const a = (profit * pct) / 100 + (rest * ca) / (ca + cb);
    const b = (rest * cb) / (ca + cb);
    const gap = a - b;
    if (![rest, a, b].every((v) => Math.abs(v - Math.round(v)) < 1e-9) || gap <= 0) return null;
    const names = pickPeople(rng, 2).map((p) => p.name);
    const noComm = ca !== cb ? (gap * (ca + cb)) / (ca - cb) : -1;
    return emit(ctx, {
      facts: { form: 'working-gap', pct, capA, capB, gap },
      prompt: `${names[0]} and ${names[1]} invested ${rs(capA)} and ${rs(capB)} in a business. ${names[0]} manages it and takes ${pct}% of the profit as a management fee; the rest is shared in the ratio of their capitals. If ${names[0]} receives ${rs(gap)} more than ${names[1]} in all, what is the total profit?`,
      answer: profit,
      format: rs,
      mistakes: [
        ...(noComm > 0 ? [{ value: noComm, why: 'ignored the management fee', trap: `That value treats the gap as coming from capitals only. ${names[0]}'s ${pct}% fee is part of the ${rs(gap)} difference.` }] : []),
        { value: (gap * 100) / pct, why: 'took the whole gap as the fee' },
        { value: rest, why: 'gave the shared remainder' },
        { value: a, why: `gave ${names[0]}'s total` },
      ].filter((m) => m.value > 0),
      steps: [
        `Let the profit be P. Fee = ${pct}% of P; remainder ${100 - pct}% of P split ${ca} : ${cb}.`,
        `${names[0]} = ${pct}%P + ${ca}/${ca + cb} × ${100 - pct}%P; ${names[1]} = ${cb}/${ca + cb} × ${100 - pct}%P.`,
        `Gap = P × (${pct}/100 + ${ca - cb}/${ca + cb} × ${(100 - pct) / 100}) = ${rs(gap)} ⇒ P = ${rs(profit)}.`,
      ],
      shortcut: `Express both totals as fractions of P; the gap fixes P. Check options quickly.`,
      trap: `The fee is part of the working partner's lead over the other partner.`,
      tags: ['partnership:working-partner', 'level:multi-step'],
    });
  });
}

function workingPartner(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return working(ctx, false, false);
  if (difficulty === 'medium') return working(ctx, true, false);
  if (difficulty === 'hard') return workingGap(ctx);
  return working(ctx, true, true);
}

/* ------------------------------------------------------------------ */
/* 5. Capital / time from the share                                     */
/* ------------------------------------------------------------------ */

function findCapital(ctx: Ctx, differentTime: boolean): Res {
  const { rng } = ctx;
  return attempt('find-capital', 400, () => {
    const capA = cap(rng);
    const capB = cap(rng);
    const monthsA = 12;
    const monthsB = differentTime ? rng.int(4, 10) : 12;
    const weights = [capA * monthsA, capB * monthsB];
    const profit = profitFor(rng, weights);
    if (!profit || capA === capB) return null;
    const shareB = shareOf(weights, profit, 1);
    const names = pickPeople(rng, 2).map((p) => p.name);
    const ignoreTime = (capA * shareB) / (profit - shareB);
    return emit(ctx, {
      facts: { form: 'find-capital', capA, monthsA, monthsB, profit, shareB },
      prompt: differentTime
        ? `${names[0]} started a business with ${rs(capA)}. After ${MONTHS_TXT(12 - monthsB)}, ${names[1]} joined with some capital. Out of a year-end profit of ${rs(profit)}, ${names[1]}'s share was ${rs(shareB)}. How much did ${names[1]} invest?`
        : `${names[0]} and ${names[1]} started a business together; ${names[0]} invested ${rs(capA)}. Out of a year-end profit of ${rs(profit)}, ${names[1]} received ${rs(shareB)}. How much did ${names[1]} invest?`,
      answer: capB,
      format: rs,
      mistakes: [
        ...(differentTime ? [{ value: ignoreTime, why: 'ignored the late joining', trap: `${rs(Math.round(ignoreTime))} assumes both invested for the full year. ${names[1]}'s money worked for only ${monthsB} months, so it must be larger to earn that share.` }] : []),
        { value: (capA * (profit - shareB)) / shareB, why: 'reversed the ratio of shares' },
        { value: shareB, why: 'gave the share as the capital' },
        { value: differentTime ? (capA * shareB * 12) / ((profit - shareB) * (12 - monthsB)) : capA + shareB, why: differentTime ? 'used the joining month as the months invested' : 'added the share to the capital' },
      ].filter((m) => m.value > 0),
      steps: [
        `${names[0]}'s share = ${rs(profit)} − ${rs(shareB)} = ${rs(profit - shareB)}.`,
        `${capA} × ${monthsA} : x × ${monthsB} = ${profit - shareB} : ${shareB}.`,
        `x = ${capA} × ${monthsA} × ${shareB} ÷ (${profit - shareB} × ${monthsB}) = ${rs(capB)}.`,
      ],
      shortcut: `Share ratio = (capital × months) ratio; solve for the unknown capital.`,
      trap: differentTime ? `${names[1]} invested for 12 − ${12 - monthsB} = ${monthsB} months.` : `Keep the order: ${names[0]} : ${names[1]} shares = ${names[0]} : ${names[1]} capitals.`,
      tags: ['partnership:find-capital'],
    });
  });
}

function ratioFromProfit(ctx: Ctx, find: 'capital' | 'time'): Res {
  const { rng } = ctx;
  return attempt('ratio-from-profit', 400, () => {
    const caps = reduceParts([rng.int(1, 9), rng.int(1, 9)]);
    const times = reduceParts([rng.int(1, 9), rng.int(1, 9)]);
    if (caps[0] === caps[1] || times[0] === times[1]) return null;
    const profit = reduceParts([caps[0] * times[0], caps[1] * times[1]]);
    if (profit.some((x) => x > 40) || (profit[0] === caps[0] && profit[1] === caps[1])) return null;
    const given = find === 'capital' ? times : caps;
    const answer = find === 'capital' ? caps : times;
    const names = pickPeople(rng, 2).map((p) => p.name);
    const mistakes: RatioMistake[] = [
      { parts: [answer[1], answer[0]], why: 'reversed the ratio', trap: `${answer[1]} : ${answer[0]} is ${names[1]} : ${names[0]}; keep the order asked.` },
      { parts: [profit[0] * given[0], profit[1] * given[1]], why: 'multiplied by the known ratio instead of dividing', trap: `Profit = capital × time, so the unknown ratio = profit ratio ÷ known ratio (term by term), not ×.` },
      { parts: [profit[0], profit[1]], why: 'took the profit ratio as the answer' },
    ];
    return emitRatio(ctx, {
      facts: { form: 'ratio-from-profit', profit, other: given, find },
      prompt:
        find === 'capital'
          ? `${names[0]} and ${names[1]} invested in a business for periods in the ratio ${times.join(' : ')}. If their profits were in the ratio ${profit.join(' : ')}, what was the ratio of their capitals?`
          : `${names[0]} and ${names[1]} invested capitals in the ratio ${caps.join(' : ')}. If their profits were in the ratio ${profit.join(' : ')}, what was the ratio of the periods of their investments?`,
      answer,
      mistakes,
      steps: [
        `Profit ratio = (capital × time) ratio.`,
        `${find === 'capital' ? 'Capital' : 'Time'} ratio = ${profit[0]}/${given[0]} : ${profit[1]}/${given[1]}.`,
        `= ${reduceParts([profit[0] * given[1], profit[1] * given[0]]).join(' : ')}.`,
      ],
      shortcut: `Divide term by term: (${profit[0]} ÷ ${given[0]}) : (${profit[1]} ÷ ${given[1]}), then clear fractions.`,
      trap: `Division, not multiplication, recovers the unknown factor.`,
      tags: ['partnership:find-ratio'],
    });
  });
}

function capitalFromShare(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return findCapital(ctx, false);
  if (difficulty === 'medium') return findCapital(ctx, true);
  if (difficulty === 'hard') return ratioFromProfit(ctx, 'capital');
  return ratioFromProfit(ctx, 'time');
}

/* ------------------------------------------------------------------ */

const BUILDERS: Record<string, (ctx: Ctx) => Res> = {
  'time-weighted': timeWeighted,
  'join-withdraw': joinWithdraw,
  'capital-change': capitalChange,
  'working-partner': workingPartner,
  'capital-from-share': capitalFromShare,
};

export const generator = defineGenerator<PartnershipFacts>(META, SUBTYPES, (ctx) => {
  const build = BUILDERS[ctx.subtype.id];
  if (!build) throw new Error(`quant.partnership: no builder for ${ctx.subtype.id}`);
  return build(ctx);
});
