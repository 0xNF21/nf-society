---
paths:
  - "src/components/demo-provider.tsx"
  - "src/components/demo-banner.tsx"
  - "src/components/daily-modal.tsx"
  - "src/components/profile-modal.tsx"
  - "src/app/shop/**/*.tsx"
---

# Demo Mode Rules

## Principe

Le mode demo simule une session utilisateur complete sans blockchain ni DB.
Tout est client-side, persiste dans localStorage.

## Context API (`useDemo()`)

- `isDemo` : boolean — mode demo actif
- `demoPlayer` : objet avec address, name, xp, xpSpent, level, streak
- `enterDemo()` / `exitDemo()` : activer/desactiver
- `addXp(action)` : ajouter XP selon `XP_REWARDS[action]`, recalcule le level
- `spendXp(amount)` : depenser XP (shop), retourne false si insuffisant
- `addStreak()` : incrementer le streak, bonus 50 XP tous les 7 jours

## Regles strictes

- JAMAIS d'appel fetch/API quand `isDemo === true`
- Toujours utiliser les fonctions du contexte (addXp, spendXp), pas de mutation directe
- Le profil demo se met a jour reactively via `demoPlayer` du contexte
- localStorage keys : `nf-demo` (boolean), `nf-demo-progress` (xp, level, streak)
