export function validateBody(schema) {
  return (request, response, next) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      response.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "The request data is incomplete or invalid."
        }
      });
      return;
    }
    request.validatedBody = result.data;
    next();
  };
}
