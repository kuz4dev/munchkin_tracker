import { Check, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { shareInvite, type ShareResult } from '@/lib/share'

const messages: Partial<Record<ShareResult, string>> = {
  copied: 'Ссылка скопирована — отправьте её друзьям',
  failed: 'Не удалось скопировать — продиктуйте код',
}

/** Invites players: system share sheet on phones, copied link elsewhere. */
export function InviteButton({ code }: { code: string }) {
  const [result, setResult] = useState<ShareResult | null>(null)

  useEffect(() => {
    if (!result) return
    const t = setTimeout(() => setResult(null), 3000)
    return () => clearTimeout(t)
  }, [result])

  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      <Button
        variant="secondary"
        className="h-11 px-4 font-mono text-base font-bold tracking-wider"
        onClick={async () => setResult(await shareInvite(code))}
        aria-label={`Пригласить игроков в комнату ${code}`}
      >
        {code}
        {result === 'copied' ? <Check className="text-game-green" aria-hidden="true" /> : <Share2 aria-hidden="true" />}
      </Button>
      {result && messages[result] && (
        <p role="status" className="text-xs text-muted-foreground">
          {messages[result]}
        </p>
      )}
    </div>
  )
}
