# NF Society — Multi-Lottery Platform

## Overview
A Next.js multi-lottery platform for NF Society (DAO). Organizers create customizable lotteries with unique slugs, colors, logos, ticket prices, and recipient addresses. Users purchase tickets via Circles CRC payments. The system detects payments using CrcV2_StreamCompleted events, tracks participants per lottery in PostgreSQL, displays real-time ticket count with Circles profile names/avatars, and includes password-protected admin for verifiable random winner selection using Gnosis blockchain block hashes. Includes a generic automated payout system via Gnosis Safe + Zodiac Roles Modifier for paying winners of any game type (lottery, lootbox, rewards, etc.).

## Tech Stack
- **Framework**: Next.js 14.2.0
- **Language**: TypeScript
- **Styling**: Tailwind CSS with dynamic CSS custom properties per lottery
- **UI Components**: Radix UI, shadcn/ui patterns
- **Blockchain**: Circles RPC + Gnosis Chain RPC + ethers.js v6
- **Database**: PostgreSQL (Drizzle ORM)
- **Safe Integration**: Zodiac Roles Modifier for automated payouts via Gnosis Safe

## Project Structure
```
src/
  app/
    api/
      admin/route.ts           - Admin password verification
      draw/route.ts            - Verifiable draw (lottery-aware, auto-payout)
      draw/history/route.ts    - Draw history (lottery-aware)
      distributions/route.ts   - Peanut Protocol distributions (Arbitrum)
      lotteries/route.ts       - CRUD: list/create lotteries
      lotteries/[id]/route.ts  - CRUD: get/update single lottery
      participants/route.ts    - Participants list (lottery-aware)
      payout/route.ts          - Generic payout: POST trigger, GET list
      payout/retry/route.ts    - Retry failed payouts
      payout/status/route.ts   - Bot wallet & Safe balance status
      profiles/route.ts        - Circles profile fetching
      scan/route.ts            - Blockchain payment scanner (lottery-aware)
      treasury/route.ts        - Multi-chain treasury via Blockscout (Ethereum + Gnosis Chain, dynamic tokens, PNL, acquisition prices)
      treasury/history/route.ts - Historical performance (24h/7d/30d/1y/all)
      crc-price/route.ts       - CRC/USD price via CoW Swap
    dashboard/page.tsx         - Organizer dashboard (lottery creation + payout management)
    dashboard-dao/page.tsx     - DAO dashboard (members, trust network, contributions, inactive tracking)
    loterie/[slug]/page.tsx    - Dynamic lottery page (server component)
    loteries/page.tsx          - Lottery listing page (active/completed/archived)
    globals.css                - Global styles
    layout.tsx                 - Root layout
    page.tsx                   - Landing page (hub: Loteries + Dashboard DAO)
  components/
    lottery-page.tsx           - Reusable lottery page component (client)
    exchange-section.tsx       - CRC exchange component (QR code + link to mint handler)
    payment-status.tsx         - Ticket history with skeleton loading
    language-provider.tsx      - i18n context, useLocale hook, LanguageSwitcher
    ui/                        - Reusable UI components
  lib/
    db/
      index.ts                 - Database connection
      schema.ts                - DB schema (lotteries + participants + draws + payouts)
    circles.ts                 - Circles protocol integration
    payout.ts                  - Generic payout engine (Safe + Zodiac Roles Modifier)
    i18n.ts                    - Translation strings (FR/EN) organized by page
    bytea.ts / hash.ts / utils.ts - Utilities
public/                        - Static assets (logo, etc.)
```

## Database Tables
- **lotteries**: id, slug (unique), title, organizer, description, ticket_price_crc, recipient_address, primary_color, accent_color, logo_url, theme, commission_percent, status, created_at
- **participants**: id, lottery_id (FK), address, transaction_hash, paid_at, created_at (unique constraint: lottery_id + address)
- **draws**: id, lottery_id (FK), winner_address, block_number, block_hash, participant_count, participant_addresses, selection_index, drawn_at
- **payouts**: id, game_type, game_id (unique), recipient_address, amount_crc, reason, wrap_tx_hash, transfer_tx_hash, status (pending/wrapping/sending/success/failed), attempts, error_message, created_at, updated_at
- **exchanges**: id, sender_address, amount_crc (wei), amount_human, incoming_tx_hash (unique), outgoing_tx_hash, status (detected/sending/success/failed), error_message, created_at

