import Constants from 'expo-constants'
import { Platform } from 'react-native'

const DEV_SERVER_PORT = 8080

/**
 * Where the game server lives:
 * - EXPO_PUBLIC_API_URL if set (required for production builds);
 * - in development, port 8080 on the machine running `expo start`, which a
 *   phone in Expo Go reaches over the local network.
 */
export function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL
  if (configured) return configured

  if (__DEV__) {
    const devHost = Constants.expoConfig?.hostUri?.split(':')[0]
    if (devHost) return `http://${devHost}:${DEV_SERVER_PORT}`
    if (Platform.OS === 'web') return `http://${window.location.hostname}:${DEV_SERVER_PORT}`
  }
  if (Platform.OS === 'web') return window.location.origin
  throw new Error('EXPO_PUBLIC_API_URL must be set for production builds')
}
