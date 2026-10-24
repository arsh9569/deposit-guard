import type { ErrorRequestHandler } from 'express';

export const apiErrorHandler: ErrorRequestHandler = (error, request, response, next) => {
  void next;
  // Do not serialize exception messages or stacks: database errors can contain URIs and payloads.
  console.error(JSON.stringify({
    event: 'request_failed',
    requestId: request.requestId,
    errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
  }));
  const candidate = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  const status = candidate === 400 || candidate === 413 ? candidate : 500;
  const message = status === 400 ? 'Malformed request' : status === 413 ? 'Request body too large' : 'Internal server error';
  response.status(status).json({ error: message });
};
