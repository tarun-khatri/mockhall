import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Maximize2, X } from 'lucide-react';
import type { QuestionSet } from '../content/types';
import { Rich } from './Rich';
import { Chart, DataTable } from './charts/Charts';

const KIND_LABEL: Record<QuestionSet['kind'], string> = {
  puzzle: 'Puzzle',
  seating: 'Seating arrangement',
  di: 'Data interpretation',
  caselet: 'Caselet',
  rc: 'Passage',
  cloze: 'Passage',
  parajumble: 'Para jumble',
  coding: 'Coding–decoding',
  'input-output': 'Input–output',
  series: 'Series',
};

interface StimState {
  open: boolean;
  scroll: number;
}

function stateKey(scope: string, setId: string) {
  return `mockhall:stim:${scope}:${setId}`;
}

function readState(scope: string, setId: string): StimState {
  try {
    const raw = sessionStorage.getItem(stateKey(scope, setId)) ?? localStorage.getItem(stateKey(scope, setId));
    if (raw) return JSON.parse(raw) as StimState;
  } catch {
    /* ignore */
  }
  return { open: true, scroll: 0 };
}

function writeState(scope: string, setId: string, s: StimState) {
  try {
    localStorage.setItem(stateKey(scope, setId), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function StimulusBody({ set }: { set: QuestionSet }) {
  return (
    <>
      <Rich text={set.stimulus} className="text-[16px] leading-relaxed" />
      {set.chart ? <Chart chart={set.chart} /> : null}
      {set.table ? <DataTable table={set.table} /> : null}
    </>
  );
}

/**
 * Collapsible shared stimulus (puzzle clues / DI chart / passage). Open state and scroll position persist per set
 * (across questions of the set and across reloads).
 */
export function StimulusPanel({ set, scope, position, total }: { set: QuestionSet; scope: string; position: number; total: number }) {
  const [state, setState] = useState<StimState>(() => readState(scope, set.id));
  const [full, setFull] = useState(false);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setState(readState(scope, set.id));
  }, [scope, set.id]);

  useLayoutEffect(() => {
    if (state.open && body.current) body.current.scrollTop = state.scroll;
    // restore only when the set or open state changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.id, state.open]);

  const toggle = () => {
    const next = { ...state, open: !state.open };
    setState(next);
    writeState(scope, set.id, next);
  };

  const label = KIND_LABEL[set.kind];
  const isPassage = set.kind === 'rc' || set.kind === 'cloze';

  return (
    <section className="border-b border-line bg-surface" aria-label={`${label}, question ${position} of ${total}`}>
      <div className="sticky top-0 z-10 flex min-h-11 items-center gap-2 bg-surface px-4">
        <button type="button" onClick={toggle} aria-expanded={state.open} className="flex min-h-11 flex-1 items-center gap-2 text-left text-[14px] font-semibold text-ink">
          {state.open ? <ChevronUp size={20} aria-hidden /> : <ChevronDown size={20} aria-hidden />}
          <span className="truncate">
            {set.title ?? label} — question {position} of {total}
          </span>
        </button>
        {isPassage || set.kind === 'di' ? (
          <button type="button" onClick={() => setFull(true)} className="flex min-h-11 items-center gap-1 px-1 text-[14px] font-semibold text-pen">
            <Maximize2 size={18} aria-hidden />
            {isPassage ? 'Read passage' : 'Full view'}
          </button>
        ) : null}
      </div>
      {state.open ? (
        <div
          ref={body}
          onScroll={(e) => {
            const scroll = (e.target as HTMLDivElement).scrollTop;
            writeState(scope, set.id, { open: true, scroll });
          }}
          className="max-h-[45dvh] overflow-y-auto overscroll-contain px-4 pb-3"
        >
          <StimulusBody set={set} />
        </div>
      ) : null}
      {full ? (
        <div role="dialog" aria-modal="true" aria-label={set.title ?? label} className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col bg-surface">
          <div className="flex min-h-14 items-center justify-between border-b border-line px-4">
            <h2 className="truncate text-[17px] font-bold">{set.title ?? label}</h2>
            <button type="button" onClick={() => setFull(false)} className="flex min-h-11 min-w-11 items-center justify-center" aria-label="Close">
              <X size={22} aria-hidden />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <StimulusBody set={set} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