## Environment Variables
- `ADMIN_PASSWORD` (secret) - Password for admin zone access, draw authorization, and lottery creation
- `DATABASE_URL` - PostgreSQL connection string
- `NEXT_PUBLIC_CIRCLES_RPC_URL` - Circles RPC endpoint (default: https://rpc.aboutcircles.com/)
- `BOT_PRIVATE_KEY` (secret) - Private key of the bot wallet (`0x11796C513331A5b9433C57B87c910bbF06815dDF`)
- `SAFE_ADDRESS` = `0x960A0784640fD6581D221A56df1c60b65b5ebB6f` - Gnosis Safe (NF Society Relayer)
- `ROLES_MODIFIER_ADDRESS` = `0xF4D577F5Fb6994bc20291733ADF9566BfEBaA3aa` - Zodiac Roles Modifier v2
- `ROLE_KEY` = `0x0000000000000000000000000000000000000000000000000000000000000001` - Role ID assigned to the bot
- `MAX_PAYOUT_CRC` = `1000` - Maximum payout per transaction

## Key Routes
- `/` - Landing page (hub with links to Loteries + Dashboard DAO)
- `/loteries` - Lottery listing page (active/completed/archived)
- `/loterie/:slug` - Individual lottery page with custom theming
- `/dashboard` - Admin dashboard (lottery creation + payout management)
- `/dashboard-dao` - DAO dashboard (members, trust network, contributions, inactive tracking)
- `/api/dao` - GET DAO data (members, trust relations, contributions from Circles SDK)
- `/api/treasury/history` - GET historical price performance (24h/7d/30d/1y/all) via DeFi Llama
- `/api/lotteries` - GET (list), POST (create with password)
- `/api/lotteries/:slug` - GET (single), PUT (update with password)
- `/api/scan?lotteryId=X` - Scan blockchain for payments
- `/api/participants?lotteryId=X` - List participants
- `/api/draw?lotteryId=X` - GET latest draw, POST execute draw (auto-payout if configured)
- `/api/draw/history?lotteryId=X` - Draw history
- `/api/payout` - GET list payouts, POST trigger generic payout
- `/api/payout/retry` - POST retry failed payout
- `/api/payout/status` - GET bot wallet & Safe balance info
- `/api/distributions` - GET Peanut Protocol distributions (Arbitrum)

## Key Features
- **Multi-Lottery**: Multiple independent lotteries with unique configs
- **White Label**: Each lottery has custom colors, logo, and theme (light/dark)
- **Dynamic Routes**: `/loterie/:slug` loads lottery-specific design
- **Payment Detection**: CrcV2_StreamCompleted events for accurate sender identification
- **Profile Integration**: Circles avatars + names via circles_getAvatarInfo + IPFS
- **Skeleton Loading**: No flash of raw addresses while profiles load
- **Admin Authentication**: Password-protected admin zone (server-side verification)
- **Verifiable Draw**: Uses Gnosis block hash as random seed, publicly displays proof
- **Draw History**: All draws logged in PostgreSQL with full proof data
- **Organizer Dashboard**: Form-based lottery creation with live preview + payout management
- **Bilingual (FR/EN)**: Full i18n with flag switcher, localStorage persistence
- **DAO Dashboard**: Live member list, trust network visualization, contribution rankings, inactive member tracking via Circles SDK (@aboutcircles/sdk-rpc)
- **Treasury Overview**: Multi-chain treasury (Ethereum `0x2f233f...` + Gnosis Chain `0xbf57dc...`) with pie chart, chain badges (ETH/GC), auto-detected via Blockscout API (spam filtered), icons from CoinGecko, prices from DeFi Llama
- **Portfolio PNL**: Acquisition prices extracted from on-chain DEX swap history (Balancer, 1inch, Curve), per-token and global unrealized P&L with percentage badges
- **CRC Price Tracking**: Live CRC/USD price via CoW Swap API, displayed in stat cards with USD equivalents
- **Automated Payout System**: Generic payout engine via Gnosis Safe + Zodiac Roles Modifier. Supports any game type (lottery, lootbox, game, reward). Auto-wraps CRC to ERC20 and transfers to recipients. Double-payout prevention via unique gameId. Retry logic (max 3 attempts). Full audit trail in PostgreSQL.
- **Payout Admin Dashboard**: Bot status, Safe balance, payout list with status badges, manual payout form, retry buttons, tx hash links to Gnosisscan, setup guide for Zodiac configuration
- **CRC Exchange**: QR code on landing page to exchange personal CRC → NF Society group CRC via the Circles protocol group mint handler (`0x1163c2192E26703d6b27E05D270226F481178dEF`). Fully on-chain, no bot needed — the protocol mints group CRC automatically when users send personal CRC to the handler.

## Payout System Architecture
- **Gnosis Safe**: `0x960A0784640fD6581D221A56df1c60b65b5ebB6f` (NF Society Relayer) — central treasury holding CRC tokens on Gnosis Chain
- **Zodiac Roles Modifier**: `0xF4D577F5Fb6994bc20291733ADF9566BfEBaA3aa` — installed as module on the Safe, restricts bot to only wrap() and transfer() on the NF CRC ERC20 wrapper contract
- **Bot Wallet**: `0x11796C513331A5b9433C57B87c910bbF06815dDF` — dedicated wallet with private key in Replit secrets, assigned role 1 in the Zodiac Roles Modifier
- **ERC20 Wrapper**: `0x734fb1c312dba2baa442e7d9ce55fd7a59c4e9ee` (NF Society CRC, demurrage)
- **Group Mint Handler**: `0x1163c2192E26703d6b27E05D270226F481178dEF` — Circles v2 handler for minting NF Society group CRC from personal CRC
- **Flow**: Draw winner → wrap CRC ERC-1155 → ERC-20 via Roles Modifier → transfer ERC-20 to winner via Roles Modifier
- **Setup**: Safe owner deploys Roles Modifier via Zodiac Safe App → assigns role to bot via assignRoles() → allows ERC20 wrapper target via allowTarget() → sets default role via setDefaultRole()

## Development
- Dev server runs on port 5000 (0.0.0.0)
- `npm run dev` to start development
- `npm run build` to build for production

## Deployment
- Configured for autoscale deployment on Replit
- Build: `npm run build`
- Start: `npm run start` on port 5000
