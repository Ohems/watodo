/**
 * Errors carrying an HTTP status code. The global error handler in app.ts
 * reads `statusCode` off thrown errors, so services can raise typed API
 * errors without depending on Fastify.
 */
export interface HttpError extends Error {
  statusCode: number;
}

export function httpError(statusCode: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
}

export function badRequest(message: string): HttpError {
  return httpError(400, message);
}

export function notFound(message: string): HttpError {
  return httpError(404, message);
}

export function forbidden(message: string): HttpError {
  return httpError(403, message);
}

/** PostgreSQL unique-violation error code. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}
