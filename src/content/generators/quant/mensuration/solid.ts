/**
 * quant.mensuration — 3D solids, melting & recasting, water-level rise, painting cost.
 * π = 22/7 with radii in multiples of 7 (or 3.5/10.5 where a volume needs it).
 */
import type { BuildContext } from '../../types';
import type { MensFacts } from '../mensuration';
import { fracTex, inr, plain } from '../../../../lib/format';
import { type Draft, clean, rupees, unitFmt } from './kit';

type D = Draft<MensFacts>;
type Level = 'easy' | 'medium' | 'hard' | 'extreme';
const PI = 22 / 7;
const PI_TEX = fracTex(22, 7);

/* ------------------------------ cube & cuboid ------------------------------ */

const DIAG: [number, number, number, number][] = [
  [1, 2, 2, 3], [2, 3, 6, 7], [1, 4, 8, 9], [2, 6, 9, 11], [3, 4, 12, 13], [4, 4, 7, 9], [6, 6, 7, 11], [2, 10, 11, 15], [4, 8, 19, 21], [8, 9, 12, 17],
];

export function cuboid(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  if (level === 'easy') {
    if (rng.chance(0.5)) {
      const [l, b, h] = [rng.int(5, 30), rng.int(4, 20), rng.int(3, 15)];
      const V = l * b * h;
      return {
        facts: { form: 'cuboid', ask: 'volume', given: { l, b, h } },
        prompt: `Find the volume of a cuboidal box ${l} cm long, ${b} cm wide and ${h} cm high.`,
        answer: V,
        fmt: unitFmt('cm³'),
        mistakes: [
          { value: 2 * (l * b + b * h + h * l), why: 'found the total surface area', trap: `That is the surface area (cm²); volume = l × b × h.` },
          { value: l * b + b * h + h * l, why: 'added the face areas' },
          { value: clean(V / 2), why: 'halved the volume' },
        ],
        steps: [`Volume = l × b × h = ${l} × ${b} × ${h} = ${V} cm³`],
        shortcut: `l × b × h.`,
        trap: `Volume is cubic units.`,
        tags: ['mensuration:cuboid'],
        choice: { step: V >= 1000 ? 50 : 10 },
      };
    }
    const a = rng.int(3, 25);
    return {
      facts: { form: 'cube', ask: 'tsa', given: { a } },
      prompt: `Find the total surface area of a cube of edge ${a} cm.`,
      answer: 6 * a * a,
      fmt: unitFmt('cm²'),
      mistakes: [
        { value: 4 * a * a, why: 'counted only four faces (lateral surface)', trap: `A cube has 6 equal faces; 4a² is the lateral surface only.` },
        { value: a * a * a, why: 'gave the volume' },
        { value: 12 * a, why: 'added the edges' },
      ],
      steps: [`TSA = 6a² = 6 × ${a}² = ${6 * a * a} cm²`],
      shortcut: `6a².`,
      trap: `Six faces, not four.`,
      tags: ['mensuration:cube'],
      choice: { step: 6 },
    };
  }
  if (level === 'medium') {
    if (rng.chance(0.5)) {
      const [l, b, h] = [rng.int(6, 30), rng.int(4, 20), rng.int(3, 15)];
      const T = 2 * (l * b + b * h + h * l);
      return {
        facts: { form: 'cuboid', ask: 'tsa', given: { l, b, h } },
        prompt: `Find the total surface area of a cuboid ${l} cm long, ${b} cm wide and ${h} cm high.`,
        answer: T,
        fmt: unitFmt('cm²'),
        mistakes: [
          { value: T / 2, why: 'forgot the factor 2', trap: `Each face has an equal opposite face: 2(lb + bh + hl).` },
          { value: 2 * h * (l + b), why: 'gave the lateral surface (four walls)' },
          { value: l * b * h, why: 'gave the volume' },
        ],
        steps: [`TSA = 2(lb + bh + hl) = 2(${l * b} + ${b * h} + ${h * l})`, `= ${T} cm²`],
        shortcut: `2(lb + bh + hl).`,
        trap: `Count opposite faces too.`,
        tags: ['mensuration:cuboid'],
        choice: { step: 10 },
      };
    }
    const [x, y, z, d] = rng.pick(DIAG);
    const k = rng.int(1, 4);
    return {
      facts: { form: 'cuboid-diag', ask: 'diag', given: { l: z * k, b: y * k, h: x * k } },
      prompt: `Find the length of the longest rod that can be placed in a room ${z * k} m long, ${y * k} m wide and ${x * k} m high.`,
      answer: d * k,
      fmt: unitFmt('m'),
      mistakes: [
        { value: (x + y + z) * k, why: 'added the three dimensions', trap: `The longest rod lies along the space diagonal √(l² + b² + h²).` },
        { value: clean(Math.sqrt(y * y + z * z) * k, 2), why: 'used the floor diagonal only' },
        { value: z * k, why: 'gave the length of the room' },
      ],
      steps: [`Diagonal = √(${z * k}² + ${y * k}² + ${x * k}²) = √${d * d * k * k}`, `= ${d * k} m`],
      shortcut: `√(l² + b² + h²).`,
      trap: `Use the space diagonal, not the floor diagonal.`,
      tags: ['mensuration:cuboid'],
      choice: { step: 1 },
    };
  }
  if (level === 'hard') {
    const a = rng.int(2, 6);
    const [L, B, H] = [a * rng.int(3, 10), a * rng.int(2, 8), a * rng.int(2, 6)];
    const n = (L * B * H) / (a * a * a);
    return {
      facts: { form: 'cut-cubes', ask: 'count', given: { L, B, H, a } },
      prompt: `How many cubes of edge ${a} cm can be cut from a cuboid measuring ${L} cm × ${B} cm × ${H} cm?`,
      answer: n,
      fmt: (v) => String(v),
      mistakes: [
        { value: clean((L * B * H) / (a * a)), why: 'divided by a² instead of a³', trap: `Divide volumes: each small cube has volume ${a}³ = ${a ** 3} cm³.` },
        { value: clean((L * B * H) / (3 * a)), why: 'divided by 3a' },
        { value: clean((L / a) * (B / a)), why: 'counted one layer only' },
      ],
      steps: [`Along each edge: ${L / a} × ${B / a} × ${H / a}`, `Number of cubes = ${n}`],
      shortcut: `Cuboid volume ÷ cube volume (edges divide exactly).`,
      trap: `Use a³, not a².`,
      tags: ['mensuration:cuboid', 'mensuration:recast'],
      choice: { step: n >= 100 ? 10 : 2 },
    };
  }
  const [l, b, h] = [rng.int(2, 15), rng.int(2, 15), rng.int(2, 15)];
  const [p, q, r] = [l * b, b * h, h * l];
  const V = l * b * h;
  return {
    facts: { form: 'faces', ask: 'volume', given: { p, q, r } },
    prompt: `The areas of three adjacent faces of a cuboid are ${p} cm², ${q} cm² and ${r} cm². Find its volume.`,
    answer: V,
    fmt: unitFmt('cm³'),
    mistakes: [
      { value: p * q * r > 1e6 ? NaN : p * q * r, why: 'multiplied the areas without the square root', trap: `(lb)(bh)(hl) = (lbh)², so take the square root.` },
      { value: clean((p + q + r) * 2), why: 'gave the surface area' },
      { value: clean(Math.cbrt(p * q * r), 2), why: 'took the cube root' },
    ],
    steps: [`(lb)(bh)(hl) = (lbh)² = ${p} × ${q} × ${r} = ${p * q * r}`, `Volume = √${p * q * r} = ${V} cm³`],
    shortcut: `V = √(product of the three face areas).`,
    trap: `Square root, not cube root.`,
    tags: ['mensuration:cuboid'],
    choice: { step: V >= 500 ? 20 : 5 },
  };
}

