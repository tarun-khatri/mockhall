import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { useAsync } from '../app/useAsync';
import { readLog } from '../lib/storage';
import { chapterStats } from '../analytics';
import { SUBJECT_TITLE, chaptersFor, weightLabel, type ChapterMeta } from '../content/chapters';
import type { Difficulty, Pace, Subject } from '../content/types';
import { getProvider, isAvailable, type ChapterProvider } from '../content/providers';
import { BottomSheet } from '../components/BottomSheet';
import { Button, Chip, Divided, ListRow, SegmentedControl, Spinner } from '../components/ui';
import { useSettings, type ChapterPref } from '../app/settings';
import { chapterConfig } from '../exam/configs';
import { launch } from '../exam/launch';

const DEFAULT_PREF: ChapterPref = { difficulty: 'medium', count: 10, mode: 'practice', pace: 'exam', subtypes: [] };

function ChapterSheet({ meta, onClose }: { meta: ChapterMeta; onClose: () => void }) {
  const settings = useSettings((s) => s.settings);
  const setPref = useSettings((s) => s.setChapterPref);
  const navigate = useNavigate();
  const [pref, setLocal] = useState<ChapterPref>(settings.chapterPrefs[meta.id] ?? DEFAULT_PREF);
  const [provider, setProvider] = useState<ChapterProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSubtypes, setShowSubtypes] = useState(pref.subtypes.length > 0);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    getProvider(meta.id).then(setProvider, (e: Error) => setError(e.message));
  }, [meta.id]);

  const update = (patch: Partial<ChapterPref>) => setLocal((p) => ({ ...p, ...patch }));
  const diffs: (Difficulty | 'mixed')[] = ['easy', 'medium', 'hard', 'extreme', 'mixed'];
  const available = (d: Difficulty | 'mixed') => d === 'mixed' || !provider || provider.difficulties.includes(d);

  const start = async () => {
    setStarting(true);
    setError(null);
    setPref(meta.id, pref);
    try {
      const id = await launch(
        chapterConfig({
          chapter: meta.id,
          exam: settings.targetExam,
          count: pref.count,
          difficulty: available(pref.difficulty) ? pref.difficulty : 'mixed',
          mode: pref.mode,
          pace: pref.pace,
          subtypes: pref.subtypes,
        }),
      );
      navigate(`/test/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={meta.title}
      footer={
        <Button variant="primary" className="w-full" onClick={() => void start()} disabled={!provider || starting}>
          {starting ? 'Preparing…' : 'Start'}
        </Button>
      }
    >
      {!provider && !error ? <Spinner label="Loading chapter" /> : null}
      {error ? <p className="py-2 text-not-answered">{error}</p> : null}
      <div className="space-y-4 pt-1">
        <div>
          <p className="mb-1.5 text-[14px] font-semibold text-ink-2">Difficulty</p>
          <SegmentedControl<Difficulty | 'mixed'>
            label="Difficulty"
            value={pref.difficulty}
            onChange={(difficulty) => update({ difficulty })}
            options={diffs.filter(available).map((d) => ({ value: d, label: d === 'extreme' ? 'Extreme' : d.charAt(0).toUpperCase() + d.slice(1) }))}
          />
          <p className="mt-1 text-[13px] text-ink-2">
            {pref.difficulty === 'easy'
              ? 'Warm-up, slightly below exam level.'
              : pref.difficulty === 'medium'
                ? 'Exactly SBI/IBPS Clerk prelims level.'
                : pref.difficulty === 'hard'
                  ? 'Toughest clerk shifts and PO prelims level.'
                  : pref.difficulty === 'extreme'
                    ? 'Mains level and beyond. Nobody should get all of these.'
                    : '20% easy · 35% medium · 30% hard · 15% extreme.'}
          </p>
        </div>
        <div>
          <p className="mb-1.5 text-[14px] font-semibold text-ink-2">Questions</p>
          <SegmentedControl<string> label="Number of questions" value={String(pref.count)} onChange={(v) => update({ count: Number(v) })} options={[10, 20, 30, 50].map((n) => ({ value: String(n), label: String(n) }))} />
        </div>
        <div>
          <p className="mb-1.5 text-[14px] font-semibold text-ink-2">Mode</p>
          <SegmentedControl<'practice' | 'test'>
            label="Mode"
            value={pref.mode}
            onChange={(mode) => update({ mode })}
            options={[
              { value: 'practice', label: 'Practice' },
              { value: 'test', label: 'Test' },
            ]}
          />
          <p className="mt-1 text-[13px] text-ink-2">{pref.mode === 'practice' ? 'See the answer and solution right after each question.' : 'Timed like the exam; solutions at the end.'}</p>
        </div>
        {pref.mode === 'test' ? (
          <div>
            <p className="mb-1.5 text-[14px] font-semibold text-ink-2">Pace</p>
            <SegmentedControl<Pace>
              label="Pace"
              value={pref.pace}
              onChange={(pace) => update({ pace })}
              options={[
                { value: 'exam', label: 'Exam' },
                { value: 'pressure', label: 'Pressure' },
                { value: 'relaxed', label: 'Relaxed' },
                { value: 'untimed', label: 'Untimed' },
              ]}
            />
          </div>
        ) : null}
        {provider && provider.subtypes.length > 1 ? (
          <div>
            <button type="button" onClick={() => setShowSubtypes((v) => !v)} aria-expanded={showSubtypes} className="flex min-h-11 items-center gap-1 font-semibold text-pen">
              {showSubtypes ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
              Question types {pref.subtypes.length ? `(${pref.subtypes.length} selected)` : '(all)'}
            </button>
            {showSubtypes ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {provider.subtypes.map((s) => {
                  const on = pref.subtypes.includes(s.id);
                  return (
                    <Chip key={s.id} selected={on} onClick={() => update({ subtypes: on ? pref.subtypes.filter((x) => x !== s.id) : [...pref.subtypes, s.id] })}>
                      {s.label}
                    </Chip>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}

export default function ChapterList() {
  const { subject = 'quant' } = useParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState<ChapterMeta | null>(null);
  const { data: log } = useAsync(readLog, []);
  const stats = log ? chapterStats(log) : new Map();
  const chapters = chaptersFor(subject as Subject);
  const ready = chapters.filter((c) => isAvailable(c.id));
  const later = chapters.filter((c) => !isAvailable(c.id));

  return (
    <main className="px-4 pt-2">
      <button type="button" onClick={() => navigate('/practice')} className="-ml-1 flex min-h-11 items-center gap-1 font-semibold text-pen">
        <ChevronLeft size={20} aria-hidden /> Practice
      </button>
      <h1 className="text-[24px] font-bold">{SUBJECT_TITLE[subject as Subject]}</h1>
      <div className="mt-2">
        <Divided>
          {ready.map((c) => {
            const s = stats.get(c.id);
            const w = weightLabel(c);
            return (
              <ListRow
                key={c.id}
                onClick={() => setOpen(c)}
                title={c.title}
                detail={[w, s && s.seen ? `${Math.round(s.accuracy * 100)}% accuracy · ${s.seen} done` : null].filter(Boolean).join(' · ') || 'Not practised yet'}
              />
            );
          })}
        </Divided>
      </div>
      {later.length ? (
        <>
          <h2 className="mt-6 text-[15px] font-semibold text-ink-2">Coming soon</h2>
          <Divided>
            {later.map((c) => (
              <ListRow key={c.id} disabled title={c.title} detail={c.priority === 'P3' ? 'Mains chapter — arrives before mains' : 'Arrives before IBPS Clerk prelims'} />
            ))}
          </Divided>
        </>
      ) : null}
      {open ? <ChapterSheet meta={open} onClose={() => setOpen(null)} /> : null}
      <div className="h-6" />
    </main>
  );
}
