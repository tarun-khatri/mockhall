/**
 * quant.mensuration — Mensuration 2D & 3D (SPEC 8.1 Q14). π = 22/7 with radii in multiples of 7.
 */
import { defineGenerator, type SubtypeDef } from '../types';
import { finish } from './mensuration/kit';
import { areaChange, circle, path, rectangle, trapRhombus, triangle } from './mensuration/plane';
import { cuboid, cylinderCone, meltRecast, painting, sphere, waterLevel } from './mensuration/solid';

/** Ground-truth dimensions as stated in the prompt (lengths in the prompt's unit, rates in ₹). */
export interface MensFacts {
  form: string;
  ask: string;
  given: Record<string, number>;
}

const META = { name: 'quant.mensuration', version: 1, subject: 'quant', chapter: 'mensuration' } as const;

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'rectangle-square', label: 'Rectangle & square', weight: 1.5 },
  { id: 'circle', label: 'Circle & semicircle', weight: 1.5 },
  { id: 'triangle', label: 'Triangle', weight: 1 },
  { id: 'trapezium-rhombus', label: 'Trapezium & rhombus', weight: 1 },
  { id: 'path', label: 'Path around / inside a field', weight: 1 },
  { id: 'area-change', label: '% change in area', weight: 1 },
  { id: 'cube-cuboid', label: 'Cube & cuboid', weight: 1.5 },
  { id: 'cylinder-cone', label: 'Cylinder & cone', weight: 1.5 },
  { id: 'sphere-hemisphere', label: 'Sphere & hemisphere', weight: 1 },
  { id: 'melt-recast', label: 'Melting & recasting', weight: 1 },
  { id: 'water-level', label: 'Water level rise', weight: 1 },
  { id: 'painting-cost', label: 'Cost of painting', weight: 1 },
];

const BUILDERS = {
  'rectangle-square': rectangle,
  circle,
  triangle,
  'trapezium-rhombus': trapRhombus,
  path,
  'area-change': areaChange,
  'cube-cuboid': cuboid,
  'cylinder-cone': cylinderCone,
  'sphere-hemisphere': sphere,
  'melt-recast': meltRecast,
  'water-level': waterLevel,
  'painting-cost': painting,
} as const;

export const generator = defineGenerator<MensFacts>(META, SUBTYPES, (ctx) => {
  const fn = BUILDERS[ctx.subtype.id as keyof typeof BUILDERS];
  if (!fn) throw new Error(`${META.name}: unknown subtype ${ctx.subtype.id}`);
  return finish(ctx, fn(ctx, ctx.difficulty));
});
