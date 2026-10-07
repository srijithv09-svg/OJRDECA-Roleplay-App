import type { ExamAnswerKeyInput } from "../types";
import { DECA_EXAM_QUESTION_COUNT } from "./answer-key-status";

export class AnswerKeyExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnswerKeyExtractionError";
  }
}

/** Read the printed key only. Never infer answers from exam questions or explanations. */
export function extractExamAnswerKey(text: string): ExamAnswerKeyInput[] {
  const normalizedText = text.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
  const heading = /^.*\bEXAM\s*[—–-]\s*KEY\b.*$/im.exec(normalizedText);

  if (!heading) {
    throw new AnswerKeyExtractionError(
      "No readable EXAM–KEY section was found in this PDF. Paste the official answers or enter them manually.",
    );
  }

  const keyText = normalizedText.slice(heading.index + heading[0].length);
  const answers = new Map<number, ExamAnswerKeyInput>();

  // DECA's printed key begins each explanation with a numbered, standalone answer letter.
  // Only the explicitly headed key section is examined, never the question pages.
  for (const match of keyText.matchAll(/^\s*(\d{1,3})[.)][ \t]+([A-Z])(?=[ \t\n]|$)/gm)) {
    const questionNumber = Number(match[1]);
    const answer = match[2];

    if (questionNumber < 1 || questionNumber > DECA_EXAM_QUESTION_COUNT || !/^[A-E]$/.test(answer)) {
      throw new AnswerKeyExtractionError(
        `The printed key contains an unexpected answer at question ${questionNumber}. Review the PDF and enter the key manually.`,
      );
    }

    if (answers.has(questionNumber)) {
      throw new AnswerKeyExtractionError(
        `Question ${questionNumber} appears more than once in the printed key. Review the PDF and enter the key manually.`,
      );
    }

    answers.set(questionNumber, {
      question_number: questionNumber,
      correct_answer: answer as ExamAnswerKeyInput["correct_answer"],
      instructional_area: null,
    });
  }

  const missing = Array.from({ length: DECA_EXAM_QUESTION_COUNT }, (_, index) => index + 1).filter(
    (questionNumber) => !answers.has(questionNumber),
  );

  if (missing.length > 0) {
    throw new AnswerKeyExtractionError(
      `Only ${answers.size} of 100 answers could be read from the printed key. Missing: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? ", …" : ""}. Paste the official answers or complete the key manually.`,
    );
  }

  return [...answers.values()].sort((first, second) => first.question_number - second.question_number);
}
