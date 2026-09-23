/**
 * quant.mensuration — 2D figures. π = 22/7 with radii in multiples of 7 (or 3.5); lengths are chosen so
 * every answer is whole (or ends in .5).
 */
import type { BuildContext } from '../../types';
import type { MensFacts } from '../mensuration';
import { fracTex, inr, plain } from '../../../../lib/format';
import { type Draft, clean, rupees, unitFmt } from './kit';

type D = Draft<MensFacts>;
type Level = 'easy' | 'medium' | 'hard' | 'extreme';
const PI = 22 / 7;

const TRIPLES: [number, number, number][] = [
  [3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 40, 41], [12, 35, 37],
];

/* ------------------------------ rectangle & square ------------------------------ */

export function rectangle(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const place = rng.pick(['a rectangular plot', 'a rectangular playground', 'a rectangular hall floor', 'a rectangular farm']);
  const m2 = unitFmt('m²');
  const m = unitFmt('m');
  if (level === 'easy') {
    const l = rng.int(12, 60);
    const b = rng.int(6, l - 2);
    const askArea = rng.chance(0.6);
    const area = l * b;
    const per = 2 * (l + b);
    return {
      facts: { form: 'rect', ask: askArea ? 'area' : 'perimeter', given: { l, b } },
      prompt: `The length and breadth of ${place} are ${l} m and ${b} m. Find its ${askArea ? 'area' : 'perimeter'}.`,
      answer: askArea ? area : per,
      fmt: askArea ? m2 : m,
      mistakes: askArea
        ? [
            { value: clean((l * b) / 2), why: 'halved the product (triangle formula)', trap: `½ × l × b is a triangle's area; a rectangle's area is l × b.` },
            { value: (l + 2) * b, why: 'misread the length' },
          ]
        : [
            { value: l + b, why: 'forgot to double (l + b)', trap: `${m(l + b)} is only half the boundary; perimeter = 2(l + b).` },
            { value: 2 * l + b, why: 'counted the breadth once' },
          ],
      steps: askArea ? [`Area = l × b = ${l} × ${b} = ${area} m²`] : [`Perimeter = 2(l + b) = 2 × (${l} + ${b}) = ${per} m`],
      shortcut: askArea ? `Area = l × b.` : `Perimeter = 2(l + b).`,
      trap: askArea ? `Area uses square metres; perimeter uses metres.` : `Go all the way round: 2(l + b).`,
      tags: ['mensuration:rectangle'],
      choice: { step: askArea ? (area >= 500 ? 20 : 5) : 2 },
    };
  }
  if (level === 'medium') {
    const [p, q] = rng.pick([[3, 2], [5, 3], [4, 3], [5, 2], [7, 4], [7, 5], [9, 5], [8, 5]]);
    const k = rng.int(2, 12);
    const P = 2 * (p + q) * k;
    const area = p * q * k * k;
    const wrongK = P / (p + q);
    return {
      facts: { form: 'rect-ratio', ask: 'area', given: { P, p, q } },
      prompt: `The length and breadth of ${place} are in the ratio ${p} : ${q}, and its perimeter is ${P} m. Find its area.`,
      answer: area,
      fmt: m2,
      mistakes: [
        { value: clean(p * q * wrongK * wrongK), why: 'took the perimeter as l + b (forgot to halve it)', trap: `2(l + b) = ${P}, so l + b = ${P / 2}, not ${P}.` },
        { value: clean((P / 4) ** 2), why: 'treated the plot as a square' },
        { value: clean((p + q) * k * k), why: 'added the ratio terms instead of multiplying' },
      ],
      steps: [`l + b = ${P} ÷ 2 = ${P / 2} m`, `l = ${P / 2} × ${p}/${p + q} = ${p * k} m, b = ${q * k} m`, `Area = ${p * k} × ${q * k} = ${area} m²`],
      shortcut: `Let l = ${p}k, b = ${q}k: 2 × ${p + q}k = ${P} → k = ${k}.`,
      trap: `Halve the perimeter to get l + b.`,
      tags: ['mensuration:rectangle'],
      choice: { step: area >= 1000 ? 50 : 10 },
    };
  }
  if (level === 'hard') {
    const [x, y, z] = rng.pick(TRIPLES);
    const k = rng.int(1, 6);
    const [l, b, d] = [x * k, y * k, z * k];
    const giveL = rng.chance(0.5);
    const side = giveL ? l : b;
    const area = l * b;
    return {
      facts: { form: 'rect-diag', ask: 'area', given: { d, side } },
      prompt: `The diagonal of a rectangular field is ${d} m and one of its sides is ${side} m. Find the area of the field.`,
      answer: area,
      fmt: m2,
      mistakes: [
        { value: d * side, why: 'multiplied the diagonal by the side', trap: `The diagonal is not a side; find the other side first: √(${d}² − ${side}²).` },
        { value: clean((d * d) / 2), why: 'used the square formula d²/2' },
        { value: clean((d * side) / 2), why: 'took half of diagonal × side' },
      ],
      steps: [`Other side = √(${d}² − ${side}²) = √${d * d - side * side} = ${giveL ? b : l} m`, `Area = ${l} × ${b} = ${area} m²`],
      shortcut: `Spot the Pythagorean triple ${x}-${y}-${z} (× ${k}).`,
      trap: `d²/2 works only for a square.`,
      tags: ['mensuration:rectangle', 'trick:pythagorean-triple'],
      choice: { step: area >= 1000 ? 50 : 10 },
    };
  }
  const [p, q] = rng.pick([[3, 2], [5, 3], [4, 3], [5, 2], [7, 4], [7, 5]]);
  const k = rng.int(3, 15);
  const P = 2 * (p + q) * k;
  const rate = rng.pick([10, 12, 15, 20, 25, 30, 40, 50]);
  const cost = P * rate;
  const area = p * q * k * k;
  return {
    facts: { form: 'fence-cost', ask: 'area', given: { p, q, rate, cost } },
    prompt: `The length and breadth of ${place} are in the ratio ${p} : ${q}. The cost of fencing it all round at ${inr(rate)} per metre is ${inr(cost)}. Find the area of the ${place.replace('a rectangular ', '')}.`,
    answer: area,
    fmt: m2,
    mistakes: [
      { value: clean(p * q * (P / (p + q)) ** 2), why: 'took the perimeter as l + b', trap: `${inr(cost)} ÷ ${inr(rate)} = ${P} m is the whole perimeter 2(l + b).` },
      { value: P, why: 'gave the perimeter' },
      { value: clean((P / 4) ** 2), why: 'treated the plot as a square' },
    ],
    steps: [`Perimeter = ${inr(cost)} ÷ ${inr(rate)} = ${P} m`, `2(${p}k + ${q}k) = ${P} → k = ${k}`, `Area = ${p * k} × ${q * k} = ${area} m²`],
    shortcut: `Cost ÷ rate = perimeter; then use the ratio.`,
    trap: `Fencing is along the boundary (perimeter), not the area.`,
    tags: ['mensuration:rectangle', 'mensuration:cost'],
    choice: { step: area >= 1000 ? 50 : 10 },
  };
}

