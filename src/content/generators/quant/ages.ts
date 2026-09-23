/**
 * Problems on ages (SPEC 8.1 Q16). Built backward from clean present ages (5–70 years); offsets 3–12
 * years; ratio terms ≤ 16 (research). Traps: the offset applied to only one person, "hence" vs "ago",
 * answering the present age when a future/past age is asked, forgetting that everyone ages.
 */
import { defineGenerator, type BuildContext, type GenResult, type SubtypeDef } from '../types';
import {
  attempt,
  emit,
  emitRatio,
  gcd,
  his,
  pickPeople,
  reduceParts,
  texFr,
  fr,
  type Mist,
  type RatioMistake,
} from './ages/kit';

const META = { name: 'quant.ages', version: 1, subject: 'quant', chapter: 'ages' } as const;

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'ratio-shift', label: 'Ratios now and after / before n years', weight: 3 },
  { id: 'sum-ratio', label: 'Sum (or gaps) and ratio of ages', weight: 2 },
  { id: 'family', label: 'Parents, children & generations', weight: 2 },
  { id: 'average-age', label: 'Average-age combinations', weight: 1.5 },
];

export type AgesFacts =
  /** Present ratio a:b; after (t > 0) or before (t < 0) |t| years ratio p:q; asked: present age of person `ask` (0 = A, 1 = B). */
  | { form: 'now-and-shift'; a: number; b: number; t: number; p: number; q: number; ask: 0 | 1 }
  /** Present ratio a:b; (A + hence) : (B − ago) = p:q; asked: sum of ages after `after` years. */
  | { form: 'mixed-offset'; a: number; b: number; hence: number; ago: number; p: number; q: number; after: number }
  /** `ago` years ago ratio r1; `hence` years hence ratio r2; asked: A's age after `after` years, or the ratio then. */
  | { form: 'two-horizons'; ago: number; r1: [number, number]; hence: number; r2: [number, number]; after: number; ask: 'age' | 'ratio' }
  /** Present sum and ratio; asked: A's age. */
  | { form: 'sum-now'; sum: number; a: number; b: number }
  /** Present sum; ratio `ago` years ago; asked: B's present age. */
  | { form: 'sum-ago'; sum: number; ago: number; a: number; b: number }
  /** (u/v) of A's age = (w/x) of B's age; sum after `after` years; asked: A's present age. */
  | { form: 'fraction-equal'; u: number; v: number; w: number; x: number; after: number; sum: number }
  /** C = A + k1, B = C + k2, A:B = a:b now; asked: C's age `ago` years ago. */
  | { form: 'three-gaps'; k1: number; k2: number; a: number; b: number; ago: number }
  /** Father = k × son now; after n years father = m × son; asked: father's present age. */
  | { form: 'father-son'; k: number; n: number; m: number }
  /** Mother was `atBirth` at daughter's birth; now mother = k × daughter; asked: daughter's age after `after` years. */
  | { form: 'at-birth'; atBirth: number; k: number; after: number }
  /** `ago` years ago father = k1 × son; `hence` years hence father = k2 × son; asked: sum of present ages. */
  | { form: 'two-multiples'; ago: number; k1: number; hence: number; k2: number }
  /** Grandfather = g × grandson, father = f × grandson, sum of three = sum; asked: father's age after `after` years. */
  | { form: 'generations'; g: number; f: number; sum: number; after: number }
  /** Three ages in ratio parts; average `avg`; asked: the eldest's age. */
  | { form: 'avg-ratio'; parts: number[]; avg: number }
  /** Family of n, average avg, youngest y; asked: average at the birth of the youngest. */
  | { form: 'avg-birth'; n: number; avg: number; youngest: number }
  /** Husband & wife average `avg` at marriage `since` years ago; child aged `child`; asked: family average now. */
  | { form: 'avg-marriage'; avg: number; since: number; child: number }
  /** Family of n had average `avg` `since` years ago; one child born since; average same today; asked: child's age. */
  | { form: 'avg-same'; n: number; avg: number; since: number };

type Ctx = BuildContext;
type Res = GenResult<AgesFacts>;

const yrs = (v: number): string => `${v} year${v === 1 ? '' : 's'}`;
const small = (p: readonly number[], max = 16): boolean => reduceParts(p).every((x) => x <= max);
const COPRIME: [number, number][] = [[2, 3], [3, 4], [3, 5], [4, 5], [5, 6], [5, 7], [4, 7], [5, 8], [7, 9], [3, 7], [2, 5], [5, 9], [7, 8], [1, 2], [1, 3], [2, 7]];
const whole = (v: number): boolean => Math.abs(v - Math.round(v)) < 1e-9;

/* ------------------------------------------------------------------ */
/* 1. Ratios now and after / before n years                            */
/* ------------------------------------------------------------------ */

