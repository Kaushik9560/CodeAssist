import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createGeminiService } from "./services/geminiService.js";
import { createLogger } from "./utils/logger.js";

try {
  const config = loadEnvironment();
  const logger = createLogger(config.nodeEnv);
  const aiService = createGeminiService({
    apiKey: config.geminiApiKey,
    model: config.geminiModel,
    timeoutMs: config.aiTimeoutMs,
    logger
  });
  const app = createApp({ aiService, config, logger });
  app.listen(config.port, () => {
    logger.info(`CodeAssist server listening on http://localhost:${config.port}`);
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
