import { CLASSES, FIELD_LABELS, GENDERS, RACES, getLabel } from './game'
import type { ChangeLogEntry } from './protocol'

export interface ChangeLogGroup {
  /** Stable identity: the first entry's seq (survives prepending history) */
  key: number
  timestamp: number
  playerId: string
  playerName: string
  eventType: ChangeLogEntry['eventType']
  /** For stat_change groups: the field that changed */
  field?: string
  /** For stat_change groups: first entry's oldValue and last entry's newValue */
  firstOldValue?: string
  lastNewValue?: string
  entries: ChangeLogEntry[]
}

/**
 * Groups consecutive stat_change entries of the same player and field
 * ("level 3 → 4 → 5" becomes "level 3 → 5"). Other events stand alone.
 */
export function groupChangelog(entries: readonly ChangeLogEntry[]): ChangeLogGroup[] {
  const result: ChangeLogGroup[] = []
  for (const entry of entries) {
    const prev = result[result.length - 1]
    if (
      prev &&
      prev.eventType === 'stat_change' &&
      entry.eventType === 'stat_change' &&
      prev.playerId === entry.playerId &&
      prev.field === entry.field
    ) {
      prev.entries.push(entry)
      prev.lastNewValue = entry.newValue
      continue
    }
    result.push({
      key: entry.seq,
      timestamp: entry.timestamp,
      playerId: entry.playerId,
      playerName: entry.playerName,
      eventType: entry.eventType,
      field: entry.field,
      firstOldValue: entry.oldValue,
      lastNewValue: entry.newValue,
      entries: [entry],
    })
  }
  return result
}

export function formatFieldValue(field: string | undefined, value: string | undefined): string {
  if (!value) return '?'
  switch (field) {
    case 'gender':
      return getLabel(GENDERS, value)
    case 'race':
      return getLabel(RACES, value)
    case 'class':
      return getLabel(CLASSES, value)
    default:
      return value
  }
}

/** One line describing a group, e.g. "Вася: уровень 3 → 5". */
export function describeGroup(group: ChangeLogGroup): string {
  const name = group.playerName
  switch (group.eventType) {
    case 'join':
      return `${name} присоединился`
    case 'leave':
      return `${name} вышел`
    case 'finish':
      return group.lastNewValue
        ? `🏆 Игра окончена, победитель: ${group.lastNewValue}`
        : '🏁 Игра окончена без победителя'
    case 'stat_change': {
      const fieldLabel = FIELD_LABELS[group.field ?? ''] ?? group.field
      return `${name}: ${fieldLabel} ${formatFieldValue(group.field, group.firstOldValue)} → ${formatFieldValue(group.field, group.lastNewValue)}`
    }
  }
}

/** One step inside an expanded group, e.g. "уровень 3 → 4". */
export function describeEntry(entry: ChangeLogEntry): string {
  const fieldLabel = FIELD_LABELS[entry.field ?? ''] ?? entry.field
  return `${fieldLabel} ${formatFieldValue(entry.field, entry.oldValue)} → ${formatFieldValue(entry.field, entry.newValue)}`
}
