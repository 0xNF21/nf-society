export const GRID_SIZE = 8

export type Player = 1 | 2
export type Cell = null | { player: Player; isKing: boolean }
export type Board = Cell[][]
export type GameStatus = 'waiting_p1' | 'waiting_p2' | 'playing' | 'finished'

export interface Move {
  from: [number, number]
  to: [number, number]
  captures: [number, number][]
}

export interface DamesState {
  board: Board
  currentPlayer: Player
  inRafale: [number, number] | null
  winner: Player | null
  moveCount: number
}

export function createInitialBoard(): Board {
  const b: Board = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null))
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      if ((r + c) % 2 === 1) b[r][c] = { player: 2, isKing: false }
  for (let r = 5; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      if ((r + c) % 2 === 1) b[r][c] = { player: 1, isKing: false }
  return b
}

export function createInitialState(): DamesState {
  return { board: createInitialBoard(), currentPlayer: 1, inRafale: null, winner: null, moveCount: 0 }
}

function getCaptures(board: Board, r: number, c: number): Move[] {
  const cell = board[r][c]
  if (!cell) return []
  // All pawns can capture in all 4 diagonal directions (French rules)
  const dirs: [number, number][] = [[-1,-1],[-1,1],[1,-1],[1,1]]
  const moves: Move[] = []

  if (cell.isKing) {
    // King flies along diagonals, can capture at distance
    for (const [dr, dc] of dirs) {
      let mr = r + dr, mc = c + dc
      // Slide until we hit something
      while (mr >= 0 && mr < GRID_SIZE && mc >= 0 && mc < GRID_SIZE && board[mr][mc] === null) {
        mr += dr; mc += dc
      }
      // Check if we hit an enemy piece
      if (mr < 0 || mr >= GRID_SIZE || mc < 0 || mc >= GRID_SIZE) continue
      if (!board[mr][mc] || board[mr][mc]!.player === cell.player) continue
      const capturedR = mr, capturedC = mc
      // Land on any empty square after the captured piece
      let tr = mr + dr, tc = mc + dc
      while (tr >= 0 && tr < GRID_SIZE && tc >= 0 && tc < GRID_SIZE && board[tr][tc] === null) {
        moves.push({ from: [r, c], to: [tr, tc], captures: [[capturedR, capturedC]] })
        tr += dr; tc += dc
      }
    }
  } else {
    // Regular pawn — capture in all 4 directions but only 1 square away
    for (const [dr, dc] of dirs) {
      const [mr, mc, tr, tc] = [r+dr, c+dc, r+dr*2, c+dc*2]
      if (tr < 0 || tr >= GRID_SIZE || tc < 0 || tc >= GRID_SIZE) continue
      if (!board[mr]?.[mc] || board[mr][mc]!.player === cell.player) continue
      if (board[tr][tc] !== null) continue
      moves.push({ from: [r, c], to: [tr, tc], captures: [[mr, mc]] })
    }
  }
  return moves
}

function getSimpleMoves(board: Board, r: number, c: number): Move[] {
  const cell = board[r][c]
  if (!cell) return []
  const moves: Move[] = []

  if (cell.isKing) {
    // King slides along all 4 diagonals
    const dirs: [number, number][] = [[-1,-1],[-1,1],[1,-1],[1,1]]
    for (const [dr, dc] of dirs) {
      let tr = r + dr, tc = c + dc
      while (tr >= 0 && tr < GRID_SIZE && tc >= 0 && tc < GRID_SIZE && board[tr][tc] === null) {
        moves.push({ from: [r, c], to: [tr, tc], captures: [] })
        tr += dr; tc += dc
      }
    }
  } else {
    // Regular pawn — move forward only (no backward simple moves)
    const dirs: [number, number][] = cell.player === 1 ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]
    for (const [dr, dc] of dirs) {
      const [tr, tc] = [r+dr, c+dc]
      if (tr >= 0 && tr < GRID_SIZE && tc >= 0 && tc < GRID_SIZE && board[tr][tc] === null) {
        moves.push({ from: [r, c], to: [tr, tc], captures: [] })
      }
    }
  }
  return moves
}

export function getValidMoves(state: DamesState): Move[] {
  const { board, currentPlayer, inRafale } = state
  if (inRafale) return getCaptures(board, inRafale[0], inRafale[1])
  const captures: Move[] = []
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      if (board[r][c]?.player === currentPlayer) captures.push(...getCaptures(board, r, c))
  if (captures.length > 0) return captures
  const simple: Move[] = []
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      if (board[r][c]?.player === currentPlayer) simple.push(...getSimpleMoves(board, r, c))
  return simple
}

export function getMovesFrom(state: DamesState, r: number, c: number): Move[] {
  return getValidMoves(state).filter(m => m.from[0] === r && m.from[1] === c)
}

export function applyMove(state: DamesState, move: Move): DamesState {
  const board = state.board.map(row => row.map(cell => cell ? { ...cell } : null)) as Board
  const [fr, fc] = move.from, [tr, tc] = move.to
  const piece = { ...board[fr][fc]! }
  board[tr][tc] = piece
  board[fr][fc] = null
  for (const [cr, cc] of move.captures) board[cr][cc] = null
  const promoted = (piece.player === 1 && tr === 0) || (piece.player === 2 && tr === GRID_SIZE - 1)
  if (promoted) board[tr][tc] = { ...piece, isKing: true }
  const hasMoreCaptures = !promoted && move.captures.length > 0 && getCaptures(board, tr, tc).length > 0
  const opponent = (state.currentPlayer === 1 ? 2 : 1) as Player
  const next: DamesState = {
    board, moveCount: state.moveCount + 1, winner: null,
    currentPlayer: hasMoreCaptures ? state.currentPlayer : opponent,
    inRafale: hasMoreCaptures ? [tr, tc] : null,
  }
  if (!hasMoreCaptures && getValidMoves(next).length === 0) next.winner = state.currentPlayer
  return next
}

export function isValidMove(state: DamesState, move: Move): boolean {
  return getValidMoves(state).some(m =>
    m.from[0] === move.from[0] && m.from[1] === move.from[1] &&
    m.to[0] === move.to[0] && m.to[1] === move.to[1]
  )
}

export function getBotMove(state: DamesState): Move | null {
  const moves = getValidMoves(state)
  if (!moves.length) return null
  const caps = moves.filter(m => m.captures.length > 0)
  const pool = caps.length > 0 ? caps : moves
  return pool[Math.floor(Math.random() * pool.length)]
}