function nowAndShift(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('now-and-shift', 400, () => {
    const [a, b] = rng.pick(COPRIME);
    const k = rng.int(2, 15);
    const n = rng.int(3, 12);
    const t = rng.chance(0.6) ? n : -n;
    const A = a * k;
    const B = b * k;
    if (B > 70 || A + t < 1 || A < 4) return null;
    const [p, q] = reduceParts([A + t, B + t]);
    if (!small([p, q]) || (p === a && q === b)) return null;
    const ask: 0 | 1 = rng.chance(0.5) ? 0 : 1;
    const [P, Q] = pickPeople(rng, 2);
    const names = [P.name, Q.name];
    const ans = ask === 0 ? A : B;
    const when = t > 0 ? `After ${yrs(n)}` : `${yrs(n)} ago`;
    const oneSided = (() => {
      // (A + t) : B = p : q with A = a k', B = b k' ⇒ k' = t q / (b p − a q)
      const den = b * p - a * q;
      return den !== 0 ? ((t * q) / den) * (ask === 0 ? a : b) : -1;
    })();
    const mistakes: Mist[] = [
      { value: ask === 0 ? B : A, why: "gave the other person's age", trap: `${ask === 0 ? B : A} years is ${names[1 - ask]}'s present age; the question asks for ${names[ask]}'s.` },
      { value: ans + t, why: t > 0 ? `gave the age after ${n} years` : `gave the age ${n} years ago`, trap: `${ans + t} years is ${names[ask]}'s age ${t > 0 ? `after ${yrs(n)}` : `${yrs(n)} ago`} — the question asks for the present age.` },
      { value: oneSided, why: 'applied the offset to one person only' },
      { value: ans - t, why: 'mixed up "hence" and "ago"' },
    ].filter((m) => m.value > 0 && m.value <= 100);
    return emit(ctx, {
      facts: { form: 'now-and-shift', a, b, t, p, q, ask },
      prompt: `The present ages of ${names[0]} and ${names[1]} are in the ratio ${a} : ${b}. ${when}, the ratio of their ages ${t > 0 ? 'will be' : 'was'} ${p} : ${q}. What is ${names[ask]}'s present age?`,
      answer: ans,
      format: yrs,
      mistakes,
      steps: [
        `Let the present ages be ${a}k and ${b}k.`,
        `(${a}k ${t > 0 ? '+' : '−'} ${n}) : (${b}k ${t > 0 ? '+' : '−'} ${n}) = ${p} : ${q}.`,
        `${q}(${a}k ${t > 0 ? '+' : '−'} ${n}) = ${p}(${b}k ${t > 0 ? '+' : '−'} ${n}) ⇒ ${Math.abs(p * b - q * a)}k = ${Math.abs((q - p) * n)} ⇒ k = ${k}.`,
        `${names[ask]}'s present age = ${ask === 0 ? a : b} × ${k} = ${ans} years.`,
      ],
      shortcut: `The age gap ${b - a}k never changes: in ${p} : ${q} it is ${q - p} part${q - p === 1 ? '' : 's'}. Or test options — only ${A} and ${B} give ${p} : ${q}.`,
      trap: `Both people age by the same ${yrs(n)} — add (or subtract) it on both sides.`,
      tags: ['ages:ratio-shift', t > 0 ? 'ages:hence' : 'ages:ago'],
      visual: { type: 'grid', columns: ['', t > 0 ? 'Now' : `${n} yrs ago`, t > 0 ? `After ${n} yrs` : 'Now'], rows: t > 0 ? [[names[0], String(A), String(A + t)], [names[1], String(B), String(B + t)]] : [[names[0], String(A + t), String(A)], [names[1], String(B + t), String(B)]] },
    });
  });
}

function mixedOffset(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('mixed-offset', 400, () => {
    const [a, b] = rng.pick(COPRIME);
    const k = rng.int(2, 12);
    const hence = rng.int(3, 12);
    const ago = rng.int(3, 12);
    const A = a * k;
    const B = b * k;
    if (B > 65 || B - ago < 1 || A < 4) return null;
    const [p, q] = reduceParts([A + hence, B - ago]);
    if (!small([p, q]) || (p === a && q === b)) return null;
    const after = rng.int(3, 10);
    const ans = A + B + 2 * after;
    const [P, Q] = pickPeople(rng, 2);
    return emit(ctx, {
      facts: { form: 'mixed-offset', a, b, hence, ago, p, q, after },
      prompt: `The present ages of ${P.name} and ${Q.name} are in the ratio ${a} : ${b}. The ratio of ${P.name}'s age ${yrs(hence)} hence to ${Q.name}'s age ${yrs(ago)} ago is ${p} : ${q}. What will be the sum of their ages after ${yrs(after)}?`,
      answer: ans,
      format: yrs,
      mistakes: [
        { value: A + B + after, why: 'added the extra years to only one person', trap: `${A + B + after} years adds ${yrs(after)} once. After ${yrs(after)} both of them are ${yrs(after)} older, so the sum rises by ${2 * after}.` },
        { value: A + B, why: 'gave the present sum' },
        { value: A + B + hence - ago + 2 * after, why: 'kept the offsets in the final sum' },
        { value: B + after, why: `gave ${Q.name}'s age after ${after} years` },
      ],
      steps: [
        `Let the present ages be ${a}k and ${b}k.`,
        `(${a}k + ${hence}) : (${b}k − ${ago}) = ${p} : ${q} ⇒ ${q}(${a}k + ${hence}) = ${p}(${b}k − ${ago}).`,
        `${Math.abs(p * b - q * a)}k = ${q * hence + p * ago} ⇒ k = ${k}; ages ${A} and ${B}.`,
        `Sum after ${yrs(after)} = ${A} + ${B} + 2 × ${after} = ${ans} years.`,
      ],
      shortcut: `Solve for k once; the sum after t years is (present sum) + 2t.`,
      trap: `"Hence" adds years and "ago" subtracts them — and a future sum grows by 2 × the years.`,
      tags: ['ages:ratio-shift', 'ages:mixed-offset'],
    });
  });
}

