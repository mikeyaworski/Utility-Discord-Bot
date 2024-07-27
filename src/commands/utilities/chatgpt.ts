import type { Command, CommandOrModalRunMethod } from 'src/types';
import type { Attachment } from 'discord.js';

import { SlashCommandBuilder } from '@discordjs/builders';
import OpenAI from 'openai';
import NodeCache from 'node-cache';

import {
  chunkReplies,
  getBooleanArg,
  getRateLimiterFromEnv,
  parseInput,
  throwIfNotImageAttachment,
} from 'src/discord-utils';
import { ENV_LIMITER_SPLIT_REGEX } from 'src/constants';

export type ChatMessage = OpenAI.ChatCompletionMessageParam;

const model = process.env.CHATGPT_MODEL || 'gpt-4o-mini';
const apiKey = process.env.OPENAI_SECRET_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;

const conversationTimeLimit = process.env.CHATGPT_CONVERSATION_TIME_LIMIT;
const conversations = conversationTimeLimit ? new NodeCache({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  stdTTL: Number(conversationTimeLimit),
  checkperiod: 600,
}) : null;

const regularRateLimiter = getRateLimiterFromEnv('CHATGPT_USER_LIMIT', 'CHATGPT_GUILD_LIMIT');
const whiteListedRateLimiter = getRateLimiterFromEnv('CHATGPT_WHITELIST_USER_LIMIT', 'CHATGPT_GUILD_LIMIT');

const whiteListedUserIds = new Set<string>(process.env.CHATGPT_WHITELIST_USER_IDS?.split(ENV_LIMITER_SPLIT_REGEX) || []);

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
commandBuilder.addAttachmentOption(option => {
  return option
    .setName('image')
    .setDescription('An image to include with your query.')
    .setRequired(false);
});
commandBuilder.addBooleanOption(option => {
  return option
    .setName('ephemeral')
    .setDescription('Whether you want to show the answer to only you.')
    .setRequired(false);
});

export async function getChatGptResponse(options: {
  query: string,
  queryImage?: string, // URL
  userId: string,
  guildId?: string | null,
  conversation?: ChatMessage[],
}): Promise<string> {
  if (!openai) {
    throw new Error('ChatGPT is not configured on the bot.');
  }

  const { userId, guildId, query, queryImage } = options;

  if (queryImage && !whiteListedUserIds.has(userId)) {
    throw new Error('You are not permitted to submit images.');
  }

  // This throws an error if rate limited
  const rateLimiter = whiteListedUserIds.has(userId) ? whiteListedRateLimiter : regularRateLimiter;
  await rateLimiter.attempt({ userId, guildId });

  const conversationKey = userId + guildId;
  const conversation = options.conversation ?? conversations?.get<ChatMessage[]>(conversationKey) ?? [];

  const newMessage: ChatMessage = {
    role: 'user',
    content: queryImage ? [
      { type: 'text', text: query },
      {
        type: 'image_url',
        image_url: {
          url: queryImage,
          detail: 'low',
        },
      },
    ] : query,
  };

  const chatCompletion = await openai.chat.completions.create({
    model,
    messages: [
      ...conversation,
      newMessage,
    ],
  });
  const responseMessage = chatCompletion.choices[0].message;

  // Update cached conversation
  if (responseMessage && conversations && !options.conversation) {
    const conversation = conversations.get<ChatMessage[]>(userId + guildId) ?? [];
    conversations.set(conversationKey, [
      ...conversation,
      newMessage,
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
  const attachment: Attachment | undefined = inputs.image;
  const userId = interaction.user.id;
  const guildId = interaction.guildId || '';

  const queryImage = attachment?.url;
  throwIfNotImageAttachment(attachment);

  const content = await getChatGptResponse({
    query,
    queryImage,
    userId,
    guildId,
  });

  await chunkReplies({
    interaction,
    content,
    ephemeral,
  });
};

const ChatGptCommand: Command = {
  guildOnly: false,
  slashCommandData: commandBuilder,
  modalHiddenArgs: ['image'],
  modalLabels: {
    ephemeral: 'Show only to you? (Defaults to "no")',
  },
  modalPlaceholders: {
    ephemeral: 'yes/no',
  },
  runCommand: run,
  runModal: run,
};

export default ChatGptCommand;
