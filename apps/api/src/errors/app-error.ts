export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
