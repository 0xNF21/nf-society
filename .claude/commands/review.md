---
description: Review le code modifie avant un commit
---

## Changements a reviewer

!`cd C:/Projects/NF-SOCIETY && git diff --name-only`

## Diff detaille

!`cd C:/Projects/NF-SOCIETY && git diff`

Review chaque fichier modifie pour :
1. **Bugs** : logique incorrecte, conditions manquantes, erreurs de type
2. **i18n** : strings en dur dans le JSX au lieu de `translations`
3. **Mode demo** : appels API sans verifier `isDemo`, XP non attribue
4. **Securite** : injection, donnees sensibles exposees
5. **Mode normal** : QR code paiement et flux API toujours fonctionnels

Donne un feedback actionnable par fichier. Pas de commentaires vagues.
