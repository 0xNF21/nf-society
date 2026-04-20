# NF Society — Audit d'architecture

> Généré le 20 avril 2026 — état du repo `0xNF21/nf-society@master` (465 commits, branche `master`).
> Document **descriptif uniquement**. Les recommandations et le plan d'action seront dans un second document.

---

## 0. TL;DR — les 7 points à retenir

| # | Point | Gravité |
|---|-------|---------|
| 1 | **Aucun secret fuité** dans le code ou l'historique git (scan complet OK) | ✅ |
| 2 | **Schéma DB schizophrène** : `schema.ts` (27 tables, vu par Drizzle-kit) + `schema/*.ts` (24 tables, **NON vu par Drizzle-kit**) | 🚨 Critique |
| 3 | **`.env.example` incomplet** : 2 vars documentées, **17 vars utilisées** dans le code | 🚨 Critique |
| 4 | **Rate limiting quasi absent** : 2 routes sur 133 ont une protection | ⚠️ Fort |
| 5 | **Aucun test** (zéro fichier `.test.ts` / `.spec.ts`) alors qu'on manipule de l'argent | ⚠️ Fort |
| 6 | **README et CLAUDE.md obsolètes** : annoncent 7 jeux, le code en a **17** | ⚠️ Moyen |
| 7 | **Fichiers monstres** : `admin/page.tsx` (1873 l.), `i18n.ts` (1541 l.), `dashboard-dao/page.tsx` (1150 l.) | ⚠️ Moyen |

---

## 1. Stack exacte

### Versions (depuis `package.json`)

- **Next.js** : 14.2.0 (App Router)
- **React** : 18.2.0
- **TypeScript** : ^5.4.5
- **Tailwind** : ^3.4.3
- **Drizzle ORM** : ^0.45.1 / drizzle-kit ^0.31.9
- **Postgres** : via `pg` ^8.18.0
- **Circles SDK** : `@aboutcircles/sdk` ^0.1.19
- **Ethers** : ^6.16.0 **ET** **viem** : ^2.45.1 → ⚠️ les deux libs web3 installées, doublon potentiel
- **Radix UI** : `@radix-ui/react-slot` seul (shadcn/ui minimal)
- **grammy** : ^1.42.0 (bot Telegram, **non mentionné dans le README**)
- **qrcode**, **html2canvas**, **recharts**, **lucide-react**

