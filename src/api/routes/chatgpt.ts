import express, { Response } from 'express';
import { ChatCompletionRequestMessage } from 'openai';
import { IntentionalAny } from 'src/types';
import authMiddleware, { AuthRequest } from 'src/api/middlewares/auth';
import { getChatGptResponse } from 'src/commands/utilities/chatgpt';

const router = express.Router();

function validateConversation(conversation: IntentionalAny[]): conversation is ChatCompletionRequestMessage[] {
  return conversation.every(message => {
    return typeof message === 'object'
      && message
      && 'role' in message
      && 'content' in message
      && ['user', 'assistant'].includes(message.role)
      && typeof message.content === 'string';
  });
}

async function handleMessage({
  query,
  conversation,
  userId,
  res,
}: {
  query: IntentionalAny,
  conversation: IntentionalAny,
  userId: string,
  res: Response,
}): Promise<IntentionalAny> {
  if (typeof query !== 'string') return res.status(400).end();
  if (!Array.isArray(conversation)) return res.status(400).send('conversation is required and must be an array');
  if (!validateConversation(conversation)) return res.status(400).send('Conversation structure is invalid');

  try {
    const chatGptResponse = await getChatGptResponse({
      query,
      userId,
      conversation,
    });
    return res.status(200).send(chatGptResponse);
  } catch (err) {
    const errStr = String(err);
    const status = errStr.includes('rate limited') ? 429 : 400;
    return res.status(status).send(errStr);
  }
}

// @ts-expect-error
router.post('/message', authMiddleware, (req: AuthRequest, res) => {
  const { query, conversation } = req.body;
  handleMessage({
    query,
    conversation,
    userId: req.user.id,
    res,
  });
});

// @ts-expect-error
router.get('/message', authMiddleware, (req: AuthRequest, res) => {
  const { query } = req.query;
  handleMessage({
    query,
    conversation: [],
    userId: req.user.id,
    res,
  });
});

export default router;