/* ------------------------------ circle & semicircle ------------------------------ */

export function circle(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const cm2 = unitFmt('cm²');
  const cm = unitFmt('cm');
  if (level === 'easy') {
    const r = 7 * rng.int(1, 6);
    const askArea = rng.chance(0.5);
    const area = PI * r * r;
    const circ = 2 * PI * r;
    return {
      facts: { form: 'circle', ask: askArea ? 'area' : 'circumference', given: { r } },
      prompt: `Find the ${askArea ? 'area' : 'circumference'} of a circle of radius ${r} cm. (Take π = 22/7.)`,
      answer: askArea ? area : circ,
      fmt: askArea ? cm2 : cm,
      mistakes: askArea
        ? [
            { value: clean(PI * 4 * r * r), why: 'used the diameter as the radius', trap: `πd² uses the diameter; area = πr² with r = ${r}.` },
            { value: clean(area / 2), why: 'halved the area' },
          ]
        : [
            { value: clean(PI * r), why: 'forgot the factor 2', trap: `πr is half the circumference; C = 2πr.` },
            { value: clean(4 * PI * r), why: 'doubled the diameter' },
          ],
      steps: askArea ? [`Area = πr² = ${fracTex(22, 7)} × ${r} × ${r}`, `= ${plain(area)} cm²`] : [`Circumference = 2πr = 2 × ${fracTex(22, 7)} × ${r}`, `= ${plain(circ)} cm`],
      shortcut: askArea ? `πr² with r = 7k is 154k².` : `2πr with r = 7k is 44k.`,
      trap: `Use the radius, not the diameter.`,
      tags: ['mensuration:circle'],
      choice: { step: askArea ? 22 : 11 },
    };
  }
  if (level === 'medium') {
    const r = 7 * rng.int(1, 6);
    const semi = rng.chance(0.6);
    if (semi) {
      const per = PI * r + 2 * r;
      return {
        facts: { form: 'semicircle', ask: 'perimeter', given: { r } },
        prompt: `Find the perimeter of a semicircular flower bed of radius ${r} m. (Take π = 22/7.)`,
        answer: per,
        fmt: unitFmt('m'),
        mistakes: [
          { value: clean(PI * r), why: 'left out the diameter', trap: `The boundary of a semicircle is the curved part πr plus the straight diameter 2r.` },
          { value: clean(2 * PI * r), why: 'took the full circumference' },
          { value: clean(PI * r + r), why: 'added the radius instead of the diameter' },
        ],
        steps: [`Curved part = πr = ${fracTex(22, 7)} × ${r} = ${plain(PI * r)} m`, `Straight part = diameter = ${2 * r} m`, `Perimeter = ${plain(per)} m`],
        shortcut: `Semicircle perimeter = r(π + 2) = ${r} × 36/7.`,
        trap: `Don't forget the diameter.`,
        tags: ['mensuration:semicircle'],
        choice: { step: 6 },
      };
    }
    const C = 2 * PI * r;
    const area = PI * r * r;
    return {
      facts: { form: 'circle-from-c', ask: 'area', given: { C } },
      prompt: `The circumference of a circular park is ${plain(C)} m. Find its area. (Take π = 22/7.)`,
      answer: area,
      fmt: unitFmt('m²'),
      mistakes: [
        { value: clean(PI * 4 * r * r), why: 'took C/π as the radius', trap: `C ÷ π = ${2 * r} m is the diameter; the radius is ${r} m.` },
        { value: clean((C * C) / 4), why: 'squared half the circumference' },
        { value: clean(C * r), why: 'multiplied circumference by radius' },
      ],
      steps: [`2πr = ${plain(C)} → r = ${plain(C)} × 7 ÷ 44 = ${r} m`, `Area = ${fracTex(22, 7)} × ${r}² = ${plain(area)} m²`],
      shortcut: `Area = C²/(4π).`,
      trap: `C = 2πr, so r = C/(2π).`,
      tags: ['mensuration:circle'],
      choice: { step: 22 },
    };
  }
  if (level === 'hard') {
    const d = 7 * rng.pick([2, 4, 6, 8, 10, 12, 14, 20]);
    const circ = PI * d;
    const revs = rng.int(10, 60) * 10;
    const D = (revs * circ) / 100;
    return {
      facts: { form: 'wheel', ask: 'revs', given: { dCm: d, distM: D } },
      prompt: `The diameter of a wheel of a cart is ${d} cm. How many revolutions will it make in covering ${plain(D)} m? (Take π = 22/7.)`,
      answer: revs,
      fmt: unitFmt('revolutions'),
      mistakes: [
        { value: clean((D * 100) / (PI * d / 2)), why: 'used the radius in place of the diameter (πr)', trap: `One revolution covers the circumference πd = ${plain(circ)} cm.` },
        { value: clean((D * 100) / (2 * PI * d)), why: 'used 2πd' },
        { value: clean((D * 10) / circ), why: 'converted metres to centimetres wrongly' },
      ],
      steps: [`Distance per revolution = πd = ${fracTex(22, 7)} × ${d} = ${plain(circ)} cm`, `${plain(D)} m = ${plain(D * 100)} cm`, `Revolutions = ${plain(D * 100)} ÷ ${plain(circ)} = ${revs}`],
      shortcut: `Revolutions = distance ÷ circumference (same units).`,
      trap: `Convert metres to centimetres first.`,
      tags: ['mensuration:circle', 'mensuration:wheel'],
      choice: { step: 10 },
    };
  }
  // extreme: circumference exceeds diameter by x
  const d = 14 * rng.int(1, 6);
  const x = PI * d - d;
  const r = d / 2;
  const area = PI * r * r;
  return {
    facts: { form: 'c-minus-d', ask: 'area', given: { x } },
    prompt: `The circumference of a circle exceeds its diameter by ${plain(x)} cm. Find the area of the circle. (Take π = 22/7.)`,
    answer: area,
    fmt: cm2,
    mistakes: [
      { value: clean(PI * d * d), why: 'used the diameter as the radius', trap: `(π − 1)d = ${plain(x)} gives d = ${d}; the radius is ${r}.` },
      { value: clean(PI * (x / PI) ** 2), why: 'took the excess as the circumference' },
      { value: clean(PI * (d / 2 + 7) ** 2), why: 'added 7 to the radius' },
    ],
    steps: [`πd − d = ${plain(x)} → d × ${fracTex(15, 7)} = ${plain(x)}`, `d = ${d} cm, r = ${r} cm`, `Area = ${fracTex(22, 7)} × ${r}² = ${plain(area)} cm²`],
    shortcut: `(22/7 − 1) = 15/7, so d = 7x/15.`,
    trap: `Find the diameter first, then halve it.`,
    tags: ['mensuration:circle'],
    choice: { step: 22 },
  };
}

