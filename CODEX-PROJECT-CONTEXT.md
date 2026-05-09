# NF Society — Contexte projet pour Codex

**Ground truth permanent.** Ce document ne change pas souvent. Il décrit le projet, l'archi, le pivot légal, et le workflow de collab à 3 (founder + Claude + Codex).

Pour le scope d'une PR précise, lis le brief correspondant dans `docs/codex/PR<N>-<NAME>.md`.

---

## 1. Comment on travaille à 3

- **Founder** (cryptosnf@gmail.com, FR, débutant dev) → décisions stratégiques, valide tout avant merge
- **Claude** (Sonnet via Claude Code) → code la majorité des PR, audits, design technique
- **Codex** (toi) → review, valide, suggère, corrige, peut commit dans des branches séparées

### Règles de collab
1. **Toujours en français** pour les commentaires de code et messages utilisateur
2. **Le founder est débutant dev** → explique le pourquoi avant de modifier, pas juste le quoi
3. **Pas de breaking change non discuté** → si tu veux changer une signature publique, motive-le
4. **Reste dans le scope défini par le PR brief** — la section "Out of scope" est sacrée
5. **Si tu trouves un bug grave hors scope**, signale-le mais ne le fix pas dans la PR en cours
6. **Si tu proposes du code**, branche séparée recommandée : `<branche-claude>-codex-fixes`
7. **Les décisions produit/légales** remontent au founder, pas à toi ou Claude

### Format de review attendu
- Liste numérotée de findings : **critique** / **important** / **nit**
- Ligne précise (`fichier.ts:42`) pour chaque finding
- Si bug grave : propose le fix en patch concret (Edit/Write)
- Réponses aux questions du PR brief
- Sépare ce qui doit bloquer le merge de ce qui est nice-to-have

---

## 2. NF Society en 2 minutes

Plateforme communautaire d'une **DAO** sur **Gnosis Chain** utilisant le **Circles Protocol** (CRC = monnaie communautaire UBI-like avec demurrage annuel).

### Les 17 jeux
- **Multijoueur 1v1** (6) : morpion, dames, memory, pfc (pierre-feuille-ciseaux), relics, crc-races
- **Arcade chance** (11) : blackjack, coin-flip, crash-dash, dice, hilo, keno, mines, plinko, roulette, lootbox, lottery
- **Daily** : drops Fragments/XP et rewards CRC configurees par la plateforme

### Stack
- Next.js 14 App Router, TypeScript
- PostgreSQL via Drizzle ORM (schemas dans `src/lib/db/schema/`, ~51 tables)
- Circles SDK (`@aboutcircles/sdk`) + Ethers.js / Viem
- Tailwind + shadcn/ui dans `src/components/ui/` (ne pas modifier ces fichiers)
- i18n maison FR/EN dans `src/lib/i18n.ts` — toutes les strings UI passent par `translations.X`
- Bot Telegram (grammy) dans `src/lib/telegram/`

### Architecture haut niveau
```
src/
  app/           # Pages + API routes (Next.js App Router)
    api/         # ~130 routes API
    {jeu}/       # Lobby + page de jeu pour chaque jeu
    admin/       # Dashboard admin
    dashboard/   # Dashboard joueur
    dashboard-dao/ # Dashboard treasury DAO
  components/    # 44 composants top-level + ui/ (shadcn)
  lib/
    db/schema/   # Drizzle schemas (1 fichier par domaine)
    fragments.ts # Helpers Fragments (rail arcade F2P)
    wallet-fragments.ts # Debit/credit Fragments pour jouer
    circles.ts   # SDK Circles, liens paiement legacy, scan tx legacy
    payout.ts    # Payout source-aware (Fragments vs CRC)
    wallet.ts    # Balance/cashout CRC legacy
    stakes.ts    # Kill switch F2P
    legal-mode.ts # Kill switch env-level
    payment.ts   # Encodage gameData dans tx
    miniapp-bridge.ts # SDK postMessage Mini App
```

---

## 3. Rail de jeu actuel : Fragments

Le rail produit par defaut est **Free-to-Play + Fragments**.

### Fragments (actif)
- Aucune tx Gnosis n'est requise pour lancer les jeux par defaut.
- Les routes `start-free` debitent `players.fragments_balance`.
- Les events sont traces dans `game_fragment_events`.
- Les parties recoivent un `sourceTxHash` synthetique `fragments:{eventId}`.
- Les gains de partie creditent des Fragments, jamais des CRC.
- Les Fragments ne sont ni withdrawables ni convertibles en CRC.

