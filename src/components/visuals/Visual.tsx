/** Solution visuals, always drawn from generator ground truth (SPEC 7.5). */
import type { FamilyMember, Seat, VisualSpec } from '../../content/types';

const ARROW: Record<string, string> = { north: '↑', south: '↓', east: '→', west: '←', inside: '•', outside: '○' };

function SeatChip({ seat }: { seat: Seat }) {
  return (
    <div className="flex min-w-[40px] flex-col items-center rounded-[8px] border border-line bg-surface px-1.5 py-1">
      <span className="text-[15px] font-semibold">{seat.name || '—'}</span>
      {seat.facing ? (
        <span className="text-[11px] text-ink-2" aria-label={`faces ${seat.facing}`}>
          {ARROW[seat.facing] ?? ''} {seat.facing === 'inside' || seat.facing === 'outside' ? seat.facing : ''}
        </span>
      ) : null}
      {seat.note ? <span className="text-[11px] text-ink-2">{seat.note}</span> : null}
    </div>
  );
}

function Circular({ seats, square }: { seats: Seat[]; square?: boolean }) {
  const n = seats.length;
  const size = 260;
  const c = size / 2;
  const r = 100;
  const pos = (i: number): [number, number] => {
    if (square && n === 8) {
      const pts: [number, number][] = [
        [-1, -1],
        [0, -1],
        [1, -1],
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 1],
        [-1, 0],
      ];
      return [c + pts[i][0] * 88, c + pts[i][1] * 88];
    }
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-auto w-full max-w-[280px]" role="img" aria-label={`Final arrangement: ${seats.map((s) => s.name).join(', ')} clockwise from the top`}>
      {square ? (
        <rect x={c - 88} y={c - 88} width={176} height={176} fill="none" stroke="var(--line)" strokeWidth={2} rx={6} />
      ) : (
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line)" strokeWidth={2} />
      )}
      {seats.map((s, i) => {
        const [x, y] = pos(i);
        const inside = s.facing === 'inside';
        const outside = s.facing === 'outside';
        const ax = c - x;
        const ay = c - y;
        const len = Math.hypot(ax, ay) || 1;
        const dir = inside ? 1 : outside ? -1 : 0;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={19} fill="var(--surface)" stroke="var(--ink-2)" strokeWidth={1.5} />
            <text x={x} y={y + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--ink)">
              {s.name.length > 4 ? s.name.slice(0, 4) : s.name}
            </text>
            {dir ? (
              <line x1={x + (ax / len) * 21 * dir} y1={y + (ay / len) * 21 * dir} x2={x + (ax / len) * 31 * dir} y2={y + (ay / len) * 31 * dir} stroke="var(--pen)" strokeWidth={2.5} strokeLinecap="round" />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function VennView({ sets, worlds }: { sets: string[]; worlds: { label?: string; regions: string[][] }[] }) {
  if (sets.length > 3) {
    return (
      <div className="space-y-2 text-[14px]">
        {worlds.map((w, i) => (
          <div key={i}>
            {w.label ? <p className="font-semibold">{w.label}</p> : null}
            <p className="text-ink-2">Occupied regions: {w.regions.map((r) => r.join('∩')).join(', ')}</p>
          </div>
        ))}
      </div>
    );
  }
  const centres: [number, number][] = sets.length === 2 ? [[95, 80], [165, 80]] : [[100, 72], [160, 72], [130, 124]];
  const R = sets.length === 2 ? 58 : 52;
  // A marker point inside each exact region (approximate positions for the standard layouts).
  const regionPoint = (region: string[]): [number, number] => {
    const idx = region.map((r) => sets.indexOf(r)).sort().join('');
    const two: Record<string, [number, number]> = { '0': [70, 80], '1': [190, 80], '01': [130, 80] };
    const three: Record<string, [number, number]> = { '0': [78, 58], '1': [182, 58], '2': [130, 158], '01': [130, 50], '02': [104, 112], '12': [156, 112], '012': [130, 92] };
    return (sets.length === 2 ? two : three)[idx] ?? [130, 90];
  };
  return (
    <div className="space-y-3">
      {worlds.map((w, i) => (
        <figure key={i}>
          {w.label ? <figcaption className="text-[14px] font-semibold">{w.label}</figcaption> : null}
          <svg viewBox="0 0 260 190" className="h-auto w-full max-w-[300px]" role="img" aria-label={`Venn diagram ${w.label ?? ''}: occupied regions ${w.regions.map((r) => r.join(' and ')).join('; ')}`}>
            {centres.map(([x, y], k) => (
              <g key={k}>
                <circle cx={x} cy={y} r={R} fill="var(--pen)" fillOpacity={0.06} stroke="var(--ink-2)" strokeWidth={1.5} />
                <text x={x + (k === 0 ? -R + 6 : k === 1 ? R - 6 : 0)} y={k === 2 ? y + R + 14 : y - R + 2} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--ink)">
                  {sets[k]}
                </text>
              </g>
            ))}
            {w.regions.map((region, k) => {
              const [x, y] = regionPoint(region);
              return <circle key={k} cx={x} cy={y} r={5} fill="var(--pen)" />;
            })}
          </svg>
        </figure>
      ))}
      <p className="text-[13px] text-ink-2">A dot marks a region that must contain something in that case.</p>
    </div>
  );
}

function PathView({ spec }: { spec: Extract<VisualSpec, { type: 'path' }> }) {
  const xs = spec.points.map((p) => p.x);
  const ys = spec.points.map((p) => p.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 0);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 0);
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const W = 260;
  const pad = 28;
  const k = (W - 2 * pad) / span;
  const px = (x: number) => pad + (x - minX) * k;
  const py = (y: number) => pad + (maxY - y) * k;
  const H = Math.max(120, (maxY - minY) * k + 2 * pad);
  const byLabel = new Map(spec.points.filter((p) => p.label).map((p) => [p.label!, p]));
  const from = spec.shortest ? byLabel.get(spec.shortest.from) : undefined;
  const to = spec.shortest ? byLabel.get(spec.shortest.to) : undefined;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[300px]" role="img" aria-label="Path drawn from the start point">
      <text x={W - 16} y={16} fontSize={11} fill="var(--ink-2)" textAnchor="middle">
        N ↑
      </text>
      <polyline points={spec.points.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')} fill="none" stroke="var(--ink)" strokeWidth={2} />
      {from && to ? (
        <g>
          <line x1={px(from.x)} y1={py(from.y)} x2={px(to.x)} y2={py(to.y)} stroke="var(--pen)" strokeWidth={2} strokeDasharray="5 4" />
          <text x={(px(from.x) + px(to.x)) / 2 + 6} y={(py(from.y) + py(to.y)) / 2 - 6} fontSize={12} fontWeight={700} fill="var(--pen)">
            {spec.shortest!.label}
          </text>
        </g>
      ) : null}
      {spec.points.map((p, i) => (
        <g key={i}>
          <circle cx={px(p.x)} cy={py(p.y)} r={4} fill={i === 0 ? 'var(--answered)' : 'var(--ink)'} />
          {p.label ? (
            <text x={px(p.x) + 7} y={py(p.y) - 7} fontSize={12} fontWeight={600} fill="var(--ink)">
              {p.label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

function FamilyView({ spec }: { spec: Extract<VisualSpec, { type: 'family' }> }) {
  const gens = [...new Set(spec.members.map((m) => m.generation))].sort((a, b) => a - b);
  const spouseOf = new Map<string, string>();
  for (const l of spec.links) if (l.type === 'spouse') spouseOf.set(l.a, l.b);
  const parentsOf = (id: string) => spec.links.filter((l) => l.type === 'parent' && l.child === id).map((l) => (l as { parent: string }).parent);
  const name = new Map(spec.members.map((m) => [m.id, m.name]));
  const sym = (m: FamilyMember) => (m.gender === 'm' ? '♂' : m.gender === 'f' ? '♀' : '?');
  return (
    <div className="space-y-2 text-[14px]">
      {gens.map((g) => (
        <div key={g} className="rounded-[10px] border border-line p-2">
          <p className="mb-1 text-[12px] text-ink-2">Generation {g + 1}</p>
          <div className="flex flex-wrap gap-2">
            {spec.members
              .filter((m) => m.generation === g)
              .map((m) => {
                const parents = parentsOf(m.id);
                return (
                  <span key={m.id} className="rounded-[8px] bg-paper px-2 py-1">
                    <strong>{m.name}</strong> <span aria-label={m.gender === 'm' ? 'male' : m.gender === 'f' ? 'female' : 'gender unknown'}>{sym(m)}</span>
                    {spouseOf.has(m.id) ? <span className="text-ink-2"> ⚭ {name.get(spouseOf.get(m.id)!)}</span> : null}
                    {parents.length ? <span className="block text-[12px] text-ink-2">child of {parents.map((p) => name.get(p)).join(' & ')}</span> : null}
                  </span>
                );
              })}
          </div>
        </div>
      ))}
      <p className="text-[12px] text-ink-2">♂ male · ♀ female · ? not known · ⚭ married to</p>
    </div>
  );
}

export function Visual({ spec }: { spec: VisualSpec }) {
  let body: React.ReactNode = null;
  switch (spec.type) {
    case 'linear':
      body = (
        <div className="space-y-2">
          {spec.rows.map((row, i) => (
            <div key={i}>
              {row.label ? <p className="mb-1 text-[12px] text-ink-2">{row.label}</p> : null}
              <div className="x-scroll">
                <div className="flex w-max gap-1.5">
                  {row.seats.map((s, j) => (
                    <SeatChip key={j} seat={s} />
                  ))}
                </div>
              </div>
            </div>
          ))}
          <p className="text-[12px] text-ink-2">Left to right as seen from above.</p>
        </div>
      );
      break;
    case 'circular':
      body = <Circular seats={spec.seats} />;
      break;
    case 'square':
      body = <Circular seats={spec.seats} square />;
      break;
    case 'grid':
      body = (
        <div className="x-scroll rounded-[10px] border border-line">
          <table className="tnum w-full min-w-max border-collapse text-[14px]">
            <thead>
              <tr className="bg-paper">
                {spec.columns.map((c) => (
                  <th key={c} scope="col" className="border-b border-line px-2.5 py-1.5 text-left font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spec.rows.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  {r.map((cell, j) => (
                    <td key={j} className={`px-2.5 py-1.5 ${j === 0 ? 'font-semibold' : ''}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      break;
    case 'venn':
      body = <VennView sets={spec.sets} worlds={spec.worlds} />;
      break;
    case 'path':
      body = <PathView spec={spec} />;
      break;
    case 'family':
      body = <FamilyView spec={spec} />;
      break;
    case 'chain':
      body = (
        <div className="space-y-1 font-semibold">
          {spec.lines.map((l, i) => (
            <p key={i} className="tnum text-[16px]">
              {l.highlight?.length
                ? (() => {
                    const parts: React.ReactNode[] = [];
                    let pos = 0;
                    l.highlight.forEach(([a, b], k) => {
                      if (a > pos) parts.push(l.text.slice(pos, a));
                      parts.push(
                        <mark key={k} className="rounded bg-pen/15 px-0.5 text-pen">
                          {l.text.slice(a, b)}
                        </mark>,
                      );
                      pos = b;
                    });
                    parts.push(l.text.slice(pos));
                    return parts;
                  })()
                : l.text}
            </p>
          ))}
        </div>
      );
      break;
    case 'order':
      body = (
        <ol className="flex flex-wrap items-center gap-1.5 text-[15px]">
          {spec.items.map((it, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span className="rounded-[8px] border border-line bg-surface px-2 py-0.5 font-semibold">{it}</span>
              {i < spec.items.length - 1 ? <span aria-hidden className="text-ink-2">{'>'}</span> : null}
            </li>
          ))}
        </ol>
      );
      break;
  }
  return (
    <figure className="mt-3">
      {'label' in spec && spec.type === 'order' && spec.label ? <figcaption className="mb-1 text-[13px] text-ink-2">{spec.label}</figcaption> : null}
      {body}
      {spec.caption ? <figcaption className="mt-1 text-[13px] text-ink-2">{spec.caption}</figcaption> : null}
    </figure>
  );
}
