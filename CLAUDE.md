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

## Watch Out

- Les fichiers `public/` non-trackes par git ne sont pas visibles dans un worktree
- Les routes API necessitent la DB (`.env.local` avec DATABASE_URL)
- Le mode demo bypass tous les appels API — tester les deux modes (demo + normal)
- `translations.X` : verifier que la cle existe dans la bonne section de i18n.ts
- shadcn/ui dans `src/components/ui/` : ne pas modifier ces fichiers directement