Les anciens champs `betCrc` restent souvent dans les tables de jeux comme unite
de reference historique. En F2P, `src/lib/wallet-fragments.ts` convertit cette
reference en Fragments via `crcToFragments()`.

### Rails CRC legacy (non defaut)
- **Direct on-chain** : scan via `/api/{jeu}-scan`, garde par `respondIfStakesDisabled(gameKey)`.
- **Balance CRC** : top-up vers Safe + debit `players.balance_crc`, garde par `LEGAL_MODE` et les flags.
- **Cashout legacy** : reste ouvert pour rembourser les joueurs qui avaient un solde CRC avant le pivot.

Ces rails ne doivent pas etre presentes comme le parcours normal. Pour reactiver
des mises CRC, il faut `LEGAL_MODE=REAL_STAKES_ALLOWED` **et** les flags DB
appropries. Sans configuration explicite, le produit reste en Fragments.

---

## 4. Les 2 modes UI

Détectés automatiquement via `useMiniApp()` :

### Mode A — Standalone (navigateur)
- L'utilisateur ouvre `nf-society.vercel.app` directement
- En F2P, les jeux se lancent avec Fragments sans QR de paiement
- Les QR / liens Gnosis App ne concernent que les rails CRC legacy ou explicitement reactives

### Mode B — Mini App Circles (iframe)
- Le projet tourne en iframe à l'intérieur de l'app Circles/Gnosis
- En F2P, le contexte Mini App sert surtout a l'identite, au profil, aux rewards et au cashout legacy
- Le bouton natif `sendPayment(recipient, amount, data)` ne doit etre utilise que pour un flux CRC autorise
- SDK : `src/lib/miniapp-bridge.ts` + `useMiniApp()` hook
- Auth future : utiliser `sign_message` via le host Mini App officiel quand disponible,
  puis verification serveur de la signature pour creer la session. Voir
  `docs/codex/AUTH-MINIAPP-SIGNMESSAGE.md`.

**Règle stricte** : en F2P, ne pas afficher d'UI de paiement CRC pour lancer une partie. Les composants de paiement (`<GamePayment>`, `<ChancePayment>`, `balance-pay-button`) sont legacy / real-stakes et doivent rester derriere les guards.

---

## 5. Le pivot légal (pourquoi tout ça change)

Le founder pivote la plateforme de **"casino CRC"** vers **"arcade Fragments gratuite + rewards CRC explicites"**.

### Le droit français
L'article L320-1 du Code de la sécurité intérieure et l'ANJ caractérisent un **jeu d'argent** par 4 critères cumulatifs :
1. Offre au public
2. Espérance de gain
3. Part de hasard (même partielle)
4. **Sacrifice financier** (Légifrance : une avance remboursable compte aussi)

L'article L320-1 précise que **les jeux de skill peuvent aussi être visés** quand les autres critères sont réunis. Donc même un Morpion avec mise CRC est légalement risqué.

### La cible produit
- Aucune mise des joueurs
- Aucun top-up CRC
- Aucun pot mutualisé
- Aucune commission CRC issue d'une mise joueur
- Aucun payout CRC de fin de partie issu d'un stake ou d'un pot joueur
- Les jeux peuvent crediter/debiter des Fragments uniquement
- Les CRC distribues viennent de rewards explicites : **DAO**, saisons skill, bounties, daily/config plateforme, remboursements, corrections admin

**Important** : les jeux chance existants restent jouables, mais en **Arcade Fragments**. Les Fragments sont non-convertibles, non-withdrawable, sans valeur monetaire. Les CRC sont reserves aux **rewards explicites** et aux flux legacy autorises.

### Le mot-clé
**Source-aware** : le code distingue les sources de financement par préfixe de `txHash` :

| Préfixe | Source | Rail de payout |
|---|---|---|
| `0x...` (40 hex) | Paiement on-chain réel | Safe + Roles → ERC-1155 transfer |
| `balance:{ledgerId}` | Débit `players.balance_crc` | `creditPrize` → ledger entry |
| `fragments:{eventId}` | Débit Fragments via `game_fragment_events` | `executeFragmentsPayout` → credit Fragments |
| `xp:{eventId}` | Ancien rail XP / compat | traité comme Fragments, jamais Safe |

Le routing doit **respecter le rail d'origine**. Une partie financee en Fragments ne doit JAMAIS payer en CRC, meme par accident.

---

## 6. État de l'infra F2P

### Les 2 flags DB (table `feature_flags`)
- `real_stakes` : `"enabled"` (CRC mode) ou `"hidden"` (F2P)
- `chance_games_fragments_only` : `"enabled"` (nominal) ou `"hidden"` (force Fragments pour chance games même si real_stakes=enabled)

