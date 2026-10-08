import type { ExamAnswerKeyInput } from "../types";
import { AnswerKeyExtractionError, extractExamAnswerKey } from "./answer-key-extraction";

export type AnswerKeyPreview = {
  rows: ExamAnswerKeyInput[];
  source: "printed-key";
  verification: "matched" | "single-reader";
  notice: string;
};

/** Compare two separately decoded copies of the printed key; never choose between conflicting answers. */
export function verifyPrintedAnswerKeys(texts: [string | null, string | null]): AnswerKeyPreview {
  const failures: string[] = [];
  const keys = texts.flatMap((text) => {
    if (text === null) return [];
    try { return [extractExamAnswerKey(text)]; }
    catch (error) { failures.push(error instanceof Error ? error.message : "Unreadable printed key."); return []; }
  });
  if (keys.length === 0) {
    throw new AnswerKeyExtractionError(failures[0] ?? "This PDF could not be read. Upload an unlocked PDF with a readable printed answer key, or paste the official answers manually.");
  }
  if (keys.length === 2) {
    const disagreements = keys[0].filter((row, index) => row.correct_answer !== keys[1][index].correct_answer);
    if (disagreements.length) {
      throw new AnswerKeyExtractionError(`The two PDF readers disagree on questions ${disagreements.map((row) => row.question_number).join(", ")}. No preview was applied. Check the printed key and paste the official answers manually.`);
    }
  }
  return {
    rows: keys[0], source: "printed-key", verification: keys.length === 2 ? "matched" : "single-reader",
    notice: keys.length === 2
      ? "Both PDF readers agree on all 100 printed answers. Review the preview, then apply and save."
      : "100 printed answers were read, but the second reader could not verify them. Compare the preview with the PDF before applying and saving.",
  };
}
