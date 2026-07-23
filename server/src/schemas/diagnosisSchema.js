import { z } from "zod";
import { problemSchema } from "./hintSchema.js";

export const failureCategorySchema = z.enum([
  "problem_understanding",
  "pattern_recognition",
  "algorithm_design",
  "implementation",
  "edge_cases",
  "complexity",
  "communication",
  "insufficient_evidence"
]);

export const diagnosisRequestSchema = z.object({
  problem: problemSchema,
  attempt: z.object({
    code: z.string().max(50_000).default(""),
    language: z.string().max(100).default(""),
    durationMs: z.number().min(0).max(86_400_000),
    hintLevelsUsed: z.array(z.number().int().min(1).max(4)).max(4),
    notes: z.string().max(10_000).default(""),
    failedInput: z.string().max(10_000).default(""),
    expectedOutput: z.string().max(10_000).default(""),
    actualOutput: z.string().max(10_000).default(""),
    codeSnapshots: z.array(z.object({
      id: z.string().max(150),
      code: z.string().max(50_000),
      language: z.string().max(100),
      reason: z.string().max(100),
      capturedAt: z.string().max(100)
    }).strict()).max(8),
    finalStatus: z.enum([
      "in_progress",
      "solved_independently",
      "solved_with_hints",
      "not_solved",
      "abandoned"
    ])
  }).strict(),
  responseLanguage: z.enum(["hinglish", "english"]).default("hinglish")
}).strict();

export const diagnosisResponseSchema = z.object({
  identifiedPattern: z.string().trim().min(1).max(500),
  primaryFailure: z.object({
    category: failureCategorySchema,
    subcategory: z.string().trim().min(1).max(300),
    explanation: z.string().trim().min(1).max(1_500),
    evidence: z.array(z.string().trim().min(1).max(500)).min(1).max(8)
  }).strict(),
  strengths: z.array(z.string().trim().min(1).max(500)).max(8),
  understandingScore: z.number().min(0).max(10),
  implementationScore: z.number().min(0).max(10),
  hintDependency: z.enum(["none", "low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  nextAction: z.string().trim().min(1).max(1_000),
  recommendedPracticeType: z.string().trim().min(1).max(500)
}).strict();

export const diagnosisResponseJsonSchema = {
  type: "OBJECT",
  properties: {
    identifiedPattern: { type: "STRING" },
    primaryFailure: {
      type: "OBJECT",
      properties: {
        category: {
          type: "STRING",
          enum: [
            "problem_understanding", "pattern_recognition", "algorithm_design",
            "implementation", "edge_cases", "complexity", "communication",
            "insufficient_evidence"
          ]
        },
        subcategory: { type: "STRING" },
        explanation: { type: "STRING" },
        evidence: { type: "ARRAY", items: { type: "STRING" } }
      },
      required: ["category", "subcategory", "explanation", "evidence"]
    },
    strengths: { type: "ARRAY", items: { type: "STRING" } },
    understandingScore: { type: "NUMBER" },
    implementationScore: { type: "NUMBER" },
    hintDependency: { type: "STRING", enum: ["none", "low", "medium", "high"] },
    confidence: { type: "NUMBER" },
    nextAction: { type: "STRING" },
    recommendedPracticeType: { type: "STRING" }
  },
  required: [
    "identifiedPattern", "primaryFailure", "strengths", "understandingScore",
    "implementationScore", "hintDependency", "confidence", "nextAction",
    "recommendedPracticeType"
  ]
};