function twoHorizons(ctx: Ctx, ask: 'age' | 'ratio'): Res {
  const { rng } = ctx;
  return attempt('two-horizons', 600, () => {
    const A = rng.int(8, 45);
    const B = rng.int(A + 3, Math.min(A + 30, 65));
    const ago = rng.int(3, Math.min(12, A - 2));
    const hence = rng.int(3, 12);
    const r1 = reduceParts([A - ago, B - ago]) as [number, number];
    const r2 = reduceParts([A + hence, B + hence]) as [number, number];
    if (!small(r1) || !small(r2) || (r1[0] === r2[0] && r1[1] === r2[1])) return null;
    const after = rng.int(2, 12);
    const r3 = reduceParts([A + after, B + after]);
    if (ask === 'ratio' && (!small(r3, 30) || after === hence)) return null;
    const [P, Q] = pickPeople(rng, 2);
    const common = {
      facts: { form: 'two-horizons' as const, ago, r1, hence, r2, after, ask },
      prompt: `${yrs(ago)} ago, the ratio of the ages of ${P.name} and ${Q.name} was ${r1[0]} : ${r1[1]}. ${yrs(hence)} hence, the ratio will be ${r2[0]} : ${r2[1]}. ${ask === 'age' ? `What will be ${P.name}'s age after ${yrs(after)} from now?` : `What will be the ratio of their ages after ${yrs(after)} from now?`}`,
      steps: [
        `Let ${P.name} and ${Q.name} be ${r1[0]}x and ${r1[1]}x, ${yrs(ago)} ago.`,
        `${yrs(hence)} hence they are ${ago + hence} years older: (${r1[0]}x + ${ago + hence}) : (${r1[1]}x + ${ago + hence}) = ${r2[0]} : ${r2[1]}.`,
        `Solving: x = ${(A - ago) / r1[0]}; present ages ${A} and ${B}.`,
        ask === 'age' ? `${P.name} after ${yrs(after)} = ${A} + ${after} = ${A + after} years.` : `After ${yrs(after)}: ${A + after} : ${B + after} = ${r3.join(' : ')}.`,
      ],
      shortcut: `Count the gap between the two moments (${ago} + ${hence} = ${ago + hence} years); the age difference ${B - A} stays fixed.`,
      trap: `Between "${ago} years ago" and "${hence} years hence" the ages grow by ${ago + hence}, not by ${hence}.`,
      tags: ['ages:ratio-shift', 'ages:two-horizons'],
    };
    if (ask === 'age') {
      return emit(ctx, {
        ...common,
        answer: A + after,
        format: yrs,
        mistakes: [
          { value: A, why: 'gave the present age', trap: `${A} years is ${P.name}'s present age; add ${yrs(after)}.` },
          { value: B + after, why: `gave ${Q.name}'s age` },
          { value: A - ago + after, why: 'counted from the earlier moment' },
          { value: A + hence, why: `gave the age ${hence} years hence` },
        ],
      });
    }
    const mistakes: RatioMistake[] = [
      { parts: [r3[1], r3[0]], why: 'reversed the ratio', trap: `${r3[1]} : ${r3[0]} is ${Q.name} : ${P.name}; the question lists ${P.name} first.` },
      { parts: [A, B], why: 'gave the present ratio' },
      { parts: [r2[0], r2[1]], why: `gave the ratio ${hence} years hence` },
    ];
    return emitRatio(ctx, { ...common, answer: r3, mistakes });
  });
}

function ratioShift(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return nowAndShift(ctx);
  if (difficulty === 'medium') return mixedOffset(ctx);
  if (difficulty === 'hard') return twoHorizons(ctx, 'age');
  return twoHorizons(ctx, 'ratio');
}

/* ------------------------------------------------------------------ */
/* 2. Sum and ratio                                                     */
/* ------------------------------------------------------------------ */