/* ------------------------------ cylinder & cone ------------------------------ */

const CONE: [number, number, number][] = [
  [7, 24, 25], [21, 20, 29], [14, 48, 50], [28, 21, 35], [35, 12, 37], [21, 28, 35], [42, 40, 58],
];

export function cylinderCone(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const cm3 = unitFmt('cm³');
  const cm2 = unitFmt('cm²');
  if (level === 'easy') {
    const r = 7 * rng.int(1, 4);
    const h = rng.int(3, 30);
    const V = PI * r * r * h;
    return {
      facts: { form: 'cylinder', ask: 'volume', given: { r, h } },
      prompt: `Find the volume of a cylindrical drum of radius ${r} cm and height ${h} cm. (Take π = 22/7.)`,
      answer: V,
      fmt: cm3,
      mistakes: [
        { value: clean(2 * PI * r * h), why: 'found the curved surface area', trap: `2πrh is the curved surface; volume = πr²h.` },
        { value: clean(V / 3), why: 'used the cone formula' },
        { value: clean(PI * 4 * r * r * h), why: 'used the diameter as the radius' },
      ],
      steps: [`V = πr²h = ${PI_TEX} × ${r}² × ${h}`, `= ${plain(V)} cm³`],
      shortcut: `πr² with r = 7k is 154k²; multiply by h.`,
      trap: `Square the radius.`,
      tags: ['mensuration:cylinder'],
      choice: { step: V >= 5000 ? 154 : 22 },
    };
  }
  if (level === 'medium') {
    const r = 7 * rng.int(1, 4);
    if (rng.chance(0.5)) {
      const h = rng.int(4, 30);
      const tsa = rng.chance(0.5);
      const ans = tsa ? 2 * PI * r * (r + h) : 2 * PI * r * h;
      return {
        facts: { form: 'cylinder', ask: tsa ? 'tsa' : 'csa', given: { r, h } },
        prompt: `Find the ${tsa ? 'total' : 'curved'} surface area of a closed cylinder of radius ${r} cm and height ${h} cm. (Take π = 22/7.)`,
        answer: ans,
        fmt: cm2,
        mistakes: tsa
          ? [
              { value: clean(2 * PI * r * h), why: 'left out the two ends', trap: `Total surface = curved surface + 2 circular ends.` },
              { value: clean(2 * PI * r * h + PI * r * r), why: 'added only one end' },
            ]
          : [
              { value: clean(2 * PI * r * (r + h)), why: 'added the ends', trap: `Curved surface excludes the two circular ends.` },
              { value: clean(PI * r * h), why: 'forgot the factor 2' },
            ],
        steps: tsa ? [`TSA = 2πr(r + h) = 2 × ${PI_TEX} × ${r} × ${r + h}`, `= ${plain(ans)} cm²`] : [`CSA = 2πrh = 2 × ${PI_TEX} × ${r} × ${h}`, `= ${plain(ans)} cm²`],
        shortcut: tsa ? `2πr(r + h).` : `2πrh.`,
        trap: tsa ? `Include both ends.` : `Curved surface only.`,
        tags: ['mensuration:cylinder'],
        choice: { step: 44 },
      };
    }
    const h = 3 * rng.int(2, 10);
    const V = (PI * r * r * h) / 3;
    return {
      facts: { form: 'cone', ask: 'volume', given: { r, h } },
      prompt: `Find the volume of a conical tent of base radius ${r} m and height ${h} m. (Take π = 22/7.)`,
      answer: V,
      fmt: unitFmt('m³'),
      mistakes: [
        { value: clean(PI * r * r * h), why: 'forgot the one-third', trap: `A cone holds one-third of the cylinder with the same base and height.` },
        { value: clean(V / 2), why: 'used one-sixth' },
        { value: clean((2 * PI * r * r * h) / 3), why: 'used the hemisphere-style 2/3' },
      ],
      steps: [`V = ⅓πr²h = ⅓ × ${PI_TEX} × ${r}² × ${h}`, `= ${plain(V)} m³`],
      shortcut: `⅓ × (154k²) × h for r = 7k.`,
      trap: `Remember the ⅓.`,
      tags: ['mensuration:cone'],
      choice: { step: V >= 2000 ? 154 : 22 },
    };
  }
  if (level === 'hard') {
    const [r, h, l] = rng.pick(CONE);
    const tsa = rng.chance(0.5);
    const ans = tsa ? PI * r * (l + r) : PI * r * l;
    return {
      facts: { form: 'cone-hl', ask: tsa ? 'tsa' : 'csa', given: { r, h } },
      prompt: `A cone has base radius ${r} cm and height ${h} cm. Find its ${tsa ? 'total' : 'curved'} surface area. (Take π = 22/7.)`,
      answer: ans,
      fmt: cm2,
      mistakes: [
        { value: clean(tsa ? PI * r * (h + r) : PI * r * h), why: 'used the height instead of the slant height', trap: `Surface area uses the slant height l = √(${r}² + ${h}²) = ${l} cm.` },
        { value: clean(tsa ? PI * r * l : PI * r * (l + r)), why: tsa ? 'left out the base' : 'added the base' },
        { value: clean(2 * PI * r * l), why: 'doubled the curved surface' },
      ],
      steps: [`Slant height l = √(${r}² + ${h}²) = ${l} cm`, tsa ? `TSA = πr(l + r) = ${PI_TEX} × ${r} × ${l + r} = ${plain(ans)} cm²` : `CSA = πrl = ${PI_TEX} × ${r} × ${l} = ${plain(ans)} cm²`],
      shortcut: `Spot the triple, then πrl.`,
      trap: `Use the slant height, not the vertical height.`,
      tags: ['mensuration:cone', 'trick:pythagorean-triple'],
      choice: { step: 22 },
    };
  }
  const a = rng.int(2, 6);
  const b = rng.int(1, a - 1);
  const [R, r] = [7 * a, 7 * b];
  const h = rng.int(5, 40);
  const V = PI * (R * R - r * r) * h;
  return {
    facts: { form: 'hollow', ask: 'volume', given: { R, r, h } },
    prompt: `A hollow iron pipe is ${h} cm long. Its external radius is ${R} cm and internal radius is ${r} cm. Find the volume of iron in the pipe. (Take π = 22/7.)`,
    answer: V,
    fmt: cm3,
    mistakes: [
      { value: clean(PI * (R - r) ** 2 * h), why: 'squared the thickness', trap: `Iron = π(R² − r²)h, not π(R − r)²h.` },
      { value: clean(PI * R * R * h), why: 'took the solid outer cylinder' },
      { value: clean(PI * r * r * h), why: 'took the hollow part' },
    ],
    steps: [`Volume = π(R² − r²)h = ${PI_TEX} × (${R}² − ${r}²) × ${h}`, `= ${PI_TEX} × ${R * R - r * r} × ${h} = ${plain(V)} cm³`],
    shortcut: `R² − r² = (R + r)(R − r).`,
    trap: `Subtract squares, not radii.`,
    tags: ['mensuration:cylinder'],
    choice: { step: V >= 5000 ? 154 : 22 },
  };
}

