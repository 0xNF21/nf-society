export type RelicId = 'crown' | 'scepter' | 'cup' | 'scroll' | 'owl'
export type Orientation = 'H' | 'V'
export type ShotResult = 'miss' | 'hit' | 'sunk' | 'already_shot'
export type GameStatus = 'waiting' | 'placing' | 'playing' | 'finished'

export const RELICS: Record<RelicId, {
  name_fr: string; name_en: string; emoji: string; size: number; lore_fr: string; lore_en: string
}> = {
  crown:   { name_fr: 'Couronne',  name_en: 'Crown',   emoji: '👑', size: 5, lore_fr: 'Artefact suprême du DAO',  lore_en: 'Supreme artifact of the DAO' },
  scepter: { name_fr: 'Sceptre',   name_en: 'Scepter', emoji: '🔱', size: 4, lore_fr: 'Symbole du pouvoir',        lore_en: 'Symbol of power' },
  cup:     { name_fr: 'Coupe',     name_en: 'Cup',     emoji: '🏆', size: 3, lore_fr: 'Trophée des anciens',       lore_en: 'Trophy of the ancients' },
  scroll:  { name_fr: 'Parchemin', name_en: 'Scroll',  emoji: '📜', size: 3, lore_fr: 'Savoir interdit',           lore_en: 'Forbidden knowledge' },
  owl:     { name_fr: 'Hibou',     name_en: 'Owl',     emoji: '🦉', size: 2, lore_fr: 'Gardien de la sagesse',     lore_en: 'Guardian of wisdom' },
}

export const RELIC_ORDER: RelicId[] = ['crown', 'scepter', 'cup', 'scroll', 'owl']
export const GRID_SIZE = 10

export function getRelicName(id: RelicId, locale: 'fr' | 'en'): string {
  return locale === 'fr' ? RELICS[id].name_fr : RELICS[id].name_en
}

export interface PlacedRelic {
  id: RelicId; cells: [number, number][]; hitCount: number; sunk: boolean
}
export interface PlayerGrid {
  relics: PlacedRelic[]; shotsReceived: [number, number][]
}
export interface LastShot {
  row: number; col: number; result: ShotResult; shooter: string
}
export interface RelicsGame {
  id: string; status: GameStatus
  player1: string; player2: string | null; bet: string
  grids: Record<string, PlayerGrid>
  placingReady: Record<string, boolean>
  currentTurn: string | null; winner: string | null
  lastShot: LastShot | null; createdAt: number; updatedAt: number
}

export function emptyGrid(): PlayerGrid {
  return { relics: [], shotsReceived: [] }
}
export function getRelicCells(row: number, col: number, size: number, orientation: Orientation): [number, number][] {
  return Array.from({ length: size }, (_, i) =>
    (orientation === 'H' ? [row, col + i] : [row + i, col]) as [number, number]
  )
}
export function canPlace(grid: PlayerGrid, relicId: RelicId, row: number, col: number, orientation: Orientation): boolean {
  const cells = getRelicCells(row, col, RELICS[relicId].size, orientation)
  if (cells.some(([r, c]) => r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE)) return false
  const occupied = new Set(grid.relics.filter(r => r.id !== relicId).flatMap(r => r.cells.map(([cr, cc]) => `${cr},${cc}`)))
  return !cells.some(([r, c]) => occupied.has(`${r},${c}`))
}
export function placeRelic(grid: PlayerGrid, relicId: RelicId, row: number, col: number, orientation: Orientation): PlayerGrid {
  const cells = getRelicCells(row, col, RELICS[relicId].size, orientation)
  return { ...grid, relics: [...grid.relics.filter(r => r.id !== relicId), { id: relicId, cells, hitCount: 0, sunk: false }] }
}
export function removeRelic(grid: PlayerGrid, relicId: RelicId): PlayerGrid {
  return { ...grid, relics: grid.relics.filter(r => r.id !== relicId) }
}
export function processShot(grid: PlayerGrid, row: number, col: number): { grid: PlayerGrid; result: ShotResult } {
  if (grid.shotsReceived.some(([r, c]) => r === row && c === col)) return { grid, result: 'already_shot' }
  const newRelics = grid.relics.map(relic => {
    if (!relic.cells.some(([r, c]) => r === row && c === col)) return relic
    const newHitCount = relic.hitCount + 1
    return { ...relic, hitCount: newHitCount, sunk: newHitCount === relic.cells.length }
  })
  const newGrid: PlayerGrid = { relics: newRelics, shotsReceived: [...grid.shotsReceived, [row, col]] }
  const hitRelic = newRelics.find(r => r.cells.some(([cr, cc]) => cr === row && cc === col))
  const result: ShotResult = !hitRelic ? 'miss' : hitRelic.sunk ? 'sunk' : 'hit'
  return { grid: newGrid, result }
}
export function isDefeated(grid: PlayerGrid): boolean {
  return RELIC_ORDER.every(id => grid.relics.find(r => r.id === id)?.sunk ?? false)
}
export function allRelicsPlaced(grid: PlayerGrid): boolean {
  return RELIC_ORDER.every(id => grid.relics.some(r => r.id === id))
}
export function buildCellMap(grid: PlayerGrid): Record<string, { relicId: RelicId; sunk: boolean }> {
  const map: Record<string, { relicId: RelicId; sunk: boolean }> = {}
  for (const relic of grid.relics)
    for (const [r, c] of relic.cells)
      map[`${r},${c}`] = { relicId: relic.id, sunk: relic.sunk }
  return map
}
export function getPreviewCells(grid: PlayerGrid, relicId: RelicId, row: number, col: number, orientation: Orientation): [number, number][] {
  if (!canPlace(grid, relicId, row, col, orientation)) return []
  return getRelicCells(row, col, RELICS[relicId].size, orientation)
}
