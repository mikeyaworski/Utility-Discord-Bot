import type { Message } from 'discord.js';
import type { EventTrigger } from 'src/types';

import { getChatGptResponse } from 'src/commands/utilities/chatgpt';
import { getErrorMsg } from 'src/discord-utils';

const NewDmEvent: EventTrigger = ['messageCreate', async (message: Message): Promise<void> => {
  if (!message.inGuild() && !message.author.bot) {
    if (!message.content) return;
    try {
      const response = await getChatGptResponse({
        query: message.content,
        userId: message.author.id,
        guildId: message.guildId,
      });
      await message.reply(response);
    } catch (err) {
      await message.reply(getErrorMsg(err));
    }
  }
}];

export default [
  NewDmEvent,
];
