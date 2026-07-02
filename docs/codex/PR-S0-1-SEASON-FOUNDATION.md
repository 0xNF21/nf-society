# PR S0-1 - Season Zero Foundation

Status: draft brief
Branch: `codex/season-zero-foundation`
Owner decision: founder

## 1. Scope

Poser les fondations documentaires et DB de Season Zero sans ouvrir de nouveau
flux utilisateur ni admin dangereux.

Cette PR est volontairement mecanique: schema, migrations, documentation. Elle
ne lance pas la saison.

## 2. Pourquoi maintenant

Le WIP local Season Zero est deja large: pages publiques, admin, leaderboard,
snapshot, allocations, claims CRC. Le risque principal est de merger tout ce
travail en une seule PR impossible a reviewer.

Cette PR decoupe le premier morceau stable:

- la direction produit,
- les tables necessaires,
- les migrations add-only,
- le journal Drizzle.

## 3. Changements inclus

### Docs

- `docs/season-zero/SEASON-ZERO-DESIGN.md`
- `docs/codex/SEASON-ZERO-WIP-AUDIT-2026-07-02.md`
- `docs/codex/PR-S0-1-SEASON-FOUNDATION.md`

### DB schema

- `src/lib/db/schema/season.ts`
- export depuis `src/lib/db/schema/index.ts`

Tables ajoutees:

- `seasons`
- `season_games`
- `season_game_links`
- `season_match_results`
- `season_scores`
- `season_reward_allocations`
- `admin_audit_logs`

### Migrations

- `drizzle/0014_add_season_zero_snapshot_tables.sql`
- `drizzle/0015_add_season_reward_allocations.sql`
- `drizzle/0016_add_admin_audit_logs.sql`
- `drizzle/0017_add_season_game_links.sql`
- `drizzle/0018_add_season_draw_scoring.sql`
- `drizzle/meta/_journal.json`

## 4. Out of scope

Ne pas ajouter dans cette PR:

- pages publiques Season Zero,
- routes API Season Zero,
- admin Season Zero,
- snapshot/finalisation,
- claim CRC,
- payouts Season rewards,
- Telegram,
- Garage / Circles Boost,
- Arcade room/pet.

## 5. Risques

### Migration order

Les migrations sont add-only et idempotentes (`CREATE TABLE IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
Elles doivent quand meme etre relues avant prod parce que c'est le premier bloc
DB Season Zero.

### Table allocations creee tot

`season_reward_allocations` est creee dans cette PR, mais aucun endpoint de
claim n'est ajoute. Cela permet de figer le schema sans ouvrir de payout.

### Audit logs generiques

`admin_audit_logs` est inclus car les prochaines PR admin Season Zero en auront
besoin. Cette PR ne branche pas encore les actions admin.

## 6. Questions Codex

1. Le schema `season.ts` est-il coherent avec le design produit Season Zero ?
2. Les migrations sont-elles vraiment add-only / safe a appliquer avant les routes ?
3. Le journal Drizzle est-il coherent avec les migrations `0014` a `0018` ?
4. Faut-il sortir `season_reward_allocations` dans une PR ulterieure, ou est-ce OK de creer la table maintenant sans endpoint ?
5. Voyez-vous un risque a inclure `admin_audit_logs` dans la foundation ?

## 7. Test plan

- `npm run typecheck`
- `npm run db:check` si l'environnement Drizzle local le permet
- Review manuelle des migrations

## 8. Prochaine PR prevue

PR S0-2: public read-only Season Zero.

Inclura les pages et endpoints read-only:

- `/season-zero`
- `/season-zero/play`
- `/[seasonSlug]`
- leaderboard read-only
- bloc joueur "Moi dans cette saison"

Toujours sans claim CRC.
