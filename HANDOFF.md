# Handoff — Wallet NF Society

Pour reprendre le travail en local depuis Claude Code. Lis ce fichier, puis continue.

## Contexte rapide

**Projet** : NF Society — plateforme DAO sur Gnosis Chain, jeux CRC (multijoueur + chance).

**Objectif global** : permettre à l'utilisateur de charger une fois un **solde CRC prépayé** puis de jouer sans re-tx on-chain à chaque partie. Cashout possible à tout moment.

**Branche de travail** : `claude/add-wallet-balance-9ajNn`

**Plan complet** : `.claude/plans/la-avec-tout-le-clever-octopus.md` — référentiel de toutes les décisions produit déjà validées. À relire si questions architecturales.

## Ce qui est livré (Phase 1 + Phase 2)

### Phase 1 — Fix bug Babanoue (commit `09c4a77`)

Fix défensif multi-couches pour "refresh en pleine partie = game perdue" :

1. `src/hooks/use-player-token.ts` : `setVersion` force re-render quand le token se résout après hydration SSR.
2. `ChancePayment` + `GamePayment` : bouton Payer désactivé tant que `!playerToken` (affiche "Préparation..."). Empêche les tx sans token encodé.
3. 7 routes `/api/{game}/active` : `eq(status, "playing")` → `ne(status, "finished")`. Capture tous les rounds non-finis.
4. 9 pages chance (`roulette`, `hilo`, `mines`, `keno`, `crash-dash`, `plinko`, `dice`, `coin-flip`, `blackjack`) : useEffect de restore relance quand token arrive (`tokenValue` en dep).

**Validé par le user** : smoke test OK sur mobile. Refresh simple → partie restaurée.

### Phase 2 — Bureau des tickets perdus (commit `0a20655`)

Récupération de la partie via preuve d'adresse quand localStorage est perdu (cache clear, nouvelle nav, autre device).

**Schema** : table `nf_auth_tokens` (token, address, tx_hash, expires_at).

**API** :
- `POST /api/nf-auth` → crée token, renvoie `{ token, paymentLink, qrCode, recipientAddress }`
- `GET /api/nf-auth?token=` → polling, scan blockchain, extrait sender, refund 1 CRC auto
- `GET /api/game-ticket?gameKey=&slug=&authToken=` → dispatch multi (player1/2Address) + chance (playerAddress). Retourne `{ status, role, token }`.

**UI** : composant `<TicketRecovery>` dans `src/components/ticket-recovery.tsx`. Modal avec QR + polling + auto-reload. Injecté discrètement en bas de `ChancePayment` et `GamePayment`.

**circles.ts** : `"nf_auth"` ajouté à `gameKeys` (ligne 441).

**i18n** : section `ticketRecovery` FR+EN dans `src/lib/i18n.ts`.

**Build** : TSC vert. Non testé en prod (migration Neon pas encore faite).

## Action immédiate — Migration Neon

La Phase 2 ne fonctionnera pas en prod tant que la table `nf_auth_tokens` n'existe pas sur Neon.

```bash
# Depuis le repo principal, branche claude/add-wallet-balance-9ajNn checkée :
git pull origin claude/add-wallet-balance-9ajNn
npx vercel env pull .env.neon --environment=production
node scripts/migrate-nf-auth.mjs --neon
rm .env.neon
```

Fichiers concernés : `drizzle/0009_add_nf_auth_tokens.sql` + `scripts/migrate-nf-auth.mjs`.

Migration locale aussi (Postgres local dev) si pas déjà fait :
```bash
node scripts/migrate-nf-auth.mjs
```

## Tests à faire après migration

Sur preview Vercel ou local :

1. **Smoke test Phase 1** (si pas déjà refait)
   - Payer sur roulette en web standalone → placer bets → F5 → partie revient ✓
2. **Test Phase 2 — recovery**
   - Payer sur roulette → partie active
   - `localStorage.clear(); location.reload()` → écran de paiement
   - Cliquer **"Retrouver ma partie"** en bas du QR
   - Payer 1 CRC (remboursé auto)
   - Polling détecte paiement → dispatch → token injecté → reload
   - Partie restaurée ✓

Si scan/polling lent, vérifier `/api/nf-auth?token=X` directement en GET — doit retourner `{status:"confirmed", address:"0x..."}` après paiement.

