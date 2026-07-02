# WIP local organization - 2026-07-02

## Etat

- Branche locale: `codex/cron`
- Base mise a jour sur `origin/master` commit `492a1d63`
- Typecheck: OK au dernier audit
- Le WIP local est large et ne doit pas etre merge en bloc.

## Buckets

### 1. NF Society actuel - a garder prioritaire

Concerne le pivot Fragments / arcade / auth / UI existante.

Fichiers typiques:
- `src/lib/payout.ts`
- `src/lib/wallet-fragments.ts`
- `src/lib/fragments-events.ts`
- `src/lib/auth/session.ts`
- `src/components/auth-provider.tsx`
- `src/components/profile-modal.tsx`
- `src/app/lobby/page.tsx`
- `src/components/game-lobby.tsx`

Point a corriger avant Season Zero:
- Ne pas marquer une reward CRC comme `claimed` au moment du broadcast.
- Attendre `payouts.status = 'success'` via reconciliation.

### 2. Season Zero - prochain vrai chantier NF Society

Concerne le produit competition / leaderboard / rewards.

Fichiers typiques:
- `docs/season-zero/*`
- `drizzle/0014_add_season_zero_snapshot_tables.sql` a `0018_add_season_draw_scoring.sql`
- `src/lib/season-zero.ts`
- `src/lib/season-rewards.ts`
- `src/app/api/season-zero/*`
- `src/app/api/seasons/*`
- `src/components/season-public-page.tsx`
- `src/components/season-launch-page.tsx`

Recommendation:
- Faire une PR Season Zero separee apres le fix reward/payout.
- Ne pas melanger avec Garage/Boost ni arcade room/pet.

### 3. Circles Boost / Garage - hors scope NF Society

Le produit final vit deja dans le repo separe:
- `https://github.com/0xNF21/crc-boost-market`

Dans ce repo NF Society, les fichiers Garage semblent etre un vieux WIP / une copie.

Fichiers typiques:
- `README.garage.md`
- `docs/garage-submission.md`
- `drizzle/0019_add_garage_referrals.sql` a `0024_add_garage_campaign_funding.sql`
- `src/app/api/garage/*`
- `src/app/garage/page.tsx`
- `src/components/circles-garage-page.tsx`
- `src/lib/garage-x.ts`
- `src/lib/garage-referral-rewards.ts`

Recommendation:
- Ne pas les inclure dans les PR NF Society.
- Les garder seulement si on decide explicitement de reimporter Boost dans NF Society.

### 4. Arcade room / pet - standby

Projet mis en pause pour l'instant.

Fichiers typiques:
- `public/arcade/*`
- `scripts/blender/*`
- `SESSION-RECAP-2026-05-04-NF-ARCADE.md`

Recommendation:
- Ne pas commit dans les PR Season Zero.
- Reprendre plus tard dans une branche dediee.

### 5. Local-only / hygiene

Artefacts locaux a ne pas commit:
- logs dev
- profils Chrome
- caches Python
- fichiers temporaires agent

`.gitignore` a ete ajuste pour masquer une partie de ces fichiers sans les supprimer.

## Ordre conseille

1. PR hygiene minimale: `.gitignore` seulement, si on veut nettoyer le status.
2. PR fix Season reward payout status: `claimed` uniquement apres confirmation on-chain.
3. PR Season Zero docs/schema minimal.
4. PR Season Zero UI/API.
5. Arcade room/pet plus tard, branche dediee.
