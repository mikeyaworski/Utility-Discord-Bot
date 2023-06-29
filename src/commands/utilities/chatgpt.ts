import type { Command, CommandOrModalRunMethod } from 'src/types';

import { SlashCommandBuilder } from '@discordjs/builders';
import { Configuration, OpenAIApi, ChatCompletionRequestMessage } from 'openai';
import NodeCache from 'node-cache';

import {
  getBooleanArg,
  getRateLimiter,
  parseInput,
} from 'src/discord-utils';
import { ENV_LIMITER_SPLIT_REGEX } from 'src/constants';

const apiKey = process.env.OPENAI_SECRET_KEY;
const configuration = new Configuration({
  apiKey,
});
const openai = new OpenAIApi(configuration);

const conversationTimeLimit = process.env.CHATGPT_CONVERSATION_TIME_LIMIT;
const conversations = conversationTimeLimit ? new NodeCache({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  stdTTL: Number(conversationTimeLimit),
  checkperiod: 600,
}) : null;

const userLimit = process.env.CHATGPT_USER_LIMIT?.split(ENV_LIMITER_SPLIT_REGEX).map(str => Number(str));
const guildLimit = process.env.CHATGPT_GUILD_LIMIT?.split(ENV_LIMITER_SPLIT_REGEX).map(str => Number(str));
const rateLimiter = getRateLimiter({
  userLimit: userLimit ? {
    points: userLimit[0],
    duration: userLimit[1],
  } : undefined,
  guildLimit: guildLimit ? {
    points: guildLimit[0],
    duration: guildLimit[1],
  } : undefined,
});

const commandBuilder = new SlashCommandBuilder();
commandBuilder
  .setName('chatgpt')
  .setDescription('Queries ChatGPT.');
commandBuilder.addStringOption(option => {
  return option
    .setName('query')
    .setDescription('The query (a question for ChatGPT).')
    .setRequired(true);
});
commandBuilder.addBooleanOption(option => {
  return option
    .setName('ephemeral')
    .setDescription('Whether you want to show the answer to only you.')
    .setRequired(false);
});

export async function getChatGptResponse({
  query,
  userId,
  guildId,
}: {
  query: string,
  userId: string,
  guildId?: string | null,
}): Promise<string> {
  if (!apiKey) {
    throw new Error('ChatGPT is not configured on the bot.');
  }

  // This throws an error if rate limited
  await rateLimiter.attempt({ userId, guildId });

  const conversationKey = userId + guildId;
  const conversation = conversations?.get<ChatCompletionRequestMessage[]>(conversationKey) ?? [];
  const chatCompletion = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: [
      ...conversation,
      {
        role: 'user',
        content: query,
      },
    ],
  });
  const responseMessage = chatCompletion.data.choices[0].message;

  // Update cached conversation
  if (responseMessage && conversations) {
    const conversation = conversations.get<ChatCompletionRequestMessage[]>(userId + guildId) ?? [];
    conversations.set(conversationKey, [
      ...conversation,
      {
        role: 'user',
        content: query,
      },
      responseMessage,
    ]);
  }

  return responseMessage?.content || 'Something went wrong. Blame Open AI.';
}

const run: CommandOrModalRunMethod = async interaction => {
  const ephemeral = getBooleanArg(interaction, 'ephemeral');
  await interaction.deferReply({ ephemeral });

  const inputs = await parseInput({ slashCommandData: commandBuilder, interaction });
  const query: string = inputs.query;

  const userId = interaction.user.id;
  const guildId = interaction.guildId || '';

  const content = await getChatGptResponse({
    query,
    userId,
    guildId,
  });

  await interaction.editReply({
    content,
  });
};

const ChatGptCommand: Command = {
  guildOnly: false,
  slashCommandData: commandBuilder,
  runCommand: run,
  runModal: run,
};

export default ChatGptCommand;
