export interface Player {
  id: string
  name: string
  level: number
  gearBonus: number
  gender: 'male' | 'female'
  race: 'human' | 'elf' | 'dwarf' | 'halfling'
  class: 'none' | 'warrior' | 'wizard' | 'thief' | 'cleric'
}

export type IncomingMessageType =
  | 'room_state'
  | 'player_joined'
  | 'player_left'
  | 'player_updated'
  | 'error'

export interface RoomStateMessage {
  type: 'room_state'
  roomCode: string
  players: Player[]
}

export interface PlayerJoinedMessage {
  type: 'player_joined'
  player: Player
}

export interface PlayerLeftMessage {
  type: 'player_left'
  playerId: string
}

export interface PlayerUpdatedMessage {
  type: 'player_updated'
  player: Player
}

export interface ErrorMessage {
  type: 'error'
  message: string
}

export type ServerMessage =
  | RoomStateMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | PlayerUpdatedMessage
  | ErrorMessage

export interface OutgoingJoinMessage {
  type: 'join_room'
  roomCode: string
  playerName: string
}

export interface OutgoingUpdateMessage {
  type: 'update_stats'
  player: Omit<Player, 'id'>
}

export interface OutgoingLeaveMessage {
  type: 'leave_room'
}

export type ClientMessage =
  | OutgoingJoinMessage
  | OutgoingUpdateMessage
  | OutgoingLeaveMessage

