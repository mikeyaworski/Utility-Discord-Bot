import Discord, { CommandInteraction } from 'discord.js';
import { IntentionalAny } from 'src/types';
// import { eventuallyRemoveComponents } from 'src/discord-utils';
import { Colors, INTERACTION_MAX_TIMEOUT } from 'src/constants';
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
    const buttonInteraction = await interaction.channel?.awaitMessageComponent({
      filter: i => i.message.interaction?.id === interaction.id,
      time: INTERACTION_MAX_TIMEOUT,
    });
    await buttonInteraction?.deferUpdate();
    switch (buttonInteraction?.customId) {
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
    if (!cb) listenForPlayerButtons(interaction, session);
  } catch (err) {
    await interaction.editReply({
      components: [],
    });
  }
}

export function attachAndListenToPlayerButtons(interaction: CommandInteraction, session: Session): void {
  // eventuallyRemoveComponents(interaction);
  (async function populateButtons() {
    const buttons = getPlayerButtons(session);
    await interaction.editReply({
      components: [buttons],
    });
    listenForPlayerButtons(interaction, session, async () => {
      await populateButtons();
    });
  }());
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
  (async function recursiveFn() {
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
    listenForPlayerButtons(interaction, session, async () => {
      await recursiveFn();
    });
    return null;
  }());
}