/* ------------------------------ triangle ------------------------------ */

const HERON: [number, number, number, number][] = [
  [13, 14, 15, 84], [5, 5, 6, 12], [5, 5, 8, 12], [10, 13, 13, 60], [9, 10, 17, 36], [7, 15, 20, 42],
  [13, 20, 21, 126], [11, 13, 20, 66], [10, 17, 21, 84], [17, 25, 28, 210], [8, 29, 35, 84],
];
const ISO: [number, number, number][] = [
  [10, 13, 60], [16, 10, 48], [12, 10, 48], [14, 25, 168], [30, 17, 120], [18, 15, 108], [24, 13, 60], [40, 25, 300],
];

export function triangle(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const cm2 = unitFmt('cm²');
  if (level === 'easy') {
    const b = rng.int(4, 40);
    const h = rng.int(3, 30) * (b % 2 === 0 ? 1 : 2);
    const area = (b * h) / 2;
    return {
      facts: { form: 'tri-bh', ask: 'area', given: { b, h } },
      prompt: `Find the area of a triangle whose base is ${b} cm and height is ${h} cm.`,
      answer: area,
      fmt: cm2,
      mistakes: [
        { value: b * h, why: 'forgot the ½', trap: `${cm2(b * h)} is the rectangle on the same base and height; a triangle is half of it.` },
        { value: clean((b + h) / 2), why: 'averaged base and height' },
      ],
      steps: [`Area = ½ × base × height`, `= ½ × ${b} × ${h} = ${area} cm²`],
      shortcut: `½ × b × h.`,
      trap: `Remember the half.`,
      tags: ['mensuration:triangle'],
      choice: { step: area >= 100 ? 5 : 1 },
    };
  }
  if (level === 'medium') {
    const [x, y, z] = rng.pick(TRIPLES);
    const k = rng.int(1, 4);
    const [a, b, c] = [x * k, y * k, z * k];
    const area = (a * b) / 2;
    return {
      facts: { form: 'right-tri', ask: 'area', given: { leg: a, hyp: c } },
      prompt: `In a right-angled triangle, the hypotenuse is ${c} cm and one of the other sides is ${a} cm. Find the area of the triangle.`,
      answer: area,
      fmt: cm2,
      mistakes: [
        { value: clean((a * c) / 2), why: 'used the hypotenuse as the height', trap: `The two perpendicular sides are the base and height; the third side is √(${c}² − ${a}²) = ${b}.` },
        { value: a * b, why: 'forgot the ½' },
        { value: a + b + c, why: 'gave the perimeter' },
      ],
      steps: [`Other side = √(${c}² − ${a}²) = ${b} cm`, `Area = ½ × ${a} × ${b} = ${area} cm²`],
      shortcut: `Spot the triple ${x}-${y}-${z}.`,
      trap: `The hypotenuse is not a height.`,
      tags: ['mensuration:triangle', 'trick:pythagorean-triple'],
      choice: { step: area >= 100 ? 5 : 1 },
    };
  }
  if (level === 'hard') {
    const [a, b, c, A] = rng.pick(HERON);
    const k = rng.int(1, 3);
    const area = A * k * k;
    const s = ((a + b + c) * k) / 2;
    return {
      facts: { form: 'tri-sides', ask: 'area', given: { a: a * k, b: b * k, c: c * k } },
      prompt: `Find the area of a triangle whose sides are ${a * k} cm, ${b * k} cm and ${c * k} cm.`,
      answer: area,
      fmt: cm2,
      mistakes: [
        { value: clean((a * k * b * k) / 2), why: 'took ½ × two sides as if it were right-angled', trap: `The triangle is not right-angled; use Heron's formula.` },
        { value: 2 * s, why: 'gave the perimeter' },
        { value: clean(s * s), why: 'squared the semi-perimeter' },
      ],
      steps: [`s = (${a * k} + ${b * k} + ${c * k}) ÷ 2 = ${s}`, `Area = √[s(s − a)(s − b)(s − c)] = √[${s} × ${s - a * k} × ${s - b * k} × ${s - c * k}]`, `= ${area} cm²`],
      shortcut: `Heron's formula; factorise under the root.`,
      trap: `Only a right triangle uses ½ × leg × leg.`,
      tags: ['mensuration:triangle', 'trick:heron'],
      choice: { step: area >= 200 ? 10 : 2 },
    };
  }
  const [base, side, A] = rng.pick(ISO);
  const k = rng.int(1, 3);
  const area = A * k * k;
  return {
    facts: { form: 'tri-sides', ask: 'area', given: { a: side * k, b: side * k, c: base * k } },
    prompt: `The base of an isosceles triangle is ${base * k} cm and each of its equal sides is ${side * k} cm. Find its area.`,
    answer: area,
    fmt: cm2,
    mistakes: [
      { value: clean((base * side * k * k) / 2), why: 'used the equal side as the height', trap: `The slant side is not the height; height = √(${side * k}² − ${(base * k) / 2}²).` },
      { value: clean(base * k * Math.sqrt(side * side - (base / 2) ** 2) * k), why: 'forgot the ½' },
      { value: (2 * side + base) * k, why: 'gave the perimeter' },
    ],
    steps: [`Height = √(${side * k}² − ${(base * k) / 2}²) = ${plain((2 * area) / (base * k))} cm`, `Area = ½ × ${base * k} × ${plain((2 * area) / (base * k))} = ${area} cm²`],
    shortcut: `The height bisects the base of an isosceles triangle.`,
    trap: `Drop the perpendicular to the base first.`,
    tags: ['mensuration:triangle'],
    choice: { step: area >= 200 ? 10 : 2 },
  };
}

