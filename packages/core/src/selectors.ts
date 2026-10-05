// Derived state. With React, wrap selectors that return new arrays in
// zustand's useShallow to avoid needless re-renders.
import type { GameState } from './store'
import type { Player } from './protocol'

export const selectCurrentPlayer = (s: GameState): Player | undefined => s.players[s.playerId]
export const selectAllPlayers = (s: GameState): Player[] => Object.values(s.players)
export const selectOtherPlayers = (s: GameState): Player[] =>
  Object.values(s.players).filter((p) => p.id !== s.playerId)
export const selectIsHost = (s: GameState): boolean => !!s.playerId && s.hostId === s.playerId
export const selectHost = (s: GameState): Player | undefined => (s.hostId ? s.players[s.hostId] : undefined)
export const selectWinner = (s: GameState): Player | undefined => (s.winnerId ? s.players[s.winnerId] : undefined)
export const selectIsFinished = (s: GameState): boolean => s.status === 'finished'
/** Whether events older than the loaded ones exist (seq starts at 1) */
export const selectHasOlder = (s: GameState): boolean => (s.changelog[0]?.seq ?? 1) > 1
export const selectConnected = (s: GameState): boolean => s.connectionStatus === 'connected'
