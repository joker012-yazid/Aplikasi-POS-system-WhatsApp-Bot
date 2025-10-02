import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';

import { AppError } from '../utils/app-error.js';

const parseWithSchema = <T>(schema: ZodSchema<T>, payload: unknown) => {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError(422, 'Validation failed', error.flatten());
    }
    throw error;
  }
};

export const validateBody = <T>(schema: ZodSchema<T>) =>
  (req: Request, _res: Response, next: NextFunction) => {
    req.body = parseWithSchema(schema, req.body);
    next();
  };

export const validateQuery = <T>(schema: ZodSchema<T>) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const parsed = parseWithSchema(schema, req.query);
    req.query = parsed as unknown as typeof req.query;
    next();
  };
