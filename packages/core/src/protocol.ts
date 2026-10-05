// Wire protocol shared with the Go server (server/internal/models).

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
  /** The player who may finish the game */
  hostId?: string
  /** Unix ms */
  createdAt: number
  /** Unix ms, only for finished games */
  finishedAt?: number
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

export interface ChangeLogEntryMessage {
  type: 'changelog_entry'
  changeLogEntry: ChangeLogEntry
}

export interface HostChangedMessage {
  type: 'host_changed'
  /** Absent when nobody is left to host */
  hostId?: string
}

export interface GameFinishedMessage {
  type: 'game_finished'
  status: 'finished'
  winnerId?: string
  finishedAt: number
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
  | ChangeLogEntryMessage
  | HostChangedMessage
  | GameFinishedMessage
  | ErrorMessage

export interface JoinRoomMessage {
  type: 'join_room'
  roomCode: string
  playerName: string
  sessionId?: string
}

export interface UpdateStatsMessage {
  type: 'update_stats'
  player: PlayerStats
}

export interface LeaveRoomMessage {
  type: 'leave_room'
}

export interface FinishGameMessage {
  type: 'finish_game'
  /** Omit to finish without a winner */
  winnerId?: string
}

export type ClientMessage = JoinRoomMessage | UpdateStatsMessage | LeaveRoomMessage | FinishGameMessage

/** Server error messages the client reacts to (see server/internal/room). */
export const ServerErrors = {
  roomNotFound: 'room not found',
  sessionReplaced: 'session replaced',
  gameFinished: 'game finished',
  unavailable: 'temporarily unavailable',
  roomFull: 'room is full',
  notHost: 'only the host can finish the game',
} as const
