import { client } from 'src/client';
import { array } from 'src/utils';
import { handleError } from 'src/discord-utils';

import Poll from './utilities/poll';
import Move from './utilities/move';
import Delete from './utilities/delete';
import BaseRoles from './utilities/base-roles';
import StreamerRules from './utilities/streamer-rules';
import ReactionRoles from './utilities/reaction-roles';
import Reminders from './utilities/reminders';
import Timers from './utilities/timers';
import Say from './utilities/say';

import Chess from './chess';

import Play from './player/play';
import Connect from './player/connect';
import Seek from './player/seek';
import Skip from './player/skip';
import Leave from './player/leave';
import Pause from './player/pause';
import Resume from './player/resume';
import NowPlaying from './player/now-playing';
import Queue from './player/queue';
import Shuffle from './player/shuffle';
import Loop from './player/loop';

const commands = [
  Poll,
  Move,
  Delete,
  BaseRoles,
  StreamerRules,
  ReactionRoles,
  Reminders,
  Timers,
  Say,

  Chess,

  Play,
  Connect,
  Seek,
  Skip,
  Pause,
  Resume,
  NowPlaying,
  Queue,
  Leave,
  Shuffle,
  Loop,
];

export default commands;

export function listenToCommands(): void {
  client.on('interactionCreate', async interaction => {
    const command = commands.find(c => {
      if (interaction.isCommand()) {
        return interaction.commandName === c.slashCommandData?.name;
      }
      if (interaction.isContextMenu()) {
        return interaction.commandName === c.contextMenuData?.name;
      }
      if (interaction.isButton()) {
        return interaction.message.interaction
            && 'commandName' in interaction.message.interaction
            && interaction.message.interaction.commandName === c.slashCommandData?.name;
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
      try {
        if (command.runCommand) await command.runCommand(interaction);
      } catch (err) {
        handleError(err, interaction);
      }
    } else if (interaction.isContextMenu()) {
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
    } else if (interaction.isButton()) {
      try {
        if (command.buttonAction) await command.buttonAction(interaction);
      } catch (err) {
        handleError(err, interaction);
      }
    }
  });
}
