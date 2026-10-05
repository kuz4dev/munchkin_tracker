import type { Player, PlayerStats } from './protocol'

// Keep in sync with server/internal/models/models.go
export const MIN_LEVEL = 1
export const MAX_LEVEL = 10
export const MIN_GEAR_BONUS = 0
export const MAX_GEAR_BONUS = 999
export const MAX_NAME_LENGTH = 24
export const ROOM_CODE_LENGTH = 6

export interface Option<T extends string> {
  value: T
  label: string
}

export const RACES: Option<PlayerStats['race']>[] = [
  { value: 'human', label: 'Человек' },
  { value: 'elf', label: 'Эльф' },
  { value: 'dwarf', label: 'Дварф' },
  { value: 'halfling', label: 'Хафлинг' },
]

export const CLASSES: Option<PlayerStats['class']>[] = [
  { value: 'none', label: 'Без класса' },
  { value: 'warrior', label: 'Воин' },
  { value: 'wizard', label: 'Волшебник' },
  { value: 'thief', label: 'Вор' },
  { value: 'cleric', label: 'Клирик' },
]

export const GENDERS: Option<PlayerStats['gender']>[] = [
  { value: 'male', label: 'Мужской' },
  { value: 'female', label: 'Женский' },
]

export const FIELD_LABELS: Record<string, string> = {
  level: 'уровень',
  gearBonus: 'бонусы',
  gender: 'пол',
  race: 'раса',
  class: 'класс',
}

export function getLabel(list: readonly { value: string; label: string }[], value: string): string {
  return list.find((item) => item.value === value)?.label ?? value
}

export function power(p: Pick<Player, 'level' | 'gearBonus'>): number {
  return p.level + p.gearBonus
}

export function clampLevel(level: number): number {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level))
}

export function clampGearBonus(bonus: number): number {
  return Math.max(MIN_GEAR_BONUS, Math.min(MAX_GEAR_BONUS, bonus))
}

/** Normalizes user input to a room code: uppercase, trimmed. */
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase()
}
