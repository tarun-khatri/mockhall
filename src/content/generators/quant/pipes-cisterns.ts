/**
 * quant.pipes-cisterns — Pipes & cisterns (SPEC 8.1 Q12): filling/emptying pipes, leaks, alternate opening,
 * a pipe closed after some time, tank partly full at the start.
 */
import { defineGenerator, type SubtypeDef } from '../types';
import { finish } from './pipes-cisterns/kit';
import { alternatePipes, closedAfter, fillEmpty, leak, partlyFull } from './pipes-cisterns/builders';

/**
 * Ground-truth inputs as stated. Pipe times are in the unit used by the prompt; in `list`, a negative
 * value is an emptying pipe (its time to empty the full tank).
 */
export interface PipeFacts {
  form: string;
  ask: string;
  given: Record<string, number>;
  list?: number[];
}

const META = { name: 'quant.pipes-cisterns', version: 1, subject: 'quant', chapter: 'pipes-cisterns' } as const;

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'fill-empty', label: 'Filling and emptying pipes', weight: 2 },
  { id: 'leak', label: 'Leak', weight: 1.5 },
  { id: 'alternate', label: 'Pipes opened alternately', weight: 1 },
  { id: 'closed-after', label: 'Pipe closed after some time', weight: 1.5 },
  { id: 'partly-full', label: 'Tank partly full at the start', weight: 1 },
];

const BUILDERS = {
  'fill-empty': fillEmpty,
  leak,
  alternate: alternatePipes,
  'closed-after': closedAfter,
  'partly-full': partlyFull,
} as const;

export const generator = defineGenerator<PipeFacts>(META, SUBTYPES, (ctx) => {
  const fn = BUILDERS[ctx.subtype.id as keyof typeof BUILDERS];
  if (!fn) throw new Error(`${META.name}: unknown subtype ${ctx.subtype.id}`);
  return finish(ctx, fn(ctx, ctx.difficulty));
});
