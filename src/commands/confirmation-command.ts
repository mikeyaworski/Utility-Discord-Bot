import type { CommandRunMethod, CommandBeforeConfirmMethod, CommandAfterConfirmMethod } from 'src/types';

import Discord from 'discord.js';
import get from 'lodash.get';

import { CONFIRMATION_DEFAULT_TIMEOUT } from 'src/constants';

interface Options {
  ephemeral?: boolean;
}

interface ConfirmationInfo {
  timeout: number;
  workingMessage?: string;
  confirmPrompt?: string;
  declinedMessage?: string;
}

export const DEFAULT_CONFIRMATION_INFO = {
  timeout: CONFIRMATION_DEFAULT_TIMEOUT,
};

/**
 * Shows an embeded message with reaction options to confirm/deny the continuation of a command.
 * This is an abstract class with abstract methods `beforeConfirm` and `afterConfirm`.
 * `beforeConfirm` will return a tuple, including a confirmation message prompt and an intermediate result.
 * The intermediate result is then passed to `afterConfirm` so that the data may be used after confirmation.
 * If a falsey value is returned from `beforeConfirm` (instead of a tuple), then there will be no confirmation and
 * `beforeConfirm` will be assumed to have run to completion.
 */
export default function ConfirmationCommandRunner<IntermediateResult>(
  beforeConfirm: CommandBeforeConfirmMethod<IntermediateResult>,
  afterConfirm: CommandAfterConfirmMethod<IntermediateResult>,
  confirmationInfo: ConfirmationInfo,
  options: Options = {},
): {
  run: CommandRunMethod,
} {
  const run: CommandRunMethod = async interaction => {
    const { ephemeral = true } = options;
    await interaction.deferReply({ ephemeral });

    if (confirmationInfo.workingMessage) {
      await interaction.editReply({
        content: 'Fetching...\nThis may take a minute.',
      });
    }

    const beforeConfirmResult = await beforeConfirm(interaction);
    if (!beforeConfirmResult) return; // no confirmation required
    const {
      intermediateResult,
      confirmPrompt = confirmationInfo.confirmPrompt || 'Please confirm.',
      workingMessage = confirmationInfo.workingMessage || 'Working...',
      declinedMessage = confirmationInfo.declinedMessage || 'Nothing was done.',
    } = beforeConfirmResult;

    const buttonActionRow = new Discord.MessageActionRow({
      components: [
        new Discord.MessageButton({
          customId: 'confirm',
          label: 'Confirm',
          style: 'SUCCESS',
        }),
        new Discord.MessageButton({
          customId: 'decline',
          label: 'Decline',
          style: 'SECONDARY',
        }),
      ],
    });
    await interaction.editReply({
      content: confirmPrompt,
      components: [buttonActionRow],
    });

    try {
      const buttonInteraction = await interaction.channel?.awaitMessageComponent({
        filter: i => i.message.interaction?.id === interaction.id,
        time: confirmationInfo.timeout,
      }).catch(() => {
        // Intentionally empty catch
      });
      switch (buttonInteraction?.customId) {
        case 'confirm': {
          // Apparently there is no way to defer button interactions in the way we want.
          // The button's loading state cannot stay for more than 3 seconds, regardless of how we choose to defer.
          await interaction.editReply({
            content: workingMessage,
            components: [],
          });

          const responseMessage = await afterConfirm(interaction, intermediateResult);
          if (!responseMessage) throw new Error('Something went wrong!');
          await interaction.editReply({
            content: responseMessage,
            components: [],
          });
          break;
        }
        case 'decline': {
          await interaction.editReply({
            content: declinedMessage,
            components: [],
          });
          break;
        }
        default: {
          // If we get here, then the interaction button was not clicked.
          await interaction.editReply({
            content: `Confirmation timed out after ${confirmationInfo.timeout / 1000} seconds.`,
            components: [],
          });
          break;
        }
      }
    } catch (err) {
      await interaction.editReply(`Error: ${get(err, 'message', 'Something went wrong.')}`);
    }
  };

  return {
    run,
  };
}
