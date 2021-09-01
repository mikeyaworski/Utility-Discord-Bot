import type { CommandInteraction } from 'discord.js';
import type { Command } from 'src/types';

import Discord from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';

import {
  isEmoji,
  reactMulitple,
  getLetterEmoji,
  parseArguments,
  getInfoFromCommandInteraction,
} from 'src/discord-utils';

const PollCommand: Command = {
  slashCommandData: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Creates an embedded poll in chat.')
    .addStringOption(option => option.setName('question').setDescription('Question').setRequired(true))
    .addStringOption(option => option.setName('options')
      .setDescription('[emoji_1] "<option_1>" [emoji_2] "<option_2>" ...')
      .setRequired(true)),

  async runCommand(interaction: CommandInteraction): Promise<void> {
    const question = interaction.options.getString('question');
    const optionsStr = interaction.options.getString('options');
    const options = await parseArguments(optionsStr as string, { parseChannels: false }) as string[];

    if (!options.length) {
      interaction.reply('Please provide some options!');
      return;
    }

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

    const poll = new Discord.MessageEmbed({
      title: `:bar_chart: ${question}`,
      description: pollBody,
    });

    // Apparently this result is useless: interactionMsg.channel is null and the message can't be reacted to directly.
    // So as a workaround, we fetch the channel and message manually 🤷‍♂️
    await interaction.reply({ embeds: [poll] });
    const { message } = await getInfoFromCommandInteraction(interaction);

    if (!message) return;

    try {
      await reactMulitple(message, reactions);
    } catch (err) {
      await interaction.followUp(
        'Could not react with at least one of the emojis!'
        + ' Make sure that I (the bot) am in whichever server the emoji comes from.',
      );
    }
  },
};

export default PollCommand;
