import { buildDiagnosisPrompt } from "../prompts/diagnosisPrompt.js";
import { buildHintPrompt } from "../prompts/hintPrompt.js";
import { diagnosisResponseJsonSchema, diagnosisResponseSchema } from "../schemas/diagnosisSchema.js";
import { hintResponseJsonSchema, hintResponseSchema } from "../schemas/hintSchema.js";

export function createAiController(aiService) {
  return {
    async hint(request, response, next) {
      try {
        const input = request.validatedBody;
        const prompts = buildHintPrompt(input);
        const schema = hintResponseSchema.refine((value) => value.level === input.hintLevel, {
          message: "Response level must match requested hint level",
          path: ["level"]
        });
        const result = await aiService.generateValidated({
          ...prompts,
          schema,
          responseJsonSchema: hintResponseJsonSchema
        });
        response.json({ data: result });
      } catch (error) {
        next(error);
      }
    },

    async diagnose(request, response, next) {
      try {
        const input = request.validatedBody;
        const prompts = buildDiagnosisPrompt(input);
        const result = await aiService.generateValidated({
          ...prompts,
          schema: diagnosisResponseSchema,
          responseJsonSchema: diagnosisResponseJsonSchema
        });
        response.json({ data: result });
      } catch (error) {
        next(error);
      }
    }
  };
}