/* ------------------------------ trapezium & rhombus ------------------------------ */

export function trapRhombus(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const cm2 = unitFmt('cm²');
  if (level === 'easy' || level === 'hard') {
    const a = rng.int(6, 40);
    const b = rng.int(a + 2, a + 30);
    const h = rng.int(4, 24) * ((a + b) % 2 === 0 ? 1 : 2);
    const area = ((a + b) * h) / 2;
    if (level === 'easy') {
      return {
        facts: { form: 'trapezium', ask: 'area', given: { a, b, h } },
        prompt: `The parallel sides of a trapezium are ${a} cm and ${b} cm, and the distance between them is ${h} cm. Find its area.`,
        answer: area,
        fmt: cm2,
        mistakes: [
          { value: (a + b) * h, why: 'forgot the ½', trap: `Area = ½ × (sum of parallel sides) × height.` },
          { value: clean((b * h) / 2 + a), why: 'mixed up the terms' },
          { value: a * b, why: 'multiplied the parallel sides' },
        ],
        steps: [`Area = ½ × (${a} + ${b}) × ${h}`, `= ${area} cm²`],
        shortcut: `Average of parallel sides × height.`,
        trap: `Remember the half.`,
        tags: ['mensuration:trapezium'],
        choice: { step: area >= 200 ? 10 : 2 },
      };
    }
    return {
      facts: { form: 'trapezium-side', ask: 'b', given: { area, a, h } },
      prompt: `The area of a trapezium is ${area} cm², one of its parallel sides is ${a} cm and the distance between the parallel sides is ${h} cm. Find the other parallel side.`,
      answer: b,
      fmt: unitFmt('cm'),
      mistakes: [
        { value: clean(area / h - a), why: 'forgot to double the area', trap: `½(a + b)h = area → a + b = 2 × area ÷ h = ${(2 * area) / h}.` },
        { value: clean((2 * area) / h), why: 'gave the sum of the parallel sides' },
        { value: clean(area / h), why: 'divided the area by the height only' },
      ],
      steps: [`½ × (${a} + b) × ${h} = ${area}`, `${a} + b = ${(2 * area) / h}`, `b = ${b} cm`],
      shortcut: `a + b = 2A/h.`,
      trap: `Undo the ½ by doubling.`,
      tags: ['mensuration:trapezium'],
      choice: { step: 1 },
    };
  }
  const [x, y, z] = rng.pick(TRIPLES);
  const k = rng.int(1, 3) * 2;
  const [d1, d2, s] = [x * k, y * k, (z * k) / 2];
  if (level === 'medium') {
    const askArea = rng.chance(0.5);
    const area = (d1 * d2) / 2;
    return {
      facts: { form: 'rhombus-diag', ask: askArea ? 'area' : 'perimeter', given: { d1, d2 } },
      prompt: `The diagonals of a rhombus are ${d1} cm and ${d2} cm. Find its ${askArea ? 'area' : 'perimeter'}.`,
      answer: askArea ? area : 4 * s,
      fmt: askArea ? cm2 : unitFmt('cm'),
      mistakes: askArea
        ? [
            { value: d1 * d2, why: 'forgot the ½', trap: `Area of a rhombus = ½ × d₁ × d₂.` },
            { value: clean((d1 * d2) / 4), why: 'took a quarter' },
          ]
        : [
            { value: 2 * (d1 + d2), why: 'added the diagonals as sides', trap: `The side is √((d₁/2)² + (d₂/2)²) = ${s} cm.` },
            { value: d1 + d2, why: 'added the diagonals' },
          ],
      steps: askArea ? [`Area = ½ × ${d1} × ${d2} = ${area} cm²`] : [`Diagonals bisect at right angles: side = √(${d1 / 2}² + ${d2 / 2}²) = ${s} cm`, `Perimeter = 4 × ${s} = ${4 * s} cm`],
      shortcut: askArea ? `½ d₁d₂.` : `Half-diagonals form a right triangle with the side.`,
      trap: askArea ? `Remember the half.` : `Use half of each diagonal.`,
      tags: ['mensuration:rhombus'],
      choice: { step: askArea && area >= 200 ? 10 : 2 },
    };
  }
  const area = (d1 * d2) / 2;
  return {
    facts: { form: 'rhombus-side', ask: 'area', given: { s, d1 } },
    prompt: `Each side of a rhombus is ${s} cm and one of its diagonals is ${d1} cm. Find the area of the rhombus.`,
    answer: area,
    fmt: cm2,
    mistakes: [
      { value: clean((s * d1) / 2), why: 'used the side as the other diagonal', trap: `The other diagonal is 2 × √(${s}² − ${d1 / 2}²) = ${d2} cm.` },
      { value: clean((d1 * d2) / 4), why: 'used half the second diagonal' },
      { value: s * s, why: 'treated it as a square' },
    ],
    steps: [`Half of the other diagonal = √(${s}² − ${d1 / 2}²) = ${d2 / 2} cm → diagonal = ${d2} cm`, `Area = ½ × ${d1} × ${d2} = ${area} cm²`],
    shortcut: `Half-diagonals and the side form a right triangle.`,
    trap: `Double the half-diagonal.`,
    tags: ['mensuration:rhombus', 'trick:pythagorean-triple'],
    choice: { step: area >= 200 ? 10 : 2 },
  };
}

