# NF Society

[Lire en français](README.fr.md)

Community-run free-to-play arcade by the **NF Society DAO**, built on
**Gnosis Chain** with the **Circles** protocol (CRC tokens).

NF Society now uses **Fragments** as its playable arcade balance. Players can
join games, progress, earn XP, unlock badges, and receive selected **CRC
rewards** without staking or depositing CRC to play.

---

## Current Product Direction

### Free-to-Play First

- No paid entry to start the default games.
- No CRC stake, no player-funded CRC pot, no game-end CRC payout from a wager.
- Games are entered with **Fragments**, an off-chain arcade balance.
- Fragments are not withdrawable and are not convertible to CRC.
- CRC is reserved for rewards configured by the platform or DAO, legacy refunds,
  and legacy cashouts.

### Fragments

Fragments are the main game rail:

- players earn Fragments through platform rewards such as daily drops;
- multiplayer and arcade games debit Fragments when a player joins;
- game wins credit Fragments back to the player;
- house edge / commissions are tracked in a DAO Fragments pool;
- historical `betCrc` fields may still exist in tables as a reference unit, but
  the F2P rail converts that reference amount to Fragments.

The current conversion helper is:

```ts
1 CRC-reference = 10 Fragments
```

### CRC Rewards

CRC still matters, but no longer as the normal stake for games.

- CRC rewards can come from DAO/community allocations, skill seasons, bounties,
  or configured reward campaigns.
- Season-style rewards should be claimable only after snapshot and review, not
  paid instantly at the end of a game.
- Legacy users who had a CRC balance before the pivot can still withdraw it from
  their dashboard.

---

## Features

### Games (17)

**Multiplayer / skill (6)** - free matches using Fragments:

- Morpion (tic-tac-toe)
- Memory
- Dames (checkers)
- Relics (battleship-style strategy)
- Pierre-Feuille-Ciseaux (rock-paper-scissors)
- Fragment Races

**Arcade chance games (11)** - solo arcade modes using Fragments:

- Blackjack
- Coin Flip
- Crash Dash
- Dice
- Hi-Lo
- Keno
- Mines
- Plinko
- Roulette
- Lotteries
- Lootboxes

**Daily rewards** - daily reward flow focused on Fragments, XP progression, and
configured reward drops.

### Progression

- XP system with 10 levels.
- Badges and achievements, including hidden badges.
- Fragments shop for arcade purchases and cosmetics.
- Player profile with Circles avatar and stats.
- Global leaderboard and platform stats.

### DAO / Rewards

- DAO treasury and stats dashboard.
- CRC reward rail for DAO rewards and admin-approved distributions.
- Season Zero design target: short skill season, free participation, fixed DAO
  CRC pool, snapshot, anti-cheat review, then claimable rewards.

### UI Modes

**Standalone** - open `nf-society.vercel.app` in any browser.

**Circles Mini App** - the project can run as a native iframe inside the
Circles / Gnosis wallet app. The app still uses Circles identity and wallet
context where useful, especially for profiles, rewards, and legacy cashout.

Detection is automatic through `useMiniApp()`, so components render the right UI
based on context.

### Safety / Infrastructure

- `LEGAL_MODE=F2P_ONLY` is the default runtime posture.
- Real-stakes CRC routes are gated and require explicit configuration.
- Source-aware payout routing prevents a Fragments-funded game from accidentally
  paying CRC.
- Upstash Redis-backed rate-limit on write-heavy and admin routes.
- Automated CRC payouts through Gnosis Safe + Zodiac Roles Modifier for
  approved reward, refund, and legacy cashout flows.
- Telegram support bot (grammy) routing messages to forum topics.
- Sentry error tracking + Vercel Analytics.

---

## Tech Stack

- **Framework** - Next.js 14 (App Router) + TypeScript.
- **Database** - PostgreSQL via Drizzle ORM.
- **Blockchain** - Circles Protocol on Gnosis Chain, ethers.js + viem.
- **Rewards / payouts** - Gnosis Safe + Zodiac Roles Modifier for approved CRC
  transfers.
- **Arcade balance** - Fragments rail in `src/lib/wallet-fragments.ts`.
- **F2P guards** - `src/lib/legal-mode.ts`, `src/lib/stakes.ts`, and
  source-aware payout routing in `src/lib/payout.ts`.
- **Rate limit** - Upstash Redis (`@upstash/ratelimit`) with in-memory dev
  fallback.
- **UI** - Tailwind CSS, Radix primitives (shadcn/ui).
- **i18n** - homegrown FR/EN via React Context.

---

## Quickstart

```bash
git clone https://github.com/0xNF21/nf-society.git
cd nf-society
npm install
cp .env.example .env.local  # fill in the values
npm run db:migrate          # creates the tables on a fresh Postgres
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

## Architecture (Short)

```text
src/
  app/
    api/         # API routes: games, Fragments, wallet, admin, scan, payout
    <games>/     # 17 game pages: one lobby + one game view each
    shop/        # Fragments shop
    chance/      # arcade chance hub
    multijoueur/ # multiplayer hub
    admin/       # admin dashboard
    dashboard/   # player dashboard and legacy cashout
  components/    # React components + shadcn/ui primitives
  lib/
    db/schema/             # Drizzle schema, one file per domain
    fragments.ts           # Fragments conversion helpers
    wallet-fragments.ts    # F2P game rail
    payout.ts              # source-aware payouts
    legal-mode.ts          # env-level F2P guard
    stakes.ts              # game-level stake guards
    wallet.ts              # legacy CRC balance/cashout helpers
    circles.ts             # Circles RPC + payment helpers
    rate-limit.ts          # Upstash-backed rate limiter
    miniapp-bridge.ts      # Circles Mini App postMessage SDK
```

For deep contributor docs, see [`CODEX-PROJECT-CONTEXT.md`](CODEX-PROJECT-CONTEXT.md)
and [`CLAUDE.md`](CLAUDE.md).

---

## License

Proprietary - NF Society DAO
