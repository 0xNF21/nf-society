# Plan d'action NF Society

> Généré depuis l'audit de `ARCHITECTURE.md` + vérifications approfondies. Branche `audit-cleanup`, 2026-04-20.
> Aucune modification de code n'a été faite pour produire ce plan — uniquement lecture.

## Comment lire ce plan

- 🔴 **Sécurité urgente** : à faire dans les jours qui viennent, risque réel de compromission.
- 🟠 **Sécurité / dette critique** : à planifier dans les 2-3 semaines.
- 🟡 **Dette technique** : à faire quand le sécu est propre.
- 🟢 **Refactor / polish** : quand tout le reste est stable, amélioration qualité de vie.

Les PR sont numérotées par **ordre d'exécution recommandé**. Certaines sont indépendantes (peuvent être faites en parallèle par plusieurs sessions).

---

## Tableau récap

| # | Titre | Effort | Impact | Priorité | Dépendances | Risque |
|---|-------|--------|--------|----------|-------------|--------|
| 1 | Supprimer fallback `ADMIN_PASSWORD \|\| "admin"` | 30 min | 🚨 Critique | 🔴 | aucune | Faible |
| 2 | Gate `NODE_ENV` sur `/api/admin/daily-test` | 10 min | 🚨 Haute | 🔴 | aucune | Faible |
| 3 | Supprimer fallback `ROLE_KEY` + valider vars payout au démarrage | 20 min | ⚠️ Moyenne | 🔴 | aucune | Faible |
| 4 | Compléter `.env.example` (18 vars) + `.env.example.production` commenté | 30 min | 🚨 Haute | 🔴 | aucune | Nul |
| 5 | Supprimer route orpheline `api/relics-scan/relics-scan/` | 5 min | ⚠️ Moyenne | 🔴 | aucune | Nul |
| 6 | Rate-limit sur toutes les routes `*-scan` + `daily/*` + `shop/buy` | 2 h | 🚨 Haute | 🟠 | PR #7 | Moyen (wallet) |
| 7 | Remplacer rate-limit in-memory par Upstash Redis | 1 h | 🟠 Haute (prod) | 🟠 | aucune | Faible |
| 8 | Regex-valider `recipientAddress` dans `/api/lotteries` + `/api/lootboxes` POST | 20 min | ⚠️ Moyenne | 🟠 | aucune | Nul |
| 9 | Unifier le schéma DB (créer `schema/index.ts` + tout ré-exporter, pointer drizzle.config sur le dossier) | 2 h | 🟠 Haute (dette) | 🟠 | aucune | **Élevé** (DB) |
| 10 | Écrire les migrations SQL manquantes pour les 10 tables non-drizzlées | 3 h | 🟠 Haute (dette) | 🟠 | PR #9 | Élevé (DB) |
| 11 | Résoudre conflits de numérotation migrations 0002 + 0009 | 1 h | ⚠️ Moyenne | 🟠 | PR #10 | Moyen |
| 12 | Rate-limit sur `/api/payout`, `/api/players/xp`, `/api/wallet/*` restantes | 1 h | ⚠️ Moyenne | 🟠 | PR #6+7 | Faible |
| 13 | Mettre à jour `README.md` + `CLAUDE.md` (17 jeux, wallet, Telegram bot) | 1 h | 🟡 Moyenne | 🟡 | aucune | Nul |
| 14 | Renommer package `circles-gnosis-starter` → `nf-society` + ajouter scripts npm (`typecheck`, `db:push`) | 15 min | 🟢 Faible | 🟡 | aucune | Nul |
| 15 | Réorganiser `scripts/` (sous-dossiers + README à jour) | 1 h | 🟡 Moyenne | 🟡 | aucune | Nul |
| 16 | CI GitHub Actions : typecheck + lint + build sur PR | 1 h | 🟡 Moyenne | 🟡 | aucune | Nul |
| 17 | i18n : migrer les 205 violations `locale === "fr" ? …` | 1 jour | 🟡 Moyenne | 🟢 | aucune | Faible |
| 18 | Splitter `i18n.ts` (1541 l.) par domaine (`i18n/common.ts`, `i18n/games/*.ts`) | demi-jour | 🟡 Moyenne | 🟢 | PR #17 | Moyen |
| 19 | Extraire `useCasinoGame` + `<CasinoGameShell>` + refactorer les 8 jeux chance | 2-3 jours | 🟢 Haute (dette) | 🟢 | aucune | **Élevé** (8 jeux) |
| 20 | Unifier `<UnifiedPaymentFlow>` (remplace game-payment + chance-payment + crc-races-payment) | 1-2 jours | 🟢 Haute (dette) | 🟢 | aucune | Élevé (paiements) |
| 21 | Splitter `app/admin/page.tsx` (1873 l.) par onglets | 1 jour | 🟢 Moyenne | 🟢 | aucune | Moyen |
| 22 | Choisir `ethers` OU `viem` et supprimer l'autre | demi-jour | 🟢 Faible | 🟢 | aucune | Moyen |
| 23 | Corriger les warnings lint `<img>` + `react-hooks/exhaustive-deps` | demi-jour | 🟢 Faible | 🟢 | aucune | Faible |

