import type { Player } from '@/types'

// Keep in sync with server/internal/models/models.go
export const MIN_LEVEL = 1
export const MAX_LEVEL = 10
export const MIN_GEAR_BONUS = 0
export const MAX_GEAR_BONUS = 999
export const MAX_NAME_LENGTH = 24

export const RACES: { value: Player['race']; label: string }[] = [
  { value: 'human', label: 'Человек' },
  { value: 'elf', label: 'Эльф' },
  { value: 'dwarf', label: 'Дварф' },
  { value: 'halfling', label: 'Хафлинг' },
]

export const CLASSES: { value: Player['class']; label: string }[] = [
  { value: 'none', label: 'Без класса' },
  { value: 'warrior', label: 'Воин' },
  { value: 'wizard', label: 'Волшебник' },
  { value: 'thief', label: 'Вор' },
  { value: 'cleric', label: 'Клирик' },
]

export const GENDERS: { value: Player['gender']; label: string }[] = [
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
