import type { SupabaseResourceType } from "@/lib/types";

export type ResourceClassificationPromptMetadata = {
  title: string | null;
  originalFilename: string | null;
  resourceType: SupabaseResourceType | null;
  eventCode: string | null;
  eventName: string | null;
  eventCategory: string | null;
  cluster: string | null;
  instructionalArea: string | null;
  year: number | null;
  textExcerpt?: string | null;
};

export type ResourceExtractionPromptMetadata = Omit<
  ResourceClassificationPromptMetadata,
  "textExcerpt"
> & {
  approvalStatus: string | null;
};

export type ConceptFeedbackPromptInput = {
  conceptDefinition: string | null;
  conceptExample: string | null;
  conceptExplanation: string | null;
  conceptName: string;
  eventCode: string | null;
  eventName: string | null;
  questionPrompt: string | null;
  scenarioContext: string | null;
  studentResponse: string;
};

export type ConceptRevisionFeedbackPromptInput = ConceptFeedbackPromptInput & {
  originalFeedbackSummary: string | null;
  originalResponse: string;
  revisedResponse: string;
};

export type RoleplayTranscriptFeedbackPromptInput = {
  aboveAndBeyondContext: string | null;
  approvedPerformanceIndicators: Array<{
    id: string | null;
    instructionalArea: string | null;
    text: string;
  }>;
  approvedRubricCriteria: Array<{
    description: string | null;
    id: string | null;
    maxPoints: number | null;
    name: string;
  }>;
  businessContext: string | null;
  eventCode: string | null;
  eventName: string | null;
  instructionalArea: string | null;
  judgeRole: string | null;
  participantRole: string | null;
  roleplayTitle: string | null;
  scenarioText: string | null;
  studentSupportingContext: string | null;
  studentTranscriptOrResponse: string;
  task: string | null;
  warnings: string[];
};

function nullable(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "unknown" : String(value);
}

function metadataLines(metadata: ResourceExtractionPromptMetadata) {
  return [
    `title: ${nullable(metadata.title)}`,
    `originalFilename: ${nullable(metadata.originalFilename)}`,
    `currentResourceType: ${nullable(metadata.resourceType)}`,
    `approvalStatus: ${nullable(metadata.approvalStatus)}`,
    `eventCode: ${nullable(metadata.eventCode)}`,
    `eventName: ${nullable(metadata.eventName)}`,
    `eventCategory: ${nullable(metadata.eventCategory)}`,
    `cluster: ${nullable(metadata.cluster)}`,
    `instructionalArea: ${nullable(metadata.instructionalArea)}`,
    `year: ${nullable(metadata.year)}`,
  ];
}

function bulletList(values: string[]) {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- none";
}

function performanceIndicatorLines(
  indicators: RoleplayTranscriptFeedbackPromptInput["approvedPerformanceIndicators"],
) {
  return indicators.length > 0
    ? indicators
        .map((indicator, index) =>
          [
            `${index + 1}. id: ${nullable(indicator.id)}`,
            `   text: ${indicator.text}`,
            `   instructionalArea: ${nullable(indicator.instructionalArea)}`,
          ].join("\n"),
        )
        .join("\n")
    : "none";
}

function rubricCriteriaLines(
  criteria: RoleplayTranscriptFeedbackPromptInput["approvedRubricCriteria"],
) {
  return criteria.length > 0
    ? criteria
        .map((criterion, index) =>
          [
            `${index + 1}. criterionId: ${nullable(criterion.id)}`,
            `   name: ${criterion.name}`,
            `   maxPoints: ${nullable(criterion.maxPoints)}`,
            `   description: ${nullable(criterion.description)}`,
          ].join("\n"),
        )
        .join("\n")
    : "none";
}

function buildExtractionPrompt({
  instructions,
  metadata,
  text,
}: {
  instructions: string[];
  metadata: ResourceExtractionPromptMetadata;
  text: string;
}) {
  return [
    "You are extracting structured draft learning content from a DECA preparation PDF.",
    "Return structured JSON only. Do not include markdown, comments, or extra keys.",
    "Do not invent information that is not visible or strongly implied in the text.",
    "Use null for unknown scalar fields and [] for unknown arrays.",
    "Use confidence values from 0 to 1 and add warnings for uncertainty, missing pages, OCR/text issues, or ambiguous structure.",
    "",
    ...instructions,
    "",
    "Resource metadata:",
    ...metadataLines(metadata),
    "",
    "Extracted PDF text:",
    "<<<PDF_TEXT_START>>>",
    text.slice(0, 60000),
    "<<<PDF_TEXT_END>>>",
  ].join("\n");
}

