/**
 * Ratio & proportion (SPEC 8.1 Q5). Built backward from a clean multiplier k. Ratio answers are shown as
 * "a : b" with the reversed ratio always among the distractors (research: it appears in every paper).
 */
import { defineGenerator, type BuildContext, type GenResult, type SubtypeDef } from '../types';
import {
  attempt,
  emit,
  emitRatio,
  fr,
  gcd,
  indian,
  lcmAll,
  listAnd,
  multipleIn,
  pickPeople,
  reduceParts,
  rs,
  texFr,
  type Mist,
  type RatioMistake,
} from './ratio-proportion/kit';

const META = { name: 'quant.ratio-proportion', version: 1, subject: 'quant', chapter: 'ratio-proportion' } as const;

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'divide-amount', label: 'Dividing an amount in a ratio', weight: 2 },
  { id: 'add-remove', label: 'Ratio change after adding / removing', weight: 2 },
  { id: 'coins', label: 'Coins in a bag', weight: 1 },
  { id: 'income-expenditure', label: 'Income & expenditure ratios', weight: 1.5 },
  { id: 'proportional', label: 'Mean, third & fourth proportional', weight: 1 },
  { id: 'compound-ratio', label: 'Combining & compounding ratios', weight: 1 },
  { id: 'variation', label: 'Direct & inverse variation', weight: 0.75 },
];

export type RatioFacts =
  /** Total divided in the ratio `parts`; asked: share of person `ask` (index). */
  | { form: 'split'; total: number; parts: number[]; ask: number }
  /** Total divided so that m0·A = m1·B = m2·C; asked: share `ask`. */
  | { form: 'split-equal-multiples'; total: number; mults: number[]; ask: number }
  /** Total divided so that after removing `less[i]` from each share the remainders are in ratio `parts`; asked: share `ask`. */
  | { form: 'split-offset'; total: number; less: number[]; parts: number[]; ask: number }
  /** A = fa·(B + C), B = fb·(A + C) (fractions); C − B = diff (sign-aware); asked: total. */
  | { form: 'split-fraction'; fa: [number, number]; fb: [number, number]; diff: number }
  /** Numbers in ratio a:b; add `add` to each → p:q; asked: the larger number. */
  | { form: 'add-each'; a: number; b: number; add: number; p: number; q: number }
  /** A:B = a:b; `t` taken from A and given to B → p:q; asked: A. */
  | { form: 'transfer'; a: number; b: number; t: number; p: number; q: number }
  /** Boys:girls a:b; `out` boys leave and `in` girls join → p:q; asked: original strength. */
  | { form: 'class-change'; a: number; b: number; out: number; join: number; p: number; q: number }
  /** Numbers a:b; subtract `sub` from each → c:d; asked: number to add to each for e:f. */
  | { form: 'two-shifts'; a: number; b: number; sub: number; c: number; d: number; e: number; f: number }
  /** Coins (paise denominations) in count ratio; total value (₹); asked: count of coin `ask`. */
  | { form: 'coin-count'; denoms: number[]; counts: number[]; value: number; ask: number }
  /** Coins with VALUE ratio; total value; asked: count of coin `ask`. */
  | { form: 'coin-value'; denoms: number[]; values: number[]; value: number; ask: number }
  /** Count chain: n1 = r1·n0, n2 = r2·n1; total value; asked: count of coin 2. */
  | { form: 'coin-chain'; denoms: number[]; r1: number; r2: number; value: number }
  /** Count ratio; the ₹1 coins are worth ₹diff more than the 25p coins; asked: total value (₹). */
  | { form: 'coin-diff'; denoms: number[]; counts: number[]; diff: number }
  /** Incomes a:b, expenditures c:d, savings sA, sB; asked: `ask`. */
  | { form: 'inc-exp'; a: number; b: number; c: number; d: number; sA: number; sB: number; ask: 'incA' | 'incB' | 'expB' }
  /** A's income is x% more than B's; expenditures c:d; each saves s; asked: B's income. */
  | { form: 'inc-pct'; x: number; c: number; d: number; s: number }
  /** Incomes a:b; expenditures c:d; A saves pct% of income; B saves sB; asked: A's income. */
  | { form: 'inc-save-pct'; a: number; b: number; c: number; d: number; pct: number; sB: number }
  /** Proportionals. kind: fourth(a,b,c) | third(a,b) | mean(a,b). */
  | { form: 'proportional'; kind: 'fourth' | 'third' | 'mean'; nums: number[] }
  /** Sum of the third proportional to (a,b) and the mean proportional between (c,d). */
  | { form: 'prop-sum'; third: number[]; mean: number[] }
  /** Number to add to each of four numbers to make them proportional. */
  | { form: 'prop-add'; nums: number[] }
  /** Chained ratios: pairs [A:B, B:C, …]; asked: 'first-last' or 'all'. */
  | { form: 'chain'; pairs: [number, number][]; ask: 'first-last' | 'all' }
  /** m0·A = m1·B, m2·B = m3·C; asked: A:B:C. */
  | { form: 'equal-products'; m: number[] }
  /** Compounded ratio of duplicate(p), sub-duplicate(q), inverse(r). */
  | { form: 'compounded'; dup: [number, number]; subdup: [number, number]; inv: [number, number] }
  /** y ∝ x^power (power −1 = inverse, 0.5 = square root); y1 at x1; asked: y at x2. */
  | { form: 'vary'; power: number; x1: number; y1: number; x2: number }
  /** x ∝ y²/z: x1 at (y1, z1); asked: x at (y2, z2). */
  | { form: 'joint'; x1: number; y1: number; z1: number; y2: number; z2: number }
  /** Cost = fixed + rate × n. Given (n1, c1), (n2, c2); asked: cost at n3. */
  | { form: 'fixed-variable'; n1: number; c1: number; n2: number; c2: number; n3: number };

type Ctx = BuildContext;
type Res = GenResult<RatioFacts>;

const num = (v: number): string => indian(v);
const ratioStr = (p: readonly number[]): string => reduceParts(p).join(' : ');
const whole = (v: number): boolean => Math.abs(v - Math.round(v)) < 1e-9;
const small = (p: readonly number[], max = 20): boolean => reduceParts(p).every((x) => x <= max);
const LETTERS = ['A', 'B', 'C', 'D'];

/* ------------------------------------------------------------------ */
/* 1. Dividing an amount                                               */
/* ------------------------------------------------------------------ */

const PART_SETS: number[][] = [[2, 3], [3, 5], [4, 7], [5, 8], [2, 3, 5], [3, 4, 5], [1, 2, 4], [2, 5, 7], [3, 5, 7], [4, 5, 6], [5, 6, 9]];

function split(ctx: Ctx): Res {
  const { rng } = ctx;
  const parts = rng.pick(PART_SETS);
  const sum = parts.reduce((s, x) => s + x, 0);
  const k = multipleIn(rng, 100, 3000, 10);
  const total = k * sum;
  const ask = rng.int(0, parts.length - 1);
  const people = pickPeople(rng, parts.length);
  const names = people.map((p) => p.name);
  const share = k * parts[ask];
  const other = (ask + 1) % parts.length;
  return emit(ctx, {
    facts: { form: 'split', total, parts, ask },
    prompt: `${rs(total)} is divided among ${listAnd(names)} in the ratio ${parts.join(' : ')}. What is ${names[ask]}'s share?`,
    answer: share,
    format: rs,
    mistakes: [
      { value: k * parts[other], why: `gave ${names[other]}'s share`, trap: `${rs(k * parts[other])} is ${names[other]}'s share (${parts[other]} parts); ${names[ask]} gets ${parts[ask]} parts.` },
      { value: total / parts.length, why: 'divided equally' },
      { value: (total * parts[ask]) / (sum - parts[ask]), why: 'divided by the other parts instead of all parts' },
      { value: total - share, why: 'gave the rest of the amount' },
    ],
    steps: [`Total parts = ${parts.join(' + ')} = ${sum}.`, `1 part = ${rs(total)} ÷ ${sum} = ${rs(k)}.`, `${names[ask]}'s share = ${parts[ask]} × ${rs(k)} = ${rs(share)}.`],
    shortcut: `Share = total × ${parts[ask]}/${sum}.`,
    trap: `Divide by the sum of all the ratio terms, then multiply by ${names[ask]}'s term.`,
    tags: ['ratio:divide', 'trick:unit-part'],
  });
}

const MULT_SETS: number[][] = [[2, 3, 4], [3, 4, 6], [2, 3, 6], [4, 5, 10], [3, 5, 6], [2, 5, 10], [3, 4, 12], [2, 4, 5]];

