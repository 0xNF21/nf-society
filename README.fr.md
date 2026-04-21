# NF Society

[🇬🇧 Read in English](README.md)

Plateforme de jeux communautaire du DAO **NF Society**, construite sur **Gnosis Chain** avec le protocole **Circles** (tokens CRC).

17 jeux, un système de solde prépayé, un bot Telegram de support, et deux modes de paiement (standalone et Mini App Circles).

---

## Fonctionnalités

### 🎮 Jeux (17)

**Multijoueur (6)** — mise directe en CRC entre joueurs, le gagnant empoche le pot moins 5% de commission :
- Morpion, Memory, Dames, Relics (bataille navale), Pierre-Feuille-Ciseaux, CRC Races

**Chance / casino (11)** — solo contre la maison :
- Blackjack, Coin Flip, Crash Dash, Dice, Hi-Lo, Keno, Mines, Plinko, Roulette, Loteries, Lootboxes

**Récompenses quotidiennes** — scratch card + roue de la chance + jackpot communautaire.

### 💰 Deux modes de paiement

**1. Paiement direct on-chain** (mode original)
- 1 transaction Gnosis par partie
- Le joueur paie depuis son propre wallet Circles
- Détection automatique via polling blockchain

**2. Système de solde** (Phase 3, recommandé)
- Le joueur dépose une fois son solde via une transaction on-chain vers la Safe NF Society
- Chaque partie débite ensuite le solde hors-chaîne (instantané, sans frais de gas)
- Cashout à tout moment : la Safe renvoie le solde restant on-chain
- **Ce n'est pas un wallet custodial** — les utilisateurs gardent leurs propres clés Circles ; le solde est une simple écriture comptable adossée 1:1 aux CRC détenus dans la Safe

### 📱 Deux modes d'interface

**Standalone** — ouvrir `nf-society.vercel.app` dans n'importe quel navigateur. Paiement via lien Gnosis App + QR code (cross-device : scan sur desktop, signature sur mobile).

**Mini App Circles** — le projet tourne en iframe native dans l'app Circles / Gnosis. Signature 1-tap via un bridge `postMessage`, sans QR code.

La détection est automatique via `useMiniApp()` — les composants choisissent la bonne UI selon le contexte.

### 📈 Progression
- Système XP avec 10 niveaux (0 → 20 000 XP)
- Badges (achievements visibles et secrets)
- Boutique avec achats en XP
- Profil joueur avec avatar Circles + stats
- Classement global

### 🛠️ Infrastructure
- Rate-limit adossé à Upstash Redis sur toutes les routes d'écriture et admin
- Payouts automatiques aux gagnants via Gnosis Safe + Zodiac Roles Modifier (permissions cadrées)
- Bot Telegram de support (grammy) routant les messages vers des topics du forum
- Tracking d'erreurs Sentry + Vercel Analytics

---

## Stack technique

- **Framework** — Next.js 14 (App Router) + TypeScript
- **Base de données** — PostgreSQL via Drizzle ORM (51 tables, source unique dans `src/lib/db/schema/`)
- **Blockchain** — Protocole Circles sur Gnosis Chain, ethers.js + viem
- **Autorisation des payouts** — Gnosis Safe + Zodiac Roles Modifier (transferts CRC gatés par un rôle)
- **Rate-limit** — Upstash Redis (`@upstash/ratelimit`) avec fallback in-memory en dev
- **UI** — Tailwind CSS, primitives Radix (shadcn/ui)
- **i18n** — maison en FR/EN via React Context

---

## Démarrage rapide

```bash
git clone https://github.com/0xNF21/nf-society.git
cd nf-society
npm install
cp .env.example .env.local  # remplir les valeurs
npm run db:migrate          # crée les 51 tables sur un Postgres vide
npm run dev                 # localhost:3000
```

Voir [`.env.example`](.env.example) pour la liste complète des variables nécessaires.

---

## Commandes

```bash
npm run dev          # serveur dev Next.js (port 3000)
npm run build        # build production
npm run start        # lance le build production
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit

npm run db:generate  # génère une nouvelle migration à partir d'un changement de schéma
npm run db:migrate   # applique les migrations en attente à DATABASE_URL
npm run db:push      # push le schéma directement (dev uniquement)
npm run db:studio    # explore la DB avec drizzle-kit studio
npm run db:check     # vérifie la cohérence des migrations et snapshots
```

---

## Architecture (résumé)

```
src/
  app/
    api/         # 130+ routes API (jeux, wallet, admin, scan, payout)
    <jeux>/      # 17 pages de jeux — un lobby + une page de jeu chacune
    shop/        # Boutique XP
    chance/      # Hub des jeux de chance
    multijoueur/ # Hub des jeux multijoueur
    admin/       # Dashboard admin
    dashboard/   # Dashboard joueur
  components/    # Composants React (44 top-level + primitives shadcn/ui)
  lib/
    db/schema/        # Schéma Drizzle, un fichier par domaine
    circles.ts        # RPC Circles + génération de liens de paiement + détection tx
    payout.ts         # Payouts Gnosis Safe via Zodiac Roles Modifier
    wallet.ts         # Système de solde (top-up, débit, crédit, cashout)
    rate-limit.ts     # Rate limiter adossé à Upstash
    admin-auth.ts     # Vérif auth admin partagée
    validation.ts     # Validateurs d'input (regex d'adresse, etc.)
    i18n.ts           # Traductions FR/EN
    miniapp-bridge.ts # SDK postMessage pour Mini App Circles
```

Pour la documentation contributeur détaillée, voir [`CLAUDE.md`](CLAUDE.md).

---

## Licence

Propriétaire — NF Society DAO