/* ------------------------------ sphere & hemisphere ------------------------------ */

const R_VOL = [10.5, 21, 31.5, 42];

export function sphere(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const cm2 = unitFmt('cm²');
  const cm3 = unitFmt('cm³');
  if (level === 'easy') {
    const r = 7 * rng.int(1, 5);
    const S = 4 * PI * r * r;
    return {
      facts: { form: 'sphere', ask: 'surface', given: { r } },
      prompt: `Find the surface area of a sphere of radius ${r} cm. (Take π = 22/7.)`,
      answer: S,
      fmt: cm2,
      mistakes: [
        { value: clean(PI * r * r), why: 'used πr²', trap: `A sphere's surface is 4πr², four times the area of its great circle.` },
        { value: clean(2 * PI * r * r), why: 'gave the hemisphere curved surface' },
        { value: clean(3 * PI * r * r), why: 'gave the hemisphere total surface' },
      ],
      steps: [`S = 4πr² = 4 × ${PI_TEX} × ${r}²`, `= ${plain(S)} cm²`],
      shortcut: `4πr² = 616k² for r = 7k.`,
      trap: `Four great circles, not one.`,
      tags: ['mensuration:sphere'],
      choice: { step: 88 },
    };
  }
  if (level === 'medium') {
    if (rng.chance(0.5)) {
      const r = rng.pick(R_VOL);
      const V = (4 / 3) * PI * r ** 3;
      return {
        facts: { form: 'sphere', ask: 'volume', given: { r } },
        prompt: `Find the volume of a spherical ball of radius ${plain(r)} cm. (Take π = 22/7.)`,
        answer: V,
        fmt: cm3,
        mistakes: [
          { value: clean(PI * r ** 3, 2), why: 'forgot the 4/3', trap: `V = (4/3)πr³.` },
          { value: clean((2 / 3) * PI * r ** 3, 2), why: 'gave the hemisphere volume' },
          { value: clean(4 * PI * r * r, 2), why: 'gave the surface area' },
        ],
        steps: [`V = ⁴⁄₃πr³ = ⁴⁄₃ × ${PI_TEX} × ${plain(r)}³`, `= ${plain(V)} cm³`],
        shortcut: `Cancel 7s and 3s before multiplying.`,
        trap: `Cube the radius.`,
        tags: ['mensuration:sphere'],
        choice: { step: V >= 10000 ? 1000 : 100 },
      };
    }
    const r = 7 * rng.int(1, 5);
    const C = 2 * PI * r * r;
    return {
      facts: { form: 'hemisphere', ask: 'csa', given: { r } },
      prompt: `Find the curved surface area of a hemispherical bowl of radius ${r} cm. (Take π = 22/7.)`,
      answer: C,
      fmt: cm2,
      mistakes: [
        { value: clean(3 * PI * r * r), why: 'included the flat top', trap: `The curved surface is 2πr²; 3πr² adds the flat circle.` },
        { value: clean(4 * PI * r * r), why: 'took the whole sphere' },
        { value: clean(PI * r * r), why: 'took only the flat circle' },
      ],
      steps: [`CSA = 2πr² = 2 × ${PI_TEX} × ${r}²`, `= ${plain(C)} cm²`],
      shortcut: `Half of 4πr².`,
      trap: `Curved surface only.`,
      tags: ['mensuration:hemisphere'],
      choice: { step: 44 },
    };
  }
  if (level === 'hard') {
    if (rng.chance(0.5)) {
      const r = 7 * rng.int(1, 5);
      const T = 3 * PI * r * r;
      return {
        facts: { form: 'hemisphere', ask: 'tsa', given: { r } },
        prompt: `Find the total surface area of a solid hemisphere of radius ${r} cm. (Take π = 22/7.)`,
        answer: T,
        fmt: cm2,
        mistakes: [
          { value: clean(2 * PI * r * r), why: 'left out the flat face', trap: `A solid hemisphere also has a flat circular face: 2πr² + πr² = 3πr².` },
          { value: clean(4 * PI * r * r), why: 'took the whole sphere' },
          { value: clean(2.5 * PI * r * r), why: 'added half the flat face' },
        ],
        steps: [`TSA = 2πr² + πr² = 3πr²`, `= 3 × ${PI_TEX} × ${r}² = ${plain(T)} cm²`],
        shortcut: `3πr².`,
        trap: `Include the flat face.`,
        tags: ['mensuration:hemisphere'],
        choice: { step: 66 },
      };
    }
    const r = rng.pick(R_VOL);
    const V = (2 / 3) * PI * r ** 3;
    return {
      facts: { form: 'hemisphere', ask: 'volume', given: { r } },
      prompt: `Find the volume of a hemispherical bowl of radius ${plain(r)} cm. (Take π = 22/7.)`,
      answer: V,
      fmt: cm3,
      mistakes: [
        { value: clean((4 / 3) * PI * r ** 3, 2), why: 'took the whole sphere', trap: `A hemisphere is half a sphere: ⅔πr³.` },
        { value: clean((1 / 3) * PI * r ** 3, 2), why: 'used one-third' },
        { value: clean(2 * PI * r * r, 2), why: 'gave the curved surface' },
      ],
      steps: [`V = ⅔πr³ = ⅔ × ${PI_TEX} × ${plain(r)}³`, `= ${plain(V)} cm³`],
      shortcut: `Half the sphere volume.`,
      trap: `Halve (4/3)πr³.`,
      tags: ['mensuration:hemisphere'],
      choice: { step: V >= 10000 ? 500 : 50 },
    };
  }
  const r = rng.pick(R_VOL);
  const S = 4 * PI * r * r;
  const V = (4 / 3) * PI * r ** 3;
  return {
    facts: { form: 'sphere-from-s', ask: 'volume', given: { S } },
    prompt: `The surface area of a sphere is ${plain(S)} cm². Find its volume. (Take π = 22/7.)`,
    answer: V,
    fmt: cm3,
    mistakes: [
      { value: clean((4 / 3) * PI * (2 * r) ** 3, 2), why: 'took the diameter as the radius', trap: `4πr² = ${plain(S)} gives r = ${plain(r)} cm; don't double it.` },
      { value: clean((S * r) / 2, 2), why: 'used S × r/2' },
      { value: clean((2 / 3) * PI * r ** 3, 2), why: 'gave the hemisphere volume' },
    ],
    steps: [`4πr² = ${plain(S)} → r² = ${plain(r * r)} → r = ${plain(r)} cm`, `V = ⁴⁄₃ × ${PI_TEX} × ${plain(r)}³ = ${plain(V)} cm³`],
    shortcut: `V = S × r/3.`,
    trap: `Find r from the surface area first.`,
    tags: ['mensuration:sphere'],
    choice: { step: V >= 10000 ? 1000 : 100 },
  };
}

