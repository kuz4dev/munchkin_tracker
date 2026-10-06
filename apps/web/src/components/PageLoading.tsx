export function PageLoading({ text = 'Загрузка...' }: { text?: string }) {
  return (
    <div role="status" className="flex min-h-dvh flex-col items-center justify-center bg-background text-center">
      <div className="mb-4 size-8 animate-spin rounded-full border-3 border-primary border-t-transparent" aria-hidden="true" />
      <p className="text-base font-medium text-muted-foreground">{text}</p>
    </div>
  )
}
