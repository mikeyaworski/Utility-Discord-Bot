import path from 'path';
import dotenv from 'dotenv';
import { CommandoClient } from 'discord.js-commando';

dotenv.config();

const client = new CommandoClient({
  commandPrefix: '!',
  owner: process.env.OWNER_ID,
});

/* eslint-disable no-console */
export function initClient(): Promise<void> {
  return new Promise(resolve => {
    client.registry
      .registerDefaultTypes()
      .registerGroups([
        ['utilities', 'All Commands'],
      ])
      .registerDefaultGroups()
      .registerDefaultCommands()
      .registerCommandsIn({
        // https://www.npmjs.com/package/require-all
        // https://discord.js.org/#/docs/commando/master/class/CommandoRegistry?scrollTo=registerCommandsIn
        dirname: path.join(__dirname, 'commands'),
        filter: /.([tj]s)/,
        recursive: true,
      });
    client.on('ready', () => {
      console.log(`Logged in as ${client.user.tag}! (${client.user.id})`);
      resolve();
    });
    client.on('warn', console.warn);
    client.on('error', console.error);
    client.login(process.env.DISCORD_BOT_TOKEN);
  });
}
/* eslint-enable no-console */

/**
 * Should be called AFTER initClient
 */
export function getClient(): CommandoClient {
  return client;
}
