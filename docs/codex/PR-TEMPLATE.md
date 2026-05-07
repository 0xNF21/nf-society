# PR <N> — <Nom court>

> Brief Codex. Lis `CODEX-PROJECT-CONTEXT.md` à la racine d'abord pour le contexte projet général.

---

## Header

- **Branche** : `<branche-claude>`
- **Base** : `master`
- **Status** : draft / in review / ready to merge
- **Fichiers touchés** : `<N modifiés / M nouveaux / +X / -Y lignes>`
- **Typecheck** : ✅ / ❌
- **Build** : ✅ / ❌ / non testé
- **Smoke local** : ✅ / ❌ / non testé

---

## 1. Scope (1-2 phrases)

<Ce que cette PR fait. Ce qu'elle ne fait pas. Pas de jargon.>

Exemple :
> Verrouille les rails de paiement pour empêcher tout drain CRC en mode F2P. Pas de migration DB, pas de produit, pas de wording.

---

## 2. Pourquoi cette PR (court)

<Pourquoi maintenant ? Quelle exposition est fermée ? Quel besoin produit ?>

Référence le contexte projet si besoin (`CODEX-PROJECT-CONTEXT.md` section X).

---

## 3. État avant cette PR

<Ce qui marche déjà. Ce qui est cassé / vulnérable. Quelles infra existent.>

### Findings de l'audit (si applicable)
- **Finding A** (gravité) — fichier:ligne — description
- **Finding B** ...

---

## 4. Changements

### Nouveau
- `chemin/fichier.ts` — rôle

### Modifié
- `chemin/fichier.ts` — quoi a changé, pourquoi
- ...

### Matrice de comportement avant/après
| Cas | Avant | Après |
|---|---|---|
| ... | ... | ... |

---

## 5. Out of scope (sacré)

❌ Ne propose **pas** :
- <X — pourquoi reporté à PR Y>
- <Y — pourquoi pas dans cette PR>

L'objectif est de garder cette PR <défensive / additive / focalisée>.

---

## 6. Questions Codex

Sur quoi je veux spécifiquement ton avis :

### Cohérence
1. <question précise sur logic / routing / état>
2. ...

### Sécurité
3. <question sur les rails / permissions / leaks>
4. ...

### Régression
5. <question sur les flux existants qui ne doivent pas casser>
6. ...

### Naming & conventions
7. <question sur nom / pattern / cohérence>

---

## 7. Commit structure prévue

```bash
# Commit 1 — <thème>
git add <files>
git commit -m "<scope>: <description>"

# Commit 2 — ...
```

---

## 8. Suivi post-merge

- [ ] Toggle `<flag>` en prod
- [ ] Smoke `<flow>` en local + prod
- [ ] Communiquer aux users si user-facing
- [ ] Lancer PR <N+1> qui dépend de celle-ci
