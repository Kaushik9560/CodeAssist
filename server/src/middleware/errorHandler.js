import { AppError } from "../utils/errors.js";

export function notFoundHandler(_request, response) {
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested CodeAssist endpoint does not exist."
    }
  });
}

export function createErrorHandler(logger) {
  return (error, _request, response, _next) => {
    logger?.error("Request failed", error);
    if (error?.type === "entity.too.large") {
      response.status(413).json({
        error: {
          code: "REQUEST_TOO_LARGE",
          message: "The request is too large. Reduce the code or notes and try again."
        }
      });
      return;
    }
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      response.status(400).json({
        error: {
          code: "INVALID_JSON",
          message: "The request body must contain valid JSON."
        }
      });
      return;
    }
    const status = error instanceof AppError ? error.status : 500;
    const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
    const message = error instanceof AppError
      ? error.message
      : "CodeAssist could not complete this request.";
    response.status(status).json({ error: { code, message } });
  };
}
