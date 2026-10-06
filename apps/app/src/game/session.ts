// Native: the session token lives in the iOS Keychain / Android Keystore.
import * as SecureStore from 'expo-secure-store'
import { parseSession, SESSION_KEY, type SessionStorage } from '@munchkin/core'

export const sessionStorage: SessionStorage = {
  async load() {
    try {
      return parseSession(await SecureStore.getItemAsync(SESSION_KEY))
    } catch {
      return null
    }
  },
  async save(data) {
    try {
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(data))
    } catch {
      // A lost session only means joining again by code
    }
  },
  async clear() {
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY)
    } catch {
      // ignore
    }
  },
}
