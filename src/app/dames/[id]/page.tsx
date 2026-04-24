'use client'
import { useParams } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { ArrowLeft, Trophy, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useDemo } from '@/components/demo-provider'
import { useLocale } from '@/components/language-provider'
import { useTheme } from '@/components/theme-provider'
import { translations } from '@/lib/i18n'
import { createInitialState, applyMove, getBotMove, GRID_SIZE } from '@/lib/dames'
import type { DamesState, Move, Player, Board } from '@/lib/dames'
import { DamesBoard } from '@/components/dames-board'
import { GamePayment } from '@/components/game-payment'
import { TicketRecovery } from '@/components/ticket-recovery'
import { PlayerBanner } from '@/components/player-banner'
import { RematchButton, RematchBanner } from '@/components/rematch-button'
import { PnlCard } from '@/components/pnl-card'
import { usePlayerToken } from '@/hooks/use-player-token'
import { useGamePolling } from '@/hooks/use-game-polling'
import type { DamesGameRow } from '@/lib/db/schema/dames'

// ─── Scoreboard ──────────────────────────────────────────────────────────────

function countPieces(board: Board) {
  let p1 = 0, p1Kings = 0, p2 = 0, p2Kings = 0
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = board[r][c]
      if (!cell) continue
      if (cell.player === 1) { p1++; if (cell.isKing) p1Kings++ }
      else { p2++; if (cell.isKing) p2Kings++ }
    }
  return { p1, p1Kings, p2, p2Kings }
}

