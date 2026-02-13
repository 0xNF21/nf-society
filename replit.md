# Circles Gnosis Starter Kit

## Overview
A Next.js boilerplate that generates Gnosis payment links, tracks them on the Circles RPC, and provides a standalone interface for building Circles-powered apps compatible with Gnosis App.

## Tech Stack
- **Framework**: Next.js 14.2.0
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI, shadcn/ui patterns
- **Blockchain**: viem (Circles RPC integration)

## Project Structure
```
src/
  app/              - Next.js app router pages
    behind-the-scenes/ - Behind the scenes page
    globals.css     - Global styles
    layout.tsx      - Root layout
    page.tsx        - Main page
  components/       - React components
    payment-status.tsx - Payment status component
    ui/             - Reusable UI components
  hooks/            - Custom React hooks
    use-payment-watcher.ts - Payment monitoring hook
  lib/              - Utility libraries
    bytea.ts        - Byte array utilities
    circles.ts      - Circles protocol integration
    hash.ts         - Hashing utilities
    utils.ts        - General utilities
  types/            - TypeScript type definitions
public/             - Static assets
```

## Environment Variables
- `NEXT_PUBLIC_DEFAULT_RECIPIENT_ADDRESS` - Default recipient address for payments
- `NEXT_PUBLIC_CIRCLES_RPC_URL` - Circles RPC endpoint (default: https://rpc.aboutcircles.com/)

## Development
- Dev server runs on port 5000 (0.0.0.0)
- `npm run dev` to start development
- `npm run build` to build for production
- `npm run start` to start production server

## Deployment
- Configured for autoscale deployment on Replit
- Build: `npm run build`
- Start: `npm run start` on port 5000
