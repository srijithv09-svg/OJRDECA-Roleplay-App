import "server-only";

export type TextChunk = {
  charEnd: number;
  charStart: number;
  index: number;
  questionEnd?: number;
  questionStart?: number;
  text: string;
};

export type TextPreparationDiagnostics = {
  answerKeySectionTrimmed?: boolean;
  chunkCount: number;
  chunkSize: number;
  developmentLimitApplied?: boolean;
  developmentMaxChunks?: number | null;
  developmentMaxExtractionChars?: number | null;
  originalTextCharCount?: number;
  removedTrailingTextCharCount?: number;
  strategy: "single_call" | "chunked";
  textCharCount: number;
  tokenEstimate: number;
};

export const DEFAULT_LONG_TEXT_THRESHOLD = 12000;
export const DEFAULT_CHUNK_SIZE = 10000;

function getPositiveIntegerEnv(name: string) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

export function estimateTokenCount(text: string) {
  return Math.ceil(text.length / 4);
}

export function normalizeExtractionText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function findQuestionStarts(text: string) {
  const matches = [...text.matchAll(/(?:^|\n)\s*(\d{1,3})[.)]\s+(?=\S)/g)];

  return matches.map((match) => ({
    index: match.index ?? 0,
    number: Number(match[1]),
  }));
}

function chunkByQuestionBoundaries(text: string, chunkSize: number) {
  const starts = findQuestionStarts(text);

  if (starts.length < 3) {
    return [];
  }

  const chunks: TextChunk[] = [];
  let startOffset = starts[0].index;
  let questionStart = starts[0].number;

  for (let index = 1; index < starts.length; index += 1) {
    const nextStart = starts[index].index;
    const wouldExceed = nextStart - startOffset >= chunkSize;

    if (!wouldExceed) {
      continue;
    }

    const chunkText = text.slice(startOffset, nextStart).trim();

    if (chunkText.length > 0) {
      chunks.push({
        charEnd: nextStart,
        charStart: startOffset,
        index: chunks.length + 1,
        questionEnd: starts[index - 1].number,
        questionStart,
        text: chunkText,
      });
    }

    startOffset = nextStart;
    questionStart = starts[index].number;
  }

  const finalText = text.slice(startOffset).trim();

  if (finalText.length > 0) {
    chunks.push({
      charEnd: text.length,
      charStart: startOffset,
      index: chunks.length + 1,
      questionEnd: starts.at(-1)?.number,
      questionStart,
      text: finalText,
    });
  }

  return chunks;
}

function chunkByCharacters(text: string, chunkSize: number) {
  const chunks: TextChunk[] = [];

  for (let start = 0; start < text.length; start += chunkSize) {
    const end = Math.min(text.length, start + chunkSize);

    chunks.push({
      charEnd: end,
      charStart: start,
      index: chunks.length + 1,
      text: text.slice(start, end).trim(),
    });
  }

  return chunks.filter((chunk) => chunk.text.length > 0);
}

export function prepareTextForExtraction({
  chunkSize = DEFAULT_CHUNK_SIZE,
  threshold = DEFAULT_LONG_TEXT_THRESHOLD,
  text,
}: {
  chunkSize?: number;
  threshold?: number;
  text: string;
}) {
  const maxExtractionChars = getPositiveIntegerEnv("GEMINI_MAX_EXTRACTION_CHARS");
  const baseText = normalizeExtractionText(text);
  const normalizedText = maxExtractionChars
    ? baseText.slice(0, maxExtractionChars).trim()
    : baseText;
  const shouldChunk = normalizedText.length > threshold;
  const chunks = shouldChunk
    ? chunkByQuestionBoundaries(normalizedText, chunkSize)
    : [
        {
          charEnd: normalizedText.length,
          charStart: 0,
          index: 1,
          text: normalizedText,
        } satisfies TextChunk,
      ];
  const finalChunks = shouldChunk && chunks.length === 0
    ? chunkByCharacters(normalizedText, chunkSize)
    : chunks;

  return {
    chunks: finalChunks,
    diagnostics: {
      chunkCount: finalChunks.length,
      chunkSize,
      developmentLimitApplied: Boolean(maxExtractionChars && baseText.length > normalizedText.length),
      developmentMaxChunks: null,
      developmentMaxExtractionChars: maxExtractionChars ?? null,
      strategy: shouldChunk ? "chunked" : "single_call",
      textCharCount: normalizedText.length,
      tokenEstimate: estimateTokenCount(normalizedText),
    } satisfies TextPreparationDiagnostics,
    text: normalizedText,
  };
}

export function trimExamAnswerKeySection(text: string) {
  const normalizedText = normalizeExtractionText(text);
  const markers = [
    /\n\s*(?:Test\s+\d+\s+)?[A-Z0-9\s]+EXAM[—-]KEY\b/i,
    /\n\s*ANSWER\s+KEY\b/i,
    /\n\s*DESCRIPTIVE\s+TEST\s+KEY\b/i,
  ];
  const markerIndexes = markers
    .map((marker) => normalizedText.search(marker))
    .filter((index) => index > 5000);
  const trimIndex = markerIndexes.length > 0 ? Math.min(...markerIndexes) : -1;

  if (trimIndex === -1) {
    return {
      answerKeySectionTrimmed: false,
      originalTextCharCount: normalizedText.length,
      removedTrailingTextCharCount: 0,
      text: normalizedText,
    };
  }

  return {
    answerKeySectionTrimmed: true,
    originalTextCharCount: normalizedText.length,
    removedTrailingTextCharCount: normalizedText.length - trimIndex,
    text: normalizedText.slice(0, trimIndex).trim(),
  };
}

export function prepareExamTextForExtraction({
  chunkSize,
  threshold,
  text,
}: {
  chunkSize?: number;
  threshold?: number;
  text: string;
}) {
  const trimmed = trimExamAnswerKeySection(text);
  const prepared = prepareTextForExtraction({
    chunkSize,
    text: trimmed.text,
    threshold,
  });
  const maxExamChunks = getPositiveIntegerEnv("GEMINI_MAX_EXAM_CHUNKS");
  const chunks = maxExamChunks ? prepared.chunks.slice(0, maxExamChunks) : prepared.chunks;
  const maxChunkEnd = chunks.at(-1)?.charEnd;
  const limitedText = maxChunkEnd ? prepared.text.slice(0, maxChunkEnd).trim() : prepared.text;
  const maxChunksApplied = Boolean(maxExamChunks && chunks.length < prepared.chunks.length);

  return {
    chunks,
    diagnostics: {
      ...prepared.diagnostics,
      answerKeySectionTrimmed: trimmed.answerKeySectionTrimmed,
      chunkCount: chunks.length,
      developmentLimitApplied:
        prepared.diagnostics.developmentLimitApplied || maxChunksApplied,
      developmentMaxChunks: maxExamChunks ?? null,
      originalTextCharCount: trimmed.originalTextCharCount,
      removedTrailingTextCharCount: trimmed.removedTrailingTextCharCount,
      textCharCount: limitedText.length,
      tokenEstimate: estimateTokenCount(limitedText),
    } satisfies TextPreparationDiagnostics,
    text: limitedText,
  };
}

export function getClassificationTextExcerpt(text: string, maxChars = 12000) {
  return normalizeExtractionText(text).slice(0, maxChars);
}