export function buildResourceClassificationPrompt(metadata: ResourceClassificationPromptMetadata) {
  const textExcerpt = metadata.textExcerpt?.trim();

  return [
    "Classify this uploaded DECA preparation resource using only the metadata provided.",
    "Return JSON only. Do not include markdown, prose outside JSON, or extra keys.",
    "",
    "Allowed resourceType values:",
    "- exam: a DECA multiple-choice exam or test document",
    "- answer_key: a document primarily containing exam answers or scoring keys",
    "- roleplay: a DECA roleplay/case scenario for practice or competition",
    "- judge_rubric: a judge evaluation sheet, rubric, or scoring guide",
    "- instructional_resource: learning notes, instructional content, worksheets, or reference material",
    "- unknown: insufficient evidence for another classification",
    "",
    "Metadata:",
    `title: ${nullable(metadata.title)}`,
    `originalFilename: ${nullable(metadata.originalFilename)}`,
    `currentResourceType: ${nullable(metadata.resourceType)}`,
    `eventCode: ${nullable(metadata.eventCode)}`,
    `eventName: ${nullable(metadata.eventName)}`,
    `eventCategory: ${nullable(metadata.eventCategory)}`,
    `cluster: ${nullable(metadata.cluster)}`,
    `instructionalArea: ${nullable(metadata.instructionalArea)}`,
    `year: ${nullable(metadata.year)}`,
    textExcerpt ? `textExcerpt: ${textExcerpt.slice(0, 12000)}` : "textExcerpt: unavailable",
    "",
    "Use confidence from 0 to 1. Keep reasoningSummary short and suitable for an admin review log.",
  ].join("\n");
}

export function buildExamExtractionPrompt(metadata: ResourceExtractionPromptMetadata, text: string) {
  return buildExtractionPrompt({
    metadata,
    text,
    instructions: [
      "Extract an exam document.",
      "Set resourceType to exam.",
      "Extract numbered questions and visible answer choices only.",
      "Preserve question numbers exactly where possible.",
      "Preserve answer choice labels such as A, B, C, D, E.",
      "Do not guess correct answers unless the exam text itself clearly includes an answer key; for this exam extraction, do not populate any correct answer field.",
      "Add possibleConcepts and possibleInstructionalAreas only when visible or strongly implied.",
      "If text extraction appears incomplete, keep partial questions only when question number, prompt, and at least two choices are visible.",
    ],
  });
}

export function buildExamChunkExtractionPrompt({
  chunkCount,
  chunkIndex,
  metadata,
  questionEnd,
  questionStart,
  text,
}: {
  chunkCount: number;
  chunkIndex: number;
  metadata: ResourceExtractionPromptMetadata;
  questionEnd?: number;
  questionStart?: number;
  text: string;
}) {
  return buildExtractionPrompt({
    metadata,
    text,
    instructions: [
      `Extract exam questions from chunk ${chunkIndex} of ${chunkCount}.`,
      questionStart && questionEnd
        ? `This chunk appears to contain questions ${questionStart} through ${questionEnd}.`
        : "Question range is unknown for this chunk.",
      "Set resourceType to exam.",
      "Extract only questions visible in this chunk.",
      "Do not invent missing questions or complete a question from outside this chunk.",
      "Preserve original question numbers exactly.",
      "Preserve answer choice labels such as A, B, C, D, E.",
      "Do not populate any correct answer field.",
      "If a question appears incomplete at a chunk boundary, omit it unless question number, prompt, and at least two choices are visible.",
      "Add warnings for incomplete or ambiguous questions.",
    ],
  });
}

export function buildAnswerKeyExtractionPrompt(
  metadata: ResourceExtractionPromptMetadata,
  text: string,
) {
  return buildExtractionPrompt({
    metadata,
    text,
    instructions: [
      "Extract an answer key document.",
      "Set resourceType to answer_key.",
      "Extract answer key rows only.",
      "Do not generate answers by reasoning from question text.",
      "Only use answers visible in the document.",
      "Preserve question numbers exactly where possible.",
      "Use answer labels A, B, C, D, or E only.",
      "Include possible matching information for the related exam when visible, but label this as possibleExamTitle/possibleExamYear only.",
      "AI-extracted answer keys are suggested draft data, not official answer keys.",
    ],
  });
}

