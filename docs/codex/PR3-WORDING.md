# PR 3 - Arcade wording pivot

> Brief Codex. Lis `CODEX-PROJECT-CONTEXT.md` a la racine d'abord pour le contexte projet general.

---

## Header

- **Branche** : `fix/wording-arcade-pivot-pr3`
- **Base** : `master`
- **Status** : ready for Codex review
- **Fichiers touches** : 57 fichiers UI/i18n + ce brief
- **Typecheck** : `npm run typecheck` OK
- **Build** : non teste
- **Smoke local** : non teste

---

## 1. Scope

Remplace le vocabulaire user-facing lie aux mises CRC/casino par le vocabulaire Arcade / XP / participation / recompenses. Cette PR ne change aucune logique backend, aucun schema DB, aucune route API, aucun rail de paiement.

---

## 2. Pourquoi cette PR

PR #45 a verrouille le backend, PR #46 a finalise les refunds, PR #47 a verrouille l'UI fail-closed. Il reste a aligner les textes visibles pour eviter que l'app promette encore "casino", "mises CRC", "jackpot" ou "payouts" alors que le produit est en Free-to-Play.

---

## 3. Etat avant cette PR

- Le mode prod est F2P-only : `LEGAL_MODE=F2P_ONLY`, flags DB legal hidden/coming-soon, top-ups et XP->CRC bloques.
- Plusieurs textes visibles gardent l'ancien vocabulaire real-stakes : landing legacy, pages docs, stats, pages chance, labels de paiement, pages de jeux.
- Certains termes doivent rester intacts car ils designent le retrait legacy ou des noms techniques internes.

### Findings de l'audit

- **Finding A** (important) - `src/lib/i18n/*`, pages `tsx` - textes visibles encore centres sur casino/mise/bet/jackpot/payout.
- **Finding B** (important) - `src/app/twitter-image.tsx` et pages marketing/docs - promesses "Joue, mise, gouverne" / "Payouts automatiques" obsoletes post-pivot.
- **Finding C** (hors scope, a decider separement) - `/exchange` et `ExchangeSection` restent un ancien flux d'echange CRC si le flag `exchange` est visible. Cette PR ne le modifie pas car ce serait un changement de comportement/paiement, pas du wording. A traiter en hotfix separe si le flag n'est pas hidden en prod.

---

## 4. Changements

### Nouveau

- `docs/codex/PR3-WORDING.md` - brief de review PR3.

### Modifie

- `src/lib/i18n/*` - wording FR/EN aligne Arcade/F2P.
- Pages et composants TSX user-facing - remplacement des strings hardcodees visibles.
- `src/app/manifest.ts` - description PWA alignee Arcade/F2P.
- `src/components/spin-wheel.tsx` / `src/components/scratch-card.tsx` - labels daily affiches via `useStakeLabel` pour eviter `+ CRC` / `JACKPOT` visibles en F2P.

### Matrice de comportement avant/apres

| Cas | Avant | Apres |
|---|---|---|
| Landing | "casino", "mise", "bet", "payout" | "arcade", "participation", "XP", "recompenses" |
| Pages jeux | CTA et aides en CRC/mise | CTA et aides en participation/XP quand visible |
| Stats | "casino bank", "CRC bet" | "arcade pool", "participations" |
| Cashout legacy | Retrait visible et explicite | Inchange |

---

## 5. Out of scope

Ne propose pas :

- Migration `balance_crc` -> `legacy_balance_crc` / `claimable_rewards_crc` - PR4.
- Schema competitions/seasons/reward_allocations - PR5.
- Season Zero MVP - PR6.
- Changement de logique de paiement, flags, API, DB, scripts admin.
- Desactivation ou refonte de `/exchange` / `ExchangeSection` - a traiter en hotfix separe si le flag `exchange` est visible en prod.
- Renommage de noms internes : `betCrc`, `payoutCrc`, `payoutReason`, `WalletBalanceCard`, routes `/api/wallet/cashout-*`.
- Renommage du retrait legacy : `cashout`, `Withdraw`, `Retirer` doivent rester clairs pour les users.

---

## 6. Questions Codex

### Coherence

1. Les remplacements gardent-ils la distinction entre XP arcade et CRC legacy withdraw ?
2. Les pages chance parlent-elles encore de "loterie/casino/jackpot" comme promesse monetaire visible ?

### Securite / legal

3. Reste-t-il un CTA visible qui incite a deposer, miser, parier ou gagner des CRC ?
4. A-t-on garde explicitement le droit de retrait legacy sans le diluer ?

### Regression

5. Les composants qui utilisent `translations.*` ont-ils toujours toutes leurs cles `fr` et `en` ?
6. Les remplacements n'ont-ils pas touche aux noms techniques requis par les API ?

### Naming & conventions

7. Le vocabulaire "Arcade", "participation", "XP", "recompense" est-il coherent entre FR et EN ?
8. Les termes admin/internal restants sont-ils acceptables car non user-facing ?

---

## 7. Commit structure prevue

```bash
# Commit 1 - Brief PR3
git add docs/codex/PR3-WORDING.md
git commit -m "docs(codex): add PR3 wording pivot brief"

# Commit 2 - Wording UI + i18n
git add src/lib/i18n src/app src/components src/lib/game-registry.ts
git commit -m "fix(wording): align UI copy with arcade F2P pivot"
```

---

## 8. Suivi post-merge

- [ ] Verifier la preview Vercel visuellement sur home, hub, chance, shop, stats, profil.
- [ ] Smoke prod non destructif apres merge.
- [ ] Demarrer PR4 migration balances.
