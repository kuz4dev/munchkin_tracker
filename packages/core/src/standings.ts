import { power } from './game'
import type { Player } from './protocol'

/** Final ranking: the winner first, then by level, then by power. */
export function rankPlayers(players: readonly Player[], winnerId?: string): Player[] {
  return [...players].sort((a, b) => {
    if (a.id === winnerId) return -1
    if (b.id === winnerId) return 1
    return b.level - a.level || power(b) - power(a)
  })
}

/** Order for picking a winner: highest level first, then by name. */
export function byLevelThenName(players: readonly Player[]): Player[] {
  return [...players].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))
}
