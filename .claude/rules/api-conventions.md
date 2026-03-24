---
paths:
  - "src/app/api/**/*.ts"
---

# API Route Conventions

- Toujours retourner `NextResponse.json({ ... })`
- Wrapper le body dans try/catch, retourner `{ error: message }` avec status 500 en cas d'erreur
- Valider les parametres d'entree (body, query params) avant de toucher la DB
- Ne jamais exposer les stack traces au client
- Utiliser le schema Drizzle de `src/lib/db/schema.ts` pour les queries
- Les routes de jeu (morpion, memory) utilisent `generateGamePaymentLink()` de `src/lib/circles.ts`
- Les routes de scan (morpion-scan, memory-scan) verifient les paiements on-chain
