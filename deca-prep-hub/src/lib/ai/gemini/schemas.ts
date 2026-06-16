import { z } from "zod";

export const resourceClassificationTypes = [
  "exam",
  "answer_key",
  "roleplay",
  "judge_rubric",
  "instructional_resource",
  "unknown",
] as const;

export const ResourceClassificationResultSchema = z.object({
  resourceType: z.enum(resourceClassificationTypes),
  confidence: z.number().min(0).max(1),
  reasoningSummary: z.string().min(1),
  detectedEventCode: z.string().nullable().optional(),
  detectedEventName: z.string().nullable().optional(),
  detectedYear: z.number().int().nullable().optional(),
  warnings: z.array(z.string()).default([]),
});

export const BasicGeminiHealthResultSchema = z.object({
  ok: z.boolean(),
  model: z.string().min(1),
  message: z.string().min(1),
});

const nullableString = z.string().nullable().optional();
const nullableInteger = z.number().int().nullable().optional();
const confidence = z.number().min(0).max(1);
const score100 = z.number().min(0).max(100);
const feedbackList = z.array(z.string().min(1)).default([]);

export const ExamExtractionResultSchema = z.object({
  resourceType: z.literal("exam"),
  title: nullableString,
  detectedEventCode: nullableString,
  detectedEventName: nullableString,
  detectedCluster: nullableString,
  detectedExamCluster: nullableString,
  detectedYear: nullableInteger,
  questions: z.array(
    z.object({
      questionNumber: z.number().int().positive(),
      prompt: z.string().min(1),
      choices: z.array(
        z.object({
          label: z.string().min(1).max(4),
          text: z.string().min(1),
        }),
      ),
      possibleConcepts: z.array(z.string()).default([]),
      possibleInstructionalAreas: z.array(z.string()).default([]),
      difficulty: nullableString,
      confidence,
      warnings: z.array(z.string()).default([]),
    }),
  ),
  overallConfidence: confidence,
  warnings: z.array(z.string()).default([]),
});

export const AnswerKeyExtractionResultSchema = z.object({
  resourceType: z.literal("answer_key"),
  title: nullableString,
  detectedEventCode: nullableString,
  detectedEventName: nullableString,
  detectedCluster: nullableString,
  detectedYear: nullableInteger,
  answers: z.array(
    z.object({
      questionNumber: z.number().int().positive(),
      answer: z.enum(["A", "B", "C", "D", "E"]),
      confidence,
      warnings: z.array(z.string()).default([]),
    }),
  ),
  possibleExamTitle: nullableString,
  possibleExamYear: nullableInteger,
  overallConfidence: confidence,
  warnings: z.array(z.string()).default([]),
});

export const RoleplayExtractionResultSchema = z.object({
  resourceType: z.literal("roleplay"),
  title: nullableString,
  detectedEventCode: nullableString,
  detectedEventName: nullableString,
  detectedCluster: nullableString,
  detectedYear: nullableInteger,
  participantRole: nullableString,
  judgeRole: nullableString,
  businessContext: nullableString,
  scenarioText: nullableString,
  task: nullableString,
  instructionalArea: nullableString,
  performanceIndicators: z.array(
    z.object({
      text: z.string().min(1),
      possibleConcepts: z.array(z.string()).default([]),
      confidence,
    }),
  ),
  timingInfo: nullableString,
  overallConfidence: confidence,
  warnings: z.array(z.string()).default([]),
});

export const RubricExtractionResultSchema = z.object({
  resourceType: z.literal("judge_rubric"),
  title: nullableString,
  detectedEventCode: nullableString,
  detectedEventName: nullableString,
  rubricType: nullableString,
  criteria: z.array(
    z.object({
      name: z.string().min(1),
      description: nullableString,
      maxPoints: z.number().nullable().optional(),
      performanceLevels: z.array(
        z.object({
          label: z.string().min(1),
          description: nullableString,
          points: z.number().nullable().optional(),
        }),
      ),
    }),
  ),
  overallConfidence: confidence,
  warnings: z.array(z.string()).default([]),
});

export const ConceptFeedbackResultSchema = z.object({
  overallScore: score100,
  definitionAccuracyScore: score100,
  scenarioConnectionScore: score100,
  businessReasoningScore: score100,
  decaVocabularyScore: score100,
  specificityScore: score100,
  aboveAndBeyondScore: score100,
  strengths: feedbackList,
  improvements: feedbackList,
  missingElements: feedbackList,
  suggestedRevisionFocus: feedbackList,
  feedbackSummary: z.string().min(1),
  nextStepPrompt: z.string().min(1),
});

