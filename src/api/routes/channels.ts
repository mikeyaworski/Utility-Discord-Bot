import express from 'express';
import authMiddleware, { AuthRequest } from 'src/api/middlewares/auth';
import { client } from 'client';
import { ChannelType } from 'src/api/types';
import { isText } from 'src/discord-utils';

const router = express.Router();

// @ts-expect-error
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const guildId = req.query.guild_id;
  if (typeof guildId !== 'string') return res.status(400).send('guild_id query parameter is required');
  const apiGuild = req.user.guilds.find(g => g.id === guildId);
  if (!apiGuild) return res.status(404).send('Could not find guild');
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return res.status(404).send('Could not find guild');
  const channels = guild.channels.cache
    .filter(c => isText(c))
    .map(c => ({
      id: c.id,
      name: c.name,
      type: c.isVoiceBased()
        ? ChannelType.VOICE
        : c.isDMBased()
          ? ChannelType.DM
          : c.isTextBased()
            ? ChannelType.TEXT
            : c.isThread()
              ? ChannelType.THREAD
              : ChannelType.OTHER,
      parent: c.parent ? {
        id: c.parent.id,
        name: c.parent.name,
      } : null,
    }));
  return res.status(200).json(channels);
});

export default router;
