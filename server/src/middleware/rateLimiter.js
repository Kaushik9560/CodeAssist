import { rateLimit } from "express-rate-limit";

export function createRateLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler(_request, response) {
      response.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many coach requests. Please wait a little and try again."
        }
      });
    }
  });
}
