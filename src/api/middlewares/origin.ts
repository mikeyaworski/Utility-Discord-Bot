import type { Request, Response, NextFunction } from 'express';
import { ALLOWED_ORIGINS } from 'src/api';

export default async function originMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin;
    const isAllowed = origin && ALLOWED_ORIGINS.some(regex => regex.test(origin));
    if (!isAllowed) {
      res.status(403).end();
      return;
    }
  }
  next();
}
