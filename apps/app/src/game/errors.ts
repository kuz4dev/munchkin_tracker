import { ApiError } from '@munchkin/core'

/** User-facing text for a failed create/join request. */
export function describeJoinError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.notFound) return 'Комната не найдена'
    if (e.rateLimited) return 'Слишком много попыток, подождите минуту'
    if (e.status === 0) return 'Сервер недоступен, проверьте интернет'
  }
  return fallback
}
