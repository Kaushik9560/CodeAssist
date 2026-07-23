export class ApiClientError extends Error {
  constructor(message, code = "REQUEST_FAILED") {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
  }
}

export function createApiClient({ baseUrl, fetchImpl = fetch, timeoutMs = 25_000 }) {
  const activeControllers = new Set();

  async function request(path, options = {}) {
    const controller = new AbortController();
    activeControllers.add(controller);
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: options.method || "GET",
        headers: options.body ? { "Content-Type": "application/json" } : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
      let data;
      try {
        data = await response.json();
      } catch {
        throw new ApiClientError("The coach backend returned an unreadable response.", "INVALID_RESPONSE");
      }
      if (!response.ok) {
        throw new ApiClientError(data?.error?.message || "The coach request could not be completed.", data?.error?.code);
      }
      return data;
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
      if (error.name === "AbortError") {
        throw new ApiClientError("The coach request timed out. Please try again.", "TIMEOUT");
      }
      throw new ApiClientError("CodeAssist backend is not reachable. Start the local server and retry.", "BACKEND_UNREACHABLE");
    } finally {
      clearTimeout(timeoutId);
      activeControllers.delete(controller);
    }
  }

  return {
    health() {
      return request("/health", { timeoutMs: 3_500 });
    },
    requestHint(payload) {
      return request("/api/ai/hint", { method: "POST", body: payload });
    },
    requestDiagnosis(payload) {
      return request("/api/ai/diagnose", { method: "POST", body: payload });
    },
    abortAll() {
      for (const controller of activeControllers) controller.abort();
      activeControllers.clear();
    }
  };
}
