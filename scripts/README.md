# `scripts/` — utilities, diagnostics, tests

Tous les scripts ad-hoc du projet, rangés par usage. Ne pas confondre avec
`drizzle/` (migrations SQL versionnées, gérées par drizzle-kit depuis PR #11).

## Arborescence

```
scripts/
├── diagnostics/        # "quel est l'état de X ?" — à lancer pour debug
├── smoke/              # tests d'intégration manuels (appellent les API)
├── seed/               # population initiale de la DB (badges, shop items)
├── ops/                # opérations récurrentes légitimes
└── archive/            # scripts historiques, obsolètes — ne pas relancer
```

## diagnostics/

Lecture-seule sur la DB et la blockchain. Utile quand quelque chose ne
marche pas en prod ou en dev. Tous sans side effect.

| Script | À quoi ça sert |
|--------|----------------|
| `check-bot-nonce.mjs [.env.local\|.env.neon]` | Compare `bot_state.last_nonce` vs le nonce on-chain. Détecte les dérives. |
| `check-nf-auth.mjs` | État de la table `nf_auth_tokens` (schéma, indexes, row count). |
| `check-payouts-schema.mjs` | Type de `payouts.amount_crc` + les 5 derniers payouts. |
| `check-treasury-state.mjs` | Audit du row DAO treasury (balance + ledger). |
| `check-tx.mjs <hash>` | Fetch une tx Gnosis par son hash (block, status, gas). |
| `check-wallet-drift.mjs` | Compare `sum(ledger)` vs `players.balance_crc` par adresse. |
| `check-wallet-invariant.mjs` | Total balances joueurs + treasury vs solde on-chain de la Safe. |
| `check-wallet-state.mjs <address>` | Snapshot complet d'un joueur (balance, XP, ledger récent). |
| `compare-crc-columns.mjs` | Diff des colonnes `*_crc` entre local et Neon. |
| `debug-wallet-scan.mjs` | Trigger `/api/wallet/topup-scan` + inspect tx récentes. |
| `list-failed-payouts.mjs` | Liste des `payouts` en status `failed` sur Neon. |

## smoke/

Tests d'intégration manuels. Chacun attend que `npm run dev` tourne et
appelle les vraies API. Pas de mock.

| Script | Scope |
|--------|-------|
| `smoke-wallet.mjs` | Routes wallet Phase 3a (balance, topup-scan, pay-game). |
| `smoke-pay-game.mjs` | POST /api/wallet/pay-game avec edge cases. |
| `smoke-lottery-daily.mjs` | Flow balance-pay sur lottery et daily. |
| `smoke-cashout.mjs` | Routes cashout-init + cashout-status. |
| `smoke-credit-prize.ts` | Flow creditPrize + miroir treasury. |
| `test-auto-resync.mjs` | Fait dériver le nonce bot, vérifie l'auto-resync + rediffuse la tx. |

## seed/

Population initiale de la DB. À lancer **une fois** sur une base fresh.

| Script | Résultat |
|--------|----------|
| `seed-badges.js` | Insère toutes les définitions de badges (achievement, activity, event, secret). |
| `seed-shop.ts` | Insère les items de la boutique XP (refunds, boosts, protection, CRC, cosmétiques). |

## ops/

Opérations récurrentes sans obsolescence.

| Script | Usage |
|--------|-------|
| `init-bot-nonce.mjs` | Bootstrap de `bot_state` depuis le nonce on-chain. Idempotent. À lancer une fois par environnement DB (local + Neon). |

## archive/

Scripts historiques conservés pour référence. **Ne pas relancer**.

- `archive/migrations/` — 6 scripts de migration manuelle (cashout, dice, hilo, nf-auth, support, wallet). Tous appliqués. Depuis PR #11, les migrations passent par drizzle-kit (`npm run db:generate` + `db:migrate`).
- `archive/repairs/` — 3 scripts de réparation one-shot : `fix-payouts-column-local` (int→real), `repair-failed-payouts` (reset payout #63/#64), `resync-and-retry-nf-auth`.
- `archive/telegram-setup/` — 2 setups one-shot : `telegram-set-webhook`, `telegram-set-commands`. Relancer seulement si tu changes le webhook URL ou renommes les commandes.
- `archive/one-shot/` — `award-supreme.js` (badge fondateur, déjà awarded) et `enable-stats-flag.mjs` (feature flag `public_stats`, déjà enabled).
