import { CommandInteraction, ContextMenuInteraction } from 'discord.js';
import type { Command, IntentionalAny } from 'src/types';
import { SlashCommandBuilder } from '@discordjs/builders';
import pLimit from 'p-limit';
import { ContextMenuTypes } from 'src/types';
import { CONCURRENCY_LIMIT } from 'src/constants';
import type Session from './session';
import sessions from './sessions';
import { replyWithSessionButtons, attachPlayerButtons } from './utils';

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

async function handleList(interaction: CommandInteraction | ContextMenuInteraction, session: Session): Promise<IntentionalAny> {
  await replyWithSessionButtons({
    interaction,
    session,
    run: async s => {
      const currentTrack = s.getCurrentTrack();
      if (!currentTrack) {
        return {
          message: 'Nothing is playing',
          showButtons: false,
        };
      }
      const combinedQueue = s.isLooped() ? s.queue.concat(s.queueLoop) : s.queue;
      type Next10 = {
        title: string,
        position: number,
      }[];
      // Concurrency limit can be used if there is audio hitching while making requests.
      // This was an issue in older implementations, but not anymore, which is why the limit is currently at 10.
      const limit = pLimit(CONCURRENCY_LIMIT);
      const next10 = (await Promise.all(combinedQueue
        .slice(0, 10)
        .map((track, idx) => limit(async () => {
          try {
            const details = await track.getVideoDetails();
            return {
              title: details.title,
              position: idx + 1,
            };
          } catch {
            return null;
          }
        })))).filter(Boolean) as Next10;
      const nowPlayingTitle = (await currentTrack.getVideoDetails()).title;
      const totalQueued = s.isLooped() ? s.queueLoop.length : s.queue.length;
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
      return {
        message,
        title: '🎵 Queue List 🎵',
      };
    },
  });
}

async function handleLoop(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
  const loop = interaction.options.getBoolean('loop', true);
  if (loop) session.loop();
  else session.unloop();
  await replyWithSessionButtons({
    interaction,
    session: sessions.get(interaction.guild!),
    run: async s => {
      return {
        message: `Queue loop: ${s.isLooped() ? 'ON' : 'OFF'}.`,
      };
    },
  });
}

async function handleShuffle(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
  session.shuffle();
  await interaction.editReply('Queue shuffled.');
  attachPlayerButtons(interaction, session);
}

async function handleRemove(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
  const position = interaction.options.getInteger('position', true);
  if (position < 1) return interaction.editReply('Queue position must be at least 1.');
  const removedTrack = session.remove(position - 1);
  if (!removedTrack) return interaction.editReply('Could not find track.');
  try {
    const videoDetails = await removedTrack.getVideoDetails();
    await interaction.editReply(`Removed track: ${videoDetails.title}`);
  } catch {
    await interaction.editReply('Removed track.');
  }
  attachPlayerButtons(interaction, session);
  return null;
}

async function handleMove(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
  const currentPosition = interaction.options.getInteger('current-position', true);
  const newPosition = interaction.options.getInteger('new-position', true);
  if (currentPosition < 1 || newPosition < 1) return interaction.editReply('Queue position must be at least 1.');
  const movedTrack = session.move(currentPosition - 1, newPosition - 1);
  if (!movedTrack) return interaction.editReply('Could not find track.');
  try {
    const videoDetails = await movedTrack.getVideoDetails();
    await interaction.editReply(`Moved track to queue position #${newPosition}: ${videoDetails.title}`);
  } catch {
    await interaction.editReply('Moved track.');
  }
  attachPlayerButtons(interaction, session);
  return null;
}

async function handleClear(interaction: CommandInteraction, session: Session): Promise<IntentionalAny> {
  session.clear();
  await interaction.editReply('Queue cleared.');
  attachPlayerButtons(interaction, session);
}

const QueueCommand: Command = {
  guildOnly: true,
  slashCommandData: commandBuilder,
  contextMenuData: {
    type: ContextMenuTypes.USER,
    name: 'queue list',
  },
  runContextMenu: async interaction => {
    await interaction.deferReply({ ephemeral: true });

    // This is a guild-only command
    const guild = interaction.guild!;
    const session = sessions.get(guild);
    if (!session) {
      await interaction.editReply('Session does not exist.');
      return;
    }
    await handleList(interaction, session);
  },

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
