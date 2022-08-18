import express from 'express';
import authMiddleware, { AuthRequest } from 'src/api/middlewares/auth';
import { client } from 'client';
import { ChannelType } from 'discord.js';

const router = express.Router();

// @ts-expect-error
router.get('/channel', authMiddleware, async (req: AuthRequest, res) => {
  const dmChannel = client.channels.cache.find(channel => {
    return channel.type === ChannelType.DM && channel.recipientId === req.user.id;
  });
  if (!dmChannel) return res.status(404).end();
  return res.status(200).json({
    id: dmChannel.id,
  });
});

export default router;
