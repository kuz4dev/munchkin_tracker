import type { Player } from '@/types'

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
