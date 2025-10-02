import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, getAuthenticatedUser } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { generateAiReply } from '../services/ai/reply.js';

const router = Router();

const replySchema = z.object({
  thread: z.string().min(1),
  question: z.string().min(1),
  customer_id: z.string().uuid().optional(),
});

router.post(
  '/reply',
  requireAuth,
  validateBody(replySchema),
  asyncHandler(async (req, res) => {
    const { thread, question, customer_id } = req.body as z.infer<typeof replySchema>;
    const actor = getAuthenticatedUser(req);
    const result = await generateAiReply({
      thread,
      question,
      customerId: customer_id,
      actorId: actor?.id,
    });

    res.json({
      reply: result.reply,
      used_fallback: result.usedFallback,
      context: result.contextSummary,
    });
  }),
);

export default router;
