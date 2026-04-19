# Handoff — Wallet NF Society (Phase 3 — session 2)

Pour reprendre en local depuis Claude Code. Lis ce fichier, puis continue.

## Contexte

**Projet** : NF Society — plateforme DAO sur Gnosis Chain, jeux CRC.
**Objectif global** : solde CRC prépayé → jouer sans tx on-chain par partie → cashout possible.
**Branche active** : `master` (Phase 3 mergée dans master via `b2dfdfa`).

## État actuel — ce qui est livré

### Phase 1 (Babanoue) — ✅
Restauration partie après refresh en pleine partie (multi-layer defensive fix).

### Phase 2 (NF Auth recovery) — ✅
Retrouver une partie perdue (localStorage clear, nouveau device) via preuve d'adresse 1 CRC remboursé.

### Phase 3a (fondations wallet) — ✅
- `players.balance_crc` + table `wallet_ledger` (schéma + migration locale + Neon)
- `src/lib/wallet.ts` : getBalance, creditWallet, scanWalletTopups, getLedger
- Routes : `/api/wallet/balance`, `/api/wallet/topup-scan`, `/api/wallet/ledger`, `/api/wallet/config`, `/api/wallet/commission`
- UI : `<WalletBalanceCard>` dans ProfileModal + `<TopupModal>` + i18n section `wallet`
- `generateTopupPaymentLink()` + `checkAllWalletTopups()` dans circles.ts
- Mode demo : localStorage nf-demo-progress avec balanceCrc, méthodes credit/debit

### Phase 3b (pay-from-balance) — ✅
- `payGameFromBalance()` dans wallet.ts + route `POST /api/wallet/pay-game`
- Dispatcher `src/lib/wallet-game-dispatch.ts` — 14+ jeux supportés :
  - Multi (6) : morpion, memory, relics, dames, pfc, crc-races (non déployé encore)
  - Chance action (8) : roulette, hilo, plinko, mines, dice, crash_dash, keno, blackjack
  - Lottery + daily (claim gratuit, route dédiée)
- UI : `<BalancePayButton>` + hook `useConnectedAddress` → intégré dans ChancePayment + GamePayment
- Synthetic txHash format `balance:{ledgerId}` pour les rows de jeu

### Phase 3c (credit wins to balance) — ✅
- Helpers `creditPrize()` + `creditCommission()` + `payPrize()` + `payCommission()` dans wallet.ts
- DAO treasury pseudo-address `0x000000000000000000000000000000000000da00`
- **Asymétrique** : pay on-chain → win on-chain ; pay balance → win balance
- 19 routes migrées (chance action, scan routes, multi action, draw, daily scratch/spin)

## Bugs corrigés pendant Phase 3

1. Fast Refresh interrompait les spins → dev-time only
2. `await fetch(NEXT_PUBLIC_APP_URL/api/players/xp)` bloquant quand port dev != env var → `void fetch(...).catch(() => {})` (10 routes fixées)
3. Mines/Keno balance-pay manquait `mineCount`/`pickCount` → balanceExtras passés dans ChancePayment
4. Dice tables manquantes en local → `scripts/migrate-dice-local.mjs`
5. Dérive nonce bot entre dev/prod → auto-resync dans `src/lib/payout.ts`
6. Schema drift `payouts.amount_crc` integer→real en local → `scripts/fix-payouts-column-local.mjs`

## ⚠️ Ce qu'il reste à faire

### Phase 3d — Cashout (pas fait)
Retirer du solde vers wallet Circles + preuve d'adresse standalone.

Scope (voir `.claude/plans/la-avec-tout-le-clever-octopus.md`) :
- Helper `cashout(address, amount, proof)` dans wallet.ts
- Route `POST /api/auth/verify-cashout { address, amountCrc }` → token one-shot
- Route `POST /api/wallet/cashout { address, amountCrc, proof }` → débit atomique + `executePayout` + rollback crédit si échec
- UI ProfileModal : bouton "Retirer" → modal (input montant + flow payment-proof ou miniapp signature)
- Preuve standalone : 1 CRC payment-proof type "cashout", data `nf_cashout:{token}:{amount}`

### Phase 3e — Polish/monitoring (pas fait)
- Endpoint `GET /api/admin/wallet-health` → `{ totalBalances, safeCrcBalance, diff }`
- Historique ledger dans ProfileModal (5 dernières + voir tout)
- Verif invariant : `sum(players.balance_crc) ≈ Safe_CRC_balance_onchain`

