/**
 * DI charts as responsive SVG. Values are printed on every mark because clerk DI papers print them and the
 * questions depend on reading them exactly. Series colours: validated categorical slots --s1..--s3 (dataviz
 * reference palette, all-pairs CVD-safe in light and dark); text always uses ink tokens, never series colour.
 */
import type { ChartSpec, TableSpec } from '../../content/types';
import { indian } from '../../lib/format';

const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)'];
const W = 340;

function fmt(v: number): string {
  return indian(v, 2);
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * base >= v * 1.08) return m * base;
  return 10 * base;
}

function Legend({ names }: { names: string[] }) {
  if (names.length < 2) return null;
  return (
    <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
      {names.map((n, i) => (
        <li key={n} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: SERIES[i % 3] }} />
          {n}
        </li>
      ))}
    </ul>
  );
}

function Axis({ max, top, bottom, left, right }: { max: number; top: number; bottom: number; left: number; right: number }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <g>
      {ticks.map((t) => {
        const y = bottom - (bottom - top) * t;
        return (
          <g key={t}>
            <line x1={left} x2={right} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
            <text x={left - 4} y={y + 3.5} textAnchor="end" fontSize={10} fill="var(--ink-2)">
              {fmt(max * t)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function BarLike({ chart }: { chart: Extract<ChartSpec, { type: 'bar' | 'stacked-bar' }> }) {
  const stacked = chart.type === 'stacked-bar';
  const n = chart.categories.length;
  const s = chart.series.length;
  const totals = chart.categories.map((_, i) => chart.series.reduce((acc, se) => acc + se.values[i], 0));
  const max = niceMax(stacked ? Math.max(...totals) : Math.max(...chart.series.flatMap((x) => x.values)));
  const left = 40;
  const right = W - 6;
  const top = 14;
  const bottom = 196;
  const H = 222;
  const band = (right - left) / n;
  const groupW = band * (stacked ? 0.5 : 0.78);
  const barW = stacked ? groupW : groupW / s - 2;
  const y = (v: number) => bottom - ((bottom - top) * v) / max;
  const valueSize = s > 2 || n > 5 ? 8.5 : 9.5;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={chart.title ?? 'Bar chart'}>
      <Axis max={max} top={top} bottom={bottom} left={left} right={right} />
      {chart.categories.map((cat, i) => {
        const x0 = left + band * i + (band - groupW) / 2;
        let acc = 0;
        return (
          <g key={cat}>
            {chart.series.map((se, j) => {
              const v = se.values[i];
              if (stacked) {
                const yTop = y(acc + v);
                const yBot = y(acc);
                acc += v;
                return (
                  <g key={se.name}>
                    <rect x={x0} y={yTop + 1} width={barW} height={Math.max(0, yBot - yTop - 2)} fill={SERIES[j % 3]} rx={2} />
                    {yBot - yTop > 12 ? (
                      <text x={x0 + barW / 2} y={(yTop + yBot) / 2 + 3.5} textAnchor="middle" fontSize={valueSize} fill="var(--surface)" fontWeight={600}>
                        {fmt(v)}
                      </text>
                    ) : null}
                  </g>
                );
              }
              const bx = x0 + j * (barW + 2);
              return (
                <g key={se.name}>
                  <rect x={bx} y={y(v)} width={barW} height={Math.max(0, bottom - y(v))} fill={SERIES[j % 3]} rx={3} />
                  <text x={bx + barW / 2} y={y(v) - 3} textAnchor="middle" fontSize={valueSize} fill="var(--ink)" fontWeight={600}>
                    {fmt(v)}
                  </text>
                </g>
              );
            })}
            {stacked ? (
              <text x={x0 + barW / 2} y={y(totals[i]) - 3} textAnchor="middle" fontSize={9} fill="var(--ink)" fontWeight={600}>
                {fmt(totals[i])}
              </text>
            ) : null}
            <text x={left + band * i + band / 2} y={bottom + 14} textAnchor="middle" fontSize={10.5} fill="var(--ink)">
              {cat}
            </text>
          </g>
        );
      })}
      <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="var(--ink-2)" strokeWidth={1} />
    </svg>
  );
}

function LineChart({ chart }: { chart: Extract<ChartSpec, { type: 'line' }> }) {
  const n = chart.categories.length;
  const max = niceMax(Math.max(...chart.series.flatMap((x) => x.values)));
  const left = 40;
  const right = W - 14;
  const top = 16;
  const bottom = 196;
  const H = 222;
  const x = (i: number) => left + ((right - left) * (i + 0.5)) / n;
  const y = (v: number) => bottom - ((bottom - top) * v) / max;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={chart.title ?? 'Line chart'}>
      <Axis max={max} top={top} bottom={bottom} left={left} right={right} />
      {chart.series.map((se, j) => (
        <g key={se.name}>
          <polyline points={se.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={SERIES[j % 3]} strokeWidth={2} strokeLinejoin="round" />
          {se.values.map((v, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(v)} r={4} fill={SERIES[j % 3]} stroke="var(--surface)" strokeWidth={2} />
              <text x={x(i)} y={y(v) + (j === 1 ? 15 : -8)} textAnchor="middle" fontSize={9.5} fill="var(--ink)" fontWeight={600}>
                {fmt(v)}
              </text>
            </g>
          ))}
        </g>
      ))}
      {chart.categories.map((c, i) => (
        <text key={c} x={x(i)} y={bottom + 14} textAnchor="middle" fontSize={10.5} fill="var(--ink)">
          {c}
        </text>
      ))}
      <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="var(--ink-2)" strokeWidth={1} />
    </svg>
  );
}

const PIE_FILLS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--marked)', 'var(--warn)', 'var(--ink-2)', 'var(--pen)', 'var(--answered)'];

function PieChart({ chart }: { chart: Extract<ChartSpec, { type: 'pie' }> }) {
  const total = chart.slices.reduce((a, s) => a + s.value, 0) || 1;
  const cx = 110;
  const cy = 110;
  const r = 96;
  let angle = -Math.PI / 2;
  const unit = chart.valueKind === 'percent' ? '%' : '°';
  return (
    <div className="flex flex-col items-center gap-2 sm:flex-row">
      <svg viewBox="0 0 220 220" className="h-auto w-[200px]" role="img" aria-label={chart.title ?? 'Pie chart'}>
        {chart.slices.map((s, i) => {
          const a0 = angle;
          const a1 = angle + (2 * Math.PI * s.value) / total;
          angle = a1;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
          const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
          const mid = (a0 + a1) / 2;
          const lx = cx + r * 0.64 * Math.cos(mid);
          const ly = cy + r * 0.64 * Math.sin(mid);
          return (
            <g key={s.label}>
              <path d={`M${cx},${cy} L${p0[0]},${p0[1]} A${r},${r} 0 ${large} 1 ${p1[0]},${p1[1]} Z`} fill={PIE_FILLS[i % PIE_FILLS.length]} stroke="var(--surface)" strokeWidth={2} />
              {a1 - a0 > 0.28 ? (
                <text x={lx} y={ly + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--surface)">
                  {fmt(s.value)}
                  {unit}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <ul className="grid w-full grid-cols-2 gap-x-3 gap-y-1 text-[14px] text-ink">
        {chart.slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: PIE_FILLS[i % PIE_FILLS.length] }} />
            <span className="truncate">{s.label}</span>
            <span className="tnum ml-auto font-semibold">
              {fmt(s.value)}
              {unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Chart({ chart }: { chart: ChartSpec }) {
  return (
    <figure className="my-2">
      {chart.title ? <figcaption className="mb-1 text-[14px] font-semibold text-ink">{chart.title}</figcaption> : null}
      {chart.type === 'pie' ? (
        <>
          <PieChart chart={chart} />
          {chart.note ? <p className="mt-1 text-[13px] text-ink-2">{chart.note}</p> : null}
        </>
      ) : (
        <>
          {'yLabel' in chart && chart.yLabel ? <p className="text-[12px] text-ink-2">{chart.yLabel}</p> : null}
          {chart.type === 'line' ? <LineChart chart={chart} /> : <BarLike chart={chart} />}
          <Legend names={chart.series.map((s) => s.name)} />
          {chart.unit ? <p className="mt-0.5 text-[12px] text-ink-2">Values in {chart.unit}</p> : null}
        </>
      )}
    </figure>
  );
}

export function DataTable({ table }: { table: TableSpec }) {
  return (
    <figure className="my-2">
      {table.title ? <figcaption className="mb-1 text-[14px] font-semibold">{table.title}</figcaption> : null}
      <div className="x-scroll rounded-[10px] border border-line" tabIndex={0} role="region" aria-label={table.title ?? 'Data table'}>
        <table className="tnum w-full min-w-max border-collapse text-[14px]">
          <thead>
            <tr className="bg-paper">
              {table.columns.map((c) => (
                <th key={c} scope="col" className="border-b border-line px-2.5 py-2 text-left font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {row.map((cell, j) =>
                  j === 0 ? (
                    <th key={j} scope="row" className="px-2.5 py-2 text-left font-semibold">
                      {cell}
                    </th>
                  ) : (
                    <td key={j} className="px-2.5 py-2">
                      {typeof cell === 'number' ? fmt(cell) : cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.note ? <p className="mt-1 text-[13px] text-ink-2">{table.note}</p> : null}
    </figure>
  );
}
