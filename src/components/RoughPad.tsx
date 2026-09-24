import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Pen, Trash2, Undo2, X } from 'lucide-react';
import { Rich } from './Rich';

type Point = [number, number];
interface Stroke {
  tool: 'pen' | 'eraser';
  points: Point[];
}

/** Strokes per question for the attempt (kept in sessionStorage so a reload keeps rough work). */
const memory = new Map<string, Stroke[]>();
function load(key: string): Stroke[] {
  if (memory.has(key)) return memory.get(key)!;
  try {
    const raw = sessionStorage.getItem(`mockhall:pad:${key}`);
    if (raw) {
      const s = JSON.parse(raw) as Stroke[];
      memory.set(key, s);
      return s;
    }
  } catch {
    /* ignore */
  }
  return [];
}
function save(key: string, strokes: Stroke[]) {
  memory.set(key, strokes);
  try {
    sessionStorage.setItem(`mockhall:pad:${key}`, JSON.stringify(strokes));
  } catch {
    /* quota — keep in memory only */
  }
}

function draw(ctx: CanvasRenderingContext2D, strokes: Stroke[], ink: string) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  for (const s of strokes) {
    if (!s.points.length) continue;
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ink;
    ctx.lineWidth = (s.tool === 'eraser' ? 22 : 2.4) * devicePixelRatio;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const [x0, y0] = s.points[0];
    ctx.moveTo(x0, y0);
    // Quadratic smoothing through midpoints.
    for (let i = 1; i < s.points.length - 1; i++) {
      const [x1, y1] = s.points[i];
      const [x2, y2] = s.points[i + 1];
      ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
    }
    const last = s.points[s.points.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

export function RoughPad({ padKey, prompt, onClose }: { padKey: string; prompt: string; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>(() => load(padKey));
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const current = useRef<Stroke | null>(null);

  const redraw = useCallback(
    (list: Stroke[]) => {
      const c = canvas.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (ctx) draw(ctx, list, getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#15213d');
    },
    [],
  );

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const resize = () => {
      const r = c.getBoundingClientRect();
      c.width = Math.round(r.width * devicePixelRatio);
      c.height = Math.round(r.height * devicePixelRatio);
      redraw(strokes);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [redraw, strokes]);

  const pos = (e: React.PointerEvent): Point => {
    const r = canvas.current!.getBoundingClientRect();
    return [(e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio];
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    current.current = { tool, points: [pos(e)] };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!current.current) return;
    current.current.points.push(pos(e));
    redraw([...strokes, current.current]);
  };
  const onUp = () => {
    if (!current.current) return;
    const next = [...strokes, current.current];
    current.current = null;
    setStrokes(next);
    save(padKey, next);
  };

  const update = (next: Stroke[]) => {
    setStrokes(next);
    save(padKey, next);
    redraw(next);
  };

  const btn = (active: boolean) => `flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-[10px] px-2 text-[14px] font-semibold ${active ? 'bg-pen text-on-status' : 'text-ink'}`;

  return (
    <div role="dialog" aria-modal="true" aria-label="Rough pad" className="fixed inset-0 z-[65] mx-auto flex max-w-[480px] flex-col bg-paper">
      <div className="max-h-[35dvh] shrink-0 overflow-y-auto border-b border-line bg-surface px-4 py-3" tabIndex={0}>
        <Rich text={prompt} className="text-[15px]" />
      </div>
      <canvas
        ref={canvas}
        className="min-h-0 flex-1 touch-none bg-surface"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        aria-label="Drawing area for rough work"
      />
      <div className="safe-bottom flex items-center gap-1 border-t border-line bg-surface px-2 py-1.5">
        <button type="button" className={btn(tool === 'pen')} onClick={() => setTool('pen')} aria-pressed={tool === 'pen'}>
          <Pen size={18} aria-hidden /> Pen
        </button>
        <button type="button" className={btn(tool === 'eraser')} onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'}>
          <Eraser size={18} aria-hidden /> Eraser
        </button>
        <button type="button" className={btn(false)} onClick={() => update(strokes.slice(0, -1))} disabled={!strokes.length} aria-label="Undo">
          <Undo2 size={18} aria-hidden />
        </button>
        <button type="button" className={btn(false)} onClick={() => update([])} disabled={!strokes.length} aria-label="Clear">
          <Trash2 size={18} aria-hidden />
        </button>
        <span className="flex-1" />
        <button type="button" className={btn(false)} onClick={onClose} aria-label="Close rough pad">
          <X size={20} aria-hidden /> Close
        </button>
      </div>
    </div>
  );
}
