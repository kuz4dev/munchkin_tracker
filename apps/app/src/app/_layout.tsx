import '../../global.css'

import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { connection } from '@/game/store'

export default function RootLayout() {
  // Phones drop sockets in the background: reconnect right away on return
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') connection.reconnectNow()
    })
    return () => sub.remove()
  }, [])

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#f8f5ef' } }} />
    </SafeAreaProvider>
  )
}
