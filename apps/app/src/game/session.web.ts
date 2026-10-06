// Web: localStorage (wrapped so private mode or blocked storage isn't fatal).
import { createKeyValueSessionStorage, createMemorySessionStorage, type SessionStorage } from '@munchkin/core'

function available(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

const storage = available()

export const sessionStorage: SessionStorage = storage
  ? createKeyValueSessionStorage(storage)
  : createMemorySessionStorage()
