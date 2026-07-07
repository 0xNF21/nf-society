# PR S0-6 - Arcade Night live mode

> Brief Codex. Lis `CODEX-PROJECT-CONTEXT.md` a la racine d'abord pour le contexte projet general.

---

## Header

- **Branche** : `codex/arcade-night-live-mode`
- **Base** : `master`
- **Status** : draft
- **Typecheck** : a verifier
- **Build** : non teste
- **Smoke local** : a verifier

---

## 1. Scope

Ajoute une couche live sur la page publique `/arcade-night`: statut automatique, compte a rebours, temps restant, et CTA adaptes selon la fenetre configuree dans l'admin.

La PR ne change pas le scoring, ne cree pas de leaderboard public live, et ne cree aucun payout/claim.

---

## 2. Pourquoi

Le founder veut fixer une date/heure dans l'admin puis laisser l'event "se lancer" tout seul. Avant cette PR, la page etait surtout une vitrine statique: le dry-run admin pouvait calculer apres coup, mais les joueurs ne voyaient pas clairement si l'event etait avant, en cours ou en review.

---

## 3. Etat avant

- `/admin` permet de configurer date, duree, pool, participants et regles.
- `/admin` permet de calculer un scoring dry-run.
- `/arcade-night` affiche l'event, mais ne change pas selon l'heure actuelle.
- Le scoring compte deja uniquement les parties creees apres `startAt` et terminees avant `endAt`.

---

## 4. Changements

### Nouveau comportement

| Cas | Avant | Apres |
|---|---|---|
| Pas de date | Page statique | Statut "Date a fixer" |
| Avant la date | Page statique | Statut "Programme" + compte a rebours |
| Pendant la fenetre | Page statique | Statut "En cours maintenant" + temps restant + CTA "Jouer maintenant" |
| Apres la fenetre | Page statique | Statut "Review en cours" + message scores admin |
| Finalise | Page statique | Statut "Finalise" |

### Fichiers modifies

- `src/lib/arcade-night.ts` - expose `serverNow` dans l'etat public pour initialiser le compte a rebours sans mismatch client/serveur.
- `src/components/arcade-night-page.tsx` - calcule la phase live cote client et adapte l'UI.

---

## 5. Out of scope

Ne propose pas:

- Leaderboard public live.
- Tag explicite des parties Arcade Night.
- Creation de `season_reward_allocations`.
- Snapshot automatique en fin d'event.
- Payout ou claim CRC.
- Changement des routes Memory/Dames.

Le scoring reste source of truth: une partie compte seulement si elle est creee et terminee dans la fenetre.

---

## 6. Questions Codex

1. La phase time-based est-elle coherente avec le scoring strict `createdAt >= startAt` et `updatedAt <= endAt` ?
2. L'UI explique-t-elle assez clairement qu'une partie creee avant le depart ne compte pas ?
3. Le `serverNow` dans l'etat public evite-t-il correctement les soucis d'hydration ?
4. Faut-il garder les CTA actifs hors fenetre comme entrainement/hors classement ?
5. Y a-t-il un risque de confusion avec un vrai leaderboard live ?

---

## 7. Commit structure

```bash
git add docs/codex/PR-S0-6-ARCADE-NIGHT-LIVE-MODE.md src/lib/arcade-night.ts src/components/arcade-night-page.tsx
git commit -m "feat(season): add arcade night live window UI"
```

---

## 8. Suivi post-merge

- [ ] Configurer date/heure dans `/admin`.
- [ ] Ouvrir `/arcade-night` avant la fenetre: status programme.
- [ ] Ouvrir `/arcade-night` pendant la fenetre: status live.
- [ ] Jouer une partie Memory/Dames creee et terminee dans la fenetre.
- [ ] Lancer le scoring dry-run admin.
