import type {
  Command,
  CommandoMessage,
  CommandoClient,
  ArgumentCollectorResult,
} from 'discord.js-commando';
import type { Message } from 'discord.js';

export type GenericMapping<T1, T2 extends string = string> = {
  [key in T2]?: T1;
}

export type StringMapping = GenericMapping<string>;
export type UnknownMapping = GenericMapping<unknown>;

export type ClientType = CommandoClient;

// The typing is bad because they use object as a type, so
// we define it manually until they fix it.
// export type CommandRunMethod = typeof Command.prototype.run;
export type CommandRunMethod<T1 = UnknownMapping | string | string[]> = (
  message: CommandoMessage,
  args: T1,
  fromPattern: boolean,
  result?: ArgumentCollectorResult,
) => Promise<Message | Message[] | null> | null;
