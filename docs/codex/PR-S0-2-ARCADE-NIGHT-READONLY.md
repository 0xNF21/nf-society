# PR S0-2 - Arcade Night Read-Only

Status: draft brief
Branch: `codex/arcade-night-readonly`
Owner decision: founder

## 1. Scope

Ajouter une premiere surface produit read-only pour **NF Arcade Night #1**.

La page doit expliquer le format beta fermee, la dotation 5000 CRC, les deux
leaderboards separes Memory/Dames, les regles anti-farm et le statut "bientot".

## 2. Pourquoi

Apres S0-1, le repo a le schema foundation Season Zero. Avant de brancher des
routes DB/admin/claim, on veut une page claire qui permet de valider le produit:

- beta fermee avec quelques membres NF Society;
- event court de 90 minutes;
- Memory + Dames;
- pas de leaderboard global injuste;
- dotation DAO apres review.

## 3. Changements inclus

- `docs/season-zero/ARCADE-NIGHT-V1.md`
- `docs/codex/PR-S0-2-ARCADE-NIGHT-READONLY.md`
- nouvelle page `/arcade-night`
- composant read-only `ArcadeNightPage`
- lien d'entree discret depuis `/home`

## 4. Out of scope

Ne pas ajouter dans cette PR:

- route API leaderboard;
- ecriture DB;
- admin config;
- snapshot/finalisation;
- claim CRC;
- distribution payout;
- Telegram automation;
- matchmaking/bracket;
- Relics;
- Garage/Boost;
- Arcade room/pet.

## 5. Decisions produit encodees

- Nom: `NF Arcade Night #1`
- Audience: beta fermee NF Society
- Duree: 90 minutes
- Jeux: Memory + Dames
- Classements: separes par jeu
- Pool: 5000 CRC
- Rewards:
  - Memory #1: 1500 CRC
  - Memory #2: 750 CRC
  - Dames #1: 1500 CRC
  - Dames #2: 750 CRC
  - Beta helper: 500 CRC
- Anti-concentration: un wallet ne prend qu'une reward competitive par defaut.

## 6. Questions Codex

1. La page reste-t-elle strictement read-only ?
2. Le wording evite-t-il l'ambiguite jeu d'argent / mise ?
3. Le choix de deux leaderboards separes est-il clair ?
4. Le lien depuis `/home` est-il discret et non bloquant ?
5. Y a-t-il une regression visuelle mobile evidente ?

## 7. Test plan

- `npm run typecheck`
- Ouvrir `/arcade-night`
- Verifier mobile/desktop
- Verifier `/home` lien d'entree

## 8. Prochaine PR prevue

PR S0-3: brancher la lecture DB/leaderboards quand on decide le minimum admin
necessaire pour creer l'event et rattacher les parties.
