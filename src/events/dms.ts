import type { Message } from 'discord.js';
import type { EventTrigger } from 'src/types';

import { getChatGptResponse } from 'src/commands/utilities/chatgpt';
import { chunkReplies, getErrorMsg, throwIfNotImageAttachment } from 'src/discord-utils';

const NewDmEvent: EventTrigger = ['messageCreate', async (message: Message): Promise<void> => {
  if (!message.inGuild() && !message.author.bot) {
    if (!message.content) return;
    try {
      const attachment = message.attachments?.at(0);
      throwIfNotImageAttachment(attachment);
      const response = await getChatGptResponse({
        query: message.content,
        queryImage: attachment?.url,
        userId: message.author.id,
        guildId: message.guildId,
      });
      await chunkReplies({
        message,
        content: response,
      });
    } catch (err) {
      await message.reply(getErrorMsg(err));
    }
  }
}];

export default [
  NewDmEvent,
];
