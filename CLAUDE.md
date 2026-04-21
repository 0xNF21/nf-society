# NF Society

Plateforme communautaire du DAO NF Society sur Gnosis Chain (Circles Protocol).

## Commands

```bash
npm run dev          # Dev server (Next.js, port 3000)
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit

npm run db:generate  # Generate a migration from a schema change
npm run db:migrate   # Apply pending migrations to DATABASE_URL
npm run db:push      # Sync schema directly (dev only, skips migration files)
npm run db:studio    # Browse the DB via drizzle-kit studio
npm run db:check     # Validate migrations + snapshots consistency
```

## Stack

- Next.js 14 (App Router) + TypeScript
- PostgreSQL via Drizzle ORM (`src/lib/db/`)
- Circles Protocol SDK (`@aboutcircles/sdk`) — CRC tokens on Gnosis Chain
- Tailwind CSS + shadcn/ui (`src/components/ui/`)
- i18n maison FR/EN via React Context (`src/lib/i18n.ts`)
- Ethers.js + Viem pour les interactions blockchain

## Architecture

```
src/
  app/           # Pages + API routes (Next.js App Router)
    api/         # 130+ routes API (POST/GET, DB operations)
    # 17 jeux, chacun avec son lobby + sa page de jeu :
    # Multijoueur : morpion, memory, dames, pfc, relics, crc-races
    # Chance/casino : blackjack, coin-flip, crash-dash, dice, hilo, keno,
    #                 mines, plinko, roulette, loterie/loteries,
    #                 lootbox/lootboxes
    daily/       # Daily scratch + spin + jackpot
    shop/        # Boutique XP
    exchange/    # Echange CRC (on-chain direct, pas d'API)
    chance/      # Hub des jeux chance
    multijoueur/ # Hub des jeux multi
    admin/       # Dashboard admin (1873 l. — en dette)
    dashboard/   # Dashboard joueur
    dashboard-dao/ # Dashboard DAO / treasury
  components/    # Composants React (44 top-level + shadcn/ui)
    ui/          # shadcn/ui primitives (ne pas modifier)
    demo-provider.tsx    # Mode demo global (React Context)
    miniapp-provider.tsx # Contexte Mini App Circles (isMiniApp, sendPayment)
    game-payment.tsx     # Paiement multijoueur (QR + Mini App)
    chance-payment.tsx   # Paiement chance (QR + Mini App)
    balance-pay-button.tsx # Bouton "Payer depuis mon solde" (balance system)
  lib/
    db/schema/        # Drizzle schema (51 tables, un fichier par domaine)
    circles.ts        # SDK Circles, generation liens paiement, detection tx
    payout.ts         # Payout via Gnosis Safe + Zodiac Roles Modifier
    wallet.ts         # Balance system : top-up, debit, credit, cashout
    wallet-ledger.ts  # Helpers append-only pour wallet_ledger
    wallet-game-dispatch.ts # Routing balance-pay par jeu
    rate-limit.ts     # Rate limiter Upstash + fallback in-memory
    admin-auth.ts     # Helper d'auth admin partage (checkAdminAuth)
    validation.ts     # Regex Ethereum address + autres validateurs
    i18n.ts           # Traductions FR/EN
    miniapp-bridge.ts # SDK postMessage pour Mini App Circles
    xp.ts             # Systeme XP, levels, rewards
    badges.ts         # Systeme de badges
    telegram/         # Bot Telegram (grammy) — support messages
```

## Les 2 modes de paiement

Chaque jeu peut etre paye de deux facons :

### Mode 1 — Paiement direct on-chain (original)
- 1 transaction Gnosis par partie depuis le wallet Circles du joueur
- Le serveur poll la blockchain pour detecter la tx
- Plus lent + frais de gas, mais 100% on-chain auditable

### Mode 2 — Balance system (Phase 3, recommande)
- Le joueur depose ses CRC en une fois dans la Safe NF Society (top-up)
- `players.balance_crc` est credite, `wallet_ledger` enregistre la tx
- Chaque partie suivante debite le solde DB (`POST /api/wallet/pay-game`), **zero tx on-chain**
- Cashout a tout moment via `POST /api/wallet/cashout-init` → Safe renvoie les CRC

**Important** — ce n'est **pas un wallet custodial** au sens Coinbase : on ne gere pas les cles du joueur. Le solde est une simple ecriture comptable off-chain adossee 1:1 aux CRC detenus dans la Safe. L'invariant `sum(players.balance_crc) ≈ Safe_onchain_balance` est check par `/api/admin/wallet-health`.

## Les 2 modes d'interface (standalone vs Mini App)

Le projet detecte automatiquement (via `useMiniApp()`) s'il tourne :

### Mode A — Standalone (navigateur classique)
- L'utilisateur ouvre `nf-society.vercel.app` directement
- Paiement : affichage d'un QR code + lien Gnosis App (deep link)
- Cross-device : scan sur desktop, signature sur mobile
- Gere dans `game-payment.tsx` / `chance-payment.tsx` via `qrcode` lib