function splitEqualMultiples(ctx: Ctx): Res {
  const { rng } = ctx;
  const mults = rng.pick(MULT_SETS);
  const L = lcmAll(mults);
  const parts = mults.map((m) => L / m);
  const sum = parts.reduce((s, x) => s + x, 0);
  const k = multipleIn(rng, 50, 1500, 10);
  const total = k * sum;
  const ask = rng.int(0, 2);
  const names = pickPeople(rng, 3).map((p) => p.name);
  const share = k * parts[ask];
  const msum = mults.reduce((s, x) => s + x, 0);
  const wrong = (total * mults[ask]) / msum;
  return emit(ctx, {
    facts: { form: 'split-equal-multiples', total, mults, ask },
    prompt: `${rs(total)} is divided among ${listAnd(names)} such that ${mults.map((m, i) => `${m} times ${names[i]}'s share`).join(' = ')}. What is ${names[ask]}'s share?`,
    answer: share,
    format: rs,
    mistakes: [
      { value: wrong, why: 'used the multipliers themselves as the ratio', trap: `${rs(Math.round(wrong))} splits in the ratio ${mults.join(' : ')}. If ${mults[0]}A = ${mults[1]}B = ${mults[2]}C, the shares are in the ratio $\\frac{1}{${mults[0]}}$ : $\\frac{1}{${mults[1]}}$ : $\\frac{1}{${mults[2]}}$ = ${parts.join(' : ')} — the biggest multiplier gets the smallest share.` },
      { value: k * parts[(ask + 1) % 3], why: 'gave another person\'s share' },
      { value: total / 3, why: 'divided equally' },
      { value: (total * mults[(ask + 2) % 3]) / msum, why: 'used the multipliers as the ratio (another person)' },
    ],
    steps: [
      `Let ${mults[0]}A = ${mults[1]}B = ${mults[2]}C = ${L}t (LCM of ${mults.join(', ')}).`,
      `Then A : B : C = ${parts.join(' : ')}; total parts = ${sum}.`,
      `1 part = ${rs(total)} ÷ ${sum} = ${rs(k)}; ${names[ask]} = ${parts[ask]} × ${rs(k)} = ${rs(share)}.`,
    ],
    shortcut: `Equal products ⇒ shares in the ratio of reciprocals: divide the LCM ${L} by each multiplier.`,
    trap: `The shares are inversely proportional to the multipliers.`,
    tags: ['ratio:divide', 'ratio:reciprocal'],
  });
}

function splitOffset(ctx: Ctx): Res {
  const { rng } = ctx;
  const parts = rng.pick([[2, 3, 4], [3, 4, 5], [1, 2, 3], [4, 5, 6], [2, 3, 5]]);
  const less = rng.pick([[5, 10, 15], [10, 20, 30], [20, 30, 40], [15, 25, 35], [50, 40, 30], [30, 20, 10]]);
  const k = multipleIn(rng, 20, 300, 5);
  const shares = parts.map((p, i) => p * k + less[i]);
  const total = shares.reduce((s, x) => s + x, 0);
  const ask = rng.int(0, 2);
  const names = pickPeople(rng, 3).map((p) => p.name);
  const lsum = less.reduce((s, x) => s + x, 0);
  const psum = parts.reduce((s, x) => s + x, 0);
  const naive = (total * parts[ask]) / psum;
  return emit(ctx, {
    facts: { form: 'split-offset', total, less, parts, ask },
    prompt: `${rs(total)} is divided among ${listAnd(names)} in such a way that if their shares are reduced by ${listAnd(less.map((l) => rs(l)))} respectively, the remaining amounts are in the ratio ${parts.join(' : ')}. What is ${names[ask]}'s share?`,
    answer: shares[ask],
    format: rs,
    mistakes: [
      { value: naive, why: 'ignored the reductions', trap: `${rs(Math.round(naive))} splits ${rs(total)} directly in the ratio ${parts.join(' : ')}. Only the amounts left after the reductions are in that ratio.` },
      { value: parts[ask] * k, why: 'gave the reduced amount (forgot to add back)' },
      { value: ((total + lsum) * parts[ask]) / psum + less[ask], why: 'added the reductions to the total instead of subtracting' },
      { value: shares[(ask + 1) % 3], why: "gave another person's share" },
    ],
    steps: [
      `Total after reductions = ${rs(total)} − (${less.join(' + ')}) = ${rs(total - lsum)}.`,
      `This is split ${parts.join(' : ')}: 1 part = ${rs(total - lsum)} ÷ ${psum} = ${rs(k)}.`,
      `${names[ask]}'s share = ${parts[ask]} × ${rs(k)} + ${rs(less[ask])} = ${rs(shares[ask])}.`,
    ],
    shortcut: `Remove the offsets first, split, then add ${names[ask]}'s offset back.`,
    trap: `The ratio applies to what is left after the reductions, not to the full amounts.`,
    tags: ['ratio:divide', 'ratio:offset'],
  });
}

function splitFraction(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('split-fraction', 200, () => {
    const fa = rng.pick([[1, 2], [2, 3], [1, 3], [1, 4], [3, 7], [2, 5]] as const);
    const fb = rng.pick([[1, 2], [1, 3], [1, 4], [2, 3], [1, 5], [2, 7]] as const);
    // A = fa/(1+fa) of T, B = fb/(1+fb) of T.
    const aShare = fr(fa[0], fa[0] + fa[1]);
    const bShare = fr(fb[0], fb[0] + fb[1]);
    const L = lcmAll([aShare[1], bShare[1]]);
    const A = (aShare[0] * L) / aShare[1];
    const B = (bShare[0] * L) / bShare[1];
    const C = L - A - B;
    if (C <= 0 || C === B || A === B || A === C) return null;
    const unit = multipleIn(rng, 20, 400, 10);
    const T = L * unit;
    const diff = Math.abs(C - B) * unit;
    const names = pickPeople(rng, 3).map((p) => p.name);
    const cMore = C > B;
    const naiveA = fr(fa[0], fa[1]);
    const naiveB = fr(fb[0], fb[1]);
    const naiveC = 1 - naiveA[0] / naiveA[1] - naiveB[0] / naiveB[1];
    const naiveT = naiveC > 0 && Math.abs(naiveC - naiveB[0] / naiveB[1]) > 1e-9 ? diff / Math.abs(naiveC - naiveB[0] / naiveB[1]) : -1;
    return emit(ctx, {
      facts: { form: 'split-fraction', fa: [fa[0], fa[1]], fb: [fb[0], fb[1]], diff: cMore ? diff : -diff },
      prompt: `A sum of money is divided among ${listAnd(names)}. ${names[0]} gets ${texFr(fr(fa[0], fa[1]))} of what ${names[1]} and ${names[2]} together get, and ${names[1]} gets ${texFr(fr(fb[0], fb[1]))} of what ${names[0]} and ${names[2]} together get. If ${names[2]}'s share is ${rs(diff)} ${cMore ? 'more' : 'less'} than ${names[1]}'s, what is the total sum?`,
      answer: T,
      format: rs,
      mistakes: [
        { value: naiveT, why: 'treated the fractions as shares of the whole sum', trap: `${rs(Math.round(naiveT))} takes ${names[0]} = ${texFr(naiveA)} of the total. "${texFr(naiveA)} of the other two" means ${names[0]} : others = ${fa[0]} : ${fa[1]}, i.e. ${texFr(aShare)} of the total.` },
        { value: C * unit, why: `gave ${names[2]}'s share` },
        { value: A * unit, why: `gave ${names[0]}'s share` },
        { value: diff * L, why: 'multiplied the gap by the total parts without dividing by the gap in parts' },
      ],
      steps: [
        `${names[0]} : (others) = ${fa[0]} : ${fa[1]} ⇒ ${names[0]} = ${texFr(aShare)} of the total.`,
        `${names[1]} : (others) = ${fb[0]} : ${fb[1]} ⇒ ${names[1]} = ${texFr(bShare)} of the total.`,
        `Take total = ${L} parts: ${names[0]} = ${A}, ${names[1]} = ${B}, ${names[2]} = ${C}.`,
        `${Math.abs(C - B)} part${Math.abs(C - B) === 1 ? '' : 's'} = ${rs(diff)} ⇒ 1 part = ${rs(unit)}; total = ${L} × ${rs(unit)} = ${rs(T)}.`,
      ],
      shortcut: `"x/y of the rest" ⇒ share = x/(x + y) of the total.`,
      trap: `A fraction of "the other two together" is not the same fraction of the whole.`,
      tags: ['ratio:divide', 'level:multi-step'],
    });
  });
}

function divideAmount(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return split(ctx);
  if (difficulty === 'medium') return splitEqualMultiples(ctx);
  if (difficulty === 'hard') return splitOffset(ctx);
  return splitFraction(ctx);
}

/* ------------------------------------------------------------------ */
/* 2. Ratio change after adding / removing                             */
/* ------------------------------------------------------------------ */

