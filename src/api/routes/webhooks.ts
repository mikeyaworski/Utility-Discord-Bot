import dotenv from 'dotenv';
import express from 'express';
import { WebhookClient } from 'discord.js';
import { log, error } from 'src/logging';

dotenv.config();

const webhookSecret = process.env.WEBHOOK_SECRET;

const router = express.Router();

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
    // TODO: Pass the status code and message from the Discord error if available
    error(err);
    return res.status(500).end();
  }
});

export default router;
