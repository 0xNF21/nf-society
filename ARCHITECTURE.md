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

*Fin du rapport descriptif initial. Sections §16+ : audit approfondi (branche `audit-cleanup`, 2026-04-20).*

---

# Audit approfondi — sections §16 à §25

> Ajouté sur branche `audit-cleanup` le 2026-04-20. Vérifications par lecture du code réel.

## §16 — Vérification §5 : schéma DB dual — CONFIRMÉ

### §16.1 — Confirmation config Drizzle
- `drizzle.config.ts:4` : `schema: "./src/lib/db/schema.ts"` → le fichier monolithique, pas le dossier.
- `src/lib/db/index.ts:3` : `import * as schema from "./schema"` → Node résout vers le **fichier** `schema.ts`, le dossier n'ayant pas d'`index.ts`.
- **Résultat confirmé** : Drizzle-kit ne voit que 27 tables. Les 24 tables du dossier `schema/*.ts` sont invisibles à la génération de migrations.

### §16.2 — Imports directs du dossier schema/
**16 imports** confirmés (comme le rapport initial) depuis `@/lib/db/schema/<jeu>` :
- **dames** (6 fichiers) : `api/dames/{route,[id]/route,[id]/move/route,[id]/test/route}.ts`, `dames/[id]/page.tsx` (type)
- **relics** (7 fichiers) : `api/relics/{route,join/route,shot/route,[id]/route,[id]/test/route}.ts`, `api/relics-scan/relics-scan/route.ts`, `relics/[id]/page.tsx` (type)
- **pfc** (3 fichiers) : `api/pfc/[slug]/route.ts`, `api/pfc/[slug]/test/route.ts`, `pfc/[slug]/page.tsx` (type)

