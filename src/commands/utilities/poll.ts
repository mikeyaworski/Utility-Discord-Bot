import type { ClientType, CommandRunMethod } from 'src/types';
import type { Message } from 'discord.js';

import Discord from 'discord.js';
import { Command } from 'discord.js-commando';
import { isEmoji, reactMulitple, getLetterEmoji } from 'src/discord-utils';

type Args = string[];

/**
 * !poll <question> [emoji_1] <option_1> [emoji_2] <option_2> ...
 */
export default class PollCommand extends Command {
  constructor(client: ClientType) {
    super(client, {
      name: 'poll',
      aliases: ['ask'],
      group: 'utilities',
      memberName: 'poll',
      description: 'Creates an embedded poll in chat.'
        + 'Add custom emojis to the left of any options.'
        + 'Provide quotes around questions/options with spaces.',
      examples: [
        '!poll "Question" "Option 1" "Option 2"',
        '!poll "Question" 👍 "Option 1" 👎 "Option 2"',
      ],
      format: '<question> [emoji_1] <option_1> [emoji_2] <option_2> ...',
      argsType: 'multiple',
      argsCount: 10,
      argsPromptLimit: 0,
      guildOnly: true,
    });
  }

  run: CommandRunMethod<Args> = async (commandMsg, args) => {
    if (!args.length) return null;

    const [question, ...options] = args;

    if (!options.length) return commandMsg.reply('Please provide some options!');

    let indicatorCount = 0;
    const reactionsAndText = options.reduce((acc, option, idx) => {
      if (!isEmoji(option) && (idx === 0 || !isEmoji(options[idx - 1]))) {
        indicatorCount += 1;
        return acc.concat([[
          getLetterEmoji(indicatorCount - 1),
          option,
        ]]);
      }
      if (!isEmoji(option) && idx > 0 && isEmoji(options[idx - 1])) {
        return acc.concat([[
          options[idx - 1],
          option,
        ]]);
      }
      return acc;
    }, [] as [string, string][]);

    const pollBody = reactionsAndText.reduce((acc, [reaction, option]) => {
      return `${acc}${reaction} ${option}\n`;
    }, '');
    const reactions = reactionsAndText.map(([reaction]) => reaction);

    const poll = new Discord.MessageEmbed()
      .setTitle(`:bar_chart: ${question}`)
      .setDescription(pollBody);

    const pollMsg = await commandMsg.say(poll);

    try {
      await reactMulitple(pollMsg as Message, reactions);
    } catch (err) {
      return commandMsg.reply(
        'Could not react with at least one of the emojis!'
        + ' Make sure that I (the bot) am in whichever server the emoji comes from.',
      );
    }

    return commandMsg.delete();
  }
}
