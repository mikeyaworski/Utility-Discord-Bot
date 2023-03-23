import type { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const webhookSecret = process.env.WEBHOOK_SECRET;

export default async function webhookAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const isAuthorizedThroughHeader = webhookSecret === req.get('X-WEBHOOK-SECRET');
  const isAuthorizedThroughBody = webhookSecret === req.body.webhookSecret;
  const isAuthorized = webhookSecret && (isAuthorizedThroughHeader || isAuthorizedThroughBody);
  if (!isAuthorized) res.status(401).end();
  else next();
}
