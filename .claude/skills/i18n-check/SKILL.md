---
name: i18n-check
description: Verifie que toutes les cles i18n utilisees dans les composants existent dans translations. Use PROACTIVELY when editing components or pages that use translations.
allowed-tools: Read, Grep, Glob
---

Quand un composant ou une page est modifie :

1. Trouver toutes les references `t.xxx[locale]` ou `t.xxx` dans le fichier modifie
2. Identifier quelle section de `translations` est utilisee (ex: `const t = translations.morpion`)
3. Verifier dans `src/lib/i18n.ts` que chaque cle existe dans cette section
4. Verifier que chaque cle a les deux langues : `fr` et `en`
5. Si une cle manque, la signaler immediatement avec une suggestion de traduction

Ne pas laisser passer un `t.xxx[locale]` qui n'existe pas — c'est la cause #1 de crash en production.
