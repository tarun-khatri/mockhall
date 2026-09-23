import { memo } from 'react';
import { Rich } from './Rich';

export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'muted';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** OMR-style bubble: hollow circle with the letter; fills with ink when chosen (the one signature element). */
export function Bubble({ index, state }: { index: number; state: OptionState }) {
  const fill =
    state === 'selected'
      ? 'bg-pen border-pen text-on-status'
      : state === 'correct'
        ? 'bg-answered border-answered text-on-status'
        : state === 'wrong'
          ? 'bg-not-answered border-not-answered text-on-status'
          : 'bg-transparent border-ink-2 text-ink-2';
  return (
    <span aria-hidden className={`bubble inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[15px] font-semibold ${fill}`}>
      {LETTERS[index]}
    </span>
  );
}

interface OptionRowProps {
  index: number;
  text: string;
  state: OptionState;
  disabled?: boolean;
  /** Extra label for screen readers and solutions ("Correct answer", "Your answer"). */
  note?: string;
  onSelect?: (index: number) => void;
}

export const OptionRow = memo(function OptionRow({ index, text, state, disabled, note, onSelect }: OptionRowProps) {
  const ring =
    state === 'selected'
      ? 'border-pen bg-pen/8 border-2'
      : state === 'correct'
        ? 'border-answered bg-answered/10 border-2'
        : state === 'wrong'
          ? 'border-not-answered bg-not-answered/10 border-2'
          : 'border-line bg-surface border';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={state === 'selected'}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : () => onSelect?.(index)}
      className={`flex min-h-[52px] w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[16px] leading-snug ${ring} ${disabled ? 'cursor-default' : 'active:bg-pen/5'}`}
    >
      <Bubble index={index} state={state} />
      <span className="min-w-0 flex-1 break-words">
        <Rich text={text} inline className="tnum" />
        {note ? <span className={`mt-0.5 block text-[13px] font-semibold ${state === 'wrong' ? 'text-not-answered' : 'text-answered'}`}>{note}</span> : null}
      </span>
    </button>
  );
});

export { LETTERS };
