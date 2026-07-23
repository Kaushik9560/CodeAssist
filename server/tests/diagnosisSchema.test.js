import { describe, expect, it } from "vitest";
import { diagnosisResponseSchema } from "../src/schemas/diagnosisSchema.js";
import { validDiagnosisResponse } from "./helpers.js";

describe("diagnosis response schema", () => {
  it("accepts a complete evidence-based diagnosis", () => {
    expect(diagnosisResponseSchema.safeParse(validDiagnosisResponse).success).toBe(true);
  });

  it("rejects out-of-range scores and confidence", () => {
    const invalid = {
      ...validDiagnosisResponse,
      understandingScore: 11,
      confidence: 2
    };
    expect(diagnosisResponseSchema.safeParse(invalid).success).toBe(false);
  });
});