---

## Détail par PR

### 🔴 PR #1 — Supprimer fallback `ADMIN_PASSWORD || "admin"`
**Effort** : 30 min — **Impact** : 🚨 Critique — **Dépendances** : aucune — **Risque** : faible.

**Problème** : 10 routes admin utilisent `process.env.ADMIN_PASSWORD || "admin"` comme constante au top du fichier. Si la variable n'est pas définie en prod (unset accidentel, renommage, nouveau déploiement), **n'importe qui peut envoyer `x-admin-password: admin` et reset la DB, modifier les flags, déclencher des payouts via `/api/admin/daily-test`**.

**Fichiers touchés** :
- `src/app/api/admin/badges/award/route.ts:5`
- `src/app/api/admin/badges/route.ts:6`
- `src/app/api/admin/daily/route.ts:7`
- `src/app/api/admin/daily-test/route.ts:8`
- `src/app/api/admin/flags/route.ts:7`
- `src/app/api/admin/reset/route.ts:6`
- `src/app/api/admin/shop/route.ts:6`
- `src/app/api/admin/wallet-health/route.ts:10`
- `src/app/api/admin/xp/route.ts:7`

**Plan d'exécution** :
1. Créer `src/lib/admin-auth.ts` :
   ```ts
   export function checkAdminAuth(req: NextRequest): boolean {
     const pw = process.env.ADMIN_PASSWORD;
     if (!pw) return false; // fail closed si var manquante
     return req.headers.get("x-admin-password") === pw;
   }
   ```
2. Dans chaque route, remplacer le bloc `const ADMIN_PASSWORD = process.env… || "admin"` + `checkAuth(req)` par `import { checkAdminAuth } from "@/lib/admin-auth"` + `if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })`.
3. Vérifier que `ADMIN_PASSWORD` est bien défini sur Vercel (dashboard env vars).

**Tests manuels après merge** :
- `curl -X POST https://<prod>/api/admin/reset -H "x-admin-password: admin"` → **401**
- `curl -X POST https://<prod>/api/admin/reset -H "x-admin-password: <vrai-mdp>"` → 200

**Risques** : minimal. Si la var n'est **actuellement pas définie** sur Vercel (et que tout le monde utilise "admin"), le merge casse l'admin → **vérifier Vercel env avant merge**.

---

### 🔴 PR #2 — Gate `NODE_ENV` sur `/api/admin/daily-test`
**Effort** : 10 min — **Impact** : 🚨 Haute — **Dépendances** : aucune — **Risque** : faible.

**Problème** : `src/app/api/admin/daily-test/route.ts` appelle `executePayout()` avec de vraies CRC (lignes 49 et 74). Protégée uniquement par `ADMIN_PASSWORD`. Couplée à PR #1 → exploitable en prod si `ADMIN_PASSWORD` manque.

**Fichiers touchés** : `src/app/api/admin/daily-test/route.ts`.