const BASE_RATIOS: [number, number][] = [[2, 3], [3, 4], [3, 5], [4, 5], [5, 7], [4, 7], [5, 8], [7, 9], [2, 5], [3, 7], [5, 6], [7, 11]];

function addEach(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('add-each', 300, () => {
    const [a, b] = rng.pick(BASE_RATIOS);
    const k = rng.int(3, 25);
    const add = rng.int(3, 30);
    const [p, q] = reduceParts([a * k + add, b * k + add]);
    if (!small([p, q], 16) || (p === a && q === b)) return null;
    const larger = b * k;
    if (larger > 400) return null;
    return emit(ctx, {
      facts: { form: 'add-each', a, b, add, p, q },
      prompt: `Two numbers are in the ratio ${a} : ${b}. If ${add} is added to each of them, the ratio becomes ${p} : ${q}. What is the larger number?`,
      answer: larger,
      format: num,
      mistakes: [
        { value: a * k, why: 'gave the smaller number', trap: `${a * k} is the smaller number (${a} parts); the larger is ${b} parts.` },
        { value: b * k + add, why: 'gave the larger number after adding' },
        { value: (a + b) * k, why: 'gave the sum' },
        { value: k, why: 'gave the value of one part' },
      ],
      steps: [
        `Let the numbers be ${a}k and ${b}k.`,
        `(${a}k + ${add}) : (${b}k + ${add}) = ${p} : ${q} ⇒ ${q}(${a}k + ${add}) = ${p}(${b}k + ${add}).`,
        `${q * a}k + ${q * add} = ${p * b}k + ${p * add} ⇒ ${Math.abs(p * b - q * a)}k = ${Math.abs(q * add - p * add)} ⇒ k = ${k}.`,
        `Larger number = ${b} × ${k} = ${larger}.`,
      ],
      shortcut: `Check the options: only ${larger} and its partner ${a * k} give ${p} : ${q} after adding ${add}.`,
      trap: `The same number is added to both terms, so the ratio changes — solve for k before multiplying.`,
      tags: ['ratio:add-remove', 'trick:cross-multiplication'],
    });
  });
}

function transfer(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('transfer', 300, () => {
    const [a, b] = rng.pick([[5, 3], [7, 5], [3, 2], [4, 3], [5, 4], [9, 7], [2, 3], [3, 4], [5, 7]] as [number, number][]);
    const m = rng.int(4, 30);
    const t = rng.int(3, 40);
    const A = a * m;
    const B = b * m;
    if (A - t <= 0 || A > 400) return null;
    const [p, q] = reduceParts([A - t, B + t]);
    if (!small([p, q], 20) || (p === a && q === b)) return null;
    const [P, Q] = pickPeople(rng, 2);
    // one-sided mistake: (A − t) : B = p : q → m' = t q / (a q − b p)
    const den = a * q - b * p;
    const oneSided = den > 0 ? ((t * q) / den) * a : -1;
    return emit(ctx, {
      facts: { form: 'transfer', a, b, t, p, q },
      prompt: `The number of marbles with ${P.name} and ${Q.name} are in the ratio ${a} : ${b}. If ${P.name} gives ${t} marbles to ${Q.name}, the ratio becomes ${p} : ${q}. How many marbles did ${P.name} have at first?`,
      answer: A,
      format: num,
      mistakes: [
        { value: oneSided, why: 'applied the change to one side only', trap: `That value subtracts ${t} from ${P.name} but forgets to add it to ${Q.name}. The ${t} marbles move, so the ratio is (${a}k − ${t}) : (${b}k + ${t}).` },
        { value: A - t, why: `gave ${P.name}'s marbles after giving` },
        { value: B, why: `gave ${Q.name}'s marbles` },
        { value: A + B, why: 'gave the total' },
      ],
      steps: [
        `Let them have ${a}k and ${b}k. After the transfer: (${a}k − ${t}) : (${b}k + ${t}) = ${p} : ${q}.`,
        `${q}(${a}k − ${t}) = ${p}(${b}k + ${t}) ⇒ ${a * q - b * p}k = ${t * (p + q)}.`,
        `k = ${m}; ${P.name} had ${a} × ${m} = ${A}.`,
      ],
      shortcut: `The total ${a + b}k stays the same: after the transfer ${P.name} has ${p}/${p + q} of it.`,
      trap: `A transfer changes both terms — subtract from one and add to the other.`,
      tags: ['ratio:add-remove', 'ratio:transfer'],
    });
  });
}

function classChange(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('class-change', 300, () => {
    const [a, b] = rng.pick([[5, 4], [7, 5], [3, 2], [4, 3], [6, 5], [8, 7], [4, 5], [3, 4]] as [number, number][]);
    const m = rng.int(4, 20);
    const out = rng.int(2, 15);
    const join = rng.int(2, 15);
    const boys = a * m - out;
    const girls = b * m + join;
    if (boys <= 0) return null;
    const [p, q] = reduceParts([boys, girls]);
    if (!small([p, q], 16) || (p === a && q === b)) return null;
    const total = (a + b) * m;
    if (total > 400) return null;
    return emit(ctx, {
      facts: { form: 'class-change', a, b, out, join, p, q },
      prompt: `In a coaching class, the ratio of boys to girls is ${a} : ${b}. After ${out} boys leave and ${join} girls join, the ratio becomes ${p} : ${q}. How many students were there in the class originally?`,
      answer: total,
      format: num,
      mistakes: [
        { value: boys + girls, why: 'gave the strength after the changes', trap: `${boys + girls} is the strength after ${out} left and ${join} joined; the question asks for the original strength.` },
        { value: a * m, why: 'gave the original number of boys' },
        { value: b * m, why: 'gave the original number of girls' },
        { value: total + out + join, why: 'added both changes to the strength' },
      ],
      steps: [
        `Let boys = ${a}k and girls = ${b}k.`,
        `(${a}k − ${out}) : (${b}k + ${join}) = ${p} : ${q} ⇒ ${q}(${a}k − ${out}) = ${p}(${b}k + ${join}).`,
        `${a * q - b * p}k = ${q * out + p * join} ⇒ k = ${m}.`,
        `Original strength = ${a + b}k = ${total}.`,
      ],
      shortcut: `Set up one equation in k; the original strength is ${a + b}k.`,
      trap: `Read which figure is asked: the original strength, not the new one.`,
      tags: ['ratio:add-remove'],
    });
  });
}

function twoShifts(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('two-shifts', 400, () => {
    const [a, b] = rng.pick(BASE_RATIOS);
    const m = rng.int(4, 25);
    const sub = rng.int(2, 20);
    const add = rng.int(3, 40);
    const A = a * m;
    const B = b * m;
    if (A - sub <= 0 || B > 400) return null;
    const [c, d] = reduceParts([A - sub, B - sub]);
    const [e, f] = reduceParts([A + add, B + add]);
    if (!small([c, d], 16) || !small([e, f], 16) || (c === a && d === b) || (e === a && f === b) || (e === c && f === d)) return null;
    return emit(ctx, {
      facts: { form: 'two-shifts', a, b, sub, c, d, e, f },
      prompt: `Two numbers are in the ratio ${a} : ${b}. If ${sub} is subtracted from each, the ratio becomes ${c} : ${d}. What number must be added to each of the original numbers to make the ratio ${e} : ${f}?`,
      answer: add,
      format: num,
      mistakes: [
        { value: add + sub, why: 'added to the reduced numbers instead of the originals', trap: `${add + sub} works on the numbers after subtracting ${sub}. The question adds to the original numbers ${A} and ${B}.` },
        { value: Math.abs(add - sub), why: 'mixed up the two changes' },
        { value: m, why: 'gave the value of one part' },
        { value: A, why: 'gave the smaller original number' },
      ],
      steps: [
        `Numbers ${a}k and ${b}k: (${a}k − ${sub}) : (${b}k − ${sub}) = ${c} : ${d} ⇒ k = ${m}.`,
        `Numbers are ${A} and ${B}.`,
        `(${A} + x) : (${B} + x) = ${e} : ${f} ⇒ ${f}(${A} + x) = ${e}(${B} + x) ⇒ x = ${add}.`,
      ],
      shortcut: `The difference ${B - A} never changes: in ${e} : ${f} it is ${f - e} parts, so each part is ${(B - A) / (f - e)} and the smaller becomes ${e} × ${(B - A) / (f - e)} = ${A + add}.`,
      trap: `Adding or subtracting the same number keeps the difference fixed — use it to scale the new ratio.`,
      tags: ['ratio:add-remove', 'trick:constant-difference', 'level:multi-step'],
    });
  });
}

function addRemove(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return addEach(ctx);
  if (difficulty === 'medium') return transfer(ctx);
  if (difficulty === 'hard') return classChange(ctx);
  return twoShifts(ctx);
}

/* ------------------------------------------------------------------ */
/* 3. Coins                                                            */
/* ------------------------------------------------------------------ */

