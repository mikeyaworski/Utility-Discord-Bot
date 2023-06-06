import type { Request, Response, NextFunction } from 'express';
import type { MessageCreateOptions, MessagePayload, WebhookMessageCreateOptions } from 'discord.js';
import dotenv from 'dotenv';

import { log } from 'src/logging';

dotenv.config();

const webhookSecret = process.env.WEBHOOK_SECRET;

type Data = string | MessagePayload | MessageCreateOptions | WebhookMessageCreateOptions;

export function webhookAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const isAuthorizedThroughHeader = webhookSecret === req.get('X-WEBHOOK-SECRET');
  const isAuthorizedThroughBody = webhookSecret === req.body.webhookSecret;
  const isAuthorized = webhookSecret && (isAuthorizedThroughHeader || isAuthorizedThroughBody);
  if (!isAuthorized) res.status(401).end();
  else next();
}

export const requiredFieldsMiddleware = (fields: string[]) => (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const missingRequiredField = fields.some(field => !req.body[field]);
  if (missingRequiredField) res.status(400).send(`All fields are required: ${fields.join(', ')}`);
  else next();
};

export function skipRequestMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const ignoreText: string | undefined = req.body.ignoreText;
  if (!ignoreText) {
    next();
    return;
  }

  const data: Data = req.body.data;

  const contentToCheck: string[] = [];
  if (typeof data === 'string') {
    contentToCheck.push(data);
  } else {
    if ('content' in data && data.content) {
      contentToCheck.push(data.content);
    }
    if ('embeds' in data && data.embeds) {
      contentToCheck.push(...data.embeds.map(embed => {
        const e = 'toJSON' in embed ? embed.toJSON() : embed;
        return [e.title || '', e.description || ''];
      }).flat());
    }
  }

  const containsIgnoredText = contentToCheck.some(value => value.toLowerCase().includes(ignoreText.toLowerCase()));
  if (containsIgnoredText) {
    log(`Ignored webhook request because content contains: "${ignoreText}"\n${JSON.stringify(req.body)}`);
    res.status(204).end();
  } else {
    next();
  }
}
