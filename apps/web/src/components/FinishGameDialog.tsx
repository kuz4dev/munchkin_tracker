import { byLevelThenName, type Player } from '@munchkin/core'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const NO_WINNER = '__none__'

interface FinishGameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  players: Player[]
  playerId: string
  /** Preselected winner, e.g. the player who just reached the last level */
  suggestedWinnerId?: string
  onFinish: (winnerId?: string) => void
}

export function FinishGameDialog({ open, onOpenChange, players, playerId, suggestedWinnerId, onFinish }: FinishGameDialogProps) {
  const suggested = players.find((p) => p.id === suggestedWinnerId)
  const title = !suggested ? 'Завершить игру' : suggested.id === playerId ? 'Победа?' : `Победа: ${suggested.name}?`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          <DialogDescription>
            Игра завершится для всех игроков. Менять характеристики после этого будет нельзя.
          </DialogDescription>
        </DialogHeader>
        {/* Remounts on every open, so the selection starts from the suggestion */}
        <FinishForm
          players={players}
          initialWinner={suggested?.id ?? NO_WINNER}
          onCancel={() => onOpenChange(false)}
          onFinish={(winner) => {
            onFinish(winner === NO_WINNER ? undefined : winner)
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

interface FinishFormProps {
  players: Player[]
  initialWinner: string
  onCancel: () => void
  onFinish: (winner: string) => void
}

function FinishForm({ players, initialWinner, onCancel, onFinish }: FinishFormProps) {
  const [winner, setWinner] = useState(initialWinner)
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="finish-winner">Победитель</Label>
        <Select value={winner} onValueChange={setWinner}>
          <SelectTrigger id="finish-winner" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_WINNER}>Без победителя</SelectItem>
            {byLevelThenName(players).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} <span className="ml-1 text-xs text-muted-foreground">(ур. {p.level})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Продолжить игру
        </Button>
        <Button onClick={() => onFinish(winner)}>Завершить</Button>
      </div>
    </div>
  )
}
