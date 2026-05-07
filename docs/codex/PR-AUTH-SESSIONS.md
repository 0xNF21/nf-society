# PR Auth - Sessions serveur NF Society

> Brief Codex/Claude. Lis `CODEX-PROJECT-CONTEXT.md` puis
> `docs/codex/AUTH-MINIAPP-SIGNMESSAGE.md` avant de coder.

---

## Header

- **Branche** : `feat/auth-sessions`
- **Base** : `master`
- **Status** : draft
- **Fichiers touches** : a estimer
- **Typecheck** : a faire
- **Build** : a faire
- **Smoke local/preview** : obligatoire

---

## 1. Scope

Ajouter une vraie session serveur pour identifier l'adresse joueur sans faire
confiance aux `address` envoyees par le client.

Deux modes d'auth :

- Mini App Circles officielle : `sign_message` passkey + verification serveur
- Standalone web : paiement preuve 1 CRC + refund

---

## 2. Pourquoi cette PR

Le pivot F2P a ferme les mises CRC, mais plusieurs routes lisent encore
`address` depuis le body client. C'est suffisant pour l'UX, pas pour la securite.

Exemples de risques :

- `players/xp` peut encore donner les rewards d'une action connue a une adresse
  arbitraire jusqu'a ce que la route soit session-gated.
- Les routes multi peuvent attribuer des actions a une adresse spoofee.
- Les parametres profil/settings peuvent etre modifies sans preuve serveur forte
  si une route trust le body.

PR #51 a deja ferme le P0 `xpOverride`, mais pas le probleme general
d'identite client.

---

## 3. Etat avant cette PR

Ce qui existe :

- `useMiniApp()` expose `walletAddress` pour l'UX Mini App.
- `sendPayment(...)` permet de declencher des transactions via Mini App.
- Standalone utilise QR/deeplink Gnosis pour les paiements.
- Plusieurs flows ont deja un pattern challenge + paiement 1 CRC
  (`daily`, `cashout`, `shop_auth`, etc.).

Ce qui manque :

- Pas de session serveur commune.
- Pas de helper central `getAuthenticatedAddress(req)`.
- Pas de verification serveur de signature Mini App.
- Trop de routes acceptent `address` depuis le body.

---

## 4. Changements

### Nouveau schema DB

Ajouter deux tables Drizzle :

```ts
auth_challenges
  id uuid primary key
  method text not null              // miniapp_sign_message | payment_1crc
  nonce text unique not null
  message text not null
  expected_address text
  tx_hash text
  signature text
  created_at timestamptz
  expires_at timestamptz
  used_at timestamptz
  metadata jsonb

auth_sessions
  id uuid primary key
  address text not null
  token_hash text unique not null
  created_at timestamptz
  last_active_at timestamptz
  expires_at timestamptz
  hard_expires_at timestamptz
  revoked_at timestamptz
  origin text                       // miniapp | standalone
  user_agent_hash text
```

### Nouveaux helpers backend

- `src/lib/auth/session.ts`
  - `createAuthChallenge(method, opts)`
  - `verifyMiniAppSignature(challengeId, signature, expectedAddress?)`
  - `verifyPaymentChallenge(challengeId, txHash?)`
  - `createAuthSession(address, origin)`
  - `getAuthenticatedAddress(req)`
  - `requireAuthenticatedAddress(req)`
  - `revokeSession(req)`

### Nouvelles routes API

- `POST /api/auth/challenge`
- `POST /api/auth/verify-signature`
- `POST /api/auth/verify-payment`
- `GET /api/auth/session`
- `POST /api/auth/logout`

### Frontend

- `AuthProvider` / `useAuthSession`
- Mini App :
  - utiliser `sign_message`
  - fallback paiement 1 CRC via `sendPayment`
- Standalone :
  - afficher QR/deeplink 1 CRC
  - poll verification paiement

### Routes a patcher en priorite

P0/P1 :

- `src/app/api/players/xp/route.ts`
- `src/app/api/{jeu}/start-free/route.ts`
- routes de move multi : morpion, dames, memory, relics, pfc
- `src/app/api/wallet/pay-game/route.ts`
- routes shop XP/profile/settings qui modifient un etat joueur

P2 :

- endpoints purement read peuvent rester avec address param si non sensibles
- cashout peut rester autonome dans cette PR car il a deja step-up paiement

---

## 5. Out of scope

Ne pas faire dans cette PR :

- Migration `balance_crc -> legacy_balance_crc`
- Season Zero / competitions schema
- Refonte UI complete profil/login
- Suppression de tous les usages read-only de `address`
- Changement legal/payout/cashout hors besoin auth

---

## 6. Questions Codex

1. La verification Mini App `sign_message` est-elle robuste pour Safe / ERC-1271 ?
2. Faut-il utiliser `signatureType: "raw"` ou `erc1271` pour notre backend ?
3. Cookie unique `SameSite=None` partout, ou deux cookies Mini App / Standalone ?
4. Le fallback paiement 1 CRC doit-il etre disponible en Mini App des la PR ?
5. Les challenges doivent-ils expirer en 10 min ou moins ?
6. Le refresh sliding toutes les 1h suffit-il pour l'UX jeu ?
7. Quelles routes doivent etre bloquantes dans Auth-1 vs reportables ?
8. Comment eviter un replay si une signature arrive deux fois en parallele ?
9. Wallet switch Mini App : logout auto ou re-auth silencieux ?

---

## 7. Commit structure prevue

```bash
# Commit 1 - docs
git add docs/codex/AUTH-MINIAPP-SIGNMESSAGE.md docs/codex/PR-AUTH-SESSIONS.md CODEX-PROJECT-CONTEXT.md
git commit -m "docs(auth): document Mini App sign_message auth plan"

# Commit 2 - schema + helpers
git add src/lib/db/schema/* src/lib/auth/*
git commit -m "feat(auth): add challenge and session primitives"

# Commit 3 - auth API routes
git add src/app/api/auth/*
git commit -m "feat(auth): add session challenge and verification endpoints"

# Commit 4 - frontend provider
git add src/components/* src/hooks/*
git commit -m "feat(auth): add client session provider and login flows"

# Commit 5 - route gating
git add src/app/api/**/*
git commit -m "feat(auth): gate player mutation routes behind sessions"

# Commit 6 - polish/tests
git add <tests/docs/fixes>
git commit -m "test(auth): cover session verification flows"
```

---

## 8. Suivi post-merge

- [ ] Smoke preview Mini App officielle : `sign_message -> session`
- [ ] Smoke preview Standalone : 1 CRC auth -> refund -> session
- [ ] Smoke `players/xp` : sans session 401, avec session OK
- [ ] Smoke morpion multi : J1/J2 detects via session, pas via body spoof
- [ ] Smoke logout + re-login
- [ ] Verifier cookie dans iframe Mini App
- [ ] Communication users : "connexion securisee requise"

