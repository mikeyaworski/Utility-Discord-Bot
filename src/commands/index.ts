import { ContextMenuInteraction } from 'discord.js';
import { client } from 'src/client';
import { array } from 'src/utils';
import Poll from './utilities/poll';
import Move from './utilities/move';
import Delete from './utilities/delete';
import BaseRoles from './utilities/base-roles';
import StreamerRules from './utilities/streamer-rules';
import ReactionRoles from './utilities/reaction-roles';
import Reminders from './utilities/reminders';
import Play from './player/play';
import Stop from './player/stop';

const commands = [
  Poll,
  Move,
  Delete,
  BaseRoles,
  StreamerRules,
  ReactionRoles,
  Reminders,
  Play,
  Stop,
];

export default commands;

export function listenToCommands(): void {
  client.on('interactionCreate', async interaction => {
    const command = commands.find(c => {
      if (interaction.isCommand()) {
        return interaction.commandName === c.slashCommandData.name;
      }
      if (interaction.isContextMenu()) {
        return interaction.commandName === c.contextMenuData?.name;
      }
      if (interaction.isButton()) {
        return interaction.message.interaction
            && 'commandName' in interaction.message.interaction
            && interaction.message.interaction.commandName === c.slashCommandData.name;
      }
      return false;
    });
    if (!command) return;

    if (interaction.isCommand()) {
      if (command.guildOnly && !interaction.guild) {
        await interaction.reply({
          ephemeral: true,
          content: 'This command can only be used in a guild (server).',
        });
        return;
      }
      if (interaction.guild && command.clientPermissions) {
        const expectedClientPermissions = array(command.clientPermissions);
        const actualClientPermissions = interaction.guild.me?.permissions;
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
      if (command.runCommand) command.runCommand(interaction);
    } else if (interaction.isContextMenu()) {
      if (command.guildOnly && !interaction.guild) {
        await interaction.reply({
          ephemeral: true,
          content: 'This command can only be used in a guild (server).',
        });
        return;
      }
      if (command.runContextMenu) command.runContextMenu(interaction);
    } else if (interaction.isButton()) {
      if (command.buttonAction) command.buttonAction(interaction);
    }
  });
}