/* ------------------------------ path around / inside a field ------------------------------ */

export function path(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const m2 = unitFmt('m²');
  if (level === 'extreme') {
    const r = 7 * rng.int(2, 8);
    const w = rng.pick([3.5, 7]);
    const rate = rng.pick([4, 6, 8, 10, 12, 20]);
    const area = PI * ((r + w) ** 2 - r * r);
    const cost = area * rate;
    return {
      facts: { form: 'ring', ask: 'cost', given: { r, w, rate } },
      prompt: `A circular garden of radius ${r} m has a path ${plain(w)} m wide running around it on the outside. Find the cost of paving the path at ${inr(rate)} per m². (Take π = 22/7.)`,
      answer: cost,
      fmt: rupees,
      mistakes: [
        { value: clean(PI * w * w * rate), why: 'used the path width as a radius', trap: `Path area = π(R² − r²) with R = ${plain(r + w)} m, not πw².` },
        { value: clean(2 * PI * r * w * rate), why: 'dropped the w² term' },
        { value: clean(PI * (r + w) ** 2 * rate), why: 'paved the whole outer circle' },
      ],
      steps: [`Outer radius = ${r} + ${plain(w)} = ${plain(r + w)} m`, `Path area = ${fracTex(22, 7)} × (${plain(r + w)}² − ${r}²) = ${plain(area)} m²`, `Cost = ${plain(area)} × ${rate} = ${inr(cost)}`],
      shortcut: `π(R² − r²) = π(R + r)(R − r).`,
      trap: `Subtract the garden from the outer circle.`,
      tags: ['mensuration:path', 'mensuration:circle', 'mensuration:cost'],
      choice: { step: cost >= 5000 ? 200 : 50 },
    };
  }
  const l = rng.int(20, 90);
  const b = rng.int(12, l - 4);
  const w = rng.int(1, 5);
  if (level === 'easy' || level === 'medium') {
    const inside = level === 'medium' && rng.chance(0.5);
    const area = inside ? l * b - (l - 2 * w) * (b - 2 * w) : (l + 2 * w) * (b + 2 * w) - l * b;
    const withCost = level === 'medium' && !inside;
    const rate = rng.pick([5, 8, 10, 12, 15, 20]);
    const naive = 2 * w * (l + b);
    return {
      facts: { form: 'rect-path', ask: withCost ? 'cost' : 'area', given: { l, b, w, inside: inside ? 1 : 0, rate: withCost ? rate : 0 } },
      prompt: `A rectangular lawn is ${l} m long and ${b} m wide. A path ${w} m wide runs all round it ${inside ? 'on the inside' : 'on the outside'}. ${
        withCost ? `Find the cost of gravelling the path at ${inr(rate)} per m².` : 'Find the area of the path.'
      }`,
      answer: withCost ? area * rate : area,
      fmt: withCost ? rupees : m2,
      mistakes: [
        { value: withCost ? naive * rate : naive, why: 'forgot the four corner squares', trap: `2w(l + b) ${inside ? 'double-counts' : 'misses'} the four ${w} m × ${w} m corners.` },
        { value: withCost ? clean(w * (l + b) * rate) : w * (l + b), why: 'counted only two sides' },
        { value: withCost ? (l + 2 * w) * (b + 2 * w) * rate : (l + 2 * w) * (b + 2 * w), why: 'took the outer rectangle' },
      ],
      steps: inside
        ? [`Inner rectangle = (${l} − ${2 * w}) × (${b} − ${2 * w}) = ${(l - 2 * w) * (b - 2 * w)} m²`, `Path = ${l * b} − ${(l - 2 * w) * (b - 2 * w)} = ${area} m²`]
        : [`Outer rectangle = (${l} + ${2 * w}) × (${b} + ${2 * w}) = ${(l + 2 * w) * (b + 2 * w)} m²`, `Path = ${(l + 2 * w) * (b + 2 * w)} − ${l * b} = ${area} m²`, ...(withCost ? [`Cost = ${area} × ${rate} = ${inr(area * rate)}`] : [])],
      shortcut: inside ? `Path inside = 2w(l + b − 2w).` : `Path outside = 2w(l + b + 2w).`,
      trap: `Mind the corners.`,
      tags: ['mensuration:path'],
      choice: { step: withCost ? 100 : 10 },
    };
  }
  const rate = rng.pick([5, 8, 10, 12, 15, 20, 25]);
  const area = w * l + w * b - w * w;
  const askCost = rng.chance(0.5);
  return {
    facts: { form: 'cross-roads', ask: askCost ? 'cost' : 'area', given: { l, b, w, rate: askCost ? rate : 0 } },
    prompt: `A rectangular park ${l} m long and ${b} m wide has two roads, each ${w} m wide, running through the middle — one parallel to the length and the other parallel to the breadth. ${askCost ? `Find the cost of laying the roads at ${inr(rate)} per m².` : 'Find the total area of the roads.'}`,
    answer: askCost ? area * rate : area,
    fmt: askCost ? rupees : m2,
    mistakes: [
      { value: askCost ? (w * l + w * b) * rate : w * l + w * b, why: 'counted the crossing square twice', trap: `The ${w} m × ${w} m square where the roads cross belongs to both roads; subtract it once.` },
      { value: askCost ? (w * l + w * b + w * w) * rate : w * l + w * b + w * w, why: 'added the crossing square' },
      { value: askCost ? 2 * w * (l + b) * rate : 2 * w * (l + b), why: 'used the path-around formula' },
    ],
    steps: [`Road along the length = ${l} × ${w} = ${l * w} m²; along the breadth = ${b} × ${w} = ${b * w} m²`, `Common square = ${w} × ${w} = ${w * w} m²`, `Roads = ${l * w} + ${b * w} − ${w * w} = ${area} m²${askCost ? `; cost = ${inr(area * rate)}` : ''}`],
    shortcut: `w(l + b − w).`,
    trap: `Subtract the overlap once.`,
    tags: ['mensuration:path'],
    choice: { step: askCost ? 100 : 5 },
  };
}

