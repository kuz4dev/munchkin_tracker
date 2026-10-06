import type { ChangeLogEntry, Player } from '@munchkin/core'

export function player(id: string, name: string, overrides: Partial<Player> = {}): Player {
  return { id, name, level: 1, gearBonus: 0, gender: 'male', race: 'human', class: 'none', connected: true, ...overrides }
}

let seq = 0
export function entry(overrides: Partial<ChangeLogEntry> = {}): ChangeLogEntry {
  seq++
  return { seq, timestamp: seq * 1000, playerId: 'p1', playerName: 'Alice', eventType: 'join', ...overrides }
}
