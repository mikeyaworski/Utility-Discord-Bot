import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import { client } from 'src/client';
import { array } from 'src/utils';
import { handleError, getCommandInfoFromInteraction, isModalSubmit, isCommand, isContextMenu, isButton } from 'src/discord-utils';

import Poll from './utilities/poll';
import Move from './utilities/move';
import Delete from './utilities/delete';
import BaseRoles from './utilities/base-roles';
import StreamerRules from './utilities/streamer-rules';
import ReactionRoles from './utilities/reaction-roles';
import Reminders from './utilities/reminders';
import Timers from './utilities/timers';
import Say from './utilities/say';
import ChatGPT from './utilities/chatgpt';

import Chess from './chess';

import Play from './player/play';
import Connect from './player/connect';
import Seek from './player/seek';
import Speed from './player/speed';
import Skip from './player/skip';
import Leave from './player/leave';
import Pause from './player/pause';
import Resume from './player/resume';
import NowPlaying from './player/now-playing';
import Queue from './player/queue';
import Loop from './player/loop';
import PlayerUpdates from './player/player-updates';
import PlayerFavorites from './player/player-favorites';

const commands = [
  // Utilities
  Poll,
  Move,
  Delete,
  BaseRoles,
  StreamerRules,
  ReactionRoles,
  Reminders,
  Timers,
  Say,
  ChatGPT,

  // Player
  Play,
  Connect,
  Seek,
  Speed,
  Skip,
  Pause,
  Resume,
  NowPlaying,
  Queue,
  Leave,
  Loop,
  PlayerUpdates,
  PlayerFavorites,

  // Chess
  Chess,
];

export default commands;

export function listenToCommands(): void {
  client.on('interactionCreate', async interaction => {
    const command = commands.find(c => {
      if (isModalSubmit(interaction)) {
        const { commandName } = getCommandInfoFromInteraction(interaction);
        return commandName === c.slashCommandData?.name;
      }
      if (isCommand(interaction)) {
        return interaction.commandName === c.slashCommandData?.name;
      }
      if (isContextMenu(interaction)) {
        return interaction.commandName === c.contextMenuData?.name;
      }
      if (isButton(interaction)) {
        return interaction.message.interaction
            && 'commandName' in interaction.message.interaction
            && interaction.message.interaction.commandName === c.slashCommandData?.name;
      }
      return false;
    });
    if (!command) return;

    if (isCommand(interaction)) {
      if (command.guildOnly && !interaction.guild) {
        await interaction.reply({
          ephemeral: true,
          content: 'This command can only be used in a guild (server).',
        });
        return;
      }
      if (interaction.guild && command.clientPermissions) {
        const expectedClientPermissions = array(command.clientPermissions);
        const actualClientPermissions = interaction.guild.members.me?.permissions;
        if (actualClientPermissions && typeof actualClientPermissions !== 'string' && !actualClientPermissions.has(expectedClientPermissions)) {
          await interaction.reply({
            ephemeral: true,
            content: 'One of us does not have permission to use this command!',
          });
          return;
        }
      }
      if (interaction.guild && command.userPermissions) {
        const expectedUserPermissions = array(command.userPermissions);
        const actualUserPermissions = interaction.member?.permissions;
        if (actualUserPermissions && typeof actualUserPermissions !== 'string' && !actualUserPermissions.has(expectedUserPermissions)) {
          await interaction.reply({
            ephemeral: true,
            content: 'One of us does not have permission to use this command!',
          });
          return;
        }
      }
      // If any required fields are missing, prompt them with a modal to fill the rest
      if (command.runModal && command.slashCommandData) {
        const commandName = command.slashCommandData.name;
        let subcommand = '';
        try {
          subcommand = interaction.options.getSubcommand();
        } catch {
          // Intentionally empty - there is no subcommand
        }

        const subcommandFound = subcommand
          ? command.slashCommandData.options.find(o => o.toJSON().type === 1 && o.toJSON().name === subcommand)?.toJSON()
          : null;
        const commandOptions = subcommandFound && subcommandFound.type === 1
          ? subcommandFound.options
          : command.slashCommandData.options.filter(o => o.toJSON().type !== 1).map(o => o.toJSON());
        const requiredOptions = commandOptions?.filter(option => option.required);
        const hasMissingOptions = requiredOptions?.some(option => interaction.options.get(option.name) == null);
        const hasNoOptions = commandOptions
          && commandOptions.length > 0
          && commandOptions?.every(option => interaction.options.get(option.name) == null);
        if (hasMissingOptions || (command.showModalWithNoArgs && hasNoOptions)) {
          // Note: customId can only be 100 characters
          const customId = subcommand ? `${commandName} ${subcommand}` : commandName;
          const modal = new ModalBuilder()
            .setCustomId(customId)
            .setTitle(`/${customId}`.slice(0, 45));
          commandOptions
            ?.sort((a, b) => {
              // Put timezone option at the end because it is generally less important than every other option,
              // and we have a limit of 5 text inputs for the modal (5 options).
              if (a.name === 'time_zone') return 1;
              if (b.name === 'time_zone') return -1;
              return 0;
            })
            .slice(0, 5)
            .forEach(option => {
              const value = interaction.options.get(option.name)?.value;
              const label = command.modalLabels?.[option.name] || option.description;
              const placeholder = command.modalPlaceholders?.[option.name] || '';
              const input = new TextInputBuilder()
                .setCustomId(option.name)
                .setLabel(label.slice(0, 45))
                .setPlaceholder(placeholder.slice(0, 100))
                .setValue(value == null ? '' : String(value))
                .setRequired(option.required)
                .setStyle(option.name === 'message' ? TextInputStyle.Paragraph : TextInputStyle.Short);
              // Each row can only hold one input
              const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
              if (!command.modalHiddenArgs?.includes(option.name)) modal.addComponents(row);
            });
          try {
            await interaction.showModal(modal);
          } catch (err) {
            handleError(err, interaction);
          }
          return;
        }
      }
      try {
        if (command.runCommand) await command.runCommand(interaction);
      } catch (err) {
        handleError(err, interaction);
      }
    } else if (isContextMenu(interaction)) {
      if (command.guildOnly && !interaction.guild) {
        await interaction.reply({
          ephemeral: true,
          content: 'This command can only be used in a guild (server).',
        });
        return;
      }
      try {
        if (command.runContextMenu) await command.runContextMenu(interaction);
      } catch (err) {
        handleError(err, interaction);
      }
    } else if (isButton(interaction)) {
      try {
        if (command.buttonAction) await command.buttonAction(interaction);
      } catch (err) {
        handleError(err, interaction);
      }
    } else if (isModalSubmit(interaction)) {
      try {
        if (command.runModal) await command.runModal(interaction);
      } catch (err) {
        handleError(err, interaction);
      }
    }
  });
}
