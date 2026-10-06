import { describe, it, expect } from 'vitest'
import { formatDuration } from '../format'

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(0)).toBe('0 мин')
    expect(formatDuration(12 * 60_000)).toBe('12 мин')
    expect(formatDuration(60 * 60_000)).toBe('1 ч')
    expect(formatDuration(85 * 60_000)).toBe('1 ч 25 мин')
  })

  it('never goes negative', () => {
    expect(formatDuration(-5000)).toBe('0 мин')
  })
})
