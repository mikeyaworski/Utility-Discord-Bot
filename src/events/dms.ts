import type { Message } from 'discord.js';
import type { EventTrigger } from 'src/types';

import { getChatGptResponse } from 'src/commands/utilities/chatgpt';
import { chunkReplies, getErrorMsg } from 'src/discord-utils';

const NewDmEvent: EventTrigger = ['messageCreate', async (message: Message): Promise<void> => {
  if (!message.inGuild() && !message.author.bot) {
    if (!message.content) return;
    try {
      const response = await getChatGptResponse({
        query: message.content,
        queryImage: message.attachments?.at(0)?.url,
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
