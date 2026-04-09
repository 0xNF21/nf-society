---
paths:
  - "src/app/api/**/*.ts"
  - "src/app/**/page.tsx"
  - "src/lib/**/*.ts"
---

# Prompt pour creer un nouveau jeu multijoueur NF Society

Tu es un dev fullstack sur le projet NF Society. Quand on te demande de creer un nouveau jeu multijoueur avec mise en CRC (Circles), suis ce pattern exact.

## Stack technique
- Next.js 14.2 App Router (PAS de React 19 `use()`, utilise `useParams()`)
- TypeScript, Tailwind CSS avec `darkMode: "class"`
- PostgreSQL via Drizzle ORM (`src/lib/db`)
- Circles Protocol pour les paiements on-chain (Gnosis)
- i18n FR/EN dans `src/lib/i18n.ts`
- Couleurs projet: marine (#251B9F), citrus, ink

## Architecture d'un jeu — fichiers a creer

### 1. Game logic — `src/lib/{game}.ts`
Logique pure du jeu, aucune dependance DB ou API :
- Types (grilles, coups, resultats, statuts)
- Fonctions pures (placer, jouer, verifier victoire, etc.)
- Export des types pour le schema DB et les composants

### 2. Schema DB — `src/lib/db/schema/{game}.ts`
Table PostgreSQL avec les colonnes OBLIGATOIRES pour le flow de paiement :
```typescript
import { pgTable, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core'

export const {game}Games = pgTable('{game}_games', {
  id:               text('id').primaryKey(),        // nanoid(10)
  status:           text('status').notNull().default('waiting_p1'),
  betCrc:           integer('bet_crc').notNull(),
  recipientAddress: text('recipient_address').notNull(),
  commissionPct:    integer('commission_pct').notNull().default(5),
  player1Address:   text('player1_address'),
  player2Address:   text('player2_address'),
  player1TxHash:    text('player1_tx_hash'),
  player2TxHash:    text('player2_tx_hash'),
  // ... colonnes specifiques au jeu (grilles, etat, etc.) ...
  winner:           text('winner'),
  payoutStatus:     text('payout_status').notNull().default('pending'),
  payoutTx:         text('payout_tx'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
})
export type {Game}GameRow = typeof {game}Games.$inferSelect
```

**Status flow** : `waiting_p1` → `waiting_p2` → `{phase_active}` → `finished`

Puis exporter dans `src/lib/db/schema.ts` :
```typescript
export { {game}Games } from "./schema/{game}"
```

Et creer la table en DB (via script node ou migration drizzle).

### 3. API Routes

#### `src/app/api/{game}/route.ts` — Creer + Lire
```
POST / — body: { betCrc } → cree la partie avec nanoid, recipientAddress = process.env.SAFE_ADDRESS
GET /?id=xxx — retourne la partie
```

#### `src/app/api/{game}-scan/route.ts` — Scanner les paiements (CRITIQUE)
Pattern exact a suivre (copie de morpion-scan/relics-scan) :
1. Recevoir `gameId` en query param
2. Verifier que le jeu n'est pas deja demarre
3. Appeler `checkAllNewPayments(game.betCrc, game.recipientAddress)` de `src/lib/circles.ts`
4. Pour chaque paiement :
   - Verifier `payment.gameData.game === "{game}" && payment.gameData.id === game.id`
   - Verifier le montant exact en wei
   - Claim dans `claimedPayments` table (gameType: `{game}:{id}`, gameId: 0)
   - Assigner player1 ou player2 selon l'ordre d'arrivee
   - Mettre a jour le status: `waiting_p1` → `waiting_p2` → phase active

**IMPORTANT** : le `gameData` est encode dans la transaction via `encodeGameData()` de `src/lib/game-data.ts`. C'est ce qui permet de lier un paiement a une partie specifique. Sans ca, impossible de distinguer les paiements.

#### `src/app/api/{game}/[id]/test/route.ts` — Mode test (dev only)
Endpoint pour injecter de faux joueurs en dev :
- `POST ?mode=inject` → insere 2 faux joueurs, passe en phase active
- `POST ?mode=skip` → insere joueurs + auto-genere l'etat du jeu, passe direct en phase de jeu
- Protege par `process.env.NODE_ENV !== "development"`

#### Routes de jeu specifiques
Selon le jeu : `place/route.ts`, `shot/route.ts`, `move/route.ts`, etc.
- Toujours verifier `game.status` et `game.currentTurn`
- Comparer les adresses en `.toLowerCase()`
- **OBLIGATOIRE — Anti-triche** : verifier le `playerToken` sur CHAQUE endpoint de coup :
```typescript
const { playerToken, ...rest } = await req.json()
// Token obligatoire
if (!playerToken) {
  return NextResponse.json({ error: "Player token required" }, { status: 401 })
}
if (playerToken !== game.player1Token && playerToken !== game.player2Token) {
  return NextResponse.json({ error: "Invalid player token" }, { status: 401 })
}
// Identifier le joueur par son token
const isP1 = game.player1Token === playerToken
```
Ne JAMAIS accepter un coup sans token. Ne JAMAIS fallback sur l'adresse seule.
- Quand la partie se termine, appeler `executePayout()` de `src/lib/payout.ts` :
```typescript
const pot = game.betCrc * 2
const fee = Math.floor(pot * game.commissionPct / 100)
const winAmount = pot - fee
await executePayout({
  gameType: "{game}",
  gameId: `{game}-${id}-winner`,
  recipientAddress: winnerAddress,
  amountCrc: winAmount,
  reason: `{Game} ${id} — victoire, gain ${winAmount} CRC`,
})
```

### 4. Page Lobby — `src/app/{game}/page.tsx`
```
"use client"
- Formulaire "Creer une partie" avec input mise CRC
- Formulaire "Rejoindre" avec input ID (navigue direct vers /game/{id})
- Mode demo : router.push(`/{game}/DEMO-${random}`)
- Mode normal : POST /api/{game} avec { betCrc }, sessionStorage.setItem(`{game}_creator_${id}`, "1")
```

### 5. Page de jeu — `src/app/{game}/[id]/page.tsx`
Structure en 2 composants principaux :

#### `DemoGame` — jeu client-only vs bot (OBLIGATOIRE)
**Chaque nouveau jeu DOIT avoir un mode demo.** Pattern :
- Active quand `isDemo && id.startsWith("DEMO")`
- Pas d'appels API, tout en local
- Bot avec IA basique
- `addXp()` via `useDemo()` en fin de partie
- La page serveur `[id]/page.tsx` detecte les slugs `DEMO-*` et retourne une config fake (pas de query DB)
- La page hub/lobby redirige vers `/{game}/DEMO-slug` quand `isDemo` est true
- PnlCard a la fin de partie

#### `RealGame` — multijoueur avec paiement
**Section paiement** (quand status = waiting_p1 ou waiting_p2) :
Utiliser le composant `<GamePayment>` de `src/components/game-payment.tsx` qui gere automatiquement :
- Le mode Mini App (bouton direct via bridge postMessage)
- Le mode standalone (QR code + lien Gnosis App)
```
<GamePayment
  gameKey="{game}"
  game={game}
  playerToken={playerToken}
  isCreator={isCreator}
  onScanComplete={refreshGame}
/>
```

**Section adresse** (quand partie active, pas encore confirme) :
```
- Input "Votre adresse" avec bouton OK
- Necessaire pour savoir quel joueur on est
```

**Section jeu** :
```
- Afficher le plateau/grille du jeu
- Gerer les interactions (clic, etc.)
- Appeler les API de jeu (move, shot, etc.)
- Polling du game state toutes les 2s
```

**Section rematch** (ecran de fin, mode reel uniquement) :
```
import { RematchButton, RematchBanner } from "@/components/rematch-button"

// Apres la card de resultat (victoire/defaite), ajouter :
{game.status === "finished" && myAddress && (
  <div className="my-4">
    {game.rematchSlug ? (
      <RematchBanner gameKey="{game}" rematchSlug={game.rematchSlug} />
    ) : (
      <RematchButton gameKey="{game}" slug={game.slug} rematchSlug={game.rematchSlug} />
    )}
  </div>
)}
```
- Le schema DB DOIT inclure `rematchSlug: text("rematch_slug")` dans la table du jeu
- L'API `/api/rematch` gere tout (creation + patch de l'ancienne partie)
- Ne PAS ajouter de bouton "Rejouer" separé — la Revanche le remplace

