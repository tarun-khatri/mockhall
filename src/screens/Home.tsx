import { Link, useNavigate } from 'react-router';
import { Settings as SettingsIcon } from 'lucide-react';
import { useState } from 'react';
import { useSettings, EXAM_DATES, daysUntil } from '../app/settings';
import { useAsync } from '../app/useAsync';
import { listAttempts, readLog } from '../lib/storage';
import { subjectSummary } from '../analytics';
import { SUBJECT_TITLE } from '../content/chapters';
import type { ChapterId, Subject, TestConfig } from '../content/types';
import { encodeConfig, fixedMock, sectionalConfig } from '../exam/configs';
import { EXAM_LABEL } from '../content/blueprints';
import { Chip, Divided, ListRow, SectionHeading } from '../components/ui';
import { launch } from '../exam/launch';
import { randomSeed } from '../lib/rng';

const DRILLS: { label: string; chapter: ChapterId; subject: Subject; count: number; minutes: number }[] = [
  { label: '20 simplification · 7 min', chapter: 'simplification', subject: 'quant', count: 20, minutes: 7 },
  { label: '10 inequality · 3 min', chapter: 'inequality', subject: 'reasoning', count: 10, minutes: 3 },
  { label: '10 syllogism · 5 min', chapter: 'syllogism', subject: 'reasoning', count: 10, minutes: 5 },
  { label: '10 misspelt words · 3 min', chapter: 'spelling', subject: 'english', count: 10, minutes: 3 },
  { label: '1 puzzle set · 4 min', chapter: 'puzzles', subject: 'reasoning', count: 5, minutes: 4 },
];

export function drillConfig(d: (typeof DRILLS)[number], exam: TestConfig['exam']): TestConfig {
  return {
    kind: 'drill',
    exam,
    title: `Speed drill · ${d.label}`,
    sections: [{ subject: d.subject, count: d.count, seconds: d.minutes * 60, title: d.label }],
    sectionOrder: [d.subject],
    sectionalTiming: false,
    strictTimer: false,
    instantFeedback: false,
    difficultyMix: { easy: 0, medium: 1, hard: 0, extreme: 0 },
    seed: `drill-${randomSeed()}`,
    pace: 'exam',
    chapter: d.chapter,
    difficulty: 'medium',
  };
}

export default function Home() {
  const settings = useSettings((s) => s.settings);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const { data } = useAsync(async () => ({ attempts: await listAttempts(), log: await readLog() }), []);
  const attempts = data?.attempts ?? [];
  const inProgress = attempts.find((a) => a.status === 'in-progress');
  const target = EXAM_DATES[settings.targetExam];
  const days = daysUntil(settings.targetDate || target.date);
  const doneMocks = new Set(attempts.filter((a) => a.kind === 'full-mock' && a.status === 'submitted').map((a) => a.title));
  let next = 1;
  while (next < 30 && doneMocks.has(`Mock ${String(next).padStart(2, '0')}`)) next++;
  const mock = fixedMock(next, settings.sectionOrder, settings.mockPreset, settings.strictMocks);

  const countdown = days > 1 ? `${target.label} in ${days} days` : days === 1 ? `${target.label} is tomorrow` : days === 0 ? `${target.label} is today — all the best` : `${target.label} is done`;

  const startDrill = async (d: (typeof DRILLS)[number]) => {
    setBusy(d.label);
    try {
      const id = await launch(drillConfig(d, settings.sectionOrder));
      navigate(`/test/${id}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="px-4 pt-3">
      <header className="flex min-h-12 items-center justify-between">
        <span className="text-[15px] font-bold tracking-tight">MockHall</span>
        <Link to="/settings" className="flex min-h-11 min-w-11 items-center justify-center" aria-label="Settings">
          <SettingsIcon size={22} aria-hidden />
        </Link>
      </header>
      <p className="text-[20px] font-bold leading-snug">{countdown}</p>
      <p className="text-[14px] text-ink-2">Free mocks with the real exam rules. Everything stays on this phone.</p>

      {inProgress ? (
        <>
          <SectionHeading>Continue</SectionHeading>
          <Divided>
            <ListRow to={`/test/${inProgress.id}`} title={`Resume test · ${inProgress.title}`} detail={`${inProgress.questions} questions · started ${new Date(inProgress.createdAt).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}`} />
          </Divided>
        </>
      ) : null}

      <SectionHeading>Full mock</SectionHeading>
      <Link to={`/start?c=${encodeConfig(mock)}`} className="mt-1 flex min-h-16 flex-col justify-center rounded-[12px] bg-pen px-4 py-3 text-on-status">
        <span className="text-[18px] font-bold">Start {mock.title}</span>
        <span className="text-[14px] opacity-90">
          100 questions · 60 minutes · {EXAM_LABEL[settings.sectionOrder]} pattern
        </span>
      </Link>

      <SectionHeading action={<Link to="/mocks" className="text-[14px] font-semibold text-pen">All mocks</Link>}>Sectional mocks</SectionHeading>
      <Divided>
        {(['english', 'quant', 'reasoning'] as Subject[]).map((s) => (
          <ListRow
            key={s}
            to={`/start?c=${encodeConfig(sectionalConfig(s, settings.sectionOrder, settings.mockPreset, settings.strictMocks))}`}
            title={SUBJECT_TITLE[s]}
            detail={`${s === 'english' ? 30 : 35} questions · 20 minutes`}
          />
        ))}
      </Divided>

      <SectionHeading>Practice by subject</SectionHeading>
      <Divided>
        {(['quant', 'reasoning', 'english'] as Subject[]).map((s) => {
          const sum = data ? subjectSummary(data.log, s) : null;
          return (
            <ListRow
              key={s}
              to={`/practice/${s}`}
              title={SUBJECT_TITLE[s]}
              detail={sum && sum.questions ? `${sum.practised} of ${sum.total} chapters practised · ${Math.round(sum.accuracy * 100)}% accuracy` : 'Not practised yet'}
            />
          );
        })}
      </Divided>

      <SectionHeading>Speed drills</SectionHeading>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
        {DRILLS.map((d) => (
          <Chip key={d.label} onClick={() => void startDrill(d)}>
            {busy === d.label ? 'Preparing…' : d.label}
          </Chip>
        ))}
      </div>
      <div className="h-6" />
    </main>
  );
}
