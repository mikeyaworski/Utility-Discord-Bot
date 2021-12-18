import type { Command } from 'src/types';
import { ContextMenuTypes, IntentionalAny } from 'src/types';
import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, ContextMenuInteraction, Interaction } from 'discord.js';
import { attachPlayerButtons, replyWithSessionButtons } from './utils';
import sessions from './sessions';

async function loopContextMenu(interaction:ContextMenuInteraction) : Promise<IntentionalAny> {
  await interaction.deferReply({ ephemeral: true });
  const session = sessions.get(interaction.guild!);
  if (!session) return interaction.editReply('Session does not exist.');

  // eslint-disable-next-line max-len
  const looped = session.isLooped() ? (session.unloop(), await interaction.editReply('Unlooped.')) : (session.loop(), await interaction.editReply('Looped.'));
  return looped;
}

const LoopCommand: Command = {
  guildOnly: true,
  slashCommandData: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Loop the current track.'),
  contextMenuData: {
    type: ContextMenuTypes.USER,
    name: 'loop/unloop',
  },
  runContextMenu: loopContextMenu,
  runCommand: async interaction => {
    await interaction.deferReply({ ephemeral: true });
    const session = sessions.get(interaction.guild!);
    if (!session) return interaction.editReply('Session does not exist.');

    session.loop();
    const loop = interaction.options.getBoolean('loop', true);
    if (loop) session.loop();
    else session.unloop();
    await replyWithSessionButtons({
      interaction,
      session: sessions.get(interaction.guild!),
      run: async s => {
        return {
          message: `Queue loop: ${s.isLooped() ? 'ON' : 'OFF'}.`,
        };
      },
    });
    return null;
  },
};

export default LoopCommand;