const COIN_NAME: Record<number, string> = { 1000: '₹10', 500: '₹5', 200: '₹2', 100: '₹1', 50: '50-paise', 25: '25-paise' };
const COIN_SETS: number[][] = [[100, 50, 25], [500, 200, 100], [1000, 500, 200], [200, 100, 50], [1000, 200, 100]];
const coinNames = (denoms: number[]): string => listAnd(denoms.map((d) => `${COIN_NAME[d]}`)) + ' coins';

function coinCount(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('coin-count', 200, () => {
    const denoms = rng.pick(COIN_SETS);
    const counts = rng.pick([[2, 3, 4], [3, 4, 5], [5, 6, 8], [1, 2, 3], [4, 5, 6], [2, 5, 8], [3, 5, 7]]);
    const perSet = denoms.reduce((s, d, i) => s + d * counts[i], 0); // paise per unit k
    const k = rng.int(5, 40);
    const value = (perSet * k) / 100;
    if (!whole(value)) return null;
    const ask = rng.int(0, 2);
    const ans = counts[ask] * k;
    const csum = counts.reduce((s, x) => s + x, 0);
    const valueShare = (value * counts[ask]) / csum;
    return emit(ctx, {
      facts: { form: 'coin-count', denoms, counts, value, ask },
      prompt: `A bag contains ${coinNames(denoms)} in the ratio ${counts.join(' : ')} by number. If the total value of the coins is ${rs(value)}, how many ${COIN_NAME[denoms[ask]]} coins are there?`,
      answer: ans,
      format: num,
      mistakes: [
        { value: valueShare, why: 'split the total value in the count ratio', trap: `${num(Math.round(valueShare))} treats ${counts.join(' : ')} as a ratio of values. It is a ratio of numbers of coins — convert to values first: ${denoms.map((d, i) => `${counts[i]} × ${d / 100}`).join(' : ')}.` },
        { value: (valueShare * 100) / denoms[ask], why: 'divided the value share by the coin value' },
        { value: counts[(ask + 1) % 3] * k, why: 'gave the count of another coin' },
        { value: csum * k, why: 'gave the total number of coins' },
      ],
      steps: [
        `Let the numbers be ${counts.map((c) => `${c}k`).join(', ')}.`,
        `Value = ${denoms.map((d, i) => `${counts[i]}k × ₹${d / 100}`).join(' + ')} = ₹${perSet / 100}k.`,
        `₹${perSet / 100}k = ${rs(value)} ⇒ k = ${k}.`,
        `${COIN_NAME[denoms[ask]]} coins = ${counts[ask]} × ${k} = ${ans}.`,
      ],
      shortcut: `Value of one "set" of ${counts.join(' + ')} coins = ₹${perSet / 100}; number of sets = ${rs(value)} ÷ ₹${perSet / 100} = ${k}.`,
      trap: `Number ratio ≠ value ratio — weight each count by the coin's value.`,
      tags: ['ratio:coins'],
    });
  });
}

function coinValue(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('coin-value', 200, () => {
    const denoms = rng.pick(COIN_SETS);
    const values = rng.pick([[5, 4, 3], [3, 2, 1], [4, 3, 2], [6, 5, 4], [2, 3, 5], [5, 3, 2]]);
    const ask = rng.int(0, 2);
    // value of coin i = values[i]·k rupees; count = values[i]·k·100/denom must be whole for every i.
    const kUnit = lcmAll(denoms.map((d, i) => d / gcd(d, values[i] * 100)));
    const k = kUnit * rng.int(1, Math.max(1, Math.floor(60 / kUnit)));
    const vsum = values.reduce((s, x) => s + x, 0);
    const value = vsum * k;
    const ans = (values[ask] * k * 100) / denoms[ask];
    if (!whole(ans) || ans > 1000) return null;
    const wrongCount = (() => {
      const perSet = denoms.reduce((s, d, i) => s + d * values[i], 0);
      return (values[ask] * value * 100) / perSet;
    })();
    return emit(ctx, {
      facts: { form: 'coin-value', denoms, values, value, ask },
      prompt: `A box has ${coinNames(denoms)} whose values are in the ratio ${values.join(' : ')}. If the total amount is ${rs(value)}, how many ${COIN_NAME[denoms[ask]]} coins are there?`,
      answer: ans,
      format: num,
      mistakes: [
        { value: wrongCount, why: 'treated the value ratio as a ratio of numbers', trap: `${num(Math.round(wrongCount))} treats ${values.join(' : ')} as the ratio of numbers of coins. It is the ratio of values: ${COIN_NAME[denoms[ask]]} coins are worth ${rs(values[ask] * k)}.` },
        { value: values[ask] * k, why: 'gave the value in rupees instead of the number of coins' },
        { value: (values[(ask + 1) % 3] * k * 100) / denoms[(ask + 1) % 3], why: 'gave the count of another coin' },
      ].filter((m) => m.value !== ans),
      steps: [
        `Total value ${rs(value)} split ${values.join(' : ')}: 1 part = ${rs(k)}.`,
        `Value of ${COIN_NAME[denoms[ask]]} coins = ${values[ask]} × ${rs(k)} = ${rs(values[ask] * k)}.`,
        `Number = ${rs(values[ask] * k)} ÷ ₹${denoms[ask] / 100} = ${ans}.`,
      ],
      shortcut: `Split the money first, then divide by the coin value.`,
      trap: `Here the ratio is of values, so no weighting is needed before splitting — only after.`,
      tags: ['ratio:coins'],
    });
  });
}

function coinChain(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('coin-chain', 200, () => {
    const denoms = rng.pick([[100, 50, 25], [500, 200, 100], [200, 100, 50]]);
    const r1 = rng.pick([2, 3]);
    const r2 = rng.pick([2, 3, 4]);
    const n0 = rng.int(5, 40);
    const counts = [n0, n0 * r1, n0 * r1 * r2];
    const value = counts.reduce((s, c, i) => s + c * denoms[i], 0) / 100;
    if (!whole(value)) return null;
    const naive = (value * 100) / denoms[2] / 3;
    return emit(ctx, {
      facts: { form: 'coin-chain', denoms, r1, r2, value },
      prompt: `A purse has ${coinNames(denoms)}. The number of ${COIN_NAME[denoms[1]]} coins is ${r1} times the number of ${COIN_NAME[denoms[0]]} coins, and the number of ${COIN_NAME[denoms[2]]} coins is ${r2} times the number of ${COIN_NAME[denoms[1]]} coins. If the total value is ${rs(value)}, how many ${COIN_NAME[denoms[2]]} coins are there?`,
      answer: counts[2],
      format: num,
      mistakes: [
        { value: counts[1], why: `gave the number of ${COIN_NAME[denoms[1]]} coins`, trap: `${counts[1]} is the number of ${COIN_NAME[denoms[1]]} coins; the ${COIN_NAME[denoms[2]]} coins are ${r2} times that.` },
        { value: n0 * r2, why: 'applied the second multiplier to the first coin' },
        { value: naive, why: 'split the value equally among the three types' },
        { value: counts[0] + counts[1] + counts[2], why: 'gave the total number of coins' },
      ],
      steps: [
        `Let the ${COIN_NAME[denoms[0]]} coins = n; then ${r1}n and ${r1 * r2}n.`,
        `Value = n × ₹${denoms[0] / 100} + ${r1}n × ₹${denoms[1] / 100} + ${r1 * r2}n × ₹${denoms[2] / 100} = ₹${(denoms[0] + r1 * denoms[1] + r1 * r2 * denoms[2]) / 100}n.`,
        `n = ${rs(value)} ÷ ₹${(denoms[0] + r1 * denoms[1] + r1 * r2 * denoms[2]) / 100} = ${n0}.`,
        `${COIN_NAME[denoms[2]]} coins = ${r1 * r2} × ${n0} = ${counts[2]}.`,
      ],
      shortcut: `Count ratio = 1 : ${r1} : ${r1 * r2}; one set is worth ₹${(denoms[0] + r1 * denoms[1] + r1 * r2 * denoms[2]) / 100}.`,
      trap: `The last multiplier is on the middle coin, so the chain is 1 : ${r1} : ${r1 * r2}.`,
      tags: ['ratio:coins', 'ratio:chain'],
    });
  });
}