function sumNow(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('sum-now', 200, () => {
    const [a, b] = rng.pick(COPRIME);
    const k = rng.int(2, 12);
    const A = a * k;
    const B = b * k;
    if (B > 70 || A < 4) return null;
    const sum = A + B;
    const [P, Q] = pickPeople(rng, 2);
    return emit(ctx, {
      facts: { form: 'sum-now', sum, a, b },
      prompt: `The sum of the present ages of ${P.name} and ${Q.name} is ${yrs(sum)}, and their ages are in the ratio ${a} : ${b}. What is ${P.name}'s present age?`,
      answer: A,
      format: yrs,
      mistakes: [
        { value: B, why: "gave the other person's age", trap: `${B} years is ${Q.name}'s age (${b} parts).` },
        { value: sum / 2, why: 'split the sum equally' },
        { value: (sum * a) / b, why: 'divided by one term instead of the sum of terms' },
        { value: B - A, why: 'gave the age difference' },
      ],
      steps: [`Total parts = ${a} + ${b} = ${a + b}.`, `1 part = ${sum} ÷ ${a + b} = ${k} years.`, `${P.name} = ${a} × ${k} = ${A} years.`],
      shortcut: `${P.name} = ${sum} × ${a}/${a + b}.`,
      trap: `Divide by the total number of parts, ${a + b}.`,
      tags: ['ages:sum-ratio'],
    });
  });
}

function sumAgo(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('sum-ago', 300, () => {
    const [a, b] = rng.pick(COPRIME);
    const k = rng.int(2, 10);
    const ago = rng.int(3, 12);
    const A = a * k + ago;
    const B = b * k + ago;
    if (B > 70) return null;
    const sum = A + B;
    const wrong = (sum * b) / (a + b);
    const [P, Q] = pickPeople(rng, 2);
    return emit(ctx, {
      facts: { form: 'sum-ago', sum, ago, a, b },
      prompt: `The sum of the present ages of ${P.name} and ${Q.name} is ${yrs(sum)}. ${yrs(ago)} ago, their ages were in the ratio ${a} : ${b}. What is ${Q.name}'s present age?`,
      answer: B,
      format: yrs,
      mistakes: [
        { value: wrong, why: 'split the present sum in the old ratio', trap: `${Math.round(wrong)} years splits today's sum in the ratio ${a} : ${b}, but that ratio belongs to ${yrs(ago)} ago, when the sum was ${sum} − 2 × ${ago} = ${sum - 2 * ago}.` },
        { value: B - ago, why: `gave the age ${ago} years ago` },
        { value: A, why: "gave the other person's age" },
        { value: ((sum - ago) * b) / (a + b) + ago, why: 'subtracted the years from the sum only once' },
      ],
      steps: [`Sum ${yrs(ago)} ago = ${sum} − 2 × ${ago} = ${sum - 2 * ago}.`, `Split ${a} : ${b}: 1 part = ${sum - 2 * ago} ÷ ${a + b} = ${k}; ${Q.name} then = ${b * k}.`, `${Q.name} now = ${b * k} + ${ago} = ${B} years.`],
      shortcut: `Move the sum to the time of the ratio (subtract 2 × ${ago}), split, then come back.`,
      trap: `The ratio and the sum belong to different times — shift the sum by 2 × ${ago}.`,
      tags: ['ages:sum-ratio', 'ages:ago'],
    });
  });
}

function fractionEqual(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('fraction-equal', 400, () => {
    const u = rng.int(1, 5);
    const v = rng.int(u + 1, 8);
    const w = rng.int(1, 5);
    const x = rng.int(w + 1, 8);
    if (gcd(u, v) !== 1 || gcd(w, x) !== 1 || u * x === w * v) return null;
    // (u/v) A = (w/x) B ⇒ A : B = w v : x u
    const [ra, rb] = reduceParts([w * v, x * u]);
    if (!small([ra, rb], 16)) return null;
    const k = rng.int(2, 12);
    const A = ra * k;
    const B = rb * k;
    if (Math.max(A, B) > 70 || Math.min(A, B) < 4) return null;
    const after = rng.int(3, 10);
    const sum = A + B + 2 * after;
    const [P, Q] = pickPeople(rng, 2);
    return emit(ctx, {
      facts: { form: 'fraction-equal', u, v, w, x, after, sum },
      prompt: `${texFr(fr(u, v))} of ${P.name}'s present age is equal to ${texFr(fr(w, x))} of ${Q.name}'s present age. After ${yrs(after)}, the sum of their ages will be ${yrs(sum)}. What is ${P.name}'s present age?`,
      answer: A,
      format: yrs,
      mistakes: [
        { value: ((sum - 2 * after) * rb) / (ra + rb), why: 'reversed the ratio (A : B = u/v : w/x)', trap: `That value uses A : B = ${rb} : ${ra}. From ${texFr(fr(u, v))}A = ${texFr(fr(w, x))}B, A : B = ${texFr(fr(w, x))} : ${texFr(fr(u, v))} = ${ra} : ${rb}.` },
        { value: (sum * ra) / (ra + rb), why: 'split the future sum instead of the present sum' },
        { value: ((sum - after) * ra) / (ra + rb), why: 'subtracted the years only once' },
        { value: A + after, why: 'gave the age after the given years' },
      ],
      steps: [
        `${texFr(fr(u, v))}A = ${texFr(fr(w, x))}B ⇒ A : B = ${texFr(fr(w, x))} : ${texFr(fr(u, v))} = ${ra} : ${rb}.`,
        `Present sum = ${sum} − 2 × ${after} = ${sum - 2 * after}.`,
        `A = ${sum - 2 * after} × ${ra}/${ra + rb} = ${A} years.`,
      ],
      shortcut: `pA = qB ⇒ A : B = q : p (cross over).`,
      trap: `The fractions cross over when you form the ratio, and the future sum includes 2 × ${after} extra years.`,
      tags: ['ages:sum-ratio', 'ratio:cross-multiplication'],
    });
  });
}

