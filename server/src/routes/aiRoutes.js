import { Router } from "express";
import { createAiController } from "../controllers/aiController.js";
import { validateBody } from "../middleware/validateBody.js";
import { diagnosisRequestSchema } from "../schemas/diagnosisSchema.js";
import { hintRequestSchema } from "../schemas/hintSchema.js";

export function createAiRouter(aiService) {
  const router = Router();
  const controller = createAiController(aiService);
  router.post("/hint", validateBody(hintRequestSchema), controller.hint);
  router.post("/diagnose", validateBody(diagnosisRequestSchema), controller.diagnose);
  return router;
}