### Scripts npm

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start -H 0.0.0.0 -p 5000",
  "lint": "next lint"
}
```

⚠️ Aucun `test`, aucun `typecheck`, aucun `format`, aucun `db:push` / `db:generate` défini en npm script.

### Nom package

`"name": "circles-gnosis-starter"` — le nom du starter d'origine, jamais changé. Cosmétique mais à corriger (`nf-society`).

---

## 2. Arborescence commentée

```
nf-society/
├── .claude/                     # Config Claude Code locale
├── .github/workflows/
│   └── payouts-monitor.yml      # GitHub Action cron (toutes les 5 min, backup Vercel Hobby)
├── drizzle/                     # 11 fichiers SQL de migration (⚠️ voir §5 pour conflits de numérotation)
├── public/                      # Assets statiques
├── scripts/                     # 35 scripts .mjs/.js/.ts one-shot (debug, migration, smoke tests)
├── src/
│   ├── app/
│   │   ├── admin/page.tsx       # 🚨 1873 lignes — panneau admin monolithique
│   │   ├── api/                 # 133 routes API (voir §4)
│   │   ├── dashboard/           # Dashboard joueur (1026 l.)
│   │   ├── dashboard-dao/       # Dashboard DAO (1150 l.)
│   │   ├── <17 dossiers de jeux> + lobby + hub + multijoueur (voir §3)
│   │   └── ...
│   ├── components/              # 42 composants top-level + ui/
│   │   ├── ui/                  # 9 primitives shadcn (badge, button, card, input, label, skeleton, spinner, switch)
│   │   ├── game-payment.tsx     # 342 l. — paiement multi
│   │   ├── chance-payment.tsx   # 314 l. — paiement chance
│   │   ├── crc-races-payment.tsx # 262 l. — paiement dédié crc-races
│   │   └── balance-pay-button.tsx # 198 l. — paiement via wallet custodial
│   ├── hooks/                   # 4 hooks (connected-address, game-polling, payment-watcher, player-token)
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts         # Connexion Drizzle + Pool pg
│   │   │   ├── schema.ts        # 🚨 403 l. — 27 tables (source unique vue par Drizzle-kit)
│   │   │   └── schema/          # 🚨 15 fichiers — 24 tables (NON vues par Drizzle-kit)
│   │   ├── telegram/            # bot.ts, context.ts, handlers.ts
│   │   ├── circles.ts           # 660 l. — SDK Circles, génération liens paiement, détection tx
│   │   ├── wallet.ts            # 811 l. — wallet custodial interne (Phase 3)
│   │   ├── wallet-game-dispatch.ts # 18KB — dispatcher de paiement par jeu
│   │   ├── i18n.ts              # 🚨 1541 l. (94KB) — toutes les traductions FR/EN dans un seul fichier
│   │   ├── payout.ts            # 14KB — payout via Gnosis Safe + Roles Modifier
│   │   ├── multiplayer.ts       # 15KB — logique multi générique
│   │   ├── platform-stats.ts    # 14KB — agrégats stats plateforme
│   │   ├── chance-registry-server.ts # 14KB — registre jeux chance
│   │   └── <un fichier par jeu : blackjack.ts, dice.ts, hilo.ts, keno.ts, mines.ts, plinko.ts, roulette.ts, etc.>
│   └── types/
├── CLAUDE.md                    # ⚠️ Obsolète (décrit 4 jeux, il y en a 17)
├── HANDOFF.md                   # À jour sur Phase 3 wallet, bonne source
├── README.md                    # ⚠️ Obsolète (annonce 5 multi + 2 chance, il y en a 17)
├── drizzle.config.ts            # ⚠️ Pointe uniquement sur schema.ts (ignore schema/)
├── vercel.json                  # Cron /api/cron/payouts-monitor à 4h AM
└── package.json                 # name = "circles-gnosis-starter" (à renommer)
```

Stats fichiers :
- **305 fichiers TS/TSX** (200 `.ts` + 105 `.tsx`)
- **0 fichier `.js` ou `.jsx` dans `src/`** (le 3% JS du repo vient de `scripts/` et du package-lock)

---

## 3. Inventaire des jeux — 17 jeux actifs (vs 7 annoncés)

### Multijoueur (5) — CRC bet direct

| Jeu | Route API | Schéma | Status |
|-----|-----------|--------|--------|
| **morpion** | `/api/morpion/[slug]` + scan | `schema.ts` (morpionGames, morpionMoves) | ✅ fonctionnel |
| **memory** | `/api/memory/[slug]` + scan | `schema.ts` (memoryGames) | ✅ fonctionnel |
| **dames** | `/api/dames/[id]/move` + scan | `schema/dames.ts` | ✅ fonctionnel |
| **relics** (bataille navale) | `/api/relics/{join,place,shot}` + scan | `schema/relics.ts` | ✅ fonctionnel |
| **pfc** (pierre-feuille-ciseaux) | `/api/pfc/[slug]` + scan | `schema/pfc.ts` | ✅ fonctionnel |
| **crc-races** | `/api/crc-races/[slug]` + scan | `schema/crc-races.ts` | ⚠️ "non déployé" selon HANDOFF.md |

### Casino — chance (10) — solo vs maison

| Jeu | Route API | Schéma | Notes |
|-----|-----------|--------|-------|
| **blackjack** | `/api/blackjack/[id]/{action,check-payment}` | `schema/blackjack.ts` | Phase 3 OK |
| **coin-flip** | `/api/coin-flip` + scan | `schema/coin-flip.ts` | |
| **crash-dash** | `/api/crash-dash/[id]/action` + scan | `schema/crash-dash.ts` | |
| **dice** | `/api/dice/[id]/action` + scan | `schema/dice.ts` | |
| **hilo** | `/api/hilo/[id]/action` + scan | `schema/hilo.ts` | |
| **keno** | `/api/keno/[id]/action` + scan | `schema/keno.ts` | |
| **mines** | `/api/mines/[id]/action` + scan | `schema/mines.ts` | |
| **plinko** | `/api/plinko/[id]/action` + scan | `schema/plinko.ts` | |
| **roulette** | `/api/roulette/[id]/action` + scan | `schema/roulette.ts` | |
| **lotteries** | `/api/lotteries/[id]`, `/api/draw` | `schema.ts` (lotteries, participants, draws) | Original |
| **lootbox** | `/api/lootboxes/[id]`, `/api/lootbox-opens` | `schema.ts` (lootboxes, lootboxOpens) | Original |

### Daily / shop / exchange

- `/api/daily/{claim,claim-from-balance,init,jackpot,scan,scratch,session,spin}` — scratch card + roue + jackpot
- `/api/shop/{auth,buy,inventory}` — boutique XP
- `/api/exchange` — page `/app/exchange`

### Pattern répétitif constaté

Chaque jeu casino suit **exactement** la même structure :
```
src/app/<game>/page.tsx                # Lobby
src/app/<game>/[slug|id]/page.tsx      # Game view
src/app/api/<game>/route.ts            # Create / list
src/app/api/<game>/[id]/action/route.ts # Jouer un coup
src/app/api/<game>-scan/route.ts       # Scan paiement on-chain
src/components/<game>-page.tsx         # Composant principal (600-1100 lignes)
src/lib/<game>.ts                      # Logique métier
src/lib/db/schema/<game>.ts            # Schéma DB
```

→ **Candidat très fort à factorisation**. Environ 80% du code est probablement dupliqué entre les 10 jeux casino.

### Dossiers candidats au nettoyage

- `src/app/hub/page.tsx`, `src/app/lobby/page.tsx`, `src/app/multijoueur/page.tsx` → **3 pages landing**, probablement 1 ou 2 obsolètes
- `src/app/loterie/[slug]` + `src/app/loteries/page.tsx` → OK (détail + liste, mais naming FR/EN mélangé)
- `src/app/lootbox/[slug]` + `src/app/lootboxes/{page,client}.tsx` → OK (détail + liste, même remarque)

---

## 4. Routes API — 133 routes

### Répartition

- **Admin** : 7 routes (`/api/admin/{badges,daily,daily-test,flags,reset,shop,wallet-health,xp}`)
- **Jeux** : ~80 routes (~8 par jeu × 10 jeux casino + ~5 par jeu × 5 multi + daily + lottery)
- **Wallet custodial** : 10 routes (`/api/wallet/{activity,balance,cashout-init,cashout-status,commission,config,ledger,pay-game,topup-scan}`)
- **Players / profils** : 6 routes (`/api/players/[address]/{badges,stats,transactions}`, `/api/profiles/search`)
- **Cron** : `/api/cron/payouts-monitor`
- **Telegram** : `/api/telegram-webhook`
- **Divers** : `/api/crc-price`, `/api/dao`, `/api/treasury/*`, `/api/leaderboard`, `/api/stats/*`, `/api/distributions`, `/api/privacy`, `/api/flags`, `/api/scan`, `/api/lobby`, `/api/rematch`, `/api/game-ticket`, `/api/nf-auth`

### Observations

- ⚠️ **Incohérence de naming** : certaines routes ont `[id]`, d'autres `[slug]` pour le même pattern (ex : `morpion/[slug]` vs `blackjack/[id]`)
- ⚠️ Route orpheline suspecte : `src/app/api/relics-scan/relics-scan/` (dossier double-imbriqué, probablement une erreur)
- ⚠️ Routes `*-test/` pour plusieurs jeux : `morpion/[slug]/test`, `memory/[slug]/test`, `pfc/[slug]/test`, `dames/[id]/test`, `relics/[id]/test`, `crc-races/[slug]/test`, `admin/daily-test` → routes de dev/debug laissées en prod ?

---

## 5. Schéma DB — problème architectural majeur 🚨

### La situation

Il existe **deux sources de schéma Drizzle** dans le repo :

**A. `src/lib/db/schema.ts`** (fichier monolithique, 403 lignes, 27 tables)

Tables : `badges`, `botState`, `claimedPayments`, `dailyRewardsConfig`, `dailySessions`, `draws`, `exchanges`, `featureFlags`, `jackpotPool`, `lootboxOpens`, `lootboxes`, `lotteries`, `memoryGames`, `morpionGames`, `morpionMoves`, `nfAuthTokens`, `participants`, `payouts`, `playerBadges`, `players`, `privacySettings`, `shopCoupons`, `shopItems`, `shopPurchases`, `shopSessions`, `walletLedger`, `xpConfig`

**B. `src/lib/db/schema/*.ts`** (15 fichiers, 24 tables, **pas d'index.ts**)

Tables : `blackjackHands`, `blackjackTables`, `cashoutTokens`, `coinFlipResults`, `coinFlipTables`, `crashDashRounds`, `crashDashTables`, `crcRacesGames`, `damesGames`, `diceRounds`, `diceTables`, `hiloRounds`, `hiloTables`, `kenoRounds`, `kenoTables`, `minesRounds`, `minesTables`, `pfcGames`, `plinkoRounds`, `plinkoTables`, `relicsGames`, `rouletteRounds`, `rouletteTables`, `supportMessages`

### Pourquoi c'est critique

Le fichier `drizzle.config.ts` dit :

```ts
schema: "./src/lib/db/schema.ts"
```

→ **Drizzle-kit ne voit QUE les 27 tables du fichier monolithique**. Les 24 tables du dossier `schema/` sont invisibles à :
- `drizzle-kit generate` (génération des migrations)
- `drizzle-kit push`
- Tout outil qui lit la config Drizzle

De même, `src/lib/db/index.ts` fait :
```ts
import * as schema from "./schema";
```

Comme il n'y a pas de `schema/index.ts`, l'import résout vers **`schema.ts` (le fichier)**, pas vers le dossier. Donc l'instance `db` fournie à l'app ne contient que les 27 tables du monolithe dans son typage.

### Conséquences observées

- **121 imports** depuis `@/lib/db/schema` (le fichier)
- **16 imports** depuis `@/lib/db/schema/<jeu>` (direct sur les fichiers)
- Les requêtes `db.select().from(blackjackTables)` fonctionnent (car on importe la référence), mais `db.query.blackjackTables` ne fonctionne **pas** (pas dans le typage du client)
- Les migrations pour les tables du dossier `schema/` ont dû être **écrites à la main** ou via les scripts one-shot `migrate-*.mjs` dans `/scripts` → explique la présence de `migrate-dice-local.mjs`, `migrate-hilo.mjs`, etc.

### Conflits de numérotation de migrations

Dans `drizzle/` :
- **`0002_cynical_grey_gargoyle.sql`** ET **`0002_uniform_dames_relics.sql`** (deux migrations avec le même préfixe)
- **`0009_add_nf_auth_tokens.sql`** ET **`0009_add_privacy_settings.sql`** (idem)

Drizzle-kit ne garantit pas l'ordre d'exécution dans ce cas.

---

## 6. Circles, Gnosis Safe, wallet custodial

### `src/lib/circles.ts` (660 l.)

- RPC Circles (https://rpc.aboutcircles.com/)
- Event topics : `TRANSFER_SINGLE_TOPIC`, `STREAM_COMPLETED_TOPIC` (hashes keccak256, publics)
- Génération de liens de paiement (`gnosis://`) + QR codes
- Détection on-chain des paiements entrants

### `src/lib/miniapp-bridge.ts` (5.8KB)

- Bridge `postMessage` pour Circles Mini App iframe
- Détection automatique standalone vs iframe

### `src/lib/payout.ts` (14KB)

- Payout via **Gnosis Safe + Roles Modifier**
- Utilise `BOT_PRIVATE_KEY`, `SAFE_ADDRESS`, `ROLES_MODIFIER_ADDRESS`, `ROLE_KEY`
- ⚠️ Fallback `ROLE_KEY = "0x000...01"` ligne 58 → si la variable est manquante en prod, le bot essaie de signer avec un rôle bidon au lieu de crash. Préférer `throw` explicite.
- Retry automatique avec compteur `attempts < 3`, déclenché par le cron

### Wallet custodial (Phase 3 — récent)

**4 composants de paiement parallèles** (⚠️ duplication) :

| Composant | Lignes | Usage |
|-----------|--------|-------|
| `game-payment.tsx` | 342 | Paiement multi via Circles direct |
| `chance-payment.tsx` | 314 | Paiement chance via Circles direct |
| `crc-races-payment.tsx` | 262 | Paiement spécifique crc-races |
| `balance-pay-button.tsx` | 198 | Paiement via solde custodial |
| **Total** | **1116** | Probablement 50-60% de code commun (détection mini-app, polling paiement, UI feedback) |

### `src/lib/wallet.ts` (27.8KB — fichier le plus gros de `lib/`)

Contient : `getBalance`, `creditWallet`, `debitWallet`, `scanWalletTopups`, `getLedger`, `payGameFromBalance`, `creditPrize`, `creditCommission`, `payPrize`, `payCommission`, `cashoutInit`, `cashoutStatus`.

→ Fichier monolithique qui mériterait d'être splitté : `wallet/balance.ts`, `wallet/topup.ts`, `wallet/payout.ts`, `wallet/cashout.ts`.

### `src/lib/wallet-game-dispatch.ts` (18.7KB)

Dispatcher de paiement par jeu : 14+ jeux supportés selon HANDOFF.md. Contient la logique case-by-case qui devrait être extractée en adapters par jeu.

---

## 7. Système XP / Badges / Leaderboard

- `src/lib/xp.ts` (2.9KB) + `src/lib/xp-server.ts` (2.1KB) — séparation client/serveur OK
- `src/lib/badges.ts` (8KB) — 10 niveaux (0 → 20 000 XP), badges secrets + visibles
- Routes : `/api/players/[address]/badges`, `/api/players/badges`, `/api/players/xp`, `/api/admin/badges/award`
- Table `badges`, `playerBadges`, `xpConfig` dans `schema.ts`

⚠️ Non vérifié ici : si tous les triggers XP sont bien appelés depuis chaque jeu. À vérifier manuellement que les 17 jeux créditent bien de l'XP à la fin d'une partie.

---

## 8. Hooks & polling

4 hooks dans `src/hooks/` :

- `use-connected-address.ts` (1.8KB) — récupère l'adresse wallet connectée
- `use-game-polling.ts` (2.2KB) — polling générique état de partie
- `use-payment-watcher.ts` (2.1KB) — polling détection paiement on-chain
- `use-player-token.ts` (1.5KB) — gestion token joueur

→ Taille raisonnable, pas de gros chantier ici. Vérifier que `useEffect` cleanup est bien géré (pas vérifié ici).

---

## 9. Variables d'environnement — **`.env.example` gravement incomplet**

### Utilisées dans le code (17 vars)

| Variable | Client/Serveur | Présent dans `.env.example` |
|----------|----------------|------------------------------|
| `DATABASE_URL` | Serveur | ❌ |
| `NEXT_PUBLIC_CIRCLES_RPC_URL` | Client | ✅ |
| `NEXT_PUBLIC_DEFAULT_RECIPIENT_ADDRESS` | Client | ✅ |
| `NEXT_PUBLIC_APP_URL` | Client | ❌ |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Client | ❌ |
| `BOT_PRIVATE_KEY` | Serveur 🔐 | ❌ |
| `SAFE_ADDRESS` | Serveur | ❌ |
| `ROLES_MODIFIER_ADDRESS` | Serveur | ❌ |
| `ROLE_KEY` | Serveur 🔐 | ❌ |
| `MAX_PAYOUT_CRC` | Serveur | ❌ |
| `JACKPOT_THRESHOLD_CRC` | Serveur | ❌ |
| `DAO_TREASURY_ADDRESS` | Serveur | ❌ |
| `ADMIN_PASSWORD` | Serveur 🔐 | ❌ |
| `CRON_SECRET` | Serveur 🔐 | ❌ |
| `TELEGRAM_BOT_TOKEN` | Serveur 🔐 | ❌ |
| `TELEGRAM_ADMIN_CHAT_ID` | Serveur | ❌ |
| `NODE_ENV` | Serveur (auto) | N/A |

→ **15 variables non documentées**, dont **5 sensibles**. N'importe qui qui clone le repo ne peut pas faire tourner le projet.

---

## 10. 🚨 Audit sécurité

### ✅ Ce qui est bon

- **Aucun secret dans le code** : scan des fichiers TS/TSX, aucun `0x[a-f0-9]{64}` privé trouvé
- **Aucun secret dans l'historique git** : `git log --all -p | grep "0x[a-f0-9]{64}"` ne remonte que des event topics publics
- **Aucun `.env` ni `.env.local` committé** (ni dans l'historique)
- **`.gitignore` correct** : `.env`, `.env.local`, `.env.*.local` bien ignorés
- **`CRON_SECRET` bien utilisé** : vérification `Bearer` dans `/api/cron/payouts-monitor`
- **GitHub Action utilise `secrets.CRON_SECRET`** — OK

### ⚠️ Points d'attention

- **`ROLE_KEY` a un fallback hardcodé** (`src/lib/payout.ts:58`) : `process.env.ROLE_KEY || "0x000...01"`. Si la variable manque en prod, le bot utilise une clé bidon au lieu de crash. Préférer `throw`.
- **`MAX_PAYOUT_CRC`** : vérifier dans `payout.ts` qu'il est bien contrôlé **avant** chaque payout, pas juste documenté.
- **`ADMIN_PASSWORD`** : un seul mot de passe partagé pour l'admin (pas de 2FA, pas de rotation). Acceptable si la route `/admin` est bien derrière ce check côté serveur. À vérifier.
- **`BOT_PRIVATE_KEY` côté client ?** Non trouvé dans du code client, mais à re-vérifier manuellement que le fichier `payout.ts` n'est jamais importé depuis un composant `"use client"`.

### 🔴 Problèmes sérieux

#### Rate limiting quasi inexistant
- **2 routes sur 133** utilisent `rate-limit.ts`
- Routes non protégées qui font des écritures DB : tous les `/api/<jeu>-scan`, `/api/daily/*`, `/api/wallet/*` (sauf `cashout-init`, récemment protégé d'après les commits)
- Risque : spam, DoS, exhaustion de la connexion Postgres

#### Pas de validation d'entrée (Zod / yup / etc.)
- Aucune occurrence de `zod` dans `package.json`
- Les routes API valident probablement "à la main" les inputs — à auditer en détail

#### 220 utilisations de `: any`
- Typage volontairement relâché dans beaucoup d'endroits
- Impossible de savoir sans lecture fine si ça masque des bugs ou pas

#### 189 `console.log/warn/error` dans `src/`
- Certains sûrement utiles côté serveur, mais :
  - Logs client = fuite d'info potentielle en prod
  - Logs serveur non structurés = inexploitables dans Vercel logs

---

## 11. Points chauds code

### Top 15 fichiers par taille (lignes)

| Fichier | Lignes |
|---------|--------|
| `src/app/admin/page.tsx` | **1873** |
| `src/lib/i18n.ts` | **1541** |
| `src/app/dashboard-dao/page.tsx` | 1150 |
| `src/components/roulette-page.tsx` | 1081 |
| `src/app/dashboard/page.tsx` | 1026 |
| `src/components/plinko-page.tsx` | 994 |
| `src/components/lootbox-page.tsx` | 964 |
| `src/app/relics/[id]/page.tsx` | 920 |
| `src/components/keno-page.tsx` | 886 |
| `src/components/lottery-page.tsx` | 870 |
| `src/components/blackjack-page.tsx` | 826 |
| `src/lib/wallet.ts` | 811 |
| `src/components/crash-dash-page.tsx` | 807 |
| `src/app/crc-races/[slug]/page.tsx` | 713 |
| `src/components/daily-modal.tsx` | 691 |

### Métriques code

- `TODO`/`FIXME`/`HACK` : **2** (très peu, bon signe)
- `console.*` : **189** (à nettoyer)
- `: any` : **220**
- `@ts-ignore` / `@ts-nocheck` : **1**
- `eslint-disable` : **26**

---

## 12. Code mort / legacy

### Dossiers / pages à investiguer

- `src/app/hub/`, `src/app/lobby/`, `src/app/multijoueur/` → **3 pages landing**, à confirmer que 1 ou 2 ne sont plus liées dans la nav
- Routes `*/test/` dans plusieurs jeux → semblent être des routes de dev (`morpion/[slug]/test`, etc.). Si elles tournent en prod, à retirer ou gater.
- `src/app/api/relics-scan/relics-scan/` → dossier doublement imbriqué, probablement une erreur

### Scripts one-shot

`/scripts/` contient **35 fichiers** :
- `check-*.mjs` (8) : diagnostics DB / bot / wallet (probablement à garder, à regrouper dans `scripts/diagnostics/`)
- `migrate-*.mjs` (5) : migrations one-shot déjà appliquées (à archiver dans `scripts/archive/`)
- `smoke-*.mjs` (4) : tests manuels
- `debug-*.mjs`, `repair-*.mjs`, `resync-*.mjs`, `fix-*.mjs`, `init-*.mjs`, `list-*.mjs`, `enable-*.mjs`, `compare-*.mjs`, `test-*.mjs`, `award-*.js`, `seed-*` → un peu de tout

Candidat à ranger dans `scripts/{diagnostics, migrations-archive, smoke, seed, telegram}/`.

### Références à des features disparues

À chercher manuellement dans le code : STG roulette v3, Demurrage Dash, Trust or Untrust (mentionnés dans d'anciennes sessions). Grep rapide non effectué ici.

---

## 13. i18n

- **Un seul fichier** : `src/lib/i18n.ts` (1541 lignes, 94KB)
- **Modifié 18 fois en 30 jours** → fichier le plus touché du repo
- Structure : probablement un gros objet `{ fr: {...}, en: {...} }` avec clés imbriquées
- ⚠️ Scalabilité limitée : à chaque nouveau jeu, il faut éditer ce mastodonte
- Candidat très fort à splitter par domaine (`i18n/{common,games/morpion,wallet,admin,...}.ts`)

---

## 14. Cohérence avec CLAUDE.md et HANDOFF.md

### CLAUDE.md

**⚠️ Obsolète.** Décrit le projet comme ayant seulement morpion, memory, shop, loteries/lootboxes/daily. Aucune mention de :
- 10 jeux casino (blackjack, dice, plinko, etc.)
- Système wallet custodial (Phase 3)
- Bot Telegram
- crc-races, crash-dash
- dames, relics, pfc (déjà mergés)

À réécrire entièrement.

### HANDOFF.md

**✅ À jour sur Phase 3.** Source fiable pour comprendre l'état du wallet custodial. Référence explicitement la branche `master` et le merge `b2dfdfa`.

### README.md

**⚠️ Obsolète.** Liste 5 jeux multi + 2 chance. Ne mentionne aucun des 10 jeux casino. Mentionne Postgres/Drizzle mais pas le bot Telegram ni le système wallet custodial.

---

## 15. Activité récente

### 20 derniers commits

```
68be9a5 Scan/daily routes: make the players/xp fetch truly non-blocking
54b80d4 Profile: inclut les jeux on-chain dans l'activite du panneau
e830fa2 Telegram: route messages support vers topics du forum
6d0abb5 Stats: historique des 100 dernieres parties (multi + chance)
f5833fa Profile: inclut les jeux chance dans stats + transactions
211634e Cashout: persist pending session + resume banner in WalletBalanceCard
96f77be Cashout: rate-limit init route to 5 requests/60s per IP
f76b9f3 Ledger history: clickable on-chain tx hashes (Gnosisscan)
2481c46 Dashboard DAO: simplifie la section Tresorerie Plateforme
ec6152d Treasury: aligne les chiffres sur /stats via multiAggregate partage
6bc7075 Stats: filtre les non-jeux du graph + marge nette + RTP fiable
6407dab Fix ProfileModal overflow when ledger history is expanded
867314e Phase 3e: admin wallet-health endpoint + ledger history in ProfileModal
eff7f89 Phase 3d: cashout (withdraw balance to wallet, on-chain)
e51654d Phase 3e: fix balance-pay bugs + extend to coin_flip/lootbox + treasury mirror
e867194 docs: update HANDOFF.md for session 2 — Phase 3 status + what's left
b2dfdfa Merge Phase 3: wallet (balance + pay-from-balance + credit-wins) into master
09d5bf3 Fix blackjack split/double race condition and orphan claims
35f8982 scripts: one-shot migration to seed dice tables in local DB
3d5a3fd Phase 3c: fix mines + keno balance-pay — pass required extras
```

### Top fichiers touchés sur 30 jours

```
18  src/lib/i18n.ts
 9  src/lib/db/schema.ts
 9  src/components/plinko-page.tsx
 8  src/components/roulette-page.tsx
 7  src/lib/wallet.ts
 7  src/lib/telegram/handlers.ts
 7  src/lib/platform-stats.ts
 7  src/lib/circles.ts
 7  src/components/chance-payment.tsx
 7  src/components/blackjack-page.tsx
 7  src/app/api/plinko/[id]/action/route.ts
```

Focus clair du mois : **i18n (traductions), schéma DB, wallet custodial, stats/treasury, jeux casino (plinko/roulette/blackjack)**.

---

## Annexes

### A. Tests

**Aucun test automatisé.** Pas un seul `*.test.ts`, `*.spec.ts`, dossier `__tests__`, ni lib de test dans `package.json` (pas de Vitest, Jest, Playwright, etc.).

Seule forme de test : les scripts `smoke-*.mjs` dans `/scripts/` (exécutés à la main).

### B. CI/CD

- **GitHub Actions** : 1 workflow (`payouts-monitor.yml`) — cron uniquement
- **Pas de workflow build/test/lint** sur PR
- **Deploy** : Vercel (nf-society.vercel.app), cron Vercel à 4h AM pour backup

### C. Dépendances suspectes

- `ethers` ^6.16.0 **et** `viem` ^2.45.1 : deux libs qui se recouvrent. Choisir l'une ou l'autre.
- `html2canvas` : probablement pour exporter `pnl-card.tsx` en image — OK si c'est l'usage
- `grammy` : bot Telegram — gros ajout non mentionné dans CLAUDE.md/README

---

*Fin du rapport descriptif. Phase suivante : priorisation + plan de migration par petites PR.*
