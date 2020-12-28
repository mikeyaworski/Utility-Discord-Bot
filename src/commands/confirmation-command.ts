import type { Message, MessageReaction, User } from 'discord.js';
import type { CommandInfo } from 'discord.js-commando';
import type { ClientType, CommandRunMethod, CommandBeforeConfirmMethod, CommandAfterConfirmMethod } from 'src/types';

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
export default abstract class ConfirmationCommand<IntermediateResult> extends Command {
  public readonly confirmationInfo: ConfirmationInfo;

  constructor(client: ClientType, commandInfo: CommandInfo, confirmationInfo: ConfirmationInfo = DEFAULT_CONFIRMATION_INFO) {
    super(client, commandInfo);
    this.confirmationInfo = confirmationInfo;
  }

  abstract beforeConfirm: CommandBeforeConfirmMethod<unknown, IntermediateResult>;
  abstract afterConfirm: CommandAfterConfirmMethod<unknown, IntermediateResult>;

  run: CommandRunMethod<unknown> = async (...args) => {
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

    const confirmationMessage = await commandMsg.say(confirmationMessageEmbed) as Message;
    await reactMulitple(confirmationMessage as Message, [CONFIRM_REACTION, DECLINE_REACTION]);

    let timeout;
    const listener = async (reaction: MessageReaction, user: User): Promise<void> => {
      if (commandMsg.member.id !== user.id || confirmationMessage.id !== reaction.message.id) return;
      const emoji = reaction.emoji.toString();
      if (![CONFIRM_REACTION, DECLINE_REACTION].includes(emoji)) return;
      this.client.removeListener('messageReactionAdd', listener);
      clearTimeout(timeout);
      if (emoji === CONFIRM_REACTION) {
        try {
          const responseMessage = await this.afterConfirm(intermediateResult, ...args);
          confirmationMessageEmbed.setColor(Colors.SUCCESS);
          confirmationMessageEmbed.setDescription(responseMessage);
          await confirmationMessage.edit(confirmationMessageEmbed);
        } catch (err) {
          confirmationMessageEmbed.setColor(Colors.DANGER);
          confirmationMessageEmbed.setDescription(get(err, 'message', 'Something went wrong.'));
          await confirmationMessage.edit(confirmationMessageEmbed);
        }
      }
      if (emoji === DECLINE_REACTION) {
        confirmationMessageEmbed.setColor(Colors.DANGER);
        confirmationMessageEmbed.setDescription(`Declined confirmation:\n${embedDescription}`);
        await confirmationMessage.edit(confirmationMessageEmbed);
      }
    };
    timeout = setTimeout(async () => {
      this.client.removeListener('messageReactionAdd', listener);
      confirmationMessageEmbed.setColor(Colors.DANGER);
      confirmationMessageEmbed.setDescription(`Confirmation timed out after ${this.confirmationInfo.timeout / 1000} seconds:\n${embedDescription}`);
      await confirmationMessage.edit(confirmationMessageEmbed);
    }, this.confirmationInfo.timeout);
    this.client.on('messageReactionAdd', listener);

    return null;
  }
}
