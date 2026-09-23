import { clock } from '../lib/format';

/** Countdown pill (mm:ss, tabular). Amber under 5:00, red under 1:00 with a single pulse. */
export function TimerPill({ remainingMs, elapsedMs, pulseKey, paused }: { remainingMs: number | null; elapsedMs: number; pulseKey: number; paused?: boolean }) {
  if (remainingMs === null) {
    return (
      <span className="tnum inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3 text-[16px] font-bold text-ink-2" aria-label={`Time taken ${clock(elapsedMs / 1000)}`}>
        {clock(elapsedMs / 1000)}
      </span>
    );
  }
  const secs = Math.ceil(remainingMs / 1000);
  const tone = secs <= 60 ? 'bg-not-answered text-on-status border-not-answered' : secs <= 300 ? 'bg-warn text-on-warn border-warn' : 'bg-surface text-ink border-line';
  return (
    <span
      key={secs <= 60 ? pulseKey : 0}
      role="timer"
      aria-label={`${Math.floor(secs / 60)} minutes ${secs % 60} seconds left${paused ? ', paused' : ''}`}
      className={`tnum inline-flex min-h-9 items-center rounded-full border px-3 text-[17px] font-bold ${tone} ${secs <= 60 && pulseKey ? 'pulse-once' : ''}`}
    >
      {paused ? 'Paused ' : ''}
      {clock(secs)}
    </span>
  );
}
