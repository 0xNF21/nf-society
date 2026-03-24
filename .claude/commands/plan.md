---
description: Cree un plan d'implementation detaille pour une feature
argument-hint: [description de la feature]
---

Utilise l'agent planner pour creer un plan d'implementation complet pour : **$ARGUMENTS**

Le plan doit inclure :
1. Resume de la feature
2. Fichiers a creer/modifier (chemins exacts)
3. Phases d'implementation (chaque phase livrable independamment)
4. Dependances entre les etapes
5. Risques et mitigations
6. Criteres de succes

Contexte NF Society :
- Chaque feature a deux modes : demo (client-side) et normal (API + blockchain)
- i18n obligatoire (FR + EN) dans src/lib/i18n.ts
- Repo principal : C:\Projects\NF-SOCIETY
- Pattern jeux : lobby page + [slug] page avec DemoGame + RealGame
