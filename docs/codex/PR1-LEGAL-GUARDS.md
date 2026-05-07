# PR 1 — Legal F2P Guards

> Brief Codex. Lis `CODEX-PROJECT-CONTEXT.md` à la racine d'abord pour le contexte projet général.

---

## Header

- **Branche** : `fix/legal-f2p-guards-pr1`
- **Base** : `master`
- **Status** : in review (non-committée)
- **Fichiers touchés** : 12 modifiés + 1 nouveau, +297 / -32 lignes
- **Typecheck** : ✅
- **Build** : non testé en CI
- **Smoke local** : non testé

---

## 1. Scope

Verrouille les rails de paiement pour empêcher tout drain CRC en mode F2P. Purement défensif côté code : **pas de migration DB, pas de produit, pas de wording**.

---

## 2. Pourquoi cette PR

L'audit (PR 0) a trouvé 5 problèmes critiques dans l'infra F2P existante (voir section 3). Le plus grave : en mode `real_stakes=enabled`, un joueur pouvait jouer en XP via `/api/{jeu}/start-free` puis se faire payer en CRC réels depuis la Safe (drain).

PR 1 ferme cette exposition avant tout autre chantier. Cf. `CODEX-PROJECT-CONTEXT.md` section 5 (pivot légal) et section 7 (roadmap).

---

## 3. État avant cette PR

### Findings de l'audit (5 problèmes)

#### A. Fail-open du flag (CRITIQUE) — `src/lib/stakes.ts:79-92`
- Si flag manquant en DB → défaut `"enabled"` (CRC mode)
- Si DB inaccessible → catch retourne `{realStakes: true}` (CRC mode)
- Donc une panne DB ou un toggle flag mal fait = retour automatique en mode CRC

#### B. Pas de `LEGAL_MODE` env-level
Aucun kill switch indépendant de la DB. Le seul filet est le flag DB, lui-même fail-open.

#### C. Boutique XP → CRC active — `src/app/api/shop/buy/route.ts:146`
Si l'item est category=`crc`, ça appelle `executePayout({gameType: "shop_crc"})` ce qui transfert des CRC réels au joueur. C'est le mécanisme XP → CRC qui donne une valeur monétaire à l'XP — incompatible avec le pivot.

#### D. Refunds dispatchent en XP en F2P — `src/lib/payout.ts:336`
`executePayout` ne distingue pas wins et refunds. En F2P (`real_stakes=hidden`), un refund de `gameType: "morpion-refund"` (qui rembourse un overpaiement CRC reçu sur la Safe) part en XP → CRC bloqués dans la Safe.

#### E. Rail `xp:` mishandled (vulnérabilité réelle, drain CRC)
**La pire trouvaille.** En mode `real_stakes=enabled` :
1. Joueur appelle `/api/morpion/start-free` (pas de gate) → débit XP
2. Partie devient active avec `txHash = "xp:N"`
3. Il gagne, `payPrize` appelé avec `sourceTxHash = "xp:N"`
4. `isBalancePaid("xp:N")` → false → tombe dans `executePayout`
5. `isRealStakesEnabled("morpion")` → true → **transfert on-chain CRC depuis la Safe**

Bonus : `payCommission` retournait `onchain-implicit` (no-op) pour les sources XP, donc la commission XP était silencieusement perdue (pas créditée au `dao_xp_pool`).

#### F. `/api/payout` admin trop permissif — `src/app/api/payout/route.ts:37`
Endpoint avec juste `ADMIN_PASSWORD` qui accepte n'importe quel `gameType` et exécute le transfert. Pas catastrophique (admin only) mais pas de whitelist.

---

## 4. Changements

### Nouveau
- **`src/lib/legal-mode.ts`** — kill switch env-level
  ```ts
  export type LegalMode = "F2P_ONLY" | "REAL_STAKES_ALLOWED";
  export function getLegalMode(): LegalMode;
  export function isF2POnlyMode(): boolean;
  export function areTopupsEnabled(): boolean;
  ```
  Défaut **F2P_ONLY**. Une env var manquante en prod retombe automatiquement en F2P.

### Modifié

#### `src/lib/stakes.ts` — fail-closed + court-circuit env
- Defaults DB passés de `"enabled"` à `"hidden"` (kill par défaut si flag absent)
- Catch DB error retourne `{realStakes: false}` au lieu de `true`
- `isRealStakesEnabled` court-circuit sur `isF2POnlyMode()` avant lecture DB

#### `src/lib/payout.ts` — routing par priorités
Nouveau type `PayoutReason` (whitelist sémantique) :
```
legacy_cashout, game_refund, dao_reward, admin_correction  ← OK en F2P
game_win, shop_crc, daily_random_crc, lottery_win, unknown ← bloqués en F2P
```

