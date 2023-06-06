import express, { Response } from 'express';
import { WebhookClient } from 'discord.js';
import get from 'lodash.get';
import { webhookAuthMiddleware, requiredFieldsMiddleware, skipRequestMiddleware } from 'src/api/middlewares/webhooks';
import { log, error } from 'src/logging';
import { getDmChannel } from './dms';

const router = express.Router();

function handleError(err: unknown, res: Response) {
  error(err);
  const statusCode = get(err, 'status', 500);
  const message = get(err, ['rawError', 'message'], null);
  res.status(statusCode);
  if (message) return res.send(String(message));
  return res.end();
}

// https://discord.com/api/webhooks/{webhookId}/{webhookToken}
router.post(
  '/',
  webhookAuthMiddleware,
  requiredFieldsMiddleware(['webhookId', 'webhookToken', 'data']),
  skipRequestMiddleware,
  async (req, res) => {
    const { webhookId, webhookToken, data } = req.body;
    log('Received webhook request:', webhookId, data);
    try {
      const webhookClient = new WebhookClient({ id: webhookId, token: webhookToken });
      await webhookClient.send(data);
      log('Sent message from webhook:', webhookId, data);
      return res.status(204).end();
    } catch (err) {
      return handleError(err, res);
    }
  },
);

router.post(
  '/dm',
  webhookAuthMiddleware,
  requiredFieldsMiddleware(['userId', 'data']),
  skipRequestMiddleware,
  async (req, res) => {
    const { userId, data } = req.body;
    log('Received webhook DM request:', userId, data);
    try {
      const dmChannel = await getDmChannel(userId);
      if (!dmChannel) return res.status(400).send('Could not find or create DM channel');
      await dmChannel.send(data);
      log('Sent DM from webhook:', userId, data);
      return res.status(204).end();
    } catch (err) {
      return handleError(err, res);
    }
  },
);

export default router;
