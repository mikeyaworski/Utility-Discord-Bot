import { Response, NextFunction } from 'express';
import { AuthRequest } from 'src/api/middlewares/auth';
import { RateLimiter } from 'src/types';

export const getRateLimiterMiddleware = (rateLimiter: RateLimiter) => async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    await rateLimiter.attempt({ userId: req.user.id, guildId: req.params.guild_id });
    next();
  } catch (err) {
    res.status(401).send((err as Error).message);
  }
};