⚠️ **Sémantique inversée pour chance_games_fragments_only** :
- `"enabled"` = override OFF (nominal, on respecte real_stakes)
- `"hidden"` = override ON (force chance en Fragments)

C'est confusing mais on ne renomme pas — historique du projet.

### Truth table
| `real_stakes` | `chance_games_fragments_only` | Comportement |
|---|---|---|
| `enabled` | `enabled` | All CRC |
| `enabled` | `hidden` | Skill multi en CRC, chance en Fragments |
| `hidden` | * | All Fragments |

### Le kill switch env-level (depuis PR 1)
- `LEGAL_MODE` env var, défaut **`F2P_ONLY`**
- Pour réactiver les mises CRC : poser explicitement `LEGAL_MODE=REAL_STAKES_ALLOWED` en prod
- Court-circuit la lecture DB → un oubli d'env var = F2P automatique
- **Fail-closed** sur erreur de lecture flag (catch DB error → F2P)

### Les helpers centraux
- `src/lib/legal-mode.ts` → `getLegalMode()`, `isF2POnlyMode()`, `areTopupsEnabled()`
- `src/lib/stakes.ts` → `isRealStakesEnabled(gameKey?)`, `respondIfStakesDisabled()`, `assertRealStakesEnabled()`
- `src/lib/payout.ts` → `executePayout()` avec routing source-aware par priorites strictes
- `src/lib/wallet.ts` → `payPrize()`, `payCommission()`, `creditPrize()`, `getBalance()`
- `src/lib/fragments.ts` → `crcToFragments()`, `fragmentsToCrc()`, helpers de solde Fragments
- `src/lib/wallet-fragments.ts` → `payGameFromFragments()`, `creditMultiWinnerFragments()`

### Les routes `start-free` (rail Fragments)
Chaque jeu jouable en F2P expose une route `src/app/api/{jeu}/start-free/route.ts`.
Ces routes sont l'equivalent Fragments de l'ancien `/api/wallet/pay-game`.

### Les routes `*-scan` (paiements on-chain legacy)
Toutes gatees par `respondIfStakesDisabled(gameKey)`.

### Le système de payout
`executePayout` route par priorité :
1. `sourceTxHash="fragments:..."` ou `"xp:..."` → `executeFragmentsPayout` (toujours Fragments)
2. `sourceTxHash="balance:..."` → blocked (passer par `creditPrize`)
3. `payoutReason ∈ {legacy_cashout, game_refund, dao_reward, admin_correction}` → `executeOnchainPayout`
4. `payoutReason=daily_random_crc` + `gameType=daily-*` → `executeOnchainPayout`
5. `LEGAL_MODE = F2P_ONLY` → blocked (filet final)
6. `REAL_STAKES_ALLOWED` → fallback flag-based (Fragments si chance_fragments_only force, sinon on-chain)

`PayoutReason` whitelist :
```ts
"legacy_cashout" | "game_refund" | "dao_reward" | "admin_correction"  // OK en F2P
"daily_random_crc" // OK uniquement pour gameType daily-*
"game_win" | "shop_crc" | "lottery_win" | "unknown" // bloqué en F2P
```

---

## 7. Roadmap

| PR | Status | Scope |
|---|---|---|
| **PR 0** | ✅ | Audit (code + sécurité légale) |
| **PR 1** | 🔄 review | Legal F2P guards : LEGAL_MODE, fail-closed, source-aware payouts, gates start-free |
| **PR 2** | ⏳ | Transition : cancel/refund parties pendantes au moment du toggle prod |
| **PR 3** | ⏳ | Wording : casino → arcade, mise → participation, suppression jackpot/bet/stake |
| **PR 4** | ⏳ | Migration `balance_crc → legacy_balance_crc` + `claimable_rewards_crc` |
| **PR 5** | ⏳ | Schema `competitions`, `seasons`, `reward_allocations`, `competition_scores` |
| **PR 6** | ⏳ | Season Zero MVP : 3 jeux skill (Dames + Relics + Memory), dotation DAO fixe |

**Principe de séquence** : couper l'exposition avant de construire le remplacement. Chaque PR est défensive ou additive — jamais "je casse pour reconstruire".

---

## 8. Conventions du projet

### Code
- TypeScript strict, no implicit any
- API routes : `NextResponse.json(...)`, try/catch, validation des params, jamais de stack trace au client
- Pas d'emojis dans le code (sauf demande explicite)
- shadcn/ui dans `src/components/ui/` ne se modifie pas
- Imports via alias `@/` (= `src/`)
- Comments et messages utilisateur **en français**

