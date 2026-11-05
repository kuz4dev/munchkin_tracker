import { power } from './game'
import type { Player } from './protocol'

export type CombatResult = 'win' | 'lose' | 'draw'

export interface CombatInput {
  player: Pick<Player, 'level' | 'gearBonus'>
  /** Everyone helping the player */
  allies?: readonly Pick<Player, 'level' | 'gearBonus'>[]
  /** Bonus from one-shot cards played for the player's side */
  playerCardBonus?: number
  monsterPower: number
  /** Bonus from cards played for the monster */
  monsterCardBonus?: number
}

export interface CombatOutcome {
  /** Player (plus allies) power before cards */
  playerBase: number
  playerTotal: number
  monsterTotal: number
  result: CombatResult
  /** How much the stronger side is ahead by */
  margin: number
}

/** Munchkin combat: the players win only if strictly stronger; a tie goes to the monster. */
export function resolveCombat(input: CombatInput): CombatOutcome {
  const playerBase = (input.allies ?? []).reduce((sum, ally) => sum + power(ally), power(input.player))
  const playerTotal = playerBase + (input.playerCardBonus ?? 0)
  const monsterTotal = input.monsterPower + (input.monsterCardBonus ?? 0)
  const result: CombatResult =
    playerTotal > monsterTotal ? 'win' : playerTotal < monsterTotal ? 'lose' : 'draw'
  return { playerBase, playerTotal, monsterTotal, result, margin: Math.abs(playerTotal - monsterTotal) }
}

/** Running away works on a roll of this or higher. */
export const FLEE_MIN_ROLL = 5

export function fleeSucceeded(roll: number): boolean {
  return roll >= FLEE_MIN_ROLL
}

export function formatBonus(n: number): string {
  if (n > 0) return `+${n}`
  if (n < 0) return `${n}`
  return '0'
}
