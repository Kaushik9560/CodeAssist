import express from "express";
import { createCorsMiddleware } from "./middleware/cors.js";
import { createErrorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createRateLimiter } from "./middleware/rateLimiter.js";
import { createAiRouter } from "./routes/aiRoutes.js";
import { createHealthRouter } from "./routes/healthRoutes.js";

export function createApp({ aiService, config, logger }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.use(createCorsMiddleware(config.extensionOrigin));
  app.use(express.json({ limit: config.requestLimit }));
  app.use("/health", createHealthRouter());
  app.use("/api/ai", createRateLimiter({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax
  }), createAiRouter(aiService));
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
