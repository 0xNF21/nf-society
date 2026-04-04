'use client'
import { useParams } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { ArrowLeft, Copy, Check, RefreshCw, Trophy, Clock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useDemo } from '@/components/demo-provider'
import { useLocale } from '@/components/language-provider'
import { useTheme } from '@/components/theme-provider'
import { translations } from '@/lib/i18n'
import { createInitialState, applyMove, getBotMove, GRID_SIZE } from '@/lib/dames'
import type { DamesState, Move, Player, Board } from '@/lib/dames'
import { DamesBoard } from '@/components/dames-board'
import { generateGamePaymentLink } from '@/lib/circles'
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
            <p>♛ {p1Kings} {locale === 'fr' ? 'dames' : 'kings'}</p>
            <p>💥 {p1Captured} {locale === 'fr' ? 'prises' : 'captures'}</p>
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
            <p>♛ {p2Kings} {locale === 'fr' ? 'dames' : 'kings'}</p>
            <p>💥 {p2Captured} {locale === 'fr' ? 'prises' : 'captures'}</p>
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
        {locale === 'fr' ? 'Derniers coups' : 'Last moves'}
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

function describeMove(move: Move, player: number, locale: string) {
  const cols = 'ABCDEFGH'
  const from = `${cols[move.from[1]]}${GRID_SIZE - move.from[0]}`
  const to = `${cols[move.to[1]]}${GRID_SIZE - move.to[0]}`
  const who = player === 1 ? (locale === 'fr' ? 'Toi' : 'You') : 'IA'
  const cap = move.captures.length > 0
    ? ` (${move.captures.length} ${locale === 'fr' ? 'prise' : 'capture'}${move.captures.length > 1 ? 's' : ''})`
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
            <ArrowLeft className="w-4 h-4" /> {locale === 'fr' ? 'Retour' : 'Back'}
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
            p1Label={`${demoPlayer.name} (${locale === 'fr' ? 'vous' : 'you'})`}
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
          {locale === 'fr' ? 'Coups' : 'Moves'} : {state.moveCount}
        </p>

        {result && (
          <Link href="/dames">
            <Button className="w-full rounded-xl font-bold" style={{ background: '#251B9F' }}>
              {locale === 'fr' ? 'Rejouer' : 'Play again'}
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
  const [game, setGame] = useState<DamesGameRow | null>(null)
  const [address, setAddress] = useState('')
  const [addressConfirmed, setAddressConfirmed] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedPayLink, setCopiedPayLink] = useState(false)
  const [error, setError] = useState('')
  const [moveLog, setMoveLog] = useState<string[]>([])
  const [qrCode, setQrCode] = useState('')
  const [qrState, setQrState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const playerTokenRef = useRef<string>('')

  const fetchGame = useCallback(async () => {
    const res = await fetch(`/api/dames?id=${id}`)
    if (res.ok) { const d = await res.json(); setGame(d.game) }
  }, [id])

  const scanPayments = useCallback(async () => {
    setScanning(true)
    const res = await fetch(`/api/dames-scan?gameId=${id}`, { method: 'POST' })
    if (res.ok) { const d = await res.json(); setGame(d.game) }
    setScanning(false)
  }, [id])

  useEffect(() => {
    fetchGame()
    const poll = setInterval(fetchGame, 2000)
    return () => clearInterval(poll)
  }, [fetchGame])

  useEffect(() => {
    if (game?.status === 'waiting_p1' || game?.status === 'waiting_p2') {
      const interval = setInterval(scanPayments, 5000)
      return () => clearInterval(interval)
    }
  }, [game?.status, scanPayments])

  // Init player token from URL, localStorage, or generate new
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const urlToken = urlParams.get('setToken')
    if (urlToken) {
      localStorage.setItem(`dames-${id}-token`, urlToken)
      playerTokenRef.current = urlToken
      window.history.replaceState({}, '', window.location.pathname)
    } else {
      const stored = localStorage.getItem(`dames-${id}-token`)
      if (stored) {
        playerTokenRef.current = stored
      } else {
        const token = crypto.randomUUID().slice(0, 8)
        localStorage.setItem(`dames-${id}-token`, token)
        playerTokenRef.current = token
      }
    }
  }, [id])

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
  }, [game?.player1Token, game?.player2Token, game?.status, addressConfirmed])

  // Generate QR code when in payment phase
  useEffect(() => {
    if (!game || (game.status !== 'waiting_p1' && game.status !== 'waiting_p2')) return
    let active = true
    setQrState('loading')
    ;(async () => {
      try {
        const { toDataURL } = await import('qrcode')
        const link = generateGamePaymentLink(game.recipientAddress, game.betCrc, 'dames', game.slug, playerTokenRef.current)
        const url = await toDataURL(link, { width: 220, margin: 1, color: { dark: '#1b1b1f', light: '#ffffff' } })
        if (active) { setQrCode(url); setQrState('ready') }
      } catch {
        if (active) { setQrCode(''); setQrState('error') }
      }
    })()
    return () => { active = false }
  }, [game?.status, game?.recipientAddress, game?.betCrc, game?.slug])

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
      <p className="text-ink/50">{locale === 'fr' ? 'Chargement…' : 'Loading…'}</p>
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
  const payLink = generateGamePaymentLink(game.recipientAddress, game.betCrc, 'dames', game.slug, playerTokenRef.current)

  async function copyId() {
    await navigator.clipboard.writeText(id)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  async function copyPayment() {
    await navigator.clipboard.writeText(payLink)
    setCopiedPayLink(true); setTimeout(() => setCopiedPayLink(false), 2000)
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="mb-6 space-y-2">
          <Link href="/dames" className="inline-flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors">
            <ArrowLeft className="w-4 h-4" /> {locale === 'fr' ? 'Retour' : 'Back'}
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink/40">{locale === 'fr' ? 'Partie' : 'Game'}</span>
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

        {/* J1 déjà payé — attend J2 */}
        {game.status === 'waiting_p2' && addressConfirmed && (
          <Card className="mb-4 bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
            <CardContent className="p-5 space-y-4">
              <p className="text-sm font-semibold text-ink">{t.waitingP2[locale]}</p>
              <p className="text-xs text-ink/50">{t.inviteP2[locale]}</p>
              <div className="flex gap-2">
                <code className="flex-1 px-3 py-2.5 rounded-xl border border-ink/10 bg-white/80 text-xs font-mono text-ink/70 truncate">{id}</code>
                <Button variant="outline" size="sm" onClick={copyId} className="rounded-xl border-ink/20">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <Button variant="ghost" onClick={scanPayments} disabled={scanning}
                className="w-full rounded-xl text-ink/40">
                <RefreshCw className={`w-3 h-3 mr-1 ${scanning ? 'animate-spin' : ''}`} />
                {scanning ? t.scanningPayments[locale] : t.scanPayments[locale]}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Paiement — J1 pas encore payé OU J2 qui doit payer */}
        {((game.status === 'waiting_p1') || (game.status === 'waiting_p2' && !addressConfirmed)) && (
          <Card className="mb-4 bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-ink/40 uppercase tracking-widest">
                  {game.status === 'waiting_p1' ? t.payToStart[locale] : t.payToJoin[locale]}
                </span>
                <span className="text-xs font-bold text-marine bg-marine/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">{game.betCrc} CRC</span>
              </div>
              <a href={payLink} target="_blank" rel="noopener noreferrer">
                <Button className="w-full rounded-xl font-bold" style={{ background: '#251B9F' }}>
                  {t.payCrc[locale].replace('{amount}', String(game.betCrc))}
                </Button>
              </a>
              <Button variant="outline" onClick={copyPayment}
                className="w-full rounded-xl border-ink/20 hover:border-marine/40 text-ink/60">
                {copiedPayLink ? <><Check className="w-4 h-4" /> {t.copied[locale]}</> : <><Copy className="w-4 h-4" /> {locale === 'fr' ? 'Copier le lien de paiement' : 'Copy payment link'}</>}
              </Button>

              {/* QR Code */}
              <div className="flex justify-center">
                <div className="bg-white rounded-2xl p-4 shadow-lg border border-ink/5">
                  {qrState === 'loading' && (
                    <div className="w-[220px] h-[220px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-ink/20" />
                    </div>
                  )}
                  {qrState === 'ready' && qrCode && <img src={qrCode} alt="QR Code" className="w-[220px] h-[220px]" />}
                  {qrState === 'error' && (
                    <div className="w-[220px] h-[220px] flex items-center justify-center text-xs text-red-400">QR Error</div>
                  )}
                  <p className="text-xs text-ink/40 mt-2 text-center">
                    {locale === 'fr' ? 'Scannez pour ouvrir dans Gnosis App' : 'Scan to open in Gnosis App'}
                  </p>
                </div>
              </div>

              <Button variant="ghost" onClick={scanPayments} disabled={scanning}
                className="w-full rounded-xl text-ink/40">
                <RefreshCw className={`w-3 h-3 mr-1 ${scanning ? 'animate-spin' : ''}`} />
                {scanning ? t.scanningPayments[locale] : t.scanPayments[locale]}
              </Button>

              <div className="p-3 rounded-xl bg-ink/[0.03] border border-ink/5 text-xs text-ink/50 text-center space-y-0.5">
                <p>{locale === 'fr' ? 'Paiement via Circles sur Gnosis Chain' : 'Payment via Circles on Gnosis Chain'}</p>
                <p>🏆 {locale === 'fr' ? 'Gain du gagnant' : 'Winner gets'}: <span className="font-bold text-ink">{game.betCrc * 2 * 0.95} CRC</span> (5% commission)</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Spectator notice */}
        {game.status === 'playing' && !addressConfirmed && (
          <Card className="mb-4 bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
            <CardContent className="p-5 text-center">
              <p className="text-sm text-ink/60 dark:text-white/60">
                {locale === 'fr' ? 'Mode spectateur — vous regardez cette partie' : 'Spectator mode — you are watching this game'}
              </p>
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
              Pot: {game.betCrc * 2} CRC · {locale === 'fr' ? 'Coups' : 'Moves'}: {state.moveCount}
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