export function buildAnswerKeyChunkExtractionPrompt({
  chunkCount,
  chunkIndex,
  metadata,
  text,
}: {
  chunkCount: number;
  chunkIndex: number;
  metadata: ResourceExtractionPromptMetadata;
  text: string;
}) {
  return buildExtractionPrompt({
    metadata,
    text,
    instructions: [
      `Extract answer key rows from chunk ${chunkIndex} of ${chunkCount}.`,
      "Set resourceType to answer_key.",
      "Extract only answer rows visible in this chunk.",
      "Do not generate answers by reasoning from question text.",
      "Only use answers visible in the document.",
      "Preserve question numbers exactly where possible.",
      "Use answer labels A, B, C, D, or E only.",
      "Add warnings for incomplete or ambiguous rows.",
    ],
  });
}

export function buildRoleplayExtractionPrompt(
  metadata: ResourceExtractionPromptMetadata,
  text: string,
) {
  return buildExtractionPrompt({
    metadata,
    text,
    instructions: [
      "Extract a DECA roleplay/case scenario.",
      "Set resourceType to roleplay.",
      "Focus on event code/name, participant role, judge or business role, business context, scenario/background, task/problem, instructional area, performance indicators, and timing information.",
      "Preserve performance indicator wording as closely as possible.",
      "Distinguish scenario text from judge instructions when possible.",
      "Do not create feedback, grading, model answers, or student-facing coaching.",
    ],
  });
}

export function buildRubricExtractionPrompt(metadata: ResourceExtractionPromptMetadata, text: string) {
  return buildExtractionPrompt({
    metadata,
    text,
    instructions: [
      "Extract a judge rubric, evaluation form, or scoring guide.",
      "Set resourceType to judge_rubric.",
      "Extract rubric title, rubric type, criteria, point values, descriptions, and performance levels where visible.",
      "Do not grade any student work.",
      "If the document mixes roleplay instructions and scoring, extract only the scoring/rubric structure.",
    ],
  });
}

export function buildConceptFeedbackPrompt(input: ConceptFeedbackPromptInput) {
  return [
    "You are giving DECA concept practice feedback to a high school student.",
    "Return structured JSON only. Do not include markdown, comments, or extra keys.",
    "This is learning guidance, not official DECA judging and not a competition score.",
    "Be encouraging, specific, and honest. Do not be overly harsh.",
    "Evaluate the response against this DECA answer framework: Define -> Explain -> Connect to Scenario -> Above and Beyond / Visual.",
    "Focus on definition accuracy, scenario connection, business reasoning, DECA vocabulary, specificity, and whether the student adds an above-and-beyond idea.",
    "Do not invent unsafe, unrelated, or private advice.",
    "",
    "Context:",
    `eventCode: ${nullable(input.eventCode)}`,
    `eventName: ${nullable(input.eventName)}`,
    `conceptName: ${nullable(input.conceptName)}`,
    `conceptDefinition: ${nullable(input.conceptDefinition)}`,
    `conceptExplanation: ${nullable(input.conceptExplanation)}`,
    `conceptExample: ${nullable(input.conceptExample)}`,
    `questionPrompt: ${nullable(input.questionPrompt)}`,
    `scenarioContext: ${nullable(input.scenarioContext)}`,
    "",
    "Student response:",
    "<<<STUDENT_RESPONSE_START>>>",
    input.studentResponse.slice(0, 12000),
    "<<<STUDENT_RESPONSE_END>>>",
    "",
    "Score each numeric field from 0 to 100. Keep arrays concise and actionable.",
  ].join("\n");
}