function threeGaps(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('three-gaps', 400, () => {
    const [a, b] = rng.pick(COPRIME);
    const m = rng.int(2, 12);
    const A = a * m;
    const B = b * m;
    const gap = B - A;
    if (gap < 4 || B > 70 || A < 5) return null;
    const k1 = rng.int(1, gap - 1);
    const k2 = gap - k1;
    const C = A + k1;
    const ago = rng.int(3, Math.min(12, A - 1));
    const names = pickPeople(rng, 3).map((p) => p.name);
    return emit(ctx, {
      facts: { form: 'three-gaps', k1, k2, a, b, ago },
      prompt: `${names[2]} is ${yrs(k1)} older than ${names[0]} and ${yrs(k2)} younger than ${names[1]}. The present ages of ${names[0]} and ${names[1]} are in the ratio ${a} : ${b}. What was ${names[2]}'s age ${yrs(ago)} ago?`,
      answer: C - ago,
      format: yrs,
      mistakes: [
        { value: C, why: 'gave the present age', trap: `${C} years is ${names[2]}'s present age; the question asks for ${yrs(ago)} ago.` },
        { value: A - ago, why: `gave ${names[0]}'s age then` },
        { value: C + ago, why: 'added the years instead of subtracting' },
        { value: A + k2 - ago, why: 'added the wrong gap' },
      ],
      steps: [
        `${names[1]} − ${names[0]} = ${k1} + ${k2} = ${gap} years.`,
        `In the ratio ${a} : ${b} the gap is ${b - a} part${b - a === 1 ? '' : 's'} ⇒ 1 part = ${m} years; ${names[0]} = ${A}, ${names[1]} = ${B}.`,
        `${names[2]} = ${A} + ${k1} = ${C}; ${yrs(ago)} ago = ${C - ago} years.`,
      ],
      shortcut: `Chain the gaps: ${names[0]} → ${names[2]} → ${names[1]} spans ${gap} years = ${b - a} parts.`,
      trap: `Read "ago" at the end — subtract ${ago} from the present age.`,
      tags: ['ages:sum-ratio', 'ages:three-persons'],
    });
  });
}

function sumRatio(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return sumNow(ctx);
  if (difficulty === 'medium') return sumAgo(ctx);
  if (difficulty === 'hard') return fractionEqual(ctx);
  return threeGaps(ctx);
}

/* ------------------------------------------------------------------ */
/* 3. Family                                                            */
/* ------------------------------------------------------------------ */

function fatherSon(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('father-son', 400, () => {
    const k = rng.int(3, 6);
    const m = rng.int(2, k - 1);
    const n = rng.int(3, 20);
    const s = (n * (m - 1)) / (k - m);
    if (!whole(s) || s < 4 || s > 18) return null;
    const F = k * s;
    if (F > 70 || F < 25) return null;
    const [son] = pickPeople(rng, 1, ['m']);
    const parent = rng.pick(['father', 'mother']);
    return emit(ctx, {
      facts: { form: 'father-son', k, n, m },
      prompt: `A ${parent} is ${k} times as old as ${his({ name: '', g: parent === 'father' ? 'm' : 'f' })} son ${son.name}. After ${yrs(n)}, the ${parent} will be ${m} times as old as ${son.name}. What is the ${parent}'s present age?`,
      answer: F,
      format: yrs,
      mistakes: [
        { value: s, why: "gave the son's age", trap: `${s} years is ${son.name}'s age; the ${parent} is ${k} times that.` },
        { value: F + n, why: `gave the ${parent}'s age after ${n} years` },
        { value: k * (s + n), why: 'multiplied the future age of the son by the present multiple' },
        { value: m * s, why: 'used the future multiple on the present age' },
      ].filter((x) => x.value <= 90),
      steps: [
        `Let ${son.name} be x; the ${parent} is ${k}x.`,
        `After ${n} years: ${k}x + ${n} = ${m}(x + ${n}) ⇒ ${k - m}x = ${(m - 1) * n}.`,
        `x = ${s}; the ${parent} = ${k} × ${s} = ${F} years.`,
      ],
      shortcut: `Test the options: only ${F} (with son ${s}) turns into ${F + n} = ${m} × ${s + n}.`,
      trap: `Both the ${parent} and the son age by ${n} years.`,
      tags: ['ages:family'],
    });
  });
}