function coinDiff(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('coin-diff', 200, () => {
    const denoms = [100, 50, 25];
    const counts = rng.pick([[3, 4, 8], [2, 3, 4], [5, 6, 8], [4, 5, 8], [3, 5, 4], [6, 5, 4]]);
    const k = rng.int(5, 40);
    const v = counts.map((c, i) => (c * k * denoms[i]) / 100);
    const diff = v[0] - v[2];
    const total = v[0] + v[1] + v[2];
    if (!(diff > 0) || !whole(total) || !whole(diff) || !whole(v[1])) return null;
    const naive = (diff / (counts[0] - counts[2])) * (counts[0] + counts[1] + counts[2]);
    return emit(ctx, {
      facts: { form: 'coin-diff', denoms, counts, diff },
      prompt: `A bag contains ₹1, 50-paise and 25-paise coins in the ratio ${counts.join(' : ')} by number. The ₹1 coins are worth ${rs(diff)} more than the 25-paise coins. What is the total value of the coins in the bag?`,
      answer: total,
      format: rs,
      mistakes: [
        { value: naive, why: 'used the count ratio as the value ratio', trap: `That value treats ${counts.join(' : ')} as values. In value terms the ratio is ${counts[0]} : ${counts[1] / 2} : ${counts[2] / 4}.` },
        { value: v[0], why: 'gave the value of the ₹1 coins' },
        { value: (counts[0] + counts[1] + counts[2]) * k, why: 'gave the number of coins' },
        { value: total - v[2], why: 'left out the 25-paise coins' },
      ].filter((m) => m.value > 0),
      steps: [
        `Values are in the ratio ${counts[0]} × 1 : ${counts[1]} × ½ : ${counts[2]} × ¼ = ${counts[0]} : ${counts[1] / 2} : ${counts[2] / 4}.`,
        `₹1 minus 25-paise = ${counts[0] - counts[2] / 4} parts = ${rs(diff)} ⇒ 1 part = ${rs(diff / (counts[0] - counts[2] / 4))}.`,
        `Total = ${counts[0] + counts[1] / 2 + counts[2] / 4} parts = ${rs(total)}.`,
      ],
      shortcut: `Convert the count ratio to a value ratio first.`,
      trap: `The ₹ gap compares values, so work with the value ratio.`,
      tags: ['ratio:coins', 'level:multi-step'],
    });
  });
}

function coins(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return coinCount(ctx);
  if (difficulty === 'medium') return coinValue(ctx);
  if (difficulty === 'hard') return coinChain(ctx);
  return coinDiff(ctx);
}

/* ------------------------------------------------------------------ */
/* 4. Income & expenditure                                             */
/* ------------------------------------------------------------------ */

function incExp(ctx: Ctx, equal: boolean): Res {
  const { rng } = ctx;
  return attempt('inc-exp', 400, () => {
    const [a, b] = rng.pick([[5, 3], [4, 3], [7, 5], [3, 2], [5, 4], [9, 7], [8, 5]] as [number, number][]);
    const [c, d] = rng.pick([[3, 2], [5, 4], [4, 3], [7, 5], [2, 1], [5, 3], [9, 7]] as [number, number][]);
    if (a * d === b * c) return null; // equal ratios make the two savings equations dependent
    let k: number;
    let m: number;
    if (equal) {
      // a k − c m = b k − d m ⇒ k(a − b) = m(c − d)
      if ((a - b) * (c - d) <= 0) return null;
      const g = gcd(a - b, c - d);
      const t = rng.int(1, 40) * 100;
      k = ((c - d) / g) * t;
      m = ((a - b) / g) * t;
    } else {
      k = rng.int(10, 80) * 100;
      m = rng.int(10, 80) * 100;
    }
    const incA = a * k;
    const incB = b * k;
    const expA = c * m;
    const expB = d * m;
    const sA = incA - expA;
    const sB = incB - expB;
    if (sA < 1000 || sB < 1000 || incA > 150000 || (!equal && sA === sB)) return null;
    if (sA > incA * 0.5 || sB > incB * 0.5) return null;
    const ask = equal ? rng.pick(['incA', 'expB'] as const) : 'incB';
    const [P, Qp] = pickPeople(rng, 2);
    const answer = ask === 'incA' ? incA : ask === 'incB' ? incB : expB;
    const saveText = equal ? `each of them saves ${rs(sA)} per month` : `${P.name} saves ${rs(sA)} and ${Qp.name} saves ${rs(sB)} per month`;
    const askText = ask === 'incA' ? `${P.name}'s monthly income` : ask === 'incB' ? `${Qp.name}'s monthly income` : `${Qp.name}'s monthly expenditure`;
    return emit(ctx, {
      facts: { form: 'inc-exp', a, b, c, d, sA, sB, ask },
      prompt: `The monthly incomes of ${P.name} and ${Qp.name} are in the ratio ${a} : ${b} and their monthly expenditures are in the ratio ${c} : ${d}. If ${saveText}, what is ${askText}?`,
      answer,
      format: rs,
      mistakes: [
        { value: ask === 'incA' ? incB : ask === 'incB' ? incA : expA, why: 'gave the other person\'s figure', trap: `That is the other person's figure — check whose ${ask === 'expB' ? 'expenditure' : 'income'} is asked.` },
        { value: ask === 'expB' ? incB : ask === 'incA' ? expA : expB, why: 'mixed up income and expenditure' },
        { value: equal ? sA * a : sB * b, why: 'multiplied the saving by the ratio term' },
        { value: incA + incB, why: 'gave the combined income' },
      ].filter((x) => x.value > 0),
      steps: [
        `Incomes ${a}k, ${b}k; expenditures ${c}m, ${d}m.`,
        `${a}k − ${c}m = ${sA} and ${b}k − ${d}m = ${sB}.`,
        `Solving: k = ${k}, m = ${m}.`,
        `${askText.charAt(0).toUpperCase() + askText.slice(1)} = ${ask === 'expB' ? `${d}m` : ask === 'incA' ? `${a}k` : `${b}k`} = ${rs(answer)}.`,
      ],
      shortcut: equal ? `Equal savings: k(${a} − ${b}) = m(${c} − ${d}) ⇒ k : m = ${(c - d) / gcd(a - b, c - d)} : ${(a - b) / gcd(a - b, c - d)}; one equation then fixes both.` : `Two linear equations in k and m — eliminate one by cross-multiplying the coefficients, or test the options.`,
      trap: `Income ratio and expenditure ratio use different multipliers (k and m).`,
      tags: ['ratio:income-expenditure', 'level:two-equations'],
    });
  });
}

function incPct(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('inc-pct', 400, () => {
    const x = rng.pick([20, 25, 40, 50, 60]);
    const [a, b] = reduceParts([100 + x, 100]);
    const [c, d] = rng.pick([[5, 4], [4, 3], [7, 5], [3, 2], [6, 5], [9, 8]] as [number, number][]);
    if ((a - b) * (c - d) <= 0) return null;
    const g = gcd(a - b, c - d);
    const t = rng.int(1, 30) * 100;
    const k = ((c - d) / g) * t;
    const m = ((a - b) / g) * t;
    const s = a * k - c * m;
    const incB = b * k;
    if (s < 1000 || incB > 150000 || s > 0.5 * incB) return null;
    const [P, Qp] = pickPeople(rng, 2);
    return emit(ctx, {
      facts: { form: 'inc-pct', x, c, d, s },
      prompt: `${P.name}'s monthly income is ${x}% more than ${Qp.name}'s. Their monthly expenditures are in the ratio ${c} : ${d}, and each of them saves ${rs(s)} a month. What is ${Qp.name}'s monthly income?`,
      answer: incB,
      format: rs,
      mistakes: [
        { value: a * k, why: "gave the other person's income", trap: `${rs(a * k)} is ${P.name}'s income (${x}% more).` },
        { value: d * m, why: "gave B's expenditure" },
        { value: (s * 100) / x, why: 'treated the saving as the income gap' },
        { value: incB + s, why: 'added the saving to the income' },
      ],
      steps: [
        `Incomes ${P.name} : ${Qp.name} = ${100 + x} : 100 = ${a} : ${b}; let them be ${a}k and ${b}k.`,
        `Expenditures ${c}m and ${d}m; equal savings ⇒ ${a}k − ${c}m = ${b}k − ${d}m ⇒ k(${a - b}) = m(${c - d}).`,
        `So k = ${k}, m = ${m}; ${Qp.name}'s income = ${b}k = ${rs(incB)}.`,
      ],
      shortcut: `Turn "${x}% more" into the ratio ${a} : ${b} first.`,
      trap: `Convert the percentage into a ratio; then the savings equation fixes k.`,
      tags: ['ratio:income-expenditure', 'percent:to-ratio'],
    });
  });
}