export function buildConceptRevisionFeedbackPrompt(input: ConceptRevisionFeedbackPromptInput) {
  return [
    "You are comparing a student's original DECA concept practice response to their revised response.",
    "Return structured JSON only. Do not include markdown, comments, or extra keys.",
    "This is learning guidance, not official DECA judging and not a competition score.",
    "Be conservative with mastery language. Strong improvement can support mastery progress, but do not overstate readiness.",
    "Compare the revision using this framework: Define -> Explain -> Connect to Scenario -> Above and Beyond / Visual.",
    "",
    "Context:",
    `eventCode: ${nullable(input.eventCode)}`,
    `eventName: ${nullable(input.eventName)}`,
    `conceptName: ${nullable(input.conceptName)}`,
    `conceptDefinition: ${nullable(input.conceptDefinition)}`,
    `conceptExplanation: ${nullable(input.conceptExplanation)}`,
    `conceptExample: ${nullable(input.conceptExample)}`,
    `questionPrompt: ${nullable(input.questionPrompt)}`,
    `scenarioContext: ${nullable(input.scenarioContext)}`,
    `originalFeedbackSummary: ${nullable(input.originalFeedbackSummary)}`,
    "",
    "Original response:",
    "<<<ORIGINAL_RESPONSE_START>>>",
    input.originalResponse.slice(0, 12000),
    "<<<ORIGINAL_RESPONSE_END>>>",
    "",
    "Revised response:",
    "<<<REVISED_RESPONSE_START>>>",
    input.revisedResponse.slice(0, 12000),
    "<<<REVISED_RESPONSE_END>>>",
    "",
    "Score each numeric field from 0 to 100. improvementScore should reflect improvement quality, not just final quality.",
  ].join("\n");
}

export function buildRoleplayTranscriptFeedbackPrompt(
  input: RoleplayTranscriptFeedbackPromptInput,
) {
  return [
    "You are giving DECA roleplay practice feedback to a high school student.",
    "Return structured JSON only. Do not include markdown, comments, or extra keys.",
    "This is practice guidance, not official DECA judging and not an official competition score.",
    "Be supportive, specific, and useful for revision. Do not be overly harsh.",
    "Evaluate the student response using this DECA answer framework: Define -> Explain -> Connect to Scenario -> Above and Beyond / Visual.",
    "Evaluate whether the student addressed each approved performance indicator.",
    "Cite evidence from the student transcript only as short summaries. Do not quote long passages.",
    "Do not invent facts beyond the scenario, resource metadata, approved PIs, rubric criteria, and student response.",
    "If approved PIs or rubrics are missing, still provide general practice feedback and include a warning.",
    "",
    "Event and scenario context:",
    `eventCode: ${nullable(input.eventCode)}`,
    `eventName: ${nullable(input.eventName)}`,
    `roleplayTitle: ${nullable(input.roleplayTitle)}`,
    `participantRole: ${nullable(input.participantRole)}`,
    `judgeRole: ${nullable(input.judgeRole)}`,
    `instructionalArea: ${nullable(input.instructionalArea)}`,
    `businessContext: ${nullable(input.businessContext)}`,
    `task: ${nullable(input.task)}`,
    `aboveAndBeyondContext: ${nullable(input.aboveAndBeyondContext)}`,
    "",
    "Scenario text:",
    "<<<SCENARIO_START>>>",
    nullable(input.scenarioText).slice(0, 16000),
    "<<<SCENARIO_END>>>",
    "",
    "Approved performance indicators:",
    performanceIndicatorLines(input.approvedPerformanceIndicators),
    "",
    "Approved rubric criteria:",
    rubricCriteriaLines(input.approvedRubricCriteria),
    "",
    "Context warnings to include if relevant:",
    bulletList(input.warnings),
    "",
    "Student supporting notes or reflection:",
    "<<<SUPPORTING_CONTEXT_START>>>",
    nullable(input.studentSupportingContext).slice(0, 8000),
    "<<<SUPPORTING_CONTEXT_END>>>",
    "",
    "Student transcript or written response:",
    "<<<STUDENT_RESPONSE_START>>>",
    input.studentTranscriptOrResponse.slice(0, 30000),
    "<<<STUDENT_RESPONSE_END>>>",
    "",
    "For each performanceIndicators item, use the approved PI id when available. If no approved PIs exist, return an empty performanceIndicators array and note the limitation in warnings.",
    "For each rubricScores item, use criterionId when available. If no approved rubric exists, use general DECA practice categories and null criterionId values.",
    "Score numeric fields from 0 to 100 unless maxPoints is provided for a rubric criterion.",
    "Keep arrays concise and actionable.",
  ].join("\n");
}
