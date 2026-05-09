# NF Society

Plateforme communautaire free-to-play du DAO NF Society sur Gnosis Chain
(Circles Protocol). Le rail de jeu actif est **Fragments** ; les CRC sont
reserves aux rewards explicites, remboursements et cashouts legacy.

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
    # Arcade chance : blackjack, coin-flip, crash-dash, dice, hilo, keno,
    #                 mines, plinko, roulette, loterie/loteries,
    #                 lootbox/lootboxes
    daily/       # Daily Fragments/XP + rewards CRC configurees
    shop/        # Boutique Fragments
    exchange/    # Echange CRC legacy / gouvernance
    chance/      # Hub arcade chance
    multijoueur/ # Hub des jeux multi
    admin/       # Dashboard admin (1873 l. — en dette)
    dashboard/   # Dashboard joueur
    dashboard-dao/ # Dashboard DAO / treasury
  components/    # Composants React (44 top-level + shadcn/ui)
    ui/          # shadcn/ui primitives (ne pas modifier)
    demo-provider.tsx    # Mode demo global (React Context)
    miniapp-provider.tsx # Contexte Mini App Circles (isMiniApp, sendPayment)
    free-play-start.tsx  # Lancement F2P via /api/{jeu}/start-free
    game-payment.tsx     # Paiement multijoueur legacy / real-stakes
    chance-payment.tsx   # Paiement chance legacy / real-stakes
    balance-pay-button.tsx # Bouton legacy "Payer depuis mon solde"
  lib/
    db/schema/        # Drizzle schema (51 tables, un fichier par domaine)
    fragments.ts      # Helpers Fragments (rail arcade F2P)
    wallet-fragments.ts # Debit/credit Fragments pour jouer
    circles.ts        # SDK Circles, liens paiement legacy, detection tx legacy
    payout.ts         # Payout source-aware (Fragments vs CRC)
    wallet.ts         # Balance/cashout CRC legacy
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

## Rail de jeu actuel : Fragments

Chaque jeu doit privilegier le parcours **Free-to-Play + Fragments** :

- aucune tx Gnosis pour lancer les jeux par defaut ;
- `POST /api/{jeu}/start-free` debite `players.fragments_balance` ;
- `src/lib/wallet-fragments.ts` cree les rows de jeu via le dispatcher existant ;
- `game_fragment_events` trace les debits/gains ;
- le `sourceTxHash` synthetique est `fragments:{eventId}` ;
- les gains de partie creditent des Fragments, jamais des CRC.

Les champs historiques `betCrc` restent dans beaucoup de schemas comme unite de
reference. En F2P, ils sont convertis en Fragments par `crcToFragments()`.

## Rails CRC legacy

Les anciens rails existent encore, mais ne sont plus le chemin produit normal :

- paiement direct on-chain via `/api/{jeu}-scan` ;
- balance CRC via `players.balance_crc` et `/api/wallet/pay-game` ;
- cashout legacy via `/api/wallet/cashout-init`.

Tout flux CRC de jeu doit rester derriere `LEGAL_MODE`, `real_stakes` et
`respondIfStakesDisabled(gameKey)`. Le cashout legacy reste ouvert pour les
joueurs qui avaient un solde avant le pivot.

## Les 2 modes d'interface (standalone vs Mini App)

Le projet detecte automatiquement (via `useMiniApp()`) s'il tourne :

### Mode A — Standalone (navigateur classique)
- L'utilisateur ouvre `nf-society.vercel.app` directement
- En F2P, les jeux se lancent avec Fragments sans QR de paiement
- Les QR / liens Gnosis App ne concernent que les rails CRC legacy ou explicitement reactives

### Mode B — Mini App Circles (iframe)
- Le projet tourne en iframe a l'interieur de l'app Circles/Gnosis
- En F2P, le contexte Mini App sert surtout a l'identite, au profil, aux rewards et au cashout legacy
- `sendPayment(recipient, amount, data)` ne doit etre utilise que pour un flux CRC autorise
- SDK : `src/lib/miniapp-bridge.ts` + `useMiniApp()` hook

