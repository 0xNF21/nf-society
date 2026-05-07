# PR 2 — Legal Pivot Follow-up (admin scripts)

> Brief Codex. Lis `CODEX-PROJECT-CONTEXT.md` à la racine d'abord pour le contexte projet général.

---

## Header

- **Branche** : `fix/legal-pivot-followup-pr2`
- **Base** : `master` (post-merge PR #45)
- **Status** : in review (non-committée → en cours de commit)
- **Fichiers touchés** : 3 nouveaux (1 brief + 2 scripts)
- **Typecheck** : N/A (scripts `.mjs` purs)
- **Smoke** : ✅ refund-all-balances déjà exécuté en prod (2 wallets)
- **Smoke cleanup** : ✅ dry-run validé, attente exécution post-merge

---

## 1. Scope

PR de suivi du pivot légal. Deux scripts admin one-shot pour l'audit trail et le cleanup résiduel :

1. **`scripts/admin/refund-all-balances.mjs`** — refund on-chain des balances actives. **Déjà exécuté** sur prod (2 wallets remboursés). On le commit ici comme pièce d'audit.
2. **`scripts/admin/cleanup-dust-balances.mjs`** — absorbe les balances dust (< 0.01 CRC) vers DAO_TREASURY via wallet_ledger comptable, sans tx on-chain. **À exécuter après merge.**

L'objectif PR 2 original (cancel/refund parties pendantes) est **moot** : il n'y a aucune partie active en prod au moment du pivot. Donc la PR 2 se réduit à ces 2 scripts.

---

## 2. Pourquoi cette PR

**Côté légal** : avoir l'audit trail des refunds dans le repo (commit message documente l'exécution prod : tx hashes, montants, blocs).

**Côté tech** : le dust restant dans `players.balance_crc` (4 wallets × < 0.001 CRC chacun) crée une dérive minime de l'invariant `sum(balance_crc) ≈ Safe_onchain_balance`. Le cleanup l'absorbe dans le DAO_TREASURY pour rétablir une comptabilité propre.

---

## 3. État avant cette PR

### Post-PR #45 + exécution refund

