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
        className="h-12 rounded-full bg-cocoa px-5 font-display text-base font-semibold tracking-[3px] text-primary-foreground hover:bg-cocoa/90"
        onClick={async () => setResult(await shareInvite(code))}
        aria-label={`Пригласить игроков в комнату ${code}`}
      >
        {code}
        {result === 'copied' ? <Check className="text-mustard" aria-hidden="true" /> : <Share2 className="text-mustard" aria-hidden="true" />}
      </Button>
      {result && messages[result] && (
        <p role="status" className="text-[13px] font-semibold text-muted-foreground">
          {messages[result]}
        </p>
      )}
    </div>
  )
}
