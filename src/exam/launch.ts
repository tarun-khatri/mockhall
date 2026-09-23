import type { Item, TestConfig } from '../content/types';
import { assemble, targetTotalSeconds } from './assemble';
import { chapterSeconds } from './configs';
import type { SectionInput } from './engine';
import { useExam } from './store';

/** Fill in counts (and chapter-test timing) from the assembled sections. */
export function finaliseConfig(config: TestConfig, sections: SectionInput[]): TestConfig {
  return {
    ...config,
    sections: config.sections.map((s, i) => {
      const count = sections[i].questions.length;
      let seconds = s.seconds;
      if (config.kind === 'chapter-test' || config.kind === 'weak-mix') seconds = chapterSeconds(targetTotalSeconds(sections[i]), config.pace);
      if (config.kind === 'practice' || config.kind === 'mistakes') seconds = 0;
      return { ...s, count, seconds };
    }),
  };
}

export async function prepare(config: TestConfig): Promise<{ config: TestConfig; sections: SectionInput[] }> {
  const sections = await assemble(config);
  return { config: finaliseConfig(config, sections), sections };
}

export async function launch(config: TestConfig, sections?: SectionInput[]): Promise<string> {
  const ready = sections ? { config: finaliseConfig(config, sections), sections } : await prepare(config);
  return useExam.getState().begin(ready.config, ready.sections);
}

/** Start an untimed, instant-feedback test from ready-made items (mistakes revision, "Try a similar one"). */
export async function launchItems(config: TestConfig, items: Item[]): Promise<string> {
  const section: SectionInput = {
    questions: items.flatMap((i) => i.questions),
    sets: items.flatMap((i) => (i.set ? [i.set] : [])),
  };
  return launch(config, [section]);
}
