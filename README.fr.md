# NF Society

[Read in English](README.md)

Arcade communautaire free-to-play du **DAO NF Society**, construite sur
**Gnosis Chain** avec le protocole **Circles** (tokens CRC).

NF Society utilise maintenant les **Fragments** comme solde arcade jouable. Les
joueurs peuvent lancer des parties, progresser, gagner de l'XP, débloquer des
badges et recevoir certaines **récompenses CRC** sans miser ni déposer de CRC
pour jouer.

---

## Direction Produit Actuelle

### Free-to-Play D'abord

- Aucune participation payante pour lancer les jeux par défaut.
- Aucune mise CRC, aucun pot CRC alimenté par les joueurs, aucun payout CRC de
  fin de partie issu d'une mise.
- Les jeux utilisent les **Fragments**, un solde arcade off-chain.
- Les Fragments ne sont pas retirables et ne sont pas convertibles en CRC.
- Les CRC sont réservés aux récompenses configurées par la plateforme ou le DAO,
  aux remboursements legacy et aux retraits legacy.

### Fragments

Les Fragments sont le rail principal de jeu :

- les joueurs gagnent des Fragments via les récompenses de plateforme, notamment
  le daily ;
- les jeux multijoueur et arcade débitent des Fragments quand un joueur
  participe ;
- les victoires créditent des Fragments au joueur ;
- le house edge / les commissions sont suivis dans un pool de Fragments DAO ;
- certains champs historiques `betCrc` existent encore dans les tables comme
  unité de référence, mais le rail F2P convertit ce montant en Fragments.

Le helper de conversion actuel est :

```ts
1 CRC-référence = 10 Fragments
```

### Récompenses CRC

Le CRC reste important, mais ce n'est plus la mise normale des jeux.

- Les récompenses CRC peuvent venir d'allocations DAO/communautaires, de saisons
  skill, de bounties ou de campagnes de récompenses configurées.
- Les récompenses de type saison doivent être claimables après snapshot et
  review, pas payées instantanément à la fin d'une partie.
- Les utilisateurs qui avaient un solde CRC avant le pivot peuvent toujours le
  retirer depuis leur dashboard.

---

## Fonctionnalités

### Jeux (17)

**Multijoueur / skill (6)** - parties gratuites avec Fragments :

- Morpion
- Memory
- Dames
- Relics (stratégie type bataille navale)
- Pierre-Feuille-Ciseaux
- Courses Fragments

**Jeux arcade chance (11)** - modes solo arcade avec Fragments :

- Blackjack
- Coin Flip
- Crash Dash
- Dice
- Hi-Lo
- Keno
- Mines
- Plinko
- Roulette
- Loteries
- Lootboxes

**Récompenses quotidiennes** - flow daily centré sur les Fragments, la progression
XP et les récompenses configurées.

### Progression

- Système XP avec 10 niveaux.
- Badges et achievements, y compris des badges secrets.
- Boutique Fragments pour achats arcade et cosmétiques.
- Profil joueur avec avatar Circles et statistiques.
- Classement global et statistiques de plateforme.

### DAO / Rewards

- Dashboard trésorerie et stats DAO.
- Rail de récompense CRC pour les rewards DAO et distributions validées par
  l'admin.
- Cible Season Zero : saison courte de skill, participation gratuite, pool CRC
  DAO fixe, snapshot, review anti-cheat, puis rewards claimables.

### Modes d'interface

**Standalone** - ouvrir `nf-society.vercel.app` dans n'importe quel navigateur.

**Mini App Circles** - le projet peut tourner en iframe native dans l'app
Circles / Gnosis. L'app utilise encore le contexte wallet/Circles quand il est
utile, notamment pour le profil, les rewards et le cashout legacy.

La détection est automatique via `useMiniApp()`, donc les composants affichent
la bonne UI selon le contexte.

### Sécurité / Infrastructure

- `LEGAL_MODE=F2P_ONLY` est la posture runtime par défaut.
- Les routes CRC real-stakes sont protégées et demandent une configuration
  explicite.
- Le routing de payout source-aware empêche une partie financée en Fragments de
  payer accidentellement en CRC.
- Rate-limit adossé à Upstash Redis sur les routes d'écriture et admin.
- Payouts CRC automatisés via Gnosis Safe + Zodiac Roles Modifier pour les
  rewards validées, remboursements et cashouts legacy.
- Bot Telegram de support (grammy) routant les messages vers des topics du
  forum.
- Tracking d'erreurs Sentry + Vercel Analytics.

---

## Stack Technique

- **Framework** - Next.js 14 (App Router) + TypeScript.
- **Base de données** - PostgreSQL via Drizzle ORM.
- **Blockchain** - Protocole Circles sur Gnosis Chain, ethers.js + viem.
- **Rewards / payouts** - Gnosis Safe + Zodiac Roles Modifier pour les transferts
  CRC validés.
- **Solde arcade** - rail Fragments dans `src/lib/wallet-fragments.ts`.
- **Gardes F2P** - `src/lib/legal-mode.ts`, `src/lib/stakes.ts`, et payout
  source-aware dans `src/lib/payout.ts`.
- **Rate-limit** - Upstash Redis (`@upstash/ratelimit`) avec fallback in-memory
  en dev.
- **UI** - Tailwind CSS, primitives Radix (shadcn/ui).
- **i18n** - maison en FR/EN via React Context.

---

## Démarrage Rapide

```bash
git clone https://github.com/0xNF21/nf-society.git
cd nf-society
npm install
cp .env.example .env.local  # remplir les valeurs
npm run db:migrate          # crée les tables sur un Postgres vide
npm run dev                 # localhost:3000
```

Voir [`.env.example`](.env.example) pour la liste complète des variables
nécessaires.

---

## Commandes

```bash
npm run dev          # serveur dev Next.js (port 3000)
npm run build        # build production
npm run start        # lance le build production
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit

npm run db:generate  # génère une migration depuis un changement de schéma
npm run db:migrate   # applique les migrations en attente à DATABASE_URL
npm run db:push      # push le schéma directement (dev uniquement)
npm run db:studio    # explore la DB avec drizzle-kit studio
npm run db:check     # vérifie la cohérence des migrations et snapshots
```

---

## Architecture (Résumé)

```text
src/
  app/
    api/         # routes API : jeux, Fragments, wallet, admin, scan, payout
    <jeux>/      # 17 pages de jeux : un lobby + une page de jeu chacune
    shop/        # Boutique Fragments
    chance/      # Hub arcade chance
    multijoueur/ # Hub multijoueur
    admin/       # Dashboard admin
    dashboard/   # Dashboard joueur et cashout legacy
  components/    # Composants React + primitives shadcn/ui
  lib/
    db/schema/             # Schéma Drizzle, un fichier par domaine
    fragments.ts           # Helpers de conversion Fragments
    wallet-fragments.ts    # Rail de jeu F2P
    payout.ts              # Payouts source-aware
    legal-mode.ts          # Garde F2P niveau env
    stakes.ts              # Gardes real-stakes par jeu
    wallet.ts              # Helpers legacy solde/cashout CRC
    circles.ts             # RPC Circles + helpers de paiement
    rate-limit.ts          # Rate limiter adossé à Upstash
    miniapp-bridge.ts      # SDK postMessage pour Mini App Circles
```

Pour la documentation contributeur détaillée, voir
[`CODEX-PROJECT-CONTEXT.md`](CODEX-PROJECT-CONTEXT.md) et [`CLAUDE.md`](CLAUDE.md).

---

## Licence

Propriétaire - NF Society DAO
