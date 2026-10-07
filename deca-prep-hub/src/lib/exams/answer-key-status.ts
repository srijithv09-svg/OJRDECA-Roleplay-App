import type { ExamKeyStatus } from "../types";

export const DECA_EXAM_QUESTION_COUNT = 100;

export function getExamKeyStatus(questionNumbers: readonly number[]): ExamKeyStatus {
  if (questionNumbers.length === 0) {
    return "no-key";
  }

  const sorted = [...questionNumbers].sort((first, second) => first - second);
  return sorted.length === DECA_EXAM_QUESTION_COUNT && sorted.every((number, index) => number === index + 1)
    ? "complete"
    : "partial";
}