export const ConceptRevisionFeedbackResultSchema = z.object({
  originalScore: score100,
  revisedScore: score100,
  improvementScore: score100,
  improvedAreas: feedbackList,
  stillNeedsWork: feedbackList,
  improvementSummary: z.string().min(1),
  masteryRecommendation: z.string().min(1),
  finalFeedbackSummary: z.string().min(1),
});

export const RoleplayTranscriptFeedbackResultSchema = z.object({
  overallScore: score100,
  performanceIndicatorCoverageScore: score100,
  scenarioConnectionScore: score100,
  businessReasoningScore: score100,
  decaVocabularyScore: score100,
  organizationScore: score100,
  professionalismScore: score100,
  aboveAndBeyondScore: score100,
  performanceIndicators: z.array(
    z.object({
      id: z.string().nullable().optional(),
      text: z.string().min(1),
      covered: z.boolean(),
      coverageScore: score100,
      evidence: z.string().min(1),
      improvement: z.string().min(1),
    }),
  ),
  rubricScores: z.array(
    z.object({
      criterionId: z.string().nullable().optional(),
      name: z.string().min(1),
      score: z.number().min(0),
      maxPoints: z.number().nullable().optional(),
      evidence: z.string().min(1),
      improvement: z.string().min(1),
    }),
  ),
  strengths: feedbackList,
  growthAreas: feedbackList,
  missedOpportunities: feedbackList,
  vocabularySuggestions: feedbackList,
  aboveAndBeyondIdeas: feedbackList,
  revisedAnswerPlan: feedbackList,
  feedbackSummary: z.string().min(1),
  nextPracticeFocus: z.string().min(1),
  warnings: feedbackList,
});

export type ResourceClassificationResult = z.infer<typeof ResourceClassificationResultSchema>;
export type BasicGeminiHealthResult = z.infer<typeof BasicGeminiHealthResultSchema>;
export type ExamExtractionResult = z.infer<typeof ExamExtractionResultSchema>;
export type AnswerKeyExtractionResult = z.infer<typeof AnswerKeyExtractionResultSchema>;
export type RoleplayExtractionResult = z.infer<typeof RoleplayExtractionResultSchema>;
export type RubricExtractionResult = z.infer<typeof RubricExtractionResultSchema>;
export type ConceptFeedbackResult = z.infer<typeof ConceptFeedbackResultSchema>;
export type ConceptRevisionFeedbackResult = z.infer<
  typeof ConceptRevisionFeedbackResultSchema
>;
export type RoleplayTranscriptFeedbackResult = z.infer<
  typeof RoleplayTranscriptFeedbackResultSchema
>;

const nullableStringSchema = {
  type: ["string", "null"],
};

const nullableIntegerSchema = {
  type: ["integer", "null"],
};

const confidenceSchema = {
  type: "number",
  minimum: 0,
  maximum: 1,
};

const warningsSchema = {
  type: "array",
  items: {
    type: "string",
  },
};

const stringArraySchema = {
  type: "array",
  items: {
    type: "string",
  },
};

const score100Schema = {
  type: "number",
  minimum: 0,
  maximum: 100,
};

