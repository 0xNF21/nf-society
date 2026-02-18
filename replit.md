# NF Society — Multi-Lottery Platform

## Overview
A Next.js multi-lottery platform for NF Society (DAO). Organizers create customizable lotteries with unique slugs, colors, logos, ticket prices, and recipient addresses. Users purchase tickets via Circles CRC payments. The system detects payments using CrcV2_StreamCompleted events, tracks participants per lottery in PostgreSQL, displays real-time ticket count with Circles profile names/avatars, and includes password-protected admin for verifiable random winner selection using Gnosis blockchain block hashes.

## Tech Stack
- **Framework**: Next.js 14.2.0
- **Language**: TypeScript
- **Styling**: Tailwind CSS with dynamic CSS custom properties per lottery
- **UI Components**: Radix UI, shadcn/ui patterns
- **Blockchain**: Circles RPC + Gnosis Chain RPC
- **Database**: PostgreSQL (Drizzle ORM)

## Project Structure
```
src/
  app/
    api/
      admin/route.ts           - Admin password verification
      draw/route.ts            - Verifiable draw (lottery-aware)
      draw/history/route.ts    - Draw history (lottery-aware)
      lotteries/route.ts       - CRUD: list/create lotteries
      lotteries/[id]/route.ts  - CRUD: get/update single lottery
      participants/route.ts    - Participants list (lottery-aware)
      profiles/route.ts        - Circles profile fetching
      scan/route.ts            - Blockchain payment scanner (lottery-aware)
    dashboard/page.tsx         - Organizer dashboard for creating lotteries
    dashboard-dao/page.tsx     - DAO dashboard (placeholder, under construction)
    loterie/[slug]/page.tsx    - Dynamic lottery page (server component)
    loteries/page.tsx          - Lottery listing page (active/completed/archived)
    globals.css                - Global styles
    layout.tsx                 - Root layout
    page.tsx                   - Landing page (hub: Loteries + Dashboard DAO)
  components/
    lottery-page.tsx           - Reusable lottery page component (client)
    payment-status.tsx         - Ticket history with skeleton loading
    language-provider.tsx      - i18n context, useLocale hook, LanguageSwitcher
    ui/                        - Reusable UI components
  lib/
    db/
      index.ts                 - Database connection
      schema.ts                - DB schema (lotteries + participants + draws)
    circles.ts                 - Circles protocol integration
    i18n.ts                    - Translation strings (FR/EN) organized by page
    bytea.ts / hash.ts / utils.ts - Utilities
public/                        - Static assets (logo, etc.)
```

## Database Tables
- **lotteries**: id, slug (unique), title, organizer, description, ticket_price_crc, recipient_address, primary_color, accent_color, logo_url, theme, commission_percent, status, created_at
- **participants**: id, lottery_id (FK), address, transaction_hash, paid_at, created_at (unique constraint: lottery_id + address)
- **draws**: id, lottery_id (FK), winner_address, block_number, block_hash, participant_count, participant_addresses, selection_index, drawn_at

## Environment Variables
- `ADMIN_PASSWORD` (secret) - Password for admin zone access, draw authorization, and lottery creation
- `DATABASE_URL` - PostgreSQL connection string
- `NEXT_PUBLIC_CIRCLES_RPC_URL` - Circles RPC endpoint (default: https://rpc.aboutcircles.com/)

## Key Routes
- `/` - Landing page (hub with links to Loteries + Dashboard DAO)
- `/loteries` - Lottery listing page (active/completed/archived)
- `/loterie/:slug` - Individual lottery page with custom theming
- `/dashboard` - Admin dashboard for creating new lotteries
- `/dashboard-dao` - DAO dashboard (under construction)
- `/api/lotteries` - GET (list), POST (create with password)
- `/api/lotteries/:slug` - GET (single), PUT (update with password)
- `/api/scan?lotteryId=X` - Scan blockchain for payments
- `/api/participants?lotteryId=X` - List participants
- `/api/draw?lotteryId=X` - GET latest draw, POST execute draw
- `/api/draw/history?lotteryId=X` - Draw history

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
- **Organizer Dashboard**: Form-based lottery creation with live preview
- **Bilingual (FR/EN)**: Full i18n with flag switcher, localStorage persistence

## Development
- Dev server runs on port 5000 (0.0.0.0)
- `npm run dev` to start development
- `npm run build` to build for production

## Deployment
- Configured for autoscale deployment on Replit
- Build: `npm run build`
- Start: `npm run start` on port 5000
