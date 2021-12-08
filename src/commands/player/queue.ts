import Discord, { CommandInteraction } from 'discord.js';
import type { Command, IntentionalAny } from 'src/types';
import { SlashCommandBuilder } from '@discordjs/builders';

import get from 'lodash.get';
import { FOURTEEN_MINUTES, SUCCESS_COLOR } from 'src/constants';
import type Session from './session';
import sessions from './sessions';
import { getPlayerButtons, listenForPlayerButtons } from './utils';

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('queue')
  .setDescription('Various operations on the player queue.');
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('list');
  subcommand.setDescription('List the queue.');
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('loop');
  subcommand.setDescription('Loop the queue.');
  subcommand.addBooleanOption(option => {
    return option
      .setName('loop')
      .setDescription('Whether to loop the queue.')
      .setRequired(true);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('shuffle');
  subcommand.setDescription('Shuffle the queue.');
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('remove');
  subcommand.setDescription('Remove a specific item from the queue.');
  subcommand.addIntegerOption(option => {
    return option
      .setName('position')
      .setDescription('Queue position to remove.')
      .setRequired(true);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('move');
  subcommand.setDescription('Move an item in the queue.');
  subcommand.addIntegerOption(option => {
    return option
      .setName('current-position')
      .setDescription('The position of the item.')
      .setRequired(true);
  });
  subcommand.addIntegerOption(option => {
    return option
      .setName('new-position')
      .setDescription('The position to move the item to.')
      .setRequired(true);
  });
  return subcommand;
});
commandBuilder.addSubcommand(subcommand => {
  subcommand.setName('clear');
  subcommand.setDescription('Clear the entire queue.');
  return subcommand;
});

async function handleList(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
  const currentTrack = session.getCurrentTrack();
  if (!currentTrack) return interaction.editReply('Nothing is playing.');
  const combinedQueue = session.isLooped() ? session.queue.concat(session.queueLoop) : session.queue;
  type Next10 = {
    title: string,
    position: number,
  }[];
  const next10 = (await Promise.all(combinedQueue
    .slice(0, 10)
    .map(async (track, idx) => {
      try {
        const details = await track.getVideoDetails();
        return {
          title: details.title,
          position: idx + 1,
        };
      } catch {
        return null;
      }
    }))).filter(Boolean) as Next10;
  const nowPlayingTitle = (await currentTrack.getVideoDetails()).title;
  const totalQueued = session.isLooped() ? session.queueLoop.length : session.queue.length;
  let message = `**__🔊 Now Playing__**: ${
    nowPlayingTitle
  }\n\n**__Looped__**? ${
    session.isLooped() ? 'Yes' : 'No'
  }\n**__Shuffled__**? ${
    session.isShuffled() ? 'Yes' : 'No'
  }`;

  if (next10.length > 0) {
    message = `${message}\n\n__Length of Queue__: ${
      totalQueued
    }\n__Queue__ (max 10 are shown):\n${
      next10.map(details => `#${details.position}: ${details.title}`).join('\n')
    }`;
  }
  const embed = new Discord.MessageEmbed({
    author: {
      name: '🎵 Queue List 🎵',
    },
    color: SUCCESS_COLOR,
    description: message,
  });
  const buttons = getPlayerButtons(session);
  await interaction.editReply({
    embeds: [embed],
    components: [buttons],
  });
  listenForPlayerButtons(interaction, session, async () => {
    await handleList(interaction, session);
  });
  return null;
}

async function handleLoop(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
  const loop = interaction.options.getBoolean('loop', true);
  if (loop) session.loop();
  else session.unloop();
  return interaction.editReply(`Queue loop: ${loop ? 'ON' : 'OFF'}.`);
}

async function handleShuffle(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
  session.shuffle();
  return interaction.editReply('Queue shuffled.');
}

async function handleRemove(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
  const position = interaction.options.getInteger('position', true);
  if (position < 1) return interaction.editReply('Queue position must be at least 1.');
  const removedTrack = session.remove(position - 1);
  if (!removedTrack) return interaction.editReply('Could not find track.');
  try {
    const videoDetails = await removedTrack.getVideoDetails();
    return interaction.editReply(`Removed track: ${videoDetails.title}`);
  } catch {
    return interaction.editReply('Removed track.');
  }
}

async function handleMove(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
  const currentPosition = interaction.options.getInteger('current-position', true);
  const newPosition = interaction.options.getInteger('new-position', true);
  if (currentPosition < 1 || newPosition < 1) return interaction.editReply('Queue position must be at least 1.');
  const movedTrack = session.move(currentPosition - 1, newPosition - 1);
  if (!movedTrack) return interaction.editReply('Could not find track.');
  try {
    const videoDetails = await movedTrack.getVideoDetails();
    return interaction.editReply(`Moved track to queue position #${newPosition}: ${videoDetails.title}`);
  } catch {
    return interaction.editReply('Moved track.');
  }
}

function handleClear(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
  session.clear();
  return interaction.editReply('Queue cleared.');
}

// TODO: Add player buttons for all subcommands here as well
const QueueCommand: Command = {
  guildOnly: true,
  slashCommandData: commandBuilder,
  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });

    // This is a guild-only command
    const guild = interaction.guild!;
    const session = sessions.get(guild);
    if (!session) {
      await interaction.editReply('Session does not exist.');
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
      case 'list': {
        await handleList(interaction, session);
        break;
      }
      case 'loop': {
        await handleLoop(interaction, session);
        break;
      }
      case 'shuffle': {
        await handleShuffle(interaction, session);
        break;
      }
      case 'remove': {
        await handleRemove(interaction, session);
        break;
      }
      case 'move': {
        await handleMove(interaction, session);
        break;
      }
      case 'clear': {
        await handleClear(interaction, session);
        break;
      }
      default: {
        await interaction.editReply('What??');
      }
    }
  },
};

export default QueueCommand;
