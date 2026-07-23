export function createCorsMiddleware(configuredOrigin = "") {
  return (request, response, next) => {
    const origin = request.get("Origin");
    const allowed = !origin || (
      configuredOrigin
        ? origin === configuredOrigin
        : origin.startsWith("chrome-extension://")
    );

    if (!allowed) {
      response.status(403).json({
        error: {
          code: "ORIGIN_NOT_ALLOWED",
          message: "This extension origin is not allowed by the CodeAssist server."
        }
      });
      return;
    }

    if (origin) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
      response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    }
    if (request.method === "OPTIONS") {
      response.sendStatus(204);
      return;
    }
    next();
  };
}
