import { NextFunction, Request, Response } from 'express';

type RateLimiterOptions = {
  windowMs: number;
  max: number;
  message: string;
  keyGenerator?: (req: Request) => string;
};

interface Bucket {
  remaining: number;
  resetAt: number;
}

const createLimiter = (options: RateLimiterOptions) => {
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = options.keyGenerator ? options.keyGenerator(req) : req.ip ?? 'global';
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { remaining: options.max - 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (bucket.remaining <= 0) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter.toString());
      res.status(429).json({ error: options.message, retryAfter });
      return;
    }

    bucket.remaining -= 1;
    next();
  };
};

export const authRateLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Terlalu banyak percubaan. Cuba lagi selepas beberapa minit.',
});

export const sensitiveRateLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 120,
  message: 'Trafik tinggi dikesan. Cuba semula sebentar lagi.',
});
