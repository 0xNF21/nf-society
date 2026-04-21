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
    api/         # Routes API (POST/GET, DB operations)
    morpion/     # Jeu morpion (tic-tac-toe avec paris CRC)
    memory/      # Jeu memory (matching cards avec paris CRC)
    shop/        # Boutique XP
    chance/      # Loteries, lootboxes, daily
  components/    # React components
    ui/          # shadcn/ui primitives (ne pas modifier)
    demo-provider.tsx  # Mode demo global (React Context)
    demo-banner.tsx    # Bandeau demo
  lib/           # Utilitaires
    db/          # Schema Drizzle + connexion PostgreSQL
    circles.ts   # SDK Circles, generation liens paiement
    i18n.ts      # Traductions FR/EN
    xp.ts        # Systeme XP, levels, rewards
    payout.ts    # Paiements automatiques
```

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