/* ------------------------------ % change in area ------------------------------ */

const pctChange = (v: number) => (v === 0 ? 'no change' : `${plain(Math.abs(v))}% ${v > 0 ? 'increase' : 'decrease'}`);

export function areaChange(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  if (level === 'easy') {
    const x = rng.pick([10, 20, 25, 30, 40, 50]);
    const ans = ((100 + x) ** 2 - 10000) / 100;
    return {
      facts: { form: 'scale', ask: 'pct', given: { dims: 2, x, y: x } },
      prompt: `Each side of a square is increased by ${x}%. By what percentage does its area increase?`,
      answer: ans,
      fmt: pctChange,
      mistakes: [
        { value: 2 * x, why: 'doubled the percentage', trap: `${2 * x}% misses the x²/100 term: ${x} + ${x} + ${x}×${x}/100 = ${plain(ans)}%.` },
        { value: x, why: 'assumed area changes like the side' },
        { value: clean((x * x) / 100, 2), why: 'kept only x²/100' },
      ],
      steps: [`New side = ${(100 + x) / 100} × old side`, `New area = ${plain(((100 + x) / 100) ** 2)} × old area`, `Increase = ${plain(ans)}%`],
      shortcut: `Successive change: x + x + x²/100.`,
      trap: `Percentages on length compound for area.`,
      tags: ['mensuration:percent-change', 'trick:successive-percent'],
      choice: { step: 1, allowNegative: true },
    };
  }
  if (level === 'medium') {
    const x = rng.pick([10, 20, 25, 30, 40, 50]);
    const y = rng.pick([10, 20, 25, 30, 40]);
    const ans = (100 + x) * (100 - y) / 100 - 100;
    if (ans === 0) return areaChange(ctx, 'easy');
    return {
      facts: { form: 'scale', ask: 'pct', given: { dims: 2, x, y: -y } },
      prompt: `The length of a rectangle is increased by ${x}% and its breadth is decreased by ${y}%. What is the percentage change in its area?`,
      answer: ans,
      fmt: pctChange,
      mistakes: [
        { value: x - y === 0 ? NaN : x - y, why: 'subtracted the percentages', trap: `Net effect = x − y − xy/100 = ${x} − ${y} − ${(x * y) / 100} = ${plain(ans)}%.` },
        { value: x - y + (x * y) / 100, why: 'added the product term instead of subtracting' },
        { value: -(x * y) / 100, why: 'kept only the product term' },
      ],
      steps: [`Area factor = ${(100 + x) / 100} × ${(100 - y) / 100} = ${plain(((100 + x) * (100 - y)) / 10000, 4)}`, `Change = ${pctChange(ans)}`],
      shortcut: `x + (−y) + x(−y)/100.`,
      trap: `The cross term xy/100 matters.`,
      tags: ['mensuration:percent-change', 'trick:successive-percent'],
      choice: { step: 1, allowNegative: true },
    };
  }
  if (level === 'hard') {
    const x = rng.pick([25, 50, 100, 60, 150]);
    const ans = -(100 * x) / (100 + x);
    return {
      facts: { form: 'keep-area', ask: 'pct', given: { x } },
      prompt: `The length of a rectangle is increased by ${x}%. By what percentage must its breadth be decreased so that the area remains the same?`,
      answer: ans,
      fmt: pctChange,
      mistakes: [
        { value: -x, why: 'decreased by the same percentage', trap: `A ${x}% decrease on the larger base does not undo a ${x}% increase; breadth must fall by x/(100 + x) × 100.` },
        { value: clean(-(x * x) / (100 + x), 2), why: 'used x²/(100 + x)' },
        { value: clean(-x / 2, 2), why: 'halved the increase' },
      ],
      steps: [`New length = ${(100 + x) / 100} × l, so breadth must be multiplied by ${fracTex(100, 100 + x)}`, `Decrease = ${fracTex(x, 100 + x)} × 100 = ${plain(-ans)}%`],
      shortcut: `x/(100 + x) × 100.`,
      trap: `Compensating change uses the new base.`,
      tags: ['mensuration:percent-change'],
      choice: { step: 5, allowNegative: true },
    };
  }
  const x = rng.pick([10, 20, 50]);
  const ans = ((100 + x) ** 3 - 1e6) / 1e4;
  return {
    facts: { form: 'scale', ask: 'pct', given: { dims: 3, x, y: x } },
    prompt: `Each edge of a cube is increased by ${x}%. By what percentage does its volume increase?`,
    answer: ans,
    fmt: pctChange,
    mistakes: [
      { value: 3 * x, why: 'tripled the percentage', trap: `Volume factor is (1 + ${x}/100)³, not 1 + 3 × ${x}/100.` },
      { value: ((100 + x) ** 2 - 10000) / 100, why: 'used the area rule' },
      { value: clean(3 * x + (3 * x * x) / 100, 2), why: 'left out the x³ term' },
    ],
    steps: [`Volume factor = (${(100 + x) / 100})³ = ${plain(((100 + x) / 100) ** 3, 4)}`, `Increase = ${plain(ans)}%`],
    shortcut: `Apply successive percentage three times.`,
    trap: `Cube the growth factor.`,
    tags: ['mensuration:percent-change', 'trick:successive-percent'],
    choice: { step: 5, allowNegative: true },
  };
}
