import { Router } from 'express';
import { z } from 'zod';

import { getAuthenticatedUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { login } from '../services/auth-service.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const result = await login(email, password);
    res.json(result);
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getAuthenticatedUser(req);
    const profile = await prisma.user.findUnique({
      where: { id: user!.id },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        created_at: true,
      },
    });
    res.json({ user: profile });
  }),
);

export default router;
