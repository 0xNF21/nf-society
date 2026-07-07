# PR S0-3 - Arcade Night admin config

> Brief Codex. Lis `CODEX-PROJECT-CONTEXT.md` a la racine d'abord pour le contexte projet general.

---

## Header

- **Branche** : `codex/arcade-night-admin-config`
- **Base** : `master`
- **Status** : draft
- **Fichiers touches** : admin/API/public page/docs
- **Typecheck** : a remplir
- **Build** : non teste
- **Smoke local** : a remplir

---

## 1. Scope

Ajoute un panneau admin pour modifier la fiche publique `Arcade Night #1` : date/heure, duree, pool CRC, participants beta, jeux actifs et regles de caps. La page publique `/arcade-night` lit cette config dynamiquement.

Cette PR ne lance pas encore le leaderboard reel, ne calcule pas les scores et ne distribue aucune reward.

---

## 2. Pourquoi cette PR

Le founder doit pouvoir ajuster les informations de beta sans redemander un changement de code a chaque fois. C'est particulierement utile pour une soiree test : la date, la duree et le pool peuvent bouger jusqu'au dernier moment.

---

## 3. Etat avant cette PR

- `/arcade-night` existe en lecture seule avec des valeurs hardcodees : 90 min, 5000 CRC, Memory + Dames.
- Le schema Season existe dans le repo depuis S0-1, mais les migrations prod peuvent ne pas encore etre appliquees.
- Le panneau admin existe deja pour flags, payouts, XP, shop, daily, badges, reset.

---

## 4. Changements

### Nouveau

- `src/lib/arcade-night.ts` - helper central pour defaults, lecture, validation et sauvegarde de la config.
- `src/app/api/admin/arcade-night/route.ts` - route admin GET/POST protegee par le mot de passe admin.
- `src/app/admin/tabs/arcade-night-tab.tsx` - onglet admin pour editer la fiche event.
- `docs/codex/PR-S0-3-ARCADE-NIGHT-ADMIN-CONFIG.md` - brief de cette PR.

### Modifie

- `src/app/admin/page.tsx` / `types.ts` / `constants.ts` - ajoute l'onglet `Arcade Night`.
- `src/app/arcade-night/page.tsx` - charge la config cote serveur.
- `src/components/arcade-night-page.tsx` - affiche les donnees configurees.
- `src/app/globals.css` - ajoute une classe de champ admin reutilisable.

### Matrice avant/apres

| Cas | Avant | Apres |
|---|---|---|
| Changer la date | Changement de code requis | Editable dans `/admin` |
| Changer la duree | Changement de code requis | Editable dans `/admin` |
| Changer le pool | Changement de code requis | Editable dans `/admin`; split auto 30/15/30/15/10 |
| Tables Season absentes | Risque de crash si on lit la DB | Page publique fallback sur defaults |
| Sauvegarde sans tables Season | N/A | Erreur admin claire `season_tables_unavailable` |

---

## 5. Out of scope

Ne propose pas :

- Leaderboard reel Memory/Dames.
- Capture automatique des resultats de match.
- Distribution ou claim CRC.
- Enforcement automatique de la liste beta.
- Migration DB nouvelle : cette PR reutilise les tables S0-1.
- Telegram/Discord bot.

---

## 6. Questions Codex

1. Le fallback public quand les tables Season sont absentes est-il assez defensif ?
2. Le POST admin devrait-il etre bloque si `status=active` et `startAt=null`, ou peut-on laisser le founder ajuster librement ?
3. Le split rewards automatique 30/15/30/15/10 est-il plus sur que des montants editables pour cette beta ?
4. L'onglet admin expose-t-il trop d'informations sur les participants beta cote public ?
5. Les writes `seasons` + `season_games` + audit log devraient-ils etre dans une transaction ? (actuellement oui)
6. Y a-t-il une regression possible sur `/arcade-night` ou `/admin` si `DATABASE_URL` est absent en preview ?

---

## 7. Commit structure prevue

```bash
git add docs/codex/PR-S0-3-ARCADE-NIGHT-ADMIN-CONFIG.md
git commit -m "docs(codex): add S0-3 arcade night admin config brief"

git add src/lib/arcade-night.ts src/app/api/admin/arcade-night/route.ts
git commit -m "feat(season): add arcade night config API"

git add src/app/admin src/app/globals.css src/app/arcade-night src/components/arcade-night-page.tsx
git commit -m "feat(admin): make arcade night page configurable"
```

---

## 8. Suivi post-merge

- [ ] Appliquer les migrations S0-1 en prod avant de sauvegarder depuis le panel.
- [ ] Smoke `/arcade-night` sans config DB : la page doit charger avec defaults.
- [ ] Smoke `/admin` : onglet Arcade Night visible.
- [ ] Smoke POST admin apres migration Season : sauvegarde OK, page publique mise a jour.
- [ ] Lancer S0-4 : scoring/leaderboard beta si le design est valide.
