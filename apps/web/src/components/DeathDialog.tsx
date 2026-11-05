import { MIN_LEVEL, type Player } from '@munchkin/core'
import { cn } from 'cn'
import { RadioGroup } from 'radix-ui'
import { useState } from 'react'
import { TombstoneArt } from '@/components/art'
import { CheckDot, ConfirmDialog } from '@/components/ui/sheet'

interface DeathDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  player: Player
  onConfirm: (loseLevel: boolean) => void
}

const LOSE_LEVEL = 'level'
const GEAR_ONLY = 'gear'

/** By the rules death takes only the gear; many tables play that the level goes too. */
export function DeathDialog({ open, onOpenChange, player, onConfirm }: DeathDialogProps) {
  // Lives as long as the room screen: a table plays by one rule, so the choice stays
  const [loss, setLoss] = useState(LOSE_LEVEL)
  const gear = player.gearBonus > 0 ? `Бонусы ${player.gearBonus} → 0` : ''
  const level = player.level > MIN_LEVEL ? `уровень ${player.level} → ${MIN_LEVEL}` : ''
  const both = [gear, level].filter(Boolean).join(', ')

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Погибнуть?"
      description="Что теряем? Раса и класс останутся"
      art={<TombstoneArt className="mx-auto size-28" />}
      confirmLabel="Погибнуть"
      cancelLabel="Ещё поживу"
      onConfirm={() => onConfirm(loss === LOSE_LEVEL)}
    >
      <RadioGroup.Root aria-label="Что теряем" value={loss} onValueChange={setLoss} className="mt-3.5 flex flex-col gap-2">
        <Choice value={LOSE_LEVEL} checked={loss === LOSE_LEVEL} title="Вещи и уровень" detail={both ? both[0]!.toUpperCase() + both.slice(1) : 'Терять пока нечего'} />
        <Choice value={GEAR_ONLY} checked={loss === GEAR_ONLY} title="Только вещи" detail={gear ? `${gear}, как в правилах` : 'Как в правилах, но вещей пока нет'} />
      </RadioGroup.Root>
    </ConfirmDialog>
  )
}

function Choice({ value, checked, title, detail }: { value: string; checked: boolean; title: string; detail: string }) {
  return (
    <RadioGroup.Item
      value={value}
      className={cn(
        'flex min-h-16 w-full items-center gap-3 rounded-[18px] border-2 px-3.5 py-2.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        checked ? 'border-primary bg-[#fff1e6]' : 'border-border bg-background',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold">{title}</span>
        <span className="mt-0.5 block text-[13px] text-muted-foreground">{detail}</span>
      </span>
      <CheckDot checked={checked} />
    </RadioGroup.Item>
  )
}
