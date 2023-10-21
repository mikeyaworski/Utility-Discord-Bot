import type { AnyInteraction, Command, CommandOrModalRunMethod, EmbedFields, IntentionalAny } from 'src/types';
import { SlashCommandBuilder } from '@discordjs/builders';
import pLimit from 'p-limit';
import { ContextMenuTypes } from 'src/types';
import { CONCURRENCY_LIMIT, QUEUE_SNIPPET_LENGTH } from 'src/constants';
import { checkVoiceErrorsByInteraction, getSubcommand, parseInput } from 'src/discord-utils';
import type Session from './session';
import sessions from './sessions';
import { replyWithSessionButtons, attachPlayerButtons, getVideoDetailsWithFallback, getTrackDurationAndSpeedFromSession } from './utils';

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
      .setName('current_position')
      .setDescription('The position of the item.')
      .setRequired(true);
  });
  subcommand.addIntegerOption(option => {
    return option
      .setName('new_position')
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

export async function handleList(interaction: AnyInteraction, session: Session): Promise<IntentionalAny> {
  await replyWithSessionButtons({
    interaction,
    session,
    run: async s => {
      const currentTrack = s.getCurrentTrack();
      if (!currentTrack) {
        return {
          description: 'Nothing is playing',
          hideButtons: true,
        };
      }
      const combinedQueue = s.isLooped() ? s.queue.concat(s.queueLoop) : s.queue;
      type QueueSnippet = {
        title: string,
        position: number,
      }[];
      // Concurrency limit can be used if there is audio hitching while making requests.
      // This was an issue in older implementations, but not anymore, which is why the limit is currently at 10.
      const limit = pLimit(CONCURRENCY_LIMIT);
      const queueSnippet = (await Promise.all(combinedQueue
        .slice(0, QUEUE_SNIPPET_LENGTH)
        .map((track, idx) => limit(async () => {
          try {
            const details = await getVideoDetailsWithFallback(track);
            return {
              title: details.title,
              position: idx + 1,
            };
          } catch {
            return null;
          }
        })))).filter(Boolean) as QueueSnippet;
      const nowPlayingTitle = (await getVideoDetailsWithFallback(currentTrack)).title;
      const totalQueued = s.isLooped() ? s.queueLoop.length : s.queue.length;

      const fields: EmbedFields = [
        {
          name: '🔊 Now Playing',
          value: nowPlayingTitle,
          inline: false,
        },
        {
          name: 'Looped',
          value: session.isLooped() ? 'Yes' : 'No',
          inline: true,
        },
        {
          name: 'Shuffled',
          value: session.isShuffled() ? 'Yes' : 'No',
          inline: true,
        },
      ];

      if (queueSnippet.length > 0) {
        fields.push({
          name: 'Length of Queue',
          value: String(totalQueued),
          inline: true,
        }, {
          name: 'Queue (max 10 are shown)',
          value: queueSnippet.map(details => `#${details.position}: ${details.title}`).join('\n'),
          inline: false,
        });
      }

      const footerText = await getTrackDurationAndSpeedFromSession(session);
      return {
        fields,
        title: '🎵 Queue List 🎵',
        footerText,
      };
    },
  });
}

async function handleLoop(interaction: AnyInteraction, session: Session): Promise<IntentionalAny> {
  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const loop: boolean = inputs.loop;
  if (loop) session.loop();
  else session.unloop();
  await replyWithSessionButtons({
    interaction,
    session: sessions.get(interaction.guild!.id),
    run: async s => {
      return {
        description: `Queue loop: ${s.isLooped() ? 'ON' : 'OFF'}.`,
      };
    },
  });
}

async function handleShuffle(interaction: AnyInteraction, session: Session): Promise<IntentionalAny> {
  session.shuffle();
  await interaction.editReply('Queue shuffled.');
  attachPlayerButtons(interaction, session);
}

async function handleRemove(interaction: AnyInteraction, session: Session): Promise<IntentionalAny> {
  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const position: number = inputs.position;
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

async function handleMove(interaction: AnyInteraction, session: Session): Promise<IntentionalAny> {
  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const currentPosition: number = inputs.current_position;
  const newPosition: number = inputs.new_position;
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

async function handleClear(interaction: AnyInteraction, session: Session): Promise<IntentionalAny> {
  session.clear();
  await interaction.editReply('Queue cleared.');
  attachPlayerButtons(interaction, session);
}

const run: CommandOrModalRunMethod = async interaction => {
  await interaction.deferReply({ ephemeral: true });

  // This is a guild-only command
  const guild = interaction.guild!;
  const session = sessions.get(guild.id);
  if (!session) {
    await interaction.editReply('Session does not exist.');
    return;
  }

  const subcommand = getSubcommand(interaction);
  switch (subcommand) {
    case 'loop':
    case 'shuffle':
    case 'remove':
    case 'move':
    case 'clear': {
      await checkVoiceErrorsByInteraction(interaction);
      break;
    }
    default: break;
  }
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
};

const QueueCommand: Command = {
  guildOnly: true,
  slashCommandData: commandBuilder,
  contextMenuData: {
    type: ContextMenuTypes.USER,
    name: 'queue list',
  },
  runCommand: run,
  runModal: run,
  runContextMenu: async interaction => {
    await interaction.deferReply({ ephemeral: true });

    // This is a guild-only command
    const guild = interaction.guild!;
    const session = sessions.get(guild.id);
    if (!session) {
      await interaction.editReply('Session does not exist.');
      return;
    }
    await handleList(interaction, session);
  },
};

export default QueueCommand;
