import { describe, expect, it } from "vitest";
import { describeGenerator } from "../../helpers/harness";
import {
  generator,
  type InputOutputFacts,
} from "../../../src/content/generators/reasoning/input-output";
import {
  inferRun,
  verify,
} from "../../../src/content/verify/reasoning/input-output";
import type { GenResult } from "../../../src/content/generators/types";

function sanity(res: GenResult<InputOutputFacts>): string[] {
  const p: string[] = [];
  const f = res.facts;
  if (res.item.questions.length !== 5)
    p.push(`set of ${res.item.questions.length}`);
  if (res.item.set?.kind !== "input-output") p.push("set kind");
  if (f.input.length < 6 || f.input.length > 10)
    p.push(`input of ${f.input.length}`);
  if (new Set(f.input).size !== f.input.length)
    p.push("repeated element in input");
  const lines = inferRun(f);
  if (lines.length - 1 < 4) p.push(`only ${lines.length - 1} steps`);
  for (const l of lines) {
    if (new Set(l).size !== l.length)
      p.push(`repeated element in a step: ${l.join(" ")}`);
    for (const t of l)
      if (/^\d+$/.test(t) && (Number(t) < 10 || Number(t) > 99))
        p.push(`number ${t} out of 2-digit range`);
  }
  const stim = res.item.set?.stimulus ?? "";
  if (!stim.includes("**Step II:**") || stim.includes("**Step III:**"))
    p.push("stimulus must show exactly Input, Step I and Step II");
  return p;
}

describeGenerator(generator, { verify, sanity });

describe("input-output machine — hand-checked", () => {
  it("words to the left alphabetically, last step skips the element already in place", () => {
    const f: InputOutputFacts = {
      input: ["tiger", "mango", "apple", "delta"],
      shown: [
        ["apple", "tiger", "mango", "delta"],
        ["apple", "delta", "tiger", "mango"],
      ],
      rule: {
        cycle: [
          [{ kind: "word", order: "asc", end: "left", op: { t: "none" } }],
        ],
      },
      questions: [],
    };
    const lines = inferRun(f);
    // Step III: apple delta mango tiger — tiger is then already in place, so Step III is the last step
    expect(lines[3]).toEqual(["apple", "delta", "mango", "tiger"]);
    expect(lines.length - 1).toBe(3);
  });
  it("numbers: largest to the right with +3", () => {
    const f: InputOutputFacts = {
      input: ["45", "12", "78", "33", "61"],
      shown: [
        ["45", "12", "33", "61", "81"],
        ["45", "12", "33", "64", "81"],
      ],
      rule: {
        cycle: [
          [
            {
              kind: "num",
              order: "desc",
              end: "right",
              op: { t: "add", k: 3 },
            },
          ],
        ],
      },
      questions: [
        { t: "last-step" },
        { t: "nth", step: 4, k: 1, from: "left" },
      ],
    };
    const lines = inferRun(f);
    expect(lines[5]).toEqual(["15", "36", "48", "64", "81"]);
    expect(verify({ facts: f, item: { questions: [] } })).toEqual([
      "Step V",
      "12",
    ]);
  });
});
