# Season Zero WIP Audit - 2026-07-02

Status: local WIP audit, not a merge plan yet.
Owner decision: founder.

## Verdict court

Season Zero n'est pas juste une idee. Le WIP local contient deja une grosse
implementation produit: design, schema DB, admin, page publique, leaderboard,
snapshot, finalisation, allocations et claims CRC apres review.

Le bon prochain mouvement n'est pas d'ajouter une feature. C'est de decouper ce
WIP en PR propres, dans un ordre qui limite le risque prod.

## Produit actuel

Le design produit est coherent avec le pivot legal:

- Saison courte de skill.
- Jeux rewardes: Dames, Relics, Memory.
- Jeux hors rewards CRC: Morpion, PFC, CRC Races, chance games.
- Score en points simples, pas d'Elo en v0.
- Pool DAO annonce avant lancement.
- Rewards CRC seulement apres snapshot + review anti-cheat.
- Claim par allocation finale, pas de payout instantane par partie.

Cette direction est bonne pour un MVP defendable: simple a expliquer,
auditable, et separee des anciens rails de mise.

## Ce qui existe dans le WIP

### Docs

- `docs/season-zero/SEASON-ZERO-DESIGN.md`
- `docs/season-zero/roadmap.md`
- `docs/season-zero/validation-log.md`
- `docs/season-zero/validation-environments.md`
- `docs/season-zero/incident-plan.md`
- `docs/season-zero/ideas-backlog.md`

### Schema / migrations

- `src/lib/db/schema/season.ts`
- `drizzle/0014_add_season_zero_snapshot_tables.sql`
- `drizzle/0015_add_season_reward_allocations.sql`
- `drizzle/0017_add_season_game_links.sql`
- `drizzle/0018_add_season_draw_scoring.sql`

Tables principales:

- `seasons`
- `season_games`
- `season_game_links`
- `season_match_results`
- `season_scores`
- `season_reward_allocations`
- `admin_audit_logs`

### Backend

- `src/lib/season-zero.ts`
- `src/lib/season-zero-config.ts`
- `src/lib/season-rewards.ts`
- Routes publiques `src/app/api/season-zero/*`
- Routes generiques `src/app/api/seasons/[slug]/*`
- Routes admin `src/app/api/admin/season-zero/*`
- Routes admin multi-saison `src/app/api/admin/seasons/*`

### Frontend

- `src/app/season-zero/page.tsx`
- `src/app/season-zero/play/page.tsx`
- `src/app/[seasonSlug]/page.tsx`
- `src/components/season-launch-page.tsx`
- `src/components/season-public-page.tsx`
- `src/app/admin/tabs/seasons-tab.tsx`

## Fix applique aujourd'hui

Bug corrige dans le WIP:

Avant:

- claim reward -> `executePayout`
- si la transaction etait seulement broadcast (`sending`), l'allocation passait
  deja en `claimed`

Probleme:

- `claimed` disait "confirme", alors que la tx pouvait encore echouer on-chain.
- L'audit trail et l'UI pouvaient mentir.

Apres:

- `sending` / `already_sending` garde l'allocation en `claiming`.
- `claimed` est reserve aux payouts confirmes.
- Le cron `payouts-monitor` reconcilie les allocations `claiming` avec
  `payouts.status`.
- Si payout success: allocation -> `claimed`.
- Si payout failed: allocation -> `claimable`.

Typecheck: OK.

## Risques principaux

### 1. WIP trop gros pour une seule PR

Le WIP melange:

- produit Season Zero,
- schema DB,
- admin dangereux,
- pages publiques,
- claims CRC,
- Telegram,
- anciens morceaux Garage/Boost,
- assets Arcade/room/pet.

Tout merger ensemble serait difficile a reviewer et trop risqué.

### 2. Migrations a verifier avant prod

Les migrations saison sont idempotentes en grande partie, mais elles doivent etre
revues comme un vrai lot DB:

- ordre journal Drizzle,
- colonnes deja existantes ou non,
- compatibilite avec les tables prod,
- rollback add-only si possible.

### 3. Claims CRC a isoler

Le claim reward est la partie la plus sensible car il touche la Safe et les
payouts on-chain.

Il ne doit pas etre dans la premiere PR Season Zero. Il doit arriver apres:

- schema stable,
- leaderboard stable,
- snapshot/finalisation reviewes,
- tests sur preview.

### 4. Validation log a traiter comme historique WIP

Le fichier `validation-log.md` contient beaucoup de lignes "valide prod".
Comme ces fichiers sont dans un WIP local, il faut les traiter comme notes de
session, pas comme preuve officielle tant que les commits correspondants ne sont
pas sur `master`.

### 5. Garage/Boost hors scope NF Society

Le projet Circles Boost existe separement sur GitHub:

- `0xNF21/crc-boost-market`

Donc les fichiers `garage` dans ce repo NF Society doivent rester hors PR Season
Zero, sauf decision explicite du founder.

## Decoupage recommande

### PR S0-1 - Foundation DB + docs

But: poser les fondations sans ouvrir de flux dangereux.

Inclure:

- docs Season Zero nettoyees,
- schema Drizzle `season.ts`,
- migrations `0014`, `0017`, `0018`,
- peut-etre `0015` si on accepte de creer la table allocations tot.

Exclure:

- UI publique complexe,
- admin actions dangereuses,
- claim payout,
- Telegram,
- Garage/Boost,
- Arcade room/pet.

### PR S0-2 - Public read-only season

But: afficher la saison sans action irreversible.

Inclure:

- `/season-zero`,
- `/season-zero/play`,
- `/[seasonSlug]`,
- leaderboard read-only,
- bloc "Moi dans cette saison",
- API read-only `/api/seasons/[slug]/leaderboard`, `/me`, `/beta`.

Exclure:

- snapshot,
- finalisation,
- claim CRC.

### PR S0-3 - Admin lifecycle

But: permettre au founder de configurer, snapshotter et reviewer.

Inclure:

- admin season tab,
- config jeux/rules,
- beta allowlist,
- snapshot review,
- export,
- audit logs,
- confirmations fortes.

Exclure:

- claim public CRC si pas encore teste.

### PR S0-4 - Rewards claim

But: ouvrir les allocations claimables apres finalisation.

Inclure:

- `season_reward_allocations`,
- `claimSeasonReward`,
- route reward,
- UI claim,
- reconciliation cron,
- smokes payout sur preview/prod controlee.

Cette PR doit avoir une review Codex stricte, comme PR #45 / PR #52.

## Prochaine action recommandee

Ne pas coder plus de produit maintenant.

Faire une branche propre depuis `master` et extraire seulement PR S0-1:

1. docs Season Zero minimales,
2. schema/migrations foundation,
3. aucun endpoint payout,
4. typecheck,
5. review Codex.

Une fois S0-1 mergee, on avance vers la page publique read-only.