### Git
- Commits descriptifs avec scope : `feat(legal):`, `fix(payout):`, `refactor(wallet):`
- Jamais `git add .` ou `git add -A` aveuglément
- Toujours vérifier `git status` avant commit
- `--no-verify` interdit sauf demande explicite
- Pas d'amend sauf demande explicite (préfère un nouveau commit)

### DB
- Drizzle ORM exclusivement (pas de raw SQL sauf `tx.execute(sql\`...\`)` pour des cas atomiques)
- Migrations via `npm run db:generate` puis `npm run db:migrate`
- DB Neon en prod, PostgreSQL local en dev
- Le `.env.local` pointe vers PostgreSQL local. Vercel utilise Neon (`.env.neon`).
- Idempotence : tx_hash UNIQUE, gameId UNIQUE, ON CONFLICT DO NOTHING

### i18n
- **Jamais** de string en dur dans les composants (`locale === "fr" ? "..." : "..."`)
- Toujours via `translations.{section}.{key}[locale]`
- Chaque nouveau jeu DOIT avoir sa section i18n complète

### Worktrees vs main repo
Le projet peut avoir des worktrees dans `.claude/worktrees/`. Le repo principal est `C:\Projects\NF-SOCIETY`.
- Le dev server tourne depuis le repo principal
- Les fichiers `public/` (assets) sont seulement dans le repo principal
- Le `.env.local` est seulement dans le repo principal

---

## 9. Comment trouver le brief de la PR en cours

Le founder te dira sur quelle PR il bosse. Pour chaque PR :

```
docs/codex/PR<N>-<NAME>.md   # ex: docs/codex/PR1-LEGAL-GUARDS.md
```

Le brief contient :
- **Scope** précis (ce qui est dedans)
- **Pourquoi** cette PR
- **État avant** (findings d'audit si applicable)
- **Changements** (liste des fichiers modifiés/nouveaux + comportement avant/après)
- **Out of scope** (sacré — ne propose pas ces changements)
- **Questions Codex** (sur quoi le founder veut ton avis spécifiquement)
- **Commit structure** prévue

Si une nouvelle PR commence sans brief, demande au founder de le créer depuis `docs/codex/PR-TEMPLATE.md`.

---

## 10. Références fichiers clés

### Documentation projet
- `CLAUDE.md` — instructions pour Claude (mais utile pour comprendre le projet)
- `CODEX-PROJECT-CONTEXT.md` — ce fichier
- `docs/codex/PR-TEMPLATE.md` — template brief PR
- `docs/codex/PR<N>-<NAME>.md` — brief PR en cours
- `HANDOFF.md` — état historique du projet (Phase 3 balance system)
- `ARCHITECTURE.md` — archi détaillée
- `PLAN-governance.md` — plans gouvernance DAO

### Code stratégique
- `src/lib/legal-mode.ts` — kill switch env (LEGAL_MODE)
- `src/lib/stakes.ts` — kill switch DB flags
- `src/lib/payout.ts` — système payout source-aware
- `src/lib/fragments.ts` — helpers Fragments
- `src/lib/wallet-fragments.ts` — rail F2P Fragments pour lancer/crediter les jeux
- `src/lib/wallet.ts` — balance system legacy + payPrize/payCommission
- `src/lib/circles.ts` — SDK Circles, scan paiements on-chain
- `src/lib/multiplayer.ts` — helpers multi (createMultiplayerGame, scanGamePayments)
- `src/lib/game-registry.ts` — registre central des jeux

### Schemas DB
- `src/lib/db/schema/core.ts` — players, feature_flags, payouts, wallet_ledger
- `src/lib/db/schema/{jeu}.ts` — table par jeu

### Routes critiques
- `src/app/api/{jeu}/start-free/route.ts` — rail Fragments F2P
- `src/app/api/wallet/topup-scan/route.ts` — entrée balance system legacy (410 Gone en F2P)
- `src/app/api/wallet/pay-game/route.ts` — débit balance CRC legacy
- `src/app/api/wallet/cashout-init/route.ts` — retrait legacy toujours ouvert
- `src/app/api/{jeu}-scan/route.ts` — scan paiements on-chain legacy par jeu
- `src/app/api/payout/route.ts` — endpoint admin (whitelist depuis PR 1)

---

## 11. Quand tu démarres une session

1. Lis ce doc en entier (5 min)
2. Lis `docs/codex/PR<N>-<NAME>.md` indiqué par le founder
3. `git branch --show-current` pour confirmer la branche
4. `git diff master..HEAD --stat` pour voir le scope du diff
5. Pose des questions au founder si quelque chose n'est pas clair AVANT de modifier
6. Reviens avec findings + propositions

Bonne session 🤝
