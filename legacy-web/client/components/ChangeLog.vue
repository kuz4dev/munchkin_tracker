<script setup lang="ts">
import { ref, computed, nextTick, watch, reactive } from 'vue'
import { useRoomStore } from '@/stores/room'
import { RACES, CLASSES, GENDERS, FIELD_LABELS } from '@/constants'
import { getLabel } from '@/lib/labels'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { ChangeLogEntry } from '@/types'

interface ChangeLogGroup {
  /** First entry's timestamp (used for display) */
  timestamp: number
  /** Player who made the changes */
  playerId: string
  playerName: string
  /** For stat_change groups: the field that changed */
  field?: string
  /** For stat_change groups: first entry's oldValue */
  firstOldValue?: string
  /** For stat_change groups: last entry's newValue */
  lastNewValue?: string
  /** Event type: only stat_change entries are grouped */
  eventType: ChangeLogEntry['eventType']
  /** All individual entries in this group */
  entries: ChangeLogEntry[]
}

const roomStore = useRoomStore()
const isOpen = ref(false)
const scrollContainer = ref<HTMLElement | null>(null)
const expandedGroups = reactive(new Set<number>())

/**
 * Groups consecutive stat_change entries that share the same playerName + field.
 * Join/leave events are never grouped (always standalone).
 */
const groups = computed<ChangeLogGroup[]>(() => {
  const result: ChangeLogGroup[] = []
  const entries = roomStore.changelog

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const prev = result[result.length - 1]

    // Try to merge into previous group if:
    // - both are stat_change
    // - same player + same field
    if (
      prev
      && prev.eventType === 'stat_change'
      && entry.eventType === 'stat_change'
      && prev.playerId === entry.playerId
      && prev.field === entry.field
    ) {
      prev.entries.push(entry)
      prev.lastNewValue = entry.newValue
      continue
    }

    // Start a new group
    result.push({
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
})

// Auto-scroll to bottom when a new event arrives and panel is open
// (not when older history is prepended)
watch(() => roomStore.changelog[roomStore.changelog.length - 1]?.seq, async () => {
  if (isOpen.value && scrollContainer.value) {
    await nextTick()
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
  }
})

const loadError = ref(false)

async function loadOlder() {
  const el = scrollContainer.value
  const heightBefore = el?.scrollHeight ?? 0
  loadError.value = false
  try {
    await roomStore.loadOlder()
  } catch {
    loadError.value = true
    return
  }
  // Keep the entries the user was looking at in place
  await nextTick()
  if (el) el.scrollTop += el.scrollHeight - heightBefore
}

/** Groups are identified by their first event's seq, which survives prepending history */
function groupKey(group: ChangeLogGroup): number {
  return group.entries[0]!.seq
}

function toggleGroup(group: ChangeLogGroup) {
  const key = groupKey(group)
  if (expandedGroups.has(key)) {
    expandedGroups.delete(key)
  } else {
    expandedGroups.add(key)
  }
}

function formatGroupSummary(group: ChangeLogGroup): string {
  const name = group.playerName

  if (group.eventType === 'join') {
    return `${name} присоединился`
  }
  if (group.eventType === 'leave') {
    return `${name} вышел`
  }
  if (group.eventType === 'finish') {
    const winner = group.lastNewValue
    return winner ? `🏆 Игра окончена, победитель: ${winner}` : '🏁 Игра окончена без победителя'
  }

  // stat_change
  const fieldLabel = FIELD_LABELS[group.field ?? ''] ?? group.field
  const oldVal = formatValue(group.field, group.firstOldValue)
  const newVal = formatValue(group.field, group.lastNewValue)

  return `${name}: ${fieldLabel} ${oldVal} → ${newVal}`
}

function formatEntry(entry: ChangeLogEntry): string {
  const fieldLabel = FIELD_LABELS[entry.field ?? ''] ?? entry.field
  const oldVal = formatValue(entry.field, entry.oldValue)
  const newVal = formatValue(entry.field, entry.newValue)

  return `${fieldLabel} ${oldVal} → ${newVal}`
}

function formatValue(field: string | undefined, value: string | undefined): string {
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

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Total number of raw entries across all groups */
const totalEntries = computed(() => roomStore.changelog.length)
</script>

<template>
  <Card class="overflow-hidden py-0">
    <Collapsible v-model:open="isOpen">
      <CollapsibleTrigger as-child>
        <Button
          variant="ghost"
          class="w-full flex items-center justify-between px-4 py-3 h-auto"
        >
          <div class="flex items-center gap-2">
            <span class="text-base font-bold">Журнал</span>
            <span
              v-if="totalEntries > 0"
              class="text-xs text-muted-foreground bg-secondary rounded-full px-2 py-0.5"
            >
              {{ totalEntries }}
            </span>
          </div>
          <svg
            class="w-4 h-4 text-muted-foreground transition-transform duration-200"
            :class="{ 'rotate-180': isOpen }"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div
          v-if="groups.length === 0"
          class="px-4 py-6 text-center text-sm text-muted-foreground"
        >
          Пока нет событий
        </div>
        <div
          v-else
          ref="scrollContainer"
          class="max-h-60 overflow-y-auto px-4 pb-3 space-y-0.5"
        >
          <div v-if="roomStore.hasOlder" class="text-center py-1">
            <button
              class="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline cursor-pointer disabled:opacity-50"
              :disabled="roomStore.loadingOlder"
              @click="loadOlder"
            >
              {{ roomStore.loadingOlder ? 'Загрузка…' : loadError ? 'Не удалось загрузить, повторить' : 'Показать более ранние' }}
            </button>
          </div>
          <div
            v-for="group in groups"
            :key="groupKey(group)"
          >
            <!-- Group summary row -->
            <div class="flex items-start gap-2 py-1 text-sm">
              <span class="text-xs text-muted-foreground font-mono shrink-0 mt-0.5">
                {{ formatTime(group.timestamp) }}
              </span>

              <!-- Expandable group (multi-entry stat_change) -->
              <button
                v-if="group.entries.length > 1"
                class="flex items-center gap-1.5 text-left text-foreground hover:text-primary transition-colors cursor-pointer"
                @click="toggleGroup(group)"
              >
                <svg
                  class="w-3 h-3 shrink-0 text-muted-foreground transition-transform duration-150"
                  :class="{ 'rotate-90': expandedGroups.has(groupKey(group)) }"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="9 6 15 12 9 18" />
                </svg>
                <span>{{ formatGroupSummary(group) }}</span>
                <span class="text-xs text-muted-foreground">
                  ({{ group.entries.length }} изм.)
                </span>
              </button>

              <!-- Single entry (no expand) -->
              <span v-else class="text-foreground">
                {{ formatGroupSummary(group) }}
              </span>
            </div>

            <!-- Expanded entries inside group -->
            <div
              v-if="group.entries.length > 1 && expandedGroups.has(groupKey(group))"
              class="ml-[4.5rem] pl-3 border-l-2 border-secondary space-y-0.5 pb-1"
            >
              <div
                v-for="(entry, ei) in group.entries"
                :key="ei"
                class="flex items-start gap-2 py-0.5 text-xs text-muted-foreground"
              >
                <span class="font-mono shrink-0">
                  {{ formatTime(entry.timestamp) }}
                </span>
                <span>{{ formatEntry(entry) }}</span>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  </Card>
</template>
