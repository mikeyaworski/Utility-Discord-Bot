import dotenv from 'dotenv';
import express, { Response } from 'express';
import { WebhookClient } from 'discord.js';
import get from 'lodash.get';
import { log, error } from 'src/logging';
import { getDmChannel } from './dms';

dotenv.config();

const webhookSecret = process.env.WEBHOOK_SECRET;

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
router.post('/', async (req, res) => {
  const isAuthorized = webhookSecret && webhookSecret === req.get('X-WEBHOOK-SECRET');
  if (!isAuthorized) return res.status(401).end();

  const { webhookId, webhookToken, data } = req.body;
  if (!webhookId || !webhookToken || !data) return res.status(400).send('webhookId, webhookToken and data are required.');

  log('Received webhook request:', webhookId, data);

  try {
    const webhookClient = new WebhookClient({ id: webhookId, token: webhookToken });
    await webhookClient.send(data);
    log('Sent message from webhook:', webhookId, data);
    return res.status(204).end();
  } catch (err) {
    return handleError(err, res);
  }
});

router.post('/dm', async (req, res) => {
  const isAuthorized = webhookSecret && webhookSecret === req.get('X-WEBHOOK-SECRET');
  if (!isAuthorized) return res.status(401).end();

  const { userId, data } = req.body;
  if (!userId || !data) return res.status(400).send('userId and data are required.');

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
});

export default router;