function atBirth(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('at-birth', 300, () => {
    const k = rng.int(2, 5);
    const d = rng.int(5, 25);
    const atBirthAge = (k - 1) * d;
    if (atBirthAge < 20 || atBirthAge > 38) return null;
    const after = rng.int(2, 10);
    const [girl] = pickPeople(rng, 1, ['f']);
    return emit(ctx, {
      facts: { form: 'at-birth', atBirth: atBirthAge, k, after },
      prompt: `${girl.name}'s mother was ${yrs(atBirthAge)} old when ${girl.name} was born. At present, the mother is ${k} times as old as ${girl.name}. What will be ${girl.name}'s age after ${yrs(after)}?`,
      answer: d + after,
      format: yrs,
      mistakes: [
        { value: d, why: 'gave the present age', trap: `${d} years is ${girl.name}'s present age; the question asks for ${yrs(after)} later.` },
        { value: atBirthAge / k + after, why: 'divided the age gap by k instead of (k − 1)' },
        { value: k * d + after, why: "gave the mother's age" },
        { value: d + 2 * after, why: 'added the years twice' },
      ].filter((x) => x.value > 0),
      steps: [
        `The age gap is always ${atBirthAge} years.`,
        `Mother = ${k} × daughter ⇒ gap = (${k} − 1) × daughter ⇒ daughter = ${atBirthAge} ÷ ${k - 1} = ${d}.`,
        `After ${yrs(after)}: ${d} + ${after} = ${d + after} years.`,
      ],
      shortcut: `Age gap = (multiple − 1) × younger age.`,
      trap: `The mother's age at birth is the permanent gap; divide by (${k} − 1), not by ${k}.`,
      tags: ['ages:family', 'ages:constant-gap'],
    });
  });
}

function twoMultiples(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('two-multiples', 600, () => {
    const s = rng.int(6, 22);
    const F = rng.int(28, 65);
    const ago = rng.int(3, Math.min(12, s - 1));
    const hence = rng.int(3, 15);
    const k1 = (F - ago) / (s - ago);
    const k2 = (F + hence) / (s + hence);
    if (!Number.isInteger(k1) || !Number.isInteger(k2) || k1 <= k2 || k2 < 2) return null;
    const [son] = pickPeople(rng, 1, ['m']);
    return emit(ctx, {
      facts: { form: 'two-multiples', ago, k1, hence, k2 },
      prompt: `${yrs(ago)} ago, a man was ${k1} times as old as his son ${son.name}. ${yrs(hence)} hence, he will be ${k2} times as old as ${son.name}. What is the sum of their present ages?`,
      answer: F + s,
      format: yrs,
      mistakes: [
        { value: F + s - 2 * ago, why: 'gave the sum from the earlier moment', trap: `${F + s - 2 * ago} is the sum ${yrs(ago)} ago; add ${ago} years for each of them.` },
        { value: F + s + 2 * hence, why: 'gave the future sum' },
        { value: F, why: "gave the man's age" },
        { value: F + s + ago, why: 'shifted only one person' },
      ],
      steps: [
        `Let ${son.name}'s age ${yrs(ago)} ago be x; the man was ${k1}x.`,
        `${yrs(hence)} hence (${ago + hence} years later): ${k1}x + ${ago + hence} = ${k2}(x + ${ago + hence}).`,
        `${k1 - k2}x = ${(k2 - 1) * (ago + hence)} ⇒ x = ${s - ago}; present ages ${s} and ${F}.`,
        `Sum = ${F + s} years.`,
      ],
      shortcut: `The two moments are ${ago + hence} years apart; set up one equation in the earlier age.`,
      trap: `Measure the gap between the moments (${ago} + ${hence}), then come back to the present.`,
      tags: ['ages:family', 'ages:two-horizons'],
    });
  });
}

