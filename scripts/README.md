# Scripts — Ops & Diagnostics

Scripts Node (`.mjs`) pour migrations, diagnostics et réparations. Tous lisent leur config depuis `.env.local` par défaut, `.env.neon` pour la prod (à puller via `npx vercel env pull .env.neon --environment=production`).

## Migrations

| Script | Usage |
|---|---|
| `init-bot-nonce.mjs` | Bootstrap `bot_state` avec le nonce on-chain courant. À run **1 fois par env** (local + Neon). |
| `migrate-nf-auth.mjs` | Crée la table `nf_auth_tokens` (Phase 2 recovery). `node scripts/migrate-nf-auth.mjs --neon` pour prod. |
| `migrate-hilo.mjs`, `migrate-support.mjs` | Migrations jeux spécifiques. |

## Diagnostics

| Script | Ce qu'il affiche |
|---|---|
| `check-bot-nonce.mjs [envFile]` | Compare `bot_state.last_nonce` (local/Neon) vs on-chain `latest`/`pending`. Detecte la dérive. |
| `check-nf-auth.mjs [envFile]` | Colonnes + indexes + row count de `nf_auth_tokens`. |
| `check-payouts-schema.mjs [envFile]` | Type de `payouts.amount_crc` + 5 derniers payouts. |
| `compare-crc-columns.mjs` | Diff de tous les `*_crc` entre local et Neon. Utile pour repérer les migrations oubliées. |
| `check-tx.mjs <txHash>` | Receipt Gnosis d'une tx (block, status, gas). |

## Réparations (one-shots)

| Script | Scénario |
|---|---|
| `resync-and-retry-nf-auth.mjs [envFile]` | Dérive de nonce : resync `bot_state` depuis on-chain, reset attempts sur les `nf_auth_refund` failed, retry via `/api/payout/retry`. |
| `fix-payouts-column-local.mjs` | Schema drift `payouts.amount_crc` integer→real en local + retrigger les roulette rounds orphelins (failed sans ligne payouts). |
| `repair-failed-payouts.mjs` | Reset + retry de payouts par ID (hardcoded 63, 64 — à adapter). |
| `list-failed-payouts.mjs` | Liste les payouts `failed` sur Neon. |

## Tests d'intégration

| Script | Ce qu'il teste |
|---|---|
| `test-auto-resync.mjs <recipient>` | Drift artificiel du nonce, insert payout test, trigger retry → vérifie que le fix auto-resync de `src/lib/payout.ts` kick in. Coûte 1 CRC (envoyé à l'adresse recipient). |

## Drifts connus entre `.env.local` et Neon

À traiter au cas par cas :

- **Vercel prod et dev local partagent `BOT_PRIVATE_KEY`** → les deux `bot_state.last_nonce` divergent. Le fix auto-resync (dans `payout.ts`) gère ça, mais `check-bot-nonce.mjs` permet de visualiser la dérive.
- **Les colonnes `*_crc` peuvent ne pas avoir le même type** (ex. `integer` local vs `real` Neon) si une migration a été appliquée uniquement sur Neon. `compare-crc-columns.mjs` liste toutes les divergences.
- **Certaines tables n'existent qu'en prod** (ex. `dice_rounds` manquait en local à un moment). Le dev peut se contenter de créer les tables à la demande via les routes `/api/{game}` ou via des scripts dédiés.

## Convention

- Les scripts utilisent un parser `.env` inline (pas de dep `dotenv` pour éviter l'install).
- SSL activé automatiquement dès que l'URL ne contient pas `localhost`.
- Les scripts qui hit le dev server attendent `npm run dev` sur `http://localhost:3000` et `ADMIN_PASSWORD` dans `.env.local`.
