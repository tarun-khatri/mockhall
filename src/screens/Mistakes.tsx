import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAsync } from '../app/useAsync';
import { readMistakes, type MistakeEntry } from '../lib/storage';
import { CHAPTERS, chapterMeta } from '../content/chapters';
import type { ChapterId, Item, Subject, TestConfig } from '../content/types';
import { Button, Divided, ListRow, Spinner } from '../components/ui';
import { launchItems } from '../exam/launch';
import { useSettings } from '../app/settings';
import { randomSeed } from '../lib/rng';

/** Rebuild items from saved snapshots, keeping set questions together with their stimulus. */
function toItems(entries: MistakeEntry[]): Item[] {
  const bySet = new Map<string, Item>();
  const items: Item[] = [];
  for (const e of entries) {
    if (e.set) {
      let it = bySet.get(e.set.id);
      if (!it) {
        it = { set: { ...e.set, questionIds: [] }, questions: [] };
        bySet.set(e.set.id, it);
        items.push(it);
      }
      it.questions.push(e.question);
      it.set!.questionIds.push(e.question.id);
    } else items.push({ questions: [e.question] });
  }
  return items;
}

export default function Mistakes() {
  const navigate = useNavigate();
  const exam = useSettings((s) => s.settings.targetExam);
  const { data, loading } = useAsync(readMistakes, []);
  const [busy, setBusy] = useState(false);
  if (loading || !data) return <Spinner label="Loading mistakes" />;
  const entries = Object.values(data);

  const revise = async (list: MistakeEntry[], title: string, subject: Subject) => {
    setBusy(true);
    try {
      const items = toItems(list.slice(0, 50));
      const config: TestConfig = {
        kind: 'mistakes',
        exam,
        title,
        sections: [{ subject, count: items.reduce((s, i) => s + i.questions.length, 0), seconds: 0, title }],
        sectionOrder: [subject],
        sectionalTiming: false,
        strictTimer: false,
        instantFeedback: true,
        difficultyMix: { easy: 0.25, medium: 0.25, hard: 0.25, extreme: 0.25 },
        seed: `mistakes-${randomSeed()}`,
        pace: 'untimed',
      };
      const id = await launchItems(config, items);
      navigate(`/test/${id}`);
    } finally {
      setBusy(false);
    }
  };

  if (!entries.length)
    return (
      <main className="px-4 pt-4">
        <h1 className="text-[24px] font-bold">Mistakes</h1>
        <p className="mt-3 text-ink-2">No mistakes saved yet. Take a chapter test and your wrong answers will collect here.</p>
      </main>
    );

  const groups = new Map<ChapterId, MistakeEntry[]>();
  for (const e of entries) {
    const list = groups.get(e.question.chapter) ?? [];
    list.push(e);
    groups.set(e.question.chapter, list);
  }
  const ordered = CHAPTERS.filter((c) => groups.has(c.id));

  return (
    <main className="px-4 pt-4 pb-8">
      <h1 className="text-[24px] font-bold">Mistakes</h1>
      <p className="text-[14px] text-ink-2">
        {entries.length} saved: wrong answers, questions you opened and skipped, and bookmarks. Revise them untimed with instant answers; a question leaves the list after two correct answers in a row.
      </p>
      <Button variant="primary" className="mt-4 w-full" disabled={busy} onClick={() => void revise(entries, 'Mistakes revision', entries[0].question.subject)}>
        {busy ? 'Preparing…' : `Revise all (${Math.min(50, entries.length)})`}
      </Button>
      <div className="mt-4">
        <Divided>
          {ordered.map((c) => {
            const list = groups.get(c.id)!;
            const wrong = list.filter((e) => e.reason === 'wrong').length;
            const skipped = list.filter((e) => e.reason === 'skipped').length;
            const saved = list.filter((e) => e.reason === 'bookmark').length;
            return (
              <ListRow
                key={c.id}
                onClick={() => void revise(list, `${chapterMeta(c.id).title} · mistakes`, c.subject)}
                title={c.title}
                detail={[wrong && `${wrong} wrong`, skipped && `${skipped} skipped`, saved && `${saved} bookmarked`].filter(Boolean).join(' · ')}
              />
            );
          })}
        </Divided>
      </div>
    </main>
  );
}
