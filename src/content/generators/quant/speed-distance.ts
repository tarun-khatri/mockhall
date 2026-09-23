/**
 * quant.speed-distance — Speed, distance & time incl. trains (SPEC 8.1 Q7).
 * km/h ↔ m/s uses ×5/18 with speeds (or relative speeds) in multiples of 18 km/h so m/s values are whole.
 */
import { defineGenerator, type BuildContext, type SubtypeDef } from '../types';
import type { Difficulty } from '../../types';
import { finish, type Draft } from './speed-distance/kit';
import { trainMan, trainPlatform, trainPole, trainTrains } from './speed-distance/trains';
import { averageSpeed, lateEarly, meetingPoint, relativeSpeed, stoppage } from './speed-distance/motion';
import { circular } from './speed-distance/circular';

/** One object the train crosses (see trains.ts). null = the asked quantity. */
export interface CrossEvent {
  /** Length of the object in m (0 for a pole or a person); null = asked. */
  len: number | null;
  /** Object speed in km/h: + same direction as the train, − towards it, 0 static; null = asked. */
  speed: number | null;
  /** Seconds to cross completely; null = asked. */
  time: number | null;
  /** km/h added to the train's speed for this crossing. */
  boost?: number;
  /** Object length = lenFactor × train length. */
  lenFactor?: number;
  /** Direction of the object when its speed is asked (+1 same, −1 towards). */
  speedSign?: 1 | -1;
}

/** One leg of a journey for average-speed questions. */
export interface Leg {
  /** Share of the whole distance, num/den (when the distance is not given). */
  num?: number;
  den?: number;
  /** Distance in km. */
  dist?: number;
  /** km/h; null = asked. */
  speed?: number | null;
  /** The leg is split into two equal times at these speeds. */
  halfTimeSpeeds?: [number, number];
  /** A halt of this many minutes. */
  haltMin?: number;
}

/**
 * Ground-truth inputs (as stated in the prompt). Speeds in km/h unless the form says m/s (circle: m/s),
 * lengths in m for trains/tracks, distances in km otherwise, times in the unit named by the key.
 */
export interface SpeedFacts {
  form: string;
  ask: string;
  given: Record<string, number>;
  list?: number[];
  train?: { len: number | null; speed: number | null };
  events?: CrossEvent[];
  legs?: Leg[];
}

type Builder = (ctx: BuildContext) => Draft<SpeedFacts>;
type Level = 'easy' | 'medium' | 'hard' | 'extreme';

const META = { name: 'quant.speed-distance', version: 1, subject: 'quant', chapter: 'speed-distance' } as const;

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'average-speed', label: 'Average speed', weight: 2 },
  { id: 'relative-speed', label: 'Relative speed', weight: 1 },
  { id: 'train-pole', label: 'Train crossing a pole', weight: 1.5 },
  { id: 'train-platform', label: 'Train crossing a platform', weight: 2 },
  { id: 'train-trains', label: 'Two trains crossing', weight: 2 },
  { id: 'train-man', label: 'Train passing a moving man', weight: 1 },
  { id: 'meeting-point', label: 'Meeting point', weight: 1 },
  { id: 'late-early', label: 'Late and early arrival', weight: 1 },
  { id: 'stoppage', label: 'Stoppage time', weight: 1 },
  { id: 'circular-track', label: 'Circular track', difficulties: ['extreme'], weight: 1 },
];

const BY_LEVEL: Record<string, (ctx: BuildContext, level: Level) => Draft<SpeedFacts>> = {
  'average-speed': averageSpeed,
  'relative-speed': relativeSpeed,
  'train-pole': trainPole,
  'train-platform': trainPlatform,
  'train-trains': trainTrains,
  'train-man': trainMan,
  'meeting-point': meetingPoint,
  'late-early': lateEarly,
  stoppage,
};

function builderFor(subtype: string, difficulty: Difficulty): Builder {
  if (subtype === 'circular-track') return circular;
  const fn = BY_LEVEL[subtype];
  if (!fn) throw new Error(`${META.name}: unknown subtype ${subtype}`);
  return (ctx) => fn(ctx, difficulty);
}

export const generator = defineGenerator<SpeedFacts>(META, SUBTYPES, (ctx) => finish(ctx, builderFor(ctx.subtype.id, ctx.difficulty)(ctx)));
