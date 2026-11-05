import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { entry, player } from '@/test/fixtures'
import { ChangeLog } from './ChangeLog'
import { gameStore } from '@/game/store'
import { CombatMode } from './CombatMode'
import { DeathDialog } from './DeathDialog'
import { EndLevelControl } from './EndLevelControl'
import { FinishGameDialog } from './FinishGameDialog'
import { FleeActions, MIN_ROLL_MS } from './FleeActions'
import { GameSummary } from './GameSummary'
import { PlayerCard } from './PlayerCard'
import { ServerWakeHint, WAKE_HINT_DELAY } from './ServerWakeHint'
import { StatsEditor } from './StatsEditor'
import { TableEventToast } from './TableEventToast'

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

  it('changes race through the sheet and closes it', async () => {
    const onChange = vi.fn()
    render(<StatsEditor player={player('p1', 'Alice')} isHost={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Раса: Человек' }))
    const sheet = await screen.findByRole('dialog', { name: 'Раса' })
    expect(within(sheet).getByRole('radio', { name: 'Человек' })).toBeChecked()
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Эльф' }))
    expect(onChange).toHaveBeenCalledWith({ race: 'elf', race2: '', halfBreed: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('puts "no class" first and does not resend the current value', async () => {
    const onChange = vi.fn()
    render(<StatsEditor player={player('p1', 'Alice')} isHost={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Класс: Без класса' }))
    const options = within(await screen.findByRole('dialog', { name: 'Класс' })).getAllByRole('radio')
    expect(options[0]).toHaveAccessibleName('Без класса')
    await userEvent.click(options[0]!)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('PlayerCard', () => {
  it('shows stats, traits, host and offline marks', () => {
    const { rerender } = render(<PlayerCard player={player('p2', 'Bob', { level: 5, gearBonus: 3, race: 'elf' })} />)
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText(/Эльф · Без класса · ур\. 5 · бонусы 3/)).toBeInTheDocument()
    expect(screen.queryByText(/не в сети/)).not.toBeInTheDocument()
    expect(screen.queryByText(/хост/)).not.toBeInTheDocument()

    rerender(<PlayerCard player={player('p2', 'Bob', { connected: false })} isHost />)
    expect(screen.getByText(/не в сети/)).toBeInTheDocument()
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
    expect(screen.getByText('Игра окончена, победитель: Bob')).toBeInTheDocument()
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

    await userEvent.click(screen.getByRole('radio', { name: 'Alice, уровень 5, сила 8' }))
    await userEvent.type(screen.getByLabelText('Сила противника'), '10')
    expect(screen.getByRole('status')).toHaveTextContent('Поражение')

    const allies = screen.getByRole('group', { name: /Союзники/ })
    expect(within(allies).getByRole('button', { name: 'Без союзников' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(allies).getByRole('checkbox', { name: 'Bob, уровень 2, сила 2' }))
    expect(screen.getByRole('status')).toHaveTextContent('Ничья') // 8 + 2 = 10

    await userEvent.click(screen.getByRole('button', { name: 'Alice + Bob: карта +1' }))
    expect(screen.getByRole('status')).toHaveTextContent('Победа')
    expect(screen.getByRole('status')).toHaveTextContent('+1')
  })

  it('starts with the current player and steps the monster power', async () => {
    render(<CombatMode players={[player('p1', 'Alice', { level: 3 })]} defaultPlayerId="p1" />)
    expect(screen.getByRole('radio', { name: 'Alice, уровень 3, сила 3' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Сила противника: меньше' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Сила противника: больше' }))
    await userEvent.click(screen.getByRole('button', { name: 'Сила противника: больше' }))
    expect(screen.getByLabelText('Сила противника')).toHaveValue(2)
    expect(screen.getByRole('status')).toHaveTextContent('Победа')
  })
})

describe('CombatMode, several allies', () => {
  it('adds them all up, and one click on "no allies" clears them', async () => {
    const players = [player('p1', 'Alice', { level: 5 }), player('p2', 'Bob', { level: 2 }), player('p3', 'Vasya', { level: 3, gearBonus: 1 })]
    render(<CombatMode players={players} defaultPlayerId="p1" />)
    await userEvent.type(screen.getByLabelText('Сила противника'), '10')
    expect(screen.getByRole('status')).toHaveTextContent('Поражение') // 5 vs 10

    const allies = screen.getByRole('group', { name: /Союзники/ })
    await userEvent.click(within(allies).getByRole('checkbox', { name: /Bob/ }))
    await userEvent.click(within(allies).getByRole('checkbox', { name: /Vasya/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Победа') // 5 + 2 + 4 = 11
    expect(screen.getByRole('button', { name: 'Alice + Bob + Vasya: карта +1' })).toBeInTheDocument()

    await userEvent.click(within(allies).getByRole('checkbox', { name: /Bob/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Поражение') // 5 + 4 = 9

    await userEvent.click(within(allies).getByRole('button', { name: 'Без союзников' }))
    expect(screen.getByRole('button', { name: 'Alice: карта +1' })).toBeInTheDocument()
  })

  it('a player who becomes the fighter stops being their own ally', async () => {
    const players = [player('p1', 'Alice'), player('p2', 'Bob')]
    render(<CombatMode players={players} defaultPlayerId="p1" />)
    await userEvent.click(within(screen.getByRole('group', { name: /Союзники/ })).getByRole('checkbox', { name: /Bob/ }))
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Кто сражается' })).getByRole('radio', { name: /Bob/ }))
    expect(within(screen.getByRole('group', { name: /Союзники/ })).getByRole('checkbox', { name: /Alice/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Без союзников' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('EndLevelControl', () => {
  const players = [player('p1', 'Alice', { level: 12 }), player('p2', 'Bob')]

  it('lets the host change it, not below the highest level', async () => {
    const onChange = vi.fn()
    render(<EndLevelControl endLevel={12} players={players} connected onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Игра до 12 уровня, изменить' }))

    expect(screen.getByRole('button', { name: 'Меньше' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '10' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Больше' }))
    await userEvent.click(screen.getByRole('button', { name: '20' }))
    await userEvent.click(screen.getByRole('button', { name: 'Больше' }))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onChange).toHaveBeenCalledWith(21)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('StatsEditor, end level and expansions', () => {
  it('respects the game\'s end level', async () => {
    const onChange = vi.fn()
    render(<StatsEditor player={player('p1', 'Alice', { level: 10 })} isHost={false} endLevel={20} onChange={onChange} />)
    expect(screen.getByText('До победы 10 уровней')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Уровень: больше' }))
    expect(onChange).toHaveBeenCalledWith({ level: 11 })
  })

  it('offers races and classes from the expansions', async () => {
    const onChange = vi.fn()
    render(<StatsEditor player={player('p1', 'Alice')} isHost={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Раса: Человек' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Раса' })).getByRole('radio', { name: 'Орк' }))
    expect(onChange).toHaveBeenCalledWith({ race: 'orc', race2: '', halfBreed: false })
    await userEvent.click(screen.getByRole('button', { name: 'Класс: Без класса' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Класс' })).getByRole('radio', { name: 'Рейнджер' }))
    expect(onChange).toHaveBeenCalledWith({ class: 'ranger', class2: '', superMunchkin: false })
  })
})

describe('StatsEditor, Half-Breed and Super Munchkin', () => {
  it('saves two races only on Done, and shows them', async () => {
    const onChange = vi.fn()
    const me = player('p1', 'Alice', { race: 'elf' })
    const { rerender } = render(<StatsEditor player={me} isHost={false} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Раса: Эльф' }))
    await userEvent.click(await screen.findByRole('switch', { name: 'Полукровка' }))
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Орк' }))
    expect(screen.getByRole('checkbox', { name: 'Гном' })).toBeDisabled()
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Готово' }))
    expect(onChange).toHaveBeenCalledWith({ race: 'elf', race2: 'orc', halfBreed: true })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(<StatsEditor player={{ ...me, race2: 'orc', halfBreed: true }} isHost={false} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Раса: Эльф + Орк' })).toBeInTheDocument()
    expect(screen.getByText('Эльф + Орк · Без класса')).toBeInTheDocument()
    expect(screen.getByText('Полукровка')).toBeInTheDocument()
  })

  it('closing without Done changes nothing', async () => {
    const onChange = vi.fn()
    render(<StatsEditor player={player('p1', 'Alice')} isHost={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Раса: Человек' }))
    await userEvent.click(await screen.findByRole('switch', { name: 'Полукровка' }))
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('the card works with one race, and turning it off keeps the first race at once', async () => {
    const onChange = vi.fn()
    const me = player('p1', 'Alice', { race: 'elf', race2: 'orc', halfBreed: true })
    render(<StatsEditor player={me} isHost={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Раса: Эльф + Орк' }))
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Орк' }))
    await userEvent.click(screen.getByRole('button', { name: 'Готово' }))
    expect(onChange).toHaveBeenLastCalledWith({ race: 'elf', race2: '', halfBreed: true })

    await userEvent.click(screen.getByRole('button', { name: 'Раса: Эльф + Орк' }))
    await userEvent.click(await screen.findByRole('switch', { name: 'Полукровка' }))
    expect(onChange).toHaveBeenLastCalledWith({ race: 'elf', race2: '', halfBreed: false })
  })

  it('"no class" can\'t be combined: it replaces the classes and gives way to a real one', async () => {
    const onChange = vi.fn()
    render(<StatsEditor player={player('p1', 'Alice', { class: 'wizard', class2: 'bard', superMunchkin: true })} isHost={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Класс: Волшебник + Бард' }))
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Без класса' }))
    expect(screen.getByRole('checkbox', { name: 'Волшебник' })).not.toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Воин' }))
    expect(screen.getByRole('checkbox', { name: 'Без класса' })).not.toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Готово' }))
    expect(onChange).toHaveBeenCalledWith({ class: 'warrior', class2: '', superMunchkin: true })
  })
})

describe('FinishGameDialog', () => {
  const players = [player('p1', 'Alice', { level: 9 }), player('p2', 'Bob', { level: 10 })]

  it('suggests the champion and finishes with them', async () => {
    const onFinish = vi.fn()
    render(<FinishGameDialog open onOpenChange={() => {}} players={players} playerId="p1" suggestedWinnerId="p2" onFinish={onFinish} />)

    expect(screen.getByRole('heading', { name: 'Победа: Bob?' })).toBeInTheDocument()
    expect(screen.getByText('10 уровень достигнут')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Bob/ })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Завершить игру' }))
    expect(onFinish).toHaveBeenCalledWith('p2')
  })

  it('finishes without a winner by default', async () => {
    const onFinish = vi.fn()
    render(<FinishGameDialog open onOpenChange={() => {}} players={players} playerId="p1" onFinish={onFinish} />)

    expect(screen.getByRole('heading', { name: 'Завершить игру' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Без победителя' })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Завершить игру' }))
    expect(onFinish).toHaveBeenCalledWith(undefined)
  })

  it('lets the host pick another winner', async () => {
    const onFinish = vi.fn()
    render(<FinishGameDialog open onOpenChange={() => {}} players={players} playerId="p1" suggestedWinnerId="p2" onFinish={onFinish} />)
    await userEvent.click(screen.getByRole('radio', { name: /Alice \(вы\)/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Завершить игру' }))
    expect(onFinish).toHaveBeenCalledWith('p1')
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

describe('ServerWakeHint', () => {
  it('appears only when the wait is long and goes away with it', () => {
    vi.useFakeTimers()
    try {
      const { rerender } = render(<ServerWakeHint active />)
      act(() => vi.advanceTimersByTime(WAKE_HINT_DELAY - 1))
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(1))
      expect(screen.getByRole('status')).toHaveTextContent('Будим сервер')

      rerender(<ServerWakeHint active={false} />)
      expect(screen.queryByRole('status')).not.toBeInTheDocument()

      // A new wait starts counting from zero
      rerender(<ServerWakeHint active />)
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('CombatMode, a lost fight', () => {
  const actions = <button>смыться</button>
  const players = [player('p1', 'Alice'), player('p2', 'Bob')]

  it('offers flee and die only to the player themselves, only after losing', async () => {
    render(<CombatMode players={players} defaultPlayerId="p1" lostActions={actions} />)
    const monster = screen.getByLabelText('Сила противника')

    await userEvent.type(monster, '9')
    expect(screen.getByRole('button', { name: 'смыться' })).toBeInTheDocument()

    await userEvent.clear(monster)
    await userEvent.type(monster, '1') // 1 vs 1: a draw, the monster wins it
    expect(screen.getByRole('status')).toHaveTextContent('Ничья')
    expect(screen.getByRole('button', { name: 'смыться' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Alice: карта +1' }))
    expect(screen.getByRole('status')).toHaveTextContent('Победа')
    expect(screen.queryByRole('button', { name: 'смыться' })).not.toBeInTheDocument()

    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Кто сражается' })).getByRole('radio', { name: /Bob/ }))
    await userEvent.clear(monster)
    await userEvent.type(monster, '9')
    expect(screen.queryByRole('button', { name: 'смыться' })).not.toBeInTheDocument()
  })
})

describe('FleeActions', () => {
  const flee = (seq: number, newValue: string, playerId = 'p1') =>
    entry({ seq, eventType: 'flee', playerId, newValue })

  function setup() {
    const send = vi.spyOn(gameStore.getState(), 'flee').mockImplementation(() => {})
    gameStore.setState({ playerId: 'p1', connectionStatus: 'connected', changelog: [flee(1, '6')] })
    const onDie = vi.fn()
    const onCloseCombat = vi.fn()
    render(<FleeActions onDie={onDie} onCloseCombat={onCloseCombat} />)
    return { send, onDie, onCloseCombat }
  }

  afterEach(() => {
    vi.restoreAllMocks()
    gameStore.setState({ playerId: '', changelog: [], connectionStatus: 'disconnected' })
  })

  it('shows the roll the server sent, not an older or someone else\'s', async () => {
    const { send, onDie } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Смыться' }))
    expect(send).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('Бросаем')

    await waitFor(() => new Promise((r) => setTimeout(r, MIN_ROLL_MS + 50)), { timeout: MIN_ROLL_MS + 500 })
    act(() => gameStore.setState((s) => ({ changelog: [...s.changelog, flee(2, '6', 'p2')] })))
    expect(screen.getByRole('status')).toHaveTextContent('Бросаем')

    act(() => gameStore.setState((s) => ({ changelog: [...s.changelog, flee(3, '3')] })))
    expect(screen.getByRole('status')).toHaveTextContent('Не вышло')
    expect(screen.getByRole('status')).toHaveTextContent('Выпало 3')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Погибнуть' }))
    expect(onDie).toHaveBeenCalled()
  })

  it('lets the die tumble before a fast answer, then closes the fight on success', async () => {
    const { onCloseCombat } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Смыться' }))
    act(() => gameStore.setState((s) => ({ changelog: [...s.changelog, flee(2, '5')] })))
    expect(screen.getByRole('status')).toHaveTextContent('Бросаем')

    expect(await screen.findByText('Смылись!', {}, { timeout: MIN_ROLL_MS + 500 })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть бой' }))
    expect(onCloseCombat).toHaveBeenCalled()
  })
})

describe('DeathDialog', () => {
  const me = player('p1', 'Alice', { level: 7, gearBonus: 5 })

  it('takes the level by default, the gear alone on request', async () => {
    const onConfirm = vi.fn()
    render(<DeathDialog open onOpenChange={() => {}} player={me} onConfirm={onConfirm} />)
    expect(screen.getByRole('radio', { name: /Бонусы 5 → 0, уровень 7 → 1/ })).toBeChecked()

    await userEvent.click(screen.getByRole('button', { name: 'Погибнуть' }))
    expect(onConfirm).toHaveBeenLastCalledWith(true)
  })

  it('can spare the level', async () => {
    const onConfirm = vi.fn()
    render(<DeathDialog open onOpenChange={() => {}} player={me} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('radio', { name: /Только вещи/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Погибнуть' }))
    expect(onConfirm).toHaveBeenLastCalledWith(false)
  })
})

describe('TableEventToast', () => {
  const now = () => Date.now()

  it('tells about others, not about us or old history, and goes away', () => {
    vi.useFakeTimers()
    try {
      const mine = entry({ seq: 1, playerId: 'p1', eventType: 'flee', newValue: '6', timestamp: now() })
      const old = entry({ seq: 2, playerId: 'p2', playerName: 'Bob', eventType: 'flee', newValue: '6', timestamp: now() - 60_000 })
      const { rerender } = render(<TableEventToast entries={[mine, old]} playerId="p1" />)
      expect(screen.queryByRole('status')).not.toBeInTheDocument()

      const roll = entry({ seq: 3, playerId: 'p2', playerName: 'Bob', eventType: 'flee', newValue: '3', timestamp: now() })
      rerender(<TableEventToast entries={[mine, old, roll]} playerId="p1" />)
      expect(screen.getByRole('status')).toHaveTextContent('Bob смывается: выпало 3, не вышло')

      // Our own next move neither hides it nor keeps it forever
      const next = entry({ seq: 4, playerId: 'p1', eventType: 'stat_change', timestamp: now() })
      rerender(<TableEventToast entries={[mine, old, roll, next]} playerId="p1" />)
      expect(screen.getByRole('status')).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(4000))
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