function generations(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('generations', 400, () => {
    const s = rng.int(5, 16);
    const f = rng.int(3, 6);
    const g = rng.int(f + 2, 9);
    const F = f * s;
    const G = g * s;
    if (G > 90 || F < 25 || G - F < 20) return null;
    const sum = s + F + G;
    const after = rng.int(3, 10);
    const [boy] = pickPeople(rng, 1, ['m']);
    return emit(ctx, {
      facts: { form: 'generations', g, f, sum, after },
      prompt: `${boy.name}'s grandfather is ${g} times as old as ${boy.name}, and ${boy.name}'s father is ${f} times as old as ${boy.name}. The sum of the present ages of the three is ${yrs(sum)}. How old will the father be after ${yrs(after)}?`,
      answer: F + after,
      format: yrs,
      mistakes: [
        { value: F, why: "gave the father's present age", trap: `${F} years is the father's present age; add ${yrs(after)}.` },
        { value: G + after, why: "gave the grandfather's age" },
        { value: (sum / (g + f)) * f + after, why: 'left out the boy from the sum' },
        { value: F + 3 * after, why: 'added the years for all three' },
      ].filter((x) => x.value > 0),
      steps: [`Let ${boy.name} be x: father ${f}x, grandfather ${g}x.`, `x + ${f}x + ${g}x = ${sum} ⇒ ${1 + f + g}x = ${sum} ⇒ x = ${s}.`, `Father = ${F}; after ${yrs(after)}: ${F + after} years.`],
      shortcut: `Parts 1 : ${f} : ${g} add to ${1 + f + g}.`,
      trap: `The boy's own age is one of the parts: 1 + ${f} + ${g}.`,
      tags: ['ages:family', 'ages:generations'],
    });
  });
}

function family(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return fatherSon(ctx);
  if (difficulty === 'medium') return atBirth(ctx);
  if (difficulty === 'hard') return twoMultiples(ctx);
  return generations(ctx);
}

/* ------------------------------------------------------------------ */
/* 4. Average-age combos                                                */
/* ------------------------------------------------------------------ */

function avgRatio(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('avg-ratio', 300, () => {
    const parts = rng.pick([[2, 3, 4], [3, 4, 5], [1, 2, 3], [2, 3, 5], [3, 5, 7], [4, 5, 6], [1, 3, 5]]);
    const k = rng.int(2, 10);
    const ages = parts.map((p) => p * k);
    const total = ages.reduce((s, x) => s + x, 0);
    if (total % 3 !== 0 || ages[2] > 70 || ages[0] < 3) return null;
    const avg = total / 3;
    const names = pickPeople(rng, 3).map((p) => p.name);
    return emit(ctx, {
      facts: { form: 'avg-ratio', parts, avg },
      prompt: `The ages of ${names.join(', ').replace(/, ([^,]*)$/, ' and $1')} are in the ratio ${parts.join(' : ')}, and their average age is ${yrs(avg)}. How old is the eldest?`,
      answer: ages[2],
      format: yrs,
      mistakes: [
        { value: (avg * parts[2]) / (parts[0] + parts[1] + parts[2]), why: 'split the average instead of the total', trap: `That value splits the average ${avg}; split the total ${3 * avg} (= 3 × ${avg}).` },
        { value: ages[0], why: 'gave the youngest' },
        { value: ages[1], why: 'gave the middle age' },
        { value: avg + parts[2], why: 'added the ratio term to the average' },
      ],
      steps: [`Total age = 3 × ${avg} = ${total}.`, `Parts = ${parts.join(' + ')} = ${parts[0] + parts[1] + parts[2]}; 1 part = ${k}.`, `Eldest = ${parts[2]} × ${k} = ${ages[2]} years.`],
      shortcut: `Eldest = 3 × average × ${parts[2]}/${parts[0] + parts[1] + parts[2]}.`,
      trap: `Convert the average into a total before splitting.`,
      tags: ['ages:average'],
    });
  });
}

function avgBirth(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('avg-birth', 400, () => {
    const n = rng.int(4, 7);
    const y = rng.int(2, 10);
    const ans = rng.int(18, 35);
    // (n avg − n y) / (n − 1) = ans ⇒ avg = (ans (n − 1) + n y) / n
    const avgNum = ans * (n - 1) + n * y;
    if (avgNum % n !== 0) return null;
    const avg = avgNum / n;
    return emit(ctx, {
      facts: { form: 'avg-birth', n, avg, youngest: y },
      prompt: `The average age of a family of ${n} members is ${yrs(avg)}. If the youngest member is ${yrs(y)} old, what was the average age of the family at the time of the birth of the youngest member?`,
      answer: ans,
      format: yrs,
      mistakes: [
        { value: avg - y, why: 'subtracted the youngest age from the average', trap: `${avg - y} years just subtracts ${y} from the average. At the birth there were only ${n - 1} members, each ${y} years younger: (${n} × ${avg} − ${n} × ${y}) ÷ ${n - 1}.` },
        { value: (n * avg - y) / (n - 1), why: 'did not make the others younger' },
        { value: (n * avg - n * y) / n, why: 'divided by n instead of n − 1' },
      ],
      steps: [
        `Total age now = ${n} × ${avg} = ${n * avg}.`,
        `${yrs(y)} ago, each of the other ${n - 1} was ${y} years younger and the youngest was not born: total then = ${n * avg} − ${n} × ${y} = ${n * avg - n * y}.`,
        `Average then = ${n * avg - n * y} ÷ ${n - 1} = ${ans} years.`,
      ],
      shortcut: `Average at birth = (n × avg − n × youngest) ÷ (n − 1).`,
      trap: `There were ${n - 1} members at the birth, and every one of them was ${y} years younger.`,
      tags: ['ages:average', 'ages:birth-of-youngest'],
    });
  });
}

