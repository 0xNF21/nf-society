# NF Society

Plateforme de jeux communautaire du DAO NF Society, construite sur Gnosis Chain avec le protocole Circles (CRC).

## Fonctionnalites

### Jeux multijoueurs (mise CRC)
- **Morpion** - Tic-tac-toe classique
- **Memory** - Jeu de paires avec niveaux de difficulte
- **Dames** - Jeu de dames
- **Relics** - Bataille navale
- **Pierre-Feuille-Ciseaux** - Best of 3 ou 5

### Jeux de chance
- **Loteries** - Tirage au sort transparent sur la blockchain
- **Lootbox** - Coffres avec recompenses aleatoires et rarete

### Economie
- **Echange CRC** - Convertir ses CRC personnels en CRC NF Society
- **Boutique** - Achats avec XP
- **Recompense quotidienne** - Scratch card et roue de la chance
- **Jackpot** - Pool communautaire alimentee par les jeux

### Progression
- **XP et niveaux** - 10 niveaux (0 - 20 000 XP)
- **Badges** - Achievements secrets et visibles
- **Profil joueur** - Stats, historique, avatar Circles
- **Classement** - Leaderboard des meilleurs joueurs

### Circles Mini App
L'app fonctionne en mode standalone (QR code + lien Gnosis) ET en mode Mini App Circles (paiement direct via iframe postMessage). La detection est automatique.

## Stack technique

| Technologie | Usage |
|---|---|
| Next.js 14 | App Router, SSR |
| TypeScript | Typage |
| Tailwind CSS | Styling |
| PostgreSQL + Drizzle ORM | Base de donnees |
| Circles Protocol | Paiements CRC on-chain (Gnosis) |
| Gnosis Safe + Roles Modifier | Payout automatique des gains |
| Radix UI | Composants accessibles |
| ethers.js / viem | Interactions blockchain |

## Quickstart

```bash
npm install
npm run dev
```

### Variables d'environnement

```env
# Base de donnees
DATABASE_URL=postgresql://...

# Circles / Gnosis
NEXT_PUBLIC_CIRCLES_RPC_URL=https://rpc.aboutcircles.com/
NEXT_PUBLIC_DEFAULT_RECIPIENT_ADDRESS=0x...

# Payout (serveur)
SAFE_ADDRESS=0x...
BOT_PRIVATE_KEY=0x...
ROLES_MODIFIER_ADDRESS=0x...
ROLE_KEY=0x...
MAX_PAYOUT_CRC=1000
```

## Architecture

```
src/
  app/                    # Pages (App Router)
    morpion/              # Lobby + [slug] game page
    memory/               # Lobby + [slug] game page
    dames/                # Lobby + [id] game page
    relics/               # Lobby + [id] game page
    pfc/                  # Lobby + [slug] game page
    api/                  # API routes (CRUD, scan, payout)
    shop/                 # Boutique
    player/[address]/     # Profil joueur
    multijoueur/          # Hub multijoueur
    dashboard/            # Dashboard joueur
    dashboard-dao/        # Dashboard DAO
  components/
    game-payment.tsx      # Paiement multijoueur (Mini App + standalone)
    chance-payment.tsx    # Paiement jeux chance (Mini App + standalone)
    miniapp-provider.tsx  # Context React Mini App Circles
    daily-modal.tsx       # Recompense quotidienne
    exchange-section.tsx  # Echange CRC
  lib/
    circles.ts            # RPC Circles, liens paiement, detection tx
    miniapp-bridge.ts     # SDK postMessage pour iframe Circles
    payout.ts             # Payout via Gnosis Safe
    xp.ts                 # Systeme XP et niveaux
    badges.ts             # Systeme de badges
    game-data.ts          # Encodage/decodage data dans les tx
    db/schema/            # Tables PostgreSQL (Drizzle)
  hooks/
    use-payment-watcher.ts  # Detection paiement temps reel
```

## Comment ca marche

### Paiements
1. Le joueur cree ou rejoint une partie avec une mise en CRC
2. **Mode standalone** : un lien Gnosis App s'ouvre pour payer (+ QR code)
3. **Mode Mini App** : un bouton "Payer X CRC" envoie la tx directement via le wallet Circles
4. Le serveur poll la blockchain pour detecter le paiement
5. La partie demarre quand les 2 joueurs ont paye

### Payout
- Le gagnant recoit automatiquement ses gains via Gnosis Safe
- Commission de 5% sur chaque partie
- Systeme de retry en cas d'echec

### i18n
- Francais et Anglais supportes sur toute l'app
- Toggle FR/EN dans le header

## Licence

Proprietary - NF Society DAO