## Plan Phase 3 — Wallet (solde + ledger + cashout)

Objectif : charger 1 fois un solde CRC, payer ses mises depuis ce solde sans re-tx, cashout on-chain à volonté. Gains crédités au solde (pas de payout gas par partie).

**Invariant critique** : `sum(players.balance_crc) + DAO_commission_pending ≈ Safe_CRC_balance_onchain`.

### Découpage recommandé (5 sous-phases commit-par-commit)

**3a — Fondations (1-2j)**
- `src/lib/db/schema.ts` : `players.balanceCrc: integer.notNull().default(0)` + nouvelle table `walletLedger` (id, address, kind, amountCrc signed, balanceAfter, reason, txHash unique, gameType, gameSlug, createdAt). Index sur address, unique sur txHash.
- `drizzle/0010_add_wallet.sql` + `scripts/migrate-wallet.mjs`
- `src/lib/wallet.ts` : `getBalance(address)`, `creditWallet(address, amount, opts)` avec upsert players, `scanWalletTopups()` via `checkAllNewPayments` filtré `gameData.game === "wallet" && id === "topup"`.
- `src/lib/circles.ts` : `generateTopupPaymentLink(amount)` avec `data="wallet:topup"`. Ajouter `"wallet"` à gameKeys.
- Routes :
  - `GET /api/wallet/balance?address=`
  - `POST /api/wallet/topup-scan { address }` → scan + crédit idempotent
  - `GET /api/wallet/ledger?address=&limit=`
- UI : section "Mon solde CRC" dans `src/components/profile-modal.tsx` avec bouton "Charger" → modal QR topup + polling. i18n section `wallet`.

**3b — Paiement par solde (1-2j)**
- `src/lib/wallet.ts` : `debitForGame(address, gameKey, slug, amount, playerToken)` atomique via `UPDATE players SET balance_crc = balance_crc - X WHERE balance_crc >= X RETURNING` + INSERT ledger + UPDATE table du jeu (set player1/2Address, player1/2Token, player1/2TxHash='balance:<ledgerId>'). Le tout dans `db.transaction()`.
- Route `POST /api/wallet/pay-game { gameKey, slug, address, playerToken, amount, ballValue? }` — dispatch multi/chance via les mêmes registries que `/api/game-ticket`.
- UI `ChancePayment` + `GamePayment` : toggle en haut du formulaire de paiement. Si `balanceCrc >= betCrc` → option "Payer avec solde (X CRC)" présélectionnée + bouton unique "Payer avec mon solde". Sinon QR/Mini App comme avant. Ne jamais appeler ça en `isDemo`.
- Mode demo : `src/components/demo-provider.tsx` → méthodes `debitBalance/creditBalance/topupBalance`, localStorage `nf-demo-balance` (défaut 100).

**3c — Crédit des gains (1j)**
- Rechercher tous les appels à `executePayout` dans `src/app/api/*/` (~15-20 callsites).
- Pour chaque **gain joueur** : remplacer par `creditWallet(winner, amount, { reason: "prize:<game>:<slug>" })`.
- Pour la **commission DAO** : créditer `players (address = DAO_TREASURY_ADDRESS)` via `creditWallet`. Address fixe à définir dans une env var.
- `scanGamePayments` (`src/lib/multiplayer.ts`) : **inchangé**. La garde `if (!game.player1Address)` ignore déjà les parties attribuées par `/pay-game`.
- Vérifier que le flow on-chain (paiement direct QR) continue de marcher pour les users sans solde — les 2 flows doivent coexister.

**3d — Cashout (1j)**
- Helper `cashout(address, amount, proof)` dans wallet.ts. `proof` = `{ type:'miniapp-sig', signature }` OU `{ type:'payment-proof', authToken }`.
- Route `POST /api/auth/verify-cashout { address, amountCrc }` → crée un token one-shot lié à (address, amount), renvoie lien de paiement proof (nouvelle session payment-proof type `cashout`, data=`nf_cashout:{token}:{amount}`).
- Route `POST /api/wallet/cashout { address, amountCrc, proof }` → re-valide la preuve (même si une session nf-auth est valide, cashout **re-demande** toujours une signature ou un payment-proof dédié), débite atomiquement, appelle `executePayout({ gameType:"wallet", gameId: "cashout-<ledgerId>", ... })`. Si payout on-chain échoue → `creditWallet(reason:"cashout-refund", ledgerId)` pour rollback.
- UI ProfileModal : bouton "Retirer" → modal avec input montant + flow signature Mini App OU payment-proof web.