/* ------------------------------ melting & recasting ------------------------------ */

const CUBE_SUMS: [number, number, number, number][] = [
  [3, 4, 5, 6], [1, 6, 8, 9], [6, 8, 10, 12], [2, 12, 16, 18], [9, 12, 15, 18],
];

export function meltRecast(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  if (level === 'easy') {
    const b = rng.int(1, 5);
    const m = rng.int(2, 6);
    const a = b * m;
    return {
      facts: { form: 'cube-to-cubes', ask: 'count', given: { a, b } },
      prompt: `A solid metal cube of edge ${a} cm is melted and recast into small cubes of edge ${b} cm. How many small cubes are formed?`,
      answer: m ** 3,
      fmt: (v) => String(v),
      mistakes: [
        { value: m * m, why: 'compared areas instead of volumes', trap: `Volumes decide: (${a}/${b})³ = ${m}³.` },
        { value: m, why: 'compared edges' },
        { value: 6 * m * m, why: 'compared surface areas' },
      ],
      steps: [`Number = (big volume) ÷ (small volume) = ${a}³ ÷ ${b}³`, `= ${m}³ = ${m ** 3}`],
      shortcut: `(${a}/${b})³.`,
      trap: `Cube the ratio of edges.`,
      tags: ['mensuration:recast'],
      choice: { step: m ** 3 >= 50 ? 5 : 1 },
    };
  }
  if (level === 'medium') {
    const r = rng.pick([1, 2, 3, 0.5, 1.5]);
    const k = rng.int(2, 6);
    const R = r * k;
    return {
      facts: { form: 'sphere-to-spheres', ask: 'count', given: { R, r } },
      prompt: `A solid metallic sphere of radius ${plain(R)} cm is melted and recast into small spherical balls of radius ${plain(r)} cm each. How many balls are obtained?`,
      answer: k ** 3,
      fmt: (v) => String(v),
      mistakes: [
        { value: k * k, why: 'compared surface areas', trap: `Melting conserves volume, so compare r³: (${plain(R)}/${plain(r)})³ = ${k ** 3}.` },
        { value: k, why: 'compared radii' },
        { value: clean((4 / 3) * k ** 3), why: 'kept the 4/3 on one side only' },
      ],
      steps: [`Volume ratio = (${plain(R)}/${plain(r)})³ = ${k}³`, `Number of balls = ${k ** 3}`],
      shortcut: `(R/r)³ — π and 4/3 cancel.`,
      trap: `Volume, not area.`,
      tags: ['mensuration:recast'],
      choice: { step: k ** 3 >= 50 ? 5 : 1 },
    };
  }
  if (level === 'hard') {
    for (let tries = 0; tries < 400; tries++) {
      const R = rng.pick([3, 6, 9, 12]);
      const r = rng.pick([0.1, 0.2, 0.3, 0.5, 1]);
      const hCm = (4 * R ** 3) / (3 * r * r);
      const hM = hCm / 100;
      if (!Number.isFinite(clean(hM, 2)) || hM < 0.5 || hM > 2000) continue;
      return {
        facts: { form: 'sphere-to-wire', ask: 'lengthM', given: { R, r } },
        prompt: `A copper sphere of radius ${R} cm is melted and drawn into a wire of uniform radius ${plain(r)} cm. Find the length of the wire in metres.`,
        answer: clean(hM, 2),
        fmt: unitFmt('m'),
        mistakes: [
          { value: clean(hM * 3, 2), why: 'dropped the 1/3', trap: `(4/3)πR³ = πr²h → h = 4R³/(3r²).` },
          { value: clean((hM * 3) / 4, 2), why: 'dropped the 4/3' },
          { value: clean(hM / 2, 2), why: 'used the diameter of the wire' },
        ],
        steps: [`Volume conserved: ⁴⁄₃πR³ = πr²h`, `h = 4 × ${R}³ ÷ (3 × ${plain(r)}²) = ${plain(hCm)} cm`, `= ${plain(hM)} m`],
        shortcut: `h = 4R³/(3r²); π cancels.`,
        trap: `Convert centimetres to metres at the end.`,
        tags: ['mensuration:recast'],
        choice: { step: hM >= 100 ? 10 : 1 },
      };
    }
  }
  const [a, b, c, d] = rng.pick(CUBE_SUMS);
  const k = rng.int(1, 3);
  return {
    facts: { form: 'cubes-to-cube', ask: 'edge', given: { a: a * k, b: b * k, c: c * k } },
    prompt: `Three metal cubes of edges ${a * k} cm, ${b * k} cm and ${c * k} cm are melted together and recast into a single cube. Find the edge of the new cube.`,
    answer: d * k,
    fmt: unitFmt('cm'),
    mistakes: [
      { value: (a + b + c) * k, why: 'added the edges', trap: `Add volumes: ${a * k}³ + ${b * k}³ + ${c * k}³ = ${(d * k) ** 3}, then take the cube root.` },
      { value: clean(Math.sqrt((a * a + b * b + c * c) * k * k), 2), why: 'added the squares' },
      { value: c * k + k, why: 'added one unit to the largest edge' },
    ],
    steps: [`Total volume = ${a * k}³ + ${b * k}³ + ${c * k}³ = ${(a * k) ** 3} + ${(b * k) ** 3} + ${(c * k) ** 3} = ${(d * k) ** 3} cm³`, `Edge = ∛${(d * k) ** 3} = ${d * k} cm`],
    shortcut: `Recall ${a}³ + ${b}³ + ${c}³ = ${d}³.`,
    trap: `Volumes add; edges do not.`,
    tags: ['mensuration:recast'],
    choice: { step: 1 },
  };
}

