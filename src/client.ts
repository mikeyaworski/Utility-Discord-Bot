import dotenv from 'dotenv';
import { CommandoClient } from 'discord.js-commando';

import { COMMAND_PREFIX } from 'src/constants';
import { log, warn, error } from 'src/logging';

// commands
import MoveCommand from 'src/commands/utilities/move';
import DeleteCommand from 'src/commands/utilities/delete';
import StreamerRulesCommand from 'src/commands/utilities/streamer-rules';

// events
import StreamingEvent from 'src/events/streaming';

const commands = [
  MoveCommand,
  DeleteCommand,
  StreamerRulesCommand,
];

const events = [
  StreamingEvent,
];

dotenv.config();

const client = new CommandoClient({
  commandPrefix: COMMAND_PREFIX,
  owner: process.env.OWNER_ID,
});

export function initClient(): Promise<void> {
  return new Promise(resolve => {
    client.registry
      .registerDefaultTypes()
      .registerGroups([
        ['utilities', 'All Commands'],
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
      client.on(trigger, cb);
    });

    client.on('ready', () => {
      log(`Logged in as ${client.user.tag}! (${client.user.id})`);
      resolve();
    });
    client.on('warn', warn);
    client.on('error', error);

    client.login(process.env.DISCORD_BOT_TOKEN);
  });
}
