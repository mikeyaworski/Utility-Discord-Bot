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
  PermissionString,
  ContextMenuInteraction,
} from 'discord.js';
import type { SlashCommandBuilder } from '@discordjs/builders';
import type { Sequelize, ModelCtor } from 'sequelize/types';

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
  runCommand?: (interaction: CommandInteraction) => Promise<IntentionalAny>,
  runContextMenu?: (interaction: ContextMenuInteraction) => Promise<IntentionalAny>,
  buttonAction?: (interaction: ButtonInteraction) => Promise<IntentionalAny>,
  guildOnly?: boolean,
  userPermissions?: PermissionString | PermissionString[],
  clientPermissions?: PermissionString | PermissionString[],
}

export type CommandRunMethod = Command['runCommand'];
export type CommandButtonActionMethod = Command['buttonAction'];

type BeforeConfirmResponse<T> = null | {
  intermediateResult: T,
  confirmPrompt?: string,
  workingMessage?: string,
  declinedMessage?: string;
}

export type CommandBeforeConfirmMethod<T2 = unknown> = (
  interaction: CommandInteraction,
) => Promise<BeforeConfirmResponse<T2>>;

export type CommandAfterConfirmMethod<T2 = unknown> = (
  interaction: CommandInteraction,
  beforeResult: T2,
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
];

// TODO: type this better than "any"
type Model = ModelCtor<IntentionalAny>;
export type ModelKey = 'streamer_rules' | 'streamer_rollback_roles' | 'reaction_roles' | 'reaction_messages_unique' | 'base_roles' | 'reminders';
export type ModelMapping = GenericMapping<Model, ModelKey>;
export type ModelDefinition = (sequelize: Sequelize) => [
  ModelKey,
  Model,
  (models: ModelMapping) => void, // associations
] | [
  ModelKey,
  Model,
];