/* ------------------------------ water level ------------------------------ */

export function waterLevel(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const cm = unitFmt('cm');
  for (let tries = 0; tries < 600; tries++) {
    if (level === 'easy') {
      const [L, B] = [rng.int(2, 10), rng.int(2, 8)];
      const riseCm = rng.int(2, 20);
      const litres = (L * B * riseCm * 1000) / 100;
      return {
        facts: { form: 'tank-rise', ask: 'riseCm', given: { L, B, litres } },
        prompt: `${rng.pick(['A rectangular water tank', 'A cuboidal sump', 'A rectangular cistern'])} has a base ${L} m long and ${B} m wide. How much will the water level rise if ${plain(litres)} litres of water is poured into it?`,
        answer: riseCm,
        fmt: cm,
        mistakes: [
          { value: clean(riseCm * 10, 2), why: 'converted litres to m³ wrongly', trap: `1 m³ = 1,000 litres; then convert metres to centimetres.` },
          { value: clean(riseCm / 10, 2), why: 'converted metres to cm wrongly' },
          { value: clean((litres / (L * B)) / 100, 2), why: 'forgot the litre conversion' },
        ],
        steps: [`${plain(litres)} litres = ${plain(litres / 1000)} m³`, `Rise = ${plain(litres / 1000)} ÷ (${L} × ${B}) = ${plain(riseCm / 100)} m`, `= ${riseCm} cm`],
        shortcut: `Rise = volume ÷ base area.`,
        trap: `Watch the units: litres → m³ → cm.`,
        tags: ['mensuration:water-level'],
        choice: { step: 1 },
      };
    }
    if (level === 'medium') {
      const n = rng.int(2, 30);
      const r = rng.pick([1, 2, 3, 1.5, 0.5]);
      const R = rng.pick([2, 3, 4, 5, 6, 7, 10, 12, 14]);
      const h = (n * 4 * r ** 3) / (3 * R * R);
      if (!Number.isFinite(clean(h, 2)) || h < 0.5 || h > 30 || r >= R) continue;
      return {
        facts: { form: 'spheres-rise', ask: 'riseCm', given: { n, r, R } },
        prompt: `${n} spherical marbles, each of radius ${plain(r)} cm, are dropped into a cylindrical beaker of radius ${R} cm containing some water. If all the marbles are fully submerged, by how much does the water level rise?`,
        answer: clean(h, 2),
        fmt: cm,
        mistakes: [
          { value: clean((n * r ** 3) / (R * R), 2), why: 'dropped the 4/3', trap: `Each marble displaces ⁴⁄₃πr³; equate n × ⁴⁄₃πr³ to πR²h.` },
          { value: clean((4 * n * r ** 3) / (3 * R ** 3), 2), why: 'divided by R³' },
          { value: clean((4 * r ** 3) / (3 * R * R), 2), why: 'counted one marble only' },
        ],
        steps: [`Volume displaced = ${n} × ⁴⁄₃π × ${plain(r)}³`, `πR²h = that → h = ${n} × 4 × ${plain(r ** 3)} ÷ (3 × ${R * R})`, `h = ${plain(h)} cm`],
        shortcut: `h = 4nr³/(3R²); π cancels.`,
        trap: `Multiply by the number of marbles.`,
        tags: ['mensuration:water-level'],
        choice: { step: h >= 5 ? 1 : 0.5, integer: false },
      };
    }
    if (level === 'hard') {
      const r = rng.pick([1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6]);
      const w = rng.pick([1, 1.5, 2, 2.5, 3, 4, 5]);
      const depth = rng.int(5, 25);
      const hE = (r * r * depth) / ((r + w) ** 2 - r * r);
      if (!Number.isFinite(clean(hE, 2)) || hE < 0.5 || hE > 10) continue;
      return {
        facts: { form: 'embankment', ask: 'heightM', given: { r, w, depth } },
        prompt: `A well of diameter ${plain(2 * r)} m is dug ${depth} m deep. The earth taken out is spread evenly all around it to form an embankment ${plain(w)} m wide. Find the height of the embankment.`,
        answer: clean(hE, 2),
        fmt: unitFmt('m'),
        mistakes: [
          { value: clean((r * r * depth) / ((r + w) ** 2), 2), why: 'used the whole outer circle as the base', trap: `The embankment is a ring: its area is π[(r + w)² − r²].` },
          { value: clean((r * r * depth) / (w * w), 2), why: 'used w² as the base area' },
          { value: clean((4 * r * r * depth) / ((2 * r + w) ** 2 - 4 * r * r), 2), why: 'used the diameter as the radius' },
        ],
        steps: [`Earth dug = πr²h = π × ${plain(r)}² × ${depth}`, `Embankment area = π[(${plain(r)} + ${plain(w)})² − ${plain(r)}²] = π × ${plain((r + w) ** 2 - r * r)}`, `Height = ${plain(r * r * depth)} ÷ ${plain((r + w) ** 2 - r * r)} = ${plain(hE)} m`],
        shortcut: `π cancels: height = r²h ÷ [(r + w)² − r²].`,
        trap: `The embankment is an annulus, not a disc.`,
        tags: ['mensuration:water-level', 'mensuration:cylinder'],
        choice: { step: 0.5, integer: false },
      };
    }
    // extreme: pit dug in a field, earth spread over the rest
    const [L, B] = [rng.int(20, 60), rng.int(15, 40)];
    const [l, b, d] = [rng.int(3, 10), rng.int(2, 8), rng.int(2, 6)];
    const riseCm = (l * b * d * 100) / (L * B - l * b);
    if (!Number.isFinite(clean(riseCm, 2)) || riseCm < 1 || riseCm > 100) continue;
    return {
      facts: { form: 'pit-spread', ask: 'riseCm', given: { L, B, l, b, d } },
      prompt: `A pit ${l} m long, ${b} m wide and ${d} m deep is dug in a rectangular field ${L} m long and ${B} m wide. The earth taken out is spread evenly over the rest of the field. By how many centimetres does the level of the field rise?`,
      answer: clean(riseCm, 2),
      fmt: cm,
      mistakes: [
        { value: clean((l * b * d * 100) / (L * B), 2), why: 'spread the earth over the whole field including the pit', trap: `The earth is spread over the remaining area ${L * B} − ${l * b} = ${L * B - l * b} m², not over the pit.` },
        { value: clean((l * b * d) / (L * B - l * b), 2), why: 'forgot to convert metres to centimetres' },
        { value: clean((l * b * d * 100) / (L * B + l * b), 2), why: 'added the pit area' },
      ],
      steps: [`Earth = ${l} × ${b} × ${d} = ${l * b * d} m³`, `Remaining area = ${L * B} − ${l * b} = ${L * B - l * b} m²`, `Rise = ${l * b * d} ÷ ${L * B - l * b} m = ${plain(riseCm)} cm`],
      shortcut: `Rise = volume ÷ remaining area.`,
      trap: `Exclude the pit's own area.`,
      tags: ['mensuration:water-level', 'mensuration:cuboid'],
      choice: { step: riseCm >= 10 ? 1 : 0.5, integer: false },
    };
  }
  throw new Error('waterLevel: no numbers found');
}

