import { power } from './game'
import type { Player } from './protocol'

export type CombatResult = 'win' | 'lose' | 'draw'

export interface CombatInput {
  player: Pick<Player, 'level' | 'gearBonus'>
  ally?: Pick<Player, 'level' | 'gearBonus'> | null
  /** Bonus from one-shot cards played for the player's side */
  playerCardBonus?: number
  monsterPower: number
  /** Bonus from cards played for the monster */
  monsterCardBonus?: number
}

export interface CombatOutcome {
  /** Player (plus ally) power before cards */
  playerBase: number
  playerTotal: number
  monsterTotal: number
  result: CombatResult
  /** How much the stronger side is ahead by */
  margin: number
}

/** Munchkin combat: the players win only if strictly stronger; a tie goes to the monster. */
export function resolveCombat(input: CombatInput): CombatOutcome {
  const playerBase = power(input.player) + (input.ally ? power(input.ally) : 0)
  const playerTotal = playerBase + (input.playerCardBonus ?? 0)
  const monsterTotal = input.monsterPower + (input.monsterCardBonus ?? 0)
  const result: CombatResult =
    playerTotal > monsterTotal ? 'win' : playerTotal < monsterTotal ? 'lose' : 'draw'
  return { playerBase, playerTotal, monsterTotal, result, margin: Math.abs(playerTotal - monsterTotal) }
}

export function formatBonus(n: number): string {
  if (n > 0) return `+${n}`
  if (n < 0) return `${n}`
  return '0'
}
