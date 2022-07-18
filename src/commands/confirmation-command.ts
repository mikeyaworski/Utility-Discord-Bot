import type { CommandRunMethod, ModalRunMethod, CommandBeforeConfirmMethod, CommandAfterConfirmMethod } from 'src/types';

import Discord, { ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js';
import get from 'lodash.get';

import { CONFIRMATION_DEFAULT_TIMEOUT } from 'src/constants';

interface Options {
  ephemeral?: boolean;
  timeout: number;
  workingMessage?: string;
  confirmPrompt?: string;
  declinedMessage?: string;
  useFallbackModal?: boolean,
}

const DEFAULT_OPTIONS = {
  ephemeral: true,
  timeout: CONFIRMATION_DEFAULT_TIMEOUT,
  useFallbackModal: false,
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
  partialOptions: Partial<Options> = { ...DEFAULT_OPTIONS },
): {
  runCommand: CommandRunMethod,
  runModal?: ModalRunMethod,
} {
  const options: Options = { ...DEFAULT_OPTIONS, ...partialOptions };
  const { ephemeral = true } = options;
  // Can't use "run: AnyRunMethod" because TS is really stupid here
  const run = async (interaction: ChatInputCommandInteraction | ModalSubmitInteraction) => {
    await interaction.deferReply({ ephemeral });

    if (options.workingMessage) {
      await interaction.editReply({
        content: 'Fetching...\nThis may take a minute.',
      });
    }

    const beforeConfirmResult = await beforeConfirm(interaction);
    if (!beforeConfirmResult) return; // no confirmation required
    const {
      intermediateResult,
      confirmPrompt = options.confirmPrompt || 'Please confirm.',
      workingMessage = options.workingMessage || 'Working...',
      declinedMessage = options.declinedMessage || 'Nothing was done.',
    } = beforeConfirmResult;

    const buttonActionRow = new Discord.ActionRowBuilder<ButtonBuilder>({
      components: [
        new ButtonBuilder({
          customId: 'confirm',
          label: 'Confirm',
          style: ButtonStyle.Success,
        }),
        new ButtonBuilder({
          customId: 'decline',
          label: 'Decline',
          style: ButtonStyle.Secondary,
        }),
      ],
    });
    const msg = await interaction.editReply({
      content: confirmPrompt,
      components: [buttonActionRow],
    });

    try {
      const buttonInteraction = await interaction.channel?.awaitMessageComponent({
        filter: i => i.message.id === msg.id,
        time: options.timeout,
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
            content: `Confirmation timed out after ${options.timeout / 1000} seconds.`,
            components: [],
          });
          break;
        }
      }
    } catch (err) {
      await interaction.editReply(`Error: ${get(err, 'message', 'Something went wrong.')}`);
    }
  };

  const runCommand: CommandRunMethod = interaction => {
    return run(interaction);
  };

  const runModal: ModalRunMethod = interaction => {
    return run(interaction);
  };

  return {
    runCommand,
    runModal: options.useFallbackModal ? runModal : undefined,
  };
}
