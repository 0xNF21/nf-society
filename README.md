# NF Society

[🇫🇷 Lire en français](README.fr.md)

Community-run gaming platform by the NF Society DAO, built on **Gnosis Chain** with the **Circles** protocol (CRC tokens).

17 games, a prepaid balance system, a Telegram support bot, and both standalone and Circles Mini App payment flows.

---

## Features

### 🎮 Games (17)

**Multiplayer (6)** — direct CRC bet between players, winner takes the pot minus 5% commission:
- Morpion (tic-tac-toe), Memory, Dames (checkers), Relics (battleship), Pierre-Feuille-Ciseaux, CRC Races

**Chance / casino (11)** — solo vs the house:
- Blackjack, Coin Flip, Crash Dash, Dice, Hi-Lo, Keno, Mines, Plinko, Roulette, Lotteries, Lootboxes

**Daily rewards** — scratch card + spin wheel + community jackpot pool.

### 💰 Two payment modes

**1. Direct on-chain payment** (original mode)
- 1 Gnosis transaction per game
- Player pays from their own Circles wallet
- Detected automatically via blockchain polling

**2. Balance system** (Phase 3, recommended)
- Player tops up their balance once with a single on-chain deposit to the NF Society Safe
- Each subsequent game debits the balance off-chain (instant, no gas)
- Cashout anytime: the Safe sends the remaining balance back on-chain
- **Not a custodial wallet** — users keep their own Circles keys; the balance is a prepaid book-keeping entry backed 1:1 by CRC held in the Safe

### 📱 Two UI modes

**Standalone** — open `nf-society.vercel.app` in any browser. Payment is done via Gnosis App link + QR code (cross-device: scan on desktop, pay on mobile).

**Circles Mini App** — the project runs as a native iframe inside the Circles / Gnosis wallet app. Payment is signed with one tap via a `postMessage` bridge, no QR needed.

Detection is automatic through `useMiniApp()` — components render the right UI based on the context.

### 📈 Progression
- XP system with 10 levels (0 → 20 000 XP)
- Badges (visible and secret achievements)
- Shop for XP-based purchases
- Player profile with Circles avatar + stats
- Global leaderboard

### 🛠️ Infrastructure
- Upstash Redis-backed rate-limit on all write-heavy and admin routes
- Automated winner payouts via Gnosis Safe + Zodiac Roles Modifier (bounded permissions)
- Telegram support bot (grammy) routing messages to forum topics
- Sentry error tracking + Vercel Analytics

---

## Tech Stack

- **Framework** — Next.js 14 (App Router) + TypeScript
- **Database** — PostgreSQL via Drizzle ORM (51 tables, single source in `src/lib/db/schema/`)
- **Blockchain** — Circles Protocol on Gnosis Chain, ethers.js + viem
- **Auth on payouts** — Gnosis Safe + Zodiac Roles Modifier (role-gated CRC transfers)
- **Rate limit** — Upstash Redis (`@upstash/ratelimit`) with in-memory dev fallback
- **UI** — Tailwind CSS, Radix primitives (shadcn/ui)
- **i18n** — homegrown FR/EN via React Context

---

## Quickstart

```bash
git clone https://github.com/0xNF21/nf-society.git
cd nf-society
npm install
cp .env.example .env.local  # fill in the values
npm run db:migrate          # creates the 51 tables on a fresh Postgres
npm run dev                 # localhost:3000
```

See [`.env.example`](.env.example) for the full list of required variables.

---

## Commands

```bash
npm run dev          # Next.js dev server (port 3000)
npm run build        # production build
npm run start        # run the production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit

npm run db:generate  # generate a new migration from a schema change
npm run db:migrate   # apply pending migrations to DATABASE_URL
npm run db:push      # push schema directly (dev only)
npm run db:studio    # browse the DB with drizzle-kit studio
npm run db:check     # check consistency of migrations + snapshots
```

---

## Architecture (short)

```
src/
  app/
    api/         # 130+ API routes (games, wallet, admin, scan, payout)
    <games>/     # 17 game pages — one lobby + one game view each
    shop/        # XP shop
    chance/      # hub for chance games
    multijoueur/ # hub for multiplayer games
    admin/       # admin dashboard
    dashboard/   # player dashboard
  components/    # React components (44 top-level + shadcn/ui primitives)
  lib/
    db/schema/        # Drizzle schema, one file per domain
    circles.ts        # Circles RPC + payment link generation + tx detection
    payout.ts         # Gnosis Safe payouts via Zodiac Roles Modifier
    wallet.ts         # balance system (top-up, debit, credit, cashout)
    rate-limit.ts     # Upstash-backed rate limiter
    admin-auth.ts     # shared admin auth check
    validation.ts     # input validators (address regex, etc.)
    i18n.ts           # FR/EN translations
    miniapp-bridge.ts # Circles Mini App postMessage SDK
```

For deep contributor docs, see [`CLAUDE.md`](CLAUDE.md).

---

## License

Proprietary — NF Society DAO
