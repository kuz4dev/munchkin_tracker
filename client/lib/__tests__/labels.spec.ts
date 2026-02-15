import { describe, it, expect } from 'vitest'
import { getLabel } from '../labels'

describe('getLabel', () => {
  const list = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ] as const

  it('returns the label for a matching value', () => {
    expect(getLabel(list, 'a')).toBe('Alpha')
    expect(getLabel(list, 'b')).toBe('Beta')
  })

  it('returns the raw value when no match is found', () => {
    expect(getLabel(list, 'c')).toBe('c')
  })

  it('returns the raw value for an empty list', () => {
    expect(getLabel([], 'x')).toBe('x')
  })
})
