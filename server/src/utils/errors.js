export class AppError extends Error {
  constructor(message, { status = 500, code = "INTERNAL_ERROR", cause } = {}) {
    super(message, { cause });
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export class ModelOutputError extends AppError {
  constructor(message = "The AI returned an invalid structured response.") {
    super(message, { status: 502, code: "INVALID_MODEL_RESPONSE" });
    this.name = "ModelOutputError";
  }
}
