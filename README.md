# NF Society

**FR** | Plateforme de jeux communautaire du DAO NF Society, construite sur Gnosis Chain avec le protocole Circles (CRC).

**EN** | Community gaming platform by NF Society DAO, built on Gnosis Chain with the Circles protocol (CRC).

---

## Features / Fonctionnalites

### Multiplayer Games / Jeux multijoueurs (CRC bet / mise CRC)
- **Morpion** - Tic-tac-toe
- **Memory** - Card matching / Jeu de paires
- **Dames** - Checkers / Jeu de dames
- **Relics** - Battleship / Bataille navale
- **Pierre-Feuille-Ciseaux** - Rock-Paper-Scissors (Best of 3 or 5 / Best of 3 ou 5)

### Chance Games / Jeux de chance
- **Lotteries / Loteries** - Transparent blockchain draws / Tirages au sort transparents sur la blockchain
- **Lootbox** - Randomized reward boxes / Coffres avec recompenses aleatoires

### Economy / Economie
- **CRC Exchange / Echange CRC** - Convert personal CRC to NF Society CRC / Convertir ses CRC personnels en CRC NF Society
- **Shop / Boutique** - XP-based purchases / Achats avec XP
- **Daily Rewards / Recompense quotidienne** - Scratch card & spin wheel / Scratch card et roue de la chance
- **Jackpot** - Community pool fed by games / Pool communautaire alimentee par les jeux

### Progression
- **XP & Levels / XP et niveaux** - 10 levels (0 - 20,000 XP) / 10 niveaux (0 - 20 000 XP)
- **Badges** - Secret & visible achievements / Achievements secrets et visibles
- **Player Profile / Profil joueur** - Stats, history, Circles avatar / Stats, historique, avatar Circles
- **Leaderboard / Classement** - Top players ranking / Classement des meilleurs joueurs

### Circles Mini App
**EN** | The app works both standalone (QR code + Gnosis link) and as a Circles Mini App (direct payment via iframe postMessage). Detection is automatic.

**FR** | L'app fonctionne en mode standalone (QR code + lien Gnosis) ET en mode Mini App Circles (paiement direct via iframe postMessage). La detection est automatique.

---

## Tech Stack / Stack technique

| Technology / Technologie | Usage |
|---|---|
| Next.js 14 | App Router, SSR |
| TypeScript | Type safety / Typage |
| Tailwind CSS | Styling |
| PostgreSQL + Drizzle ORM | Database / Base de donnees |
| Circles Protocol | On-chain CRC payments / Paiements CRC on-chain (Gnosis) |
| Gnosis Safe + Roles Modifier | Automated winner payouts / Payout automatique des gains |
| Radix UI | Accessible components / Composants accessibles |
| ethers.js / viem | Blockchain interactions |

---

## Quickstart

```bash
npm install
npm run dev
```

### Environment Variables / Variables d'environnement

```env
# Database / Base de donnees
DATABASE_URL=postgresql://...

# Circles / Gnosis
NEXT_PUBLIC_CIRCLES_RPC_URL=https://rpc.aboutcircles.com/
NEXT_PUBLIC_DEFAULT_RECIPIENT_ADDRESS=0x...

# Payout (server / serveur)
SAFE_ADDRESS=0x...
BOT_PRIVATE_KEY=0x...
ROLES_MODIFIER_ADDRESS=0x...
ROLE_KEY=0x...
MAX_PAYOUT_CRC=1000
```

---

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
    shop/                 # Shop / Boutique
    player/[address]/     # Player profile / Profil joueur
    multijoueur/          # Multiplayer hub / Hub multijoueur
    dashboard/            # Player dashboard
    dashboard-dao/        # DAO dashboard
  components/
    game-payment.tsx      # Multiplayer payment (Mini App + standalone)
    chance-payment.tsx    # Chance game payment (Mini App + standalone)
    miniapp-provider.tsx  # Circles Mini App React context
    daily-modal.tsx       # Daily rewards / Recompense quotidienne
    exchange-section.tsx  # CRC exchange / Echange CRC
  lib/
    circles.ts            # Circles RPC, payment links, tx detection
    miniapp-bridge.ts     # postMessage SDK for Circles iframe
    payout.ts             # Payout via Gnosis Safe
    xp.ts                 # XP system & levels / Systeme XP et niveaux
    badges.ts             # Badge system / Systeme de badges
    game-data.ts          # Tx data encoding/decoding
    db/schema/            # PostgreSQL tables (Drizzle)
  hooks/
    use-payment-watcher.ts  # Real-time payment detection
```

---

## How it works / Comment ca marche

### Payments / Paiements
1. **EN** Player creates or joins a game with a CRC bet / **FR** Le joueur cree ou rejoint une partie avec une mise en CRC
2. **Standalone mode** : Gnosis App link opens to pay (+ QR code) / Un lien Gnosis App s'ouvre pour payer (+ QR code)
3. **Mini App mode** : "Pay X CRC" button sends tx directly via Circles wallet / Un bouton "Payer X CRC" envoie la tx directement via le wallet Circles
4. **EN** Server polls the blockchain to detect the payment / **FR** Le serveur poll la blockchain pour detecter le paiement
5. **EN** Game starts when both players have paid / **FR** La partie demarre quand les 2 joueurs ont paye

### Payout
- **EN** Winner automatically receives winnings via Gnosis Safe / **FR** Le gagnant recoit automatiquement ses gains via Gnosis Safe
- **EN** 5% commission per game / **FR** Commission de 5% sur chaque partie
- **EN** Retry system on failure / **FR** Systeme de retry en cas d'echec

### i18n
- French & English / Francais et Anglais
- FR/EN toggle in header / Toggle FR/EN dans le header

---

## License / Licence

Proprietary - NF Society DAO
