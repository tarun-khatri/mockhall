/**
 * Number formatting for content and UI: Indian digit grouping, ₹, percentages, KaTeX fractions.
 * Shared by generators AND verifiers (formatting is not answer logic).
 */

/** Round half away from zero to `dp` decimals, robust to binary float noise (1.005 → 1.01). */
export function roundTo(n: number, dp = 2): number {
  const f = 10 ** dp;
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * f + 1e-9 * f)) / f;
}

/** True when a and b are equal within a tiny tolerance. */
export function approxEqual(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
}

/** True when n is an integer within float tolerance. */
export function isWhole(n: number, eps = 1e-9): boolean {
  return Math.abs(n - Math.round(n)) <= eps * Math.max(1, Math.abs(n));
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

function groupIndian(intDigits: string): string {
  if (intDigits.length <= 3) return intDigits;
  const last3 = intDigits.slice(-3);
  const rest = intDigits.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

/** Plain number, no grouping, at most dp decimals (trailing zeros trimmed): 12.50 → "12.5". */
export function plain(n: number, dp = 2): string {
  const r = roundTo(n, dp);
  const s = trimZeros(Math.abs(r).toFixed(dp));
  return (r < 0 ? '-' : '') + s;
}

/** Indian digit grouping: 1234567.5 → "12,34,567.5". */
export function indian(n: number, dp = 2): string {
  const r = roundTo(n, dp);
  const s = trimZeros(Math.abs(r).toFixed(dp));
  const [i, f] = s.split('.');
  return (r < 0 ? '-' : '') + groupIndian(i) + (f ? '.' + f : '');
}

/** Rupees: 120000 → "₹1,20,000". */
export function inr(n: number, dp = 2): string {
  return (n < 0 ? '-' : '') + '₹' + indian(Math.abs(n), dp);
}

/** Percentage: 12.5 → "12.5%". */
export function pct(n: number, dp = 2): string {
  return plain(n, dp) + '%';
}

export function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a;
}

export function lcm(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : Math.abs(Math.round(a) * Math.round(b)) / gcd(a, b);
}

/** Reduce p/q to lowest terms with a positive denominator. */
export function reduce(p: number, q: number): [number, number] {
  if (q === 0) throw new Error('reduce: zero denominator');
  const g = gcd(p, q) || 1;
  const s = q < 0 ? -1 : 1;
  return [(s * p) / g, (s * q) / g];
}

/** KaTeX fraction, reduced: fracTex(6, 8) → "$\frac{3}{4}$"; whole numbers render plain. */
export function fracTex(p: number, q: number): string {
  const [a, b] = reduce(p, q);
  if (b === 1) return String(a);
  return a < 0 ? `$-\\frac{${-a}}{${b}}$` : `$\\frac{${a}}{${b}}$`;
}

/** Mixed number: mixedTex(11, 4) → "$2\frac{3}{4}$". */
export function mixedTex(p: number, q: number): string {
  const [a, b] = reduce(p, q);
  if (b === 1) return String(a);
  const sign = a < 0 ? '-' : '';
  const whole = Math.floor(Math.abs(a) / b);
  const rem = Math.abs(a) % b;
  if (whole === 0) return fracTex(a, b);
  return `$${sign}${whole}\\frac{${rem}}{${b}}$`;
}

/** Ratio "3 : 4" (reduced). */
export function ratio(...parts: number[]): string {
  const g = parts.reduce((acc, x) => gcd(acc, x), 0) || 1;
  return parts.map((x) => plain(x / g)).join(' : ');
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** 150 → "2 hours 30 minutes", 45 → "45 minutes", 60 → "1 hour". */
export function hoursMinutes(totalMinutes: number): string {
  const m = Math.round(totalMinutes);
  const h = Math.floor(m / 60);
  const r = m % 60;
  const hs = h ? `${h} hour${h === 1 ? '' : 's'}` : '';
  const ms = r ? `${r} minute${r === 1 ? '' : 's'}` : '';
  return [hs, ms].filter(Boolean).join(' ') || '0 minutes';
}

/** mm:ss for timers, e.g. 1234 s → "20:34"; hours roll into minutes. */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Short duration for analytics: 42 → "0:42", 125 → "2:05". */
export function shortDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