function incSavePct(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('inc-save-pct', 400, () => {
    const [a, b] = rng.pick([[5, 4], [4, 3], [3, 2], [5, 3], [7, 5]] as [number, number][]);
    const [c, d] = rng.pick([[4, 3], [3, 2], [5, 4], [2, 1], [7, 5]] as [number, number][]);
    const pct = rng.pick([10, 15, 20, 25, 30]);
    const k = rng.int(20, 200) * 100;
    const incA = a * k;
    const expA = (incA * (100 - pct)) / 100;
    const expB = (expA * d) / c;
    const sB = b * k - expB;
    if (!whole(expB) || sB < 500 || sB > b * k * 0.5) return null;
    const [P, Qp] = pickPeople(rng, 2);
    return emit(ctx, {
      facts: { form: 'inc-save-pct', a, b, c, d, pct, sB },
      prompt: `The monthly incomes of ${P.name} and ${Qp.name} are in the ratio ${a} : ${b}, and their monthly expenditures are in the ratio ${c} : ${d}. ${P.name} saves ${pct}% of ${P.g === 'm' ? 'his' : 'her'} income and ${Qp.name} saves ${rs(sB)} a month. What is ${P.name}'s monthly income?`,
      answer: incA,
      format: rs,
      mistakes: [
        { value: b * k, why: "gave B's income", trap: `${rs(b * k)} is ${Qp.name}'s income.` },
        { value: expA, why: "gave A's expenditure" },
        { value: (sB * a) / b, why: "scaled B's saving by the income ratio" },
        { value: (sB * 100) / pct, why: `treated ${Qp.name}'s saving as ${pct}% of the income` },
      ],
      steps: [
        `Let incomes be ${a}k and ${b}k. ${P.name}'s expenditure = ${100 - pct}% of ${a}k = ${(a * (100 - pct)) / 100}k.`,
        `${Qp.name}'s expenditure = ${d}/${c} × ${(a * (100 - pct)) / 100}k = ${Number(((a * (100 - pct) * d) / (100 * c)).toFixed(4))}k.`,
        `${Qp.name}'s saving = ${b}k − ${Number(((a * (100 - pct) * d) / (100 * c)).toFixed(4))}k = ${rs(sB)} ⇒ k = ${rs(k)}.`,
        `${P.name}'s income = ${a}k = ${rs(incA)}.`,
      ],
      shortcut: `Express everything in k: ${P.name}'s spending fixes ${Qp.name}'s through the ratio ${c} : ${d}.`,
      trap: `The ${pct}% applies to ${P.name} only; ${Qp.name}'s saving comes from the ratios.`,
      tags: ['ratio:income-expenditure', 'level:multi-step'],
    });
  });
}

function incomeExpenditure(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return incExp(ctx, true);
  if (difficulty === 'medium') return incExp(ctx, false);
  if (difficulty === 'hard') return incPct(ctx);
  return incSavePct(ctx);
}

/* ------------------------------------------------------------------ */
/* 5. Proportionals                                                     */
/* ------------------------------------------------------------------ */

function makeProportional(rng: Ctx['rng'], kind: 'fourth' | 'third' | 'mean', big: boolean): { nums: number[]; ans: number } | null {
  const hi = big ? 60 : 25;
  if (kind === 'fourth') {
    const a = rng.int(2, hi);
    const b = rng.int(2, hi * 2);
    const c = rng.int(2, hi * 2);
    if ((b * c) % a !== 0 || a === b || b === c || a === c || (b * c) / a > 1500) return null;
    return { nums: [a, b, c], ans: (b * c) / a };
  }
  if (kind === 'third') {
    const a = rng.int(2, hi);
    const b = rng.int(a + 1, hi * 3);
    if ((b * b) % a !== 0 || (b * b) / a > 1500) return null;
    return { nums: [a, b], ans: (b * b) / a };
  }
  const w = rng.int(1, big ? 12 : 6);
  const s = rng.int(1, 9);
  const t = rng.int(s + 1, 12);
  return { nums: [s * s * w, t * t * w], ans: s * t * w };
}

const PROP_WORD = { fourth: 'fourth proportional to', third: 'third proportional to', mean: 'mean proportional between' };

function proportional(ctx: Ctx): Res {
  const { rng, difficulty } = ctx;
  if (difficulty === 'hard') return propSum(ctx);
  if (difficulty === 'extreme') return propAdd(ctx);
  return attempt('proportional', 400, () => {
    const kind = rng.pick(['fourth', 'third', 'mean'] as const);
    const made = makeProportional(rng, kind, difficulty === 'medium');
    if (!made) return null;
    const { nums, ans } = made;
    const [a, b, c] = nums;
    const mistakes: Mist[] =
      kind === 'fourth'
        ? [
            { value: (a * c) / b, why: 'set up the proportion in the wrong order (a × c ÷ b)', trap: `The fourth proportional x satisfies ${a} : ${b} = ${c} : x, so x = ${b} × ${c} ÷ ${a}.` },
            { value: (a * b) / c, why: 'used a × b ÷ c' },
            { value: b + c - a, why: 'used differences (arithmetic) instead of ratios' },
          ]
        : kind === 'third'
          ? [
              { value: 2 * b - a, why: 'continued an arithmetic progression', trap: `${2 * b - a} keeps the difference equal. The third proportional keeps the ratio equal: ${a} : ${b} = ${b} : x, so x = ${b}² ÷ ${a}.` },
              { value: (a * a) / b, why: 'used a² ÷ b' },
              { value: b * b, why: 'forgot to divide by a' },
            ]
          : [
              { value: (a + b) / 2, why: 'took the arithmetic mean', trap: `${(a + b) / 2} is the average. The mean proportional is the geometric mean: √(${a} × ${b}).` },
              { value: Math.sqrt(a) + Math.sqrt(b), why: 'added the square roots' },
              { value: Math.abs(b - a) / 2, why: 'took half the difference' },
            ];
    return emit(ctx, {
      facts: { form: 'proportional', kind, nums },
      prompt: `Find the ${PROP_WORD[kind]} ${kind === 'mean' ? `${a} and ${b}` : kind === 'third' ? `${a} and ${b}` : `${a}, ${b} and ${c}`}.`,
      answer: ans,
      format: num,
      mistakes,
      steps:
        kind === 'fourth'
          ? [`${a} : ${b} = ${c} : x.`, `x = ${b} × ${c} ÷ ${a} = ${ans}.`]
          : kind === 'third'
            ? [`${a} : ${b} = ${b} : x.`, `x = ${b}² ÷ ${a} = ${b * b} ÷ ${a} = ${ans}.`]
            : [`${a} : x = x : ${b} ⇒ x² = ${a} × ${b} = ${a * b}.`, `x = √${a * b} = ${ans}.`],
      shortcut: kind === 'fourth' ? `Product of means = product of extremes.` : kind === 'third' ? `Third proportional = b²/a.` : `Mean proportional = √(ab).`,
      trap: `Proportion means equal ratios, not equal differences.`,
      tags: ['ratio:proportional', `ratio:${kind}-proportional`],
    });
  });
}

function propSum(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('prop-sum', 400, () => {
    const t = makeProportional(rng, 'third', false);
    const m = makeProportional(rng, 'mean', false);
    if (!t || !m) return null;
    const ans = t.ans + m.ans;
    if (ans > 1000) return null;
    return emit(ctx, {
      facts: { form: 'prop-sum', third: t.nums, mean: m.nums },
      prompt: `What is the sum of the third proportional to ${t.nums[0]} and ${t.nums[1]} and the mean proportional between ${m.nums[0]} and ${m.nums[1]}?`,
      answer: ans,
      format: num,
      mistakes: [
        { value: 2 * t.nums[1] - t.nums[0] + m.ans, why: 'third proportional as an AP term', trap: `The third proportional to ${t.nums[0]}, ${t.nums[1]} is ${t.nums[1]}²/${t.nums[0]} = ${t.ans}, not the next term of an AP.` },
        { value: t.ans + (m.nums[0] + m.nums[1]) / 2, why: 'arithmetic mean instead of mean proportional' },
        { value: (t.nums[0] * t.nums[0]) / t.nums[1] + m.ans, why: 'third proportional as a²/b' },
        { value: Math.abs(t.ans - m.ans), why: 'subtracted instead of adding' },
      ].filter((x) => x.value > 0),
      steps: [`Third proportional = ${t.nums[1]}² ÷ ${t.nums[0]} = ${t.ans}.`, `Mean proportional = √(${m.nums[0]} × ${m.nums[1]}) = ${m.ans}.`, `Sum = ${t.ans} + ${m.ans} = ${ans}.`],
      shortcut: `Third proportional = b²/a; mean proportional = √(ab).`,
      trap: `Third proportional ≠ next AP term, and mean proportional ≠ average.`,
      tags: ['ratio:proportional'],
    });
  });
}

