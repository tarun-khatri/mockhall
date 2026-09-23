import { describeGenerator } from '../../helpers/harness';
import { generator, type DirectionFacts } from '../../../src/content/generators/reasoning/direction';
import { verify } from '../../../src/content/verify/reasoning/direction';
import type { GenResult } from '../../../src/content/generators/types';

function sanity(res: GenResult<DirectionFacts>): string[] {
  const p: string[] = [];
  const f = res.facts;
  const qs = res.item.questions;
  switch (f.kind) {
    case 'walk':
      if (f.legs.length < 3 || f.legs.length > 8) p.push(`walk has ${f.legs.length} legs`);
      if (f.legs.some((l) => l.length < 2 || l.length > 40 || !Number.isInteger(l.length))) p.push(`bad leg length ${f.legs.map((l) => l.length)}`);
      break;
    case 'final-facing':
      if (f.variant === 'turns' && (f.turns.length < 2 || f.turns.length > 6)) p.push(`${f.turns.length} turns`);
      break;
    case 'coded-direction':
      if (f.codes.length !== 4 || f.codes.some((c) => c.dist < 2 || c.dist > 12)) p.push('bad code table');
      break;
    case 'point-set':
      if (qs.length !== 3) p.push(`point set has ${qs.length} questions`);
      if (f.clues.length < 4 || f.clues.length > 8) p.push(`${f.clues.length} clues`);
      if (f.clues.some((c) => c.dist < 2 || c.dist > 24)) p.push('clue distance out of 2–24 m');
      if (!res.item.set || res.item.set.kind !== 'puzzle') p.push('point set is not a puzzle set');
      break;
    case 'shadow':
      break;
  }
  for (const q of qs) {
    if (q.targetSeconds < 15 || q.targetSeconds > 70) p.push(`targetSeconds ${q.targetSeconds}`);
    const v = q.solution.visual;
    if (v && v.type === 'path') {
      if (v.points[0].x !== 0 || v.points[0].y !== 0) p.push('path visual does not start at (0, 0)');
      if (v.shortest && ![v.shortest.from, v.shortest.to].every((l) => v.points.some((pt) => pt.label === l))) p.push('shortest segment refers to unknown labels');
    }
  }
  return p;
}

describeGenerator(generator, { verify, sanity });
