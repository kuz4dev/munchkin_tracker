import { MAX_NAME_LENGTH, ROOM_CODE_LENGTH } from '@munchkin/core'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, Card, Input } from '@/components/ui'
import { describeJoinError } from '@/game/errors'
import { gameActions, useGame } from '@/game/store'

export default function HomeScreen() {
  // Shared links (/room/CODE) land here with ?code=CODE prefilled
  const params = useLocalSearchParams<{ code?: string }>()
  const notice = useGame((s) => s.notice)

  const [name, setName] = useState('')
  const [code, setCode] = useState(typeof params.code === 'string' ? params.code.toUpperCase() : '')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [error, setError] = useState('')

  // A notice explains why we were sent back here (room closed, etc.)
  const shownError = error || notice
  useEffect(() => () => gameActions().clearNotice(), [])

  async function create() {
    gameActions().clearNotice()
    if (!name.trim()) return setError('Введите ваше имя')
    setBusy('create')
    setError('')
    try {
      const roomCode = await gameActions().createRoom(name.trim())
      router.push(`/room/${roomCode}`)
    } catch (e) {
      setError(describeJoinError(e, 'Не удалось создать комнату'))
    } finally {
      setBusy(null)
    }
  }

  async function join() {
    gameActions().clearNotice()
    if (!name.trim()) return setError('Введите ваше имя')
    if (!code.trim()) return setError('Введите код комнаты')
    setBusy('join')
    setError('')
    try {
      await gameActions().joinRoom(code, name.trim())
      router.push(`/room/${code.trim().toUpperCase()}`)
    } catch (e) {
      setError(describeJoinError(e, 'Не удалось войти в комнату'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow items-center justify-center px-4 py-8" keyboardShouldPersistTaps="handled">
          <View className="mb-6 items-center">
            <Text className="mb-3 text-5xl">🗡️</Text>
            <Text className="text-3xl font-extrabold text-foreground">Манчкин</Text>
            <Text className="mt-1 text-base text-muted-foreground">Трекер</Text>
          </View>

          <Card className="w-full max-w-md shadow-lg">
            <View className="gap-5 p-5">
              <Text className="text-center text-sm text-muted-foreground">
                Отслеживайте характеристики игроков в реальном времени
              </Text>

              <View className="gap-2">
                <Text className="text-sm font-medium text-foreground">Ваше имя</Text>
                <Input
                  value={name}
                  onChangeText={setName}
                  placeholder="Введите имя игрока"
                  maxLength={MAX_NAME_LENGTH}
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={() => (code ? join() : create())}
                  accessibilityLabel="Ваше имя"
                />
              </View>

              {!!shownError && (
                <View className="rounded-lg bg-destructive/10 px-3 py-2">
                  <Text className="text-center text-sm font-medium text-destructive">{shownError}</Text>
                </View>
              )}

              <Button title={busy === 'create' ? 'Создаём...' : 'Создать комнату'} loading={busy === 'create'} disabled={!!busy} onPress={create} />

              <View className="flex-row items-center gap-4">
                <View className="h-px flex-1 bg-border" />
                <Text className="text-sm text-muted-foreground">или войдите</Text>
                <View className="h-px flex-1 bg-border" />
              </View>

              <View className="gap-2">
                <Text className="text-sm font-medium text-foreground">Код комнаты</Text>
                <View className="flex-row gap-2">
                  <Input
                    value={code}
                    onChangeText={(t) => setCode(t.toUpperCase())}
                    placeholder="ABC123"
                    maxLength={ROOM_CODE_LENGTH}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={join}
                    className="flex-1 font-mono tracking-widest"
                    accessibilityLabel="Код комнаты"
                  />
                  <Button title="Войти" variant="outline" loading={busy === 'join'} disabled={!!busy} onPress={join} />
                </View>
              </View>
            </View>
          </Card>

          <Text className="mt-6 max-w-xs text-center text-xs text-muted-foreground">
            Создайте комнату и поделитесь кодом с другими игроками
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
