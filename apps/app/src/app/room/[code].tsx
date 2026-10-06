import { power, selectConnected, selectCurrentPlayer, selectOtherPlayers } from '@munchkin/core'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, Card } from '@/components/ui'
import { gameActions, gameStore, useGame, useGameShallow } from '@/game/store'

// Step 2 skeleton: proves routing, store and server work end to end.
// The full room UI comes in step 3.
export default function RoomScreen() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const roomCode = useGame((s) => s.roomCode)
  const connected = useGame(selectConnected)
  const me = useGame(selectCurrentPlayer)
  const others = useGameShallow(selectOtherPlayers)
  // Opened directly (app restart, shared link): resume our seat or go home
  const [resuming, setResuming] = useState(() => !gameStore.getState().roomCode)
  useEffect(() => {
    if (gameStore.getState().roomCode) return
    gameActions()
      .resumeSession(code)
      .then((result) => {
        if (result !== 'resumed') router.replace({ pathname: '/', params: { code } })
      })
      .finally(() => setResuming(false))
  }, [code])

  // The room was closed under us (not found, replaced by another device)
  useEffect(() => {
    if (!roomCode && !resuming && gameStore.getState().notice) router.replace('/')
  }, [roomCode, resuming])

  function leave() {
    gameActions().leaveRoom()
    router.replace('/')
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b-2 border-border px-4 py-3">
        <Text className="font-mono text-lg font-bold tracking-widest text-foreground">{code}</Text>
        <View className="flex-row items-center gap-3">
          <View className={`h-2 w-2 rounded-full ${connected ? 'bg-game-green' : 'bg-destructive'}`} />
          <Button title="Выйти" variant="ghost" size="sm" onPress={leave} />
        </View>
      </View>

      {!me ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator color="#a8372a" />
          <Text className="text-muted-foreground">{resuming ? 'Переподключение...' : 'Подключение...'}</Text>
        </View>
      ) : (
        <ScrollView contentContainerClassName="gap-4 p-4">
          <Card className="p-4">
            <Text className="text-sm text-muted-foreground">Ваш персонаж</Text>
            <Text className="text-xl font-bold text-foreground">{me.name}</Text>
            <Text className="mt-1 text-foreground">
              Уровень {me.level} · сила {power(me)}
            </Text>
          </Card>
          {others.map((p) => (
            <Card key={p.id} className={`p-4 ${p.connected ? '' : 'opacity-60'}`}>
              <Text className="font-bold text-foreground">{p.name}</Text>
              <Text className="text-muted-foreground">
                Уровень {p.level} · сила {power(p)}
                {p.connected ? '' : ' · не в сети'}
              </Text>
            </Card>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}
