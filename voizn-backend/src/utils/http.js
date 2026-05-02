export function jsonError(response, statusCode, message, code = "request_failed") {
  response.status(statusCode).json({
    ok: false,
    code,
    message,
  });
}

export function asyncHandler(handler) {
  return async (request, response, next) => {
    try {
      await handler(request, response, next);
    } catch (error) {
      next(error);
    }
  };
}