**Section PNL Card** (ecran de fin, mode reel uniquement) :
```
import { PnlCard } from "@/components/pnl-card"

// Apres le rematch, avant le GamePayment :
{game.status === "finished" && myAddress && (() => {
  const iWon = game.winnerAddress?.toLowerCase() === myAddress.toLowerCase();
  const isDraw = !game.winnerAddress;
  const wAmount = game.betCrc * 2 * (1 - game.commissionPct / 100);
  const myProfile = profiles[myAddress.toLowerCase()];
  const oppAddr = game.player1Address?.toLowerCase() === myAddress.toLowerCase() ? game.player2Address : game.player1Address;
  const oppProfile = oppAddr ? profiles[oppAddr.toLowerCase()] : null;
  return (
    <PnlCard
      gameType="{game}"
      result={isDraw ? "draw" : iWon ? "win" : "loss"}
      betCrc={game.betCrc}
      gainCrc={isDraw ? 0 : iWon ? Math.round(wAmount - game.betCrc) : -game.betCrc}
      playerName={myProfile?.name}
      playerAvatar={myProfile?.imageUrl || undefined}
      opponentName={oppProfile?.name || (oppAddr ? shortenAddress(oppAddr) : undefined)}
      date={new Date().toLocaleDateString()}
      locale={locale}
    />
  );
})()}
```
La PnlCard genere une image PNG telechargeable/partageable avec le resultat du match. TOUJOURS l'inclure sur l'ecran de fin de chaque jeu multijoueur.