/* ------------------------------ painting cost ------------------------------ */

export function painting(ctx: BuildContext, level: Level): D {
  const { rng } = ctx;
  const [l, b, h] = [rng.int(4, 12), rng.int(3, 10), rng.int(3, 5)];
  const rate = rng.pick([10, 12, 15, 20, 25, 30, 40]);
  const walls = 2 * h * (l + b);
  if (level === 'easy') {
    const cost = walls * rate;
    return {
      facts: { form: 'room', ask: 'cost', given: { l, b, h, rate, ceiling: 0, openings: 0 } },
      prompt: `A room is ${l} m long, ${b} m wide and ${h} m high. Find the cost of painting its four walls at ${inr(rate)} per m².`,
      answer: cost,
      fmt: rupees,
      mistakes: [
        { value: (walls + l * b) * rate, why: 'included the ceiling', trap: `Only the four walls: 2h(l + b).` },
        { value: h * (l + b) * rate, why: 'painted only two walls' },
        { value: l * b * h * rate, why: 'used the volume' },
      ],
      steps: [`Area of four walls = 2h(l + b) = 2 × ${h} × (${l} + ${b}) = ${walls} m²`, `Cost = ${walls} × ${rate} = ${inr(cost)}`],
      shortcut: `Four walls = perimeter of floor × height.`,
      trap: `Walls only — no floor or ceiling.`,
      tags: ['mensuration:cost', 'mensuration:cuboid'],
      choice: { step: rate * 10 },
    };
  }
  if (level === 'medium') {
    const [dw, dh] = [1, 2];
    const [ww, wh] = [rng.pick([1, 1.5, 2]), rng.pick([1, 1.5])];
    const nW = rng.int(1, 3);
    const openings = dw * dh + nW * ww * wh;
    const area = walls + l * b - openings;
    const cost = area * rate;
    if (!Number.isInteger(cost)) return painting(ctx, 'easy');
    return {
      facts: { form: 'room', ask: 'cost', given: { l, b, h, rate, ceiling: 1, openings } },
      prompt: `A hall is ${l} m long, ${b} m wide and ${h} m high. It has one door ${dw} m × ${dh} m and ${nW} window${nW > 1 ? 's' : ''}, each ${plain(ww)} m × ${plain(wh)} m. Find the cost of painting the four walls and the ceiling at ${inr(rate)} per m², leaving out the door and windows.`,
      answer: cost,
      fmt: rupees,
      mistakes: [
        { value: (walls + l * b) * rate, why: 'did not subtract the door and windows', trap: `Leave out ${plain(openings)} m² of door and windows.` },
        { value: clean((walls - openings) * rate), why: 'left out the ceiling' },
        { value: clean((walls + 2 * l * b - openings) * rate), why: 'also painted the floor' },
      ],
      steps: [`Walls = 2 × ${h} × (${l} + ${b}) = ${walls} m²; ceiling = ${l * b} m²`, `Openings = ${dw * dh} + ${nW} × ${plain(ww * wh)} = ${plain(openings)} m²`, `Area = ${walls} + ${l * b} − ${plain(openings)} = ${plain(area)} m² → cost = ${inr(cost)}`],
      shortcut: `Walls + ceiling − openings, then × rate.`,
      trap: `Subtract the door and windows.`,
      tags: ['mensuration:cost', 'mensuration:cuboid'],
      choice: { step: rate * 10 },
    };
  }
  if (level === 'hard') {
    const n = rng.int(4, 20);
    const r = rng.pick([0.35, 0.7, 1.05]);
    const ph = rng.int(3, 8);
    const csa = 2 * PI * r * ph;
    const prate = rng.pick([10, 12, 15, 20, 25]);
    const cost = n * csa * prate;
    if (!Number.isFinite(clean(cost))) return painting(ctx, 'easy');
    return {
      facts: { form: 'pillars', ask: 'cost', given: { n, r, h: ph, rate: prate } },
      prompt: `A building has ${n} cylindrical pillars, each of radius ${plain(r)} m and height ${ph} m. Find the cost of painting the curved surfaces of all the pillars at ${inr(prate)} per m². (Take π = 22/7.)`,
      answer: clean(cost),
      fmt: rupees,
      mistakes: [
        { value: clean(csa * prate), why: 'painted one pillar only', trap: `Multiply by all ${n} pillars.` },
        { value: clean(n * PI * r * ph * prate), why: 'used πrh (forgot the 2)' },
        { value: clean(n * 2 * PI * r * (r + ph) * prate), why: 'added the circular ends' },
      ],
      steps: [`CSA of one pillar = 2πrh = 2 × ${PI_TEX} × ${plain(r)} × ${ph} = ${plain(csa)} m²`, `All ${n} pillars = ${plain(n * csa)} m²`, `Cost = ${plain(n * csa)} × ${prate} = ${inr(cost)}`],
      shortcut: `2πrh per pillar × number × rate.`,
      trap: `Only the curved surfaces are painted.`,
      tags: ['mensuration:cost', 'mensuration:cylinder'],
      choice: { step: cost >= 5000 ? 200 : 50 },
    };
  }
  // extreme: given the cost, find the height of the room
  const cost = walls * rate;
  return {
    facts: { form: 'room-height', ask: 'h', given: { l, b, rate, cost } },
    prompt: `The cost of painting the four walls of a room ${l} m long and ${b} m wide at ${inr(rate)} per m² is ${inr(cost)}. Find the height of the room.`,
    answer: h,
    fmt: unitFmt('m'),
    mistakes: [
      { value: clean(cost / rate / (l + b), 2), why: 'forgot the factor 2 in 2h(l + b)', trap: `Four walls = 2h(l + b); ${inr(cost)} ÷ ${rate} = ${walls} m² = 2h × ${l + b}.` },
      { value: clean(cost / rate / (l * b), 2), why: 'divided by the floor area' },
      { value: clean(cost / rate / (2 * l), 2), why: 'used only the length walls' },
    ],
    steps: [`Wall area = ${inr(cost)} ÷ ${inr(rate)} = ${walls} m²`, `2h(${l} + ${b}) = ${walls} → h = ${walls} ÷ ${2 * (l + b)} = ${h} m`],
    shortcut: `h = wall area ÷ perimeter of the floor.`,
    trap: `Divide by 2(l + b).`,
    tags: ['mensuration:cost', 'mensuration:cuboid'],
    choice: { step: 0.5, integer: false },
  };
}
