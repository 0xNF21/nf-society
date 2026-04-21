"use client"
import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { RELICS, RELIC_ORDER, GRID_SIZE, buildCellMap, placeRelic, removeRelic, canPlace, allRelicsPlaced, emptyGrid, processShot, isDefeated, getRelicName } from "@/lib/relics"
import type { RelicId, Orientation, PlayerGrid } from "@/lib/relics"
import type { RelicsGameRow } from "@/lib/db/schema/relics"
import { useDemo } from "@/components/demo-provider"
import { useLocale } from "@/components/language-provider"
import { useTheme } from "@/components/theme-provider"
import { GamePayment } from "@/components/game-payment"
import { PlayerBanner } from "@/components/player-banner"
import { RematchButton, RematchBanner } from "@/components/rematch-button"
import { PnlCard } from "@/components/pnl-card"
import { usePlayerToken } from "@/hooks/use-player-token"
import { useGamePolling } from "@/hooks/use-game-polling"
import { translations } from "@/lib/i18n"
import { formatCrc } from "@/lib/format"
import Link from "next/link"
import { ArrowLeft, RotateCcw, Trophy, Clock, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// ─── Scoreboard: live recap of hits, misses, sunk relics ───
function GameScoreboard({ myGrid, opponentGrid, locale, isDark }: {
  myGrid: PlayerGrid | null | undefined
  opponentGrid: PlayerGrid | null | undefined
  locale: "fr" | "en"
  isDark: boolean
}) {
  function getStats(grid: PlayerGrid | null | undefined) {
    if (!grid) return { shots: 0, hits: 0, misses: 0, sunkCount: 0, sunkRelics: [] as RelicId[] }
    const cellMap = buildCellMap(grid)
    let hits = 0, misses = 0
    for (const [r, c] of grid.shotsReceived) {
      if (cellMap[`${r},${c}`]) hits++; else misses++
    }
    const sunkRelics = grid.relics.filter(r => r.sunk).map(r => r.id)
    return { shots: grid.shotsReceived.length, hits, misses, sunkCount: sunkRelics.length, sunkRelics }
  }

  const myAttacks = getStats(opponentGrid) // my shots ON opponent
  const oppAttacks = getStats(myGrid)      // opponent shots ON me

  return (
    <div className="w-full max-w-lg space-y-3">
      {/* Score bars */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-xl p-3 ${isDark ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-emerald-50 border border-emerald-200/50"}`}>
          <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2">
            {translations.relics.myShots[locale]}
          </p>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{myAttacks.sunkCount}<span className="text-sm font-bold">/{RELIC_ORDER.length}</span></span>
            <div className="text-[10px] text-ink/50 dark:text-white/50 space-y-0.5">
              <p>💥 {myAttacks.hits} {translations.relics.shotHits[locale]}</p>
              <p>💧 {myAttacks.misses} {translations.relics.shotMisses[locale]}</p>
            </div>
          </div>
        </div>
        <div className={`rounded-xl p-3 ${isDark ? "bg-red-500/10 border border-red-500/20" : "bg-red-50 border border-red-200/50"}`}>
          <p className="text-[10px] font-bold text-red-500 dark:text-red-400 uppercase tracking-widest mb-2">
            {translations.relics.opponentShots[locale]}
          </p>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-black text-red-500 dark:text-red-400">{oppAttacks.sunkCount}<span className="text-sm font-bold">/{RELIC_ORDER.length}</span></span>
            <div className="text-[10px] text-ink/50 dark:text-white/50 space-y-0.5">
              <p>💥 {oppAttacks.hits} {translations.relics.shotHits[locale]}</p>
              <p>💧 {oppAttacks.misses} {translations.relics.shotMisses[locale]}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Opponent relics tracker */}
      <div className={`rounded-xl p-3 ${isDark ? "bg-white/5 border border-white/10" : "bg-white/60 border border-ink/10"}`}>
        <p className="text-[10px] font-bold text-ink/40 dark:text-white/40 uppercase tracking-widest mb-2">
          {translations.relics.opponentRelics[locale]}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {RELIC_ORDER.map(rid => {
            const oppRelic = opponentGrid?.relics.find(r => r.id === rid)
            const isSunk = oppRelic?.sunk ?? false
            return (
              <div key={rid} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs transition-all
                ${isSunk
                  ? "border-red-500/50 bg-red-500/10 dark:bg-red-500/20"
                  : "border-ink/10 dark:border-white/10"}`}>
                <span>{RELICS[rid].emoji}</span>
                <span className={`font-medium ${isSunk ? "line-through text-red-500 dark:text-red-400" : "text-ink/50 dark:text-white/50"}`}>
                  {getRelicName(rid, locale)}
                </span>
                {isSunk && <span className="text-red-500 dark:text-red-400 font-bold">✕</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* My relics tracker */}
      <div className={`rounded-xl p-3 ${isDark ? "bg-white/5 border border-white/10" : "bg-white/60 border border-ink/10"}`}>
        <p className="text-[10px] font-bold text-ink/40 dark:text-white/40 uppercase tracking-widest mb-2">
          {translations.relics.myRelics[locale]}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {RELIC_ORDER.map(rid => {
            const myRelic = myGrid?.relics.find(r => r.id === rid)
            const isSunk = myRelic?.sunk ?? false
            const hitCount = myRelic?.hitCount ?? 0
            const size = RELICS[rid].size
            const hasHits = hitCount > 0 && !isSunk
            return (
              <div key={rid} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs transition-all
                ${isSunk
                  ? "border-red-500/50 bg-red-500/10 dark:bg-red-500/20"
                  : hasHits
                    ? "border-amber-500/50 bg-amber-500/10 dark:bg-amber-500/20"
                    : "border-ink/10 dark:border-white/10"}`}>
                <span>{RELICS[rid].emoji}</span>
                <span className={`font-medium ${isSunk ? "line-through text-red-500 dark:text-red-400" : hasHits ? "text-amber-600 dark:text-amber-400" : "text-ink/50 dark:text-white/50"}`}>
                  {getRelicName(rid, locale)}
                </span>
                {isSunk && <span className="text-red-500 dark:text-red-400 font-bold">✕</span>}
                {hasHits && !isSunk && <span className="text-amber-600 dark:text-amber-400 text-[10px] font-bold">{hitCount}/{size}</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Demo Relics (client-only vs bot) ───
function DemoRelicsGame() {
  const { locale } = useLocale()
  const { addXp } = useDemo()
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const t = translations.relics

  const [phase, setPhase] = useState<"placing" | "playing" | "finished">("placing")
  const [myGrid, setMyGrid] = useState<PlayerGrid>(emptyGrid())
  const [botGrid, setBotGrid] = useState<PlayerGrid | null>(null)
  const [selectedRelic, setSelectedRelic] = useState<RelicId>("crown")
  const [orientation, setOrientation] = useState<Orientation>("H")
  const [previewCells, setPreviewCells] = useState<[number, number][]>([])
  const [isMyTurn, setIsMyTurn] = useState(true)
  const [lastResult, setLastResult] = useState("")
  const [winner, setWinner] = useState<"me" | "bot" | null>(null)
  const [xpGained, setXpGained] = useState(0)
  const [botThinking, setBotThinking] = useState(false)

  function generateBotGrid(): PlayerGrid {
    let grid = emptyGrid()
    for (const rid of RELIC_ORDER) {
      let placed = false
      for (let attempt = 0; attempt < 200 && !placed; attempt++) {
        const o: Orientation = Math.random() > 0.5 ? "H" : "V"
        const r = Math.floor(Math.random() * GRID_SIZE)
        const c = Math.floor(Math.random() * GRID_SIZE)
        if (canPlace(grid, rid, r, c, o)) {
          grid = placeRelic(grid, rid, r, c, o)
          placed = true
        }
      }
    }
    return grid
  }

  function handleGridHover(row: number, col: number) {
    if (phase !== "placing") return
    const cells: [number, number][] = []
    const size = RELICS[selectedRelic].size
    for (let i = 0; i < size; i++) {
      const r = orientation === "H" ? row : row + i
      const c = orientation === "H" ? col + i : col
      if (r < GRID_SIZE && c < GRID_SIZE) cells.push([r, c])
    }
    setPreviewCells(canPlace(myGrid, selectedRelic, row, col, orientation) ? cells : [])
  }

  function handleGridClick(row: number, col: number) {
    if (phase !== "placing") return
    if (!canPlace(myGrid, selectedRelic, row, col, orientation)) return
    const newGrid = placeRelic(myGrid, selectedRelic, row, col, orientation)
    setMyGrid(newGrid)
    const next = RELIC_ORDER.find(rid => !newGrid.relics.some(r => r.id === rid))
    if (next) setSelectedRelic(next)
  }

  function handleConfirmPlacement() {
    if (!allRelicsPlaced(myGrid)) return
    setBotGrid(generateBotGrid())
    setPhase("playing")
    setIsMyTurn(true)
  }

  function handleShot(row: number, col: number) {
    if (!isMyTurn || phase !== "playing" || !botGrid) return
    const { grid: newGrid, result } = processShot(botGrid, row, col)
    if (result === "already_shot") return
    setBotGrid(newGrid)
    const RELIC_NAMES_DEMO: Record<string, string> = {
      crown: t.relicCrown[locale],
      scepter: t.relicScepter[locale],
      cup: t.relicCup[locale],
      scroll: t.relicScroll[locale],
      owl: t.relicOwl[locale],
    }
    let demoMsg = ""
    if (result === "sunk") {
      const sunkRelic = newGrid.relics.find(r => r.sunk && r.cells.some(([cr, cc]) => cr === row && cc === col))
      const name = sunkRelic ? (RELIC_NAMES_DEMO[sunkRelic.id] ?? sunkRelic.id) : ""
      demoMsg = t.sunkRelic[locale].replace("{name}", name)
    } else if (result === "hit") {
      demoMsg = t.hitPlayAgain[locale]
    } else {
      demoMsg = t.miss[locale]
    }
    setLastResult(demoMsg)
    setTimeout(() => setLastResult(""), 3000)
    if (isDefeated(newGrid)) {
      setPhase("finished")
      setWinner("me")
      setXpGained(addXp("relics_win"))
      return
    }
    // Hit or sunk = play again
    if (result === "hit" || result === "sunk") return
    setIsMyTurn(false)
    setBotThinking(true)
  }

  // Bot turn
  useEffect(() => {
    if (isMyTurn || phase !== "playing" || !botThinking) return
    const timeout = setTimeout(() => {
      const available: [number, number][] = []
      for (let r = 0; r < GRID_SIZE; r++)
        for (let c = 0; c < GRID_SIZE; c++)
          if (!myGrid.shotsReceived.some(([sr, sc]) => sr === r && sc === c))
            available.push([r, c])
      if (available.length === 0) return
      const [br, bc] = available[Math.floor(Math.random() * available.length)]
      const { grid: newGrid, result } = processShot(myGrid, br, bc)
      setMyGrid(newGrid)
      if (isDefeated(newGrid)) {
        setPhase("finished")
        setWinner("bot")
        setXpGained(addXp("relics_lose"))
      } else {
        setIsMyTurn(true)
        setLastResult(t.yourTurn[locale])
        setTimeout(() => setLastResult(""), 3000)
      }
      setBotThinking(false)
    }, 800)
    return () => clearTimeout(timeout)
  }, [isMyTurn, phase, botThinking, myGrid])

  function renderGrid(grid: PlayerGrid | null, clickable: boolean, showRelics: boolean) {
    const cellMap = grid ? buildCellMap(grid) : {}
    const shots = grid?.shotsReceived ?? []
    const shotSet = new Set(shots.map(([r, c]) => `${r},${c}`))
    return (
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}
        onMouseLeave={() => setPreviewCells([])}>
        {Array.from({ length: GRID_SIZE }, (_, r) =>
          Array.from({ length: GRID_SIZE }, (_, c) => {
            const key = `${r},${c}`
            const cell = cellMap[key]
            const isShot = shotSet.has(key)
            const isPreview = previewCells.some(([pr, pc]) => pr === r && pc === c)
            const isHit = isShot && !!cell
            const isMiss = isShot && !cell
            const isSunkCell = cell?.sunk
            let bg = isDark ? "bg-white/5" : "bg-ink/5"
            if (showRelics && cell && !isSunkCell && !isShot) bg = "bg-marine/60"
            if (showRelics && isSunkCell) bg = "bg-red-900/90 ring-1 ring-red-400/50"
            if (isHit && !isSunkCell) bg = "bg-red-500/80"
            if (isHit && isSunkCell) bg = "bg-red-900/90 ring-1 ring-red-400/50"
            if (isMiss) bg = isDark ? "bg-blue-400/30" : "bg-blue-200/50"
            if (isPreview) bg = "bg-amber-400/40"
            return (
              <div key={key}
                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-sm cursor-pointer border border-ink/5 dark:border-white/5 flex items-center justify-center text-xs transition-colors relative ${bg}`}
                onMouseEnter={() => showRelics && handleGridHover(r, c)}
                onClick={() => { if (showRelics) handleGridClick(r, c); if (clickable) handleShot(r, c) }}>
                {isHit && !isSunkCell && "💥"}
                {isSunkCell && cell && <><span className="text-[10px]">{RELICS[cell.relicId].emoji}</span><span className="absolute inset-0 flex items-center justify-center text-red-300 font-black text-lg leading-none">✕</span></>}
                {isMiss && "·"}
                {showRelics && cell && !isShot && !isSunkCell && <span className="text-[10px]">{RELICS[cell.relicId].emoji}</span>}
              </div>
            )
          })
        )}
      </div>
    )
  }

  // Placing phase
  if (phase === "placing") {
    return (
      <main className="min-h-screen flex flex-col items-center p-4 gap-6">
        <div className="flex items-center justify-between w-full max-w-lg mt-4">
          <Link href="/relics" className="text-ink/50 dark:text-white/50 hover:text-ink dark:hover:text-white transition">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="font-display text-2xl font-bold text-marine dark:text-blue-400 tracking-widest">{t.placeRelics[locale]}</h1>
          <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg font-bold">DEMO</span>
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          {RELIC_ORDER.map(rid => {
            const placed = myGrid.relics.some(r => r.id === rid)
            return (
              <button key={rid} onClick={() => setSelectedRelic(rid)}
                className={`px-3 py-2 rounded-lg border text-sm font-medium transition
                  ${placed ? "border-green-500/50 text-green-600 dark:text-green-400 opacity-60" : ""}
                  ${selectedRelic === rid && !placed ? "border-marine dark:border-blue-400 text-marine dark:text-blue-400 bg-marine/10 dark:bg-blue-400/10" : "border-ink/20 dark:border-white/20 text-ink/60 dark:text-white/60"}`}>
                {RELICS[rid].emoji} {getRelicName(rid, locale)} ({RELICS[rid].size})
                {placed && " ✓"}
              </button>
            )
          })}
        </div>

        <button onClick={() => setOrientation(o => o === "H" ? "V" : "H")}
          className="flex items-center gap-2 px-4 py-2 bg-ink/5 dark:bg-white/10 rounded-lg text-ink/70 dark:text-white/70 text-sm hover:bg-ink/10 dark:hover:bg-white/20 transition">
          <RotateCcw className="h-4 w-4" />
          {orientation === "H" ? t.orientationH[locale] : t.orientationV[locale]}
        </button>

        {renderGrid(myGrid, false, true)}

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setMyGrid(removeRelic(myGrid, selectedRelic))}>
            {t.remove[locale]} {RELICS[selectedRelic].emoji}
          </Button>
          <Button onClick={handleConfirmPlacement} disabled={!allRelicsPlaced(myGrid)}>
            {t.confirmPlacement[locale]}
          </Button>
        </div>
      </main>
    )
  }

  // Playing / Finished
  return (
    <main className="min-h-screen flex flex-col items-center p-4 gap-6">
      <div className="flex items-center justify-between w-full max-w-lg mt-4">
        <Link href="/relics" className="text-ink/50 dark:text-white/50 hover:text-ink dark:hover:text-white transition">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="font-display text-2xl font-bold text-marine dark:text-blue-400 tracking-widest">RELICS</h1>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${isMyTurn && phase === "playing" ? "bg-amber-400 text-ink" : "bg-ink/10 dark:bg-white/10 text-ink/50 dark:text-white/50"}`}>
          {phase === "finished"
            ? (winner === "me" ? t.victory[locale] : t.defeat[locale])
            : isMyTurn ? t.yourTurn[locale] : t.opponentTurn[locale]}
        </div>
      </div>

      {phase === "finished" && (
        <Card className="w-full max-w-lg rounded-xl border-0 shadow-sm bg-white/60 dark:bg-white/5 backdrop-blur-sm">
          <CardContent className="py-4 text-center">
            {winner === "me" ? (
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-2"><Trophy className="w-5 h-5 text-citrus" /><span className="font-bold text-ink dark:text-white">{t.victory[locale]}</span></div>
                {xpGained > 0 && <span className="text-xs text-emerald-600 font-bold">+{xpGained} XP</span>}
              </div>
            ) : (
              <div><p className="text-2xl">🤖</p><p className="font-bold text-ink dark:text-white text-sm">{t.defeat[locale]}</p>
                {xpGained > 0 && <p className="text-xs text-emerald-600 font-bold">+{xpGained} XP</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Scoreboard */}
      <GameScoreboard myGrid={myGrid} opponentGrid={botGrid} locale={locale} isDark={isDark} />

      <div className="relative flex flex-col items-center gap-2">
        <p className="text-ink/50 dark:text-white/50 text-xs uppercase tracking-widest">{t.opponentGrid[locale]}</p>
        {renderGrid(botGrid, isMyTurn && phase === "playing", false)}
        {lastResult && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className={`px-5 py-3 rounded-2xl text-lg font-black text-white shadow-xl animate-bounce ${
              lastResult.includes("💥") ? "bg-red-500/90" : lastResult.includes("🔥") ? "bg-orange-500/90" : lastResult.includes("⚔️") ? "bg-emerald-500/90" : "bg-blue-500/90"
            }`}>
              {lastResult}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <p className="text-ink/50 dark:text-white/50 text-xs uppercase tracking-widest">{t.yourGrid[locale]}</p>
        {renderGrid(myGrid, false, true)}
      </div>

      {phase === "finished" && (
        <Link href="/relics">
          <Button className="rounded-xl font-bold mt-2" style={{ background: "#251B9F" }}>
            {t.playAgain[locale]}
          </Button>
        </Link>
      )}
    </main>
  )
}

// ─── Real Relics Game (multiplayer with payment) ───
function RealRelicsGame({ id }: { id: string }) {
  const { locale } = useLocale()
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const t = translations.relics

  const { game, loading, fetchGame, setGame } = useGamePolling<RelicsGameRow>("relics", id)
  const playerTokenRef = usePlayerToken("relics", id)
  const [myAddress, setMyAddress] = useState("")
  const [addressConfirmed, setAddressConfirmed] = useState(false)
  const [isCreator, setIsCreator] = useState(false)
  const [error, setError] = useState("")
  const [lastResult, setLastResult] = useState("")
  const [profiles, setProfiles] = useState<Record<string, { name: string; imageUrl: string | null }>>({})

  // Placement state
  const [myGrid, setMyGrid] = useState<PlayerGrid>(emptyGrid())
  const [selectedRelic, setSelectedRelic] = useState<RelicId>("crown")
  const [orientation, setOrientation] = useState<Orientation>("H")
  const [previewCells, setPreviewCells] = useState<[number, number][]>([])

  useEffect(() => {
    setIsCreator(sessionStorage.getItem(`relics_creator_${id}`) === "1")
  }, [id])

  // Auto-identify player via token match
  useEffect(() => {
    if (!game || !playerTokenRef.current || addressConfirmed) return
    const token = playerTokenRef.current
    if (game.player1Token === token && game.player1Address) {
      setMyAddress(game.player1Address)
      setAddressConfirmed(true)
    } else if (game.player2Token === token && game.player2Address) {
      setMyAddress(game.player2Address)
      setAddressConfirmed(true)
    }
  }, [game?.player1Token, game?.player2Token, game?.status, addressConfirmed])

  // Detect turn change → show "your turn" popup
  const prevTurnRef = useRef<string | null>(null)
  useEffect(() => {
    if (!game || !myAddress || game.status !== "playing") return
    const currentTurn = game.currentTurn?.toLowerCase() || null
    const myAddr = myAddress.toLowerCase()
    // Only trigger when turn switches TO me (not on initial load)
    if (currentTurn === myAddr && prevTurnRef.current !== null && prevTurnRef.current !== myAddr) {
      setLastResult(t.yourTurn[locale])
      setTimeout(() => setLastResult(""), 3000)
    }
    prevTurnRef.current = currentTurn
  }, [game?.currentTurn, game?.status, myAddress])

  // Fetch profiles
  useEffect(() => {
    if (!game) return
    const addresses = [game.player1Address, game.player2Address].filter(Boolean) as string[]
    if (addresses.length === 0) return
    const unknown = addresses.filter(a => !profiles[a.toLowerCase()])
    if (unknown.length === 0) return
    fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses: unknown }),
    }).then(r => r.json()).then(data => {
      if (data.profiles) setProfiles(prev => ({ ...prev, ...data.profiles }))
    }).catch(() => {})
  }, [game?.player1Address, game?.player2Address])

  // Placement handlers
  function handleGridHover(row: number, col: number) {
    const cells: [number, number][] = []
    const size = RELICS[selectedRelic].size
    for (let i = 0; i < size; i++) {
      const r = orientation === "H" ? row : row + i
      const c = orientation === "H" ? col + i : col
      if (r < GRID_SIZE && c < GRID_SIZE) cells.push([r, c])
    }
    setPreviewCells(canPlace(myGrid, selectedRelic, row, col, orientation) ? cells : [])
  }

  function handleGridClick(row: number, col: number) {
    if (!canPlace(myGrid, selectedRelic, row, col, orientation)) return
    const newGrid = placeRelic(myGrid, selectedRelic, row, col, orientation)
    setMyGrid(newGrid)
    const next = RELIC_ORDER.find(rid => !newGrid.relics.some(r => r.id === rid))
    if (next) setSelectedRelic(next)
  }

  async function handleConfirmPlacement() {
    if (!allRelicsPlaced(myGrid)) return setError(t.placeAll[locale])
    const res = await fetch("/api/relics/place", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, player: myAddress, grid: myGrid, playerToken: playerTokenRef.current }),
    })
    const data = await res.json()
    if (!data.ok) setError(data.error ?? "Erreur")
    else { setError(""); fetchGame() }
  }

  async function handleShot(row: number, col: number) {
    if (!myAddress || !game || game.status !== "playing") return
    if (game.currentTurn?.toLowerCase() !== myAddress.toLowerCase()) return
    const res = await fetch("/api/relics/shot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, player: myAddress, row, col, playerToken: playerTokenRef.current }),
    })
    const data = await res.json()
    if (data.result) {
      const RELIC_NAMES: Record<string, string> = {
        crown: t.relicCrown[locale],
        scepter: t.relicScepter[locale],
        cup: t.relicCup[locale],
        scroll: t.relicScroll[locale],
        owl: t.relicOwl[locale],
      }
      let msg = ""
      if (data.result === "sunk" && data.sunkRelicId) {
        const name = RELIC_NAMES[data.sunkRelicId] ?? data.sunkRelicId
        msg = t.sunkRelic[locale].replace("{name}", name)
      } else if (data.result === "hit") {
        msg = t.hitPlayAgain[locale]
      } else if (data.result === "miss") {
        msg = t.miss[locale]
      }
      setLastResult(msg)
      setTimeout(() => setLastResult(""), 3000)
    }
    if (data.error) setError(data.error)
    fetchGame()
  }

  function renderGrid(grid: PlayerGrid | null | undefined, clickable: boolean, showRelics: boolean, placingMode?: boolean) {
    const cellMap = grid ? buildCellMap(grid) : {}
    const shots = grid?.shotsReceived ?? []
    const shotSet = new Set(shots.map(([r, c]) => `${r},${c}`))
    return (
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}
        onMouseLeave={() => setPreviewCells([])}>
        {Array.from({ length: GRID_SIZE }, (_, r) =>
          Array.from({ length: GRID_SIZE }, (_, c) => {
            const key = `${r},${c}`
            const cell = cellMap[key]
            const isShot = shotSet.has(key)
            const isPreview = previewCells.some(([pr, pc]) => pr === r && pc === c)
            const isHit = isShot && !!cell
            const isMiss = isShot && !cell
            const isSunkCell = cell?.sunk
            let bg = isDark ? "bg-white/5" : "bg-ink/5"
            if (showRelics && cell && !isSunkCell && !isShot) bg = "bg-marine/60"
            if (showRelics && isSunkCell) bg = "bg-red-900/90 ring-1 ring-red-400/50"
            if (isHit && !isSunkCell) bg = "bg-red-500/80"
            if (isHit && isSunkCell) bg = "bg-red-900/90 ring-1 ring-red-400/50"
            if (isMiss) bg = isDark ? "bg-blue-400/30" : "bg-blue-200/50"
            if (isPreview) bg = "bg-amber-400/40"
            return (
              <div key={key}
                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-sm cursor-pointer border border-ink/5 dark:border-white/5 flex items-center justify-center text-xs transition-colors relative ${bg}`}
                onMouseEnter={() => placingMode && handleGridHover(r, c)}
                onClick={() => { if (placingMode) handleGridClick(r, c); if (clickable) handleShot(r, c) }}>
                {isHit && !isSunkCell && "💥"}
                {isSunkCell && cell && <><span className="text-[10px]">{RELICS[cell.relicId].emoji}</span><span className="absolute inset-0 flex items-center justify-center text-red-300 font-black text-lg leading-none">✕</span></>}
                {isMiss && "·"}
                {showRelics && cell && !isShot && !isSunkCell && <span className="text-[10px]">{RELICS[cell.relicId].emoji}</span>}
              </div>
            )
          })
        )}
      </div>
    )
  }

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-4">
        <div className="h-16 rounded-xl bg-ink/[0.08] dark:bg-white/[0.08] animate-pulse" />
        <div className="h-64 rounded-2xl bg-ink/[0.08] dark:bg-white/[0.08] animate-pulse" />
      </div>
    </div>
  )

  if (!game) {
    // If ID looks like a demo game, keep loading (parent will switch to DemoRelicsGame)
    if (id.startsWith("DEMO")) return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg space-y-4">
          <div className="h-16 rounded-xl bg-ink/[0.08] dark:bg-white/[0.08] animate-pulse" />
          <div className="h-64 rounded-2xl bg-ink/[0.08] dark:bg-white/[0.08] animate-pulse" />
        </div>
      </div>
    )
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-ink/50 dark:text-white/50">{t.gameNotFound[locale]}</p>
        <Link href="/relics"><Button variant="outline" className="rounded-xl">← {t.title[locale]}</Button></Link>
      </div>
    )
  }

  const isP1 = myAddress && game.player1Address?.toLowerCase() === myAddress.toLowerCase()
  const isP2 = myAddress && game.player2Address?.toLowerCase() === myAddress.toLowerCase()
  const myGridServer = isP1 ? game.grid1 : isP2 ? game.grid2 : null
  const opponentGrid = isP1 ? game.grid2 : isP2 ? game.grid1 : null
  const isMyTurn = myAddress && game.currentTurn?.toLowerCase() === myAddress.toLowerCase()
  const isPlacing = game.status === "placing"
  const isPlaying = game.status === "playing"
  const isFinished = game.status === "finished"
  const isWaiting = game.status === "waiting_p1" || game.status === "waiting_p2"
  const winAmount = game.betCrc * 2 * (1 - game.commissionPct / 100)

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-lg">

        {/* Back + Game ID */}
        <div className="mb-6 space-y-2">
          <Link href="/relics" className="inline-flex items-center gap-1.5 text-sm text-ink/50 dark:text-white/50 hover:text-ink dark:hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t.title[locale]}
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink/40 dark:text-white/40">{t.gameLabel[locale]}</span>
            <span className="font-mono font-bold text-marine dark:text-blue-400 text-sm bg-marine/10 dark:bg-blue-400/10 px-2.5 py-1 rounded-lg">{game.slug}</span>
          </div>
        </div>

        {/* Status banner */}
        <Card className="mb-4 rounded-xl border-0 shadow-sm bg-white/60 dark:bg-white/5 backdrop-blur-sm">
          <CardContent className="p-0 overflow-hidden text-center">
            {game.status === "waiting_p1" && (
              <div className="flex items-center justify-center gap-2 text-ink/60 dark:text-white/60 py-3 px-4">
                <Clock className="w-4 h-4" />
                <span className="text-sm font-semibold">{t.payToStart[locale]}</span>
              </div>
            )}
            {game.status === "waiting_p2" && (
              <div className="flex items-center justify-center gap-2 text-ink/60 dark:text-white/60 py-3 px-4">
                <Users className="w-4 h-4" />
                <span className="text-sm font-semibold">{t.waitingP2[locale]}</span>
              </div>
            )}
            {isPlacing && (
              <div className="flex items-center justify-center gap-2 py-3 px-4">
                <span className="text-sm font-semibold text-ink dark:text-white">{t.placeRelics[locale]}</span>
              </div>
            )}
            {isPlaying && (
              <div className="flex items-center justify-center gap-2 py-3 px-4">
                <span className="text-lg font-bold text-ink dark:text-white">
                  {isMyTurn ? t.yourTurn[locale] : t.opponentTurn[locale]}
                </span>
              </div>
            )}
            {isFinished && (
              <div className="space-y-1 py-3 px-4">
                <div className="flex items-center justify-center gap-2">
                  <Trophy className="w-5 h-5 text-citrus" />
                  <span className="font-bold text-ink dark:text-white">
                    {game.winnerAddress?.toLowerCase() === myAddress.toLowerCase() ? t.victory[locale] : t.defeat[locale]}
                  </span>
                </div>
                <p className="text-xs text-ink/50 dark:text-white/50">{formatCrc(winAmount)} CRC</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rematch */}
        {isFinished && myAddress && (
          <div className="my-4">
            {game.rematchSlug ? (
              <RematchBanner gameKey="relics" rematchSlug={game.rematchSlug} />
            ) : (
              <RematchButton gameKey="relics" slug={game.slug} rematchSlug={game.rematchSlug} />
            )}
          </div>
        )}

        {/* PNL Card */}
        {isFinished && myAddress && (() => {
          const iWon = game.winnerAddress?.toLowerCase() === myAddress.toLowerCase();
          const myProfile = profiles[myAddress.toLowerCase()];
          const oppAddr = game.player1Address?.toLowerCase() === myAddress.toLowerCase() ? game.player2Address : game.player1Address;
          const oppProfile = oppAddr ? profiles[oppAddr.toLowerCase()] : null;
          return (
            <PnlCard
              gameType="relics"
              result={iWon ? "win" : "loss"}
              betCrc={game.betCrc}
              gainCrc={iWon ? Math.round((winAmount - game.betCrc) * 1000) / 1000 : -game.betCrc}
              playerName={myProfile?.name}
              playerAvatar={myProfile?.imageUrl || undefined}
              opponentName={oppProfile?.name || (oppAddr ? `${oppAddr.slice(0, 6)}...${oppAddr.slice(-4)}` : undefined)}
              opponentAvatar={oppProfile?.imageUrl || undefined}
              date={new Date().toLocaleDateString()}
              locale={locale}
            />
          );
        })()}

        {/* Payment section */}
        <GamePayment
          gameKey="relics"
          game={game}
          playerToken={playerTokenRef.current}
          isCreator={isCreator}
          onScanComplete={fetchGame}
        />

        {/* Player banner */}
        {!isWaiting && (
          <div className="mb-4">
            <PlayerBanner
              p1Address={game.player1Address}
              p2Address={game.player2Address}
              myRole={isP1 ? "p1" : isP2 ? "p2" : null}
              profiles={profiles}
            />
          </div>
        )}

        {/* Spectator notice */}
        {(isPlacing || isPlaying) && !addressConfirmed && (
          <Card className="mb-4 bg-white/60 dark:bg-white/5 backdrop-blur-sm border-ink/10 dark:border-white/10 shadow-sm rounded-2xl">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-ink/60 dark:text-white/60">
                {t.spectatorMode[locale]}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Placement phase */}
        {isPlacing && addressConfirmed && (
          <>
            <div className="flex flex-wrap gap-2 justify-center mb-4">
              {RELIC_ORDER.map(rid => {
                const placed = myGrid.relics.some(r => r.id === rid)
                return (
                  <button key={rid} onClick={() => setSelectedRelic(rid)}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition
                      ${placed ? "border-green-500/50 text-green-600 dark:text-green-400 opacity-60" : ""}
                      ${selectedRelic === rid && !placed ? "border-marine dark:border-blue-400 text-marine dark:text-blue-400 bg-marine/10 dark:bg-blue-400/10" : "border-ink/20 dark:border-white/20 text-ink/60 dark:text-white/60"}`}>
                    {RELICS[rid].emoji} {getRelicName(rid, locale)} ({RELICS[rid].size})
                    {placed && " ✓"}
                  </button>
                )
              })}
            </div>
            <div className="flex justify-center mb-4">
              <button onClick={() => setOrientation(o => o === "H" ? "V" : "H")}
                className="flex items-center gap-2 px-4 py-2 bg-ink/5 dark:bg-white/10 rounded-lg text-ink/70 dark:text-white/70 text-sm hover:bg-ink/10 dark:hover:bg-white/20 transition">
                <RotateCcw className="h-4 w-4" />
                {orientation === "H" ? t.orientationH[locale] : t.orientationV[locale]}
              </button>
            </div>
            <div className="flex justify-center mb-4">
              {renderGrid(myGrid, false, true, true)}
            </div>
            <div className="flex gap-3 justify-center mb-4">
              <Button variant="outline" onClick={() => setMyGrid(removeRelic(myGrid, selectedRelic))}>
                {t.remove[locale]} {RELICS[selectedRelic].emoji}
              </Button>
              <Button onClick={handleConfirmPlacement} disabled={!allRelicsPlaced(myGrid)}>
                {t.confirmPlacement[locale]}
              </Button>
            </div>
          </>
        )}

        {/* Playing/Finished grids */}
        {(isPlaying || isFinished) && addressConfirmed && (
          <>
            {/* Scoreboard */}
            <GameScoreboard myGrid={myGridServer as PlayerGrid | null} opponentGrid={opponentGrid as PlayerGrid | null} locale={locale} isDark={isDark} />

            <div className="relative flex flex-col items-center gap-2 mb-4">
              <p className="text-ink/50 dark:text-white/50 text-xs uppercase tracking-widest">{t.opponentGrid[locale]}</p>
              {renderGrid(opponentGrid as PlayerGrid | null, !!(isMyTurn && isPlaying), false)}
              {lastResult && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                  <div className={`px-5 py-3 rounded-2xl text-lg font-black text-white shadow-xl animate-bounce ${
                    lastResult.includes("💥") ? "bg-red-500/90" : lastResult.includes("🔥") ? "bg-orange-500/90" : lastResult.includes("⚔️") ? "bg-emerald-500/90" : "bg-blue-500/90"
                  }`}>
                    {lastResult}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-2 mb-4">
              <p className="text-ink/50 dark:text-white/50 text-xs uppercase tracking-widest">{t.yourGrid[locale]}</p>
              {renderGrid(myGridServer as PlayerGrid | null, false, true)}
            </div>
          </>
        )}

        {/* Placing waiting notice */}
        {isPlacing && !addressConfirmed && (
          <p className="text-center text-sm text-ink/50 dark:text-white/50 mt-4">{t.enterAddress[locale]}</p>
        )}

        {/* Players */}
        {(isPlacing || isPlaying || isFinished) && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[
              { label: "J1", addr: game.player1Address },
              { label: "J2", addr: game.player2Address },
            ].map(({ label, addr }) => {
              const isMe = !!myAddress && addr?.toLowerCase() === myAddress.toLowerCase()
              const profile = addr ? profiles[addr.toLowerCase()] : undefined
              return (
                <div key={label} className="bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-ink/10 dark:border-white/10 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-ink/40 dark:text-white/40 uppercase tracking-widest mb-1.5">{label}</p>
                  <div className="flex items-center gap-2">
                    {addr ? (
                      <>
                        {profile?.imageUrl ? (
                          <img src={profile.imageUrl} alt={profile.name} className="w-7 h-7 rounded-full object-cover border border-ink/10 dark:border-white/10" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-marine/20 dark:bg-blue-400/20 flex items-center justify-center text-xs text-marine dark:text-blue-400 font-bold">{label.slice(1)}</div>
                        )}
                        <div>
                          <span className="text-xs font-semibold text-ink/70 dark:text-white/70 block leading-tight">{profile?.name || shortenAddress(addr)}</span>
                          {isMe && <span className="text-[10px] text-ink/50 dark:text-white/50">{t.you[locale]}</span>}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-ink/10 dark:bg-white/10 flex items-center justify-center text-xs text-ink/50 dark:text-white/50 animate-pulse">?</div>
                        <span className="text-xs text-ink/50 dark:text-white/50">{t.waiting[locale]}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Test mode — dev only */}
        {process.env.NODE_ENV === "development" && (
          <div className="mt-2 p-3 rounded-xl border border-dashed border-ink/15 dark:border-white/15 space-y-2">
            <p className="text-xs text-ink/50 dark:text-white/50 text-center font-mono">Test mode</p>
            {isWaiting && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={async () => {
                  await fetch(`/api/relics/${id}/test`, { method: "POST" })
                  setMyAddress("0xtest000000000000000000000000000000000001")
                  setAddressConfirmed(true)
                  await fetchGame()
                }} className="py-1.5 rounded-lg bg-ink/5 dark:bg-white/10 text-xs text-ink/40 dark:text-white/40 hover:text-ink/60 dark:hover:text-white/60 transition-all">
                  {t.injectPlayers[locale]}
                </button>
                <button onClick={async () => {
                  await fetch(`/api/relics/${id}/test?mode=skip`, { method: "POST" })
                  setMyAddress("0xtest000000000000000000000000000000000001")
                  setAddressConfirmed(true)
                  await fetchGame()
                }} className="py-1.5 rounded-lg bg-emerald-500/10 text-xs text-emerald-500 font-bold hover:bg-emerald-500/20 transition-all">
                  {t.skipToGame[locale]}
                </button>
              </div>
            )}
            {(isPlacing || isPlaying) && game.player1Address && game.player2Address && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setMyAddress(game.player1Address!.toLowerCase()); setAddressConfirmed(true) }}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all ${myAddress === game.player1Address?.toLowerCase() ? "bg-marine/20 text-marine ring-2 ring-marine/40" : "bg-marine/10 text-marine hover:bg-marine/20"}`}>
                  J1 {myAddress === game.player1Address?.toLowerCase() ? "●" : ""}
                </button>
                <button onClick={() => { setMyAddress(game.player2Address!.toLowerCase()); setAddressConfirmed(true) }}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all ${myAddress === game.player2Address?.toLowerCase() ? "bg-citrus/20 text-citrus ring-2 ring-citrus/40" : "bg-citrus/10 text-citrus hover:bg-citrus/20"}`}>
                  J2 {myAddress === game.player2Address?.toLowerCase() ? "●" : ""}
                </button>
              </div>
            )}
            {isPlacing && addressConfirmed && (
              <button onClick={async () => {
                await fetch(`/api/relics/${id}/test?mode=skip`, { method: "POST" })
                await fetchGame()
              }} className="w-full py-1.5 rounded-lg bg-emerald-500/10 text-xs text-emerald-500 font-bold hover:bg-emerald-500/20 transition-all">
                {t.skipToGameAuto[locale]}
              </button>
            )}
          </div>
        )}

        {error && <p className="text-red-500 text-sm text-center mt-2">{error}</p>}

      </div>
    </div>
  )
}

export default function RelicsGamePage() {
  const { id } = useParams<{ id: string }>()
  const { isDemo } = useDemo()

  if (isDemo && id.startsWith("DEMO")) {
    return <DemoRelicsGame />
  }

  return <RealRelicsGame id={id} />
}