### Ajouts optionnels Phase 3b/3c
- **coin_flip + lootbox au pay-from-balance** : instant-resolve games nécessitent un refactor mineur de `creditWallet` pour partager la transaction DB avec le débit, permettant un flow atomique débit → résolution → crédit dans une seule transaction.
- **Scan routes XP fetch blocking** : 10 fichiers restants ont `await fetch(XP)` bloquant (roulette-scan, hilo-scan, etc.). Moins critique que action routes (user ne voit pas la réponse en temps réel) mais même pattern à fix en `void fetch(...).catch()`.

## Bugs potentiels (à tester après)

La session 1 (actuelle) a beaucoup touché au code. Points de vigilance pour la prochaine session :

1. **Tester tous les jeux balance-pay** : chaque jeu (roulette, hilo, mines, dice, plinko, crash_dash, keno, blackjack, morpion, memory, relics, dames, pfc, lottery) doit :
   - Afficher card "Payer avec mon solde" quand balance >= bet
   - Débit atomique quand on clique
   - Round/partie créée sans tx on-chain
   - Action de jeu fonctionne (spin/reveal/etc.)
   - Win → crédit solde (si balance-pay) ou on-chain (si on-chain-pay)
2. **Tester topup live** : 1 CRC depuis Gnosis App → polling détecte → solde monte. Fix du 18/04 : `armWatching` déclenché sur QR/Copy/Link click.
3. **Tester daily claim from balance** : bouton "Réclamer mon daily (gratuit)" sans débit.
4. **Vérifier invariant sur Neon** : `sum(balance_crc) + DAO_TREASURY` vs Safe on-chain balance (devrait être équivalent).

## Scripts ops utiles (session 1 a beaucoup grossi ce dossier)

Voir `scripts/README.md` pour la liste complète. Highlights :
- `check-wallet-state.mjs <address>` — state players + ledger
- `check-bot-nonce.mjs [.env.local|.env.neon]` — dérive nonce bot
- `compare-crc-columns.mjs` — drift schema local vs Neon
- `fix-payouts-column-local.mjs` — repair int→real + retrigger orphans
- `resync-and-retry-nf-auth.mjs` — repair refund NF Auth failed
- `smoke-pay-game.mjs` — smoke test /api/wallet/pay-game
- `smoke-wallet.mjs` — smoke test routes wallet
- `smoke-lottery-daily.mjs` — smoke test lottery + daily balance flows
- `migrate-wallet.mjs --neon` — migration Phase 3a (déjà appliquée)
- `migrate-nf-auth.mjs --neon` — migration Phase 2 (déjà appliquée)
- `migrate-dice-local.mjs` — dice tables en local

## Env vars

- `SAFE_ADDRESS` = `0x960A0784640fD6581D221A56df1c60b65b5ebB6f` (Safe relayer)
- `DAO_TREASURY_ADDRESS` = `0x000000000000000000000000000000000000da00` (pseudo-address, commission tracking)
- `BOT_PRIVATE_KEY` = même clé sur dev/prod (attention dérive nonce)
- `NEXT_PUBLIC_APP_URL` = doit matcher le port du dev server (sinon XP fetch fail)
- `ROLES_MODIFIER_ADDRESS`, `ROLE_KEY`, `ADMIN_PASSWORD` = existants

## Où reprendre

**Session 2 — options dans l'ordre suggéré :**

1. **Tester Phase 3 end-to-end** : jouer à chaque famille de jeu (multi, chance action, chance instant, lottery, daily) en balance-pay + on-chain. Identifier les bugs réels (pas les bugs de dev Fast Refresh).

2. **Phase 3d (cashout)** : critique, sinon le solde est one-way (tu peux charger mais pas retirer). ~1-2 jours de taf.

3. **Ajouts optionnels** : coin_flip/lootbox balance-pay, fix scan routes XP fetch blocking, phase 3e monitoring.

4. **Polish UI** : la card balance pourrait avoir un lien direct vers l'historique ledger, un avatar ou lien cashout quand 3d est fait.

## Important — git hygiene

Session 1 a eu des galères de branche (VSCode / IDE auto-switch). Pour session 2 :
- **Travailler sur master** désormais (Phase 3 y est mergée).
- Si un outil switch sur une autre branche, `git checkout master` puis revenir au taf.
- NE PAS refaire de cherry-pick inter-branches sans un plan clair.

## Derniers commits master

```
b2dfdfa Merge Phase 3: wallet (balance + pay-from-balance + credit-wins)
09d5bf3 Fix blackjack split/double race condition and orphan claims
6cb603a fix(build): force-dynamic on chance game lobbies + stats
```

Branche `claude/add-wallet-balance-9ajNn` existe toujours pour historique (preview Vercel dispo), mais master = source de vérité maintenant.

---

**Fin du handoff v2.** Bonne session 2.
