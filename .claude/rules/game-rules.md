---
paths:
  - "src/app/morpion/**/*.tsx"
  - "src/app/memory/**/*.tsx"
---

# Game Pages Rules

## Deux modes obligatoires

Chaque page [slug] DOIT gerer deux modes :

1. **Mode demo** (`isDemo && slug.startsWith("DEMO")`) :
   - Composant `DemoXxxGame` — 100% client-side, aucun appel API
   - Morpion : joueur vs bot (bot: win > block > center > random)
   - Memory : solo card matching avec timer et compteur de coups
   - Appeler `addXp()` du contexte demo a la fin de la partie

2. **Mode normal** (`!isDemo` ou slug ne commence pas par "DEMO") :
   - Composant `RealXxxGame` — appels API, polling, scan paiements
   - Affiche QR code de paiement via `generateGamePaymentLink()`
   - Scan des paiements on-chain toutes les 5s
   - Input adresse pour identifier le joueur

## Lobby pages

- `createGame()` : si `isDemo` → navigate vers `/jeu/DEMO-XXXX`, sinon POST API
- `joinGame()` : toujours via slug (pas de mode demo pour rejoindre)
