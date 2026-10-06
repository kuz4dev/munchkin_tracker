import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { entry, player } from '@/test/fixtures'
import { ChangeLog } from './ChangeLog'
import { CombatMode } from './CombatMode'
import { FinishGameDialog } from './FinishGameDialog'
import { GameSummary } from './GameSummary'
import { PlayerCard } from './PlayerCard'
import { StatsEditor } from './StatsEditor'

describe('StatsEditor', () => {
  it('shows power and steps level/bonus within limits', async () => {
    const onChange = vi.fn()
    render(<StatsEditor player={player('p1', 'Alice', { level: 1, gearBonus: 0 })} isHost={false} onChange={onChange} />)

    expect(screen.getByLabelText('Сила 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Уровень: меньше' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Бонусы: меньше' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Уровень: больше' }))
    await userEvent.click(screen.getByRole('button', { name: 'Бонусы: больше' }))
    expect(onChange.mock.calls).toEqual([[{ level: 2 }], [{ gearBonus: 1 }]])
  })

  it('cannot go above level 10 and marks the host', () => {
    render(<StatsEditor player={player('p1', 'Alice', { level: 10 })} isHost onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Уровень: больше' })).toBeDisabled()
    expect(screen.getByText(/Ваш персонаж · хост/)).toBeInTheDocument()
  })

  it('changes race through the select', async () => {
    const onChange = vi.fn()
    render(<StatsEditor player={player('p1', 'Alice')} isHost={false} onChange={onChange} />)
    await userEvent.click(screen.getByLabelText('Раса'))
    await userEvent.click(await screen.findByRole('option', { name: 'Эльф' }))
    expect(onChange).toHaveBeenCalledWith({ race: 'elf' })
  })
})

describe('PlayerCard', () => {
  it('shows stats, traits, host and offline marks', () => {
    const { rerender } = render(<PlayerCard player={player('p2', 'Bob', { level: 5, gearBonus: 3, race: 'elf' })} />)
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('Эльф')).toBeInTheDocument()
    expect(screen.queryByText('не в сети')).not.toBeInTheDocument()
    expect(screen.queryByText(/хост/)).not.toBeInTheDocument()

    rerender(<PlayerCard player={player('p2', 'Bob', { connected: false })} isHost />)
    expect(screen.getByText('не в сети')).toBeInTheDocument()
    expect(screen.getByText(/хост/)).toBeInTheDocument()
  })
})

describe('ChangeLog', () => {
  const levelUp = (from: number, o = {}) =>
    entry({ eventType: 'stat_change', field: 'level', oldValue: String(from), newValue: String(from + 1), ...o })

  it('groups consecutive changes and expands them', async () => {
    render(<ChangeLog entries={[levelUp(1), levelUp(2)]} hasOlder={false} loadingOlder={false} onLoadOlder={async () => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Журнал/ }))

    const group = screen.getByRole('button', { name: /Alice: уровень 1 → 3/ })
    expect(group).toHaveTextContent('(2 изм.)')
    await userEvent.click(group)
    expect(screen.getByText('уровень 1 → 2')).toBeInTheDocument()
  })

  it('describes joins, finishes and empty state', async () => {
    const { rerender } = render(<ChangeLog entries={[]} hasOlder={false} loadingOlder={false} onLoadOlder={async () => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Журнал/ }))
    expect(screen.getByText('Пока нет событий')).toBeInTheDocument()

    rerender(
      <ChangeLog
        entries={[entry({ playerName: 'Bob' }), entry({ eventType: 'finish', newValue: 'Bob' })]}
        hasOlder={false}
        loadingOlder={false}
        onLoadOlder={async () => {}}
      />,
    )
    expect(screen.getByText('Bob присоединился')).toBeInTheDocument()
    expect(screen.getByText('🏆 Игра окончена, победитель: Bob')).toBeInTheDocument()
  })

  it('loads earlier history and offers a retry on failure', async () => {
    const onLoadOlder = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    render(<ChangeLog entries={[levelUp(3)]} hasOlder loadingOlder={false} onLoadOlder={onLoadOlder} />)
    await userEvent.click(screen.getByRole('button', { name: /Журнал/ }))

    await userEvent.click(screen.getByRole('button', { name: 'Показать более ранние' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Не удалось загрузить, повторить' }))
    expect(onLoadOlder).toHaveBeenCalledTimes(2)
    expect(await screen.findByRole('button', { name: 'Показать более ранние' })).toBeInTheDocument()
  })
})

describe('CombatMode', () => {
  it('computes the fight with an ally and cards', async () => {
    const players = [player('p1', 'Alice', { level: 5, gearBonus: 3 }), player('p2', 'Bob', { level: 2 })]
    render(<CombatMode players={players} />)

    await userEvent.click(screen.getByLabelText('Игрок'))
    await userEvent.click(await screen.findByRole('option', { name: /Alice/ }))
    await userEvent.type(screen.getByLabelText('Сила противника'), '10')
    expect(screen.getByRole('status')).toHaveTextContent('Поражение')

    await userEvent.click(screen.getByLabelText(/Союзник/))
    await userEvent.click(await screen.findByRole('option', { name: /Bob/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Ничья') // 8 + 2 = 10

    await userEvent.click(screen.getByRole('button', { name: 'Alice + Bob: карта +1' }))
    expect(screen.getByRole('status')).toHaveTextContent('Победа')
    expect(screen.getByRole('status')).toHaveTextContent('+1')
  })
})

describe('FinishGameDialog', () => {
  const players = [player('p1', 'Alice', { level: 9 }), player('p2', 'Bob', { level: 10 })]

  it('suggests the champion and finishes with them', async () => {
    const onFinish = vi.fn()
    render(<FinishGameDialog open onOpenChange={() => {}} players={players} playerId="p1" suggestedWinnerId="p2" onFinish={onFinish} />)

    expect(screen.getByRole('heading', { name: 'Победа: Bob? 🏆' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Завершить' }))
    expect(onFinish).toHaveBeenCalledWith('p2')
  })

  it('finishes without a winner by default', async () => {
    const onFinish = vi.fn()
    render(<FinishGameDialog open onOpenChange={() => {}} players={players} playerId="p1" onFinish={onFinish} />)

    expect(screen.getByRole('heading', { name: 'Завершить игру' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Завершить' }))
    expect(onFinish).toHaveBeenCalledWith(undefined)
  })
})

describe('GameSummary', () => {
  it('ranks the winner first and shows duration', async () => {
    const onLeave = vi.fn()
    render(
      <GameSummary
        players={[player('a', 'Алиса', { level: 9 }), player('b', 'Боб', { level: 10 }), player('c', 'Вася', { level: 5 })]}
        playerId="b"
        winnerId="a"
        createdAt={1000}
        finishedAt={1000 + 85 * 60_000}
        onLeave={onLeave}
      />,
    )
    expect(screen.getByText(/Победитель:/)).toHaveTextContent('Победитель: Алиса')
    expect(screen.getByText('Длительность: 1 ч 25 мин')).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]!).getByText('Алиса')).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent('Боб (вы)')
    await userEvent.click(screen.getByRole('button', { name: 'В главное меню' }))
    expect(onLeave).toHaveBeenCalled()
  })

  it('handles a game without a winner', () => {
    render(<GameSummary players={[player('b', 'Боб')]} playerId="b" winnerId="" createdAt={0} finishedAt={0} onLeave={() => {}} />)
    expect(screen.getByText('Без победителя')).toBeInTheDocument()
  })
})
