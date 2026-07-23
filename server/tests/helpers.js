import { createApp } from "../src/app.js";
import { createGeminiService } from "../src/services/geminiService.js";

export const validHintRequest = {
  problem: {
    title: "Longest Substring Without Repeating Characters",
    statement: "Given a string, find the length of the longest substring without repeating characters.",
    url: "https://leetcode.com/problems/longest-substring-without-repeating-characters/",
    platform: "leetcode"
  },
  attempt: {
    code: "function solve(s) { return 0; }",
    language: "JavaScript",
    notes: "I tried two pointers.",
    failedInput: "abba",
    expectedOutput: "2",
    actualOutput: "3"
  },
  hintLevel: 1,
  previousHints: [],
  responseLanguage: "hinglish"
};

export const validHintResponse = {
  level: 1,
  hint: "Har index se dobara start karne par total work kaise grow hoga, pehle ye estimate karo.",
  focusArea: "complexity",
  questionForUser: "Kya tum current valid range ko reuse kar sakte ho?",
  revealsFinalSolution: false
};

export const validDiagnosisResponse = {
  identifiedPattern: "Variable sliding window",
  primaryFailure: {
    category: "implementation",
    subcategory: "left pointer movement",
    explanation: "Left pointer purani duplicate position par wapas ja sakta hai.",
    evidence: ["The supplied failed case is abba with actual output 3 instead of 2."]
  },
  strengths: ["The attempt notes identify two pointers as the broad direction."],
  understandingScore: 7,
  implementationScore: 4,
  hintDependency: "low",
  confidence: 0.82,
  nextAction: "Window invariant likhkar abba ko dry-run karo.",
  recommendedPracticeType: "Variable-window pointer update problems"
};

export function geminiPayload(value) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }]
  };
}

export function createTestApp(fetchImpl, overrides = {}) {
  const logger = { info() {}, error() {} };
  const aiService = createGeminiService({
    apiKey: "test-server-key",
    model: "test-model",
    fetchImpl,
    timeoutMs: overrides.timeoutMs || 200,
    logger
  });
  return createApp({
    aiService,
    logger,
    config: {
      extensionOrigin: overrides.extensionOrigin || "",
      requestLimit: "512kb",
      rateLimitWindowMs: 60_000,
      rateLimitMax: overrides.rateLimitMax || 30
    }
  });
}