`PayoutRequest` étendu avec `sourceTxHash?` et `payoutReason?` optionnels.

`executePayout` refactorisé en routing à 5 priorités :
1. `sourceTxHash="xp:..."` → `executeXpPayout` (toujours XP, ignore mode/flags)
2. `sourceTxHash="balance:..."` → blocked (utiliser `creditPrize`)
3. `reason ∈ {legacy_cashout, game_refund, dao_reward, admin_correction}` → `executeOnchainPayout`
4. `LEGAL_MODE = F2P_ONLY` → blocked (filet final)
5. `REAL_STAKES_ALLOWED` → fallback flag-based

`inferPayoutReason(gameType)` infère depuis le `gameType` quand `payoutReason` est absent.

L'ancien corps de `executePayout` est extrait en `executeOnchainPayout` privé (logique on-chain Safe + Roles inchangée).

#### `src/lib/wallet.ts` — source-aware payPrize/payCommission
- `payPrize` passe `sourceTxHash` et `payoutReason` à `executePayout`. Détecte les draws via `gameRef` contenant `draw` ou `refund` → reason `game_refund`. Sinon `game_win`.
- `payCommission` route les commissions XP vers `dao_xp_pool` (avant : silencieusement perdues).
- Cashout passe `payoutReason: "legacy_cashout"` explicite.

#### `src/app/api/wallet/topup-scan/route.ts` — 410 Gone en F2P
Remplace `respondIfStakesDisabled()` par `areTopupsEnabled()` qui retourne 410 avec code `TOPUPS_DISABLED_LEGAL_PIVOT`.

#### `src/app/api/shop/buy/route.ts` — 410 sur category=crc en F2P
Block early avant le débit XP, code `XP_TO_CRC_DISABLED`.

#### `src/app/api/payout/route.ts` (admin) — whitelist
Le body accepte `payoutReason` (optionnel, défaut `admin_correction`). Whitelist `ALLOWED_REASONS = {legacy_cashout, game_refund, dao_reward, admin_correction}`. Toute autre reason → 403.

#### 6 routes `start-free` (morpion, dames, memory, pfc, relics, crc-races)
Ajout d'un guard early :
```ts
if (await isRealStakesEnabled(gameKey)) {
  return NextResponse.json(
    { error: "USE_PAID_PATH", ... },
    { status: 403 },
  );
}
```
Ferme la vulnérabilité finding E.

### Matrice de comportement avant/après

| Cas | Avant | Après |
|---|---|---|
| `LEGAL_MODE` absent | flag DB seul, fail-open | F2P_ONLY par défaut |
| DB en panne | retourne CRC mode | retourne F2P (kill switch on) |
| `xp:` source + real-stakes mode | **on-chain CRC drain** ⚠️ | XP forcé (priority 1) |
| `balance:` source dans executePayout | indéfini | blocked avec code clair |
| Refund (`*-refund`) en F2P | XP par erreur ⚠️ | on-chain (priority 3) |
| `shop_crc` en F2P | XP credit silencieux | blocked (priority 4) |
| Topup en F2P | 403 si flag | 410 Gone (env-level) |
| `start-free` + real-stakes mode | accès libre, drain CRC ⚠️ | 403 USE_PAID_PATH |
| Admin `/api/payout` `gameType=blackjack` | exécuté | rejeté (reason hors whitelist) |
| Cashout legacy en F2P | OK | OK (whitelist payoutReason) |
| Commission sur partie XP | perdue silencieusement | dao_xp_pool credit |

---

## 5. Out of scope (sacré)

❌ Ne propose **pas** :
- Migration DB `balance_crc → legacy_balance_crc` → PR 4
- Tables `competitions`, `seasons`, `reward_allocations` → PR 5
- Tests automatisés (pas de framework jest/vitest configuré, à ajouter en PR séparée)
- Refonte produit / wording UI (casino → arcade) → PR 3
- Cancel/refund des parties pendantes → PR 2 (script séparé, post-merge PR 1)
- Module Season Zero, tournois → PR 6
- Système de claim CRC pour les rewards DAO → PR 5/6
- Renommage ou refacto des helpers existants au-delà du nécessaire

L'objectif PR 1 est strictement défensif : verrouiller les rails sans rien casser des flux existants.

---

## 6. Questions Codex

### Cohérence du routing
1. **Vérifie l'ordre de priorité dans `executePayout`** — est-ce que tu vois un cas où un payout pourrait skip une priorité par erreur ? Spécialement : que se passe-t-il si `sourceTxHash="xp:N"` ET `payoutReason="game_refund"` ? (Réponse attendue : priority 1 XP gagne.)

