import { useAsync } from '../app/useAsync';
import { readLog } from '../lib/storage';
import { subjectSummary } from '../analytics';
import { SUBJECT_TITLE } from '../content/chapters';
import type { Subject } from '../content/types';
import { Divided, ListRow } from '../components/ui';

export default function Practice() {
  const { data: log } = useAsync(readLog, []);
  return (
    <main className="px-4 pt-4">
      <h1 className="text-[24px] font-bold">Practice</h1>
      <p className="text-[14px] text-ink-2">Chapter-wise questions at four levels. Medium is exactly clerk prelims level.</p>
      <div className="mt-3">
        <Divided>
          {(['quant', 'reasoning', 'english'] as Subject[]).map((s) => {
            const sum = log ? subjectSummary(log, s) : null;
            return (
              <ListRow
                key={s}
                to={`/practice/${s}`}
                title={SUBJECT_TITLE[s]}
                detail={sum && sum.questions ? `${sum.practised} of ${sum.total} chapters · ${sum.questions} questions · ${Math.round(sum.accuracy * 100)}% accuracy` : `${sum?.total ?? ''} chapters`}
              />
            );
          })}
        </Divided>
      </div>
    </main>
  );
}
