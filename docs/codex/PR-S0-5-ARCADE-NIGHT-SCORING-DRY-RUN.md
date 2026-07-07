# PR S0-5 - Arcade Night scoring dry-run

> Brief Codex. Lis `CODEX-PROJECT-CONTEXT.md` puis `docs/season-zero/ARCADE-NIGHT-RULES-FINAL.md` avant review.

---

## Header

- **Branche** : `codex/arcade-night-scoring-dry-run`
- **Base** : `master`
- **Status** : draft
- **Typecheck** : a remplir
- **Build** : non teste
- **Smoke local** : a remplir

---

## 1. Scope

Ajoute un scoring dry-run admin pour NF Arcade Night #1. Le founder peut calculer les leaderboards provisoires Memory/Dames et sauvegarder un snapshot d'audit, sans payout, sans claim et sans finalisation reward.

---

## 2. Pourquoi

On a maintenant la page publique et le panel config. La prochaine brique utile est de verifier si les matchs beta produisent un classement defendable avant d'ajouter des rewards claimables.

Cette PR reste volontairement prudente : elle calcule et snapshot, mais ne distribue rien.

---

## 3. Decision d'implementation importante

Le doc final permet deux interpretations pour les parties qui finissent apres la fenetre.

Cette PR choisit la regle conservative :

> Une partie compte seulement si `createdAt` ET `updatedAt` sont dans la fenetre event.

Pourquoi :

- `createdAt` existe mais ne prouve pas toujours que les deux joueurs etaient deja entres.
- `updatedAt` est le meilleur signal disponible de fin.
- Pour la beta #1, mieux vaut exclure un match limite que compter un match litigieux.

On pourra assouplir plus tard avec une vraie colonne `startedAt` si besoin.

---

## 4. Changements

### Nouveau

- `src/lib/arcade-night-scoring.ts` - moteur de scoring dry-run.
- `src/app/api/admin/arcade-night/scoring/route.ts` - GET calcule, POST calcule + sauvegarde snapshot.
- `docs/codex/PR-S0-5-ARCADE-NIGHT-SCORING-DRY-RUN.md` - brief de review.

### Modifie

- `src/app/admin/tabs/arcade-night-tab.tsx` - ajoute le panneau scoring dry-run.
- `src/lib/arcade-night.ts` - preserve `lastScoringSnapshot` quand la config est sauvegardee.

---

## 5. Comportement

| Action | Resultat |
|---|---|
| Admin clique `Calculer` | Retourne leaderboards Memory/Dames en memoire |
| Admin clique `Sauver snapshot` | Sauvegarde le snapshot dans `seasons.config.arcadeNight.lastScoringSnapshot` |
| Tables absentes | Erreur propre / status unavailable |
| Date non configuree | Status `missing_window`, aucun score |
| Payout/claim | Aucun |

---

## 6. Regles codees

- Memory et Dames separes.
- Points : win 10, draw 5, loss 2.
- Caps per player/per game :
  - Memory : 6 matchs max, 3 contre meme wallet, min 3 matchs, min 2 adversaires.
  - Dames : 3 matchs max, 2 contre meme wallet, min 2 matchs, min 2 adversaires.
- Les caps sont appliques chronologiquement par `updatedAt`.
- Tie-breakers :
  1. points
  2. adversaires uniques
  3. wins
  4. win rate
  5. matchs comptes
  6. date d'atteinte du score
- Projection reward avec anti-concentration : un wallet ne prend qu'une reward competitive.
- Si un wallet est eligible a deux rewards competitives de meme montant, le dry-run doit afficher un warning pour decision founder.
- Le compteur "eligible" du resume compte les wallets uniques, pas les lignes Memory + Dames additionnees.
- Reward beta helper reste `manual`.

---

## 7. Out of scope

Ne propose pas :

- Payout CRC.
- Claim CRC.
- Creation de `season_reward_allocations`.
- Public live leaderboard.
- Nouvelle migration DB.
- Changement des routes Memory/Dames.
- Global leaderboard.

---

## 8. Questions Codex

1. La regle conservative `createdAt + updatedAt within window` est-elle la bonne pour beta #1 ?
2. Les caps chronologiques sont-ils preferables au "best-of" pour eviter le cherry-picking ?
3. Le stockage du snapshot dans `seasons.config.arcadeNight.lastScoringSnapshot` est-il acceptable sans nouvelle migration ?
4. Le reward projection anti-concentration est-il assez clair pour une review manuelle ?
5. Le panneau admin expose-t-il suffisamment d'informations pour debug les scores ?
6. Y a-t-il un risque de confusion entre dry-run snapshot et finalisation reward ?

---

## 9. Suivi post-merge

- [ ] Configurer date/heure en prod.
- [ ] Jouer quelques matchs test Memory/Dames.
- [ ] Calculer dry-run depuis `/admin`.
- [ ] Comparer manuellement avec les matchs DB.
- [ ] Si fiable : prochaine PR `finalize rewards / allocations`, toujours sans payout instantane.
