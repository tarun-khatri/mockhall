import type { Question } from '../content/types';
import { shortDuration } from '../lib/format';
import { Rich } from './Rich';
import { Visual } from './visuals/Visual';
import { LETTERS } from './OptionRow';

/** Answer → fast method → steps → trap → visual (SPEC 7.5), plus your time vs target. */
export function SolutionBlock({ question, timeMs, fastFirst = true }: { question: Question; timeMs?: number; fastFirst?: boolean }) {
  const s = question.solution;
  const answer = (
    <p className="text-[16px] font-semibold text-answered">
      Answer: ({LETTERS[question.answerIndex]}) <Rich text={question.options[question.answerIndex]} inline />
    </p>
  );
  const fast = s.shortcut ? (
    <div className="rounded-[10px] bg-pen/8 px-3 py-2">
      <p className="text-[13px] font-semibold text-pen">Fast method</p>
      <Rich text={s.shortcut} className="text-[15px]" />
    </div>
  ) : null;
  return (
    <section className="mt-4 space-y-3 rounded-[12px] border border-line bg-surface p-4" aria-label="Solution">
      {answer}
      {timeMs !== undefined ? (
        <p className="tnum text-[14px] text-ink-2">
          Your time {shortDuration(timeMs / 1000)} · Target {shortDuration(question.targetSeconds)}
        </p>
      ) : null}
      {s.rule ? (
        <p className="text-[15px]">
          <span className="font-semibold">Rule: </span>
          {s.rule}
        </p>
      ) : null}
      {fastFirst ? fast : null}
      <div>
        <p className="text-[13px] font-semibold text-ink-2">Steps</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-[15px]">
          {s.steps.map((st, i) => (
            <li key={i}>
              <Rich text={st} inline />
            </li>
          ))}
        </ol>
      </div>
      {!fastFirst ? fast : null}
      {s.trap ? (
        <div className="rounded-[10px] bg-not-answered/8 px-3 py-2">
          <p className="text-[13px] font-semibold text-not-answered">Trap</p>
          <Rich text={s.trap} className="text-[15px]" />
        </div>
      ) : null}
      {s.visual ? <Visual spec={s.visual} /> : null}
    </section>
  );
}
