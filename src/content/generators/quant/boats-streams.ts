/**
 * quant.boats-streams — Boats & streams (SPEC 8.1 Q8): downstream/upstream speed, still-water speed,
 * round-trip time, ratio of times, distance covered in a given total time.
 */
import { defineGenerator, type SubtypeDef } from '../types';
import { finish } from './boats-streams/kit';
import { downUp, roundTrip, stillWater, timeRatio, totalDistance } from './boats-streams/builders';

/** Ground-truth inputs: speeds in km/h, distances in km, times in hours. */
export interface BoatFacts {
  form: string;
  ask: string;
  given: Record<string, number>;
}

const META = { name: 'quant.boats-streams', version: 1, subject: 'quant', chapter: 'boats-streams' } as const;

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'downstream-upstream', label: 'Downstream & upstream speed', weight: 2 },
  { id: 'still-water', label: 'Speed in still water / of stream', weight: 2 },
  { id: 'round-trip', label: 'Round-trip time', weight: 1.5 },
  { id: 'time-ratio', label: 'Ratio of times', weight: 1 },
  { id: 'total-time-distance', label: 'Distance in a given total time', weight: 1.5 },
];

const BUILDERS = {
  'downstream-upstream': downUp,
  'still-water': stillWater,
  'round-trip': roundTrip,
  'time-ratio': timeRatio,
  'total-time-distance': totalDistance,
} as const;

export const generator = defineGenerator<BoatFacts>(META, SUBTYPES, (ctx) => {
  const fn = BUILDERS[ctx.subtype.id as keyof typeof BUILDERS];
  if (!fn) throw new Error(`${META.name}: unknown subtype ${ctx.subtype.id}`);
  return finish(ctx, fn(ctx, ctx.difficulty));
});