### Mode B — Mini App Circles (iframe)
- Le projet tourne en iframe a l'interieur de l'app Circles/Gnosis
- Paiement : bouton natif → `sendPayment(recipient, amount, data)` via `postMessage` bridge
- Signature 1-tap, pas de QR
- SDK : `src/lib/miniapp-bridge.ts` + `useMiniApp()` hook

**Regle** : ne jamais generer le QR code en mode Mini App. Toujours utiliser `<GamePayment>` / `<ChancePayment>` qui gerent les deux cas automatiquement.

## Conventions

- Toujours repondre en francais
- i18n : toutes les strings UI dans `src/lib/i18n.ts`, jamais en dur
- Composants : `"use client"` en haut de chaque composant interactif
- API routes : retournent `NextResponse.json({ ... })` avec gestion d'erreur
- Imports : utiliser `@/` (alias src/)
- UI : Tailwind classes, couleurs projet `marine` (#251B9F), `citrus`, `ink`
- Mode demo : utiliser `useDemo()` hook, jamais d'appels API quand `isDemo === true`

## CRITICAL — Worktree vs Main Repo

**Le projet peut avoir un git worktree dans `.claude/worktrees/`.**
**Le repo principal est `C:\Projects\NF-SOCIETY`.**

- Le dev server DOIT tourner depuis le repo principal, PAS depuis le worktree
- Les fichiers `public/` (images, assets) ne sont QUE dans le repo principal
- Le `.env.local` (config DB) est QUE dans le repo principal
- Si tu edites un fichier, verifie TOUJOURS que tu edites dans le bon dossier
- NE JAMAIS travailler dans le worktree sans synchroniser vers le main repo
- En cas de doute : le chemin CORRECT est `C:\Projects\NF-SOCIETY/src/...`

## Framework Multiplayer

Le projet utilise un framework generique pour les jeux multijoueurs.

### Fichiers cles du framework
- `src/lib/game-registry.ts` — Registre central de tous les jeux (config, table DB, routes, couleurs)
- `src/lib/multiplayer.ts` — Helpers serveur (createMultiplayerGame, scanGamePayments, calculateWinAmount, getLobbyGames, getPlayerStats)
- `src/components/game-lobby.tsx` — Composant lobby reutilisable (mise, prive/public, rejoindre)
- `src/components/game-payment.tsx` — Composant paiement reutilisable (QR, scan, boutons)
- `src/hooks/use-player-token.ts` — Hook token joueur (localStorage + URL injection)
- `src/hooks/use-game-polling.ts` — Hook polling etat de jeu

### Checklist — Nouveau jeu multijoueur

1. **Logique jeu** : `src/lib/{jeu}.ts` (types, regles, fonctions pures)
2. **Schema DB** : `src/lib/db/schema/{jeu}.ts` avec colonnes communes (slug, betCrc, recipientAddress, commissionPct, player1/2Address, player1/2TxHash, player1/2Token, isPrivate, status, winnerAddress, payoutStatus, payoutTxHash, createdAt, updatedAt) + colonnes specifiques
3. **Export schema** : ajouter dans `src/lib/db/schema.ts`
4. **Enregistrer dans le registre** : ajouter une entree dans `GAME_REGISTRY` de `src/lib/game-registry.ts`
5. **i18n** : ajouter section `{jeu}` + `landing{Jeu}` dans `src/lib/i18n.ts` (cles lobby standardisees : back, title, subtitle, createGame, betPerPlayer, crcPerPlayer, winnerGets, commission, creating, createBtn, joinGame, gameCode, join, payToStart, payToJoin, payCrc, copied, copyPayLink, inviteP2, scanningPayments, scanPayments, **rules** — texte multi-lignes avec \n, **bold** et - bullets)
6. **API create** : `src/app/api/{jeu}/route.ts` — POST appelle `createMultiplayerGame("{jeu}", body)`
7. **API scan** : `src/app/api/{jeu}-scan/route.ts` — POST appelle `scanGamePayments("{jeu}", slug)`
8. **API actions** : `src/app/api/{jeu}/[slug]/route.ts` — GET + POST pour les moves (CUSTOM)
9. **Page lobby** : `src/app/{jeu}/page.tsx` — utilise `<GameLobby gameKey="{jeu}" />`
10. **Page jeu** : `src/app/{jeu}/[slug]/page.tsx` — utilise `<GamePayment>`, `usePlayerToken`, `useGamePolling` + UI custom
11. **Feature flag** : ajouter dans la table `featureFlags`
12. **Migration DB** : creer la table en production
13. **Build** : verifier `npx tsc --noEmit`

Lobby, paiement, scan, stats, admin = **automatique via le registre**.

## Framework Chance (jeux solo)

Le projet utilise un pattern pour les jeux de chance single-player (coin-flip, blackjack, hilo, mines...).

### Fichiers cles du framework chance
- `src/lib/game-registry.ts` — `CHANCE_REGISTRY` pour les jeux chance
- `src/components/chance-payment.tsx` — Composant paiement reutilisable (Mini App + QR)
- `src/components/pnl-card.tsx` — Carte resultat partageable
- `src/hooks/use-player-token.ts` — Token joueur (localStorage)
- `src/lib/payout.ts` — Paiement automatique via Safe + Roles Modifier
- `src/lib/circles.ts` — Detection paiement on-chain (gameKeys ligne ~439)
- `src/lib/game-data.ts` — Encodage/decodage gameData dans les tx

### Pattern jeu interactif (type Hi-Lo, Mines)
- Paiement CRC → scan cree la partie avec etat initial → actions serveur (reveal/cashout) → payout au cashout
- `gameState` stocke en JSONB dans la DB, mis a jour a chaque action
- `getVisibleState()` cache les infos sensibles (positions mines, deck) cote client
- `playerToken` verifie a chaque action (anti-triche)

### Checklist — Nouveau jeu chance

1. **Logique jeu** : `src/lib/{jeu}.ts` (types, regles, fonctions pures, crypto-secure RNG serveur, Math.random client/demo)
2. **Schema DB** : `src/lib/db/schema/{jeu}.ts` — {jeu}Tables (slug, betOptions, recipientAddress, colors, status) + {jeu}Rounds (playerAddress, transactionHash, betCrc, playerToken, gameState jsonb, status, outcome, payoutCrc, payoutStatus, payoutTxHash, errorMessage, createdAt, updatedAt)
3. **Export schema** : ajouter dans `src/lib/db/schema.ts`
4. **Enregistrer** : ajouter dans `CHANCE_REGISTRY` de `src/lib/game-registry.ts`
5. **gameKeys** : ajouter `"{jeu}"` dans la liste gameKeys de `src/lib/circles.ts` (~ligne 439)
6. **i18n** : ajouter section `{jeu}` dans `src/lib/i18n.ts` + `{jeu}Title`/`{jeu}Desc` dans section `chance`
7. **API config** : `src/app/api/{jeu}/route.ts` — GET table config, POST creer table (admin)
8. **API scan** : `src/app/api/{jeu}-scan/route.ts` — scanner paiements, creer partie, XP
9. **API active** : `src/app/api/{jeu}/active/route.ts` — restaurer session par token
10. **API actions** : `src/app/api/{jeu}/[id]/action/route.ts` — POST actions + payout via `executePayout()`
11. **Lobby page** : `src/app/{jeu}/page.tsx` — liste des tables actives depuis DB
12. **Server page** : `src/app/{jeu}/[slug]/page.tsx` — detection DEMO + query DB + passe au client
13. **Client component** : `src/components/{jeu}-page.tsx` — DemoGame (client-only) + RealGame (paiement + polling + actions API)
14. **Chance hub** : ajouter carte dans `src/app/chance/page.tsx`
15. **Generer la migration** : `npm run db:generate -- --name add_{jeu}_tables`
    → drizzle-kit compare schema vs meta snapshot, ecrit `drizzle/NNNN_add_{jeu}_tables.sql` + met a jour le snapshot. Plus besoin de route API temporaire ni de script node manuel.
16. **Appliquer en local** : `npm run db:migrate` (utilise DATABASE_URL de `.env.local`)
17. **Appliquer sur Neon** : `npx vercel env pull .env.neon && DATABASE_URL=$(grep DATABASE_URL .env.neon | cut -d= -f2-) npm run db:migrate && rm .env.neon`
18. **Creer la table 'classic'** : POST sur `/api/{jeu}` avec `recipientAddress = SAFE_ADDRESS` (en local puis en prod via fetch sur nf-society.vercel.app)
19. **Build** : `npm run typecheck` puis `npm run build`
20. **Commit + push** : deploiement auto Vercel + migration deja appliquee sur Neon

### SAFE_ADDRESS (Relayer NF Society)
`0x960A0784640fD6581D221A56df1c60b65b5ebB6f` — utiliser comme recipientAddress pour tous les jeux.

## Liens de paiement Gnosis

- Le parametre `data` dans l'URL Gnosis DOIT etre du **texte brut**, PAS du hex
- Format : `game:id:token` (ex: `morpion:K7PCE2:46bcdcd6`)
- `generateGamePaymentLink()` dans `src/lib/circles.ts` genere le lien correct
- `decodeGameData()` dans `src/lib/game-data.ts` supporte texte ET ancien JSON hex
- Doc : https://docs.aboutcircles.com/tutorials-and-examples/circles-x-gnosis-app-starter-kit

## Watch Out

- Les fichiers `public/` non-trackes par git ne sont pas visibles dans un worktree
- Les routes API necessitent la DB (`.env.local` avec DATABASE_URL)
- Le mode demo bypass tous les appels API — tester les deux modes (demo + normal)
- `translations.X` : verifier que la cle existe dans la bonne section de i18n.ts
- shadcn/ui dans `src/components/ui/` : ne pas modifier ces fichiers directement
- **DB Neon** : le `.env.local` pointe vers PostgreSQL local, Vercel utilise Neon (`.env.neon`). Les migrations doivent etre executees sur les DEUX
