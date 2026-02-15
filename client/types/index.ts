export interface Player {
  id: string
  sessionId?: string
  name: string
  level: number
  gearBonus: number
  gender: 'male' | 'female'
  race: 'human' | 'elf' | 'dwarf' | 'halfling'
  class: 'none' | 'warrior' | 'wizard' | 'thief' | 'cleric'
}

export interface ChangeLogEntry {
  timestamp: number
  playerName: string
  eventType: 'join' | 'leave' | 'stat_change'
  field?: string
  oldValue?: string
  newValue?: string
}

export type IncomingMessageType =
  | 'room_state'
  | 'player_joined'
  | 'player_left'
  | 'player_updated'
  | 'changelog_entry'
  | 'error'

export interface RoomStateMessage {
  type: 'room_state'
  roomCode: string
  players: Player[]
  changeLog?: ChangeLogEntry[]
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

export interface ChangeLogEntryMessage {
  type: 'changelog_entry'
  changeLogEntry: ChangeLogEntry
}

export type ServerMessage =
  | RoomStateMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | PlayerUpdatedMessage
  | ChangeLogEntryMessage
  | ErrorMessage

export interface OutgoingJoinMessage {
  type: 'join_room'
  roomCode: string
  playerName: string
  sessionId?: string
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

