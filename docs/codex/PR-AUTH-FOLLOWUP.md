# PR Auth Follow-up

> Brief Codex. Lis `CODEX-PROJECT-CONTEXT.md` puis `docs/codex/PR-AUTH-SESSIONS.md` avant de coder.

---

## Header

- **Branche** : `feat/auth-followup`
- **Base** : `master` (post-merge PR #52)
- **Status** : draft
- **Fichiers touchés** : ~7-8 fichiers attendus
- **Typecheck** : à faire
- **Smoke local/preview** : recommandé sur les routes moves

---

## 1. Scope

Deux morceaux strictement scope-limité, pour fermer les derniers bords de PR #52 et clôturer le chapitre auth/security :

1. **Reconcile cron** : passer `auth_challenges.status` de `refund_pending` à `refunded` quand `payouts.status='success'`. Audit trail propre, source de vérité = `payouts`.
2. **Gate moves multi** : 6 routes qui trustent encore `body.playerAddress`. Patcher individuellement (pas de batch mécanique — chaque route a sa propre forme de slug/id, ses propres conventions playerToken).

**Hors scope** : Season Zero, DB migration `balance_crc → legacy_balance_crc`, tournament logic, tests automatisés.

---

## 2. Pourquoi cette PR

### Reconcile

PR #52 laisse le challenge en `refund_pending` après broadcast (status='sending' chez `payouts`). Le cron `verifyPendingPayout` flippe `payouts.status` en `success` ou `failed` plus tard. Sans reconcile dédié, `auth_challenges.status` reste éternellement `refund_pending` même quand le refund est confirmé.

→ Audit dashboard et ops queries deviennent moins lisibles avec le temps.

### Moves multi

Les routes de moves multi (morpion, dames, memory, pfc, relics) trustent encore `body.playerAddress` pour identifier le joueur qui joue. Avec PR #52, address vient de la session côté `start-free` (qui crée le row), mais le move POST utilise toujours le body.

Risque résiduel : un attaquant qui connaît `playerToken` (ex: l'a vu dans une URL ou un partage de DOM) pourrait jouer "comme si" il était l'autre joueur. Le `playerToken` étant déjà censé être secret, l'impact est limité, mais Codex a raison de fermer ce vecteur tant qu'on est dans le contexte sécu.

---

## 3. Changements prévus

### Nouveau

- **`src/app/api/cron/auth-reconcile/route.ts`** — cron route protégé par `CRON_SECRET`, scan les `refund_pending` et reconcile depuis `payouts`.
- **`vercel.json`** — ajout d'un 2e cron entry, schedule `0 */6 * * *` (toutes les 6h, conservateur, ajustable selon le plan Vercel).

### Modifié

- **`src/app/api/morpion/[slug]/route.ts`** — POST = move, gate session
- **`src/app/api/dames/[id]/move/route.ts`** — POST = move
- **`src/app/api/memory/[slug]/route.ts`** — POST = move (audit GET aussi)
- **`src/app/api/pfc/[slug]/route.ts`** — POST = move
- **`src/app/api/relics/place/route.ts`** — POST = place navire
- **`src/app/api/relics/shot/route.ts`** — POST = tir

Pattern uniforme à appliquer (mais audit per-route nécessaire) :

```ts
const addressOr401 = await requireAuthenticatedAddress(req);
if (addressOr401 instanceof NextResponse) return addressOr401;
const playerAddress = addressOr401;

// playerToken reste l'anti-cheat pour identifier le slot (P1 vs P2)
// dans la game row. Maintenant cumulé avec address de session :
//   game.player1Address === playerAddress && game.player1Token === playerToken
```

Ne PAS supprimer le `playerToken` — il joue toujours son rôle anti-cheat (identifier quel slot la session contrôle dans cette partie spécifique). C'est address + token combined.

---

## 4. Out of scope

❌ Ne PAS faire dans cette PR :
- Tournament / Season Zero / leaderboard logic
- Migration DB `balance_crc → legacy_balance_crc`
- Refonte UI du jeu / scoring
- Patcher les routes GET (lecture seule, peu sensibles)
- Cashout (déjà autonome via 1 CRC proof)
- Test framework (toujours pas configuré)

---

## 5. Questions Codex

1. La cadence cron `0 */6 * * *` (6h) est-elle OK, ou faut-il plus fréquent ? Vercel free tier limite à daily, Pro permet plus.
2. Le pattern `address + playerToken` combined dans les moves est-il robuste ?
3. Le cron reconcile devrait-il aussi gérer les `refund_pending` orphelins (sans `payouts` row) ? Ils ne devraient pas exister grâce à PR #52, mais en defense in depth ?
4. Routes oubliées dans la liste des moves multi ?

---

## 6. Commit structure prévue

```
1. docs(auth): add PR auth followup brief
2. feat(auth): add reconcile cron for refund_pending → refunded
3. feat(auth): gate morpion move route via session
4. feat(auth): gate dames move route via session
5. feat(auth): gate memory move route via session
6. feat(auth): gate pfc move route via session
7. feat(auth): gate relics place + shot routes via session
```

Ou tout en 2-3 commits si le founder préfère moins de commits :
- Commit 1 : docs
- Commit 2 : reconcile cron
- Commit 3 : gate des 6 routes moves

---

## 7. Smoke plan

### Reconcile cron
- Local : `curl POST http://localhost:3000/api/cron/auth-reconcile -H "Authorization: Bearer <CRON_SECRET>"` → 200 + summary
- Prod : Vercel cron logs après le premier run (6h post-merge)

### Routes moves
- En navigateur, créer une partie morpion en F2P
- Login session → start-free → joue un coup
- Tenter un move avec un autre `address` dans le body → doit être ignoré (session prime)
- Sans cookie auth → 401

---

## 8. Suivi post-merge

- [ ] Vérifier le premier run cron auth-reconcile (logs Vercel)
- [ ] Confirmer qu'aucun user ne signale de problème de jeu après le gate moves
- [ ] **Fin du chapitre auth/security pivot.** Prochaine étape produit : **Season Zero design** (pas du code, juste une page de spec).
