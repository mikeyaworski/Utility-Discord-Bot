import type { Message, MessageReaction, User } from 'discord.js';
import type { CommandInfo } from 'discord.js-commando';
import type { ClientType, CommandRunMethod, CommandBeforeConfirmMethod, CommandAfterConfirmMethod, UnknownMapping } from 'src/types';

import Discord from 'discord.js';
import { Command } from 'discord.js-commando';
import get from 'lodash.get';

import { Colors, CONFIRM_REACTION, DECLINE_REACTION, CONFIRMATION_DEFAULT_TIMEOUT } from 'src/constants';
import { reactMulitple } from 'src/discord-utils';

interface ConfirmationInfo {
  timeout: number;
  workingMessage?: string;
  confirmPrompt?: string;
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
export default abstract class ConfirmationCommand<Args extends UnknownMapping, IntermediateResult> extends Command {
  public readonly confirmationInfo: ConfirmationInfo;

  constructor(client: ClientType, commandInfo: CommandInfo, confirmationInfo: ConfirmationInfo = DEFAULT_CONFIRMATION_INFO) {
    super(client, commandInfo);
    this.confirmationInfo = confirmationInfo;
  }

  abstract beforeConfirm: CommandBeforeConfirmMethod<Args, IntermediateResult>;
  abstract afterConfirm: CommandAfterConfirmMethod<Args, IntermediateResult>;

  run: CommandRunMethod<Args> = async (...args) => {
    const [commandMsg] = args;
    const workingMessage = this.confirmationInfo.workingMessage
      ? await commandMsg.say('Fetching...\nThis may take a minute.') as Message
      : null;
    const beforeConfirmResult = await this.beforeConfirm(...args);
    if (workingMessage) await workingMessage.delete();
    if (!beforeConfirmResult) return null; // no confirmation required

    const [intermediateResult, confirmPrompt] = beforeConfirmResult;

    const embedDescription = confirmPrompt || this.confirmationInfo.confirmPrompt || 'Please confirm.';
    const confirmationMessageEmbed = new Discord.MessageEmbed()
      .setTitle('Confirmation')
      .setDescription(embedDescription)
      .setColor(Colors.WARN);

    const confirmationMessage = await commandMsg.say({ embeds: [confirmationMessageEmbed] }) as Message;
    await reactMulitple(confirmationMessage as Message, [CONFIRM_REACTION, DECLINE_REACTION]);

    const confirmationFilter = (reaction: MessageReaction, user: User): boolean => {
      const emoji = reaction.emoji.toString();
      return commandMsg.member?.id === user.id && [CONFIRM_REACTION, DECLINE_REACTION].includes(emoji);
    };
    try {
      const reactions = await confirmationMessage.awaitReactions({
        filter: confirmationFilter,
        max: 1,
        time: this.confirmationInfo.timeout,
      });
      const emoji = reactions.first()?.emoji.toString();
      if (!emoji) {
        confirmationMessageEmbed.setColor(Colors.DANGER);
        confirmationMessageEmbed.setDescription(`Confirmation timed out after ${this.confirmationInfo.timeout / 1000} seconds:\n${embedDescription}`);
        await confirmationMessage.edit({ embeds: [confirmationMessageEmbed] });
      } else if (emoji === CONFIRM_REACTION) {
        const responseMessage = await this.afterConfirm(intermediateResult, ...args);
        confirmationMessageEmbed.setColor(Colors.SUCCESS);
        confirmationMessageEmbed.setDescription(responseMessage);
        await confirmationMessage.edit({ embeds: [confirmationMessageEmbed] });
      } else if (emoji === DECLINE_REACTION) {
        confirmationMessageEmbed.setColor(Colors.DANGER);
        confirmationMessageEmbed.setDescription(`Declined confirmation:\n${embedDescription}`);
        await confirmationMessage.edit({ embeds: [confirmationMessageEmbed] });
      }
    } catch (err) {
      confirmationMessageEmbed.setColor(Colors.DANGER);
      confirmationMessageEmbed.setDescription(`Error: ${get(err, 'message', 'Something went wrong.')}\n${embedDescription}`);
      await confirmationMessage.edit({ embeds: [confirmationMessageEmbed] });
    }

    return null;
  }
}
