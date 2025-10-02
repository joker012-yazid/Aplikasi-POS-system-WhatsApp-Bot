import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Prisma, UserRole } from '@prisma/client';

import {
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_NAME,
  DEFAULT_ADMIN_PASSWORD,
  JWT_SECRET,
  TOKEN_EXPIRY,
} from '../config.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/app-error.js';

export interface LoginResult {
  token: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
    name: string | null;
  };
}

const userSelect = {
  id: true,
  email: true,
  role: true,
  name: true,
  password: true,
} satisfies Prisma.UserSelect;

export const login = async (email: string, password: string): Promise<LoginResult> => {
  const user = await prisma.user.findFirst({
    where: { email, deleted_at: null },
    select: userSelect,
  });

  if (!user) {
    throw new AppError(401, 'Invalid credentials');
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    throw new AppError(401, 'Invalid credentials');
  }

  const token = jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY } as SignOptions,
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
  };
};

export const ensureDefaultAdmin = async () => {
  const existing = await prisma.user.findFirst({
    where: { email: DEFAULT_ADMIN_EMAIL, deleted_at: null },
  });

  if (existing) {
    return existing;
  }

  const hashed = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  return prisma.user.create({
    data: {
      email: DEFAULT_ADMIN_EMAIL,
      password: hashed,
      name: DEFAULT_ADMIN_NAME,
      role: 'admin',
    },
  });
};
