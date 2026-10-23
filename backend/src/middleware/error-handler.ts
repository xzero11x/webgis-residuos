import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../shared/app-error.js';
import { logger } from '../shared/logger.js';

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Recurso no encontrado.'));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  if (response.headersSent) return next(error);
  const requestId = String(request.id ?? 'unknown');
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos.',
        requestId,
        fields: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }
  if (error instanceof AppError) {
    response
      .status(error.statusCode)
      .json({ error: { code: error.code, message: error.message, requestId } });
    return;
  }
  if (error instanceof SyntaxError && 'type' in error && error.type === 'entity.parse.failed') {
    response.status(400).json({
      error: { code: 'INVALID_JSON', message: 'El cuerpo JSON no es válido.', requestId },
    });
    return;
  }
  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
    response.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'La solicitud supera el tamaño permitido.',
        requestId,
      },
    });
    return;
  }
  logger.error({ err: error, requestId }, 'Error no controlado');
  response
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error interno.', requestId } });
};
