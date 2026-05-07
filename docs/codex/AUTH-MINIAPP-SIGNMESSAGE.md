# Auth Mini App Circles - sign_message

> Decision record pour Claude + Codex. A lire avant de coder la PR Auth.

---

## Decision

Pour la Mini App officielle Circles, l'auth cible n'est pas le paiement 1 CRC.

La cible est :

```txt
Mini App hosted Circles -> sign_message + verification serveur -> session cookie
Standalone web          -> paiement auth 1 CRC + refund -> session cookie
Fallback Mini App       -> paiement auth 1 CRC + refund si sign_message indisponible
```

Pourquoi : le host Mini App officiel expose un protocole `postMessage` avec
`sign_message` et reponse `sign_success`. C'est plus fluide que forcer un
paiement 1 CRC dans la Mini App, tout en restant verifiable cote serveur.

---

## Sources verifiees

- Page developpeur Mini Apps : https://miniapps.aboutcircles.com/developers
- Repo officiel : https://github.com/aboutcircles/CirclesMiniapps
- README officiel, protocole `postMessage` :
  - mini app -> host : `request_address`, `send_transactions`, `sign_message`
  - host -> mini app : `wallet_connected`, `tx_success`, `sign_success`
- Code officiel host :
  - `src/lib/iframeHost.ts` recoit `sign_message`
  - `wallet.signMessage(...)` signe via Safe / passkey
  - reponse : `{ type: "sign_success", signature, verified, requestId }`

---

## Ce que ca change

Avant la verification, on pensait :

```txt
Mini App + Standalone -> meme preuve par paiement 1 CRC
```

Apres verification :

```txt
Mini App officielle -> preuve par signature passkey
Standalone          -> preuve par transaction 1 CRC
```

Le backend doit traiter les deux preuves comme deux chemins d'entree vers le
meme resultat : une session serveur longue duree.

---

## Flow Mini App cible

1. Front Mini App appelle `POST /api/auth/challenge`.
2. Serveur cree un challenge avec :
   - `id`
   - `nonce`
   - `message` lisible a signer
   - `expires_at`
   - `used_at = null`
   - `method = "miniapp_sign_message"`
3. Front envoie au host :

```ts
window.parent.postMessage({
  type: "sign_message",
  message: challenge.message,
  signatureType: "raw",
  requestId,
}, "*");
```

4. Host Circles affiche l'approbation passkey.
5. Host repond :

```ts
{
  type: "sign_success",
  signature,
  verified,
  requestId,
}
```

6. Front appelle `POST /api/auth/verify-signature` avec :
   - `challengeId`
   - `signature`
   - adresse attendue si fournie par `wallet_connected`
7. Serveur verifie :
   - challenge existe, non expire, non utilise
   - signature valide pour l'adresse Safe
   - message exact = message du challenge
   - domaine/app attendu inclus dans le message
8. Serveur cree `auth_sessions`, pose cookie HttpOnly, marque challenge `used_at`.

---

## Flow Standalone cible

1. Front appelle `POST /api/auth/challenge`.
2. Serveur cree un challenge `method = "payment_1crc"`.
3. Front affiche QR / deeplink Gnosis avec :
   - destinataire = Safe NF
   - montant = 1 CRC
   - data = `nf_auth:<nonce>`
4. User paie.
5. Front ou serveur poll `POST /api/auth/verify-payment`.
6. Serveur verifie on-chain :
   - tx confirmee
   - `to` = Safe NF
   - montant >= 1 CRC
   - data = `nf_auth:<nonce>`
   - challenge non expire/non utilise
   - sender = adresse authentifiee
7. Serveur cree session + cookie HttpOnly.
8. Serveur refund le 1 CRC.

---

## Cookie et sessions

Session commune aux deux flows :

- token secret seulement en cookie HttpOnly
- hash du token stocke en DB
- 30 jours sliding
- hard cap 90 jours depuis `created_at`
- refresh DB max toutes les 1h pour eviter une write par requete
- logout = `revoked_at = now()`

Cookie :

- Standalone : `SameSite=Lax; Secure`
- Mini App iframe : probablement `SameSite=None; Secure`

Decision technique a prendre dans la PR :

- soit un seul cookie `SameSite=None; Secure` partout
- soit deux noms de cookies selon contexte

---

## Points de securite

- Ne jamais trust `walletAddress` seul : c'est de l'UX, pas une preuve.
- Ne jamais trust `sign_success.verified` seul : le serveur doit verifier aussi.
- Inclure dans le message signe :
  - domaine NF Society
  - URL/app id
  - nonce
  - expiration
  - adresse attendue si connue
  - statement clair : "Sign in to NF Society"
- Marquer le challenge `used_at` atomiquement pour eviter le replay.
- Rate-limit `challenge`, `verify-signature`, `verify-payment`.
- En cas de wallet switch Mini App : detecter changement d'adresse et forcer
  re-auth / logout de la session locale.

---

## Fallback

Si `sign_message` :

- timeout
- renvoie `sign_rejected`
- n'existe pas dans un host non officiel
- echoue a la verification serveur

Alors l'UI Mini App peut proposer le fallback paiement 1 CRC, exactement comme
Standalone mais via `sendPayment(...)`.

---

## Implication pour la PR Auth

La PR Auth doit coder les deux methodes de preuve des le depart :

- `miniapp_sign_message`
- `payment_1crc`

Mais elle peut garder un UI minimal :

- Mini App : bouton "Se connecter avec Circles"
- Standalone : bouton "Connexion securisee 1 CRC rembourse"

Le reste du produit ne doit consommer que `getAuthenticatedAddress(req)`.

