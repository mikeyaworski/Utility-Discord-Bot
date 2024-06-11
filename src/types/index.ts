import type {
  Client,
  Message,
  Presence,
  MessageReaction,
  User,
  Collection,
  Snowflake,
  GuildMember,
  CommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  ContextMenuCommandInteraction,
  MessageComponentInteraction,
  CacheType,
  GuildCacheMessage,
  PermissionResolvable,
  APIEmbedField,
  ChatInputCommandInteraction,
  TextChannel,
  AnyThreadChannel,
  VoiceChannel,
  VoiceState,
} from 'discord.js';
import type { SlashCommandBuilder } from '@discordjs/builders';
import type { Sequelize } from 'sequelize/types';
import type { RateLimiterMemory } from 'rate-limiter-flexible';
import { Reminder } from 'src/models/reminders';
import { editLatest } from 'src/discord-utils';
import { ChessGames } from 'src/models/chess-games';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IntentionalAny = any;

export type Falsy = | undefined | '' | false | null | 0;

// https://stackoverflow.com/a/43001581/2554605
export type Mutable<T> = { -readonly [P in keyof T]: T[P] };
export type DeepMutable<T> = { -readonly [P in keyof T]: DeepMutable<T[P]> };

export type GenericMapping<T1, T2 extends string = string> = {
  [key in T2]: T1;
}

export type StringMapping = GenericMapping<string>;
export type BooleanMapping = GenericMapping<boolean>;
export type UnknownMapping = GenericMapping<unknown>;
export type AnyMapping = GenericMapping<IntentionalAny>;

export type ClientType = Client;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LogArg = any;

export enum ContextMenuTypes {
  USER = 2,
  MESSAGE = 3,
}

export interface Command {
  // TODO: Properly generalize the data type
  slashCommandData?: SlashCommandBuilder | ReturnType<SlashCommandBuilder['addStringOption']>,
  contextMenuData?: {
    name: string,
    type: ContextMenuTypes,
  },
  runCommand?: (interaction: ChatInputCommandInteraction) => Promise<IntentionalAny>,
  runContextMenu?: (interaction: ContextMenuCommandInteraction) => Promise<IntentionalAny>,
  runModal?: (interaction: ModalSubmitInteraction) => Promise<IntentionalAny>,
  modalLabels?: StringMapping,
  modalPlaceholders?: StringMapping,
  modalHiddenArgs?: string[],
  showModalWithNoArgs?: boolean,
  buttonAction?: (interaction: ButtonInteraction) => Promise<IntentionalAny>,
  guildOnly?: boolean,
  userPermissions?: PermissionResolvable,
  clientPermissions?: PermissionResolvable,
}

export type AnyInteraction = CommandInteraction
| ContextMenuCommandInteraction
| ModalSubmitInteraction
| ButtonInteraction
| MessageComponentInteraction<CacheType>;

export type ApiMessage = GuildCacheMessage<CacheType>;
export type MessageResponse = Message | ApiMessage;

export type EmbedFields = APIEmbedField[];

export type CommandOrModalRunMethod = (interaction: CommandInteraction | ModalSubmitInteraction) => Promise<IntentionalAny>;
export type CommandRunMethod = Command['runCommand'];
export type ModalRunMethod = Command['runModal'];
export type AnyRunMethod = CommandRunMethod | ModalRunMethod;
export type CommandButtonActionMethod = Command['buttonAction'];

export type BeforeConfirmResponse<T> = null | {
  intermediateResult: T,
  confirmPrompt?: string,
  workingMessage?: string,
  declinedMessage?: string;
}

export type CommandBeforeConfirmMethod<T = unknown> = (
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
) => Promise<BeforeConfirmResponse<T>>;

export type CommandAfterConfirmMethod<T = unknown> = (
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  beforeResult: T,
) => Promise<string | null>;

// TODO: Get these triggers from the .on() overloads for CommandoClient. Something like:
// export type EventTrigger = Parameters<typeof CommandoClient.prototype.on>
// Except that this only gets the parameters of the last defined overload...
export type EventTrigger = [
  'presenceUpdate',
  (oldMember: Presence, newMember: Presence) => void,
] | [
  'messageReactionAdd',
  (messageReaction: MessageReaction, user: User) => void,
] | [
  'messageReactionRemove',
  (messageReaction: MessageReaction, user: User) => void,
] | [
  'messageReactionRemoveAll',
  (message: Message) => void,
] | [
  'messageDelete',
  (message: Message) => void,
] | [
  'messageDeleteBulk',
  (messages: Collection<Snowflake, Message>) => void
] | [
  'guildMemberAdd',
  (member: GuildMember) => void
] | [
  'messageCreate',
  (message: Message<boolean>) => void,
] | [
  'voiceStateUpdate',
  (oldState: VoiceState, newState: VoiceState) => void,
];

export type ModelDefinition = (sequelize: Sequelize) => void;

export type EditReply = (data: Parameters<typeof editLatest>[0]['data']) => ReturnType<typeof editLatest>;

export interface ReminderResponse {
  model: Reminder,
  nextRun: number | null | undefined,
}

export interface ChessGameResponse {
  model: ChessGames,
  label: string,
}

export type GuildTextChannel = TextChannel | VoiceChannel | AnyThreadChannel;

export type RateLimitOptions = ConstructorParameters<typeof RateLimiterMemory>[0];
export type RateLimitAttemptFn = (details: { userId: string, guildId?: string | null }, points?: number) => Promise<void>;
export type RateLimiter = {
  // Throws an error with a message description if there was a consumption error
  attempt: RateLimitAttemptFn,
};