2. **Le `inferPayoutReason`** détecte-t-il correctement tous les patterns refund ? Cherche les call sites de `executePayout` (16) dans le repo et confirme que chaque gameType tombe dans la bonne reason.

3. **Le whitelist `ALLOWED_REASONS` dans `/api/payout`** — manque-t-il un cas légitime ? Devrait-on y ajouter d'autres ?

### Sécurité
4. **`payPrize` détecte les draws via `gameRef.includes("draw") || gameRef.includes("refund")`** — heuristique suffisamment robuste ? Risque de faux positifs/négatifs ? Faudrait-il plutôt un paramètre explicite passé par le call site ?

5. **`payCommission` xp:** route maintenant vers `dao_xp_pool`. Vérifie l'idempotence : si la commission est calculée 2 fois (replay d'une action), est-ce qu'on double-crédite ? La table `dao_xp_pool` a-t-elle une contrainte UNIQUE qui le protégerait ?

6. **Le `start-free` guard** — est-ce qu'il y a un autre point d'entrée pour le rail XP que j'aurais oublié ? Cherche dans le repo tous les call sites de `payGameFromXp`.

### Régression
7. **Mode `REAL_STAKES_ALLOWED`** — est-ce que les flux CRC normaux marchent toujours ? Spécialement : un refund de `morpion-refund` doit aller on-chain, pas en XP. Trace le code pour confirmer.

8. **Cashout legacy en F2P** — c'est le cas le plus important côté UX. Vérifie que `wallet/cashout-init` + `executePayout(gameType: "cashout", payoutReason: "legacy_cashout")` aboutit bien à un transfert on-chain en mode F2P_ONLY.

9. **Les daily refunds** (`gameType: "daily-refund"`) — `inferPayoutReason` les classe `game_refund` (correct). Mais les daily wins (`daily-spin`, `daily-scratch`) sont classés `daily_random_crc` (correct, bloqués en F2P). Confirme que le code daily n'a pas un autre chemin pour payer du CRC.

### Naming & conventions
10. **L'inversion sémantique de `chance_games_xp_only`** est conservée (`"enabled"` = nominal, `"hidden"` = force XP). C'est confusing mais on ne renomme pas dans cette PR. Te paraît-il OK ?

11. **Code `F2P_ONLY` env vs `flag=hidden`** : 2 façons de désactiver les mises. La PR fait le bon choix de prioriser l'env. Mais y a-t-il des risques de désynchronisation visible côté UI (ex : le client voit `flags.real_stakes=enabled` mais le serveur bloque) ?

---

## 7. Commit structure prévue

```bash
# Commit 1 — Legal mode + fail-closed
git add src/lib/legal-mode.ts src/lib/stakes.ts
git commit -m "feat(legal): add LEGAL_MODE env guard and fail-closed stake flags"

# Commit 2 — Source-aware payouts
git add src/lib/payout.ts src/lib/wallet.ts
git commit -m "feat(legal): source-aware payout routing with PayoutReason whitelist"

# Commit 3 — Disable topups + XP→CRC shop
git add src/app/api/wallet/topup-scan/route.ts src/app/api/shop/buy/route.ts
git commit -m "feat(legal): disable CRC topups and XP-to-CRC shop in F2P mode"

# Commit 4 — Guard start-free + admin payout
git add src/app/api/morpion/start-free/route.ts \
        src/app/api/dames/start-free/route.ts \
        src/app/api/memory/start-free/route.ts \
        src/app/api/pfc/start-free/route.ts \
        src/app/api/relics/start-free/route.ts \
        src/app/api/crc-races/start-free/route.ts \
        src/app/api/payout/route.ts
git commit -m "feat(legal): guard start-free routes and admin payout against drain"
```

---

## 8. Suivi post-merge (PR 2 et au-delà)

Une fois PR 1 mergée et la branche déployée :
- [ ] Vérifier en prod : `LEGAL_MODE=F2P_ONLY` posée explicitement (ou absente, défaut F2P)
- [ ] Toggle DB : `real_stakes=hidden`, `chance_games_xp_only=hidden`
- [ ] Smoke local + prod : `/api/wallet/topup-scan` doit retourner 410, `/api/morpion/start-free` doit fonctionner en F2P
- [ ] Communiquer aux users (bannière + email/Discord) : "mises et top-ups CRC désactivés, soldes restent retirables"
- [ ] Lancer **PR 2 (transition)** : script admin qui annule les parties pendantes et rembourse les paiements en suspens