function DamesScoreboard({ state, locale, p1Label, p2Label, isDark }: {
  state: DamesState
  locale: 'fr' | 'en'
  p1Label: string
  p2Label: string
  isDark: boolean
}) {
  const { p1, p1Kings, p2, p2Kings } = countPieces(state.board)
  const p1Captured = 12 - p2
  const p2Captured = 12 - p1

  return (
    <div className="w-full max-w-lg grid grid-cols-2 gap-2">
      <div className={`rounded-xl p-3 ${
        state.currentPlayer === 1 && !state.winner
          ? (isDark ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-emerald-50 border border-emerald-200/50')
          : (isDark ? 'bg-white/5 border border-white/10' : 'bg-white/60 border border-ink/10')
      }`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-5 h-5 rounded-full bg-stone-100 border-2 border-stone-400 inline-block" />
          <span className="text-xs font-bold text-ink/70 dark:text-white/70 truncate">{p1Label}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-black text-ink dark:text-white">{p1}<span className="text-sm font-bold text-ink/40 dark:text-white/40">/12</span></span>
          <div className="text-[10px] text-ink/50 dark:text-white/50 space-y-0.5">
            <p>♛ {p1Kings} {translations.dames.kings[locale]}</p>
            <p>💥 {p1Captured} {translations.dames.captures[locale]}</p>
          </div>
        </div>
      </div>
      <div className={`rounded-xl p-3 ${
        state.currentPlayer === 2 && !state.winner
          ? (isDark ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200/50')
          : (isDark ? 'bg-white/5 border border-white/10' : 'bg-white/60 border border-ink/10')
      }`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-5 h-5 rounded-full bg-stone-900 border-2 border-stone-600 inline-block" />
          <span className="text-xs font-bold text-ink/70 dark:text-white/70 truncate">{p2Label}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-black text-ink dark:text-white">{p2}<span className="text-sm font-bold text-ink/40 dark:text-white/40">/12</span></span>
          <div className="text-[10px] text-ink/50 dark:text-white/50 space-y-0.5">
            <p>♛ {p2Kings} {translations.dames.kings[locale]}</p>
            <p>💥 {p2Captured} {translations.dames.captures[locale]}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Historique des coups ────────────────────────────────────────────────────

function MoveLog({ entries, locale, isDark }: { entries: string[], locale: 'fr' | 'en', isDark: boolean }) {
  if (entries.length === 0) return null
  return (
    <div className={`w-full max-w-lg rounded-xl p-3 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-white/60 border border-ink/10'}`}>
      <p className="text-[10px] font-bold text-ink/40 dark:text-white/40 uppercase tracking-widest mb-1">
        {translations.dames.lastMoves[locale]}
      </p>
      <div className="flex flex-col gap-0.5 max-h-20 overflow-y-auto">
        {entries.slice(-5).reverse().map((entry, i) => (
          <p key={i} className={`text-xs ${i === 0 ? 'text-ink dark:text-white font-medium' : 'text-ink/40 dark:text-white/40'}`}>
            {entry}
          </p>
        ))}
      </div>
    </div>
  )
}

function describeMove(move: Move, player: number, locale: 'fr' | 'en') {
  const cols = 'ABCDEFGH'
  const from = `${cols[move.from[1]]}${GRID_SIZE - move.from[0]}`
  const to = `${cols[move.to[1]]}${GRID_SIZE - move.to[0]}`
  const who = player === 1 ? translations.dames.you[locale] : 'IA'
  const cap = move.captures.length > 0
    ? ` (${move.captures.length} ${translations.dames.captureSingular[locale]}${move.captures.length > 1 ? 's' : ''})`
    : ''
  return `${who}: ${from} → ${to}${cap}`
}

// ─── Mode Demo ───────────────────────────────────────────────────────────────

function DemoGame() {
  const { locale } = useLocale()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const t = translations.dames
  const { addXp, demoPlayer } = useDemo()
  const [state, setState] = useState<DamesState>(createInitialState())
  const [thinking, setThinking] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [moveLog, setMoveLog] = useState<string[]>([])
  const [xpGained, setXpGained] = useState(0)
  const xpAdded = useRef(false)

  function handleMove(move: Move) {
    const next = applyMove(state, move)
    setState(next)
    setMoveLog(prev => [...prev, describeMove(move, 1, locale)])
    if (next.winner) {
      const won = next.winner === 1
      setResult(won ? 'win' : 'lose')
      if (won && !xpAdded.current) { xpAdded.current = true; setXpGained(addXp('dames_win')) }
      return
    }
    if (next.currentPlayer === 2) {
      setThinking(true)
      setTimeout(() => {
        const botMove = getBotMove(next)
        if (!botMove) { setResult('win'); setThinking(false); return }
        const after = applyMove(next, botMove)
        setState(after)
        setMoveLog(prev => [...prev, describeMove(botMove, 2, locale)])
        setThinking(false)
        if (after.winner) {
          setResult(after.winner === 1 ? 'win' : 'lose')
          if (after.winner === 1 && !xpAdded.current) { xpAdded.current = true; setXpGained(addXp('dames_win')) }
        }
      }, 600)
    }
  }

  const isMyTurn = state.currentPlayer === 1 && !thinking && !result

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <Link href="/dames" className="inline-flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
          </Link>
          <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg font-bold">DEMO</span>
        </div>

        {/* Status */}
        <Card className="mb-4 rounded-xl border-0 shadow-sm bg-white/60 backdrop-blur-sm">
          <CardContent className="p-0 overflow-hidden text-center">
            {!result && (
              <div className="flex items-center justify-center gap-2 py-3 px-4">
                {isMyTurn && <Clock className="w-4 h-4 text-marine" />}
                <span className="text-lg font-bold text-ink">
                  {isMyTurn ? t.yourTurn[locale] : thinking ? '🤖 Bot...' : t.opponentTurn[locale]}
                </span>
              </div>
            )}
            {result === 'win' && (
              <div className="flex flex-col items-center gap-1 py-3 px-4">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-citrus" />
                  <span className="font-bold text-ink">{t.victory[locale]}</span>
                </div>
                {xpGained > 0 && <span className="text-xs text-emerald-600 font-bold">+{xpGained} XP</span>}
              </div>
            )}
            {result === 'lose' && (
              <div className="py-3 px-4">
                <p className="text-2xl text-center">🤖</p>
                <p className="font-bold text-ink text-sm">{t.defeat[locale]}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scoreboard */}
        <div className="mb-4">
          <DamesScoreboard
            state={state} locale={locale} isDark={isDark}
            p1Label={`${demoPlayer.name} (${t.youShort[locale]})`}
            p2Label="🤖 Bot"
          />
        </div>

        {/* Board */}
        <div className="flex justify-center mb-4">
          <DamesBoard state={state} myPlayer={1} onMove={handleMove} disabled={!!result || thinking || state.currentPlayer !== 1} />
        </div>

        {/* Move log */}
        <div className="mb-4">
          <MoveLog entries={moveLog} locale={locale} isDark={isDark} />
        </div>

        <p className="text-center text-xs text-ink/40 dark:text-white/40 mb-4">
          {t.moves[locale]} : {state.moveCount}
        </p>

        {result && (
          <Link href="/dames">
            <Button className="w-full rounded-xl font-bold" style={{ background: '#251B9F' }}>
              {t.playAgain[locale]}
            </Button>
          </Link>
        )}
      </div>
    </div>
  )
}

// ─── Mode Réel ───────────────────────────────────────────────────────────────

function RealGame({ id }: { id: string }) {
  const { locale } = useLocale()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const t = translations.dames
  const { game, loading, fetchGame, setGame } = useGamePolling<DamesGameRow>('dames', id)
  const playerTokenRef = usePlayerToken('dames', id)
  const [address, setAddress] = useState('')
  const [addressConfirmed, setAddressConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [moveLog, setMoveLog] = useState<string[]>([])
  const [profiles, setProfiles] = useState<Record<string, { name: string; imageUrl: string | null }>>({})

  // Fetch profiles
  useEffect(() => {
    if (!game) return
    const addresses = [game.player1Address, game.player2Address].filter(Boolean) as string[]
    if (addresses.length === 0) return
    const unknown = addresses.filter(a => !profiles[a.toLowerCase()])
    if (unknown.length === 0) return
    fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: unknown }),
    }).then(r => r.json()).then(data => {
      if (data.profiles) setProfiles(prev => ({ ...prev, ...data.profiles }))
    }).catch(() => {})
    // `profiles` en dep causerait une boucle infinie (l'effet set profiles via
    // le functional updater) ; `game` entier re-triggerait a chaque polling —
    // on track les adresses player-specific qui suffisent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.player1Address, game?.player2Address])

  // Auto-identify player via token match
  useEffect(() => {
    if (!game || !playerTokenRef.current || addressConfirmed) return
    const token = playerTokenRef.current
    if (game.player1Token === token && game.player1Address) {
      setAddress(game.player1Address)
      setAddressConfirmed(true)
    } else if (game.player2Token === token && game.player2Address) {
      setAddress(game.player2Address)
      setAddressConfirmed(true)
    }
    // `game` en dep entière re-triggerait a chaque polling (toutes les 2s) —
    // on track explicitement les champs player-specific qui nous intéressent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.player1Token, game?.player2Token, game?.player1Address, game?.player2Address, addressConfirmed, playerTokenRef])

  async function handleMove(move: Move) {
    if (!address) return
    setError('')
    setMoveLog(prev => [...prev, describeMove(move, game?.player1Address?.toLowerCase() === address.toLowerCase() ? 1 : 2, locale)])
    const res = await fetch(`/api/dames/${id}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player: address, move, playerToken: playerTokenRef.current }),
    })
    const data = await res.json()
    if (data.error) setError(data.error)
    else fetchGame()
  }

  async function testInject(mode: string) {
    await fetch(`/api/dames/${id}/test?mode=${mode}`, { method: 'POST' })
    fetchGame()
  }

  if (!game) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-ink/50">{t.loading[locale]}</p>
    </div>
  )

  const isCreator = typeof window !== 'undefined' && sessionStorage.getItem(`dames_creator_${id}`) === '1'
  const state = game.gameState as DamesState | null
  const myPlayer: Player | null = address
    ? (game.player1Address?.toLowerCase() === address.toLowerCase() ? 1
    : game.player2Address?.toLowerCase() === address.toLowerCase() ? 2
    : null)
    : null
  const isMyTurn = state && myPlayer && state.currentPlayer === myPlayer

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="mb-6 space-y-2">
          <Link href="/dames" className="inline-flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink/40">{t.gameLabel[locale]}</span>
            <span className="font-mono font-bold text-marine text-sm bg-marine/10 px-2.5 py-1 rounded-lg">{id}</span>
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg font-bold">{game.betCrc} CRC</span>
          </div>
        </div>

        {/* Status bar */}
        {state && (
          <Card className="mb-4 rounded-xl border-0 shadow-sm bg-white/60 backdrop-blur-sm">
            <CardContent className="p-0 overflow-hidden text-center">
              {game.status === 'playing' && (
                <div className="flex items-center justify-center gap-2 py-3 px-4">
                  {isMyTurn && <Clock className="w-4 h-4 text-marine" />}
                  <span className="text-lg font-bold text-ink">
                    {isMyTurn ? t.yourTurn[locale] : t.opponentTurn[locale]}
                  </span>
                </div>
              )}
              {game.status === 'finished' && (
                <div className="flex flex-col items-center gap-1 py-3 px-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-citrus" />
                    <span className="font-bold text-ink">
                      {game.winnerAddress?.toLowerCase() === address.toLowerCase() ? t.victory[locale] : t.defeat[locale]}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Rematch */}
        {game.status === 'finished' && address && (
          <div className="my-4">
            {game.rematchSlug ? (
              <RematchBanner gameKey="dames" rematchSlug={game.rematchSlug} />
            ) : (
              <RematchButton gameKey="dames" slug={game.slug} rematchSlug={game.rematchSlug} />
            )}
          </div>
        )}

        {/* PNL Card */}
        {game.status === 'finished' && address && (() => {
          const iWon = game.winnerAddress?.toLowerCase() === address.toLowerCase();
          const isDraw = !game.winnerAddress;
          const wAmount = game.betCrc * 2 * (1 - game.commissionPct / 100);
          const myProfile = profiles[address.toLowerCase()];
          const oppAddr = game.player1Address?.toLowerCase() === address.toLowerCase() ? game.player2Address : game.player1Address;
          const oppProfile = oppAddr ? profiles[oppAddr.toLowerCase()] : null;
          return (
            <PnlCard
              gameType="dames"
              result={isDraw ? 'draw' : iWon ? 'win' : 'loss'}
              betCrc={game.betCrc}
              gainCrc={isDraw ? 0 : iWon ? Math.round((wAmount - game.betCrc) * 1000) / 1000 : -game.betCrc}
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
          gameKey="dames"
          game={game}
          playerToken={playerTokenRef.current}
          isCreator={isCreator}
          onScanComplete={fetchGame}
        />

        {/* Player banner */}
        {game.status !== 'waiting_p1' && game.status !== 'waiting_p2' && (
          <div className="mb-4">
            <PlayerBanner
              p1Address={game.player1Address}
              p2Address={game.player2Address}
              myRole={myPlayer === 1 ? "p1" : myPlayer === 2 ? "p2" : null}
              profiles={profiles}
            />
          </div>
        )}

        {/* Spectator notice */}
        {game.status === 'playing' && !addressConfirmed && (
          <Card className="mb-4 bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
            <CardContent className="p-5 text-center space-y-3">
              <p className="text-sm text-ink/60 dark:text-white/60">
                {t.spectatorMode[locale]}
              </p>
              <TicketRecovery gameKey="dames" slug={game.slug} />
            </CardContent>
          </Card>
        )}

        {/* Jeu */}
        {state && game.status !== 'waiting_p1' && game.status !== 'waiting_p2' && (
          <>
            <div className="mb-4">
              <DamesScoreboard
                state={state} locale={locale} isDark={isDark}
                p1Label={(game.player1Address?.slice(0, 6) ?? '???') + '… (J1)'}
                p2Label={(game.player2Address?.slice(0, 6) ?? '???') + '… (J2)'}
              />
            </div>

            <div className="flex justify-center mb-4">
              <DamesBoard state={state} myPlayer={myPlayer} onMove={handleMove} disabled={!isMyTurn || game.status === 'finished'} />
            </div>

            <div className="mb-4">
              <MoveLog entries={moveLog} locale={locale} isDark={isDark} />
            </div>

            <p className="text-center text-xs text-ink/40 dark:text-white/40 mb-4">
              Pot: {game.betCrc * 2} CRC · {t.moves[locale]}: {state.moveCount}
            </p>
          </>
        )}

        {/* Test mode dev */}
        {process.env.NODE_ENV === 'development' && (
          <div className="flex gap-2 flex-wrap justify-center mt-4">
            <Button variant="outline" size="sm" onClick={() => testInject('inject')}
              className="rounded-lg text-xs border-amber-300 text-amber-700 hover:bg-amber-50">
              Injecter J1
            </Button>
            <Button variant="outline" size="sm" onClick={() => testInject('skip')}
              className="rounded-lg text-xs border-amber-300 text-amber-700 hover:bg-amber-50">
              Skip → Jeu
            </Button>
            <Button variant={address === game?.player1Address ? 'default' : 'outline'} size="sm"
              onClick={() => setGame(g => { if (g) { setAddress(g.player1Address ?? ''); setAddressConfirmed(true) } return g })}
              className="rounded-lg text-xs">
              J1
            </Button>
            <Button variant={address === game?.player2Address ? 'default' : 'outline'} size="sm"
              onClick={() => setGame(g => { if (g) { setAddress(g.player2Address ?? ''); setAddressConfirmed(true) } return g })}
              className="rounded-lg text-xs">
              J2
            </Button>
          </div>
        )}

        {error && <p className="text-red-500 text-xs text-center mt-2">{error}</p>}
      </div>
    </div>
  )
}

// ─── Page principale ─────────────────────────────────────────────────────────

export default function DamesGamePage() {
  const { id } = useParams<{ id: string }>()
  const { isDemo } = useDemo()
  if (!id) return null
  if (id.startsWith('DEMO') && !isDemo) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-ink/50">Chargement…</p>
    </div>
  )
  if (isDemo && id.startsWith('DEMO')) return <DemoGame />
  return <RealGame id={id} />
}
