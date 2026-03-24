---
description: Synchronise les fichiers du worktree vers le repo principal
---

## Fichiers modifies dans le worktree

!`cd C:/Projects/NF-SOCIETY/.claude/worktrees/cool-swartz && git diff --name-only`

## Fichiers non-trackes dans le worktree

!`cd C:/Projects/NF-SOCIETY/.claude/worktrees/cool-swartz && git status --short | grep "^??" | awk '{print $2}'`

Pour chaque fichier liste ci-dessus :
1. Copie-le de `C:/Projects/NF-SOCIETY/.claude/worktrees/cool-swartz/` vers `C:/Projects/NF-SOCIETY/`
2. Confirme chaque copie
3. A la fin, affiche un resume de tout ce qui a ete synchronise
