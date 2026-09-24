/**
 * R12 — Data sufficiency. SPEC 8.2.
 *
 * Subtypes (each reuses a small world model of the R7–R11 chapters):
 *  - ranking         comparison of heights / weights / marks
 *  - blood-relation  relation inside a closed family (stated size, couples, no single parent)
 *  - direction       points linked by exact and "due north" clues; direction or shortest distance
 *  - seating         small linear (facing north) or circular (facing centre) arrangements
 *  - coding          sentence coding ("'sky is blue' is written as 'ka la ta'")
 *
 * The answer category (A–E, fixed standard order) is chosen uniformly first; statements are then searched so
 * that exhaustive enumeration of the worlds consistent with I, with II and with I + II gives that category.
 * The independent verifier re-enumerates each model with different code.
 */
import type { GenMeta, SubtypeDef } from "../types";
import { defineGenerator } from "../types";
import { makeQuestion, single } from "../shared/question";
import { fixedChoices } from "../shared/options";
import { targetSeconds } from "../../targets";
import type { Rich } from "../../types";
import {
  DS_OPTIONS,
  DS_SHORT,
  type Category,
  type DsDraft,
} from "./data-sufficiency/common";
import { buildRanking, type DsRankingFacts } from "./data-sufficiency/ranking";
import { buildFamily, type DsFamilyFacts } from "./data-sufficiency/family";
import {
  buildDirection,
  type DsDirectionFacts,
} from "./data-sufficiency/direction";
import { buildSeating, type DsSeatingFacts } from "./data-sufficiency/seating";
import { buildCoding, type DsCodingFacts } from "./data-sufficiency/coding";

export type {
  DsRankingFacts,
  RankClue,
  RankAsk,
  RankAttr,
} from "./data-sufficiency/ranking";
export type {
  DsFamilyFacts,
  FamClue,
  FamWord,
} from "./data-sufficiency/family";
export type {
  DsDirectionFacts,
  DirClue,
  DirAsk,
  Dir4,
} from "./data-sufficiency/direction";
export type {
  DsSeatingFacts,
  SeatClue,
  SeatAsk,
  SeatLayout,
} from "./data-sufficiency/seating";
export type {
  DsCodingFacts,
  CodedSentence,
  CodeAsk,
} from "./data-sufficiency/coding";
export { DS_OPTIONS } from "./data-sufficiency/common";

export type DataSufficiencyFacts =
  | DsRankingFacts
  | DsFamilyFacts
  | DsDirectionFacts
  | DsSeatingFacts
  | DsCodingFacts;

const META: GenMeta = {
  name: "reasoning.data-sufficiency",
  version: 1,
  subject: "reasoning",
  chapter: "data-sufficiency",
};

const SUBTYPES: readonly SubtypeDef[] = [
  { id: "ranking", label: "Ranking / comparison", weight: 1.5 },
  { id: "blood-relation", label: "Blood relation", weight: 1.5 },
  { id: "direction", label: "Direction & distance", weight: 1 },
  { id: "seating", label: "Seating arrangement", weight: 1 },
  { id: "coding", label: "Coding–decoding", weight: 1 },
];

const DIRECTIONS =
  "*The question below is followed by two statements numbered I and II. Decide whether the data given in the statements are sufficient to answer the question.*";

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function trapFor(cat: Category): Rich {
  switch (cat) {
    case 0:
      return "Statement II looks useful but still leaves more than one answer — do not upgrade to “both together” (D) or “either” (C) when only I works alone.";
    case 1:
      return "Statement I looks useful but still leaves more than one answer — do not upgrade to “both together” (D) or “either” (C) when only II works alone.";
    case 2:
      return "Each statement alone already fixes the answer. Marking D (“both together are necessary”) is the classic mistake — check each statement on its own first.";
    case 3:
      return "Neither statement alone is enough, but do not stop at E — combine them and test again.";
    case 4:
      return "Combining the statements narrows the possibilities, but more than one answer still survives — a guess from one convenient case is not sufficiency.";
  }
}

export const generator = defineGenerator<DataSufficiencyFacts>(
  META,
  SUBTYPES,
  ({ meta, seed, difficulty, subtype, rng }) => {
    const target = rng.int(0, 4) as Category;
    let draft: DsDraft<DataSufficiencyFacts> | null = null;
    for (let attempt = 0; attempt < 60 && !draft; attempt++) {
      const r = rng.fork(`a${attempt}`);
      switch (subtype.id) {
        case "ranking":
          draft = buildRanking(r, difficulty, target);
          break;
        case "blood-relation":
          draft = buildFamily(r, difficulty, target);
          break;
        case "direction":
          draft = buildDirection(r, difficulty, target);
          break;
        case "seating":
          draft = buildSeating(r, difficulty, target);
          break;
        case "coding":
          draft = buildCoding(r, difficulty, target);
          break;
        default:
          throw new Error(`${meta.name}: unhandled subtype ${subtype.id}`);
      }
    }
    if (!draft)
      throw new Error(
        `${meta.name}: could not build ${subtype.id}/${difficulty} for category ${target}`,
      );
    const { res } = draft;
    const verdict = (a: Set<string>) =>
      a.size === 1 ? "**sufficient**" : "**not sufficient**";
    const steps: Rich[] = [
      `Statement I alone: ${draft.say(res.ansI)} → ${verdict(res.ansI)}.`,
      `Statement II alone: ${draft.say(res.ansII)} → ${verdict(res.ansII)}.`,
    ];
    if (target >= 3)
      steps.push(
        `I and II together: ${draft.say(res.ansBoth)} → ${verdict(res.ansBoth)}.`,
      );
    steps.push(`Hence ${DS_SHORT[target]} → option ${"ABCDE"[target]}.`);
    const choices = fixedChoices([...DS_OPTIONS], target);
    const prompt = `${DIRECTIONS}\n\n${draft.context ? draft.context + "\n" : ""}**${draft.question}**\n\n**I.** ${draft.I}\n**II.** ${draft.II}`;
    const q = makeQuestion(meta, seed, {
      subtype: subtype.id,
      difficulty,
      prompt,
      options: choices.options,
      answerIndex: choices.answerIndex,
      solution: {
        steps: steps.map((s) => cap(s)),
        shortcut: draft.shortcut,
        trap: trapFor(target),
        ...(draft.visual ? { visual: draft.visual } : {}),
      },
      tags: ["ds:standard-five", ...draft.tags],
      targetSeconds: targetSeconds("critical-reasoning", difficulty),
    });
    return { item: single(q), facts: draft.facts };
  },
);