export const resourceClassificationJsonSchema = {
  type: "object",
  properties: {
    resourceType: {
      type: "string",
      enum: resourceClassificationTypes,
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    reasoningSummary: {
      type: "string",
    },
    detectedEventCode: {
      type: ["string", "null"],
    },
    detectedEventName: {
      type: ["string", "null"],
    },
    detectedYear: {
      type: ["integer", "null"],
    },
    warnings: {
      type: "array",
      items: {
        type: "string",
      },
    },
  },
  required: ["resourceType", "confidence", "reasoningSummary", "warnings"],
  additionalProperties: false,
};

export const basicGeminiHealthJsonSchema = {
  type: "object",
  properties: {
    ok: {
      type: "boolean",
    },
    model: {
      type: "string",
    },
    message: {
      type: "string",
    },
  },
  required: ["ok", "model", "message"],
  additionalProperties: false,
};

export const examExtractionJsonSchema = {
  type: "object",
  properties: {
    resourceType: { type: "string", enum: ["exam"] },
    title: nullableStringSchema,
    detectedEventCode: nullableStringSchema,
    detectedEventName: nullableStringSchema,
    detectedCluster: nullableStringSchema,
    detectedExamCluster: nullableStringSchema,
    detectedYear: nullableIntegerSchema,
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          questionNumber: { type: "integer" },
          prompt: { type: "string" },
          choices: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                text: { type: "string" },
              },
              required: ["label", "text"],
              additionalProperties: false,
            },
          },
          possibleConcepts: stringArraySchema,
          possibleInstructionalAreas: stringArraySchema,
          difficulty: nullableStringSchema,
          confidence: confidenceSchema,
          warnings: warningsSchema,
        },
        required: [
          "questionNumber",
          "prompt",
          "choices",
          "possibleConcepts",
          "possibleInstructionalAreas",
          "difficulty",
          "confidence",
          "warnings",
        ],
        additionalProperties: false,
      },
    },
    overallConfidence: confidenceSchema,
    warnings: warningsSchema,
  },
  required: [
    "resourceType",
    "title",
    "detectedEventCode",
    "detectedEventName",
    "detectedCluster",
    "detectedExamCluster",
    "detectedYear",
    "questions",
    "overallConfidence",
    "warnings",
  ],
  additionalProperties: false,
};

export const answerKeyExtractionJsonSchema = {
  type: "object",
  properties: {
    resourceType: { type: "string", enum: ["answer_key"] },
    title: nullableStringSchema,
    detectedEventCode: nullableStringSchema,
    detectedEventName: nullableStringSchema,
    detectedCluster: nullableStringSchema,
    detectedYear: nullableIntegerSchema,
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          questionNumber: { type: "integer" },
          answer: { type: "string", enum: ["A", "B", "C", "D", "E"] },
          confidence: confidenceSchema,
          warnings: warningsSchema,
        },
        required: ["questionNumber", "answer", "confidence", "warnings"],
        additionalProperties: false,
      },
    },
    possibleExamTitle: nullableStringSchema,
    possibleExamYear: nullableIntegerSchema,
    overallConfidence: confidenceSchema,
    warnings: warningsSchema,
  },
  required: [
    "resourceType",
    "title",
    "detectedEventCode",
    "detectedEventName",
    "detectedCluster",
    "detectedYear",
    "answers",
    "possibleExamTitle",
    "possibleExamYear",
    "overallConfidence",
    "warnings",
  ],
  additionalProperties: false,
};

export const roleplayExtractionJsonSchema = {
  type: "object",
  properties: {
    resourceType: { type: "string", enum: ["roleplay"] },
    title: nullableStringSchema,
    detectedEventCode: nullableStringSchema,
    detectedEventName: nullableStringSchema,
    detectedCluster: nullableStringSchema,
    detectedYear: nullableIntegerSchema,
    participantRole: nullableStringSchema,
    judgeRole: nullableStringSchema,
    businessContext: nullableStringSchema,
    scenarioText: nullableStringSchema,
    task: nullableStringSchema,
    instructionalArea: nullableStringSchema,
    performanceIndicators: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          possibleConcepts: stringArraySchema,
          confidence: confidenceSchema,
        },
        required: ["text", "possibleConcepts", "confidence"],
        additionalProperties: false,
      },
    },
    timingInfo: nullableStringSchema,
    overallConfidence: confidenceSchema,
    warnings: warningsSchema,
  },
  required: [
    "resourceType",
    "title",
    "detectedEventCode",
    "detectedEventName",
    "detectedCluster",
    "detectedYear",
    "participantRole",
    "judgeRole",
    "businessContext",
    "scenarioText",
    "task",
    "instructionalArea",
    "performanceIndicators",
    "timingInfo",
    "overallConfidence",
    "warnings",
  ],
  additionalProperties: false,
};

export const rubricExtractionJsonSchema = {
  type: "object",
  properties: {
    resourceType: { type: "string", enum: ["judge_rubric"] },
    title: nullableStringSchema,
    detectedEventCode: nullableStringSchema,
    detectedEventName: nullableStringSchema,
    rubricType: nullableStringSchema,
    criteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: nullableStringSchema,
          maxPoints: { type: ["number", "null"] },
          performanceLevels: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                description: nullableStringSchema,
                points: { type: ["number", "null"] },
              },
              required: ["label", "description", "points"],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "description", "maxPoints", "performanceLevels"],
        additionalProperties: false,
      },
    },
    overallConfidence: confidenceSchema,
    warnings: warningsSchema,
  },
  required: [
    "resourceType",
    "title",
    "detectedEventCode",
    "detectedEventName",
    "rubricType",
    "criteria",
    "overallConfidence",
    "warnings",
  ],
  additionalProperties: false,
};

