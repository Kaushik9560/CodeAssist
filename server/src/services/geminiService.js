import { AppError, ModelOutputError } from "../utils/errors.js";

function parseJsonObject(text) {
  const normalized = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  if (!normalized) throw new ModelOutputError("The AI returned an empty response.");
  try {
    const parsed = JSON.parse(normalized);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Object required");
    return parsed;
  } catch (error) {
    if (error instanceof ModelOutputError) throw error;
    throw new ModelOutputError();
  }
}

function correctionPrompt(originalPrompt, invalidOutput, issues) {
  return [
    originalPrompt,
    "Your previous output did not match the required JSON schema.",
    "Correct it once. Return only a valid JSON object and preserve all safety rules.",
    "<INVALID_MODEL_OUTPUT>",
    String(invalidOutput || "[empty]").slice(0, 8_000),
    "</INVALID_MODEL_OUTPUT>",
    `Validation issues: ${issues.slice(0, 8).join("; ")}`
  ].join("\n");
}

export function createGeminiService({ apiKey, model, fetchImpl = fetch, timeoutMs = 20_000, logger }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const transientStatuses = new Set([500, 502, 503, 504]);

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function generateText({ systemInstruction, userPrompt, responseJsonSchema }) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const requestOptions = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: responseJsonSchema,
            maxOutputTokens: 2_048
          }
        }),
        signal: controller.signal
      };

      let response;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        response = await fetchImpl(endpoint, requestOptions);
        if (response.ok || !transientStatuses.has(response.status) || attempt === 2) break;
        logger?.info("Gemini is temporarily unavailable; retrying", { status: response.status, attempt: attempt + 1 });
        await wait(300 * (2 ** attempt));
      }

      if (!response.ok) {
        if (response.status === 429) {
          throw new AppError("The AI quota is temporarily exhausted. Please retry later.", {
            status: 429,
            code: "MODEL_RATE_LIMITED"
          });
        }
        if (response.status === 401 || response.status === 403) {
          throw new AppError("The AI service is not configured correctly.", {
            status: 503,
            code: "MODEL_AUTH_FAILED"
          });
        }
        if (response.status === 503) {
          throw new AppError("The selected Gemini model is busy right now. Please retry shortly or choose another available model.", {
            status: 503,
            code: "MODEL_BUSY"
          });
        }
        throw new AppError("The AI service is temporarily unavailable.", {
          status: 502,
          code: "MODEL_UNAVAILABLE"
        });
      }

      const payload = await response.json();
      return payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error.name === "AbortError") {
        throw new AppError("The AI request timed out. Please try again.", {
          status: 504,
          code: "MODEL_TIMEOUT"
        });
      }
      logger?.error("Gemini request failed", error);
      throw new AppError("The AI service is temporarily unavailable.", {
        status: 502,
        code: "MODEL_UNAVAILABLE"
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function generateValidated({ systemInstruction, userPrompt, schema, responseJsonSchema }) {
    let output = await generateText({ systemInstruction, userPrompt, responseJsonSchema });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let candidate;
      let issues = [];
      try {
        candidate = parseJsonObject(output);
      } catch (error) {
        issues = [error.message];
      }
      if (candidate) {
        const validation = schema.safeParse(candidate);
        if (validation.success) return validation.data;
        issues = validation.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
      }
      if (attempt === 0) {
        output = await generateText({
          systemInstruction,
          userPrompt: correctionPrompt(userPrompt, output, issues),
          responseJsonSchema
        });
      }
    }
    throw new ModelOutputError();
  }

  return { generateValidated };
}

export { parseJsonObject };
