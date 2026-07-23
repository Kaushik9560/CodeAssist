import { z } from "zod";

const httpsUrl = z.string().url().refine((value) => new URL(value).protocol === "https:", "HTTPS URL required");

export const problemSchema = z.object({
  title: z.string().trim().min(1).max(300),
  statement: z.string().trim().min(20).max(60_000),
  url: httpsUrl,
  platform: z.literal("leetcode")
}).strict();

export const hintResponseSchema = z.object({
  level: z.number().int().min(1).max(4),
  hint: z.string().trim().min(1).max(1_500),
  focusArea: z.enum([
    "problem_understanding",
    "pattern_recognition",
    "algorithm_design",
    "implementation",
    "edge_cases",
    "complexity"
  ]),
  questionForUser: z.string().trim().min(1).max(500),
  revealsFinalSolution: z.literal(false)
}).strict();

export const hintResponseJsonSchema = {
  type: "OBJECT",
  properties: {
    level: { type: "INTEGER" },
    hint: { type: "STRING" },
    focusArea: {
      type: "STRING",
      enum: [
        "problem_understanding",
        "pattern_recognition",
        "algorithm_design",
        "implementation",
        "edge_cases",
        "complexity"
      ]
    },
    questionForUser: { type: "STRING" },
    revealsFinalSolution: { type: "BOOLEAN" }
  },
  required: ["level", "hint", "focusArea", "questionForUser", "revealsFinalSolution"]
};

export const hintRequestSchema = z.object({
  problem: problemSchema,
  attempt: z.object({
    code: z.string().max(50_000).default(""),
    language: z.string().max(100).default(""),
    notes: z.string().max(10_000).default(""),
    failedInput: z.string().max(10_000).default(""),
    expectedOutput: z.string().max(10_000).default(""),
    actualOutput: z.string().max(10_000).default("")
  }).strict(),
  hintLevel: z.number().int().min(1).max(4),
  previousHints: z.array(hintResponseSchema).max(4),
  responseLanguage: z.enum(["hinglish", "english"]).default("hinglish")
}).strict().superRefine((value, context) => {
  if (value.previousHints.length !== value.hintLevel - 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["previousHints"],
      message: "Previous hints must unlock the requested level sequentially"
    });
    return;
  }
  value.previousHints.forEach((hint, index) => {
    if (hint.level !== index + 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["previousHints", index, "level"],
        message: "Previous hint levels must be sequential"
      });
    }
  });
});
