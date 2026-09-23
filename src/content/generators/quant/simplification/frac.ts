/**
 * Exact rational numbers on JS safe integers (generator side). Every operation normalises and throws if a
 * numerator or denominator leaves the safe-integer range, so a template that overflows is simply retried.
 */

function igcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

function safe(n: number): number {
  if (!Number.isSafeInteger(n)) throw new RangeError(`Q: ${n} is not a safe integer`);
  return n;
}

export class Q {
  readonly n: number;
  readonly d: number;

  constructor(n: number, d = 1) {
    safe(n);
    safe(d);
    if (d === 0) throw new RangeError('Q: zero denominator');
    const g = igcd(n, d) || 1;
    const s = d < 0 ? -1 : 1;
    this.n = (s * n) / g + 0; // + 0 turns -0 into 0
    this.d = (s * d) / g;
  }

  static int(n: number): Q {
    return new Q(n, 1);
  }

  /** Exact value of a short decimal given as a number, e.g. 12.25 → 49/4 (at most 6 decimals). */
  static dec(x: number): Q {
    for (let dp = 0; dp <= 6; dp++) {
      const f = 10 ** dp;
      const m = Math.round(x * f);
      if (Math.abs(m / f - x) < 1e-9) return new Q(m, f);
    }
    throw new RangeError(`Q.dec: ${x} has too many decimals`);
  }

  add(o: Q): Q {
    return new Q(safe(this.n * o.d + o.n * this.d), safe(this.d * o.d));
  }
  sub(o: Q): Q {
    return new Q(safe(this.n * o.d - o.n * this.d), safe(this.d * o.d));
  }
  mul(o: Q): Q {
    return new Q(safe(this.n * o.n), safe(this.d * o.d));
  }
  div(o: Q): Q {
    if (o.n === 0) throw new RangeError('Q: division by zero');
    return new Q(safe(this.n * o.d), safe(this.d * o.n));
  }
  neg(): Q {
    return new Q(-this.n, this.d);
  }
  /** Integer power (negative allowed). */
  pow(k: number): Q {
    if (!Number.isInteger(k)) throw new RangeError('Q.pow: non-integer exponent');
    let r = Q.int(1);
    const base = k < 0 ? Q.int(1).div(this) : (this as Q);
    for (let i = 0; i < Math.abs(k); i++) r = r.mul(base);
    return r;
  }
  /** Exact k-th root or null. */
  root(k: number): Q | null {
    if (this.n < 0) return null;
    const rt = (x: number): number | null => {
      const r = Math.round(x ** (1 / k));
      for (const c of [r - 1, r, r + 1]) if (c >= 0 && c ** k === x) return c;
      return null;
    };
    const a = rt(this.n);
    const b = rt(this.d);
    return a === null || b === null ? null : new Q(a, b);
  }
  eq(o: Q): boolean {
    return this.n === o.n && this.d === o.d;
  }
  cmp(o: Q): number {
    return Math.sign(this.n * o.d - o.n * this.d);
  }
  isInt(): boolean {
    return this.d === 1;
  }
  get sign(): number {
    return Math.sign(this.n);
  }
  toNumber(): number {
    return this.n / this.d;
  }
  /** True when the value has a terminating decimal expansion with at most `dp` places. */
  isDecimal(dp = 4): boolean {
    let d = this.d;
    let twos = 0;
    let fives = 0;
    while (d % 2 === 0) {
      d /= 2;
      twos++;
    }
    while (d % 5 === 0) {
      d /= 5;
      fives++;
    }
    return d === 1 && Math.max(twos, fives) <= dp;
  }
}

export const q = (n: number, d = 1): Q => new Q(n, d);
