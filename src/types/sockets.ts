import { ChessGames } from 'src/models/chess-games';
import { ChessGameResponse, ReminderResponse } from 'src/types';

export enum SocketEventTypes {
  REMINDER_CREATED = 'REMINDER_CREATED',
  REMINDER_UPDATED = 'REMINDER_UPDATED',
  REMINDER_DELETED = 'REMINDER_DELETED',
  CHESS_CHALLENGED = 'CHESS_CHALLENGED',
  CHESS_CHALLENGE_ACCEPTED = 'CHESS_CHALLENGE_ACCEPTED',
  CHESS_CHALLENGE_DECLINED = 'CHESS_CHALLENGE_DECLINED',
  CHESS_GAME_UPDATED = 'CHESS_GAME_UPDATED',
  CHESS_GAME_RESIGNED = 'CHESS_GAME_RESIGNED',
}

export type SocketEvent =
{
  type: SocketEventTypes.REMINDER_CREATED,
  data: ReminderResponse,
}
|
{
  type: SocketEventTypes.REMINDER_UPDATED,
  data: ReminderResponse,
}
|
{
  type: SocketEventTypes.REMINDER_DELETED,
  data: { id: ReminderResponse['model']['id'] },
}
|
{
  type: SocketEventTypes.CHESS_CHALLENGED,
  data: ChessGameResponse,
}
|
{
  type: SocketEventTypes.CHESS_CHALLENGE_ACCEPTED,
  data: ChessGameResponse,
}
|
{
  type: SocketEventTypes.CHESS_CHALLENGE_DECLINED,
  data: { id: ChessGames['id'] },
}
|
{
  type: SocketEventTypes.CHESS_GAME_UPDATED,
  data: ChessGameResponse,
}
|
{
  type: SocketEventTypes.CHESS_GAME_RESIGNED,
  data: { id: ChessGames['id'], resigner: string },
}
