import { client } from 'src/client';
import { fetchMessageInGuild } from 'src/discord-utils';
import { getModels } from 'src/models';
import { log, error } from 'src/logging';

/**
 * For each message with unique reaction roles, populate its cache for users that have
 * reacted to the message, so we can avoid doing it every time.
 * TODO: cache updates here, but not on the message reaction events...
 */
async function populateReactionMessageCaches(): Promise<void> {
  client.guilds.cache.forEach(async guild => {
    type Rule = { message_id: string };
    const rules: Rule[] = await getModels().reaction_messages_unique.findAll({
      where: {
        guild_id: guild.id,
        unique: true,
      },
      attributes: ['message_id'],
    });
    rules.forEach(async ({ message_id: messageId }) => {
      try {
        const message = await fetchMessageInGuild(guild, messageId);
        if (!message) throw new Error(`Could not find message to populate its cach.\nGuild ID: ${guild.id}\nMessage ID: ${messageId}`);
        await message.fetch(true);
        await Promise.all(message.reactions.cache.map(reaction => {
          // only gets 100 users, but this is fine
          return reaction.users.fetch();
        }));
        log('Updated cache for message:', messageId);
      } catch (err) {
        error(err);
      }
    });
  });
}

// leave the job out because it's not currently useful
export default [];
