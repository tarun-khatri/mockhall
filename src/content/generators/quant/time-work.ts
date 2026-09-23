/**
 * quant.time-work — Time & work (SPEC 8.1 Q11): efficiency (LCM method), working together, one leaves,
 * alternate days, M₁D₁H₁/W₁ = M₂D₂H₂/W₂, wages by work done, men–women equivalence (hard/extreme).
 */
import { defineGenerator, type SubtypeDef } from '../types';
import { finish } from './time-work/kit';
import { alternate, efficiency, leaves, mdh, mwc, wages, workingTogether } from './time-work/builders';

/** Ground-truth inputs as stated in the prompt (days alone, days worked, pay in ₹ …). */
export interface WorkFacts {
  form: string;
  ask: string;
  given: Record<string, number>;
  /** Days alone of several workers, in the order stated. */
  list?: number[];
}

const META = { name: 'quant.time-work', version: 1, subject: 'quant', chapter: 'time-work' } as const;

const SUBTYPES: readonly SubtypeDef[] = [
  { id: 'efficiency', label: 'Efficiency (LCM method)', weight: 2 },
  { id: 'working-together', label: 'Working together', weight: 2 },
  { id: 'one-leaves', label: 'One leaves or joins', weight: 1.5 },
  { id: 'alternate-days', label: 'Alternate days', weight: 1 },
  { id: 'mdh', label: 'Men, days and hours (MDH/W)', weight: 1.5 },
  { id: 'wages', label: 'Wages by work done', weight: 1 },
  { id: 'men-women', label: 'Men, women equivalence', difficulties: ['hard', 'extreme'], weight: 1 },
];

const BUILDERS = {
  efficiency,
  'working-together': workingTogether,
  'one-leaves': leaves,
  'alternate-days': alternate,
  mdh,
  wages,
  'men-women': mwc,
} as const;

export const generator = defineGenerator<WorkFacts>(META, SUBTYPES, (ctx) => {
  const fn = BUILDERS[ctx.subtype.id as keyof typeof BUILDERS];
  if (!fn) throw new Error(`${META.name}: unknown subtype ${ctx.subtype.id}`);
  return finish(ctx, fn(ctx, ctx.difficulty));
});
