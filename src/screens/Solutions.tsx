import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Flag, Shuffle, X } from 'lucide-react';
import { useAsync } from '../app/useAsync';
import { addReport, loadAttempt, readMistakes, saveAttempt, writeMistakes } from '../lib/storage';
import * as E from '../exam/engine';
import type { Attempt, Item, TestConfig } from '../content/types';
import { chapterMeta } from '../content/chapters';
import { OptionRow, type OptionState } from '../components/OptionRow';
import { Rich } from '../components/Rich';
import { StimulusPanel } from '../components/StimulusPanel';
import { SolutionBlock } from '../components/SolutionBlock';
import { Button, Chip, Spinner, Toast } from '../components/ui';
import { summarize } from '../exam/store';
import { getProvider } from '../content/providers';
import { launchItems } from '../exam/launch';
import { randomSeed } from '../lib/rng';
import { loadKatex } from '../lib/katex';
import { BottomSheet } from '../components/BottomSheet';

type Filter = 'all' | 'correct' | 'wrong' | 'skipped' | 'marked' | 'bookmarked';

export default function Solutions() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: loaded, loading } = useAsync(() => loadAttempt(id), [id]);
  const [attempt, setAttempt] = useState<Attempt | undefined>();
  const [filter, setFilter] = useState<Filter>('all');
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [similarBusy, setSimilarBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState('');

  useEffect(() => {
    void loadKatex();
  }, []);
  useEffect(() => setAttempt(loaded), [loaded]);

  const all = useMemo(() => (attempt ? attempt.sectionQuestionIds.flat() : []), [attempt]);
  const byId = useMemo(() => (attempt ? E.questionById(attempt) : new Map()), [attempt]);
  const setsById = useMemo(() => new Map((attempt?.sets ?? []).map((s) => [s.id, s])), [attempt]);

  const matches = (qid: string, f: Filter) => {
    if (!attempt) return false;
    const r = attempt.responses[qid];
    const o = E.outcomeOf(byId.get(qid)!, r);
    switch (f) {
      case 'all':
        return true;
      case 'correct':
        return o === 'correct';
      case 'wrong':
        return o === 'wrong';
      case 'skipped':
        return o === 'skipped';
      case 'marked':
        return !!r?.marked;
      case 'bookmarked':
        return (attempt.bookmarks ?? []).includes(qid);
    }
  };
  const list = all.filter((qid) => matches(qid, filter));
  const flatIndex = Math.min(Math.max(0, Number(params.get('i') ?? 0)), Math.max(0, all.length - 1));
  const current = list.includes(all[flatIndex]) ? all[flatIndex] : list[0];

  if (loading || (!attempt && loaded)) return <Spinner label="Loading solutions" />;
  if (!attempt) return <p className="px-4 pt-10">Solutions not found.</p>;

  const go = (qid: string | undefined) => {
    if (!qid) return;
    setParams({ i: String(all.indexOf(qid)) }, { replace: true });
    window.scrollTo({ top: 0 });
  };
  const pos = current ? list.indexOf(current) : -1;

  const q = current ? byId.get(current) : undefined;
  const r = current ? attempt.responses[current] : undefined;
  const set = q?.setId ? setsById.get(q.setId) : undefined;
  const bookmarked = current ? (attempt.bookmarks ?? []).includes(current) : false;
  const sectionOf = (qid: string) => attempt.sectionQuestionIds.findIndex((ids) => ids.includes(qid));

  const optionState = (i: number): OptionState => {
    if (!q) return 'idle';
    if (i === q.answerIndex) return 'correct';
    if (r?.selected === i) return 'wrong';
    return 'idle';
  };

  const toggleBookmark = async () => {
    if (!current || !q) return;
    const next = E.toggleBookmark(attempt, current);
    setAttempt(next);
    await saveAttempt(next, summarize(next));
    const m = await readMistakes();
    if ((next.bookmarks ?? []).includes(current)) m[current] = m[current] ?? { question: q, set, reason: 'bookmark', addedAt: Date.now(), streak: 0 };
    else if (m[current]?.reason === 'bookmark') delete m[current];
    await writeMistakes(m);
  };

  const trySimilar = async () => {
    if (!q) return;
    setSimilarBusy(true);
    try {
      const provider = await getProvider(q.chapter);
      let item: Item | null = null;
      for (let t = 0; t < 8 && !item; t++) {
        const candidate = await provider.item(`similar-${randomSeed()}`, q.difficulty, q.subtype);
        const sameSet = !!q.setId && candidate.set?.id === q.setId;
        if (!sameSet && !candidate.questions.some((x) => x.id === q.id)) item = candidate;
      }
      if (!item) throw new Error('No other question of this type is available yet.');
      const meta = chapterMeta(q.chapter);
      const config: TestConfig = {
        kind: 'practice',
        exam: attempt.config.exam,
        title: `${meta.title} · similar question`,
        sections: [{ subject: meta.subject, count: item.questions.length, seconds: 0, title: meta.title }],
        sectionOrder: [meta.subject],
        sectionalTiming: false,
        strictTimer: false,
        instantFeedback: true,
        difficultyMix: { easy: 0, medium: 0, hard: 0, extreme: 0, [q.difficulty]: 1 },
        seed: `similar-${randomSeed()}`,
        pace: 'untimed',
        chapter: q.chapter,
        subtypes: [q.subtype],
        difficulty: q.difficulty,
      };
      const newId = await launchItems(config, [item]);
      navigate(`/test/${newId}`);
    } catch (e) {
      setToast({ id: Date.now(), text: (e as Error).message });
    } finally {
      setSimilarBusy(false);
    }
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'correct', label: 'Correct' },
    { key: 'wrong', label: 'Wrong' },
    { key: 'skipped', label: 'Skipped' },
    { key: 'marked', label: 'Marked' },
    { key: 'bookmarked', label: 'Bookmarked' },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="flex h-14 items-center gap-2 px-2">
          <button type="button" onClick={() => navigate(`/result/${attempt.id}`)} className="flex min-h-11 min-w-11 items-center justify-center" aria-label="Close solutions">
            <X size={22} aria-hidden />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-[16px] font-bold">Solutions</h1>
          {current ? (
            <span className="tnum text-[14px] text-ink-2">
              {pos + 1} / {list.length}
            </span>
          ) : null}
        </div>
        <div className="flex gap-2 overflow-x-auto px-3 pb-2">
          {FILTERS.map((f) => (
            <Chip key={f.key} selected={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label} {all.filter((x) => matches(x, f.key)).length}
            </Chip>
          ))}
        </div>
      </header>

      {!q ? (
        <p className="px-4 pt-8 text-ink-2">No questions match this filter.</p>
      ) : (
        <main className="flex-1">
          {set ? <StimulusPanel set={set} scope={`sol-${attempt.id}`} position={set.questionIds.indexOf(q.id) + 1} total={set.questionIds.length} /> : null}
          <div className="px-4 pt-3 pb-4">
            <p className="tnum mb-2 text-[13px] text-ink-2">
              {attempt.config.sections[sectionOf(q.id)]?.title} · Q{attempt.sectionQuestionIds[sectionOf(q.id)].indexOf(q.id) + 1} · {chapterMeta(q.chapter).title} · {q.difficulty}
            </p>
            <Rich text={q.prompt} className="q-text" />
            <div className="mt-4 space-y-2.5" role="list">
              {q.options.map((o: string, i: number) => (
                <OptionRow key={i} index={i} text={o} state={optionState(i)} disabled note={i === q.answerIndex ? (r?.selected === i ? 'Your answer · correct' : 'Correct answer') : r?.selected === i ? 'Your answer' : undefined} />
              ))}
            </div>
            {r?.selected === null || r?.selected === undefined ? <p className="mt-2 text-[14px] text-ink-2">You did not answer this question.</p> : null}
            <SolutionBlock question={q} timeMs={r?.activeMs ?? 0} />
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button onClick={() => void toggleBookmark()} aria-pressed={bookmarked} className="px-2 text-[14px]">
                <span className="inline-flex items-center gap-1.5">
                  {bookmarked ? <BookmarkCheck size={18} aria-hidden /> : <Bookmark size={18} aria-hidden />}
                  {bookmarked ? 'Saved' : 'Bookmark'}
                </span>
              </Button>
              <Button onClick={() => void trySimilar()} disabled={similarBusy} className="px-2 text-[14px]">
                <span className="inline-flex items-center gap-1.5">
                  <Shuffle size={18} aria-hidden />
                  {similarBusy ? '…' : 'Similar'}
                </span>
              </Button>
              <Button onClick={() => setReportOpen(true)} className="px-2 text-[14px]">
                <span className="inline-flex items-center gap-1.5">
                  <Flag size={18} aria-hidden />
                  Report
                </span>
              </Button>
            </div>
          </div>
        </main>
      )}

      <footer className="safe-bottom sticky bottom-0 flex gap-2 border-t border-line bg-surface px-3 py-2">
        <Button className="flex-1" disabled={pos <= 0} onClick={() => go(list[pos - 1])}>
          <span className="inline-flex items-center gap-1">
            <ChevronLeft size={18} aria-hidden /> Previous
          </span>
        </Button>
        <Button variant="primary" className="flex-1" disabled={pos < 0 || pos >= list.length - 1} onClick={() => go(list[pos + 1])}>
          <span className="inline-flex items-center gap-1">
            Next <ChevronRight size={18} aria-hidden />
          </span>
        </Button>
      </footer>

      <BottomSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report a problem"
        footer={
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              if (q) void addReport({ qid: q.id, attemptId: attempt.id, note: reportText.trim(), at: Date.now(), question: q });
              setReportText('');
              setReportOpen(false);
              setToast({ id: Date.now(), text: 'Saved to your reports.' });
            }}
          >
            Save report
          </Button>
        }
      >
        <label htmlFor="sol-report" className="block text-[14px] text-ink-2">
          What looks wrong? (key, wording, typo…)
        </label>
        <textarea id="sol-report" rows={4} value={reportText} onChange={(e) => setReportText(e.target.value)} className="mt-2 w-full rounded-[12px] border border-line bg-paper p-3 text-[16px]" />
      </BottomSheet>
      {toast ? <Toast id={toast.id} text={toast.text} tone="info" onDone={() => setToast(null)} /> : null}
    </div>
  );
}
