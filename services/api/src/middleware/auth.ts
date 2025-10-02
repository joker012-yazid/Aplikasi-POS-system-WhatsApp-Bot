import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';

import { JWT_SECRET } from '../config.js';
import { AppError } from '../utils/app-error.js';

export interface JwtPayload {
  sub: string;
  role: UserRole;
  email: string;
  name?: string | null;
}

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  email: string;
  name?: string | null;
}

type RequestWithUser = Request & { user?: AuthenticatedUser };

const extractToken = (authorization?: string): string | null => {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token;
};

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req.headers.authorization);

  if (!token) {
    throw new AppError(401, 'Unauthorized');
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    (req as RequestWithUser).user = {
      id: payload.sub,
      role: payload.role,
      email: payload.email,
      name: payload.name,
    };
    next();
  } catch (error) {
    throw new AppError(401, 'Invalid token');
  }
};

export const authorize = (roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as RequestWithUser).user;

    if (!user) {
      throw new AppError(401, 'Unauthorized');
    }

    if (user.role === 'admin' || roles.includes(user.role)) {
      next();
      return;
    }

    throw new AppError(403, 'Forbidden');
  };

export const getAuthenticatedUser = (req: Request): AuthenticatedUser | undefined =>
  (req as RequestWithUser).user;