function avgMarriage(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('avg-marriage', 300, () => {
    const avg = rng.int(22, 30);
    const since = rng.int(4, 12);
    const child = rng.int(1, since - 1);
    const total = 2 * (avg + since) + child;
    if (total % 3 !== 0) return null;
    const ans = total / 3;
    const [H] = pickPeople(rng, 1, ['m']);
    return emit(ctx, {
      facts: { form: 'avg-marriage', avg, since, child },
      prompt: `When ${H.name} married ${his(H)} wife ${yrs(since)} ago, the average age of the couple was ${yrs(avg)}. Now they have a child aged ${yrs(child)}. What is the present average age of the family?`,
      answer: ans,
      format: yrs,
      mistakes: [
        { value: (2 * avg + child) / 3, why: 'forgot that the couple aged since the marriage', trap: `That value uses the couple's ages at marriage. Both are ${since} years older now: total = 2 × (${avg} + ${since}) + ${child}.` },
        { value: avg + since, why: "gave the couple's present average" },
        { value: (2 * avg + since + child) / 3, why: 'added the years only once for the couple' },
        { value: (2 * (avg + since) + child) / 2, why: 'divided by 2 instead of 3' },
      ].filter((x) => x.value > 0),
      steps: [`Couple's total at marriage = 2 × ${avg} = ${2 * avg}.`, `Now = ${2 * avg} + 2 × ${since} = ${2 * (avg + since)}; with the child: ${total}.`, `Average = ${total} ÷ 3 = ${ans} years.`],
      shortcut: `Every person present adds 1 year per year to the total.`,
      trap: `Both husband and wife have aged ${since} years since the marriage.`,
      tags: ['ages:average'],
    });
  });
}

function avgSame(ctx: Ctx): Res {
  const { rng } = ctx;
  return attempt('avg-same', 300, () => {
    const n = rng.int(4, 7);
    const since = rng.int(2, 6);
    const child = rng.int(1, since - 1); // born after the earlier date, so younger than the gap
    // (n+1) avg = n (avg + since) + child ⇒ avg = n·since + child
    const avg = n * since + child;
    if (avg > 45 || child >= since * 3) return null;
    return emit(ctx, {
      facts: { form: 'avg-same', n, avg, since },
      prompt: `${yrs(since)} ago, the average age of a family of ${n} members was ${yrs(avg)}. Since then a baby has been born into the family, and the average age of the family today is still ${yrs(avg)}. How old is the baby now?`,
      answer: child,
      format: yrs,
      mistakes: [
        { value: since, why: 'assumed the baby was born right after', trap: `${yrs(since)} is the time elapsed, not the baby's age. Today's total is ${n + 1} × ${avg}; the ${n} older members contribute ${n} × (${avg} + ${since}).` },
        { value: avg - n * since + since, why: 'counted one fewer member ageing' },
        { value: n * since, why: 'gave the total ageing of the family' },
        { value: child + n, why: 'added the member count' },
      ].filter((x) => x.value > 0),
      steps: [
        `Total ${yrs(since)} ago = ${n} × ${avg} = ${n * avg}; today (without the baby) = ${n * avg} + ${n} × ${since} = ${n * avg + n * since}.`,
        `Today with the baby: ${n + 1} × ${avg} = ${(n + 1) * avg}.`,
        `Baby = ${(n + 1) * avg} − ${n * avg + n * since} = ${child} years.`,
      ],
      shortcut: `Baby's age = average − (members × years passed) = ${avg} − ${n} × ${since} = ${child}.`,
      trap: `All ${n} earlier members have aged ${since} years; only the baby is new.`,
      tags: ['ages:average', 'level:multi-step'],
    });
  });
}

function averageAge(ctx: Ctx): Res {
  const { difficulty } = ctx;
  if (difficulty === 'easy') return avgRatio(ctx);
  if (difficulty === 'medium') return avgBirth(ctx);
  if (difficulty === 'hard') return avgMarriage(ctx);
  return avgSame(ctx);
}

/* ------------------------------------------------------------------ */

const BUILDERS: Record<string, (ctx: Ctx) => Res> = {
  'ratio-shift': ratioShift,
  'sum-ratio': sumRatio,
  family,
  'average-age': averageAge,
};

export const generator = defineGenerator<AgesFacts>(META, SUBTYPES, (ctx) => {
  const build = BUILDERS[ctx.subtype.id];
  if (!build) throw new Error(`quant.ages: no builder for ${ctx.subtype.id}`);
  return build(ctx);
});