**Regle** : ne pas afficher d'UI de paiement CRC pour lancer une partie F2P.
`<GamePayment>`, `<ChancePayment>` et `balance-pay-button` sont legacy /
real-stakes et doivent rester derriere les guards.

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
- `src/components/game-lobby.tsx` — Composant lobby reutilisable (participation, prive/public, rejoindre)
- `src/components/free-play-start.tsx` — Bouton de lancement F2P via Fragments
- `src/components/game-payment.tsx` — Composant paiement legacy / real-stakes (QR, scan, boutons)
- `src/hooks/use-player-token.ts` — Hook token joueur (localStorage + URL injection)
- `src/hooks/use-game-polling.ts` — Hook polling etat de jeu

### Checklist — Nouveau jeu multijoueur

1. **Logique jeu** : `src/lib/{jeu}.ts` (types, regles, fonctions pures)
2. **Schema DB** : `src/lib/db/schema/{jeu}.ts` avec colonnes communes. Les champs `betCrc`, `recipientAddress`, `player1/2TxHash`, `payoutTxHash` peuvent rester pour compat legacy, mais le rail F2P utilise `fragments:{eventId}` comme source.
3. **Export schema** : ajouter dans `src/lib/db/schema.ts`
4. **Enregistrer dans le registre** : ajouter une entree dans `GAME_REGISTRY` de `src/lib/game-registry.ts`
5. **i18n** : ajouter section `{jeu}` + `landing{Jeu}` dans `src/lib/i18n.ts`. Le wording public doit parler de participation/Fragments, pas de mise CRC.
6. **API create** : `src/app/api/{jeu}/route.ts` — POST appelle `createMultiplayerGame("{jeu}", body)`
7. **API start-free** : `src/app/api/{jeu}/start-free/route.ts` — POST appelle `payGameFromFragments(...)`
8. **API scan legacy** : `src/app/api/{jeu}-scan/route.ts` — POST appelle `scanGamePayments("{jeu}", slug)` et reste gate par `respondIfStakesDisabled`
9. **API actions** : `src/app/api/{jeu}/[slug]/route.ts` — GET + POST pour les moves (CUSTOM)
10. **Page lobby** : `src/app/{jeu}/page.tsx` — utilise `<GameLobby gameKey="{jeu}" />`
11. **Page jeu** : `src/app/{jeu}/[slug]/page.tsx` — utilise `usePlayerToken`, `useGamePolling` + UI custom ; paiement CRC uniquement si real-stakes est explicitement actif
12. **Feature flag** : ajouter dans la table `featureFlags`
13. **Migration DB** : creer la table en production
14. **Build** : verifier `npx tsc --noEmit`

Lobby, start-free, stats, admin = **automatique via le registre**. Le scan/paiement CRC est legacy.

## Framework Chance (jeux solo)

Le projet utilise un pattern pour les jeux de chance single-player (coin-flip, blackjack, hilo, mines...).

### Fichiers cles du framework chance
- `src/lib/game-registry.ts` — `CHANCE_REGISTRY` pour les jeux chance
- `src/components/free-play-start.tsx` — Bouton de lancement F2P via Fragments
- `src/components/chance-payment.tsx` — Composant paiement legacy / real-stakes (Mini App + QR)
- `src/components/pnl-card.tsx` — Carte resultat partageable
- `src/hooks/use-player-token.ts` — Token joueur (localStorage)
- `src/lib/wallet-fragments.ts` — Creation de rounds F2P + debits/gains Fragments
- `src/lib/payout.ts` — Payout source-aware (Fragments ou CRC autorise)
- `src/lib/circles.ts` — Detection paiement on-chain legacy (gameKeys ligne ~439)
- `src/lib/game-data.ts` — Encodage/decodage gameData dans les tx

### Pattern jeu interactif (type Hi-Lo, Mines)
- F2P : `start-free` debite des Fragments → cree la partie avec etat initial → actions serveur (reveal/cashout) → gain en Fragments
- Legacy CRC : scan on-chain possible uniquement si real-stakes est explicitement actif
- `gameState` stocke en JSONB dans la DB, mis a jour a chaque action
- `getVisibleState()` cache les infos sensibles (positions mines, deck) cote client
- `playerToken` verifie a chaque action (anti-triche)

### Checklist — Nouveau jeu chance