⚠️ Les 7 autres jeux chance (blackjack, coin-flip, crash-dash, dice, hilo, keno, mines, plinko, roulette) importent **uniquement** via la ré-export dans `schema.ts` (l'export monolithique), donc leur table est visible à Drizzle-kit — **mais via une ré-export, pas depuis la source schema/**.

### §16.3 — `db.query` vs `db.select`
Grep exhaustif : **zéro occurrence** de `db.query.<table>` dans `src/`. Tout le code utilise `db.select().from(<table>)`. 
→ Pas de panne de runtime, juste une **dette architecturale** : si quelqu'un écrit `db.query.blackjackTables` demain, ça plantera silencieusement (champ `undefined`).

### §16.4 — Tables sans migration SQL dans `drizzle/`
**10 tables** du dossier `schema/*.ts` n'ont **aucune** instruction `CREATE TABLE` dans `drizzle/*.sql` :
- `blackjackHands`, `blackjackTables`
- `coinFlipResults`, `coinFlipTables`
- `plinkoRounds`, `plinkoTables`
- `rouletteRounds`, `rouletteTables`
- `crcRacesGames`
- `supportMessages`

→ Créées via **scripts one-shot ou SQL manuel** (non reproductible depuis une installation fresh).

### §16.5 — Conflits de numérotation CONFIRMÉS
- `0002_cynical_grey_gargoyle.sql` (auto-généré, 8 tables) + `0002_uniform_dames_relics.sql` (hand-written, 2 tables) → pas de collision sur les noms de table, mais ordre alphabétique.
- `0009_add_nf_auth_tokens.sql` + `0009_add_privacy_settings.sql` → idem, pas de collision de nom mais ordre fragile.

### §16.6 — Scripts migrations one-shot
6 scripts `scripts/migrate-*.mjs` recréent des tables via `db.execute(sql`CREATE TABLE…`)` :
- `migrate-cashout.mjs`, `migrate-dice-local.mjs`, `migrate-hilo.mjs`, `migrate-nf-auth.mjs`, `migrate-support.mjs`, `migrate-wallet.mjs`
→ Chevauchement avec `drizzle/*.sql` pour hilo, nf-auth, wallet → double source de vérité.

---

## §17 — Vérification §9 : `.env.example` incomplet — CONFIRMÉ + aggravé

### §17.1 — `.env.example` actuel (via `git show HEAD:.env.example`)
Exactement **2 lignes** :
```
NEXT_PUBLIC_DEFAULT_RECIPIENT_ADDRESS=
NEXT_PUBLIC_CIRCLES_RPC_URL=https://rpc.aboutcircles.com/
```

### §17.2 — Variables réellement utilisées (18, pas 17)
Grep exhaustif `process\.env\.` dans `src/` + `scripts/` :

| Variable | Côté | Sensible | Fallback | Dans `.env.example` |
|----------|------|----------|----------|----------------------|
| `DATABASE_URL` | Serveur | 🔐 | aucun | ❌ |
| `NEXT_PUBLIC_CIRCLES_RPC_URL` | Client | N | `"https://rpc.aboutcircles.com/"` | ✅ |
| `NEXT_PUBLIC_DEFAULT_RECIPIENT_ADDRESS` | Client | N | aucun | ✅ |
| `NEXT_PUBLIC_APP_URL` | Client | N | `"http://localhost:3000"` | ❌ |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Client | N | `""` | ❌ |
| `BOT_PRIVATE_KEY` | Serveur | 🔐 | aucun (non-null assertion) | ❌ |
| `SAFE_ADDRESS` | Serveur | N | `""` (silent) | ❌ |
| `ROLES_MODIFIER_ADDRESS` | Serveur | N | aucun | ❌ |
| `ROLE_KEY` | Serveur | 🔐 | `"0x000…01"` 🚨 | ❌ |
| `MAX_PAYOUT_CRC` | Serveur | N | `"1000"` | ❌ |
| `JACKPOT_THRESHOLD_CRC` | Serveur | N | `"1000"` | ❌ |
| `DAO_TREASURY_ADDRESS` | Serveur | N | `"0x…da00"` | ❌ |
| `ADMIN_PASSWORD` | Serveur | 🔐 | **`"admin"`** 🚨🚨 (10 routes) | ❌ |
| `CRON_SECRET` | Serveur | 🔐 | aucun | ❌ |
| `TELEGRAM_BOT_TOKEN` | Serveur | 🔐 | aucun | ❌ |
| `TELEGRAM_ADMIN_CHAT_ID` | Serveur | N | aucun | ❌ |
| `NODE_ENV` | Auto | N | N/A | N/A |
| `PORT` | Serveur | N | `"3000"` | ❌ |

→ **16 variables non documentées** dont **5 sensibles** (DATABASE_URL, BOT_PRIVATE_KEY, ROLE_KEY, ADMIN_PASSWORD, CRON_SECRET, TELEGRAM_BOT_TOKEN).

---

## §18 — Vérification §10 : sécurité — AGGRAVÉ 🚨🚨

### §18.1 — 🚨🚨 Fallback `ADMIN_PASSWORD || "admin"` — URGENT
**10 routes admin** contiennent le pattern :
```ts
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
```

Fichiers confirmés :
- `src/app/api/admin/badges/award/route.ts:5`
- `src/app/api/admin/badges/route.ts:6`
- `src/app/api/admin/daily/route.ts:7`
- `src/app/api/admin/daily-test/route.ts:8`
- `src/app/api/admin/flags/route.ts:7`
- `src/app/api/admin/reset/route.ts:6`
- `src/app/api/admin/shop/route.ts:6`
- `src/app/api/admin/wallet-health/route.ts:10`
- `src/app/api/admin/xp/route.ts:7`

→ **Si la variable `ADMIN_PASSWORD` n'est pas définie en prod (ou unset accidentellement), n'importe qui peut envoyer `x-admin-password: admin` et :**
  - reset la DB (`/api/admin/reset`)
  - accorder des badges arbitraires, octroyer de l'XP illimitée
  - modifier les feature flags (désactiver des jeux)
  - voir l'état du wallet DAO (info leak)
  - lancer des **vrais payouts CRC** via `/api/admin/daily-test` (voir §18.3)

**C'est la vulnérabilité la plus grave du repo.**

Note : `src/app/api/admin/route.ts` (lignes 6-8), `/api/payout`, `/api/payout/retry`, `/api/draw`, `/api/lotteries`, `/api/lootboxes` comparent directement à `process.env.ADMIN_PASSWORD` sans fallback (sûrs).

### §18.2 — Fallback `ROLE_KEY` confirmé (§5 initial)
`src/lib/payout.ts:58` :
```ts
const key = process.env.ROLE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";
```
Si `ROLE_KEY` manque, les tx Gnosis Safe seront tentées avec ce rôle bidon → elles reverteront on-chain (pas de perte de fonds), **mais les payouts seront silencieusement cassés**.

**Positif** : `getPayoutConfig()` lignes 30-36 vérifie la présence de la var avant d'appeler `executePayout()`, et retourne `configured: false`. Le fallback sur ligne 58 est donc doublement protégé par ce check. Mais le fallback reste troublant — à supprimer.

### §18.3 — 🚨 Route `/api/admin/daily-test` déclenche de vrais payouts
Contrairement aux autres routes `*/test/`, cette route :
- N'est **pas** gatée par `NODE_ENV === "development"`
- Appelle `executePayout()` avec des vraies CRC (lignes 49 + 74)
- Est protégée uniquement par `ADMIN_PASSWORD` qui lui-même a fallback `"admin"`

→ **Couplé avec §18.1 = vecteur de vol de fonds** si `ADMIN_PASSWORD` manque en prod.

### §18.4 — Autres test routes (correctement gatées)
Les 6 autres test routes gatent correctement sur `NODE_ENV !== "development"` :
- `morpion/[slug]/test`, `memory/[slug]/test`, `pfc/[slug]/test`, `dames/[id]/test`, `relics/[id]/test`, `crc-races/[slug]/test`
→ OK, elles injectent des faux joueurs avec des tx hashes fake (pas de vrai payout).

### §18.5 — Rate-limiting : 1 route sur 133 (aggravé)
Le rapport initial disait 2 sur 133. Vérification : **seule `/api/wallet/cashout-init` utilise `src/lib/rate-limit.ts`** (5 req/60s, IP-based). 

Le rate-limit est **en-mémoire, par-instance** → inefficace sur Vercel serverless (instances éphémères) ou multi-instance.

**Top 20 routes critiques à protéger en priorité (écrivent en DB ET déclenchent des tx) :**

| # | Route | DB write | Tx on-chain | Auth | Risque si spammée |
|---|-------|----------|-------------|------|-------------------|
| 1 | `/api/daily/scan` | ✓ | ✓ | Aucune | XP farm + spam claims |
| 2 | `/api/daily/claim` | ✓ | ✗ | Aucune | Multi-claim different addresses |
| 3 | `/api/daily/claim-from-balance` | ✓ | ✗ | Aucune | idem |
| 4 | `/api/morpion-scan` | ✓ | ✓ | Aucune | Spam polling DB + on-chain |
| 5 | `/api/memory-scan` | ✓ | ✓ | Aucune | idem |
| 6 | `/api/dames-scan` | ✓ | ✓ | Aucune | idem |
| 7 | `/api/pfc-scan` | ✓ | ✓ | Aucune | idem |
| 8 | `/api/relics-scan` | ✓ | ✓ | Aucune | idem |
| 9 | `/api/crc-races-scan` | ✓ | ✓ | Aucune | idem |
| 10 | `/api/blackjack-scan` | ✓ | ✓ | Aucune | idem |
| 11 | `/api/coin-flip-scan` | ✓ | ✓ | Aucune | idem |
| 12 | `/api/crash-dash-scan` | ✓ | ✓ | Aucune | idem |
| 13 | `/api/dice-scan` | ✓ | ✓ | Aucune | idem |
| 14 | `/api/hilo-scan` | ✓ | ✓ | Aucune | idem |
| 15 | `/api/keno-scan` | ✓ | ✓ | Aucune | idem |
| 16 | `/api/mines-scan` | ✓ | ✓ | Aucune | idem |
| 17 | `/api/plinko-scan` | ✓ | ✓ | Aucune | idem |
| 18 | `/api/roulette-scan` | ✓ | ✓ | Aucune | idem |
| 19 | `/api/wallet/topup-scan` | ✓ | ✗ | Aucune | Spam DB + fetch on-chain |
| 20 | `/api/shop/buy` | ✓ | ✓ | Aucune | Drain XP |

### §18.6 — Validation d'input — gaps confirmés
Vérification ciblée :
- ✅ `/api/payout` : regex address `^0x[a-fA-F0-9]{40}$` ligne 29, typeof checks — **OK**
- ✅ `/api/wallet/pay-game` : typeof + String() + Number() — **OK**
- ✅ `/api/wallet/cashout-init` : `isFinite()` + bounds — **OK**
- ⚠️ `/api/lotteries` POST : `recipientAddress` accepté **sans regex** — MOYEN
- ⚠️ `/api/lootboxes` POST : idem — MOYEN
- ⚠️ `/api/wallet/topup-scan` : `String(address)` uniquement, pas de regex — FAIBLE (optionnel)
- ⚠️ `/api/lotteries` POST : `commissionPercent` pas borné (0-100) — FAIBLE

### §18.7 — Secrets client-side — PASS ✅
Vérification transitive : aucun fichier avec `"use client"` n'importe directement ni transitivement `payout.ts`, `wallet.ts` (partie serveur), `telegram/bot.ts`, ou `db/index.ts`.
→ **Pas de fuite de BOT_PRIVATE_KEY / ADMIN_PASSWORD / TELEGRAM_BOT_TOKEN dans le bundle client**.

---

## §19 — Complément §13 : i18n — 205 violations

### §19.1 — Structure
Le fichier contient `translations = { fr: {...}, en: {...} }` avec ~46 sections top-level (landing, home, lottery, wallet, dashboard, stats, errors, admin, blackjack, morpion, memory, daily, lootbox, mines, keno, plinko, roulette, hiLo, crashDash, coinFlip, dice, pfc, dames, crcRaces, relics, exchange, shop, rematch, payout, profile, playerProfile, leaderboard, support, privacy, ticketRecovery, tickets, miniapp, demo, dao, landingXxx × 6).
→ **FR et EN alignés** : pas de clé manquante d'un côté (spot check OK sur 15 clés).

### §19.2 — 🚨 205 violations de la règle i18n
`.claude/rules/` interdit `locale === "fr" ? "…" : "…"`. Grep exhaustif :
- **205 occurrences** de `locale === "fr" ?` dans `src/`
- Top offenders :
  - `app/relics/[id]/page.tsx` : 34
  - `app/dashboard-dao/page.tsx` : 16
  - `components/daily-modal.tsx` : 13
  - `app/morpion/[slug]/page.tsx` : 12
  - `app/memory/[slug]/page.tsx` : 11
  - `app/lobby/page.tsx` : 11
  - `components/chance-payment.tsx` : 10
  - `components/pnl-card.tsx` : 9
  - `app/player/[address]/client.tsx` : 8
  - `components/balance-pay-button.tsx` : 7

### §19.3 — Strings FR/EN hardcodés en JSX
Exemples détectés (extrait non exhaustif) :
- `balance-pay-button.tsx:181` : `"Solde insuffisant"` (hors i18n)
- `balance-pay-button.tsx:183` : `"Mise invalide"` (hors i18n)
- `blackjack-page.tsx:600` : `"Dealer"` (hors i18n)
- `blackjack-page.tsx:720` : `"Mise supplementaire"` (hors i18n)
- `chance-payment.tsx:281` : `"Scannez pour payer"` (hors i18n)
- `lootbox-page.tsx:708` : long paragraphe FR hardcodé
- `admin/page.tsx:1313` : `"RTP doit être entre 97% et 100%"` (hors i18n)
- `game-rules-modal.tsx:33` : `"Règles du jeu"` (hors i18n)

---

## §20 — Complément §3 et §6 : duplication casino & paiement

### §20.1 — Duplication casino (8 jeux chance)
Matrice des patterns communs (✓ = présent dans le jeu) :

| Pattern | Plinko | Roulette | Mines | Dice | HiLo | Keno | Crash | BJ |
|---------|--------|----------|-------|------|------|------|-------|-----|
| `usePlayerToken` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `useDemo` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `useLocale` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `useTheme` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `<ChancePayment>` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `<BalancePayButton>` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `<PnlCard>` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Split Demo/Real | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `darkSafeColor` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| POST /profiles après paiement | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Polling scan | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ |
| GET /active (restore) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Animation spécifique | concurrent balls | spin 4s | reveal | roll | flip | draw 350ms | RAF | hands |

→ **65-75% de code dupliqué estimé** entre les 8 fichiers (~6 584 lignes au total).

**Abstractions extractibles** :
- `useCasinoGame({ gameName, tableSlug, accentColor })` → `{ locale, tokenRef, round, restoring, scanning, playerProfile, scanForRound, setWatchingPayment }`
- `<CasinoGameShell>` → wrapper demo/real + header + sections
- `<GameResultPanel>` → PnlCard + Play Again button unifié
- Extraction de `darkSafeColor` + profile fetch en provider/hook

### §20.2 — Duplication paiement (4 composants, 1116 lignes)

| Feature | `game-payment` | `chance-payment` | `crc-races-payment` | `balance-pay-button` |
|---------|----------------|-------------------|----------------------|------------------------|
| Détection Mini App | ✓ | ✓ | ✓ | ✗ |
| QR generation | ✓ | ✓ | ✓ | ✗ |
| Payment link gen | ✓ | ✓ | ✓ | ✗ |
| Polling auto | ✓ | ✗ | ✓ | ✗ |
| Bouton copy-link | ✓ | ✓ | ✓ | ✗ |
| Bouton scan manuel | ✓ | ✓ | ✓ | ✗ |
| sendPayment (Mini App) | ✓ | ✓ | ✓ | ✗ |
| Mode creator/joiner | ✓ (waiting_p2) | ✗ | ✓ (iAmIn) | ✗ |
| Balance vs on-chain | ✗ | délégué | ✗ | dédié |

→ **50-60% dupliqué**. 

**Abstraction unifiée** proposée :
```ts
usePaymentFlow({ recipientAddress, amountCrc, gameKey, gameId, playerToken, scanFunction, scanInterval })
  → { isMiniApp, paymentLink, qrCode, qrState, miniAppPaying, miniAppError, handleMiniAppPay, copyPaymentLink, scanning }

<UnifiedPaymentFlow mode="multiplay|chance" ... />
```
→ Remplace `game-payment`, `chance-payment`, `crc-races-payment`.
→ `balance-pay-button` reste séparé (concept différent : débit solde).
→ Économie estimée : ~600-700 lignes.

---

## §21 — Complément §4 : route orpheline `relics-scan/relics-scan`

Dossier confirmé doublement imbriqué :
```
src/app/api/relics-scan/
  route.ts                       # route active (utilisée via game-registry.ts:67)
  relics-scan/
    route.ts                     # ORPHANE — aucune référence dans le code
```
Le fichier imbriqué lit sur `gameId` query param et appelle directement `db.select().from(relicsGames)` avec logique legacy (pré-`scanGamePayments`). 
→ **Zero référence en code** (grep `api/relics-scan/relics-scan` : 0 hits). À supprimer.

---

## §22 — Complément §12 : pages landing

| Page | Liens entrants actifs | Statut |
|------|------------------------|--------|
| `/hub` | bottom-nav.tsx (label "Jouer"), home page | ✅ **Hub principal actif** |
| `/chance` | linké depuis `/hub` (carte Dice5) | ✅ **Sous-hub chance actif** |
| `/multijoueur` | linké depuis `/hub` (carte Swords) | ⚠️ **Couche intermédiaire redondante** (le hub pourrait linker direct vers `/morpion`, `/memory`, etc.) |
| `/lobby` | linké depuis `/multijoueur` uniquement (pas dans bottom-nav) | ⚠️ **Sous-page de multijoueur** |

→ `/multijoueur` est réellement un layer intermédiaire entre `/hub` et chaque jeu. Pas forcément à supprimer, mais pourrait être fusionné avec `/hub`.
→ `/lobby` a une vraie valeur (liste des parties ouvertes + polling `/api/lobby`) mais n'est joignable que via `/multijoueur` — candidat à être accessible plus directement.

---

## §23 — Complément §12 : scripts one-shot (34 fichiers, pas 35)

Comptage réel : **34 fichiers** dans `scripts/`. Un `scripts/README.md` existe (mentionné dans HANDOFF.md).

Classification (détail dans §24) :
- **15 à garder actifs** (diagnostics, smoke tests, seed, core migrations)
- **19 à archiver** (migrations déjà appliquées, repairs one-shot)

Sous-catégorisation proposée :
```
scripts/
├── README.md                          (à mettre à jour)
├── diagnostics/                       (11 scripts)
├── migrations/                        (core migration : init-bot-nonce)
├── smoke/                             (6 scripts)
├── seed/                              (seed-badges, seed-shop, telegram-*)
└── archive/                           (migrations passées + repairs appliqués)
```

---

## §24 — Complément §11 : code legacy

Grep sur strings `demurrage`, `trust or untrust`, `stg roulette`, `mini roulette`, `demurrage dash`, `mini app agent` dans `src/` + `drizzle/` + `scripts/` :

**Zero match.** Le codebase est propre de références à des features abandonnées.
→ Pas de code mort identifiable par ce vecteur. Les dossiers suspectés (`/hub`, `/lobby`, `/multijoueur`) sont actuellement tous utilisés (cf §22).

---

## §25 — Complément : hooks & memory leaks

Lecture des 4 fichiers `src/hooks/*.ts` :

| Hook | Role | useEffect + intervalle ? | Cleanup ? | fetch ? | AbortController ? | Verdict |
|------|------|--------------------------|-----------|---------|--------------------|---------|
| `use-connected-address.ts` | Adresse wallet (Mini App + localStorage) | storage listener | ✓ | ✗ | N/A | ✅ SAFE |
| `use-game-polling.ts` | Polling état de partie toutes les 2s | ✓ | ✓ (clear + active flag) | ✓ | ❌ | ⚠️ **fetch pending peut résoudre après unmount** |
| `use-payment-watcher.ts` | Polling blockchain paiement 5s | ✓ | ✓ (clear + cancelled flag) | ✓ | ⚠️ flag only | ✅ SAFE (flag suffit) |
| `use-player-token.ts` | Token localStorage + URL | ✓ | ✓ (one-shot) | ✗ | N/A | ✅ SAFE |

→ Risque faible sur `use-game-polling` (le `try/catch` couvre `setGame` après unmount). À assainir avec `AbortController` à terme, non urgent.

---

## §26 — Build / Lint / TypeScript

### §26.1 — `npm run lint`
Exit code 0. **0 erreur**, seulement des warnings (~80) :
- `@next/next/no-img-element` (balises `<img>` au lieu de `<Image />`) : ~40 occurrences
- `react-hooks/exhaustive-deps` : ~40 occurrences (deps manquantes ou tokenRef récurrent)

Cluster récurrent : `tokenRef` manquant dans useCallback de presque tous les jeux casino (blackjack, coin-flip, crash-dash, dice, hilo, keno, mines, plinko, roulette, lootbox). Le pattern : ref utilisée dans useCallback sans être listée en deps — techniquement OK si on accepte que la ref n'invalide jamais le callback, mais ESLint hurle.

### §26.2 — `npx tsc --noEmit`
Exit code 0. **2 erreurs dans `.next/types`** (cache Next.js périmé, faux positifs) :
```
.next/types/app/api/debug-hilo-rounds/route.ts(2,24): error TS2307
.next/types/app/api/debug-hilo-rounds/route.ts(5,29): error TS2307
```
→ Route `debug-hilo-rounds` supprimée mais cache Next.js pas nettoyé. `rm -rf .next && npx tsc --noEmit` devrait passer. Non bloquant.

### §26.3 — `npm run build`
⚠️ **Non exécuté** (nécessite DATABASE_URL valide + build prod complet). Recommandé de l'ajouter en CI.

---

## §27 — Résumé des findings nouveaux (par ordre de gravité)

| # | Finding | Gravité | Section |
|---|---------|---------|---------|
| 1 | Fallback `ADMIN_PASSWORD \|\| "admin"` sur 10 routes admin | 🚨🚨 Critique | §18.1 |
| 2 | `/api/admin/daily-test` non-gaté `NODE_ENV` + appelle `executePayout()` réel | 🚨 Haute | §18.3 |
| 3 | 10 tables DB sans migration SQL dans `drizzle/` (createur manuel/scripts) | 🚨 Haute | §16.4 |
| 4 | 16 vars d'env critiques manquent dans `.env.example` (dont 5 sensibles) | 🚨 Haute | §17.2 |
| 5 | 19 routes `*-scan` + 3 `daily/*` sans rate-limit avec écriture DB + tx | 🚨 Haute | §18.5 |
| 6 | Fallback `ROLE_KEY \|\| "0x000…01"` | ⚠️ Moyenne (double-checké par config) | §18.2 |
| 7 | 205 violations i18n (`locale === "fr"` hardcodé) | ⚠️ Moyenne | §19.2-3 |
| 8 | Route orpheline `api/relics-scan/relics-scan/route.ts` | ⚠️ Moyenne | §21 |
| 9 | `recipientAddress` non regex-validé dans POST lotteries/lootboxes | ⚠️ Moyenne | §18.6 |
| 10 | 65-75% de code dupliqué sur les 8 jeux casino | ⚠️ Moyenne (dette technique) | §20.1 |
| 11 | 50-60% de code dupliqué sur les 4 composants paiement | ⚠️ Moyenne (dette technique) | §20.2 |
| 12 | Conflits de numérotation migrations 0002 + 0009 | ⚠️ Faible | §16.5 |
| 13 | `use-game-polling` pas d'AbortController | 🟢 Faible | §25 |
| 14 | Warnings lint (~80) : `<img>`, deps manquantes | 🟢 Faible | §26.1 |

**Note finale** : rapport initial globalement juste. Aucun finding critique manqué, aucun finding infirmé. Les 3 aggravations majeures par rapport au rapport initial sont :
1. Le fallback `"admin"` qui transforme le point §10-3 "ADMIN_PASSWORD un seul mot de passe partagé" en **vulnérabilité exploitable**.
2. Le couplage §18.1 + §18.3 qui permet, si `ADMIN_PASSWORD` manque en prod, de trigger de vrais payouts CRC avec un header HTTP trivial.
3. Les **10 tables DB** sans migration `drizzle/` (vs. dette "à la main" mentionnée en §5 initial) — un refresh/reset complet de la DB est impossible sans scripts manuels.

