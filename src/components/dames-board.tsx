'use client'
import { useState } from 'react'
import { getValidMoves, getMovesFrom, GRID_SIZE } from '@/lib/dames'
import type { DamesState, Move, Player } from '@/lib/dames'

export function DamesBoard({ state, myPlayer, onMove, disabled }: {
  state: DamesState
  myPlayer: Player | null
  onMove: (m: Move) => void
  disabled?: boolean
}) {
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const validMoves = getValidMoves(state)
  const movesFrom = selected ? getMovesFrom(state, selected[0], selected[1]) : []
  const targets = new Set(movesFrom.map(m => `${m.to[0]},${m.to[1]}`))
  const canInteract = !disabled && (!myPlayer || state.currentPlayer === myPlayer)
  const selectables = new Set(
    canInteract ? validMoves.map(m => `${m.from[0]},${m.from[1]}`) : []
  )

  function handleClick(r: number, c: number) {
    if (!canInteract) return
    if (selected && targets.has(`${r},${c}`)) {
      const move = movesFrom.find(m => m.to[0] === r && m.to[1] === c)!
      setSelected(null)
      onMove(move)
      return
    }
    if (selectables.has(`${r},${c}`)) { setSelected([r, c]); return }
    setSelected(null)
  }

  return (
    <div className="inline-block border-2 border-black/20 dark:border-white/20 rounded-xl overflow-hidden shadow-2xl">
      {state.board.map((row, r) => (
        <div key={r} className="flex">
          {row.map((cell, c) => {
            const dark = (r + c) % 2 === 1
            const isSelected = selected?.[0] === r && selected?.[1] === c
            const isTarget = targets.has(`${r},${c}`)
            const isSelectable = selectables.has(`${r},${c}`)

            let bg = dark ? 'bg-stone-700' : 'bg-stone-200'
            if (isSelected) bg = 'bg-citrus/70'
            else if (isTarget && dark) bg = 'bg-green-600/60'
            else if (isSelectable && dark) bg = 'bg-stone-600 hover:bg-stone-500 cursor-pointer'

            return (
              <div key={c}
                className={`w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center transition-colors relative ${bg}`}
                onClick={() => dark && handleClick(r, c)}>
                {cell && (
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full border-2 flex items-center justify-center text-base font-bold shadow-md transition-transform select-none
                    ${cell.player === 1 ? 'bg-stone-100 border-stone-400 text-stone-800' : 'bg-stone-900 border-stone-600 text-white'}
                    ${isSelected ? 'scale-110 shadow-citrus/50 shadow-lg' : ''}`}>
                    {cell.isKing ? '♛' : ''}
                  </div>
                )}
                {isTarget && !cell && (
                  <div className="w-4 h-4 rounded-full bg-green-400/80 shadow-sm animate-pulse" />
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
