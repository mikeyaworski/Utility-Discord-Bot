import { client } from 'src/client';
import { array } from 'src/utils';
import Poll from './utilities/poll';
import Move from './utilities/move';
import Delete from './utilities/delete';
import BaseRoles from './utilities/base-roles';
import StreamerRules from './utilities/streamer-rules';
import ReactionRoles from './utilities/reaction-roles';
import Reminders from './utilities/reminders';

const commands = [
  Poll,
  Move,
  Delete,
  BaseRoles,
  StreamerRules,
  ReactionRoles,
  Reminders,
];

export default commands;

export function listenToCommands(): void {
  client.on('interactionCreate', async interaction => {
    const command = commands.find(c => {
      if (interaction.isCommand()) {
        return interaction.commandName === c.data.name;
      }
      if (interaction.isButton()) {
        return interaction.message.interaction
            && 'commandName' in interaction.message.interaction
            && interaction.message.interaction.commandName === c.data.name;
      }
      return false;
    });
    if (interaction.isCommand()) {
      if (command?.guildOnly && !interaction.guild) {
        await interaction.reply({
          ephemeral: true,
          content: 'This command can only be used in a guild (server).',
        });
        return;
      }
      if (interaction.guild && command?.clientPermissions) {
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
      if (interaction.guild && command?.userPermissions) {
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
      if (command?.run) {
        command.run(interaction);
      }
    } else if (interaction.isButton()) {
      if (command?.buttonAction) {
        command.buttonAction(interaction);
      }
    }
  });
}
