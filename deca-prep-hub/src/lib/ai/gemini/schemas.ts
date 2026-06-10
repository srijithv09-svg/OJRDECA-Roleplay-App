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

export type ResourceClassificationResult = z.infer<typeof ResourceClassificationResultSchema>;
export type BasicGeminiHealthResult = z.infer<typeof BasicGeminiHealthResultSchema>;
export type ExamExtractionResult = z.infer<typeof ExamExtractionResultSchema>;
export type AnswerKeyExtractionResult = z.infer<typeof AnswerKeyExtractionResultSchema>;
export type RoleplayExtractionResult = z.infer<typeof RoleplayExtractionResultSchema>;
export type RubricExtractionResult = z.infer<typeof RubricExtractionResultSchema>;

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