function propAdd(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('prop-add', 400, () => {
    const u = rng.int(2, 9);
    const v = rng.int(u + 1, 12);
    const p = rng.int(2, 6);
    const q = rng.int(p + 1, 9);
    const P = [p * u, p * v, q * u, q * v]; // P0:P1 = P2:P3
    if (P[0] + P[3] === P[1] + P[2]) return null;
    const x = rng.int(2, Math.min(P[0] - 1, 20));
    if (x < 1) return null;
    const nums = P.map((y) => y - x);
    if (nums.some((y) => y <= 0) || new Set(nums).size < 4) return null;
    return emit(ctx, {
      facts: { form: 'prop-add', nums },
      prompt: `What number must be added to each of ${nums.slice(0, 3).join(', ')} and ${nums[3]} so that the resulting numbers are in proportion?`,
      answer: x,
      format: num,
      mistakes: [
        { value: x * 2, why: 'doubled the solution' },
        { value: Math.abs(nums[1] - nums[0]), why: 'took a difference of the given numbers' },
      ],
      steps: [
        `(${nums[0]} + x)(${nums[3]} + x) = (${nums[1]} + x)(${nums[2]} + x).`,
        `${nums[0] * nums[3]} + ${nums[0] + nums[3]}x = ${nums[1] * nums[2]} + ${nums[1] + nums[2]}x.`,
        `${Math.abs(nums[0] + nums[3] - nums[1] - nums[2])}x = ${Math.abs(nums[1] * nums[2] - nums[0] * nums[3])} ⇒ x = ${x}.`,
        `Check: ${P[0]} : ${P[1]} = ${P[2]} : ${P[3]} (both ${ratioStr([P[0], P[1]])}).`,
      ],
      shortcut: `x = (bc − ad) ÷ ((a + d) − (b + c)); or test the options — only ${x} makes ${ratioStr([P[0], P[1]])} on both sides.`,
      trap: `The x² terms cancel; the rest is a linear equation.`,
      tags: ['ratio:proportional', 'trick:check-options'],
    });
  });
}

/* ------------------------------------------------------------------ */
/* 6. Combining ratios                                                  */
/* ------------------------------------------------------------------ */

function chainRatios(ctx: Ctx, ask: 'first-last' | 'all', n: 2 | 3): Res {
  const { rng } = ctx;
  return attempt('chain', 300, () => {
    const pairs: [number, number][] = Array.from({ length: n }, () => {
      const a = rng.int(1, 9);
      const b = rng.int(1, 9);
      return reduceParts([a, b]) as [number, number];
    });
    if (pairs.some(([a, b]) => a === b)) return null;
    // Combine: A:B:C… with LCM on the shared terms.
    let chain: number[] = [pairs[0][0], pairs[0][1]];
    const lcmSteps: string[] = [];
    for (let i = 1; i < n; i++) {
      const [x, y] = pairs[i];
      const last = chain[chain.length - 1];
      const L = lcmAll([last, x]);
      chain = chain.map((v) => (v * L) / last);
      chain.push((y * L) / x);
      lcmSteps.push(`Make ${LETTERS[i]} equal (LCM of ${last} and ${x} is ${L}): ${LETTERS.slice(0, i + 2).join(' : ')} = ${chain.join(' : ')}.`);
    }
    chain = reduceParts(chain);
    if (chain.some((v) => v > 60)) return null;
    const answer = ask === 'all' ? chain : [chain[0], chain[chain.length - 1]];
    if (answer[0] === answer[answer.length - 1] && answer.length === 2) return null;
    const naive = ask === 'all' ? [pairs[0][0], pairs[0][1], pairs[1][1]] : [pairs[0][0], pairs[n - 1][1]];
    const mistakes: RatioMistake[] = [
      { parts: [...answer].reverse(), why: 'reversed the ratio', trap: `${ratioStr([...answer].reverse())} is the right ratio written in reverse order.` },
      { parts: naive, why: 'wrote the terms side by side without matching the common term', trap: `${ratioStr(naive)} just strings the given terms together. The common term must be made equal first (LCM).` },
    ];
    const names = LETTERS.slice(0, n + 1);
    const given = pairs.map(([x, y], i) => `${names[i]} : ${names[i + 1]} = ${x} : ${y}`);
    return emitRatio(ctx, {
      facts: { form: 'chain', pairs, ask },
      prompt: `If ${listAnd(given)}, find ${ask === 'all' ? names.join(' : ') : `${names[0]} : ${names[n]}`}.`,
      answer,
      mistakes,
      steps: [
        ...lcmSteps,
        `Combined: ${names.join(' : ')} = ${chain.join(' : ')}.`,
        ...(ask === 'first-last' ? [`${names[0]} : ${names[n]} = ${ratioStr(answer)}.`] : []),
      ],
      shortcut: ask === 'first-last' ? `Multiply the ratios: ${pairs.map(([x, y]) => `$\\frac{${x}}{${y}}$`).join(' × ')} = ${texFr(fr(answer[0], answer[1]))}.` : `Scale each pair so the shared letter has the same value.`,
      trap: `The shared term must be equal in both ratios before combining.`,
      tags: ['ratio:compound', 'trick:lcm-common-term'],
    });
  });
}

function equalProducts(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('equal-products', 300, () => {
    const m = [rng.int(2, 7), rng.int(2, 7), rng.int(2, 7), rng.int(2, 7)];
    if (m[0] === m[1] || m[2] === m[3]) return null;
    // m0 A = m1 B ⇒ A:B = m1:m0 ; m2 B = m3 C ⇒ B:C = m3:m2
    const ab = reduceParts([m[1], m[0]]);
    const bc = reduceParts([m[3], m[2]]);
    const L = lcmAll([ab[1], bc[0]]);
    const ans = reduceParts([(ab[0] * L) / ab[1], L, (bc[1] * L) / bc[0]]);
    if (ans.some((v) => v > 50)) return null;
    const naive = reduceParts([m[0], m[1], m[3]]);
    return emitRatio(ctx, {
      facts: { form: 'equal-products', m },
      prompt: `If ${m[0]}A = ${m[1]}B and ${m[2]}B = ${m[3]}C, find A : B : C.`,
      answer: ans,
      mistakes: [
        { parts: naive, why: 'used the coefficients directly as the ratio', trap: `${ratioStr(naive)} copies the coefficients. ${m[0]}A = ${m[1]}B means A : B = ${m[1]} : ${m[0]} — the coefficients cross over.` },
        { parts: [...ans].reverse(), why: 'reversed the ratio' },
        { parts: reduceParts([ab[0], ab[1], bc[1]]), why: 'combined without equalising B' },
      ],
      steps: [`${m[0]}A = ${m[1]}B ⇒ A : B = ${ab.join(' : ')}.`, `${m[2]}B = ${m[3]}C ⇒ B : C = ${bc.join(' : ')}.`, `Make B = ${L}: A : B : C = ${ans.join(' : ')}.`],
      shortcut: `pA = qB ⇒ A : B = q : p.`,
      trap: `Coefficients cross over when you turn an equation into a ratio.`,
      tags: ['ratio:compound', 'ratio:reciprocal'],
    });
  });
}

function compounded(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('compounded', 300, () => {
    const dup = reduceParts([rng.int(1, 5), rng.int(1, 5)]) as [number, number];
    const s1 = rng.int(1, 7);
    const s2 = rng.int(1, 7);
    const subdup = [s1 * s1, s2 * s2] as [number, number];
    const inv = reduceParts([rng.int(1, 7), rng.int(1, 7)]) as [number, number];
    if (dup[0] === dup[1] || s1 === s2 || inv[0] === inv[1]) return null;
    const ans = reduceParts([dup[0] * dup[0] * s1 * inv[1], dup[1] * dup[1] * s2 * inv[0]]);
    if (ans.some((v) => v > 200) || ans[0] === ans[1]) return null;
    const noSquare = reduceParts([dup[0] * s1 * inv[1], dup[1] * s2 * inv[0]]);
    const noInv = reduceParts([dup[0] * dup[0] * s1 * inv[0], dup[1] * dup[1] * s2 * inv[1]]);
    const noRoot = reduceParts([dup[0] * dup[0] * subdup[0] * inv[1], dup[1] * dup[1] * subdup[1] * inv[0]]);
    return emitRatio(ctx, {
      facts: { form: 'compounded', dup, subdup, inv },
      prompt: `Find the compounded ratio of the duplicate ratio of ${dup.join(' : ')}, the sub-duplicate ratio of ${subdup.join(' : ')} and the inverse ratio of ${inv.join(' : ')}.`,
      answer: ans,
      mistakes: [
        { parts: [ans[1], ans[0]], why: 'reversed the ratio' },
        { parts: noInv, why: 'did not invert the last ratio', trap: `${ratioStr(noInv)} uses ${inv.join(' : ')} as it is; the inverse ratio is ${inv[1]} : ${inv[0]}.` },
        { parts: noSquare, why: 'did not square the first ratio' },
        { parts: noRoot, why: 'did not take the square root for the sub-duplicate ratio' },
      ].filter((m) => m.parts.every((x) => x <= 200)),
      steps: [
        `Duplicate of ${dup.join(' : ')} = ${dup[0] ** 2} : ${dup[1] ** 2}.`,
        `Sub-duplicate of ${subdup.join(' : ')} = ${s1} : ${s2}.`,
        `Inverse of ${inv.join(' : ')} = ${inv[1]} : ${inv[0]}.`,
        `Compounded = ${dup[0] ** 2} × ${s1} × ${inv[1]} : ${dup[1] ** 2} × ${s2} × ${inv[0]} = ${ratioStr(ans)}.`,
      ],
      shortcut: `Duplicate = square, sub-duplicate = square root, inverse = flip; then multiply term-wise.`,
      trap: `"Sub-duplicate" means square root and "inverse" means flip — apply each before multiplying.`,
      tags: ['ratio:compound', 'ratio:duplicate'],
    });
  });
}