1. **Logique jeu** : `src/lib/{jeu}.ts` (types, regles, fonctions pures, crypto-secure RNG serveur, Math.random client/demo)
2. **Schema DB** : `src/lib/db/schema/{jeu}.ts` — {jeu}Tables (slug, betOptions, recipientAddress, colors, status) + {jeu}Rounds (playerAddress, transactionHash, betCrc, playerToken, gameState jsonb, status, outcome, payoutCrc, payoutStatus, payoutTxHash, errorMessage, createdAt, updatedAt). Les champs CRC restent compat legacy ; en F2P `transactionHash` doit etre `fragments:{eventId}`.
3. **Export schema** : ajouter dans `src/lib/db/schema.ts`
4. **Enregistrer** : ajouter dans `CHANCE_REGISTRY` de `src/lib/game-registry.ts`
5. **gameKeys** : ajouter `"{jeu}"` dans la liste gameKeys de `src/lib/circles.ts` (~ligne 439)
6. **i18n** : ajouter section `{jeu}` dans `src/lib/i18n.ts` + `{jeu}Title`/`{jeu}Desc` dans section `chance`
7. **API config** : `src/app/api/{jeu}/route.ts` — GET table config, POST creer table (admin)
8. **API start-free** : `src/app/api/{jeu}/start-free/route.ts` — POST appelle `payGameFromFragments(...)`
9. **API scan legacy** : `src/app/api/{jeu}-scan/route.ts` — scanner paiements CRC, creer partie, XP ; reste gate par `respondIfStakesDisabled`
10. **API active** : `src/app/api/{jeu}/active/route.ts` — restaurer session par token
11. **API actions** : `src/app/api/{jeu}/[id]/action/route.ts` — POST actions + payout via `executePayout()`
12. **Lobby page** : `src/app/{jeu}/page.tsx` — liste des tables actives depuis DB
13. **Server page** : `src/app/{jeu}/[slug]/page.tsx` — detection DEMO + query DB + passe au client
14. **Client component** : `src/components/{jeu}-page.tsx` — DemoGame (client-only) + RealGame (Fragments + polling + actions API)
15. **Chance hub** : ajouter carte dans `src/app/chance/page.tsx`
16. **Generer la migration** : `npm run db:generate -- --name add_{jeu}_tables`
    → drizzle-kit compare schema vs meta snapshot, ecrit `drizzle/NNNN_add_{jeu}_tables.sql` + met a jour le snapshot. Plus besoin de route API temporaire ni de script node manuel.
17. **Appliquer en local** : `npm run db:migrate` (utilise DATABASE_URL de `.env.local`)
18. **Appliquer sur Neon** : `npx vercel env pull .env.neon && DATABASE_URL=$(grep DATABASE_URL .env.neon | cut -d= -f2-) npm run db:migrate && rm .env.neon`
19. **Creer la table 'classic'** : POST sur `/api/{jeu}` avec `recipientAddress = SAFE_ADDRESS` (en local puis en prod via fetch sur nf-society.vercel.app)
20. **Build** : `npm run typecheck` puis `npm run build`
21. **Commit + push** : deploiement auto Vercel + migration deja appliquee sur Neon

### SAFE_ADDRESS (Relayer NF Society)
`0x960A0784640fD6581D221A56df1c60b65b5ebB6f` — utiliser comme recipientAddress pour les tables legacy/real-stakes. Les parties F2P utilisent Fragments.

## Liens de paiement Gnosis (legacy)

- Le parametre `data` dans l'URL Gnosis DOIT etre du **texte brut**, PAS du hex
- Format : `game:id:token` (ex: `morpion:K7PCE2:46bcdcd6`)
- `generateGamePaymentLink()` dans `src/lib/circles.ts` genere le lien correct
- `decodeGameData()` dans `src/lib/game-data.ts` supporte texte ET ancien JSON hex
- Doc : https://docs.aboutcircles.com/tutorials-and-examples/circles-x-gnosis-app-starter-kit

Ne pas utiliser ces liens pour lancer les parties F2P Fragments.

## Watch Out

- Les fichiers `public/` non-trackes par git ne sont pas visibles dans un worktree
- Les routes API necessitent la DB (`.env.local` avec DATABASE_URL)
- Le mode demo bypass tous les appels API — tester les deux modes (demo + normal)
- `translations.X` : verifier que la cle existe dans la bonne section de i18n.ts
- shadcn/ui dans `src/components/ui/` : ne pas modifier ces fichiers directement
- **DB Neon** : le `.env.local` pointe vers PostgreSQL local, Vercel utilise Neon (`.env.neon`). Les migrations doivent etre executees sur les DEUX
