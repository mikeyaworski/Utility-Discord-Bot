import dotenv from 'dotenv';
import { CommandoClient } from 'discord.js-commando';

import { COMMAND_PREFIX } from 'src/constants';
import { log, warn, error } from 'src/logging';

import commands from 'src/commands';
import events from 'src/events';

dotenv.config();

export const client = new CommandoClient({
  commandPrefix: COMMAND_PREFIX,
  owner: process.env.OWNER_ID,
  partials: ['MESSAGE', 'CHANNEL', 'REACTION'],
  intents: [
    'GUILD_MEMBERS',
    'GUILD_PRESENCES',
    'GUILD_MESSAGE_REACTIONS',
    'GUILD_BANS',
  ],
});

export function initClient(): Promise<void> {
  return new Promise(resolve => {
    client.registry
      .registerDefaultTypes()
      .registerGroups([
        ['utilities', 'Utilities'],
      ])
      .registerDefaultGroups()
      .registerDefaultCommands()
      .registerCommands(commands);
    // registerCommandsIn does not play well with TypeScript files, so we are just going to manually register commands.
    // .registerCommandsIn({
    //   // https://www.npmjs.com/package/require-all
    //   // https://discord.js.org/#/docs/commando/master/class/CommandoRegistry?scrollTo=registerCommandsIn
    //   dirname: path.join(__dirname, 'commands'),
    //   filter: () => true,
    //   // filter: /.([tj]s)$/,
    //   // recursive: true,
    // });
    // .registerCommandsIn(path.join(__dirname, 'commands'));

    events.forEach(([trigger, cb]) => {
      // @ts-ignore It's really hard to enforce correct types here. Just trust that the EventTrigger type is written correctly.
      client.on(trigger, cb);
    });

    client.on('ready', () => {
      log(`Logged in as ${client.user?.tag} (${client.user?.id})`);
      resolve();
    });
    client.on('warn', warn);
    client.on('error', error);

    client.login(process.env.DISCORD_BOT_TOKEN);
  });
}

export function destroyClient(): void {
  log('Tearing down client connection');
  client.destroy();
}
