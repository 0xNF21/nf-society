# NF Society Lottery Platform

## Overview
A Next.js lottery application for NF Society (DAO). Users purchase tickets for 5 CRC sent to a designated address. The system detects payments on the Circles blockchain using CrcV2_StreamCompleted events, tracks participants in PostgreSQL, displays real-time ticket count with Circles profile names/avatars, and includes a password-protected admin section for verifiable random winner selection using Gnosis blockchain block hashes.

## Tech Stack
- **Framework**: Next.js 14.2.0
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI, shadcn/ui patterns
- **Blockchain**: Circles RPC + Gnosis Chain RPC
- **Database**: PostgreSQL (Drizzle ORM)

## Project Structure
```
src/
  app/
    api/
      admin/route.ts    - Admin password verification
      draw/route.ts     - Verifiable draw with blockchain hash
      participants/route.ts - Get participants list
      profiles/route.ts - Circles profile fetching
      scan/route.ts     - Blockchain payment scanner
    globals.css         - Global styles
    layout.tsx          - Root layout
    page.tsx            - Main lottery page
  components/
    payment-status.tsx  - Ticket history with skeleton loading
    ui/                 - Reusable UI components
  lib/
    db/
      index.ts          - Database connection
      schema.ts         - DB schema (participants + draws tables)
    circles.ts          - Circles protocol integration
    bytea.ts / hash.ts / utils.ts - Utilities
public/                 - Static assets (logo, etc.)
```

## Database Tables
- **participants**: address, transaction_hash, paid_at, created_at
- **draws**: winner_address, block_number, block_hash, participant_count, participant_addresses, selection_index, drawn_at

## Environment Variables
- `ADMIN_PASSWORD` (secret) - Password for admin zone access and draw authorization
- `DATABASE_URL` - PostgreSQL connection string
- `NEXT_PUBLIC_DEFAULT_RECIPIENT_ADDRESS` - Recipient address (default: 0xbf57dc...)
- `NEXT_PUBLIC_CIRCLES_RPC_URL` - Circles RPC endpoint (default: https://rpc.aboutcircles.com/)

## Key Features
- **Payment Detection**: CrcV2_StreamCompleted events for accurate sender identification
- **Profile Integration**: Circles avatars + names via circles_getAvatarInfo + IPFS
- **Skeleton Loading**: No flash of raw addresses while profiles load
- **Admin Authentication**: Password-protected admin zone (server-side verification)
- **Verifiable Draw**: Uses Gnosis block hash as random seed, publicly displays proof
- **Draw History**: All draws logged in PostgreSQL with full proof data

## Development
- Dev server runs on port 5000 (0.0.0.0)
- `npm run dev` to start development
- `npm run build` to build for production

## Deployment
- Configured for autoscale deployment on Replit
- Build: `npm run build`
- Start: `npm run start` on port 5000
