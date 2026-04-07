# NF Society

Plateforme communautaire du DAO NF Society sur Gnosis Chain (Circles Protocol).

## Commands

```bash
npm run dev     # Dev server (Next.js, port 3000)
npm run build   # Production build
npm run lint    # ESLint
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
- `src/lib/multiplayer.ts` — Helpers serveur (createMultiplayerGame, scanGamePayments, getLobbyGames, getPlayerStats)
- `src/components/game-lobby.tsx` — Composant lobby reutilisable (mise, prive/public, rejoindre)
- `src/components/game-payment.tsx` — Composant paiement reutilisable (QR, scan, boutons)
- `src/hooks/use-player-token.ts` — Hook token joueur (localStorage + URL injection)
- `src/hooks/use-game-polling.ts` — Hook polling etat de jeu

### Checklist — Nouveau jeu multijoueur

1. **Logique jeu** : `src/lib/{jeu}.ts` (types, regles, fonctions pures)
2. **Schema DB** : `src/lib/db/schema/{jeu}.ts` avec colonnes communes (slug, betCrc, recipientAddress, commissionPct, player1/2Address, player1/2TxHash, player1/2Token, isPrivate, status, winnerAddress, payoutStatus, payoutTxHash, createdAt, updatedAt) + colonnes specifiques
3. **Export schema** : ajouter dans `src/lib/db/schema.ts`
4. **Enregistrer dans le registre** : ajouter une entree dans `GAME_REGISTRY` de `src/lib/game-registry.ts`
5. **i18n** : ajouter section `{jeu}` + `landing{Jeu}` dans `src/lib/i18n.ts` (cles lobby standardisees : back, title, subtitle, createGame, betPerPlayer, crcPerPlayer, winnerGets, commission, creating, createBtn, joinGame, gameCode, join, payToStart, payToJoin, payCrc, copied, copyPayLink, inviteP2, scanningPayments, scanPayments)
6. **API create** : `src/app/api/{jeu}/route.ts` — POST appelle `createMultiplayerGame("{jeu}", body)`
7. **API scan** : `src/app/api/{jeu}-scan/route.ts` — POST appelle `scanGamePayments("{jeu}", slug)`
8. **API actions** : `src/app/api/{jeu}/[slug]/route.ts` — GET + POST pour les moves (CUSTOM)
9. **Page lobby** : `src/app/{jeu}/page.tsx` — utilise `<GameLobby gameKey="{jeu}" />`
10. **Page jeu** : `src/app/{jeu}/[slug]/page.tsx` — utilise `<GamePayment>`, `usePlayerToken`, `useGamePolling` + UI custom
11. **Feature flag** : ajouter dans la table `featureFlags`
12. **Migration DB** : creer la table en production
13. **Build** : verifier `npx tsc --noEmit`

Lobby, paiement, scan, stats, admin = **automatique via le registre**.

## Watch Out

- Les fichiers `public/` non-trackes par git ne sont pas visibles dans un worktree
- Les routes API necessitent la DB (`.env.local` avec DATABASE_URL)
- Le mode demo bypass tous les appels API — tester les deux modes (demo + normal)
- `translations.X` : verifier que la cle existe dans la bonne section de i18n.ts
- shadcn/ui dans `src/components/ui/` : ne pas modifier ces fichiers directement
