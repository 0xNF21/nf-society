---
description: Verifie que le build de production passe sans erreur
---

## Pre-deploy checks

1. Lancer le build :
!`cd C:/Projects/NF-SOCIETY && npm run build`

2. Si le build echoue, analyser les erreurs et proposer des fixes.

3. Si le build reussit, verifier :
   - Pas de `console.log` oublies dans le code (sauf dans dev-only blocks)
   - Pas de fichiers `.env` ou secrets dans le git staged
   - Les traductions i18n sont completes (FR + EN pour chaque cle)

4. Afficher un resume : build OK/KO, warnings, fichiers a verifier.