export const conceptFeedbackJsonSchema = {
  type: "object",
  properties: {
    overallScore: score100Schema,
    definitionAccuracyScore: score100Schema,
    scenarioConnectionScore: score100Schema,
    businessReasoningScore: score100Schema,
    decaVocabularyScore: score100Schema,
    specificityScore: score100Schema,
    aboveAndBeyondScore: score100Schema,
    strengths: stringArraySchema,
    improvements: stringArraySchema,
    missingElements: stringArraySchema,
    suggestedRevisionFocus: stringArraySchema,
    feedbackSummary: { type: "string" },
    nextStepPrompt: { type: "string" },
  },
  required: [
    "overallScore",
    "definitionAccuracyScore",
    "scenarioConnectionScore",
    "businessReasoningScore",
    "decaVocabularyScore",
    "specificityScore",
    "aboveAndBeyondScore",
    "strengths",
    "improvements",
    "missingElements",
    "suggestedRevisionFocus",
    "feedbackSummary",
    "nextStepPrompt",
  ],
  additionalProperties: false,
};

export const conceptRevisionFeedbackJsonSchema = {
  type: "object",
  properties: {
    originalScore: score100Schema,
    revisedScore: score100Schema,
    improvementScore: score100Schema,
    improvedAreas: stringArraySchema,
    stillNeedsWork: stringArraySchema,
    improvementSummary: { type: "string" },
    masteryRecommendation: { type: "string" },
    finalFeedbackSummary: { type: "string" },
  },
  required: [
    "originalScore",
    "revisedScore",
    "improvementScore",
    "improvedAreas",
    "stillNeedsWork",
    "improvementSummary",
    "masteryRecommendation",
    "finalFeedbackSummary",
  ],
  additionalProperties: false,
};

export const roleplayTranscriptFeedbackJsonSchema = {
  type: "object",
  properties: {
    overallScore: score100Schema,
    performanceIndicatorCoverageScore: score100Schema,
    scenarioConnectionScore: score100Schema,
    businessReasoningScore: score100Schema,
    decaVocabularyScore: score100Schema,
    organizationScore: score100Schema,
    professionalismScore: score100Schema,
    aboveAndBeyondScore: score100Schema,
    performanceIndicators: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: nullableStringSchema,
          text: { type: "string" },
          covered: { type: "boolean" },
          coverageScore: score100Schema,
          evidence: { type: "string" },
          improvement: { type: "string" },
        },
        required: ["id", "text", "covered", "coverageScore", "evidence", "improvement"],
        additionalProperties: false,
      },
    },
    rubricScores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          criterionId: nullableStringSchema,
          name: { type: "string" },
          score: { type: "number", minimum: 0 },
          maxPoints: { type: ["number", "null"] },
          evidence: { type: "string" },
          improvement: { type: "string" },
        },
        required: ["criterionId", "name", "score", "maxPoints", "evidence", "improvement"],
        additionalProperties: false,
      },
    },
    strengths: stringArraySchema,
    growthAreas: stringArraySchema,
    missedOpportunities: stringArraySchema,
    vocabularySuggestions: stringArraySchema,
    aboveAndBeyondIdeas: stringArraySchema,
    revisedAnswerPlan: stringArraySchema,
    feedbackSummary: { type: "string" },
    nextPracticeFocus: { type: "string" },
    warnings: stringArraySchema,
  },
  required: [
    "overallScore",
    "performanceIndicatorCoverageScore",
    "scenarioConnectionScore",
    "businessReasoningScore",
    "decaVocabularyScore",
    "organizationScore",
    "professionalismScore",
    "aboveAndBeyondScore",
    "performanceIndicators",
    "rubricScores",
    "strengths",
    "growthAreas",
    "missedOpportunities",
    "vocabularySuggestions",
    "aboveAndBeyondIdeas",
    "revisedAnswerPlan",
    "feedbackSummary",
    "nextPracticeFocus",
    "warnings",
  ],
  additionalProperties: false,
};
