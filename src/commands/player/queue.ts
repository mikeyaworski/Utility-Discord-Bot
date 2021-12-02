// eslint-disable-next-line import/no-duplicates
import { CommandInteraction, Interaction, Message, MessageActionRow, MessageEmbed, Options, TextBasedChannels, TextChannel } from 'discord.js';
import type { MoreVideoDetails } from 'ytdl-core';
import type { Command, IntentionalAny } from 'src/types';
import { channelMention, SlashCommandBuilder } from '@discordjs/builders';

// eslint-disable-next-line import/no-duplicates
import Discord from 'discord.js';
import get from 'lodash.get';
import { time } from 'console';
import SkipCommand from './skip';
import type Session from './session';
import sessions from './sessions';

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

async function timeOutReply(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
  return interaction.editReply({ content: '**The slash command has expired, Please type the slash command again...**', components: [], embeds: [] });
}

let count = 0;

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
  let message = `**__🔊Now Playing__**: ${
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
  const queueEmbed = new Discord.MessageEmbed({
    author: {
      name: '🎵 Queue List 🎵',
      icon_url: undefined,
    },
    color: 0x01ff01,
    description: message,
  });
  const queueButtons = new Discord.MessageActionRow({
    components: [
      new Discord.MessageButton({
        customId: 'loop',
        label: 'Loop',
        style: 'SUCCESS',
      }),
      new Discord.MessageButton({
        customId: 'shuffle',
        label: 'Shuffle',
        style: 'SUCCESS',
      }),
      new Discord.MessageButton({
        customId: 'clear',
        label: 'Clear',
        style: 'SUCCESS',
      }),
      new Discord.MessageButton({
        customId: 'pause',
        label: 'Pause/Resume',
        style: 'SUCCESS',
      }),
      new Discord.MessageButton({
        customId: 'skip',
        label: 'Skip',
        style: 'SUCCESS',
      }),
    ],
  });
  await interaction.editReply({
    embeds: [queueEmbed],
    components: [queueButtons],
  });

  async function handleShuffleButton(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
    session.shuffle();
    return handleList(interaction, session);
  }
  async function handleLoopOnButton(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
    const loopValue = session.isLooped() ? session.setLoop(false) : session.setLoop(true);
    return loopValue;
  }
  async function handleClearButton(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
    session.clear();
    return handleList(interaction, session);
  }
  async function handleSkipButton(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
    session.skip();
    return handleList(interaction, session);
  }
  async function handlePauseButton(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
    count += 1;
    const pauseValue = (count % 2 === 0) ? session.resume() : session.pause();
    return pauseValue;
  }

  try {
    const buttonInteraction = await interaction.channel?.awaitMessageComponent({
      filter: i => i.message.interaction?.id === interaction.id,
    }).catch(() => {
      // Intentionally empty catch
    });
    switch (buttonInteraction?.customId) {
      case 'shuffle': {
        await buttonInteraction?.deferUpdate();
        await handleShuffleButton(interaction, session);
        break;
      }
      case 'loop': {
        await buttonInteraction?.deferUpdate();
        await handleLoopOnButton(interaction, session);
        await handleList(interaction, session);
        break;
      }
      case 'clear': {
        await buttonInteraction?.deferUpdate();
        await handleClearButton(interaction, session);
        break;
      }
      case 'skip': {
        await buttonInteraction?.deferUpdate();
        await handleSkipButton(interaction, session);
        break;
      }
      case 'pause': {
        await buttonInteraction?.deferUpdate();
        await handlePauseButton(interaction, session);
        await handleList(interaction, session);
        break;
      }
      default: {
        // If we get here, then the interaction button was not clicked.
        await interaction.editReply({
          embeds: [queueEmbed],
          components: [],
        });
        break;
      }
    }
  } catch (err) {
    await interaction.editReply(`Error: ${get(err, 'message', 'Something went wrong.')}`);
  }

  return handleList;
}

async function handleLoop(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
  const loop = interaction.options.getBoolean('loop', true);
  session.setLoop(loop);
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
        setTimeout(() => {
          timeOutReply(interaction, session);
        }, 840000);
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
