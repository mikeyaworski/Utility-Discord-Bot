import express from 'express';
import authMiddleware, { AuthRequest } from 'src/api/middlewares/auth';
import { client } from 'client';
import { DMChannel } from 'discord.js';

const router = express.Router();

export async function getDmChannel(userId: string): Promise<DMChannel | null> {
  const user = await client.users.fetch(userId, { force: true });
  if (!user) throw new Error('Could not find user');
  let dmChannel = user.dmChannel;
  if (!dmChannel) dmChannel = await user.createDM();
  return dmChannel;
}

// @ts-expect-error
router.get('/channel', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const dmChannel = await getDmChannel(req.user.id);
    if (!dmChannel) return res.status(400).send('Could not find or create DM channel');
    return res.status(200).json({
      id: dmChannel.id,
    });
  } catch (err) {
    return res.status(404).send(String(err));
  }
});

export default router;