**Plan d'exécution** :
1. Ajouter en haut des handlers GET/POST :
   ```ts
   if (process.env.NODE_ENV !== "development") {
     return NextResponse.json({ error: "Not available in production" }, { status: 404 });
   }
   ```
2. Alternative plus propre : renommer en `/api/dev/daily-test` et mettre le gate `NODE_ENV` sur tout le dossier `dev/` via un middleware.

**Tests** : appeler en prod → 404. Appeler en dev → toujours fonctionnel.

**Risques** : nul — on perd juste une capacité de test en prod qu'on ne devrait pas avoir.

---

### 🔴 PR #3 — Supprimer fallback `ROLE_KEY` + valider vars payout au démarrage
**Effort** : 20 min — **Impact** : ⚠️ Moyenne — **Risque** : faible.

**Problème** : `src/lib/payout.ts:58` : `const key = process.env.ROLE_KEY || "0x000…01"`. Si `ROLE_KEY` manque, les tx Gnosis Safe sont tentées avec un role key bidon → elles reverteront on-chain. Silencieux (pas d'erreur côté app).

**Plan d'exécution** :
1. Remplacer ligne 58 par :
   ```ts
   const key = process.env.ROLE_KEY;
   if (!key) throw new Error("ROLE_KEY is not configured");
   ```
   `getPayoutConfig()` devrait déjà bloquer avant d'arriver là, mais ceinture + bretelles.
2. Optionnel : créer `src/lib/env-check.ts` avec une fonction `validateServerEnv()` appelée au démarrage (ex : dans un route handler de health) qui throw si une var critique manque.

**Tests** : retirer `ROLE_KEY` de `.env.local`, tenter un payout → erreur claire au lieu de tx qui revert.

---

### 🔴 PR #4 — Compléter `.env.example` + `.env.example.production`
**Effort** : 30 min — **Impact** : 🚨 Haute — **Risque** : nul.

**Problème** : `.env.example` contient seulement 2 vars. 16 autres vars utilisées dans le code ne sont pas documentées, dont 5 sensibles. Un nouveau contributeur (ou toi dans 6 mois) ne sait pas quoi setter.

**Fichiers touchés** : `.env.example`.

**Plan d'exécution** :
1. Remplir `.env.example` :
   ```
   # --- Database ---
   DATABASE_URL=postgresql://user:pass@localhost:5432/nf_society

   # --- App ---
   NEXT_PUBLIC_APP_URL=http://localhost:3000

   # --- Circles ---
   NEXT_PUBLIC_CIRCLES_RPC_URL=https://rpc.aboutcircles.com/
   NEXT_PUBLIC_DEFAULT_RECIPIENT_ADDRESS=

   # --- Gnosis Safe / Payouts (server) ---
   BOT_PRIVATE_KEY=0x...
   SAFE_ADDRESS=0x960A0784640fD6581D221A56df1c60b65b5ebB6f
   ROLES_MODIFIER_ADDRESS=0x...
   ROLE_KEY=0x...
   DAO_TREASURY_ADDRESS=0x000000000000000000000000000000000000da00
   MAX_PAYOUT_CRC=1000
   JACKPOT_THRESHOLD_CRC=1000

   # --- Admin ---
   ADMIN_PASSWORD=change-me
   CRON_SECRET=change-me

   # --- Telegram bot ---
   TELEGRAM_BOT_TOKEN=
   TELEGRAM_ADMIN_CHAT_ID=
   NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=
   ```
2. (Option) Créer `.env.example.production` avec des commentaires spécifiques prod.

**Tests** : aucun.

---

### 🔴 PR #5 — Supprimer route orpheline `api/relics-scan/relics-scan/`
**Effort** : 5 min — **Impact** : ⚠️ Moyenne — **Risque** : nul.

**Problème** : `src/app/api/relics-scan/relics-scan/route.ts` est doublement imbriqué (confusion avec `src/app/api/relics-scan/route.ts`). **Aucune référence dans le code** (grep `api/relics-scan/relics-scan` : 0 hits). Utilise une logique legacy (avant `scanGamePayments`).

**Plan d'exécution** :
1. `git rm src/app/api/relics-scan/relics-scan/route.ts`
2. `rmdir src/app/api/relics-scan/relics-scan`
3. `npx tsc --noEmit` pour confirmer rien ne casse.

**Tests manuels** : scanner un paiement relics en local → toujours OK (utilise `src/app/api/relics-scan/route.ts`).

---

### 🟠 PR #6 — Rate-limit sur toutes les routes `*-scan` + `daily/*` + `shop/buy`
**Effort** : 2 h — **Impact** : 🚨 Haute — **Dépendances** : PR #7 — **Risque** : moyen.

**Problème** : 19 routes `*-scan` et 3 routes `daily/*` écrivent en DB et peuvent déclencher des tx, accessibles sans auth ni limit. Spam possible → exhaustion connexion Postgres, inflation de `claimedPayments`, bruit on-chain.

**Fichiers touchés** : ~22 routes `src/app/api/*-scan/route.ts`, `/api/daily/*`, `/api/shop/buy/route.ts`, `/api/wallet/topup-scan/route.ts`.

**Plan d'exécution** :
1. Reposer sur le `rate-limit.ts` migré Redis (PR #7).
2. Ajouter un helper `rateLimit({ key, limit, window })` dans chaque route, avec clé = IP pour les routes anonymes, clé = address pour les routes address-scoped (`/api/daily/claim`).
3. Limites suggérées :
   - Scan routes : 10 req / 60s / IP
   - `/api/daily/claim` : 1 req / 24h / address (business logic, devrait déjà exister côté DB)
   - `/api/shop/buy` : 10 req / 60s / address
   - `/api/wallet/topup-scan` : 5 req / 60s / IP

**Tests** :
- spammer un scan endpoint → 429 après N req
- vérifier que le polling normal (1 scan toutes les 5s par client) n'est pas pénalisé

**Risques** : si mal calibré, casse le polling naturel du client → tester attentivement avec un vrai jeu en local.

---

### 🟠 PR #7 — Remplacer rate-limit in-memory par Upstash Redis (ou `@vercel/kv`)
**Effort** : 1 h — **Impact** : 🟠 Haute (prod) — **Risque** : faible.

**Problème** : `src/lib/rate-limit.ts` est en mémoire, par instance. Sur Vercel serverless (instances éphémères), le compteur est réinitialisé à chaque cold start → rate-limit inefficace.

**Plan d'exécution** :
1. Créer un compte Upstash (gratuit jusqu'à 10k req/jour) OU activer Vercel KV.
2. `npm i @upstash/ratelimit @upstash/redis`.
3. Réécrire `src/lib/rate-limit.ts` avec `Ratelimit.slidingWindow(10, "60s")`.
4. Ajouter vars env `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` dans `.env.example` (PR #4).

**Tests** : spammer depuis 2 IPs différentes, vérifier que chacune a son quota.

---

### 🟠 PR #8 — Regex address dans POST `/api/lotteries` + `/api/lootboxes`
**Effort** : 20 min — **Impact** : ⚠️ Moyenne — **Risque** : nul.

**Problème** : Ces routes acceptent `recipientAddress` sans regex check. Un admin fatigué peut créer une lotterie avec `recipientAddress: "notanaddress"` → tous les participants paient vers une adresse invalide, impossible de récupérer.

**Fichiers touchés** : `src/app/api/lotteries/route.ts`, `src/app/api/lootboxes/route.ts`.

**Plan d'exécution** :
1. Extraire un helper `isEthereumAddress(s)` dans `src/lib/validation.ts`.
2. Ajouter dans POST :
   ```ts
   if (!isEthereumAddress(recipientAddress)) return NextResponse.json({ error: "Invalid recipient address" }, { status: 400 });
   ```
3. Même chose pour `commissionPercent` : `if (commissionPercent < 0 || commissionPercent > 100) return 400`.

---

### 🟠 PR #9 — Unifier le schéma DB (créer `schema/index.ts` + pointer drizzle.config)
**Effort** : 2 h — **Impact** : 🟠 Haute (dette) — **Risque** : **élevé** (DB).

**Problème** : `drizzle.config.ts` pointe sur le fichier `schema.ts` seul. Les 24 tables du dossier `schema/*.ts` sont invisibles à drizzle-kit. `db.query.<table>` ne fonctionne pas pour ces tables.

**Plan d'exécution** :

**Option A — recommandée** : Créer `src/lib/db/schema/index.ts` qui ré-exporte TOUT (anciens + nouveaux).
1. Créer `src/lib/db/schema/index.ts` :
   ```ts
   export * from "./blackjack";
   export * from "./coin-flip";
   export * from "./dice";
   export * from "./hilo";
   // ... etc pour tous les fichiers du dossier
   // + ré-export de schema.ts contenu
   ```
2. Déplacer le contenu de `src/lib/db/schema.ts` dans `src/lib/db/schema/core.ts` (ou `common.ts`).
3. Ajouter `export * from "./core"` dans `schema/index.ts`.
4. Supprimer `src/lib/db/schema.ts`.
5. Mettre à jour `drizzle.config.ts` : `schema: "./src/lib/db/schema/index.ts"` (ou idéalement pointer sur le dossier si drizzle-kit supporte).
6. Vérifier que les 121 imports `from "@/lib/db/schema"` continuent de résoudre correctement (TypeScript résoud `index.ts` par défaut).

**Option B — plus simple, moins propre** : Tout copier dans `schema.ts` monolithique et supprimer le dossier.

**Tests** :
- `npx tsc --noEmit` OK
- `npx drizzle-kit generate` sans erreur, aucune migration générée (état stable)
- Tourner l'app en local, tester 1 jeu multi + 1 jeu chance

**Risques** : élevé. Tester en local avant push, ne pas push en prod tant que DB Neon pas validée.

---

### 🟠 PR #10 — Écrire les migrations SQL manquantes (10 tables)
**Effort** : 3 h — **Impact** : 🟠 Haute (dette) — **Dépendances** : PR #9 — **Risque** : élevé (DB).

**Problème** : 10 tables ont été créées via scripts one-shot ou SQL manuel et n'ont aucune migration dans `drizzle/` :
- `blackjackHands`, `blackjackTables`
- `coinFlipResults`, `coinFlipTables`
- `plinkoRounds`, `plinkoTables`
- `rouletteRounds`, `rouletteTables`
- `crcRacesGames`
- `supportMessages`

Un clone + `drizzle-kit push` fresh ne peut pas recréer la DB actuelle.

**Plan d'exécution** :
1. Sur une DB Postgres locale fresh, lancer toutes les migrations `drizzle/*.sql`.
2. Après PR #9, lancer `npx drizzle-kit generate` → crée automatiquement `0011_missing_tables.sql` (ou similaire).
3. Inspecter le SQL généré, s'assurer qu'il match bien l'état actuel de Neon (comparer les types, defaults, indexes).
4. Tester `drizzle-kit push` sur une DB fresh, vérifier que toutes les tables sont créées.
5. Pour la prod (Neon), la migration est no-op (tables déjà là), mais le fichier doit exister dans `drizzle/` pour que le setup fresh fonctionne.

**Tests** : `DROP DATABASE` local + `CREATE DATABASE` + lancer toutes les migrations dans l'ordre → appli fonctionne.

**Risques** : élevé. Ne pas lancer drizzle-kit push sur Neon sans vérifier manuellement le diff.

---

### 🟠 PR #11 — Résoudre conflits de numérotation `0002` + `0009`
**Effort** : 1 h — **Impact** : ⚠️ Moyenne — **Dépendances** : PR #10 — **Risque** : moyen.

**Problème** : deux paires de migrations partagent le même préfixe numérique (`0002_cynical` + `0002_uniform`, `0009_add_nf_auth` + `0009_add_privacy`). Drizzle-kit ne garantit pas l'ordre d'exécution.

**Plan d'exécution** :
1. Inspecter le hash de la table `drizzle.__drizzle_migrations` en local et en Neon pour voir l'ordre réel d'exécution.
2. Renommer `0002_uniform_dames_relics.sql` → `0002b_uniform_dames_relics.sql` (ou shifter toutes les suivantes en `0003`, `0004`… et mettre à jour drizzle meta).
3. **Attention** : si drizzle-kit a déjà enregistré ces migrations dans la table, il faut aussi mettre à jour les hash.

**Alternative plus safe** : laisser tel quel, documenter l'ordre alphabétique en commentaire en tête de chaque fichier, et **toujours générer via drizzle-kit à l'avenir**.

---

### 🟠 PR #12 — Rate-limit sur routes restantes (`/api/payout`, `/api/players/xp`, `/api/wallet/*`)
**Effort** : 1 h — **Impact** : ⚠️ Moyenne — **Dépendances** : PR #6+7 — **Risque** : faible.

**Plan d'exécution** : mêmes helpers que PR #6.
- `/api/payout` (POST) : 10 req / 60s / IP + déjà admin-auth
- `/api/players/xp` : 20 req / 60s / address
- `/api/wallet/pay-game` : déjà protégé par playerToken, rajouter rate-limit 20 req / 60s / address

---

### 🟡 PR #13 — Mettre à jour `README.md` + `CLAUDE.md`
**Effort** : 1 h — **Impact** : 🟡 Moyenne — **Risque** : nul.

**Problème** : README annonce 5 multi + 2 chance (en réalité 6 multi + 11 chance + daily + exchange + shop). CLAUDE.md ne mentionne ni le wallet custodial, ni le bot Telegram, ni les 10 jeux casino.

**Plan d'exécution** :
1. README : refaire la section "Features" avec les 17 jeux + wallet + bot Telegram.
2. CLAUDE.md : ajouter sections "Wallet custodial (Phase 3)", "Bot Telegram", "Framework chance" (déjà existe), lister les 17 jeux actifs, pointer vers `HANDOFF.md` pour Phase 3 wallet.
3. Ajouter un **diagramme d'architecture rapide** en ASCII dans CLAUDE.md (DB → API → UI → paiements).

---

### 🟡 PR #14 — Renommer package + scripts npm
**Effort** : 15 min — **Impact** : 🟢 Faible — **Risque** : nul.

**Fichiers touchés** : `package.json`.

**Plan** :
1. `"name": "circles-gnosis-starter"` → `"nf-society"`.
2. Ajouter scripts :
   ```json
   "typecheck": "tsc --noEmit",
   "db:generate": "drizzle-kit generate",
   "db:push": "drizzle-kit push",
   "db:studio": "drizzle-kit studio"
   ```

---

### 🟡 PR #15 — Réorganiser `scripts/`
**Effort** : 1 h — **Impact** : 🟡 Moyenne — **Risque** : nul.

**Plan** : créer `scripts/diagnostics/`, `scripts/migrations/`, `scripts/smoke/`, `scripts/seed/`, `scripts/archive/`. Déplacer selon classification :

- `diagnostics/` (11) : `check-bot-nonce`, `check-nf-auth`, `check-payouts-schema`, `check-treasury-state`, `check-tx`, `check-wallet-drift`, `check-wallet-invariant`, `check-wallet-state`, `compare-crc-columns`, `debug-wallet-scan`, `list-failed-payouts`
- `migrations/` (1 actif) : `init-bot-nonce`
- `smoke/` (6) : `smoke-cashout`, `smoke-credit-prize`, `smoke-lottery-daily`, `smoke-pay-game`, `smoke-wallet`, `test-auto-resync`
- `seed/` (4) : `seed-badges`, `seed-shop`, `telegram-set-commands`, `telegram-set-webhook`
- `archive/` (12) : `award-supreme`, `enable-stats-flag`, `fix-payouts-column-local`, `repair-failed-payouts`, `resync-and-retry-nf-auth`, `migrate-cashout`, `migrate-dice-local`, `migrate-hilo`, `migrate-nf-auth`, `migrate-support`, `migrate-wallet`

Mettre à jour `scripts/README.md` en conséquence.

---

### 🟡 PR #16 — CI GitHub Actions (typecheck + lint + build)
**Effort** : 1 h — **Impact** : 🟡 Moyenne — **Risque** : nul.

**Plan** : créer `.github/workflows/ci.yml` qui, sur chaque PR :
- `npm ci`
- `npm run typecheck`
- `npm run lint`
- (optionnel) `npm run build` avec un `DATABASE_URL` factice

**Risques** : détectera les régressions existantes (les 2 erreurs `.next/types` du cache) → il faudra soit nettoyer le cache avant `tsc`, soit accepter ces warnings.

---

### 🟢 PR #17 — i18n : migrer les 205 violations `locale === "fr" ? …`
**Effort** : 1 jour — **Impact** : 🟡 Moyenne — **Risque** : faible.

**Plan** :
1. Spot-checker chaque fichier top-offenders (relics, dashboard-dao, daily-modal, morpion, memory, lobby, chance-payment, pnl-card, player, balance-pay-button).
2. Pour chaque bloc `locale === "fr" ? "..." : "..."`, extraire vers la bonne section de `i18n.ts` (ex : `relics.emptyBoardLabel`, `balancePay.insufficientBalance`).
3. Remplacer par `t.relics.emptyBoardLabel[locale]` ou similaire.
4. Ajouter une règle ESLint custom qui catch `locale === "fr"` et `language === "fr"`.

**Tests** : switcher FR ↔ EN sur tous les écrans concernés, vérifier visuellement.

---

### 🟢 PR #18 — Splitter `i18n.ts` (1541 l.) par domaine
**Effort** : demi-jour — **Impact** : 🟡 Moyenne — **Dépendances** : PR #17 — **Risque** : moyen.

**Plan** : découper `src/lib/i18n.ts` en :
```
src/lib/i18n/
├── index.ts                # export translations + locale provider glue
├── common.ts               # landing, errors, profile, leaderboard, etc.
├── wallet.ts               # wallet, payout, cashout, balance, topup
├── admin.ts
├── games/
│   ├── morpion.ts
│   ├── memory.ts
│   ├── blackjack.ts
│   ├── ... un par jeu
```

Le consommateur importe toujours `translations` depuis `@/lib/i18n` — zéro breaking change.

**Risques** : moyen. Risque de perdre des clés si mal mergé. Faire un diff avant/après sur `JSON.stringify(translations)` pour confirmer.

---

### 🟢 PR #19 — `useCasinoGame` + `<CasinoGameShell>` + refactor 8 jeux chance
**Effort** : 2-3 jours — **Impact** : 🟢 Haute (dette) — **Risque** : **élevé**.

**Problème** : 65-75% de code dupliqué entre plinko/roulette/mines/dice/hilo/keno/crash-dash/blackjack.

**Plan** :
1. Créer `src/hooks/use-casino-game.ts` avec la signature proposée dans §20.1 de ARCHITECTURE.md.
2. Créer `src/components/casino-game-shell.tsx` qui wrap demo/real, header, result panel.
3. Créer `src/components/game-result-panel.tsx` (PnlCard + Play Again unifié).
4. Refactorer **UN jeu à la fois** (ex : commencer par `dice-page.tsx` qui est le plus simple).
5. PR individuelle par jeu ? OU 1 PR par groupe (instant-resolve vs. polling).

**Risques** : élevé. Chaque jeu a des petites particularités (extras, animations) qui doivent être préservées. Tester en local chaque jeu avant merge.

---

### 🟢 PR #20 — `<UnifiedPaymentFlow>` + `usePaymentFlow`
**Effort** : 1-2 jours — **Impact** : 🟢 Haute (dette) — **Risque** : élevé (paiements).

**Plan** :
1. Créer `src/hooks/use-payment-flow.ts` (signature dans §20.2).
2. Créer `src/components/unified-payment-flow.tsx` avec props `mode: "multiplay" | "chance"`.
3. Refactorer `game-payment.tsx`, `chance-payment.tsx`, `crc-races-payment.tsx` pour déléguer au composant unifié. 
4. Garder `balance-pay-button.tsx` séparé (concept différent, logique dédiée).
5. Tester : paiement on-chain standalone, paiement Mini App, scan manuel, creator vs joiner en multi.

**Risques** : élevé. Le paiement est **le flow critique** — le moindre bug casse l'onboarding. Tester exhaustivement.

---

### 🟢 PR #21 — Splitter `app/admin/page.tsx` (1873 l.)
**Effort** : 1 jour — **Impact** : 🟢 Moyenne — **Risque** : moyen.

**Plan** :
1. Identifier les sections du panneau admin (onglets : badges, daily config, shop items, feature flags, XP config, wallet health, payouts, etc.).
2. Extraire chaque section dans `src/components/admin/<section>.tsx`.
3. Garder `app/admin/page.tsx` comme tab-switcher + auth wall.

---

### 🟢 PR #22 — Choisir `ethers` OU `viem`
**Effort** : demi-jour — **Impact** : 🟢 Faible — **Risque** : moyen.

**Plan** :
1. Grep `import.*from "ethers"` et `import.*from "viem"` pour voir où chacune est utilisée.
2. Probablement : ethers dans `payout.ts`, circles.ts (ABI, Wallet, Provider). viem probablement dans les fichiers wallet custodial plus récents.
3. Choisir **viem** (plus moderne, mieux typé, tree-shake) et migrer les usages ethers.
4. Supprimer `ethers` de package.json.

**Risques** : moyen. Certaines signatures sont différentes. Tester les payouts en dev.

---

### 🟢 PR #23 — Nettoyer warnings lint
**Effort** : demi-jour — **Impact** : 🟢 Faible — **Risque** : faible.

**Plan** :
1. `<img>` → `<Image />` (Next.js) sur les ~40 warnings. Attention : `next/image` impose width/height et change le comportement responsive → tester visuellement.
2. `react-hooks/exhaustive-deps` : pour `tokenRef` dans useCallback, soit ajouter `tokenRef` aux deps (inoffensif car ref), soit désactiver la règle localement avec `// eslint-disable-next-line` et un commentaire expliquant pourquoi.

---

## Ordre d'exécution recommandé

### Semaine 1 — sécurité urgente
PR #1, #2, #3, #4, #5 → 1h30 total. **Débloque la vulnérabilité `ADMIN_PASSWORD` et ferme les gaps faciles.**

### Semaine 2 — sécurité suite
PR #7 → #6 → #8 → #12. Rate-limit Redis + scan routes protégées + validation addresse.

### Semaine 3 — dette DB
PR #9 → #10 → #11. **Risqué, faire en session dédiée avec backup Neon récent.**

### Semaine 4 — cleanup / docs / CI
PR #13 → #14 → #15 → #16.

### Mois 2+ — refactor
PR #17 → #18 → #19 → #20 → #21 → #22 → #23. En priorisant selon ce qui te fait perdre le plus de temps au quotidien (probablement PR #19 casino ou PR #18 i18n).

---

## PRs particulièrement risquées (à faire en session dédiée, avec backup)

- **PR #9 et #10** (DB schema + migrations manquantes) → risque de perte de data Neon
- **PR #19** (refactor 8 jeux casino) → risque de casser le flow de paiement/partie sur plusieurs jeux à la fois
- **PR #20** (unifier paiement) → risque de casser l'onboarding

Pour chacune :
1. Faire un snapshot Neon avant
2. Tester en local avec une copie de la DB prod
3. Merger en heures creuses
4. Surveiller les logs Vercel 30 min après le deploy

---

## Ce qui n'est PAS dans ce plan

- **Tests automatisés** : c'est un énorme chantier séparé (Vitest / Playwright). Mentionné en §A des annexes du rapport initial, mais pas prioritaire avant que la sécu soit bouclée.
- **Monitoring/observabilité** : structured logs, Sentry, etc. Pas urgent.
- **Migration Next.js 15** : pas dans le scope actuel.
- **Optimisation bundle** : pas mesuré, pas urgent.