- ✅ Code PR1 mergé, déployé, smokes prod OK
- ✅ `LEGAL_MODE=F2P_ONLY` posé en env Vercel prod
- ✅ Flags Neon `real_stakes=hidden` + `chance_games_xp_only=hidden`
- ✅ 2 wallets utilisateur remboursés en CRC on-chain :
  - `0x04f6fa9...3190dba0` → 103.3 CRC ([tx 0x159910a9...4e52](https://gnosisscan.io/tx/0x159910a949b424215b523a592d331ebae96f2e6742b579e1525df939ebdc4e52), bloc 46052151, status=1)
  - `0x9cd8ec1...a0526927` → 1.02 CRC ([tx 0x0a1e3882...50b0](https://gnosisscan.io/tx/0x0a1e38820738f40b3f99e8df43261675ce478400b9ea14214a132b671e4650b0), bloc 46052152, status=1)

### Reste à traiter

- 2 wallets dust avec balance_crc minime (< 0.001 CRC chacun) :
  - `0x778f752...8d3f8c9` → 0.00012 CRC
  - `0xc73a709...4f1f9ceb7` → 0.0000028 CRC
- Total : 0.000125 CRC — non-refundable on-chain (gas > valeur)

---

## 4. Changements

### Nouveau

#### `docs/codex/PR2-LEGAL-PIVOT-FOLLOWUP.md`
Ce fichier.

#### `scripts/admin/refund-all-balances.mjs`
Script one-shot pour rembourser les balances utilisateur en CRC on-chain via Safe + Roles Modifier.

Caractéristiques :
- Idempotent (UNIQUE `wallet_ledger.tx_hash` + UNIQUE `payouts.gameId`)
- Dry-run par défaut (`DRY_RUN=true`)
- Pre-flight check : vérifie que la Safe a assez de CRC avant tout débit
- Filtre les pseudo-adresses système (DAO_TREASURY, zero address)
- Throttle RPC (`DELAY_MS=1500` entre payouts)
- Redaction des credentials dans les logs (helper `describeDatabaseTarget`)
- `MIN_REFUND_CRC` configurable pour skipper le dust
- `MAX_PAYOUT_CRC` plafond de sécurité par compte

Le script utilise `payoutReason: "admin_correction"` qui passe priorité 3 du routing `executePayout` introduit en PR1, donc fonctionne même en `LEGAL_MODE=F2P_ONLY`.

#### `scripts/admin/cleanup-dust-balances.mjs`
Script one-shot pour absorber les balances dust dans DAO_TREASURY, **purement comptable** (pas d'on-chain).

Caractéristiques :
- Idempotent (UNIQUE `wallet_ledger.tx_hash` sur 2 ledger entries par compte)
- Dry-run par défaut
- Filtre DAO_TREASURY lui-même (cible d'absorption, pas source)
- Transaction PG par compte (les 2 ledger entries + 2 balance updates sont atomiques)
- Net effect : `user.balance_crc → 0`, `DAO_TREASURY.balance_crc += dust`

Pourquoi pas un refund on-chain ? Le gas (~0.001 xDAI) dépasse la valeur transférée (< 0.001 CRC). L'absorption préserve l'invariant comptable sans gas gaspillé.

### Modifié
Aucun fichier source.

---

## 5. Out of scope

❌ Ne propose **pas** :
- Migration `balance_crc → legacy_balance_crc` → PR 4
- Schema `competitions`/`seasons`/`reward_allocations` → PR 5
- Refonte produit / wording UI → PR 3
- Tests automatisés (pas de framework jest/vitest configuré)
- Communication users (le founder a dit qu'il skip — zéro user impacté à grande échelle)

---

## 6. Questions Codex

### Sécurité

1. **`describeDatabaseTarget`** masque user/password mais affiche host/port/db. C'est OK pour les logs (acceptable de savoir qu'on tape sur Neon prod) mais ça expose l'infrastructure. Te paraît correct, ou tu préfères masquer aussi le hostname ?

2. **`SYSTEM_ADDRESSES`** dans refund-all-balances.mjs est codé en dur (`0x...da00` + zero address). Si quelqu'un ajoute une 3e pseudo-adresse côté code source plus tard, ce script deviendrait bug-prone. Faut-il un mécanisme plus robuste ? Ou OK puisque c'est un one-shot ?

### Cleanup dust

3. **Choix d'absorption vs refund on-chain** : pour 0.000125 CRC total répartis sur 2 wallets, le coût gas dépasse la valeur. L'absorption vers DAO_TREASURY te paraît la bonne option ? Alternative possible : juste zéroer les balances sans toucher au DAO (drift de 0.000125 CRC dans l'invariant — invisible en pratique).

4. **Transaction atomique du cleanup** : le script fait BEGIN/COMMIT par compte. Si une partie échoue au milieu (DAO upsert OK mais ledger DAO échoue par exemple), le ROLLBACK protège. Vérifie que je n'ai pas un cas où l'invariant se casse partiellement.

5. **Idempotence cleanup** : les `tx_hash` sont `legal-pivot-dust-writeoff:${address}` et `legal-pivot-dust-writeoff-dao:${address}`. Re-run = ON CONFLICT DO NOTHING → skip du compte. OK ?

### Régression

6. **Refund script déjà exécuté** : ce code est en prod state, pas en code state — autrement dit, les rows existent dans Neon mais le code n'était pas committé. En committant maintenant, est-ce qu'on crée un risque (par ex. quelqu'un re-run le script, idempotent skip, mais log confus) ? Mon avis : non, l'idempotence couvre ça.

7. **Le script cleanup utilise `kind='cashout-refund'` pour le débit user et `kind='commission'` pour le crédit DAO**. Ces 2 kinds existent déjà dans `LedgerKindAll`. Te paraît sémantiquement correct ?

### Naming

8. **`legal-pivot-dust-writeoff` vs `legal-pivot-dust-absorb`** : laquelle est plus claire dans le contexte audit légal ? J'ai utilisé "writeoff" qui implique "abandon de créance" — c'est juridiquement parlant ce qu'on fait.

---

## 7. Commit structure prévue

```bash
# Commit 1 — Brief PR2
git add docs/codex/PR2-LEGAL-PIVOT-FOLLOWUP.md
git commit -m "docs(codex): add PR2 brief for legal pivot follow-up scripts"

# Commit 2 — Refund script (audit trail, deja execute)
git add scripts/admin/refund-all-balances.mjs
git commit -m "chore(legal): add refund-all-balances admin script (audit trail)"

# Commit 3 — Cleanup script (a executer post-merge)
git add scripts/admin/cleanup-dust-balances.mjs
git commit -m "feat(legal): add cleanup-dust-balances script for sub-cent balances"
```

---

## 8. Suivi post-merge

- [ ] Codex review de cette PR (3 commits)
- [ ] Merge PR
- [ ] Exécuter cleanup-dust-balances en dry-run sur prod : `ENV_FILE=.env.codex-vercel-production.local node scripts/admin/cleanup-dust-balances.mjs`
- [ ] Si dry-run OK : `DRY_RUN=false ENV_FILE=.env.codex-vercel-production.local node scripts/admin/cleanup-dust-balances.mjs`
- [ ] Vérifier en prod : `SELECT address, balance_crc FROM players WHERE balance_crc > 0` ne devrait montrer que `DAO_TREASURY` (avec son cumul historique + le dust absorbé)
- [ ] Lancer **PR 3 (wording)** : casino → arcade, mise → participation, etc.