function compoundRatio(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return chainRatios(ctx, 'first-last', 2);
  if (difficulty === 'medium') return chainRatios(ctx, 'all', 2);
  if (difficulty === 'hard') return equalProducts(ctx);
  return compounded(ctx);
}

/* ------------------------------------------------------------------ */
/* 7. Variation                                                         */
/* ------------------------------------------------------------------ */

function vary(ctx: Ctx, powers: number[]): Res {
  const { rng } = ctx;
  return attempt('vary', 400, () => {
    const power = rng.pick(powers);
    const x1 = rng.int(2, 12);
    const x2 = rng.int(2, 15);
    if (x1 === x2) return null;
    const k = rng.int(1, 12);
    const f = (x: number) => (power === -1 ? k * 360 / x : power === 2 ? k * x * x : power === 0.5 ? k * Math.sqrt(x) : k * x);
    let X1 = x1;
    let X2 = x2;
    if (power === 0.5) {
      X1 = x1 * x1;
      X2 = x2 * x2;
    }
    const y1 = f(X1);
    const y2 = f(X2);
    if (!whole(y1) || !whole(y2) || y2 > 5000) return null;
    const desc = power === 1 ? 'directly as' : power === -1 ? 'inversely as' : power === 2 ? 'directly as the square of' : 'directly as the square root of';
    const directWrong = (y1 * X2) / X1;
    const inverseWrong = (y1 * X1) / X2;
    return emit(ctx, {
      facts: { form: 'vary', power, x1: X1, y1, x2: X2 },
      prompt: `y varies ${desc} x. If y = ${num(y1)} when x = ${X1}, find y when x = ${X2}.`,
      answer: y2,
      format: num,
      mistakes: [
        { value: power === -1 ? directWrong : inverseWrong, why: power === -1 ? 'treated inverse variation as direct' : 'treated direct variation as inverse', trap: power === -1 ? `Inverse variation keeps x × y constant, so y must ${X2 > X1 ? 'fall' : 'rise'} as x ${X2 > X1 ? 'rises' : 'falls'}.` : `Direct variation keeps y ÷ x${power === 2 ? '²' : power === 0.5 ? '^½' : ''} constant — y moves the same way as x.` },
        ...(power !== 1 && power !== -1 ? [{ value: directWrong, why: 'ignored the power (treated as simple direct variation)' }] : []),
        { value: y1 + (X2 - X1), why: 'added the change in x to y' },
      ].filter((m) => m.value > 0),
      steps: [
        `y = k × ${power === -1 ? '1/x' : power === 2 ? 'x²' : power === 0.5 ? '√x' : 'x'}.`,
        `k = ${power === -1 ? `${num(y1)} × ${X1}` : power === 2 ? `${num(y1)} ÷ ${X1}²` : power === 0.5 ? `${num(y1)} ÷ √${X1}` : `${num(y1)} ÷ ${X1}`} = ${num(power === -1 ? y1 * X1 : power === 2 ? y1 / (X1 * X1) : power === 0.5 ? y1 / Math.sqrt(X1) : y1 / X1)}.`,
        `y = ${num(y2)} when x = ${X2}.`,
      ],
      shortcut: power === -1 ? `x₁y₁ = x₂y₂ ⇒ y₂ = ${num(y1)} × ${X1}/${X2}.` : `y₂ = y₁ × (x₂/x₁)${power === 2 ? '²' : power === 0.5 ? '^½' : ''}.`,
      trap: `Identify the type of variation before scaling.`,
      tags: ['ratio:variation'],
    });
  });
}

function joint(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('joint', 400, () => {
    const k = rng.pick([1, 2, 3, 4, 5, 6, 8, 10, 12]);
    const y1 = rng.int(2, 9);
    const z1 = rng.int(2, 9);
    const y2 = rng.int(2, 12);
    const z2 = rng.int(2, 12);
    const x1 = (k * y1 * y1) / z1;
    const x2 = (k * y2 * y2) / z2;
    if (!whole(x1) || !whole(x2) || (y1 === y2 && z1 === z2) || x1 === x2) return null;
    return emit(ctx, {
      facts: { form: 'joint', x1, y1, z1, y2, z2 },
      prompt: `x varies directly as the square of y and inversely as z. If x = ${x1} when y = ${y1} and z = ${z1}, find x when y = ${y2} and z = ${z2}.`,
      answer: x2,
      format: num,
      mistakes: [
        { value: (x1 * y2 * z1) / (y1 * z2), why: 'did not square y', trap: `Squaring matters: x ∝ y², so the y-factor is (${y2}/${y1})², not ${y2}/${y1}.` },
        { value: (x1 * y2 * y2 * z2) / (y1 * y1 * z1), why: 'treated z as direct' },
        { value: (x1 * y2 * y2) / (y1 * y1), why: 'ignored z' },
      ].filter((m) => m.value > 0),
      steps: [`x = k y²/z ⇒ k = ${x1} × ${z1} ÷ ${y1}² = ${k}.`, `x = ${k} × ${y2}² ÷ ${z2} = ${x2}.`],
      shortcut: `x₂ = x₁ × (y₂/y₁)² × (z₁/z₂).`,
      trap: `Apply the square to y and the inverse to z.`,
      tags: ['ratio:variation', 'ratio:joint'],
    });
  });
}

function fixedVariable(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('fixed-variable', 300, () => {
    const fixed = rng.int(10, 60) * 500;
    const rate = rng.int(10, 40) * 50;
    const n1 = rng.int(20, 50);
    const n2 = n1 + rng.int(5, 25);
    const n3 = n2 + rng.int(3, 20);
    const c = (n: number) => fixed + rate * n;
    const [c1, c2, c3] = [c(n1), c(n2), c(n3)];
    const direct = (c1 * n3) / n1;
    return emit(ctx, {
      facts: { form: 'fixed-variable', n1, c1, n2, c2, n3 },
      prompt: `The monthly expenses of a hostel are partly fixed and partly vary with the number of boarders. With ${n1} boarders the expenses are ${rs(c1)}, and with ${n2} boarders they are ${rs(c2)}. What will the expenses be with ${n3} boarders?`,
      answer: c3,
      format: rs,
      mistakes: [
        { value: direct, why: 'treated the whole expense as varying directly', trap: `${rs(Math.round(direct))} scales ${rs(c1)} in the ratio ${n3} : ${n1}. Only part of the cost varies; the fixed part (${rs(fixed)}) stays the same.` },
        { value: c2 + (c2 - c1), why: 'added the same increase again' },
        { value: rate * n3, why: 'forgot the fixed part' },
        { value: c2 + rate * (n3 - n2) + fixed, why: 'added the fixed part twice' },
      ],
      steps: [
        `Extra ${n2 - n1} boarders cost ${rs(c2)} − ${rs(c1)} = ${rs(c2 - c1)} ⇒ ${rs(rate)} per boarder.`,
        `Fixed part = ${rs(c1)} − ${n1} × ${rs(rate)} = ${rs(fixed)}.`,
        `For ${n3}: ${rs(fixed)} + ${n3} × ${rs(rate)} = ${rs(c3)}.`,
      ],
      shortcut: `Cost is linear: ${rs(c2)} + ${n3 - n2} × ${rs(rate)} = ${rs(c3)}.`,
      trap: `A partly-fixed cost is not proportional to the number of boarders.`,
      tags: ['ratio:variation', 'ratio:fixed-plus-variable'],
    });
  });
}

function variation(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return vary(ctx, [1, -1]);
  if (difficulty === 'medium') return vary(ctx, [2, 0.5, -1]);
  if (difficulty === 'hard') return joint(ctx);
  return fixedVariable(ctx);
}

/* ------------------------------------------------------------------ */

const BUILDERS: Record<string, (ctx: Ctx) => Res> = {
  'divide-amount': divideAmount,
  'add-remove': addRemove,
  coins,
  'income-expenditure': incomeExpenditure,
  proportional,
  'compound-ratio': compoundRatio,
  variation,
};

export const generator = defineGenerator<RatioFacts>(META, SUBTYPES, (ctx) => {
  const build = BUILDERS[ctx.subtype.id];
  if (!build) throw new Error(`quant.ratio-proportion: no builder for ${ctx.subtype.id}`);
  return build(ctx);
});
