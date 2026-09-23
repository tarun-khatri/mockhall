/**
 * Independent verifier for quant.ages.
 *
 * Brute force: enumerate every whole-number age (or pair of ages) from 1 to 120 and keep the ones that
 * satisfy all the stated conditions — ratios checked by cross-multiplication. The enumeration must find
 * exactly one solution; the asked quantity is then read off it and matched to exactly one option.
 */
import type { GenResult } from '../../generators/types';
import type { AgesFacts } from '../../generators/quant/ages';

const MAX = 120;

function unique<T>(label: string, xs: T[]): T {
  if (xs.length !== 1) throw new Error(`${label}: ${xs.length} solutions`);
  return xs[0];
}
const ratioIs = (x: number, y: number, p: number, q: number): boolean => x > 0 && y > 0 && x * q === y * p;

function ages1(cond: (x: number) => boolean): number[] {
  const out: number[] = [];
  for (let x = 1; x <= MAX; x++) if (cond(x)) out.push(x);
  return out;
}
function ages2(cond: (x: number, y: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  for (let x = 1; x <= MAX; x++) for (let y = 1; y <= MAX; y++) if (cond(x, y)) out.push([x, y]);
  return out;
}

type Want = { value: number } | { ratio: [number, number] };

function parseOption(o: string): Want {
  const s = o.trim();
  const r = s.match(/^(\d+) : (\d+)$/);
  if (r) return { ratio: [Number(r[1]), Number(r[2])] };
  const m = s.match(/^(\d+) years?$/);
  if (!m) throw new Error(`unparseable option "${o}"`);
  return { value: Number(m[1]) };
}

function match(options: readonly string[], want: Want): number {
  const hits = options
    .map((o, i) => {
      const p = parseOption(o);
      if ('value' in want) return 'value' in p && p.value === want.value ? i : -1;
      return 'ratio' in p && p.ratio[0] * want.ratio[1] === p.ratio[1] * want.ratio[0] ? i : -1;
    })
    .filter((i) => i >= 0);
  if (hits.length !== 1) throw new Error(`expected one option for ${JSON.stringify(want)}, found ${hits.length} in ${JSON.stringify(options)}`);
  return hits[0];
}

function solve(f: AgesFacts): Want {
  switch (f.form) {
    case 'now-and-shift': {
      const [A, B] = unique('now-and-shift', ages2((A, B) => ratioIs(A, B, f.a, f.b) && ratioIs(A + f.t, B + f.t, f.p, f.q)));
      return { value: f.ask === 0 ? A : B };
    }
    case 'mixed-offset': {
      const [A, B] = unique('mixed-offset', ages2((A, B) => ratioIs(A, B, f.a, f.b) && ratioIs(A + f.hence, B - f.ago, f.p, f.q)));
      return { value: A + f.after + B + f.after };
    }
    case 'two-horizons': {
      const [A, B] = unique('two-horizons', ages2((A, B) => ratioIs(A - f.ago, B - f.ago, f.r1[0], f.r1[1]) && ratioIs(A + f.hence, B + f.hence, f.r2[0], f.r2[1])));
      return f.ask === 'age' ? { value: A + f.after } : { ratio: [A + f.after, B + f.after] };
    }
    case 'sum-now': {
      const [A] = unique('sum-now', ages2((A, B) => A + B === f.sum && ratioIs(A, B, f.a, f.b)));
      return { value: A };
    }
    case 'sum-ago': {
      const [, B] = unique('sum-ago', ages2((A, B) => A + B === f.sum && ratioIs(A - f.ago, B - f.ago, f.a, f.b)));
      return { value: B };
    }
    case 'fraction-equal': {
      const [A] = unique('fraction-equal', ages2((A, B) => A * f.u * f.x === B * f.w * f.v && A + B + 2 * f.after === f.sum));
      return { value: A };
    }
    case 'three-gaps': {
      const [A] = unique('three-gaps', ages2((A, B) => B === A + f.k1 + f.k2 && ratioIs(A, B, f.a, f.b)));
      return { value: A + f.k1 - f.ago };
    }
    case 'father-son': {
      const s = unique('father-son', ages1((s) => f.k * s + f.n === f.m * (s + f.n)));
      return { value: f.k * s };
    }
    case 'at-birth': {
      const d = unique('at-birth', ages1((d) => d + f.atBirth === f.k * d));
      return { value: d + f.after };
    }
    case 'two-multiples': {
      const [F, s] = unique('two-multiples', ages2((F, s) => s > f.ago && F - f.ago === f.k1 * (s - f.ago) && F + f.hence === f.k2 * (s + f.hence)));
      return { value: F + s };
    }
    case 'generations': {
      const s = unique('generations', ages1((s) => s + f.f * s + f.g * s === f.sum));
      return { value: f.f * s + f.after };
    }
    case 'avg-ratio': {
      const total = 3 * f.avg;
      const k = unique('avg-ratio', ages1((k) => f.parts.reduce((acc, p) => acc + p * k, 0) === total));
      return { value: Math.max(...f.parts) * k };
    }
    case 'avg-birth': {
      // Rewind every member by `youngest` years; the youngest drops out.
      const olderTotalNow = f.n * f.avg - f.youngest;
      const totalThen = olderTotalNow - (f.n - 1) * f.youngest;
      if (totalThen % (f.n - 1) !== 0) throw new Error('avg-birth: non-integer average');
      return { value: totalThen / (f.n - 1) };
    }
    case 'avg-marriage': {
      let total = 2 * f.avg;
      for (let y = 0; y < f.since; y++) total += 2; // both age each year
      total += f.child;
      if (total % 3 !== 0) throw new Error('avg-marriage: non-integer average');
      return { value: total / 3 };
    }
    case 'avg-same': {
      const child = unique('avg-same', ages1((c) => f.n * (f.avg + f.since) + c === (f.n + 1) * f.avg));
      if (child >= f.since) throw new Error('avg-same: the baby cannot be older than the time elapsed');
      return { value: child };
    }
  }
}

export function verify(res: GenResult<AgesFacts>): number[] {
  return res.item.questions.map((q) => match(q.options, solve(res.facts)));
}
