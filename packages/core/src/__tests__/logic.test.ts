import { describe, expect, it } from 'vitest'
import { describeEntry, describeGroup, groupChangelog } from '../changelog'
import { formatBonus, resolveCombat } from '../combat'
import { formatDuration, formatTime } from '../format'
import { clampGearBonus, clampLevel, getLabel, normalizeRoomCode, RACES } from '../game'
import type { ChangeLogEntry } from '../protocol'
import { byLevelThenName, rankPlayers } from '../standings'
import { player } from './fakes'

let seq = 0
const e = (o: Partial<ChangeLogEntry>): ChangeLogEntry => ({
  seq: ++seq, timestamp: seq, playerId: 'p1', playerName: 'Igor', eventType: 'stat_change', ...o,
})
const level = (from: number, o: Partial<ChangeLogEntry> = {}) =>
  e({ field: 'level', oldValue: String(from), newValue: String(from + 1), ...o })

describe('changelog grouping', () => {
  it('groups consecutive changes of one player and field', () => {
    const groups = groupChangelog([level(1), level(2), level(3)])
    expect(groups).toHaveLength(1)
    expect(describeGroup(groups[0]!)).toBe('Igor: уровень 1 → 4')
    expect(groups[0]!.entries.map(describeEntry)).toEqual(['уровень 1 → 2', 'уровень 2 → 3', 'уровень 3 → 4'])
  })

  it('keys groups by their first seq', () => {
    const first = level(1)
    expect(groupChangelog([first, level(2)])[0]!.key).toBe(first.seq)
  })

  it('splits by player ID (even with the same name), field and interruptions', () => {
    expect(groupChangelog([level(1), level(2, { playerId: 'p2' })])).toHaveLength(2)
    expect(groupChangelog([level(1), e({ field: 'gearBonus', oldValue: '0', newValue: '1' })])).toHaveLength(2)
    expect(groupChangelog([level(1), e({ eventType: 'join' }), level(2)])).toHaveLength(3)
    expect(groupChangelog([e({ eventType: 'join' }), e({ eventType: 'join' })])).toHaveLength(2)
  })

  it('describes every event type in Russian', () => {
    const [join, leave, race, win, noWin] = groupChangelog([
      e({ eventType: 'join', playerName: 'Bob' }),
      e({ eventType: 'leave', playerName: 'Bob' }),
      e({ field: 'race', oldValue: 'human', newValue: 'elf' }),
      e({ eventType: 'finish', newValue: 'Bob' }),
      e({ eventType: 'finish', newValue: '' }),
    ])
    expect(describeGroup(join!)).toBe('Bob присоединился')
    expect(describeGroup(leave!)).toBe('Bob вышел')
    expect(describeGroup(race!)).toBe('Igor: раса Человек → Эльф')
    expect(describeGroup(win!)).toBe('Игра окончена, победитель: Bob')
    expect(describeGroup(noWin!)).toBe('Игра окончена без победителя')
  })
})

describe('combat', () => {
  it('player wins only when strictly stronger', () => {
    const p = { level: 5, gearBonus: 3 }
    expect(resolveCombat({ player: p, monsterPower: 7 })).toMatchObject({ result: 'win', margin: 1, playerTotal: 8 })
    expect(resolveCombat({ player: p, monsterPower: 8 }).result).toBe('draw')
    expect(resolveCombat({ player: p, monsterPower: 9 }).result).toBe('lose')
  })

  it('adds the ally and card bonuses', () => {
    const r = resolveCombat({
      player: { level: 3, gearBonus: 2 },
      ally: { level: 4, gearBonus: 1 },
      playerCardBonus: 3,
      monsterPower: 12,
      monsterCardBonus: 5,
    })
    expect(r).toMatchObject({ playerBase: 10, playerTotal: 13, monsterTotal: 17, result: 'lose', margin: 4 })
  })

  it('formats bonuses', () => {
    expect([formatBonus(2), formatBonus(-1), formatBonus(0)]).toEqual(['+2', '-1', '0'])
  })
})

describe('standings', () => {
  it('puts the winner first, then by level and power', () => {
    const ranked = rankPlayers(
      [player('a', 'A', { level: 9 }), player('b', 'B', { level: 10 }), player('c', 'C', { level: 9, gearBonus: 5 })],
      'a',
    )
    expect(ranked.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(byLevelThenName([player('x', 'Яна', { level: 2 }), player('y', 'Аня', { level: 2 })]).map((p) => p.name)).toEqual(['Аня', 'Яна'])
  })
})

describe('game helpers', () => {
  it('clamps stats to server limits', () => {
    expect([clampLevel(0), clampLevel(11), clampLevel(5)]).toEqual([1, 10, 5])
    expect([clampGearBonus(-1), clampGearBonus(1000)]).toEqual([0, 999])
  })

  it('normalizes codes and labels', () => {
    expect(normalizeRoomCode('  abc234 ')).toBe('ABC234')
    expect(getLabel(RACES, 'elf')).toBe('Эльф')
    expect(getLabel(RACES, 'unknown')).toBe('unknown')
  })

  it('formats durations and times', () => {
    expect([formatDuration(0), formatDuration(12 * 60_000), formatDuration(60 * 60_000), formatDuration(85 * 60_000)])
      .toEqual(['меньше минуты', '12 мин', '1 ч', '1 ч 25 мин'])
    expect(formatDuration(-5000)).toBe('меньше минуты')
    expect(formatTime(new Date(2026, 0, 1, 9, 5).getTime())).toBe('09:05')
  })
})
