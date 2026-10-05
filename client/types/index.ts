/** Fields a player is allowed to change about themselves. */
export interface PlayerStats {
  level: number
  gearBonus: number
  gender: 'male' | 'female'
  race: 'human' | 'elf' | 'dwarf' | 'halfling'
  class: 'none' | 'warrior' | 'wizard' | 'thief' | 'cleric'
}

export interface Player extends PlayerStats {
  /** Stable for the whole game, across reconnects */
  id: string
  name: string
  /** False while the player's device is disconnected */
  connected: boolean
}

export interface ChangeLogEntry {
  /** Position of the event within its game, starting at 1 */
  seq: number
  timestamp: number
  playerId: string
  playerName: string
  /** For 'finish': newValue holds the winner's name (empty if none) */
  eventType: 'join' | 'leave' | 'stat_change' | 'finish'
  field?: string
  oldValue?: string
  newValue?: string
}

export type GameStatus = 'active' | 'finished'

export type IncomingMessageType =
  | 'game_finished'
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
  /** The recipient's own player ID */
  playerId: string
  /** The recipient's secret reconnect token (never sent to other players) */
  sessionId: string
  changeLog?: ChangeLogEntry[]
  status: GameStatus
  winnerId?: string
  /** Unix ms */
  createdAt: number
  /** Unix ms, only for finished games */
  finishedAt?: number
}

export interface GameFinishedMessage {
  type: 'game_finished'
  status: 'finished'
  winnerId?: string
  finishedAt: number
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
  | GameFinishedMessage
  | ErrorMessage

export interface OutgoingJoinMessage {
  type: 'join_room'
  roomCode: string
  playerName: string
  sessionId?: string
}

export interface OutgoingUpdateMessage {
  type: 'update_stats'
  player: PlayerStats
}

export interface OutgoingLeaveMessage {
  type: 'leave_room'
}

export interface OutgoingFinishMessage {
  type: 'finish_game'
  /** Omit to finish without a winner */
  winnerId?: string
}

export type ClientMessage =
  | OutgoingJoinMessage
  | OutgoingUpdateMessage
  | OutgoingLeaveMessage
  | OutgoingFinishMessage

