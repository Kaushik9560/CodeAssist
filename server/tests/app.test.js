import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  createTestApp,
  geminiPayload,
  validDiagnosisResponse,
  validHintRequest,
  validHintResponse
} from "./helpers.js";

describe("CodeAssist API", () => {
  it("reports health without requiring a model call", async () => {
    const fetchImpl = vi.fn();
    const response = await request(createTestApp(fetchImpl)).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "codeassist", version: "5.0.0" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an invalid hint request before calling Gemini", async () => {
    const fetchImpl = vi.fn();
    const response = await request(createTestApp(fetchImpl))
      .post("/api/ai/hint")
      .send({ hintLevel: 8 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a validated hint from a mocked Gemini response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify(geminiPayload(validHintResponse)),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));
    const response = await request(createTestApp(fetchImpl))
      .post("/api/ai/hint")
      .send(validHintRequest);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(validHintResponse);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const callOptions = fetchImpl.mock.calls[0][1];
    expect(callOptions.headers["x-goog-api-key"]).toBe("test-server-key");
    expect(JSON.stringify(response.body)).not.toContain("test-server-key");
  });

  it("returns a validated diagnosis from a mocked Gemini response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify(geminiPayload(validDiagnosisResponse)),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));
    const response = await request(createTestApp(fetchImpl))
      .post("/api/ai/diagnose")
      .send({
        problem: validHintRequest.problem,
        attempt: {
          code: validHintRequest.attempt.code,
          language: "JavaScript",
          durationMs: 120000,
          hintLevelsUsed: [1],
          notes: validHintRequest.attempt.notes,
          failedInput: "abba",
          expectedOutput: "2",
          actualOutput: "3",
          codeSnapshots: [],
          finalStatus: "not_solved"
        },
        responseLanguage: "hinglish"
      });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(validDiagnosisResponse);
  });

  it("retries malformed Gemini JSON once and returns a controlled error", async () => {
    const malformed = { candidates: [{ content: { parts: [{ text: "not-json" }] } }] };
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(new Response(
      JSON.stringify(malformed),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )));
    const response = await request(createTestApp(fetchImpl))
      .post("/api/ai/hint")
      .send(validHintRequest);
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("INVALID_MODEL_RESPONSE");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(response.body)).not.toContain("not-json");
  });

  it("returns a safe timeout error", async () => {
    const fetchImpl = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("provider details must not leak");
        error.name = "AbortError";
        reject(error);
      });
    }));
    const response = await request(createTestApp(fetchImpl, { timeoutMs: 10 }))
      .post("/api/ai/hint")
      .send(validHintRequest);
    expect(response.status).toBe(504);
    expect(response.body.error).toEqual({
      code: "MODEL_TIMEOUT",
      message: "The AI request timed out. Please try again."
    });
    expect(JSON.stringify(response.body)).not.toContain("provider details");
  });

  it("rate limits repeated AI requests by IP", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify(geminiPayload(validHintResponse)),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));
    const app = createTestApp(fetchImpl, { rateLimitMax: 1 });
    expect((await request(app).post("/api/ai/hint").send(validHintRequest)).status).toBe(200);
    const limited = await request(app).post("/api/ai/hint").send(validHintRequest);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
  });

  it("does not include the server API key in provider error responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 }));
    const response = await request(createTestApp(fetchImpl))
      .post("/api/ai/hint")
      .send(validHintRequest);
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("test-server-key");
  });

  it("retries a busy model and returns a specific safe error", async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(new Response(
      JSON.stringify({ error: { message: "raw provider demand details" } }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    )));
    const response = await request(createTestApp(fetchImpl))
      .post("/api/ai/hint")
      .send(validHintRequest);
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("MODEL_BUSY");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(response.body)).not.toContain("raw provider demand details");
  });
});