**Section test mode** (NODE_ENV === "development") :
```
- "Injecter joueurs" → POST /api/{game}/{id}/test
- "Passer au jeu" → POST /api/{game}/{id}/test?mode=skip
- Boutons J1/J2 pour switcher de joueur (toujours visibles)
```

**Race condition demo** : quand `id.startsWith("DEMO")` mais `isDemo` est encore `false` (hydratation), afficher un loader au lieu de "Partie introuvable".

### 6. i18n — `src/lib/i18n.ts`
**OBLIGATOIRE** : Ne JAMAIS hardcoder des textes dans les composants (`locale === "fr" ? "..." : "..."`). Toujours utiliser `translations.{game}[locale]`. Chaque nouveau jeu DOIT avoir sa section i18n complete.
Ajouter 2 sections dans `translations` :
```typescript
landing{Game}: { title, desc, action }  // pour la page d'accueil
{game}: {
  title, subtitle, create, createBtn, join, joinBtn, joinPlaceholder, joinError,
  waiting, shareId,
  // ... clefs specifiques au jeu ...
  // Clefs paiement OBLIGATOIRES :
  payToStart, payToJoin, waitingP2, payCrc, copyPayLink, inviteP2, copied,
  scanPayments, scanningPayments, yourAddress, enterAddress,
  // Clefs resultat :
  victory, defeat, yourTurn, opponentTurn,
}
```

### 7. Navigation
Ajouter une carte dans `src/app/multijoueur/page.tsx` avec icone et lien vers `/{game}`.

## Libs existantes a reutiliser
- `src/lib/circles.ts` → `generateGamePaymentLink()`, `checkAllNewPayments()`
- `src/lib/game-data.ts` → `encodeGameData()` / `decodeGameData()` (encode le type de jeu + ID dans la transaction)
- `src/lib/payout.ts` → `executePayout()` (paiement du gagnant via Safe + Roles Modifier)
- `src/components/demo-provider.tsx` → `useDemo()` pour `isDemo`, `addXp()`, `demoPlayer`
- `src/components/language-provider.tsx` → `useLocale()` pour FR/EN
- `src/components/theme-provider.tsx` → `useTheme()` pour dark mode
- `src/components/ui/button.tsx`, `card.tsx` → composants UI
- `src/components/rematch-button.tsx` → `RematchButton` + `RematchBanner` (bouton revanche en fin de partie)
- `src/components/miniapp-provider.tsx` → `useMiniApp()` pour detecter iframe Circles et payer direct
- `src/lib/miniapp-bridge.ts` → SDK postMessage (isMiniApp, sendCrcTransfer, etc.)

## Checklist
- [ ] Logique jeu dans `src/lib/{game}.ts`
- [ ] Schema DB dans `src/lib/db/schema/{game}.ts` + export dans schema.ts
- [ ] Table creee en DB
- [ ] API create/read dans `src/app/api/{game}/route.ts`
- [ ] API scan paiement dans `src/app/api/{game}-scan/route.ts`
- [ ] API test dans `src/app/api/{game}/[id]/test/route.ts`
- [ ] API actions de jeu (move, shot, etc.)
- [ ] Page lobby `src/app/{game}/page.tsx`
- [ ] Page jeu `src/app/{game}/[id]/page.tsx` avec demo + real + test mode
- [ ] i18n ajoutee dans `src/lib/i18n.ts`
- [ ] Navigation ajoutee dans multijoueur
- [ ] Payout au gagnant via `executePayout()`
- [ ] Bouton Rematch sur l'ecran de fin (RematchButton + RematchBanner)
- [ ] Colonne `rematch_slug` dans le schema DB
- [ ] Build passe sans erreur
