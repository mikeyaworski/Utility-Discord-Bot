import type {
  CommandoMessage,
  CommandoClient,
  ArgumentCollectorResult,
} from 'discord.js-commando';
import type {
  Message,
  Presence,
  MessageReaction,
  User,
  Collection,
  Snowflake,
  GuildMember,
} from 'discord.js';
import type { Sequelize, ModelCtor } from 'sequelize/types';

// https://stackoverflow.com/a/43001581/2554605
export type Mutable<T> = { -readonly [P in keyof T]: T[P] };
export type DeepMutable<T> = { -readonly [P in keyof T]: DeepMutable<T[P]> };

export type GenericMapping<T1, T2 extends string = string> = {
  [key in T2]: T1;
}

export type StringMapping = GenericMapping<string>;
export type BooleanMapping = GenericMapping<boolean>;
export type UnknownMapping = GenericMapping<unknown>;

export type EitherMessage = Message | CommandoMessage;

export type ClientType = CommandoClient;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LogArg = any;

// The typing is bad because they use object as a type, so
// we define it manually until they fix it.
// export type CommandRunMethod = typeof Command.prototype.run;
export type CommandRunMethod<T1 = UnknownMapping | string | string[]> = (
  message: CommandoMessage,
  args: T1,
  fromPattern: boolean,
  result?: ArgumentCollectorResult,
) => Promise<Message | Message[] | null> | null;

export type CommandBeforeConfirmMethod<T1 = UnknownMapping | string | string[], T2 = unknown> = (
  message: CommandoMessage,
  args: T1,
  fromPattern: boolean,
  result?: ArgumentCollectorResult,
) => Promise<[T2, string] | [T2] | null>;

export type CommandAfterConfirmMethod<T1 = UnknownMapping | string | string[], T2 = unknown> = (
  beforeResult: T2,
  message: CommandoMessage,
  args: T1,
  fromPattern: boolean,
  result?: ArgumentCollectorResult,
) => Promise<string>;

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

/* eslint-disable @typescript-eslint/no-explicit-any */
// TODO: type this better than "any"
type Model = ModelCtor<any>;
export type ModelKey = 'streamer_rules' | 'streamer_rollback_roles' | 'reaction_roles' | 'reaction_messages_unique' | 'base_roles';
export type ModelMapping = GenericMapping<Model, ModelKey>;
export type ModelDefinition = (sequelize: Sequelize) => [
  ModelKey,
  Model,
  (models: ModelMapping) => void, // associations
] | [
  ModelKey,
  Model,
];
/* eslint-enable @typescript-eslint/no-explicit-any */

export type CommandOperationHandler<Args> = (commandMsg: CommandoMessage, args: Args) => Promise<Message | Message[]>;
