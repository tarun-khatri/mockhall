/**
 * Question descriptors stored in facts. They point at DISPLAYED data (table cells, chart points, pie slices,
 * numbers printed in a caselet) so the verifier can recompute every answer from what the student sees.
 */
import { indian, inr, pct, plain } from '../../../../lib/format';

export type Fmt = 'int' | 'num' | 'pct' | 'inr' | 'deg';

export type Ref =
  /** Table cell (row label in the first column, column header) or chart point (category, series name). */
  | { op: 'cell'; row: string; col: string }
  /** Pie chart: number of items in a slice (value% or value° of the total printed in the note). */
  | { op: 'slice'; label: string }
  /** Pie chart: the printed slice value itself (percent or degrees). */
  | { op: 'raw'; label: string }
  /** Caselet: a number printed in the passage (facts.inputs[name] holds its printed text). */
  | { op: 'var'; name: string }
  /** Caselet: term `index` of a printed ratio such as "3 : 4 : 5". */
  | { op: 'part'; name: string; index: number }
  /** Caselet: sum of the terms of a printed ratio. */
  | { op: 'parts'; name: string }
  | { op: 'const'; v: number }
  | { op: 'add' | 'sub' | 'mul' | 'div'; a: Ref; b: Ref }
  /** p% of x */
  | { op: 'pctof'; p: Ref; x: Ref }
  /** x increased by p% (p < 0: decreased). p is printed in the question text. */
  | { op: 'grow'; x: Ref; p: number }
  | { op: 'sum'; items: Ref[] }
  /** Simple interest P·R·T/100. */
  | { op: 'si'; p: Ref; r: Ref; t: Ref }
  /** Compound interest (annual) P(1 + R/100)^T − P. */
  | { op: 'ci'; p: Ref; r: Ref; t: Ref };

export type Ask =
  | { kind: 'value'; x: Ref; fmt: Fmt }
  | { kind: 'ratio'; a: Ref; b: Ref }
  /** (a / b) × 100 */
  | { kind: 'pct-of'; a: Ref; b: Ref }
  /** |to − from| / from × 100 */
  | { kind: 'pct-change'; from: Ref; to: Ref }
  | { kind: 'average'; items: Ref[]; fmt: Fmt }
  /** |a − b| */
  | { kind: 'difference'; a: Ref; b: Ref; fmt: Fmt }
  | { kind: 'sum'; items: Ref[]; fmt: Fmt };

export function fmtValue(v: number, fmt: Fmt): string {
  switch (fmt) {
    case 'int':
      return indian(v, 0);
    case 'num':
      return indian(v, 2);
    case 'pct':
      return pct(v, 2);
    case 'inr':
      return inr(v, 2);
    case 'deg':
      return `${plain(v, 2)}°`;
  }
}

export const cellRef = (row: string, col: string): Ref => ({ op: 'cell', row, col });
export const sumRef = (items: Ref[]): Ref => (items.length === 1 ? items[0] : { op: 'sum', items });
