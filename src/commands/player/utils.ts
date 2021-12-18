import Discord, { CommandInteraction } from 'discord.js';
import { IntentionalAny } from 'src/types';
// import { eventuallyRemoveComponents } from 'src/discord-utils';
import { Colors, INTERACTION_MAX_TIMEOUT } from 'src/constants';
import { log } from 'src/logging';
import Session from './session';

export function getPlayerButtons(session: Session): Discord.MessageActionRow {
  const buttons = new Discord.MessageActionRow({
    components: [
      session.isPaused()
        ? new Discord.MessageButton({
          customId: 'resume',
          label: 'Resume',
          style: 'SUCCESS',
        })
        : new Discord.MessageButton({
          customId: 'pause',
          label: 'Pause',
          style: 'SUCCESS',
        }),
      new Discord.MessageButton({
        customId: 'skip',
        label: 'Skip',
        style: 'SUCCESS',
      }),
      session.isLooped()
        ? new Discord.MessageButton({
          customId: 'unloop',
          label: 'Unloop',
          style: 'SUCCESS',
        })
        : new Discord.MessageButton({
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
    ].filter(Boolean),
  });

  return buttons;
}

export async function listenForPlayerButtons(
  interaction: CommandInteraction,
  session: Session,
  cb?: () => Promise<unknown>,
): Promise<void> {
  try {
    const collector = interaction.channel?.createMessageComponentCollector({
      filter: i => {
        // Need to respond to all interactions, regardless of if they match the filter
        i.deferUpdate().catch(() => {
          // TODO: If there are multiple interactions and you press pause on one of them, this deferUpdate
          // gets called for each one, since there are that many collectors. See if there is an alternative.
          log('Could not defer update for interaction', i.customId);
        });
        return i.message.interaction?.id === interaction.id;
      },
      time: INTERACTION_MAX_TIMEOUT,
    });
    collector?.on('collect', i => {
      switch (i.customId) {
        case 'shuffle': {
          session.shuffle();
          if (cb) cb();
          break;
        }
        case 'loop': {
          session.loop();
          if (cb) cb();
          break;
        }
        case 'unloop': {
          session.unloop();
          if (cb) cb();
          break;
        }
        case 'clear': {
          session.clear();
          if (cb) cb();
          break;
        }
        case 'skip': {
          session.skip();
          if (cb) cb();
          break;
        }
        case 'pause': {
          session.pause();
          if (cb) cb();
          break;
        }
        case 'resume': {
          session.resume();
          if (cb) cb();
          break;
        }
        default: {
          break;
        }
      }
    });
    collector?.on('end', () => {
      log('Ended collection of message components.');
      interaction.editReply({
        components: [],
      });
    });
  } catch (err) {
    log('Entered catch block for player buttons collector.');
    interaction.editReply({
      components: [],
    });
  }
}

export function attachPlayerButtons(interaction: CommandInteraction, session: Session): void {
  // eventuallyRemoveComponents(interaction);
  async function populateButtons() {
    const buttons = getPlayerButtons(session);
    await interaction.editReply({
      components: [buttons],
    });
  }
  populateButtons();
  listenForPlayerButtons(interaction, session, async () => {
    await populateButtons();
  });
}

export async function replyWithSessionButtons({
  interaction,
  session,
  run,
}: {
  interaction: CommandInteraction,
  session?: Session,
  run: (session: Session) => Promise<{
    message: string,
    title?: string,
    hideButtons?: boolean,
  }>,
}): Promise<IntentionalAny> {
  if (!session) {
    await interaction.editReply({
      components: [],
      embeds: [],
      content: 'Session does not exist.',
    });
    return;
  }
  // eventuallyRemoveComponents(interaction);
  async function runAndReply() {
    if (!session) return;
    const {
      message,
      title,
      hideButtons,
    } = await run(session);
    const embeds = title ? [new Discord.MessageEmbed({
      author: {
        name: title,
      },
      color: Colors.SUCCESS,
      description: message,
    })] : [];
    const content = title ? undefined : message;
    const components = hideButtons ? [] : [getPlayerButtons(session)];
    await interaction.editReply({
      embeds,
      components,
      content,
    });
  }
  runAndReply();
  listenForPlayerButtons(interaction, session, async () => {
    await runAndReply();
  });
}
