import express from 'express';
import authMiddleware, { AuthRequest } from 'src/api/middlewares/auth';
import { client } from 'client';

const router = express.Router();

// @ts-expect-error
router.get('/channel', authMiddleware, async (req: AuthRequest, res) => {
  const user = await client.users.fetch(req.user.id, { force: true });
  if (!user) return res.status(404).send('Could not find user');
  let dmChannel = user.dmChannel;
  if (!dmChannel) dmChannel = await user.createDM();
  if (!dmChannel) return res.status(400).send('Could not find or create DM channel');
  return res.status(200).json({
    id: dmChannel.id,
  });
});

export default router;
