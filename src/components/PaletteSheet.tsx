import { Check, Lock } from 'lucide-react';
import type { Attempt } from '../content/types';
import { paletteCounts, paletteStatus, type PaletteStatus } from '../exam/engine';
import { BottomSheet } from './BottomSheet';
import { Button } from './ui';

export const STATUS_LABEL: Record<PaletteStatus, string> = {
  'not-visited': 'Not visited',
  'not-answered': 'Not answered',
  answered: 'Answered',
  marked: 'Marked for review',
  'answered-marked': 'Answered & marked (evaluated)',
};

export const STATUS_CELL: Record<PaletteStatus, string> = {
  'not-visited': 'bg-not-visited text-ink',
  'not-answered': 'bg-not-answered text-on-status',
  answered: 'bg-answered text-on-status',
  marked: 'bg-marked text-on-status',
  'answered-marked': 'bg-marked text-on-status',
};

export function StatusSwatch({ status, children }: { status: PaletteStatus; children?: React.ReactNode }) {
  return (
    <span className={`relative inline-flex h-7 min-w-7 items-center justify-center rounded-[8px] px-1 text-[13px] font-bold tnum ${STATUS_CELL[status]}`}>
      {children}
      {status === 'answered-marked' ? (
        <span className="absolute -right-1 -bottom-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-answered ring-2 ring-surface" aria-hidden>
          <Check size={10} strokeWidth={3.5} className="text-on-status" />
        </span>
      ) : null}
    </span>
  );
}

interface PaletteSheetProps {
  open: boolean;
  onClose: () => void;
  attempt: Attempt;
  onJump: (section: number, index: number) => void;
  onSubmit: () => void;
  onEndSection?: () => void;
}

export function PaletteSheet({ open, onClose, attempt, onJump, onSubmit, onEndSection }: PaletteSheetProps) {
  const s = attempt.currentSection;
  const counts = paletteCounts(attempt, s);
  const ids = attempt.sectionQuestionIds[s];
  const multi = attempt.config.sections.length > 1;
  const lastSection = s === attempt.config.sections.length - 1;
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Question palette"
      footer={
        <div className="flex gap-2">
          {multi && !lastSection && onEndSection ? (
            <Button className="flex-1" onClick={onEndSection}>
              End section
            </Button>
          ) : null}
          <Button variant="primary" className="flex-1" onClick={onSubmit}>
            Submit test
          </Button>
        </div>
      }
    >
      {multi ? (
        <div className="mb-3 flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Sections">
          {attempt.config.sections.map((sec, i) => {
            const active = i === s;
            const done = attempt.sectionEndedAt[i] > 0;
            return (
              <span
                key={i}
                role="tab"
                aria-selected={active}
                aria-disabled={!active}
                className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-[14px] ${active ? 'border-pen bg-pen/10 font-semibold text-pen' : 'border-line text-ink-2'}`}
              >
                {!active ? <Lock size={13} aria-hidden /> : null}
                {sec.title}
                {done ? ' · done' : ''}
              </span>
            );
          })}
        </div>
      ) : null}
      <ul className="mb-4 grid grid-cols-2 gap-x-3 gap-y-2 text-[14px]" aria-label="Legend">
        {(Object.keys(STATUS_LABEL) as PaletteStatus[]).map((st) => (
          <li key={st} className="flex items-center gap-2">
            <StatusSwatch status={st}>{counts[st]}</StatusSwatch>
            <span className="leading-tight">{STATUS_LABEL[st]}</span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-5 gap-2.5 min-[400px]:grid-cols-6">
        {ids.map((qid, i) => {
          const st = paletteStatus(attempt.responses[qid]);
          const current = i === attempt.currentIndex;
          return (
            <button
              key={qid}
              type="button"
              onClick={() => onJump(s, i)}
              aria-label={`Question ${i + 1}, ${STATUS_LABEL[st]}${current ? ', current' : ''}`}
              aria-current={current || undefined}
              className={`tnum relative flex h-12 items-center justify-center rounded-[10px] text-[16px] font-bold ${STATUS_CELL[st]} ${current ? 'ring-[3px] ring-pen ring-offset-2 ring-offset-surface' : ''}`}
            >
              {i + 1}
              {st === 'answered-marked' ? (
                <span className="absolute -right-1 -bottom-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-answered ring-2 ring-surface" aria-hidden>
                  <Check size={12} strokeWidth={3.5} className="text-on-status" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