**3e — Polish (0.5j)**
- Mode demo complet (solde démarre à 100, UI cohérente en demo).
- History ledger dans ProfileModal (5 dernières entrées + bouton "voir tout").
- Monitoring invariant : endpoint admin `GET /api/admin/wallet-health` → `{ totalBalances, safeCrcBalance, diff }`.
- Build + push.

### Points d'attention

- **Concurrence** : `UPDATE players SET balance_crc = balance_crc - X WHERE address = ? AND balance_crc >= X RETURNING *` sérialise naturellement sur la row. 0 rows updated → `insufficient_balance`. INSERT ledger dans la **même transaction**.
- **Topup sans `data`** : tx ignorée par le scan. Pour recovery manuel admin, prévoir un endpoint `POST /api/admin/credit-topup { txHash, address, amount }` (avec admin token).
- **Gagnants sans row `players`** : `creditWallet` doit upsert à la volée.
- **Cashout échoué on-chain** : re-crédit automatique via ledger (pattern de compensation).
- **Safe balance** : quand tous les users cashout en même temps, le Safe doit couvrir. Invariant à monitorer.
- **Mini App signature** : vérifier si `miniapp-bridge.ts` expose déjà une primitive `signMessage`. Sinon à ajouter (postMessage `{ type: "sign_message", message }` + response handler). Cf. `src/lib/miniapp-bridge.ts`.
- **DAO_TREASURY_ADDRESS** : définir dans `.env.local` + `.env.neon`. Typiquement une multisig NF distinct du Safe (pour séparer bankroll jeux et trésorerie DAO). À discuter avec le user.

### Fichiers à créer

```
drizzle/0010_add_wallet.sql
scripts/migrate-wallet.mjs
src/lib/wallet.ts
src/app/api/wallet/balance/route.ts
src/app/api/wallet/topup-scan/route.ts
src/app/api/wallet/pay-game/route.ts
src/app/api/wallet/cashout/route.ts
src/app/api/wallet/ledger/route.ts
src/app/api/auth/verify-cashout/route.ts
src/app/api/admin/wallet-health/route.ts
```

### Fichiers à modifier

```
src/lib/db/schema.ts               # balanceCrc + walletLedger
src/lib/circles.ts                 # generateTopupPaymentLink + "wallet" dans gameKeys
src/lib/i18n.ts                    # section wallet
src/components/profile-modal.tsx   # section solde + modals topup/cashout
src/components/chance-payment.tsx  # toggle solde vs CRC direct
src/components/game-payment.tsx    # toggle solde vs CRC direct
src/components/demo-provider.tsx   # méthodes debit/credit/topup
```

Puis ~15-20 fichiers sous `src/app/api/*/` pour remplacer `executePayout(winner, ...)` par `creditWallet(...)`.

## Références utiles

- Pattern payment-proof : `src/app/api/shop/auth/route.ts` (shop) et `src/app/api/nf-auth/route.ts` (ce qu'on a fait en Phase 2)
- Pattern scan : `src/lib/multiplayer.ts` (`scanGamePayments`)
- Payout Safe : `src/lib/payout.ts` (`executePayout`)
- Mini App bridge : `src/lib/miniapp-bridge.ts`
- Game data encoding : `src/lib/game-data.ts`
- Tables DB : `src/lib/db/schema.ts` + `src/lib/db/schema/*.ts`

## Ordre conseillé

1. Migration Neon Phase 2 → tester le flow recovery end-to-end (20 min)
2. Si tout roule → démarrer Phase 3a (fondations wallet), commit, push, test isolé
3. Phase 3b (pay-game) après validation 3a
4. Phase 3c (crédit gains) — **attention, toucher aux payouts = affecte toutes les parties en cours**. Bien tester
5. Phase 3d (cashout) — feature critique côté UX
6. Phase 3e (polish + monitoring)

Check `npx tsc --noEmit` après chaque sous-phase. Push à chaque commit pour que preview Vercel se mette à jour.

---

Fin du handoff. Si questions architecturales : relire `.claude/plans/la-avec-tout-le-clever-octopus.md`.
