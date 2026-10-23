import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

/** Validated data is passed through locals instead of mutating Express 5 query getters. */
export function validate(
  schema: ZodType,
  source: 'body' | 'params' | 'query' = 'body',
): RequestHandler {
  return (request, response, next) => {
    const result = schema.safeParse(request[source]);
    if (!result.success) return next(result.error);
    response.locals.validated = result.data;
    next();
  };
}
